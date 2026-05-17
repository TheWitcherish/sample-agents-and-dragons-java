package com.witcherish.samples.agents.core;

import com.witcherish.samples.agents.api.dto.AgentDefinition;
import com.witcherish.samples.agents.api.dto.Project;
import com.witcherish.samples.agents.observer.EventCaptureAdvisor;
import com.witcherish.samples.agents.observer.EventLog;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.prompt.ChatOptions;
import org.springframework.stereotype.Component;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Builds one ChatClient per AgentDefinition.
 *
 * Each agent gets its own fresh builder seeded from the autoconfigured ChatModel,
 * so per-agent system prompts, model overrides, tool sets, and advisors stay isolated.
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

    /** Build a single ChatClient — used by patterns that inject extra per-agent tools (hierarchical, swarm). */
    public ChatClient buildOne(AgentDefinition def, Project project, List<Object> sharedTools, List<Object> extraTools) {
        Object[] allTools = concat(sharedTools, extraTools);

        ChatClient.Builder builder = ChatClient.builder(chatModel)
                .defaultSystem(def.prompt())
                .defaultOptions(ChatOptions.builder()
                        .model(BedrockModels.resolve(def.model()))
                        .temperature(0.3)
                        .build())
                .defaultAdvisors(new EventCaptureAdvisor(eventLog, project.id(), def.id(), def.name()));

        if (allTools.length > 0) {
            builder = builder.defaultTools(allTools);
        }
        return builder.build();
    }

    private static Object[] concat(List<Object> a, List<Object> b) {
        Object[] out = new Object[a.size() + b.size()];
        int i = 0;
        for (Object o : a) out[i++] = o;
        for (Object o : b) out[i++] = o;
        return out;
    }
}
