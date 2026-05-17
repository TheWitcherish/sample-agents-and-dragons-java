package com.witcherish.samples.agents.patterns;

import com.witcherish.samples.agents.api.dto.AgentDefinition;
import com.witcherish.samples.agents.api.dto.Config;
import com.witcherish.samples.agents.api.dto.Project;
import com.witcherish.samples.agents.api.dto.Team;
import com.witcherish.samples.agents.core.AgentFactory;
import com.witcherish.samples.agents.tools.TaskTools;
import com.fasterxml.jackson.core.json.JsonReadFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import com.witcherish.samples.agents.tools.WriteResultTool;
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

/**
 * Orchestrator pattern (a.k.a. "Agents as Tools") — the canonical supervisor-topology
 * multi-agent pattern from the Strands Agents documentation.
 *
 * <p>The entrypoint agent is the <em>orchestrator</em>: it routes user intent to the
 * right specialist, then composes their outputs into a single answer. Every other
 * agent in the team is a <em>specialist</em>, wrapped as a tool the orchestrator can
 * call. Specialists never see each other; the orchestrator drives the flow.
 *
 * <p>This implementation follows three rules from the Strands doctrine:
 * <ol>
 *   <li><strong>Orchestrator routes, doesn't reason about the domain.</strong>
 *       Its prompt is augmented with an explicit routing table (one bullet per
 *       specialist) so the LLM has hard signposts to dispatch on.</li>
 *   <li><strong>Specialists stay narrow.</strong> Each keeps its own system prompt and
 *       only sees {@code TaskTools}. They cannot delegate further — the topology is
 *       a tree, not an arbitrary graph.</li>
 *   <li><strong>Tool wrappers describe the specialist's expertise.</strong> The
 *       tool description is built from the agent's {@code name} + {@code role}, so
 *       the LLM has a domain hint, not a generic "delegate to X" string. Errors are
 *       caught and returned as a formatted string so one specialist failure doesn't
 *       blow up the whole run.</li>
 * </ol>
 *
 * <p>Wire-side: dispatched on {@code team.pattern == "orchestrator"}.
 *
 * @see <a href="https://strandsagents.com/docs/user-guide/concepts/multi-agent/agents-as-tools/">Strands — Agents as Tools</a>
 */
@Component
public class OrchestratorPattern {

    private static final Logger log = LoggerFactory.getLogger(OrchestratorPattern.class);

    /**
     * Lenient ObjectMapper for tool-input parsing. Bedrock occasionally emits raw newlines
     * inside tool argument strings (when the LLM packs multi-line content like HTML); the
     * default Spring AI mapper rejects those. Enabling ALLOW_UNESCAPED_CONTROL_CHARS lets
     * us tolerate them. This mapper is only used inside the specialist tool callbacks.
     */
    private static final ObjectMapper LENIENT_TOOL_INPUT = JsonMapper.builder()
            .enable(JsonReadFeature.ALLOW_UNESCAPED_CONTROL_CHARS)
            .build();

    /** JSON Schema describing the single-string input the orchestrator passes to a specialist. */
    private static final String DELEGATE_INPUT_SCHEMA = """
            {
              "type": "object",
              "properties": {
                "query": {
                  "type": "string",
                  "description": "The sub-task to delegate, in natural language."
                }
              },
              "required": ["query"]
            }
            """;

    private final AgentFactory factory;
    private final TaskTools taskTools;
    private final WriteResultToolFactory writeResultToolFactory;

    public OrchestratorPattern(AgentFactory factory, TaskTools taskTools,
                               WriteResultToolFactory writeResultToolFactory) {
        this.factory = factory;
        this.taskTools = taskTools;
        this.writeResultToolFactory = writeResultToolFactory;
    }

    public PatternResult run(Project project, Team team, Config config) {
        AgentDefinition orchestratorDef = team.agents().stream()
                .filter(a -> a.id().equals(team.entrypoint()))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException(
                        "entrypoint agent " + team.entrypoint() + " not found in team.agents"));

