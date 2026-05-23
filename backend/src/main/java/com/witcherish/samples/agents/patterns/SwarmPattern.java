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
import com.witcherish.samples.agents.telemetry.McpTelemetryPublisher.Session;
import com.witcherish.samples.agents.tools.TaskToolsFactory;
import com.witcherish.samples.agents.tools.WriteResultToolFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.ai.tool.definition.ToolDefinition;
import org.springframework.ai.tool.metadata.ToolMetadata;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Swarm pattern — a peer team of agents that hand off control to each other.
 *
 * <p>Mirrors the Python {@code strands.multiagent.Swarm}: every agent gets a
 * {@code handoff_to_agent(agent_name, message, context)} tool. An agent calls it to pass
 * control to a peer it judges better suited for the next step. When an agent ends its
 * turn <em>without</em> handing off, its reply is the swarm's final answer.
 *
 * <p>Differences from {@link OrchestratorPattern}: there a single boss decomposes work and
 * never lets specialists see each other; here every peer sees the full handoff history
 * and shared knowledge, so coordination emerges instead of being centrally planned.
 *
 * <p>Differences from {@link GraphPattern}: there the topology is fixed at JSON-time;
 * here it's discovered at runtime — any agent may hand off to any other.
 *
 * @see <a href="https://strandsagents.com/docs/user-guide/concepts/multi-agent/swarm/">Strands — Swarm</a>
 */
@Component
public class SwarmPattern {

    private static final Logger log = LoggerFactory.getLogger(SwarmPattern.class);

    /** Caps mirror the Python: {@code max_handoffs=20, max_iterations=20}. */
    private static final int MAX_HANDOFFS = 20;
    private static final int MAX_ITERATIONS = 20;

    /**
     * Identical to the {@code SINGLE_HANDOFF_INSTRUCTION} the Python swarm patches into
     * the entrypoint's system prompt. Strands' SDK has a quirk where, if an agent calls
     * {@code handoff_to_agent} multiple times in one turn, only the last one wins — so we
     * tell the entrypoint to stop after exactly one.
     */
    private static final String SINGLE_HANDOFF_INSTRUCTION =
            "\n\nCRITICAL SWARM RULE: You MUST call handoff_to_agent exactly ONCE per turn, "
            + "then STOP immediately (do not call any more tools or generate further text). "
            + "Never plan or execute multiple handoffs in the same turn. "
            + "Delegate to ONE agent at a time — that agent will hand off to the next agent when ready.";

    private static final String HANDOFF_INPUT_SCHEMA = """
            {
              "type": "object",
              "properties": {
                "agent_name": { "type": "string", "description": "Sanitised name (snake_case) of the peer agent to hand off to." },
                "message":    { "type": "string", "description": "Instructions for the next agent." },
                "context":    { "type": "string", "description": "Optional knowledge to share — short, factual, JSON or plain text." }
              },
              "required": ["agent_name", "message"]
            }
            """;

    private static final ObjectMapper LENIENT = JsonMapper.builder()
            .enable(JsonReadFeature.ALLOW_UNESCAPED_CONTROL_CHARS)
            .build();

    private final AgentFactory factory;
    private final TaskToolsFactory taskToolsFactory;
    private final WriteResultToolFactory writeResultToolFactory;
    private final StructuredAnswer structuredAnswer;

    public SwarmPattern(AgentFactory factory, TaskToolsFactory taskToolsFactory,
                        WriteResultToolFactory writeResultToolFactory,
                        StructuredAnswer structuredAnswer) {
        this.factory = factory;
        this.taskToolsFactory = taskToolsFactory;
        this.writeResultToolFactory = writeResultToolFactory;
        this.structuredAnswer = structuredAnswer;
    }

