package com.witcherish.samples.agents.patterns;

import com.fasterxml.jackson.core.json.JsonReadFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.witcherish.samples.agents.api.dto.AgentDefinition;
import com.witcherish.samples.agents.api.dto.Config;
import com.witcherish.samples.agents.api.dto.Project;
import com.witcherish.samples.agents.api.dto.QuestResult;
import com.witcherish.samples.agents.api.dto.Team;
import com.witcherish.samples.agents.core.AgentFactory;
import com.witcherish.samples.agents.core.AgentFactory.BuiltAgent;
import com.witcherish.samples.agents.observer.Throwables;
import com.witcherish.samples.agents.telemetry.McpTelemetryPublisher.Session;
import com.witcherish.samples.agents.tools.TaskToolsFactory;
import com.witcherish.samples.agents.tools.WriteResultToolFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.ai.tool.definition.ToolDefinition;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Orchestrator pattern (a.k.a. "Agents as Tools") — the canonical hierarchical multi-agent
 * pattern from the Strands Agents docs.
 *
 * <p>The entrypoint agent is the orchestrator: it routes sub-tasks to specialists wrapped
 * as tools, then ships a single deliverable. Specialists never see each other.
 *
 * @see <a href="https://strandsagents.com/docs/user-guide/concepts/multi-agent/agents-as-tools/">Strands — Agents as Tools</a>
 */
@Component
public class OrchestratorPattern {

    private static final Logger log = LoggerFactory.getLogger(OrchestratorPattern.class);

    /**
     * Lenient parser used by specialist tool callbacks. Bedrock occasionally emits raw
     * newlines inside tool argument strings (when the LLM packs multi-line content);
     * Spring AI's default mapper rejects those. We tolerate them.
     */
    private static final ObjectMapper LENIENT = JsonMapper.builder()
            .enable(JsonReadFeature.ALLOW_UNESCAPED_CONTROL_CHARS)
            .build();

    private static final String DELEGATE_INPUT_SCHEMA = """
            {
              "type": "object",
              "properties": {
                "query": { "type": "string", "description": "The sub-task to delegate, in natural language." }
              },
              "required": ["query"]
            }
            """;

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

        List<AgentDefinition> specialistDefs = team.agents().stream()
                .filter(a -> !a.id().equals(team.entrypoint()))
                .toList();

        // The write_result tool is shared by every agent in the team — same projectId,
        // same bucket. Specialists call it directly to persist the deliverable.
        ToolCallback writeResult = writeResultToolFactory.build(project, config).asToolCallback();

        // Per-quest TaskTools: shares an in-memory map across all agents in this run,
        // and mirrors createTask/updateTask to AppSync via MCP for live Adventure Log.
        var taskTools = taskToolsFactory.build(project.id(), telemetry);

        // Wrap each specialist as a tool the orchestrator can call. Specialists get
        // TaskTools + writeResult; they cannot delegate further. Each specialist's
        // BuiltAgent (ChatClient + advisor) is captured so we can publish accurate
        // token/cycle aggregates when the specialist's turn ends.
        List<ToolCallback> specialistTools = specialistDefs.stream()
                .map(spec -> asTool(spec,
                        factory.buildOne(spec, project, List.of(taskTools), List.of(writeResult)),
                        project, telemetry, orchestratorDef))
                .toList();

        // The orchestrator gets every specialist tool plus writeResult itself.
        var orchestratorCallbacks = new ArrayList<>(specialistTools);
        orchestratorCallbacks.add(writeResult);
        BuiltAgent orchestratorBuilt = factory.buildOne(orchestratorDef, project,
                List.of(taskTools), orchestratorCallbacks);
        ChatClient orchestrator = orchestratorBuilt.client();

        log.info("[orchestrator] entrypoint={} specialists={}",
                orchestratorDef.name(), specialistDefs.size());

        // Mark every team member as READY up front so the UI can render their cards from
        // the start of the run. Each specialist's WORKING transition is emitted when the
        // orchestrator actually calls its tool (see asTool below).
        telemetry.saveAgentState(project.id(), orchestratorDef.id(), orchestratorDef.name(), "WORKING",
                0, 0, 0, 0, 0, 0L);
        for (AgentDefinition spec : specialistDefs) {
            telemetry.saveAgentState(project.id(), spec.id(), spec.name(), "READY",
                    0, 0, 0, 0, 0, 0L);
        }

        long start = System.currentTimeMillis();
        String answer = orchestrator.prompt()
                .user(composeUserPrompt(project, team, specialistDefs))
                .call()
                .content();
        long elapsed = System.currentTimeMillis() - start;

        telemetry.saveAgentMessage(project.id(), orchestratorDef.id(), "assistant", answer == null ? "" : answer);
        telemetry.saveAgentState(project.id(), orchestratorDef.id(), orchestratorDef.name(), "STOPPED",
                orchestratorBuilt.advisor().cycleCount(), orchestratorBuilt.advisor().messageCount(),
                orchestratorBuilt.advisor().inputTokens(), orchestratorBuilt.advisor().outputTokens(),
                orchestratorBuilt.advisor().totalTokens(), elapsed);

        var participants = new ArrayList<String>(specialistDefs.size() + 1);
        participants.add(orchestratorDef.id());
        specialistDefs.forEach(s -> participants.add(s.id()));

