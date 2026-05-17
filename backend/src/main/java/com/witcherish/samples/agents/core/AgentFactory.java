package com.witcherish.samples.agents.core;

import com.witcherish.samples.agents.api.dto.AgentDefinition;
import com.witcherish.samples.agents.api.dto.Project;
import com.witcherish.samples.agents.observer.EventCaptureAdvisor;
import com.witcherish.samples.agents.observer.EventLog;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.prompt.ChatOptions;
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
 */
@Component
public class AgentFactory {

    private final ChatModel chatModel;
    private final EventLog eventLog;

    public AgentFactory(ChatModel chatModel, EventLog eventLog) {
        this.chatModel = chatModel;
        this.eventLog = eventLog;
    }

    /** Build one ChatClient per AgentDefinition, keyed by agent.id (preserves team order). */
    public Map<String, ChatClient> buildTeam(List<AgentDefinition> definitions, Project project, List<Object> sharedTools) {
        Map<String, ChatClient> team = new LinkedHashMap<>();
        for (AgentDefinition def : definitions) {
            team.put(def.id(), buildOne(def, project, sharedTools, List.of()));
        }
        return team;
    }

    /**
     * Build a single ChatClient with @Tool-annotated POJOs as its tool surface.
     * Convenience for {@code buildOne(def, project, sharedTools, List.of())}.
     */
    public ChatClient buildOne(AgentDefinition def, Project project, List<Object> sharedTools) {
        return buildOne(def, project, sharedTools, List.of());
    }

    /**
     * Build a single ChatClient with both @Tool-annotated POJOs and runtime-synthesised
     * {@link ToolCallback}s (used by the orchestrator + swarm patterns).
     */
    public ChatClient buildOne(AgentDefinition def, Project project,
                               List<Object> sharedTools, List<ToolCallback> extraToolCallbacks) {
        ChatClient.Builder builder = ChatClient.builder(chatModel)
                .defaultSystem(def.prompt())
                .defaultOptions(ChatOptions.builder()
                        .model(BedrockModels.resolve(def.model()))
                        .temperature(0.3)
                        // Tool-heavy multi-turn chains (orchestrator, swarm) blow past the
                        // ~4096-token default. 8192 leaves headroom for a full HTML deliverable.
                        .maxTokens(8192)
                        .build())
                .defaultAdvisors(new EventCaptureAdvisor(eventLog, project.id(), def.id(), def.name()));

        if (!sharedTools.isEmpty()) {
            builder = builder.defaultTools(sharedTools.toArray());
        }
        if (!extraToolCallbacks.isEmpty()) {
            builder = builder.defaultToolCallbacks(extraToolCallbacks.toArray(new ToolCallback[0]));
        }
        return builder.build();
    }
}
