package com.witcherish.samples.agents.patterns;

import com.witcherish.samples.agents.api.dto.AgentDefinition;
import com.witcherish.samples.agents.api.dto.Config;
import com.witcherish.samples.agents.api.dto.Project;
import com.witcherish.samples.agents.api.dto.Team;
import com.witcherish.samples.agents.core.AgentFactory;
import com.witcherish.samples.agents.tools.TaskTools;
import com.witcherish.samples.agents.tools.WriteResultTool;
import com.witcherish.samples.agents.tools.WriteResultToolFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Pattern 1.1 — Basic Reasoning.
 * One agent (the entrypoint) receives the prompt and returns a single answer.
 * No delegation, no handoff, no DAG. Foundation block; all other patterns build on this.
 */
@Component
public class MonoPattern {

    private static final Logger log = LoggerFactory.getLogger(MonoPattern.class);

    private final AgentFactory factory;
    private final TaskTools taskTools;
    private final WriteResultToolFactory writeResultToolFactory;

    public MonoPattern(AgentFactory factory, TaskTools taskTools, WriteResultToolFactory writeResultToolFactory) {
        this.factory = factory;
        this.taskTools = taskTools;
        this.writeResultToolFactory = writeResultToolFactory;
    }

    public PatternResult run(Project project, Team team, Config config) {
        AgentDefinition def = team.agents().stream()
                .filter(a -> a.id().equals(team.entrypoint()))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException(
                        "entrypoint agent " + team.entrypoint() + " not found in team.agents"));

        WriteResultTool writeResult = writeResultToolFactory.build(project, config);
        ChatClient agent = factory.buildOne(def, project,
                List.of(taskTools),
                List.of(writeResult.asToolCallback()));

        String userPrompt = Prompts.composeUserPrompt(project, team);
        log.info("[mono] invoking entrypoint={} ({})", def.name(), def.id());

        String answer = agent.prompt().user(userPrompt).call().content();
        return new PatternResult("COMPLETED", "mono", def.id(), answer, List.of(def.id()));
    }
}
