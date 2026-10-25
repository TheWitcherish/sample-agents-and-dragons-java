package com.witcherish.samples.agents.core;

import com.witcherish.samples.agents.api.dto.AgentDefinition;
import com.witcherish.samples.agents.api.dto.Project;
import com.witcherish.samples.agents.observer.EventCaptureAdvisor;
import com.witcherish.samples.agents.observer.EventLog;
import com.witcherish.samples.agents.telemetry.McpTelemetryPublisher.Session;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.client.advisor.ToolCallingAdvisor;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.model.tool.ToolCallingChatOptions;
import org.springframework.ai.model.tool.ToolCallingManager;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Builds one ChatClient per AgentDefinition.
 *
 * Each agent gets its own fresh builder seeded from the autoconfigured ChatModel,
 * so per-agent system prompts, model overrides, tool sets, and advisors stay isolated.
 *
 * Spring AI 2.0 registers every tool through one call, {@code defaultTools(Object...)}: it
 * accepts both POJOs with {@code @Tool}-annotated methods (e.g. our
 * {@link com.witcherish.samples.agents.tools.TaskTools}) and ready-made {@link ToolCallback}
 * instances (e.g. the {@code writeResult} and swarm {@code handoff_to_agent} callbacks).
 *
 * <h2>Advisor-driven tool loop</h2>
 * Every agent gets a {@link ToolCallingAdvisor} wired <em>outside</em> its
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
        // ToolCallingAdvisor moves the tool-calling loop into the advisor chain so EventCaptureAdvisor
        // observes every cycle. Its default order (HIGHEST_PRECEDENCE + 300) keeps it OUTSIDE our
        // order-0 advisor, which is exactly what we want: the chain re-runs only advisors after
        // ToolCallingAdvisor on each iteration. Reuse the autoconfigured ToolCallingManager so tool
        // execution keeps the framework's observation + exception-handling wiring.
        ToolCallingAdvisor toolCallAdvisor = ToolCallingAdvisor.builder()
                .toolCallingManager(toolCallingManager)
                .build();
        ChatClient.Builder builder = ChatClient.builder(chatModel)
                .defaultSystem(def.prompt())
                // ToolCallingChatOptions (not plain ChatOptions) is REQUIRED by ToolCallingAdvisor,
                // which throws if the request options aren't tool-calling-aware. Spring AI 2.x
                // takes the options BUILDER here, not a built ChatOptions.
                .defaultOptions(ToolCallingChatOptions.builder()
                        .model(BedrockModels.resolve(def.model()))
                        // No temperature: Claude Sonnet 5.5 on Bedrock rejects it with
                        // "`temperature` is deprecated for this model", so each model runs at its
                        // own default.
                        // A full inline game (levels, power-ups, leaderboard, explosion +
                        // game-over animations, all CSS/JS in one file) runs well past 8192
                        // output tokens. At 8192 the model stopped mid-<html>, so the reviewer
                        // received a TRUNCATED, broken document and rebuilt it from scratch.
                        // 32768 fits a complete deliverable and is supported across the Claude 4
                        // family on Bedrock (Haiku/Sonnet/Opus).
                        .maxTokens(32768))
                .defaultAdvisors(advisor, toolCallAdvisor);

        List<Object> tools = new ArrayList<>(sharedTools);
        tools.addAll(extraToolCallbacks);
        if (!tools.isEmpty()) {
            builder = builder.defaultTools(tools.toArray());
        }
        return new BuiltAgent(builder.build(), advisor);
    }
}
