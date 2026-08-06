package com.witcherish.samples.agents.api.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;

@JsonIgnoreProperties(ignoreUnknown = true)
public record Project(
        String id,
        String questId,
        String name,
        String prompt
) {}
