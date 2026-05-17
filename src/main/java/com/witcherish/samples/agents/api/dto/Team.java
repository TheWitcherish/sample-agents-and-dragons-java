package com.witcherish.samples.agents.api.dto;

import java.util.List;

public record Team(
        String name,
        String prompt,
        String pattern,
        String entrypoint,
        List<AgentDefinition> agents,
        List<AgentConnection> connections
) {}