    public PatternResult run(Project project, Team team, Config config, Session telemetry) {
        // Index by sanitised name (the only handle the LLM sees in tool descriptions).
        Map<String, AgentDefinition> defsByName = new LinkedHashMap<>();
        for (AgentDefinition d : team.agents()) {
            defsByName.put(sanitize(d.name()), d);
        }
        AgentDefinition entrypointDef = team.agents().stream()
                .filter(a -> a.id().equals(team.entrypoint()))
                .findFirst()
                .orElseThrow(() -> new IllegalArgumentException(
                        "entrypoint agent " + team.entrypoint() + " not found in team.agents"));

        // Per-turn handoff signal. The handoff tool writes here; the loop reads here.
        HandoffState handoff = new HandoffState();
        // writeResult uses returnDirect=true (the default): the agent that calls it ends
        // its turn cleanly. Swarm topology must therefore put writeResult on whichever
        // agent ships last — earlier peers exchange HTML via handoff_to_agent context,
        // never via writeResult. This dodges Spring AI 1.1.3's strict-JSON quirk on
        // re-encoding multi-line tool inputs across turns.
        ToolCallback writeResult = writeResultToolFactory.build(project, config, telemetry).asToolCallback();
        var taskTools = taskToolsFactory.build(project.id(), telemetry);

        // Build one BuiltAgent per agent (ChatClient + advisor). Each agent's tool surface =
        // TaskTools, writeResult, and a per-agent handoff_to_agent tool (Strands injects
        // this automatically). The advisor lets us publish per-peer token/cycle counts
        // when the peer's turn ends.
        Map<String, BuiltAgent> built = new LinkedHashMap<>();
        for (AgentDefinition def : team.agents()) {
            ToolCallback handoffTool = buildHandoffTool(def, defsByName, handoff);
            // Layer 1: shape each peer with its role contract + swarm-peer pattern epilogue.
            // Layer 2: the entrypoint also gets SINGLE_HANDOFF_INSTRUCTION (Strands quirk —
            // multiple handoffs in one turn collapse to the last one).
            AgentDefinition shaped = RoleContracts.shape(def, RoleContracts.Pattern.SWARM, false);
            if (def.id().equals(entrypointDef.id())) {
                shaped = new AgentDefinition(shaped.id(), shaped.name(), shaped.model(),
                        shaped.prompt() + SINGLE_HANDOFF_INSTRUCTION,
                        shaped.role(), shaped.tools());
            }
            built.put(def.id(), factory.buildOne(shaped, project,
                    List.of(taskTools), List.of(writeResult, handoffTool)));
        }

        String task = Prompts.composeUserPrompt(project, team);
        List<String> nodeHistory = new ArrayList<>();
        Map<String, String> sharedKnowledge = new LinkedHashMap<>();

        AgentDefinition current = entrypointDef;
        String pendingMessage = null;            // null on first turn, set by handoff after that
        String finalAnswer = "";
        int iterations = 0;
        int handoffCount = 0;

        log.info("[swarm] entrypoint={} team={}", entrypointDef.name(),
                team.agents().stream().map(AgentDefinition::name).toList());

        // Pre-mark every peer as READY so the UI shows the whole swarm before turns start.
        for (AgentDefinition def : team.agents()) {
            telemetry.saveAgentState(project.id(), def.id(), def.name(), "READY",
                    0, 0, 0, 0, 0, 0L);
        }

        while (iterations < MAX_ITERATIONS) {
            iterations++;
            nodeHistory.add(current.name());
            String userPrompt = composeNodeInput(task, current, defsByName, nodeHistory,
                    sharedKnowledge, pendingMessage);
            log.info("[swarm] iter={} running={} ({})", iterations, current.name(), current.id());

            handoff.reset();
            BuiltAgent peer = built.get(current.id());
            telemetry.saveAgentState(project.id(), current.id(), current.name(), "WORKING",
                    peer.advisor().cycleCount(), peer.advisor().messageCount(),
                    peer.advisor().inputTokens(), peer.advisor().outputTokens(),
                    peer.advisor().totalTokens(), 0L);
            long turnStart = System.currentTimeMillis();
            String reply = peer.client().prompt().user(userPrompt).call().content();
            long turnElapsed = System.currentTimeMillis() - turnStart;

            telemetry.saveAgentMessage(project.id(), current.id(), "assistant", reply == null ? "" : reply);
            telemetry.saveAgentState(project.id(), current.id(), current.name(), "STOPPED",
                    peer.advisor().cycleCount(), peer.advisor().messageCount(),
                    peer.advisor().inputTokens(), peer.advisor().outputTokens(),
                    peer.advisor().totalTokens(), turnElapsed);

            if (!handoff.requested) {
                // Agent ended its turn without handing off — its reply is the final answer.
                log.info("[swarm] iter={} {} produced final answer (no handoff)", iterations, current.name());
                finalAnswer = reply == null ? "" : reply;
                break;
            }

            handoffCount++;
            if (handoffCount > MAX_HANDOFFS) {
                log.warn("[swarm] handoff cap ({}) reached — stopping with last reply", MAX_HANDOFFS);
                finalAnswer = reply == null ? "" : reply;
                break;
            }

            AgentDefinition next = defsByName.get(handoff.targetName);
            if (next == null) {
                log.warn("[swarm] {} requested handoff to unknown agent '{}' — stopping", current.name(), handoff.targetName);
                finalAnswer = reply == null ? "" : reply;
                break;
            }
            if (handoff.context != null && !handoff.context.isBlank()) {
                sharedKnowledge.put(current.name(), handoff.context);
            }
            log.info("[swarm] handoff #{} {} -> {} : {}", handoffCount, current.name(), next.name(),
                    summarize(handoff.message));
            telemetry.saveAgentTransition(project.id(), UUID.randomUUID().toString(), current.id(), next.id());

            pendingMessage = handoff.message;
            current = next;
        }

        if (iterations == MAX_ITERATIONS && handoff.requested) {
            log.warn("[swarm] iteration cap ({}) reached", MAX_ITERATIONS);
        }

        // Mirror Strands' result.node_history: the agents that actually ran, in order.
        Map<String, String> idByName = new LinkedHashMap<>();
        team.agents().forEach(a -> idByName.put(a.name(), a.id()));
        List<String> participants = nodeHistory.stream()
                .map(name -> idByName.getOrDefault(name, name))
                .toList();
        QuestResult structured = structuredAnswer.coerce(finalAnswer);
        return new PatternResult("COMPLETED", "swarm", entrypointDef.id(), finalAnswer, participants, structured);
    }

