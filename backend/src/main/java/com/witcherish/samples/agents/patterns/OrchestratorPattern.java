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
import com.witcherish.samples.agents.core.RoleContracts;
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
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
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
                "query":     { "type": "string", "description": "The sub-task to delegate, in natural language." },
                "reasoning": {
                  "type": "object",
                  "description": "Optional reasoning sidecar — explain why you're delegating to this specialist now. See ToolChoiceExplanation.",
                  "properties": {
                    "innerThought": {"type": "string", "description": "Why this specialist is the right pick for this sub-task."},
                    "confidence":   {"type": "string", "description": "high | medium | low"},
                    "memoryNotes":  {"type": "array", "items": {"type": "string"}, "description": "Insights to carry across the orchestration."}
                  }
                }
              },
              "required": ["query"]
            }
            """;

    // Role + pattern contracts live in RoleContracts (shared across all four patterns).
    // See RoleContracts.shape(...) below.

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
        ToolCallback writeResult = writeResultToolFactory.build(project, config, telemetry).asToolCallback();

        // Per-quest TaskTools: shares an in-memory map across all agents in this run,
        // and mirrors createTask/updateTask to AppSync via MCP for live Adventure Log.
        var taskTools = taskToolsFactory.build(project.id(), telemetry);

        // Wrap each specialist as a tool the orchestrator can call. Specialists get
        // TaskTools + writeResult; they cannot delegate further. Each specialist's
        // BuiltAgent (ChatClient + advisor) is captured so we can publish accurate
        // token/cycle aggregates when the specialist's turn ends.
        //
        // Each specialist's prompt is augmented by RoleContracts.shape with both a
        // role contract (what this persona MUST produce) and a pattern epilogue (how it
        // behaves as an Orchestrator specialist — return text, do not delegate further).
        // Without the contracts, weaker tool-using models (Haiku 4.5) treat delegation
        // as conversational and respond with prose instead of fulfilling their role.
        // Build each specialist once, keep its BuiltAgent in the team map so PatternResult
        // can read per-node aggregates at the end. The same BuiltAgent is also wrapped
        // into a ToolCallback so the orchestrator can invoke it.
        Map<String, BuiltAgent> specialistsBuilt = new LinkedHashMap<>();
        for (AgentDefinition spec : specialistDefs) {
            specialistsBuilt.put(spec.id(), factory.buildOne(
                    RoleContracts.shape(spec, RoleContracts.Pattern.ORCHESTRATOR, false),
                    project, List.of(taskTools), List.of(writeResult)));
        }
        // Tool names must be unique: two specialists with the same role/name string would
        // otherwise sanitize to the same Bedrock tool name, and the orchestrator could only
        // ever reach one of them. Resolve collisions by suffixing the agent id, mirroring
        // the MCP `server___tool` prefixing convention. The roster prompt and the
        // ToolDefinition both read from this map so they always agree.
        Map<String, String> toolNames = uniqueToolNames(specialistDefs);
        List<ToolCallback> specialistTools = specialistDefs.stream()
                .map(spec -> asTool(spec, specialistsBuilt.get(spec.id()),
                        project, telemetry, orchestratorDef, toolNames.get(spec.id())))
                .toList();

        // The orchestrator gets every specialist tool plus writeResult itself. Its prompt
        // is shaped with the Coordinator/CTO role contract + the orchestrator-as-boss
        // pattern epilogue so it knows to verify specialist replies and only fall back
        // to writing HTML itself as a last resort.
        var orchestratorCallbacks = new ArrayList<>(specialistTools);
        orchestratorCallbacks.add(writeResult);
        BuiltAgent orchestratorBuilt = factory.buildOne(
                RoleContracts.shape(orchestratorDef, RoleContracts.Pattern.ORCHESTRATOR, true),
                project, List.of(taskTools), orchestratorCallbacks);
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

        String answer = orchestrator.prompt()
                .user(composeUserPrompt(project, team, specialistDefs, toolNames))
                .call()
                .content();

        telemetry.saveAgentMessage(project.id(), orchestratorDef.id(), "assistant", answer == null ? "" : answer);
        // Latency comes from the advisor's running total — sum of every adviseCall's
        // duration. Matches what specialists report (cumulative model-call time, not
        // wall-clock including waits).
        telemetry.saveAgentState(project.id(), orchestratorDef.id(), orchestratorDef.name(), "STOPPED",
                orchestratorBuilt.advisor().cycleCount(), orchestratorBuilt.advisor().messageCount(),
                orchestratorBuilt.advisor().inputTokens(), orchestratorBuilt.advisor().outputTokens(),
                orchestratorBuilt.advisor().totalTokens(),
                orchestratorBuilt.advisor().totalLatencyMs());

        var participants = new ArrayList<String>(specialistDefs.size() + 1);
        participants.add(orchestratorDef.id());
        specialistDefs.forEach(s -> participants.add(s.id()));

        // Build the team map (def + BuiltAgent for orchestrator AND every specialist) so
        // PatternResult.from() can produce a Strands-shaped MultiAgentResult equivalent
        // — per-node usage + cycles + latency, plus accumulated totals across the run.
        Map<String, AgentDefinition> teamDefs = new LinkedHashMap<>();
        Map<String, BuiltAgent> teamBuilt = new LinkedHashMap<>();
        teamDefs.put(orchestratorDef.id(), orchestratorDef);
        teamBuilt.put(orchestratorDef.id(), orchestratorBuilt);
        for (AgentDefinition spec : specialistDefs) {
            teamDefs.put(spec.id(), spec);
            teamBuilt.put(spec.id(), specialistsBuilt.get(spec.id()));
        }

        QuestResult structured = structuredAnswer.coerce(answer);
        return PatternResult.from("orchestrator", orchestratorDef.id(), answer,
                participants, teamDefs, teamBuilt, structured);
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
                                Project project, Session telemetry, AgentDefinition orchestratorDef,
                                String toolName) {
        ChatClient specialistClient = specialist.client();
        ToolDefinition definition = ToolDefinition.builder()
                .name(toolName)
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
                // WORKING carries running totals from the advisor — when a specialist is
                // re-invoked (e.g. orchestrator's verifier retries after a prose reply),
                // the UI card preserves the prior turn's tokens/cycles instead of flashing
                // back to zero. The advisor accumulates across every adviseCall() call,
                // so the values here are non-decreasing across the whole run.
                telemetry.saveAgentState(project.id(), def.id(), def.name(), "WORKING",
                        specialist.advisor().cycleCount(), specialist.advisor().messageCount(),
                        specialist.advisor().inputTokens(), specialist.advisor().outputTokens(),
                        specialist.advisor().totalTokens(),
                        specialist.advisor().totalLatencyMs());
                try {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> parsed = LENIENT.readValue(toolInput, Map.class);
                    // Publish the orchestrator's reasoning *before* the specialist runs, so
                    // the Adventure Log shows "why I'm calling X" right next to the delegation
                    // edge. Aligned with Spring AI Recipes' tool-choice-explanation pattern.
                    String reasoning = renderReasoning(parsed.get("reasoning"));
                    if (reasoning != null) {
                        telemetry.saveAgentMessage(project.id(), orchestratorDef.id(),
                                "reasoning", reasoning);
                    }
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
                    // STOPPED also uses the running total, not just this turn's duration.
                    // If the orchestrator re-invokes the same specialist, the card shows
                    // cumulative tokens/cycles/time across both turns.
                    telemetry.saveAgentState(project.id(), def.id(), def.name(), "STOPPED",
                            specialist.advisor().cycleCount(), specialist.advisor().messageCount(),
                            specialist.advisor().inputTokens(), specialist.advisor().outputTokens(),
                            specialist.advisor().totalTokens(),
                            specialist.advisor().totalLatencyMs());
                }
            }
        };
    }

    /**
     * Compose the orchestrator's user prompt: project goal + routing table + procedure.
     */
    private static String composeUserPrompt(Project project, Team team, List<AgentDefinition> specialists,
                                            Map<String, String> toolNames) {
        if (specialists.isEmpty()) {
            return Prompts.composeUserPrompt(project, team);
        }
        String roster = specialists.stream()
                .map(s -> "- For %s sub-tasks → CALL the `%s` tool (specialist: %s).".formatted(
                        s.role(), toolNames.get(s.id()), s.name()))
                .reduce((a, b) -> a + "\n" + b)
                .orElse("");

        return """
                %s

                You are the orchestrator. Your goal is to ship a runnable deliverable: a single \
                self-contained `index.html` that runs in any modern browser. The user wants to PLAY \
                the result, not read about it.

                You do not write code yourself. You decompose the goal and CALL these specialist tools:
                %s

                You also have a `writeResult` tool. The Frontend specialist is REQUIRED to call \
                writeResult itself with a complete index.html and return the URL — your job is to \
                forward that URL to the user.

                Procedure (mandatory):
                1. Read the project goal. Identify the deliverable: an index.html for the requested app.
                2. Plan the build. Typically: architecture → frontend implementation → code review.
                3. CALL each specialist tool one at a time, in a sensible order — wait for each response \
                before the next. Do not describe what you would do; actually invoke the tools.
                4. EVERY specialist tool call SHOULD include a `reasoning` argument with: \
                `innerThought` (one short sentence: why this specialist now), `confidence` (high/medium/low), \
                and `memoryNotes` (key decisions to carry forward). This is shown to the user live.
                5. VERIFY the Frontend specialist's reply: it MUST contain a URL ending in `/index.html`. \
                If it returned prose instead (e.g. "I'll create..."), re-invoke the SAME Frontend \
                specialist AT MOST ONCE with a stricter query like: "STOP. Call writeResult NOW with \
                the complete self-contained index.html. Do not respond with prose. The user is waiting \
                for the URL." Do NOT re-invoke a third time — if that single retry still returns no \
                URL, immediately call `writeResult` yourself with the best implementation you can \
                produce inline and proceed to step 6. Never loop on a stubborn specialist.
                6. Your final reply MUST be a SHORT plain-text message containing: (a) the URL returned by \
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
     * Resolve a unique, Bedrock-legal tool name per specialist (id → name). Two specialists
     * sharing a name (or names that sanitize to the same string) would collide into one tool,
     * silently hiding one specialist from the orchestrator. On collision we suffix the agent
     * id, mirroring the MCP {@code server___tool} disambiguation convention. Iteration order
     * follows {@code specialistDefs}, so names are stable across runs.
     */
    private static Map<String, String> uniqueToolNames(List<AgentDefinition> specialists) {
        Map<String, String> byId = new LinkedHashMap<>();
        Set<String> used = new HashSet<>();
        for (AgentDefinition s : specialists) {
            String base = sanitize(s.name());
            String candidate = base;
            if (used.contains(candidate)) {
                candidate = sanitize(base + "_" + s.id());
                // Extremely defensive: if even the id-suffixed form clashes, append a counter.
                int n = 2;
                while (used.contains(candidate)) {
                    candidate = sanitize(base + "_" + s.id() + "_" + n++);
                }
            }
            used.add(candidate);
            byId.put(s.id(), candidate);
        }
        return byId;
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

    /**
     * Render an orchestrator's reasoning sidecar (raw JSON map from the lenient parser)
     * into a single message body, or {@code null} if no usable {@code innerThought}.
     * Mirrors the Spring AI Recipes
     * <a href="https://github.com/habuma/spring-ai-recipes/tree/main/tool-choice-explanation">tool-choice-explanation</a>
     * pattern using a hand-rolled record + lenient parsing (we're on Spring AI 1.1.6,
     * which predates {@code AugmentedToolCallbackProvider}).
     */
    @SuppressWarnings("unchecked")
    private static String renderReasoning(Object raw) {
        if (!(raw instanceof Map<?, ?> wild)) return null;
        Map<String, Object> m = (Map<String, Object>) wild;
        Object thought = m.get("innerThought");
        if (thought == null || String.valueOf(thought).isBlank()) return null;
        StringBuilder sb = new StringBuilder(String.valueOf(thought).strip());
        Object conf = m.get("confidence");
        if (conf != null && !String.valueOf(conf).isBlank()) {
            sb.append(" [confidence: ").append(String.valueOf(conf).strip()).append("]");
        }
        Object notes = m.get("memoryNotes");
        if (notes instanceof java.util.List<?> l && !l.isEmpty()) {
            sb.append("\nNotes: ");
            sb.append(l.stream().map(String::valueOf).reduce((a, b) -> a + "; " + b).orElse(""));
        }
        return sb.toString();
    }
}
