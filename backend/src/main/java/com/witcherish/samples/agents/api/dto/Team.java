package com.witcherish.samples.agents.api.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public record Team(
        String name,
        String prompt,
        String pattern,
        String entrypoint,
        List<AgentDefinition> agents,
        List<AgentConnection> connections
) {}
