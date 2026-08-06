package com.witcherish.samples.agents.patterns;

import com.witcherish.samples.agents.api.dto.AgentConnection;
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
import org.springframework.stereotype.Component;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * Graph pattern — a deterministic DAG of agents.
 *
 * <p>Mirrors the Python {@code GraphBuilder} from {@code strands.multiagent}: each agent
 * is a node, each {@link AgentConnection} is a directed edge, the team's entrypoint is
 * the root. Execution is topologically ordered with AND-style fan-in: a node fires only
 * once <em>every</em> direct predecessor has produced an output. Each node's prompt is
 * the original task plus a labelled block per upstream output — exactly the input
 * propagation Strands documents for graphs.
 *
 * <p><strong>Parallel sibling execution.</strong> Independent nodes (no shared dependency
 * chain) run concurrently on virtual threads. The implementation walks Kahn's topological
 * order in <em>batches</em>: every iteration finds the "ready set" — nodes whose
 * dependencies are all satisfied — and dispatches them to a virtual-thread executor
 * via {@link CompletableFuture#runAsync}. {@code allOf(...).join()} waits for the batch.
 * This matches Strands' {@code _execute_nodes_parallel} but stays sequential-looking on
 * the page thanks to JEP-444 virtual threads — no async/await colouring, no event queue.
 *
 * <p>Differences from {@link OrchestratorPattern}: there the LLM <em>chooses</em> who
 * runs next; here the <em>topology</em> chooses. That makes Graph the right primitive
 * when the workflow is known up front (research → analysis + fact-check → report).
 *
 * <h2>Spring AI Recipes alignment</h2>
 *
 * <p>This class is a hand-rolled equivalent of the {@code StateGraph}-backed recipe
 * <a href="https://github.com/habuma/spring-ai-recipes/tree/main/graph-workflow">{@code graph-workflow}</a>.
 * That recipe uses {@code com.alibaba.cloud.ai:spring-ai-alibaba-graph-core} (Spring AI
 * Alibaba extensions, not Spring AI core). Concepts map one-to-one — readers familiar
 * with the recipe can transfer their mental model:
 *
 * <ul>
 *   <li><strong>{@code StateGraph(name, stateStrategies)}</strong> ≈ this class plus the
 *       {@link Team#agents()}/{@link Team#connections()} pair on the request payload.</li>
 *   <li><strong>{@code addNode(name, AsyncNodeAction)}</strong> ≈ each agent built by
 *       {@code factory.buildOne(...)} in the {@code clients}/{@code built} map.</li>
 *   <li><strong>{@code addEdge(from, to)}</strong> ≈ entries in {@code outgoing}/
 *       {@code incoming} adjacency derived from {@code team.connections()}.</li>
 *   <li><strong>{@code addConditionalEdges(from, edge_async(state -&gt; ...))}</strong>
 *       — not modelled. Our edges are static; agents don't branch the topology at runtime.
 *       The orchestrator pattern is where dynamic routing lives. (See {@code graph-workflow-loop}
 *       for the conditional-edge variant — that's a future {@code GraphLoopPattern}.)</li>
 *   <li><strong>{@code START} / {@code END}</strong> sentinels ≈ implicit: {@code START}
 *       is whatever node has zero {@code incoming}; {@code END} is the union of nodes
 *       with zero {@code outgoing} (the {@code sinks} list below).</li>
 *   <li><strong>{@code KeyStrategy} / {@code ReplaceStrategy}</strong> ≈ the
 *       {@code Map<String, String> outputs} below: each node-id key holds the most
 *       recent output, with new values overwriting prior ones (i.e. ReplaceStrategy).</li>
 *   <li><strong>{@code .compile()}</strong> ≈ {@link #topoSort(Set, Map, Map)}: takes
 *       the declared graph and produces an executable plan (topological order).</li>
 *   <li><strong>{@code CompileConfig.builder().interruptBefore(...)}</strong> — not
 *       modelled. Maps to the {@code graph-workflow-hitl} recipe's human-in-the-loop;
 *       a future {@code HumanReviewPattern} would expose this.</li>
 * </ul>
 *
 * <p>Why hand-rolled rather than depending on {@code spring-ai-alibaba-graph-core}: that
 * library targets Spring AI 2.0.0-M5; we're pinned to Spring AI 1.1.6 stable for AgentCore
 * compatibility. The Alibaba dep is a fine drop-in once 2.x lands.
 *
 * @see <a href="https://strandsagents.com/docs/user-guide/concepts/multi-agent/graph/">Strands — Graph</a>
 * @see <a href="https://github.com/habuma/spring-ai-recipes/tree/main/graph-workflow">spring-ai-recipes — graph-workflow</a>
 * @see <a href="https://github.com/habuma/spring-ai-recipes/tree/main/graph-workflow-loop">spring-ai-recipes — graph-workflow-loop (conditional cycles)</a>
 * @see <a href="https://github.com/habuma/spring-ai-recipes/tree/main/graph-workflow-hitl">spring-ai-recipes — graph-workflow-hitl (interruptBefore)</a>
 */
@Component
public class GraphPattern {

    private static final Logger log = LoggerFactory.getLogger(GraphPattern.class);

    private final AgentFactory factory;
    private final TaskToolsFactory taskToolsFactory;
    private final WriteResultToolFactory writeResultToolFactory;
    private final StructuredAnswer structuredAnswer;

    public GraphPattern(AgentFactory factory, TaskToolsFactory taskToolsFactory,
                        WriteResultToolFactory writeResultToolFactory,
                        StructuredAnswer structuredAnswer) {
        this.factory = factory;
        this.taskToolsFactory = taskToolsFactory;
        this.writeResultToolFactory = writeResultToolFactory;
        this.structuredAnswer = structuredAnswer;
    }

    public PatternResult run(Project project, Team team, Config config, Session telemetry) {
        Map<String, AgentDefinition> defsById = new LinkedHashMap<>();
        for (AgentDefinition d : team.agents()) {
            defsById.put(d.id(), d);
        }
        if (!defsById.containsKey(team.entrypoint())) {
            throw new IllegalArgumentException(
                    "entrypoint agent " + team.entrypoint() + " not found in team.agents");
        }

        // Adjacency + reverse adjacency, validated against the agent roster.
        Map<String, Set<String>> outgoing = new LinkedHashMap<>();
        Map<String, Set<String>> incoming = new LinkedHashMap<>();
        for (String id : defsById.keySet()) {
            outgoing.put(id, new LinkedHashSet<>());
            incoming.put(id, new LinkedHashSet<>());
        }
        for (AgentConnection c : team.connections()) {
            requireAgent(defsById, c.source(), "connection source");
            requireAgent(defsById, c.target(), "connection target");
            outgoing.get(c.source()).add(c.target());
            incoming.get(c.target()).add(c.source());
        }

        // Restrict execution to the subgraph reachable from the user-designated entrypoint.
        // The frontend lets the user pick exactly one starting node; Strands roots a graph at
        // that node. Seeding Kahn from "all zero-indegree nodes" would quietly relax that into
        // "any source", firing stray roots and disconnected islands the user never wired to the
        // start. A BFS from team.entrypoint() guarantees execution genuinely ORIGINATES there.
        Set<String> reachable = reachableFrom(team.entrypoint(), outgoing);
        if (reachable.size() < defsById.size()) {
            log.info("[graph] pruning {} node(s) unreachable from entrypoint {}",
                    defsById.size() - reachable.size(), team.entrypoint());
        }

        // Rebuild adjacency over the reachable set only, dropping edges whose endpoints fall
        // outside it. Without this drop a reachable node with an incoming edge from a pruned
        // stray root would stall forever (its predecessor never enters `done`).
        Map<String, Set<String>> outgoingR = new LinkedHashMap<>();
        Map<String, Set<String>> incomingR = new LinkedHashMap<>();
        for (String id : reachable) {
            outgoingR.put(id, new LinkedHashSet<>());
            incomingR.put(id, new LinkedHashSet<>());
        }
        for (String src : reachable) {
            for (String tgt : outgoing.get(src)) {
                if (reachable.contains(tgt)) {
                    outgoingR.get(src).add(tgt);
                    incomingR.get(tgt).add(src);
                }
            }
        }

        // Defs restricted to reachable nodes, preserving roster order for deterministic output.
        Map<String, AgentDefinition> reachableDefs = new LinkedHashMap<>();
        for (Map.Entry<String, AgentDefinition> e : defsById.entrySet()) {
            if (reachable.contains(e.getKey())) reachableDefs.put(e.getKey(), e.getValue());
        }

        List<String> order = topoSort(reachable, outgoingR, incomingR);

        // Graph nodes do NOT get writeResult — its returnDirect=true behaviour replaces the
        // node's reply with a URL string, which is unreviewable by a downstream Code Reviewer
        // (or any other persona) node. The framework persists the most-downstream HTML output
        // via writeResult after the DAG completes (see persistDeliverable below). Each node's
        // prompt is shaped with the Graph-aware role contract + node epilogue so the Frontend
        // role emits raw HTML as its reply rather than calling writeResult.
        WriteResultTool writeResult = writeResultToolFactory.build(project, config, telemetry);
        var taskTools = taskToolsFactory.build(project.id(), telemetry);
        Map<String, BuiltAgent> built = new LinkedHashMap<>();
        for (AgentDefinition def : reachableDefs.values()) {
            built.put(def.id(), factory.buildOne(
                    RoleContracts.shape(def, RoleContracts.Pattern.GRAPH, false),
                    project, telemetry, List.of(taskTools), List.of()));
        }

        String task = Prompts.composeUserPrompt(project, team);
        // ConcurrentHashMap because sibling nodes write to it from virtual threads in parallel.
        Map<String, String> outputs = new ConcurrentHashMap<>();
        log.info("[graph] order={} entrypoint={}", order, team.entrypoint());

        // Pre-mark every reachable agent as READY so the UI renders the executing DAG up front.
        for (AgentDefinition def : reachableDefs.values()) {
            telemetry.saveAgentState(project.id(), def.id(), def.name(), "READY",
                    0, 0, 0, 0, 0, 0L);
        }

        // Parallel batched execution, mirroring Strands' Graph._execute_nodes_parallel:
        // 1. Find the next "ready batch" — every node whose dependencies are all in `outputs`.
        // 2. Run every node in the batch concurrently on a virtual thread.
        // 3. Wait for the batch, then loop until all nodes have produced output.
        //
        // Java 25 virtual threads keep the code shape identical to a sequential for-loop
        // — no event-queue scaffolding, no cancellation dance, no async/await colouring.
        // Each model call still parks the carrier thread on the underlying HTTP I/O.
        try (ExecutorService pool = Executors.newVirtualThreadPerTaskExecutor()) {
            Set<String> done = ConcurrentHashMap.newKeySet();
            while (done.size() < order.size()) {
                List<String> readyBatch = order.stream()
                        .filter(id -> !done.contains(id))
                        .filter(id -> done.containsAll(incomingR.get(id)))
                        .toList();
                if (readyBatch.isEmpty()) {
                    throw new IllegalStateException(
                            "Graph stalled: no ready nodes but " + (order.size() - done.size())
                                    + " remain. Cycle in connections?");
                }
                log.info("[graph] running batch (parallel)={}", readyBatch);
                List<CompletableFuture<Void>> futures = readyBatch.stream()
                        .map(nodeId -> CompletableFuture.runAsync(
                                () -> runNode(nodeId, reachableDefs, incomingR, built, outputs, project, telemetry, task),
                                pool))
                        .toList();
                CompletableFuture.allOf(futures.toArray(CompletableFuture[]::new)).join();
                done.addAll(readyBatch);
            }
        }

        // Sinks (no outgoing edges within the reachable subgraph) carry the final
        // deliverable. Multiple sinks are joined in topo order; in practice there's usually one.
        List<String> sinks = order.stream()
                .filter(id -> outgoingR.get(id).isEmpty())
                .toList();
        String sinkAnswer = sinks.isEmpty()
                ? outputs.get(order.get(order.size() - 1))
                : sinks.stream().map(outputs::get).reduce((a, b) -> a + "\n\n" + b).orElse("");

        // Persist the deliverable for the user. Walk the topo order in REVERSE so the most
        // downstream HTML producer wins (latest version after any in-DAG iteration). We
        // accept any node whose output is recognisable HTML — usually the Frontend UI, but
        // a different persona could play that role on a custom team.
        String html = findHtmlOutput(order, outputs);
        String deliverableUrl = (html == null) ? null : persistDeliverable(writeResult, html);
        String finalAnswer = (deliverableUrl == null)
                ? sinkAnswer
                : "Deliverable: " + deliverableUrl + "\n\n" + sinkAnswer;

        QuestResult structured = structuredAnswer.coerce(finalAnswer);
        return PatternResult.from("graph", team.entrypoint(), finalAnswer, order,
                reachableDefs, built, structured);
    }

    /**
     * Run one node: emit transitions + WORKING, invoke the model, persist the reply,
     * emit STOPPED. Called from a virtual thread inside the parallel batch so two sibling
     * nodes execute concurrently without colouring the call site as async.
     */
    private void runNode(String nodeId,
                         Map<String, AgentDefinition> defsById,
                         Map<String, Set<String>> incoming,
                         Map<String, BuiltAgent> built,
                         Map<String, String> outputs,
                         Project project,
                         Session telemetry,
                         String task) {
        AgentDefinition def = defsById.get(nodeId);
        BuiltAgent node = built.get(nodeId);
        String nodePrompt = composeNodePrompt(task, def, incoming.get(nodeId), defsById, outputs);
        log.info("[graph] running node={} ({}), upstream={}", def.name(), nodeId, incoming.get(nodeId));

        for (String upstream : incoming.get(nodeId)) {
            telemetry.saveAgentTransition(project.id(), UUID.randomUUID().toString(), upstream, nodeId);
        }
        telemetry.saveAgentState(project.id(), def.id(), def.name(), "WORKING",
                node.advisor().cycleCount(), node.advisor().messageCount(),
                node.advisor().inputTokens(), node.advisor().outputTokens(),
                node.advisor().totalTokens(),
                node.advisor().totalLatencyMs());

        String reply = node.client().prompt().user(nodePrompt).call().content();
        outputs.put(nodeId, reply == null ? "" : reply);

        // EventCaptureAdvisor streams this node's model turns to the Adventure Log per cycle,
        // so the final reply is already persisted — no explicit saveAgentMessage here.
        telemetry.saveAgentState(project.id(), def.id(), def.name(), "STOPPED",
                node.advisor().cycleCount(), node.advisor().messageCount(),
                node.advisor().inputTokens(), node.advisor().outputTokens(),
                node.advisor().totalTokens(),
                node.advisor().totalLatencyMs());
    }

    /**
     * Find the most-downstream node whose output CONTAINS a complete HTML document. Walks the
     * topological order in reverse so the latest producer wins. Capable models often narrate
     * before emitting the document, so we locate the {@code <!doctype html>}/{@code <html>}
     * marker ANYWHERE in the output — a start-anchored check would miss prose-prefixed HTML.
     */
    private static String findHtmlOutput(List<String> order, Map<String, String> outputs) {
        for (int i = order.size() - 1; i >= 0; i--) {
            String html = extractHtml(outputs.get(order.get(i)));
            if (html != null) return html;
        }
        return null;
    }

    private static String extractHtml(String raw) {
        if (raw == null) return null;
        String lower = raw.toLowerCase(Locale.ROOT);
        int start = lower.indexOf("<!doctype html");
        if (start < 0) start = lower.indexOf("<html");
        if (start < 0) return null;
        int closeTag = lower.lastIndexOf("</html>");
        int end = closeTag >= 0 ? closeTag + "</html>".length() : raw.length();
        return raw.substring(start, end).strip();
    }

    /**
     * Persist the deliverable via {@link WriteResultTool}. Returns the URL on success or
     * {@code null} if the write failed — failure is logged but does not break the run, the
     * sink's text answer is still returned to the caller.
     */
    private String persistDeliverable(WriteResultTool tool, String html) {
        try {
            // doWrite returns "Successfully wrote deliverable to <url>" — extract the URL.
            String result = tool.writeResult(html, null);
            if (result.startsWith("Successfully wrote")) {
                int urlStart = result.lastIndexOf(' ');
                if (urlStart > 0) return result.substring(urlStart + 1);
            }
            log.warn("[graph] writeResult did not return a success URL: {}", result);
            return null;
        } catch (Exception e) {
            log.error("[graph] failed to persist final deliverable", e);
            return null;
        }
    }

    /**
     * BFS over forward edges from the designated entrypoint. Returns every node reachable
     * from it (including the entrypoint itself). Nodes outside this set are stray roots or
     * disconnected islands the user never wired to the start — they are pruned so execution
     * genuinely originates at the entrypoint, as the Strands Graph contract requires.
     */
    private static Set<String> reachableFrom(String entrypoint, Map<String, Set<String>> outgoing) {
        Set<String> seen = new LinkedHashSet<>();
        Deque<String> queue = new ArrayDeque<>();
        seen.add(entrypoint);
        queue.add(entrypoint);
        while (!queue.isEmpty()) {
            String cur = queue.poll();
            for (String next : outgoing.get(cur)) {
                if (seen.add(next)) queue.add(next);
            }
        }
        return seen;
    }

    /** Kahn's algorithm. Detects cycles and preserves agent-roster order for deterministic output. */
    private static List<String> topoSort(Set<String> nodes,
                                         Map<String, Set<String>> outgoing,
                                         Map<String, Set<String>> incoming) {
        Map<String, Integer> indegree = new LinkedHashMap<>();
        for (String n : nodes) indegree.put(n, incoming.get(n).size());

        Set<String> ready = new LinkedHashSet<>();
        for (String n : nodes) if (indegree.get(n) == 0) ready.add(n);

        List<String> order = new ArrayList<>(nodes.size());
        while (!ready.isEmpty()) {
            String next = ready.iterator().next();
            ready.remove(next);
            order.add(next);
            for (String succ : outgoing.get(next)) {
                int d = indegree.get(succ) - 1;
                indegree.put(succ, d);
                if (d == 0) ready.add(succ);
            }
        }
        if (order.size() != nodes.size()) {
            throw new IllegalArgumentException("Graph has a cycle — Strands graphs must be acyclic for this runtime.");
        }
        return order;
    }

    /**
     * Build a node's user prompt. Entry nodes see the original task; dependent nodes
     * additionally receive each direct predecessor's output, labelled with the agent's
     * name and role. This is the "input propagation" rule from the Strands graph docs.
     *
     * <p><strong>Fix-capable QA reframing.</strong> When a fix-capable QA node (Code Reviewer
     * / Performance Analyst) receives a complete {@code index.html} from upstream, the generic
     * "here's the task, here's the upstream output" framing makes the model treat the original
     * build brief ("Create a snake-style game…") as a fresh build order and rebuild from
     * scratch — ignoring the upstream HTML it was supposed to correct. So for that case we
     * INVERT the framing: lead with the existing {@code index.html} as the artefact to fix,
     * demote the brief to acceptance criteria, and forbid a from-scratch rebuild. The node's
     * fix-capable role contract (see {@link RoleContracts}) supplies the "emit the corrected
     * full document" delivery rule; this prompt supplies the "fix THIS, don't rebuild" intent.
     */
    private static String composeNodePrompt(String task, AgentDefinition def, Set<String> upstream,
                                            Map<String, AgentDefinition> defsById,
                                            Map<String, String> outputs) {
        if (upstream.isEmpty()) {
            return task;
        }
        String upstreamHtml = isFixCapableQa(def.role()) ? firstUpstreamHtml(upstream, outputs) : null;
        if (upstreamHtml != null) {
            return composeQaFixPrompt(task, def, upstream, defsById, outputs, upstreamHtml);
        }
        StringBuilder sb = new StringBuilder(task);
        sb.append("\n\nYou are the '").append(def.name()).append("' (").append(def.role())
          .append(") node in a graph. Use the upstream outputs below to do your part.");
        for (String src : upstream) {
            AgentDefinition srcDef = defsById.get(src);
            sb.append("\n\n--- Output from ").append(srcDef.name())
              .append(" (").append(srcDef.role()).append(") ---\n")
              .append(outputs.getOrDefault(src, ""));
        }
        return sb.toString();
    }

    /**
     * Roles empowered to CORRECT the upstream HTML in Graph runs — kept in lockstep with the
     * fix-capable contracts in {@link RoleContracts#forRole}. A Game Logic Architect upstream
     * of a Frontend node is NOT in this set: it produces a spec, not a fixable artefact.
     */
    private static boolean isFixCapableQa(String role) {
        if (role == null) return false;
        String r = role.toLowerCase(Locale.ROOT);
        return r.contains("reviewer") || r.contains("performance");
    }

    /** The complete index.html from the first direct predecessor that emitted one, else null. */
    private static String firstUpstreamHtml(Set<String> upstream, Map<String, String> outputs) {
        for (String src : upstream) {
            String html = extractHtml(outputs.get(src));
            if (html != null) return html;
        }
        return null;
    }

    /**
     * Prompt for a fix-capable QA node that received an upstream {@code index.html}. Leads with
     * the existing document as the artefact to review/fix, demotes the original brief to
     * acceptance criteria, and explicitly forbids a from-scratch rebuild. Any additional
     * non-HTML upstream outputs (e.g. an Architect's spec) are appended as reference context.
     */
    private static String composeQaFixPrompt(String task, AgentDefinition def, Set<String> upstream,
                                             Map<String, AgentDefinition> defsById,
                                             Map<String, String> outputs, String upstreamHtml) {
        StringBuilder sb = new StringBuilder();
        sb.append("You are the '").append(def.name()).append("' (").append(def.role())
          .append(") node in a graph. The upstream node already produced a complete index.html. ")
          .append("Your job is to REVIEW and FIX that existing document — do NOT build a new game ")
          .append("from scratch, do NOT start over. Read the current index.html below, find and fix ")
          .append("every blocking bug, and return the corrected full document.");
        sb.append("\n\n--- Current index.html (review and FIX this; do NOT rebuild) ---\n")
          .append(upstreamHtml);
        for (String src : upstream) {
            String raw = outputs.getOrDefault(src, "");
            if (extractHtml(raw) != null) {
                continue; // already shown as the current index.html above
            }
            AgentDefinition srcDef = defsById.get(src);
            sb.append("\n\n--- Reference: output from ").append(srcDef.name())
              .append(" (").append(srcDef.role()).append(") ---\n").append(raw);
        }
        sb.append("\n\n--- Acceptance criteria (the original brief — verify the game meets it; ")
          .append("this is NOT a request to rebuild) ---\n").append(task);
        return sb.toString();
    }

    private static void requireAgent(Map<String, AgentDefinition> defs, String id, String label) {
        if (!defs.containsKey(id)) {
            throw new IllegalArgumentException(label + " '" + id + "' not in team.agents");
        }
    }
}
