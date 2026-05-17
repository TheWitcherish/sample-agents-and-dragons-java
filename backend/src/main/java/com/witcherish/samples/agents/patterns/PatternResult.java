package com.witcherish.samples.agents.patterns;

import java.util.List;

public record PatternResult(
        String status,
        String pattern,
        String entrypointAgentId,
        String finalAnswer,
        List<String> participatingAgentIds
) {}
