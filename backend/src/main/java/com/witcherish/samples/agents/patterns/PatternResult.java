package com.witcherish.samples.agents.patterns;

import com.witcherish.samples.agents.api.dto.AgentDefinition;
import com.witcherish.samples.agents.api.dto.QuestResult;
import com.witcherish.samples.agents.core.AgentFactory.BuiltAgent;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * The wire shape returned to the AgentCore Runtime caller.
 *
 * <p>Mirrors Strands' {@code multiagent.MultiAgentResult}: status + per-node results +
 * accumulated usage + accumulated latency. Java 25 records keep the boilerplate at zero
 * and {@link #from(String, String, String, List, Map, Map, QuestResult)} is the single
 * convenience builder every pattern uses.
 *
 * <p>{@link #finalAnswer} is the agent's free-form summary (kept for the local {@code /run}
 * path and humans tailing logs). {@link #result} is the Strands-style structured output
 * the frontend renders directly.
 */
public record PatternResult(
        Status status,
        String pattern,
        String entrypointAgentId,
        String finalAnswer,
        List<String> participatingAgentIds,
        Map<String, NodeResult> nodes,
        Usage accumulatedUsage,
        long accumulatedLatencyMs,
        QuestResult result
) {

    /**
     * Execution status — values match Strands' {@code Status} enum so the wire payload
     * deserialises identically across runtimes.
     */
    public enum Status {
        PENDING, EXECUTING, COMPLETED, FAILED, INTERRUPTED
    }

    /**
     * Per-node result. Strands stores an {@code AgentResult} or nested {@code MultiAgentResult};
     * we keep it flat: every node is a leaf agent with its own advisor.
     */
    public record NodeResult(
            String agentId,
            String agentName,
            String role,
            Status status,
            long latencyMs,
            int cycleCount,
            int messageCount,
            Usage usage
    ) {}

    /** Strands-shaped token usage. */
    public record Usage(int inputTokens, int outputTokens, int totalTokens) {
        public static final Usage ZERO = new Usage(0, 0, 0);

        public Usage plus(Usage other) {
            return new Usage(
                    this.inputTokens + other.inputTokens,
                    this.outputTokens + other.outputTokens,
                    this.totalTokens + other.totalTokens);
        }

        /** Read straight from a {@link BuiltAgent}'s advisor at any point in the run. */
        public static Usage of(BuiltAgent built) {
            var a = built.advisor();
            return new Usage(a.inputTokens(), a.outputTokens(), a.totalTokens());
        }
    }

    /**
     * Convenience builder used by every pattern's terminal {@code return}. Walks each
     * {@link BuiltAgent} once, derives a {@link NodeResult}, and accumulates usage +
     * latency across all nodes — a one-liner replacement for repeating the aggregation
     * inside every pattern.
     */
    public static PatternResult from(String pattern,
                                     String entrypointAgentId,
                                     String finalAnswer,
                                     List<String> participatingAgentIds,
                                     Map<String, AgentDefinition> defsById,
                                     Map<String, BuiltAgent> built,
                                     QuestResult result) {
        Map<String, NodeResult> nodes = new LinkedHashMap<>();
        Usage acc = Usage.ZERO;
        long accLatency = 0;
        for (var entry : built.entrySet()) {
            String id = entry.getKey();
            BuiltAgent b = entry.getValue();
            AgentDefinition def = defsById.get(id);
            NodeResult node = new NodeResult(
                    id,
                    def != null ? def.name() : id,
                    def != null ? def.role() : null,
                    Status.COMPLETED,
                    b.advisor().totalLatencyMs(),
                    b.advisor().cycleCount(),
                    b.advisor().messageCount(),
                    Usage.of(b));
            nodes.put(id, node);
            acc = acc.plus(node.usage());
            accLatency += node.latencyMs();
        }
        return new PatternResult(
                Status.COMPLETED, pattern, entrypointAgentId,
                finalAnswer, participatingAgentIds,
                nodes, acc, accLatency, result);
    }
}
