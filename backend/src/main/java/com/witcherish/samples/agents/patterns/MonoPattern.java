package com.witcherish.samples.agents.patterns;

import com.witcherish.samples.agents.api.dto.AgentDefinition;
import com.witcherish.samples.agents.api.dto.Config;
import com.witcherish.samples.agents.api.dto.Project;
import com.witcherish.samples.agents.api.dto.QuestResult;
import com.witcherish.samples.agents.api.dto.Team;
import com.witcherish.samples.agents.core.AgentFactory;
import com.witcherish.samples.agents.core.RoleContracts;
import com.witcherish.samples.agents.telemetry.McpTelemetryPublisher.Session;
import com.witcherish.samples.agents.tools.TaskToolsFactory;
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
    private final TaskToolsFactory taskToolsFactory;
    private final WriteResultToolFactory writeResultToolFactory;
    private final StructuredAnswer structuredAnswer;

    public MonoPattern(AgentFactory factory, TaskToolsFactory taskToolsFactory,
                       WriteResultToolFactory writeResultToolFactory,
                       StructuredAnswer structuredAnswer) {
        this.factory = factory;
        this.taskToolsFactory = taskToolsFactory;
        this.writeResultToolFactory = writeResultToolFactory;
        this.structuredAnswer = structuredAnswer;
    }

    public PatternResult run(Project project, Team team, Config config, Session telemetry) {
        AgentDefinition def = team.agents().stream()
                .filter(a -> a.id().equals(team.entrypoint()))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException(
                        "entrypoint agent " + team.entrypoint() + " not found in team.agents"));

        var taskTools = taskToolsFactory.build(project.id(), telemetry);
        var writeResult = writeResultToolFactory.build(project, config, telemetry).asToolCallback();
        // Mono's lone agent owns the whole goal. Shape its prompt with role contract +
        // Mono pattern epilogue so it can't pass the buck — there's no one to pass it to.
        var built = factory.buildOne(
                RoleContracts.shape(def, RoleContracts.Pattern.MONO, true),
                project, telemetry, List.of(taskTools), List.of(writeResult));
        ChatClient agent = built.client();

        log.info("[mono] invoking entrypoint={} ({})", def.name(), def.id());
        telemetry.saveAgentState(project.id(), def.id(), def.name(), "WORKING",
                0, 0, 0, 0, 0, 0L);

        String answer = agent.prompt()
                .user(Prompts.composeMonoPrompt(project, team))
                .call()
                .content();

        // The Adventure Log message stream is owned by EventCaptureAdvisor now: it fires once
        // per tool-calling cycle and saves every non-empty model turn (plan, "creating the
        // board…", tool summaries, final ship). Persisting `answer` here again would duplicate
        // the final turn the advisor already streamed, so we don't.
        // Pull real cycle/token aggregates from the advisor — Spring AI normalises Bedrock
        // usage onto Usage#getPromptTokens / getCompletionTokens / getTotalTokens. Latency
        // is the advisor's running total of model-call wall-clock, so it matches what the
        // multi-agent patterns report (cumulative across every adviseCall, not just the
        // final turn).
        telemetry.saveAgentState(project.id(), def.id(), def.name(), "STOPPED",
                built.advisor().cycleCount(), built.advisor().messageCount(),
                built.advisor().inputTokens(), built.advisor().outputTokens(),
                built.advisor().totalTokens(), built.advisor().totalLatencyMs());

        QuestResult structured = structuredAnswer.coerce(answer);
        return PatternResult.from("mono", def.id(), answer, List.of(def.id()),
                java.util.Map.of(def.id(), def),
                java.util.Map.of(def.id(), built),
                structured);
    }
}
