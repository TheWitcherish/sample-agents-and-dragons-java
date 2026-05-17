package com.witcherish.samples.agents.patterns;

import com.witcherish.samples.agents.api.dto.Project;
import com.witcherish.samples.agents.api.dto.Team;
import org.springframework.stereotype.Component;

/**
 * Pattern 4.1 — Workflow Orchestration (DAG).
 * Filled in at Step 8 / CHECKPOINT 3.
 */
@Component
public class GraphPattern {

    public PatternResult run(Project project, Team team) {
        throw new UnsupportedOperationException("GraphPattern arrives at Step 8 / CHECKPOINT 3");
    }
}
