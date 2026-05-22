package com.witcherish.samples.agents.patterns;

import com.witcherish.samples.agents.api.dto.QuestResult;

import java.util.List;

/**
 * The wire shape returned to the AgentCore Runtime caller.
 *
 * <p>{@link #finalAnswer} is the agent's free-form summary (kept for the local /run path
 * and humans tailing logs). {@link #result} is the Strands-style structured output the
 * frontend renders directly. Patterns synthesise both: the model is constrained to emit
 * {@link QuestResult} JSON, the dispatcher mirrors its summary into {@code finalAnswer}.
 */
public record PatternResult(
        String status,
        String pattern,
        String entrypointAgentId,
        String finalAnswer,
        List<String> participatingAgentIds,
        QuestResult result
) {}