        List<AgentDefinition> specialistDefs = team.agents().stream()
                .filter(a -> !a.id().equals(team.entrypoint()))
                .toList();

        if (specialistDefs.isEmpty()) {
            log.warn("[orchestrator] no specialists provided — falling back to a single-agent answer");
        }

        // Per-request write_result tool — projectId-scoped, persists the deliverable to S3
        // (or a local file if no bucket was supplied). Exposed via asToolCallback() to
        // bypass MethodToolCallback's strict JSON parser, which can choke on raw newlines
        // inside multi-line HTML the LLM sometimes passes through tool arguments.
        WriteResultTool writeResult = writeResultToolFactory.build(project, config);
        ToolCallback writeResultCallback = writeResult.asToolCallback();

        // 1) Build each specialist with TaskTools + write_result. Specialists may write
        // intermediate or final deliverables; the orchestrator will instruct who does it.
        List<ToolCallback> specialistTools = new ArrayList<>();
        for (AgentDefinition spec : specialistDefs) {
            ChatClient specialistClient = factory.buildOne(spec, project,
                    List.of(taskTools),
                    List.of(writeResultCallback));
            specialistTools.add(asTool(spec, specialistClient));
        }

        // 2) Build the orchestrator with TaskTools + write_result + every specialist wrapped as a ToolCallback.
        List<ToolCallback> orchestratorCallbacks = new ArrayList<>(specialistTools);
        orchestratorCallbacks.add(writeResultCallback);
        ChatClient orchestrator = factory.buildOne(orchestratorDef, project,
                List.of(taskTools), orchestratorCallbacks);

        String userPrompt = composeOrchestratorPrompt(project, team, specialistDefs);
        log.info("[orchestrator] entrypoint={} specialists={}",
                orchestratorDef.name(), specialistDefs.size());

        String answer = orchestrator.prompt().user(userPrompt).call().content();

        List<String> participants = new ArrayList<>();
        participants.add(orchestratorDef.id());
        specialistDefs.forEach(a -> participants.add(a.id()));

