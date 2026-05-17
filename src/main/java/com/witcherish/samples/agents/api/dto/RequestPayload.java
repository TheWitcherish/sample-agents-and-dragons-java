package com.witcherish.samples.agents.api.dto;

public record RequestPayload(
        Project project,
        Team team,
        Config config
) {}
