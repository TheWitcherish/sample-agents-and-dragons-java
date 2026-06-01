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
import com.witcherish.samples.agents.tools.WriteResultTool;
import com.witcherish.samples.agents.tools.WriteResultToolFactory;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.ai.tool.definition.ToolDefinition;
import org.springframework.ai.tool.metadata.ToolMetadata;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
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
     * How many extra turns we grant an implementer (Frontend) peer that ends its turn without
     * having produced a complete {@code index.html}. A weak junior model often hands off with
     * prose or a stub instead of the document; "took a turn" must not count as "delivered the
     * artefact". The HTML-readiness gate (see {@link #run}) bounces control back to the
     * implementer up to this many times before escalating to a code-capable peer.
     */
    private static final int MAX_BUILD_RETRIES = 2;

    /**
     * Ping-pong detection — the safety net that fires when peers loop on each other
     * without making progress (e.g. Architect → Reviewer → Architect → Reviewer …).
     * Mirrors Strands' {@code repetitive_handoff_detection_window} +
     * {@code repetitive_handoff_min_unique_agents}. If the last {@value} peers in
     * {@code nodeHistory} contain fewer than {@link #PING_PONG_MIN_UNIQUE} distinct
     * agents, the swarm stops with the most recent reply as the final answer.
     *
     * <p>Strands defaults this to disabled (window=0). We default to <em>enabled</em>
     * because a stream demo benefits from showing the guard fire when an LLM falls into
     * a loop — pedagogy beats the slight loss of "let it run forever" flexibility.
     */
    private static final int PING_PONG_WINDOW = 4;
    private static final int PING_PONG_MIN_UNIQUE = 3;

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
                "context":    { "type": "string", "description": "The running deliverable to share with the next agent. If you produced or corrected the index.html, paste the COMPLETE document here (doctype to </html>) — this is the only channel that carries your code to the next peer. Otherwise share your spec / review notes as plain text." }
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
        WriteResultTool writeResultTool = writeResultToolFactory.build(project, config, telemetry);
        ToolCallback writeResult = writeResultTool.asToolCallback();
        var taskTools = taskToolsFactory.build(project.id(), telemetry);

        // The whole reason this pattern exists is to show the WHOLE team collaborate. Left
        // to its own devices a capable model will have the entrypoint build-and-ship on turn
        // one (1 agent) or architect→frontend then stop (2 agents), so the other specialists
        // never light up. `consulted` tracks which peers have actually taken a turn; the
        // ShipGate refuses writeResult until that set covers the entire roster, and the loop
        // forces a handoff to the next unconsulted peer whenever an agent tries to finish early.
        Set<String> consulted = new LinkedHashSet<>();
        ShipGate shipGate = new ShipGate(writeResult, team.agents(), consulted);
        ToolCallback gatedWriteResult = shipGate.asToolCallback();

        // Build one BuiltAgent per agent (ChatClient + advisor). Each agent's tool surface =
        // TaskTools, the gated writeResult, and a per-agent handoff_to_agent tool (Strands
        // injects this automatically). The advisor lets us publish per-peer token/cycle counts
        // when the peer's turn ends.
        Map<String, BuiltAgent> built = new LinkedHashMap<>();
        for (AgentDefinition def : team.agents()) {
            ToolCallback handoffTool = buildHandoffTool(def, defsByName, handoff);
            boolean isEntry = def.id().equals(entrypointDef.id());
            // Layer 1: shape each peer with its role contract + swarm-peer pattern epilogue.
            // The entrypoint gets the coordinator epilogue (route first, ship last) which
            // deliberately overrides any role-level "your ONLY output is writeResult" rule.
            // Layer 2: the entrypoint also gets SINGLE_HANDOFF_INSTRUCTION (Strands quirk —
            // multiple handoffs in one turn collapse to the last one).
            AgentDefinition shaped = RoleContracts.shape(def, RoleContracts.Pattern.SWARM, isEntry);
            if (isEntry) {
                shaped = new AgentDefinition(shaped.id(), shaped.name(), shaped.model(),
                        shaped.prompt() + SINGLE_HANDOFF_INSTRUCTION,
                        shaped.role(), shaped.tools());
            }
            built.put(def.id(), factory.buildOne(shaped, project, telemetry,
                    List.of(taskTools), List.of(gatedWriteResult, handoffTool)));
        }

        // Whoever ships the deliverable once the roster is exhausted. Prefer a Frontend UI
        // peer (its role contract ends in a writeResult call); fall back to the entrypoint.
        AgentDefinition shipper = team.agents().stream()
                .filter(a -> a.role() != null && a.role().toLowerCase().contains("frontend"))
                .findFirst()
                .orElse(entrypointDef);

        // Keyed by id (defsByName above is keyed by sanitised name, for handoff target
        // lookup). The loop needs id-keyed access for forced routing through unconsulted peers.
        Map<String, AgentDefinition> defsById = new LinkedHashMap<>();
        team.agents().forEach(a -> defsById.put(a.id(), a));

        String task = Prompts.composeUserPrompt(project, team);
        List<String> nodeHistory = new ArrayList<>();
        Map<String, String> sharedKnowledge = new LinkedHashMap<>();
        // Server-side single-slot holder for the run's current index.html — the same
        // mechanism OrchestratorPattern (HtmlHolder) and GraphPattern (findHtmlOutput) use.
        // The swarm's only inter-peer channel is the handoff `context` field, which the LLM
        // is unreliable about filling with a full document. So we ALSO scan every peer's
        // reply and handoff context for a complete HTML document and capture it here; the
        // latest capture wins (the reviewer's correction overwrites the Frontend's draft).
        // composeNodeInput injects this holder so the reviewer always sees real code to fix.
        HtmlHolder htmlHolder = new HtmlHolder();

        AgentDefinition current = entrypointDef;
        String pendingMessage = null;            // null on first turn, set by handoff after that
        String finalAnswer = "";
        int iterations = 0;
        int handoffCount = 0;
        int shipNudges = 0;                      // bounded retries to coax the shipper to ship
        int buildRetries = 0;                    // bounded retries to make the implementer actually build the HTML

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
                    sharedKnowledge, pendingMessage, consulted, htmlHolder.get());
            log.info("[swarm] iter={} running={} ({})", iterations, current.name(), current.id());

            handoff.reset();
            BuiltAgent peer = built.get(current.id());
            // WORKING reflects the peer's running totals — important when a peer takes
            // multiple turns (re-handoff back to it) so the card never resets to zero.
            telemetry.saveAgentState(project.id(), current.id(), current.name(), "WORKING",
                    peer.advisor().cycleCount(), peer.advisor().messageCount(),
                    peer.advisor().inputTokens(), peer.advisor().outputTokens(),
                    peer.advisor().totalTokens(),
                    peer.advisor().totalLatencyMs());
            String reply = peer.client().prompt().user(userPrompt).call().content();

            // This peer's model turns are streamed to the Adventure Log by its own
            // EventCaptureAdvisor, once per tool-calling cycle (including the handoff turn's
            // closing prose). The collapsed final reply is already persisted, so we don't
            // re-save it here.
            // STOPPED also uses the running total. If the peer is re-invoked after a
            // handoff cycle, both turns' tokens and latency stay visible.
            telemetry.saveAgentState(project.id(), current.id(), current.name(), "STOPPED",
                    peer.advisor().cycleCount(), peer.advisor().messageCount(),
                    peer.advisor().inputTokens(), peer.advisor().outputTokens(),
                    peer.advisor().totalTokens(),
                    peer.advisor().totalLatencyMs());

            // Capture an HTML deliverable from BOTH channels this peer could have used:
            //  (1) its reply text (the Frontend dev implements index.html; a fix-capable
            //      reviewer returns the corrected document), and
            //  (2) the handoff `context` field (the LLM-driven, intended channel).
            // Latest capture wins, and context beats reply when both are present (it's the
            // deliberate channel). We capture BEFORE marking the peer consulted so the
            // HTML-readiness gate below can tell whether an implementer actually built anything.
            String htmlFromReply = extractHtml(reply);
            if (htmlFromReply != null) {
                htmlHolder.set(htmlFromReply);
                log.info("[swarm] captured index.html ({} chars) from {}'s reply",
                        htmlFromReply.length(), current.name());
            }
            String htmlFromContext = handoff.requested ? extractHtml(handoff.context) : null;
            if (htmlFromContext != null) {
                htmlHolder.set(htmlFromContext);
                log.info("[swarm] captured index.html ({} chars) from {}'s handoff context",
                        htmlFromContext.length(), current.name());
            }
            boolean producedHtmlThisTurn = htmlFromReply != null || htmlFromContext != null;

            // HTML-READINESS GATE. "Took a turn" is not "delivered the artefact". An
            // implementer (Frontend) peer that ends its turn without any complete index.html
            // anywhere in the run is not done — a weak junior model often hands off with prose
            // or a stub. Bounce control straight back to it with an explicit build order, up to
            // MAX_BUILD_RETRIES times, BEFORE marking it consulted. If it still hasn't built
            // after that, escalate to a code-capable peer (reviewer / CTO / analyst) that can
            // build the index.html from the spec, so the swarm never reaches the reviewer with
            // an empty deliverable (the "no actual implementation code was included" failure).
            if (isImplementer(current) && htmlHolder.get() == null) {
                if (buildRetries < MAX_BUILD_RETRIES) {
                    buildRetries++;
                    log.warn("[swarm] iter={} {} (implementer) produced no index.html — build retry {}/{}",
                            iterations, current.name(), buildRetries, MAX_BUILD_RETRIES);
                    handoff.reset();
                    pendingMessage = "You ended your turn WITHOUT delivering the index.html. The "
                            + "deliverable does not exist yet — there is no code for anyone to "
                            + "review or ship. You MUST now write the COMPLETE, runnable index.html "
                            + "(doctype to </html>, all CSS/JS inline, every feature implemented, no "
                            + "placeholders). Do NOT hand off and do NOT call writeResult until the "
                            + "full document exists. Output the entire index.html now.";
                    continue;  // re-run the SAME implementer; do not advance, do not mark consulted
                }
                AgentDefinition builder = codeCapablePeer(team, current, consulted);
                if (builder != null) {
                    log.warn("[swarm] iter={} {} failed to build index.html after {} retries — "
                            + "escalating build to {}", iterations, current.name(), buildRetries, builder.name());
                    consulted.add(current.id());  // the junior had its chances; don't loop on it
                    telemetry.saveAgentTransition(project.id(), UUID.randomUUID().toString(),
                            current.id(), builder.id());
                    pendingMessage = "The Frontend developer could not deliver a working index.html. "
                            + "You are code-capable: BUILD the complete, runnable index.html yourself "
                            + "from the brief and any spec in shared knowledge (doctype to </html>, all "
                            + "CSS/JS inline, every feature implemented, no placeholders), then hand off "
                            + "to the next peer with the COMPLETE document in the `context` field.";
                    current = builder;
                    continue;
                }
                // No code-capable peer left to escalate to — fall through and let the run
                // proceed; the persist-at-end + ShipGate still apply.
                log.warn("[swarm] iter={} {} produced no index.html and no code-capable peer remains",
                        iterations, current.name());
            }

            // This peer has now contributed — record it so the ShipGate and the
            // forced-routing logic below can tell who is still missing from the roster.
            consulted.add(current.id());

            if (!handoff.requested) {
                // The agent ended its turn without handing off. Before we accept its reply
                // as the quest's final answer, make sure the WHOLE team has contributed —
                // that's the point of the swarm. If peers remain unconsulted, force control
                // to the next one (a fresh turn, which also sidesteps the returnDirect quirk
                // that prevents re-prompting in the same turn).
                AgentDefinition nextUnconsulted = team.agents().stream()
                        .filter(a -> !consulted.contains(a.id()))
                        .findFirst()
                        .orElse(null);
                if (nextUnconsulted != null) {
                    log.info("[swarm] iter={} {} tried to finish but {} peer(s) unconsulted — routing to {}",
                            iterations, current.name(),
                            team.agents().size() - consulted.size(), nextUnconsulted.name());
                    if (reply != null && !reply.isBlank()) {
                        // carry the WIP forward — but if it was HTML it's already in the
                        // holder, so store a pointer rather than duplicating the document.
                        sharedKnowledge.put(current.name(), htmlFromReply != null
                                ? "delivered a complete index.html — see the current index.html below."
                                : reply);
                    }
                    telemetry.saveAgentTransition(project.id(), UUID.randomUUID().toString(),
                            current.id(), nextUnconsulted.id());
                    pendingMessage = "Continue the quest. Previous agent (" + current.name()
                            + ") produced the work in shared knowledge. Do your specialist part, "
                            + "then hand off to the next peer.";
                    current = nextUnconsulted;
                    continue;
                }
                // Every peer has contributed but nobody shipped. If the shipper hasn't been
                // given its final turn yet, route to it once to call writeResult (now that
                // the gate is open). Bounded by shipNudges so a stubborn model can't loop.
                if (!current.id().equals(shipper.id()) && shipNudges < 2) {
                    shipNudges++;
                    log.info("[swarm] roster exhausted, no deliverable yet — routing to shipper {} (nudge {})",
                            shipper.name(), shipNudges);
                    if (reply != null && !reply.isBlank()) {
                        sharedKnowledge.put(current.name(), htmlFromReply != null
                                ? "delivered a complete index.html — see the current index.html below."
                                : reply);
                    }
                    telemetry.saveAgentTransition(project.id(), UUID.randomUUID().toString(),
                            current.id(), shipper.id());
                    pendingMessage = "Every peer has contributed. You are the shipper: assemble the "
                            + "final deliverable from the shared knowledge and call writeResult now.";
                    current = shipper;
                    continue;
                }
                // Whole team consulted (and shipper had its turn) — accept the final answer.
                log.info("[swarm] iter={} {} produced final answer (no handoff, roster complete)",
                        iterations, current.name());
                finalAnswer = reply == null ? "" : reply;
                break;
            }

            handoffCount++;
            if (handoffCount > MAX_HANDOFFS) {
                log.warn("[swarm] handoff cap ({}) reached — stopping with last reply", MAX_HANDOFFS);
                finalAnswer = reply == null ? "" : reply;
                break;
            }

            // Ping-pong guard: if the last PING_PONG_WINDOW peers contain fewer than
            // PING_PONG_MIN_UNIQUE distinct agents, peers are bouncing on each other
            // without making progress. Stop early instead of burning the full handoff
            // budget on a loop. Mirrors Strands' repetitive-handoff detection.
            if (nodeHistory.size() >= PING_PONG_WINDOW) {
                long uniqueRecent = nodeHistory.subList(nodeHistory.size() - PING_PONG_WINDOW, nodeHistory.size())
                        .stream().distinct().count();
                if (uniqueRecent < PING_PONG_MIN_UNIQUE) {
                    log.warn("[swarm] ping-pong detected ({} unique in last {}) — stopping",
                            uniqueRecent, PING_PONG_WINDOW);
                    finalAnswer = reply == null ? "" : reply;
                    break;
                }
            }

            AgentDefinition next = defsByName.get(handoff.targetName);
            if (next == null) {
                log.warn("[swarm] {} requested handoff to unknown agent '{}' — stopping", current.name(), handoff.targetName);
                finalAnswer = reply == null ? "" : reply;
                break;
            }
            if (handoff.context != null && !handoff.context.isBlank()) {
                // The handoff context was already scanned for HTML above (and captured into the
                // holder if present). Here we only update sharedKnowledge: if it was a complete
                // index.html, pass a short pointer instead of duplicating the document — the
                // receiving peer gets the real HTML via the dedicated "Current index.html" block
                // composeNodeInput injects from htmlHolder. Otherwise carry the notes verbatim.
                if (htmlFromContext != null) {
                    sharedKnowledge.put(current.name(),
                            "delivered a complete index.html (" + htmlFromContext.length()
                            + " chars) — see the current index.html below.");
                } else {
                    sharedKnowledge.put(current.name(), handoff.context);
                }
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
        // Persist the captured deliverable. The shipper's gated writeResult call may already
        // have written it, but capturing the latest HTML server-side and writing it here is
        // the reliable path: it guarantees the corrected index.html ships even when the model
        // ends with prose, hits a cap, or trips the ping-pong guard. Mirrors GraphPattern and
        // OrchestratorPattern, which both persist server-side rather than trusting the model.
        String html = htmlHolder.get();
        if (html != null && !html.isBlank()) {
            String url = persistDeliverable(writeResultTool, html);
            if (url != null && !finalAnswer.contains(url)) {
                finalAnswer = "Deliverable: " + url + "\n\n" + finalAnswer;
            }
        }

        // defsById (keyed by id) was built before the loop for forced-routing lookups;
        // reused here for PatternResult.
        QuestResult structured = structuredAnswer.coerce(finalAnswer);
        return PatternResult.from("swarm", entrypointDef.id(), finalAnswer, participants,
                defsById, built, structured);
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
                                           String pendingMessage,
                                           Set<String> consulted,
                                           String currentHtml) {
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
        // The actual running deliverable, captured server-side from whichever peer last
        // produced or corrected it. This is what makes the reviewer's job possible: it
        // ALWAYS sees the real index.html source here, never just a spec. A peer that
        // implements or corrects the HTML must paste the COMPLETE updated document into
        // its handoff `context` so this block reflects its work for the next peer.
        if (currentHtml != null && !currentHtml.isBlank()) {
            sb.append("--- Current index.html (the running deliverable — review/fix THIS) ---\n");
            sb.append(currentHtml).append("\n");
            sb.append("--- end index.html ---\n\n");
        }
        sb.append("Other agents available for collaboration:\n");
        defsByName.values().stream()
                .filter(d -> !d.id().equals(current.id()))
                .forEach(d -> sb.append("- ").append(sanitize(d.name()))
                        .append(" (").append(d.role()).append("): ")
                        .append(d.name()).append('\n'));

        // The routing driver: list the peers who have NOT yet taken a turn. The prompts
        // (RoleContracts swarm epilogues) instruct agents to hand off to one of these while
        // the list is non-empty, and the ShipGate enforces it by rejecting writeResult.
        List<String> notConsulted = defsByName.values().stream()
                .filter(d -> !consulted.contains(d.id()))
                .filter(d -> !d.id().equals(current.id()))
                .map(d -> sanitize(d.name()))
                .toList();
        sb.append('\n');
        if (notConsulted.isEmpty()) {
            sb.append("ALL peers have now contributed. The team is complete — the deliverable "
                    + "may be shipped. If you are the shipper, ship the Current index.html above "
                    + "by calling writeResult with that complete document as `content` now. "
                    + "Otherwise reply with the final answer.");
        } else {
            sb.append("Peers NOT yet consulted (you MUST hand off to one of these before the "
                    + "quest can ship): ").append(String.join(", ", notConsulted)).append(".\n");
            sb.append("Do your specialist part, then call handoff_to_agent to one of the "
                    + "unconsulted peers. If you produced or corrected the index.html, paste the "
                    + "COMPLETE document (doctype to </html>) into the `context` field so the next "
                    + "peer receives your code; otherwise share your spec / notes in `context`. Do "
                    + "NOT call writeResult yet — it will be rejected until every peer has contributed.");
        }
        return sb.toString();
    }

    /** Bedrock tool names must match {@code [a-zA-Z0-9_-]+}. */
    private static String sanitize(String name) {
        return name.replaceAll("[^a-zA-Z0-9_-]", "_");
    }

    /**
     * True if this peer's job is to PRODUCE the {@code index.html} (a Frontend UI Developer).
     * Implementers are held to the HTML-readiness gate: ending a turn without a complete
     * document means the deliverable doesn't exist yet, so the swarm must not advance.
     */
    private static boolean isImplementer(AgentDefinition def) {
        return def.role() != null && def.role().toLowerCase(Locale.ROOT).contains("frontend");
    }

    /**
     * Pick a still-unconsulted peer that can BUILD the HTML from a spec when the implementer
     * fails — a Code Reviewer, Performance Analyst, or Hands-On CTO (all fix-/code-capable per
     * their swarm role contracts). Falls back to {@code null} if none remain, in which case the
     * run proceeds and the persist-at-end / ShipGate safety nets still apply.
     */
    private static AgentDefinition codeCapablePeer(Team team, AgentDefinition current, Set<String> consulted) {
        return team.agents().stream()
                .filter(a -> !a.id().equals(current.id()))
                .filter(a -> !consulted.contains(a.id()))
                .filter(a -> {
                    String role = a.role() == null ? "" : a.role().toLowerCase(Locale.ROOT);
                    return role.contains("reviewer") || role.contains("performance")
                            || role.contains("cto") || role.contains("engineer")
                            || role.contains("developer");
                })
                .findFirst()
                .orElse(null);
    }

    private static String summarize(String s) {
        if (s == null) return "";
        String oneLine = s.replace('\n', ' ').strip();
        return oneLine.length() <= 120 ? oneLine : oneLine.substring(0, 120) + "…";
    }

    /**
     * If {@code text} CONTAINS a complete HTML document, return the clean source; otherwise
     * {@code null}. Capable models routinely narrate before they build ("Now I'll implement
     * the game:") and then emit the document, so we locate the {@code <!doctype html>}/{@code
     * <html>} marker ANYWHERE in the reply — a start-anchored check would miss prose-prefixed
     * HTML and falsely report "no index.html". Trailing chatter after {@code </html>} (and any
     * closing ``` fence) is trimmed too.
     * Identical tolerance to {@link OrchestratorPattern#extractHtml} and
     * {@link GraphPattern#findHtmlOutput} — kept local so the swarm has no cross-pattern dep.
     */
    private static String extractHtml(String text) {
        if (text == null) return null;
        String lower = text.toLowerCase(Locale.ROOT);
        int start = lower.indexOf("<!doctype html");
        if (start < 0) start = lower.indexOf("<html");
        if (start < 0) return null;
        int closeTag = lower.lastIndexOf("</html>");
        int end = closeTag >= 0 ? closeTag + "</html>".length() : text.length();
        return text.substring(start, end).strip();
    }

    /**
     * Persist the captured HTML via {@link WriteResultTool}, returning the URL on success or
     * {@code null} on failure. Mirrors {@link GraphPattern#persistDeliverable} — failure is
     * logged but never breaks the run; the swarm's text answer still returns.
     */
    private String persistDeliverable(WriteResultTool tool, String html) {
        try {
            String result = tool.writeResult(html, null);
            if (result.startsWith("Successfully wrote")) {
                int urlStart = result.lastIndexOf(' ');
                if (urlStart > 0) return result.substring(urlStart + 1);
            }
            log.warn("[swarm] writeResult did not return a success URL: {}", result);
            return null;
        } catch (Exception e) {
            log.error("[swarm] failed to persist final deliverable", e);
            return null;
        }
    }

    /**
     * Server-side single-slot holder for the run's current {@code index.html}. The Frontend
     * peer sets the initial HTML; a fix-capable Code Reviewer / Performance Analyst overwrites
     * it with their corrected version. Latest write wins, so the shipped artefact is the most
     * downstream correction. Accessed from the swarm's single controller thread (peers run
     * sequentially), but guarded with {@code synchronized} for safe publication.
     */
    private static final class HtmlHolder {
        private String html;

        synchronized void set(String value) { this.html = value; }

        synchronized String get() { return html; }
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

    /**
     * Wraps the real {@code writeResult} {@link ToolCallback} and gates it behind the
     * "whole team must contribute" rule. While any peer is still missing from
     * {@code consulted}, a {@code writeResult} call writes nothing and returns a message
     * telling the model to hand off instead. Once every peer has taken a turn, the call
     * passes straight through to the delegate.
     *
     * <p>The wrapper keeps the delegate's tool name ({@code writeResult}) and
     * {@code returnDirect=true} metadata, so the model's tool surface is identical to the
     * un-gated tool — the gate is invisible except for the rejection message.
     */
    private static final class ShipGate {
        private final ToolCallback delegate;
        private final List<AgentDefinition> roster;
        private final Set<String> consulted;

        ShipGate(ToolCallback delegate, List<AgentDefinition> roster, Set<String> consulted) {
            this.delegate = delegate;
            this.roster = roster;
            this.consulted = consulted;
        }

        ToolCallback asToolCallback() {
            ToolDefinition definition = delegate.getToolDefinition();
            ToolMetadata metadata = delegate.getToolMetadata();
            return new ToolCallback() {
                @Override public ToolDefinition getToolDefinition() { return definition; }
                @Override public ToolMetadata   getToolMetadata()   { return metadata; }
                @Override public String call(String toolInput) {
                    List<String> missing = roster.stream()
                            .filter(a -> !consulted.contains(a.id()))
                            .map(AgentDefinition::name)
                            .toList();
                    if (!missing.isEmpty()) {
                        log.info("[swarm] writeResult blocked — {} peer(s) not yet consulted: {}",
                                missing.size(), missing);
                        return "writeResult REJECTED: the quest is a team effort and these peers "
                                + "have not contributed yet: " + String.join(", ", missing)
                                + ". Call handoff_to_agent to pass control to one of them instead. "
                                + "Do NOT call writeResult again until every peer has taken a turn.";
                    }
                    return delegate.call(toolInput);
                }
            };
        }
    }
}
