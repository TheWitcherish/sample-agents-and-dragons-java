package com.witcherish.samples.agents.api.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record RequestPayload(
        Project project,
        Team team,
        Config config
) {}
