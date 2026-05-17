package com.witcherish.samples.agents.observer;

import java.time.Instant;

/**
 * One captured agent lifecycle event.
 * <p>
 * The timestamp is serialized as ISO-8601 to keep Jackson happy without depending on
 * the JSR-310 module being on the classpath, and to match the Strands version's
 * GraphQL string field shape.
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
