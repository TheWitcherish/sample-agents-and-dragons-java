package com.witcherish.samples.agents.api.dto;

public record AgentConnection(
        String source,
        String target,
        String description
) {}
