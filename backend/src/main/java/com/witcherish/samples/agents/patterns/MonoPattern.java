package com.witcherish.samples.agents.patterns;

import com.witcherish.samples.agents.api.dto.AgentDefinition;
import com.witcherish.samples.agents.api.dto.Config;
import com.witcherish.samples.agents.api.dto.Project;
import com.witcherish.samples.agents.api.dto.Team;
import com.witcherish.samples.agents.core.AgentFactory;
import com.witcherish.samples.agents.tools.TaskTools;
import com.witcherish.samples.agents.tools.WriteResultToolFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.stereotype.Component;

import java.util.List;

/**
 * Pattern 1.1 — Basic Reasoning. One agent, one prompt, one deliverable.
 *
 * <p>The lone agent owns the whole goal: design + implement + ship. It has the same
 * {@code writeResult} tool the Orchestrator's specialists have, so its output is a
 * runnable {@code index.html} (S3 or local file), not just prose. This makes Mono an
 * honest live-demo of Strands' "every agent ships a result" doctrine on the simplest
 * topology.
 */
@Component
public class MonoPattern {

    private static final Logger log = LoggerFactory.getLogger(MonoPattern.class);

    private final AgentFactory factory;
    private final TaskTools taskTools;
    private final WriteResultToolFactory writeResultToolFactory;

    public MonoPattern(AgentFactory factory, TaskTools taskTools,
                       WriteResultToolFactory writeResultToolFactory) {
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

        var writeResult = writeResultToolFactory.build(project, config).asToolCallback();
        ChatClient agent = factory.buildOne(def, project,
                List.of(taskTools),
                List.of(writeResult));

        log.info("[mono] invoking entrypoint={} ({})", def.name(), def.id());

        String answer = agent.prompt()
                .user(Prompts.composeMonoPrompt(project, team))
                .call()
                .content();

        return new PatternResult("COMPLETED", "mono", def.id(), answer, List.of(def.id()));
    }
}