        QuestResult structured = structuredAnswer.coerce(answer);
        return new PatternResult("COMPLETED", "orchestrator", orchestratorDef.id(), answer, participants, structured);
    }

    /**
     * Wrap a specialist {@link ChatClient} as a {@link ToolCallback}. We implement the
     * interface inline (instead of {@code FunctionToolCallback.builder}) so we can use a
     * lenient parser — Bedrock sometimes packs multi-line content into tool arguments
     * with raw newlines that Spring AI's default mapper would reject.
     *
     * <p>Strands-style: a single {@code query} string in, a string out, errors swallowed
     * into a formatted message so one specialist failure doesn't abort the whole run.
     */
    private ToolCallback asTool(AgentDefinition def, BuiltAgent specialist,
                                Project project, Session telemetry, AgentDefinition orchestratorDef) {
        ChatClient specialistClient = specialist.client();
        ToolDefinition definition = ToolDefinition.builder()
                .name(sanitize(def.name()))
                // Strands-style: describe what the specialist DOES, not how to call it.
                .description(("""
                        Process and respond to %s-related sub-tasks. Use this tool whenever the project requires \
                        %s expertise. Provide a single 'query' string describing the sub-task; the tool returns \
                        the specialist's answer as text.""").formatted(def.role(), def.role()))
                .inputSchema(DELEGATE_INPUT_SCHEMA)
                .build();

        return new ToolCallback() {
            @Override
            public ToolDefinition getToolDefinition() {
                return definition;
            }

            @Override
            public String call(String toolInput) {
                // Telemetry: orchestrator → specialist delegation visible in the UI graph.
                telemetry.saveAgentTransition(project.id(), UUID.randomUUID().toString(),
                        orchestratorDef.id(), def.id());
                telemetry.saveAgentState(project.id(), def.id(), def.name(), "WORKING",
                        0, 0, 0, 0, 0, 0L);
                long start = System.currentTimeMillis();
                try {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> parsed = LENIENT.readValue(toolInput, Map.class);
                    String query = String.valueOf(parsed.getOrDefault("query", "")).strip();
                    if (query.isBlank()) {
                        return "Error in %s (%s): missing or empty 'query'.".formatted(def.name(), def.role());
                    }
                    String reply = sanitizeForToolResult(specialistClient.prompt().user(query).call().content());
                    telemetry.saveAgentMessage(project.id(), def.id(), "assistant", reply == null ? "" : reply);
                    return reply;
                } catch (Exception e) {
                    // Pass the Throwable as the last SLF4J arg so the full cause chain
                    // lands in CloudWatch — toString() alone strips the stack trace.
                    log.error("[orchestrator] specialist '{}' raised", def.name(), e);
                    String detail = Throwables.rootMessage(e);
                    return "Error in %s (%s): %s".formatted(def.name(), def.role(), detail);
                } finally {
                    telemetry.saveAgentState(project.id(), def.id(), def.name(), "STOPPED",
                            specialist.advisor().cycleCount(), specialist.advisor().messageCount(),
                            specialist.advisor().inputTokens(), specialist.advisor().outputTokens(),
                            specialist.advisor().totalTokens(), System.currentTimeMillis() - start);
                }
            }
        };
    }

    /**
     * Compose the orchestrator's user prompt: project goal + routing table + procedure.
     */
    private static String composeUserPrompt(Project project, Team team, List<AgentDefinition> specialists) {
        if (specialists.isEmpty()) {
            return Prompts.composeUserPrompt(project, team);
        }
        String roster = specialists.stream()
                .map(s -> "- For %s sub-tasks → CALL the `%s` tool (specialist: %s).".formatted(
                        s.role(), sanitize(s.name()), s.name()))
                .reduce((a, b) -> a + "\n" + b)
                .orElse("");

        return """
                %s

                You are the orchestrator. Your goal is to ship a runnable deliverable: a single \
                self-contained `index.html` that runs in any modern browser. The user wants to PLAY \
                the result, not read about it.

                You do not write code yourself. You decompose the goal and CALL these specialist tools:
                %s

                You also have a `writeResult` tool. The Frontend specialist will normally call it itself \
                and return you a URL — your job in that case is just to forward that URL to the user.

                Procedure (mandatory):
                1. Read the project goal. Identify the deliverable: an index.html for the requested app.
                2. Plan the build. Typically: architecture → frontend implementation → code review.
                3. CALL each specialist tool one at a time, in a sensible order — wait for each response \
                before the next. Do not describe what you would do; actually invoke the tools.
                4. The Frontend specialist returns a URL — that URL is the deliverable.
                5. Your final reply MUST be a SHORT plain-text message containing: (a) the URL returned by \
                the Frontend specialist (or writeResult), (b) a one-paragraph summary of what was built. \
                Keep it under 150 words. NO markdown bullets, NO code blocks, NO HTML — just plain prose. \
                The user opens the URL to play the deliverable."""
                .formatted(Prompts.composeUserPrompt(project, team), roster);
    }

    /** Bedrock tool names must match {@code [a-zA-Z0-9_-]+}. Strip everything else. */
    private static String sanitize(String name) {
        return name.replaceAll("[^a-zA-Z0-9_-]", "_");
    }

    /**
     * Specialist replies become tool_result messages. Spring AI 1.1.3 round-trips them
     * through a strict {@code ObjectMapper.readValue(String, Map.class)} that rejects
     * raw control characters in markdown — so we collapse newlines/tabs to spaces here.
     * The orchestrator only needs a summary to integrate, never raw markdown.
     */
    private static String sanitizeForToolResult(String reply) {
        return reply == null ? "" : reply
                .replaceAll("[\\t\\f\\r\\n]+", " ")
                .replaceAll(" +", " ")
                .strip();
    }
}
