package com.witcherish.samples.agents.api.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

import java.util.List;

@JsonIgnoreProperties(ignoreUnknown = true)
public record AgentDefinition(
        String id,
        String name,
        String model,
        String prompt,
        String role,
        List<String> tools
) {}
