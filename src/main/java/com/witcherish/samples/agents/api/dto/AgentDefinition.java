package com.witcherish.samples.agents.api.dto;

import java.util.List;

public record AgentDefinition(
        String id,
        String name,
        String model,
        String prompt,
        String role,
        List<String> tools
) {}
