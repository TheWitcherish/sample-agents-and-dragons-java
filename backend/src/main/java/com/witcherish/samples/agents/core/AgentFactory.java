package com.witcherish.samples.agents.core;

import com.witcherish.samples.agents.api.dto.AgentDefinition;
import com.witcherish.samples.agents.api.dto.Project;
import com.witcherish.samples.agents.observer.EventCaptureAdvisor;
import com.witcherish.samples.agents.observer.EventLog;
import com.witcherish.samples.agents.telemetry.McpTelemetryPublisher.Session;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.client.advisor.ToolCallAdvisor;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.model.tool.ToolCallingChatOptions;
import org.springframework.ai.model.tool.ToolCallingManager;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Builds one ChatClient per AgentDefinition.
 *
 * Each agent gets its own fresh builder seeded from the autoconfigured ChatModel,
 * so per-agent system prompts, model overrides, tool sets, and advisors stay isolated.
 *
 * Two distinct tool-registration paths in Spring AI 1.1.x:
 *   - {@code defaultTools(Object...)} — accepts POJOs with {@code @Tool}-annotated
 *     methods (e.g. our {@link com.witcherish.samples.agents.tools.TaskTools}).
 *   - {@code defaultToolCallbacks(ToolCallback...)} — accepts ready-made
 *     {@link ToolCallback} instances (e.g. {@code FunctionToolCallback} the
 *     orchestrator pattern synthesises at runtime to wrap specialists as tools).
 *
 * The two cannot be mixed in a single call.
 *
 * <h2>Advisor-driven tool loop</h2>
 * Every agent gets a {@link ToolCallAdvisor} wired <em>outside</em> its
 * {@link EventCaptureAdvisor}. This pulls the tool-calling loop up into the advisor chain
 * (Spring AI disables the model's internal tool execution when this advisor is present), so
 * {@code EventCaptureAdvisor} is re-entered once per cycle and can stream every model turn
 * to the Adventure Log — not just the collapsed final {@code .content()}. The advisor owns
 * {@code returnDirect} termination, so {@code writeResult} and swarm {@code handoff_to_agent}
 * still end a turn exactly as before. Its presence is also why the agent's options MUST be
 * {@link ToolCallingChatOptions} rather than a plain {@code ChatOptions}.
 */
@Component
public class AgentFactory {

    private final ChatModel chatModel;
    private final EventLog eventLog;
    private final ToolCallingManager toolCallingManager;

    public AgentFactory(ChatModel chatModel, EventLog eventLog, ToolCallingManager toolCallingManager) {
        this.chatModel = chatModel;
        this.eventLog = eventLog;
        this.toolCallingManager = toolCallingManager;
    }

    /**
     * Pairs a built {@link ChatClient} with its {@link EventCaptureAdvisor}. The advisor
     * exposes per-agent token usage and cycle count after each model round-trip, which
     * the patterns publish to AppSync via {@code save_agent_state} so the UI agent
     * cards display real numbers instead of zeros.
     */
    public record BuiltAgent(ChatClient client, EventCaptureAdvisor advisor) {}

    /** Build one ChatClient per AgentDefinition, keyed by agent.id (preserves team order). */
    public Map<String, BuiltAgent> buildTeam(List<AgentDefinition> definitions, Project project,
                                             Session telemetry, List<Object> sharedTools) {
        Map<String, BuiltAgent> team = new LinkedHashMap<>();
        for (AgentDefinition def : definitions) {
            team.put(def.id(), buildOne(def, project, telemetry, sharedTools, List.of()));
        }
        return team;
    }

    /**
     * Build a single agent (ChatClient + its advisor) with @Tool-annotated POJOs as
     * its tool surface. Convenience for {@code buildOne(def, project, telemetry, sharedTools, List.of())}.
     */
    public BuiltAgent buildOne(AgentDefinition def, Project project, Session telemetry, List<Object> sharedTools) {
        return buildOne(def, project, telemetry, sharedTools, List.of());
    }

    /**
     * Build a single agent (ChatClient + its advisor) with both @Tool-annotated POJOs
     * and runtime-synthesised {@link ToolCallback}s (used by the orchestrator + swarm
     * patterns).
     */
    public BuiltAgent buildOne(AgentDefinition def, Project project, Session telemetry,
                               List<Object> sharedTools, List<ToolCallback> extraToolCallbacks) {
        EventCaptureAdvisor advisor =
                new EventCaptureAdvisor(eventLog, telemetry, project.id(), def.id(), def.name());
        // ToolCallAdvisor moves the tool-calling loop into the advisor chain so EventCaptureAdvisor
        // observes every cycle. Its default order (~HIGHEST_PRECEDENCE) keeps it OUTSIDE our
        // order-0 advisor, which is exactly what we want: the chain re-runs only advisors after
        // ToolCallAdvisor on each iteration. Reuse the autoconfigured ToolCallingManager so tool
        // execution keeps the framework's observation + exception-handling wiring.
        ToolCallAdvisor toolCallAdvisor = ToolCallAdvisor.builder()
                .toolCallingManager(toolCallingManager)
                .build();
        ChatClient.Builder builder = ChatClient.builder(chatModel)
                .defaultSystem(def.prompt())
                // ToolCallingChatOptions (not plain ChatOptions) is REQUIRED by ToolCallAdvisor,
                // which throws if the request options aren't tool-calling-aware.
                .defaultOptions(ToolCallingChatOptions.builder()
                        .model(BedrockModels.resolve(def.model()))
                        .temperature(0.3)
                        // Tool-heavy multi-turn chains (orchestrator, swarm) blow past the
                        // ~4096-token default. 8192 leaves headroom for a full HTML deliverable.
                        .maxTokens(8192)
                        .build())
                .defaultAdvisors(advisor, toolCallAdvisor);

        if (!sharedTools.isEmpty()) {
            builder = builder.defaultTools(sharedTools.toArray());
        }
        if (!extraToolCallbacks.isEmpty()) {
            builder = builder.defaultToolCallbacks(extraToolCallbacks.toArray(new ToolCallback[0]));
        }
        return new BuiltAgent(builder.build(), advisor);
    }
}