        return new PatternResult("COMPLETED", "orchestrator", orchestratorDef.id(), answer, participants);
    }

    /**
     * Wrap one specialist {@link ChatClient} as a {@link ToolCallback} the orchestrator can call.
     *
     * <p>We implement {@link ToolCallback} directly (instead of using
     * {@code FunctionToolCallback.builder}) so we can parse the tool input with a
     * lenient {@link ObjectMapper} that tolerates raw newlines — Bedrock sometimes
     * emits those when packing multi-line content into tool arguments, and the default
     * Spring AI parser rejects them.
     *
     * <p>Mirrors the Strands {@code @tool}-decorated function: a single {@code query}
     * string in, a string out, errors swallowed into a formatted message so the
     * orchestrator sees them and can decide what to do rather than the whole run blowing up.
     */
    private ToolCallback asTool(AgentDefinition def, ChatClient specialistClient) {
        String toolName = sanitize(def.name());
        // Strands-style tool description: what the specialist DOES, not how to call it.
        String description = String.format(
                "Process and respond to %s-related sub-tasks. Use this tool whenever the project requires "
                        + "%s expertise. Provide a single 'query' string describing the sub-task; the tool returns "
                        + "the specialist's answer as text.",
                def.role(), def.role());

        ToolDefinition definition = ToolDefinition.builder()
                .name(toolName)
                .description(description)
                .inputSchema(DELEGATE_INPUT_SCHEMA)
                .build();

        return new ToolCallback() {
            @Override
            public ToolDefinition getToolDefinition() {
                return definition;
            }

            @Override
            public String call(String toolInput) {
                try {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> parsed = LENIENT_TOOL_INPUT.readValue(toolInput, Map.class);
                    Object q = parsed.get("query");
                    String query = (q == null) ? "" : q.toString();
                    if (query.isBlank()) {
                        return "Error in " + def.name() + " (" + def.role()
                                + "): missing or empty 'query' parameter.";
                    }
                    String reply = specialistClient.prompt().user(query).call().content();
                    return sanitizeForToolResult(reply);
                } catch (Exception e) {
                    log.warn("[orchestrator] specialist '{}' raised: {}", def.name(), e.toString());
                    return "Error in " + def.name() + " (" + def.role() + "): " + e.getMessage();
                }
            }
        };
    }

    /**
     * Build the user prompt sent to the orchestrator. Layers, in order:
     * <ol>
     *   <li>The standard {@link Prompts#composeUserPrompt(Project, Team) project + team} prompt.</li>
     *   <li>An explicit <em>routing table</em> — one bullet per specialist with name + role —
     *       mirroring the canonical orchestrator prompt from the Strands docs.</li>
     *   <li>Composition guidance: synthesise outputs into a single final answer.</li>
     * </ol>
     */
    private static String composeOrchestratorPrompt(Project project, Team team, List<AgentDefinition> specialists) {
        StringBuilder sb = new StringBuilder(Prompts.composeUserPrompt(project, team));

        if (!specialists.isEmpty()) {
            sb.append("\n\nYou are the orchestrator. Your goal is to ship a runnable deliverable: a single ")
              .append("self-contained `index.html` file that runs in any modern browser. The user wants to PLAY ")
              .append("the result, not read about it.\n\n")
              .append("You do not write code yourself. You decompose the goal and CALL these specialist tools:\n");
            for (AgentDefinition s : specialists) {
                sb.append("- For ")
                  .append(s.role())
                  .append(" sub-tasks → CALL the `")
                  .append(sanitize(s.name()))
                  .append("` tool (it embeds the ")
                  .append(s.name())
                  .append(" specialist).\n");
            }
            sb.append("\nYou also have a `writeResult` tool. The Frontend specialist will normally call it itself ")
              .append("and return you a URL — your job in that case is just to forward that URL to the user.\n")
              .append("\nProcedure (mandatory):\n")
              .append("1. Read the project goal. Identify the deliverable: an index.html for the requested app.\n")
              .append("2. Plan the build. Typically: architecture → frontend implementation → code review.\n")
              .append("3. CALL each specialist tool one at a time, in a sensible order — wait for each response ")
              .append("before the next. Do not describe what you would do; actually invoke the tools.\n")
              .append("4. The Frontend specialist returns a URL — that URL is the deliverable.\n")
              .append("5. Your final reply MUST be a SHORT plain-text message containing: (a) the URL returned by ")
              .append("the Frontend specialist (or writeResult), (b) a one-paragraph summary of what was built. ")
              .append("Keep it under 150 words. NO markdown bullets, NO multi-line code blocks, NO HTML — ")
              .append("just plain prose. The user opens the URL to play the deliverable.");
        }
        return sb.toString();
    }

    /** Bedrock tool names must match {@code [a-zA-Z0-9_-]+}. Strip everything else. */
    private static String sanitize(String name) {
        return name.replaceAll("[^a-zA-Z0-9_-]", "_");
    }

    /**
     * Specialist replies are returned to Bedrock as tool_result messages. The Bedrock
     * Converse request builder in Spring AI 1.1.3 round-trips the result through a
     * strict {@code ObjectMapper.readValue(String, Map.class)} that rejects raw
     * control characters embedded in markdown bullets / code. We strip the worst
     * offenders here — the orchestrator only needs a *summary* to integrate, never the
     * raw markdown. Newlines collapse to spaces so the response stays readable as one
     * paragraph; tabs go away entirely.
     */
    private static String sanitizeForToolResult(String reply) {
        if (reply == null) return "";
        return reply
                .replaceAll("[\\t\\f\\r]", " ")
                .replace('\n', ' ')
                .replaceAll(" +", " ")
                .trim();
    }
}
