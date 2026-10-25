package com.witcherish.samples.agents.patterns;

import com.witcherish.samples.agents.api.dto.AgentDefinition;
import com.witcherish.samples.agents.api.dto.Config;
import com.witcherish.samples.agents.api.dto.Project;
import com.witcherish.samples.agents.api.dto.QuestResult;
import com.witcherish.samples.agents.api.dto.Team;
import com.witcherish.samples.agents.core.AgentFactory;
import com.witcherish.samples.agents.core.AgentFactory.BuiltAgent;
import com.witcherish.samples.agents.core.RoleContracts;
import com.witcherish.samples.agents.observer.Throwables;
import com.witcherish.samples.agents.telemetry.McpTelemetryPublisher.Session;
import com.witcherish.samples.agents.tools.TaskToolsFactory;
import com.witcherish.samples.agents.tools.WriteResultTool;
import com.witcherish.samples.agents.tools.WriteResultToolFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

/**
 * Orchestrator pattern, implemented as Spring AI's
 * <a href="https://github.com/spring-projects/spring-ai-examples/tree/main/agentic-patterns/orchestrator-workers">Orchestrator-Workers
 * workflow</a>.
 *
 * <ol>
 *   <li><strong>Orchestrator.</strong> The entrypoint agent analyses the goal and returns a
 *       structured plan ({@link OrchestratorResponse}: an analysis plus an ordered list of
 *       {@link Task}s, each assigned to one worker) via {@code .call().entity(...)}.</li>
 *   <li><strong>Workers.</strong> Each task runs on the worker it names. As in the reference,
 *       tasks run one after another in plan order; unlike the reference, each worker also gets
 *       the earlier workers' outputs, because a build pipeline is dependent (the Frontend needs
 *       the Architect's spec, the Code Reviewer needs the Frontend's HTML).</li>
 *   <li><strong>Result.</strong> {@link FinalResponse}: the analysis plus every worker response.
 *       The latest complete {@code index.html} a worker produced is persisted as the
 *       deliverable.</li>
 * </ol>
 *
 * <p>Compared with the earlier "agents as tools" design, the orchestrator no longer drives a
 * tool loop: it decides the plan once, up front, and the framework executes it. That makes each
 * run's routing visible as data (the plan) instead of buried in tool-call turns.
 */
@Component
public class OrchestratorPattern {

    private static final Logger log = LoggerFactory.getLogger(OrchestratorPattern.class);

    /** One sub-task the orchestrator assigns to a worker, by the worker's agent id. */
    public record Task(String worker, String description) {}

    /** The orchestrator's structured plan. */
    public record OrchestratorResponse(String analysis, List<Task> tasks) {}

    /** The workflow result: the orchestrator's analysis plus every worker's response, in order. */
    public record FinalResponse(String analysis, List<String> workerResponses) {}

    private final AgentFactory factory;
    private final TaskToolsFactory taskToolsFactory;
    private final WriteResultToolFactory writeResultToolFactory;
    private final StructuredAnswer structuredAnswer;

    public OrchestratorPattern(AgentFactory factory, TaskToolsFactory taskToolsFactory,
                               WriteResultToolFactory writeResultToolFactory,
                               StructuredAnswer structuredAnswer) {
        this.factory = factory;
        this.taskToolsFactory = taskToolsFactory;
        this.writeResultToolFactory = writeResultToolFactory;
        this.structuredAnswer = structuredAnswer;
    }

    public PatternResult run(Project project, Team team, Config config, Session telemetry) {
        AgentDefinition orchestratorDef = team.agents().stream()
                .filter(a -> a.id().equals(team.entrypoint()))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException(
                        "entrypoint agent " + team.entrypoint() + " not found in team.agents"));

        Map<String, AgentDefinition> workerDefs = new LinkedHashMap<>();
        team.agents().stream()
                .filter(a -> !a.id().equals(team.entrypoint()))
                .forEach(a -> workerDefs.put(a.id(), a));

        WriteResultTool writeResultTool = writeResultToolFactory.build(project, config, telemetry);
        var taskTools = taskToolsFactory.build(project.id(), telemetry);

        // Workers keep TaskTools + writeResult (last-resort shipping). The orchestrator gets no
        // tools: its only job is the plan.
        Map<String, BuiltAgent> workersBuilt = new LinkedHashMap<>();
        for (AgentDefinition def : workerDefs.values()) {
            workersBuilt.put(def.id(), factory.buildOne(
                    RoleContracts.shape(def, RoleContracts.Pattern.ORCHESTRATOR, false),
                    project, telemetry, List.of(taskTools), List.of(writeResultTool.asToolCallback())));
        }
        BuiltAgent orchestratorBuilt = factory.buildOne(
                RoleContracts.shape(orchestratorDef, RoleContracts.Pattern.ORCHESTRATOR, true),
                project, telemetry, List.of());