    /**
     * Per-agent {@code handoff_to_agent} tool. Each agent gets one whose description
     * lists the <em>other</em> peers (Strands' "available agents" hint). The tool mutates
     * {@link HandoffState} and returns immediately — {@code returnDirect=true} stops Spring
     * AI from looping the model for one more turn after the handoff.
     */
    private static ToolCallback buildHandoffTool(AgentDefinition self,
                                                 Map<String, AgentDefinition> defsByName,
                                                 HandoffState state) {
        String peers = defsByName.values().stream()
                .filter(d -> !d.id().equals(self.id()))
                .map(d -> "- %s (%s): %s".formatted(sanitize(d.name()), d.role(), d.name()))
                .reduce((a, b) -> a + "\n" + b)
                .orElse("(no peers)");
        String description = """
                Transfer control to another agent in the swarm for specialised help. \
                Provide the peer's sanitised name, a clear instruction for them, and any \
                useful context. After calling this tool you MUST stop — do not produce more \
                output. Available peers:
                %s""".formatted(peers);

        ToolDefinition definition = ToolDefinition.builder()
                .name("handoff_to_agent")
                .description(description)
                .inputSchema(HANDOFF_INPUT_SCHEMA)
                .build();
        ToolMetadata metadata = ToolMetadata.builder().returnDirect(true).build();

        return new ToolCallback() {
            @Override public ToolDefinition getToolDefinition() { return definition; }
            @Override public ToolMetadata   getToolMetadata()   { return metadata; }
            @Override public String call(String toolInput) {
                try {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> parsed = LENIENT.readValue(toolInput, Map.class);
                    String target = String.valueOf(parsed.getOrDefault("agent_name", "")).strip();
                    String message = String.valueOf(parsed.getOrDefault("message", "")).strip();
                    String context = parsed.get("context") == null ? "" : String.valueOf(parsed.get("context")).strip();
                    if (target.isBlank() || message.isBlank()) {
                        return "Error: handoff_to_agent requires non-empty 'agent_name' and 'message'.";
                    }
                    state.requested = true;
                    state.targetName = target;
                    state.message = message;
                    state.context = context;
                    return "Handoff to " + target + " accepted. Stop now.";
                } catch (Exception e) {
                    log.error("[swarm] handoff_to_agent parse failed", e);
                    return "Error parsing handoff_to_agent: " + com.witcherish.samples.agents.observer.Throwables.rootMessage(e);
                }
            }
        };
    }

    /**
     * Build the user prompt for the agent about to run, mirroring the formatted context
     * Strands' Python swarm passes to each receiving agent (see docs §5):
     * original task + handoff message + node history + shared knowledge + peer roster.
     */
    private static String composeNodeInput(String task, AgentDefinition current,
                                           Map<String, AgentDefinition> defsByName,
                                           List<String> nodeHistory,
                                           Map<String, String> sharedKnowledge,
                                           String pendingMessage) {
        StringBuilder sb = new StringBuilder();
        if (pendingMessage != null && !pendingMessage.isBlank()) {
            sb.append("Handoff Message: ").append(pendingMessage).append("\n\n");
        }
        sb.append("User Request: ").append(task).append("\n\n");
        if (nodeHistory.size() > 1) {
            // Show predecessors only; the last entry is the current agent itself.
            String chain = String.join(" -> ", nodeHistory.subList(0, nodeHistory.size() - 1));
            sb.append("Previous agents who worked on this: ").append(chain).append("\n\n");
        }
        if (!sharedKnowledge.isEmpty()) {
            sb.append("Shared knowledge from previous agents:\n");
            sharedKnowledge.forEach((agent, knowledge) ->
                    sb.append("- ").append(agent).append(": ").append(knowledge).append('\n'));
            sb.append('\n');
        }
        sb.append("Other agents available for collaboration:\n");
        defsByName.values().stream()
                .filter(d -> !d.id().equals(current.id()))
                .forEach(d -> sb.append("- ").append(sanitize(d.name()))
                        .append(" (").append(d.role()).append("): ")
                        .append(d.name()).append('\n'));
        sb.append("\nYou have access to swarm coordination tools if you need help from other agents. "
                + "If your turn finishes the task, reply with the final answer and DO NOT call handoff_to_agent.");
        return sb.toString();
    }

    /** Bedrock tool names must match {@code [a-zA-Z0-9_-]+}. */
    private static String sanitize(String name) {
        return name.replaceAll("[^a-zA-Z0-9_-]", "_");
    }

    private static String summarize(String s) {
        if (s == null) return "";
        String oneLine = s.replace('\n', ' ').strip();
        return oneLine.length() <= 120 ? oneLine : oneLine.substring(0, 120) + "…";
    }

    /** Per-turn mutable signal written by the handoff tool, read by the controller loop. */
    private static final class HandoffState {
        boolean requested;
        String targetName;
        String message;
        String context;

        void reset() {
            requested = false;
            targetName = null;
            message = null;
            context = null;
        }
    }
}
