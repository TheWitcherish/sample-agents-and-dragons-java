package com.witcherish.samples.agents.tools;

import com.witcherish.samples.agents.telemetry.McpTelemetryPublisher.Session;
import org.springframework.stereotype.Component;

/**
 * Builds a per-quest {@link TaskTools} bound to the active MCP {@link Session}, mirroring
 * the {@link WriteResultToolFactory} pattern. Every quest gets its own task map and its own
 * AppSync write channel — no cross-quest leakage, no singleton state.
 */
@Component
public class TaskToolsFactory {

    public TaskTools build(String projectId, Session telemetry) {
        return new TaskTools(projectId, telemetry);
    }
}