        telemetry.saveAgentState(project.id(), orchestratorDef.id(), orchestratorDef.name(), "WORKING",
                0, 0, 0, 0, 0, 0L);
        for (AgentDefinition def : workerDefs.values()) {
            telemetry.saveAgentState(project.id(), def.id(), def.name(), "READY", 0, 0, 0, 0, 0, 0L);
        }

        String goal = Prompts.composeUserPrompt(project, team);

        // Step 1: the orchestrator returns a structured plan.
        OrchestratorResponse plan = orchestratorBuilt.client().prompt()
                .user(composeOrchestratorPrompt(goal, workerDefs))
                .call()
                .entity(OrchestratorResponse.class);
        List<Task> tasks = plan == null || plan.tasks() == null ? List.of() : plan.tasks();
        String analysis = plan == null || plan.analysis() == null ? "" : plan.analysis();
        log.info("[orchestrator-workers] analysis={} tasks={}", analysis, tasks);
        telemetry.saveAgentState(project.id(), orchestratorDef.id(), orchestratorDef.name(), "STOPPED",
                orchestratorBuilt.advisor().cycleCount(), orchestratorBuilt.advisor().messageCount(),
                orchestratorBuilt.advisor().inputTokens(), orchestratorBuilt.advisor().outputTokens(),
                orchestratorBuilt.advisor().totalTokens(), orchestratorBuilt.advisor().totalLatencyMs());

        // Step 2: each task runs on its worker, in plan order.
        List<String> workerResponses = new ArrayList<>(tasks.size());
        List<String> participants = new ArrayList<>();
        participants.add(orchestratorDef.id());
        String currentHtml = null;
        StringBuilder priorOutputs = new StringBuilder();
        for (Task task : tasks) {
            AgentDefinition def = workerDefs.get(task.worker());
            if (def == null) {
                log.warn("[orchestrator-workers] plan named unknown worker '{}', skipping", task.worker());
                workerResponses.add("Skipped: unknown worker '" + task.worker() + "'.");
                continue;
            }
            String reply = runWorker(def, workersBuilt.get(def.id()), task, goal,
                    priorOutputs.toString(), currentHtml, orchestratorDef, project, telemetry);
            workerResponses.add(reply);
            if (!participants.contains(def.id())) participants.add(def.id());

            String html = extractHtml(reply);
            if (html != null) {
                currentHtml = html;
            } else {
                priorOutputs.append("\n\n--- Output from ").append(def.name())
                        .append(" (").append(def.role()).append(") ---\n").append(reply);
            }
        }

        // Step 3: combine. Ship the latest HTML; summarise each worker without its HTML body.
        FinalResponse result = new FinalResponse(analysis, workerResponses);
        String url = currentHtml == null ? null : persistDeliverable(writeResultTool, currentHtml);
        String finalAnswer = composeFinalAnswer(result, tasks, workerDefs, url);

        Map<String, AgentDefinition> teamDefs = new LinkedHashMap<>();
        Map<String, BuiltAgent> teamBuilt = new LinkedHashMap<>();
        teamDefs.put(orchestratorDef.id(), orchestratorDef);
        teamBuilt.put(orchestratorDef.id(), orchestratorBuilt);
        teamDefs.putAll(workerDefs);
        teamBuilt.putAll(workersBuilt);

