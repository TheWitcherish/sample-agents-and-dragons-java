package com.witcherish.samples.agents.observer;

import java.time.Instant;

/**
 * One captured agent lifecycle event.
 * <p>
 * The timestamp is serialized as ISO-8601 so the wire shape is a plain string and
 * doesn't depend on the JSR-310 Jackson module being on the classpath.
 */
public record AgentEvent(
        String timestamp,
        String projectId,
        String agentId,
        String agentName,
        String phase,
        String content
) {
    public static AgentEvent of(String projectId, String agentId, String agentName, String phase, String content) {
        return new AgentEvent(Instant.now().toString(), projectId, agentId, agentName, phase, content);
    }
}
