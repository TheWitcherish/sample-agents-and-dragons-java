package com.witcherish.samples.agents.api.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record AgentConnection(
        String source,
        String target,
        String description
) {}