        QuestResult structured = structuredAnswer.coerce(finalAnswer);
        return PatternResult.from("orchestrator", orchestratorDef.id(), finalAnswer,
                participants, teamDefs, teamBuilt, structured);
    }

    /** Run one worker on its task. A failure becomes an error string so the plan can continue. */
    private String runWorker(AgentDefinition def, BuiltAgent worker, Task task, String goal,
                             String priorOutputs, String currentHtml, AgentDefinition orchestratorDef,
                             Project project, Session telemetry) {
        telemetry.saveAgentTransition(project.id(), UUID.randomUUID().toString(), orchestratorDef.id(), def.id());
        publishState(project, def, worker, "WORKING", telemetry);
        try {
            String reply = worker.client().prompt()
                    .user(composeWorkerPrompt(goal, def, task, priorOutputs, isQaRole(def.role()) ? currentHtml : null))
                    .call()
                    .content();
            return reply == null ? "" : reply;
        } catch (Exception e) {
            log.error("[orchestrator-workers] worker '{}' raised", def.name(), e);
            return "Error in %s (%s): %s".formatted(def.name(), def.role(), Throwables.rootMessage(e));
        } finally {
            publishState(project, def, worker, "STOPPED", telemetry);
        }
    }

    private static void publishState(Project project, AgentDefinition def, BuiltAgent agent,
                                     String state, Session telemetry) {
        var a = agent.advisor();
        telemetry.saveAgentState(project.id(), def.id(), def.name(), state,
                a.cycleCount(), a.messageCount(), a.inputTokens(), a.outputTokens(),
                a.totalTokens(), a.totalLatencyMs());
    }

    /** Orchestrator prompt: the goal plus the worker roster it may assign tasks to. */
    private static String composeOrchestratorPrompt(String goal, Map<String, AgentDefinition> workers) {
        StringBuilder roster = new StringBuilder();
        for (AgentDefinition w : workers.values()) {
            roster.append("- id `").append(w.id()).append("`: ").append(w.name())
                  .append(" (").append(w.role()).append(")\n");
        }
        return """
                Analyze this task and break it down into an ordered list of sub-tasks, one per \
                worker call. The goal is a runnable deliverable: a single self-contained \
                `index.html` the user can PLAY.

                Task: %s

                Workers you can assign (use the id in the `worker` field):
                %s
                Return your response as JSON with:
                - "analysis": your understanding of the task and why this plan serves it.
                - "tasks": the ordered sub-tasks, each with "worker" (a worker id) and \
                "description" (what that worker must produce)."""
                .formatted(goal, roster);
    }

    /** Worker prompt: the original task, the worker's assignment, and what came before it. */
    private static String composeWorkerPrompt(String goal, AgentDefinition def, Task task,
                                              String priorOutputs, String currentHtml) {
        StringBuilder sb = new StringBuilder()
                .append("Generate content based on:\n")
                .append("Task: ").append(goal).append('\n')
                .append("Worker: ").append(def.name()).append(" (").append(def.role()).append(")\n")
                .append("Guidelines: ").append(task.description());
        if (!priorOutputs.isBlank()) {
            sb.append("\n\nOutputs from earlier workers:").append(priorOutputs);
        }
        if (currentHtml != null) {
            sb.append("\n\n--- Current index.html to review and fix ---\n").append(currentHtml);
        }
        return sb.toString();
    }

    private static String composeFinalAnswer(FinalResponse result, List<Task> tasks,
                                             Map<String, AgentDefinition> workers, String url) {
        StringBuilder sb = new StringBuilder();
        if (url != null) sb.append("Deliverable: ").append(url).append("\n\n");
        sb.append(result.analysis());
        for (int i = 0; i < result.workerResponses().size(); i++) {
            AgentDefinition def = workers.get(tasks.get(i).worker());
            String name = def == null ? tasks.get(i).worker() : def.name();
            String reply = result.workerResponses().get(i);
            String html = extractHtml(reply);
            String summary = html != null
                    ? "delivered a complete index.html (" + html.length() + " chars)"
                    : reply.length() <= 300 ? reply : reply.substring(0, 300) + "…";
            sb.append("\n- ").append(name).append(": ").append(summary.strip());
        }
        return sb.toString();
    }

    /** Code Reviewer and Performance Analyst correct the current HTML. */
    private static boolean isQaRole(String role) {
        if (role == null) return false;
        String r = role.toLowerCase(Locale.ROOT);
        return r.contains("reviewer") || r.contains("performance");
    }

    /** The complete HTML document inside {@code reply}, or {@code null}. Same rule as {@link GraphPattern}. */
    private static String extractHtml(String reply) {
        if (reply == null) return null;
        String lower = reply.toLowerCase(Locale.ROOT);
        int start = lower.indexOf("<!doctype html");
        if (start < 0) start = lower.indexOf("<html");
        if (start < 0) return null;
        int closeTag = lower.lastIndexOf("</html>");
        int end = closeTag >= 0 ? closeTag + "</html>".length() : reply.length();
        return reply.substring(start, end).strip();
    }

    /** Persist the HTML via {@link WriteResultTool}; the URL on success, {@code null} on failure. */
    private String persistDeliverable(WriteResultTool tool, String html) {
        try {
            String result = tool.writeResult(html, null);
            if (result.startsWith("Successfully wrote")) {
                int urlStart = result.lastIndexOf(' ');
                if (urlStart > 0) return result.substring(urlStart + 1);
            }
            log.warn("[orchestrator-workers] writeResult did not return a success URL: {}", result);
            return null;
        } catch (Exception e) {
            log.error("[orchestrator-workers] failed to persist final deliverable", e);
            return null;
        }
    }
}
