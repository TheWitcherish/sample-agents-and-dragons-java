package com.witcherish.samples.agents.patterns;

import com.witcherish.samples.agents.api.dto.RequestPayload;
import com.witcherish.samples.agents.telemetry.McpTelemetryPublisher;
import com.witcherish.samples.agents.telemetry.McpTelemetryPublisher.Session;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class PatternDispatcher {

    private static final Logger log = LoggerFactory.getLogger(PatternDispatcher.class);

    private final MonoPattern mono;
    private final OrchestratorPattern orchestrator;
    private final GraphPattern graph;
    private final SwarmPattern swarm;
    private final McpTelemetryPublisher telemetry;

    public PatternDispatcher(MonoPattern mono, OrchestratorPattern orchestrator,
                             GraphPattern graph, SwarmPattern swarm,
                             McpTelemetryPublisher telemetry) {
        this.mono = mono;
        this.orchestrator = orchestrator;
        this.graph = graph;
        this.swarm = swarm;
        this.telemetry = telemetry;
    }

    public PatternResult dispatch(RequestPayload payload) {
        String pattern = payload.team().pattern();
        String projectId = payload.project().id();
        log.info("Dispatching pattern '{}' for project={} ({} agents)",
                pattern, projectId, payload.team().agents().size());

        try (Session session = telemetry.openSession(payload.config())) {
            session.saveProjectState(projectId, "IN_PROGRESS", null);
            try {
                PatternResult result = switch (pattern) {
                    case "mono" -> mono.run(payload.project(), payload.team(), payload.config(), session);
                    case "orchestrator" -> orchestrator.run(payload.project(), payload.team(), payload.config(), session);
                    case "graph" -> graph.run(payload.project(), payload.team(), payload.config(), session);
                    case "swarm" -> swarm.run(payload.project(), payload.team(), payload.config(), session);
                    default -> throw new IllegalArgumentException("Unknown pattern: " + pattern);
                };
                String url = result.result() != null ? result.result().deliverableUrl() : null;
                session.saveProjectState(projectId, result.status(), url);
                return result;
            } catch (RuntimeException e) {
                session.saveProjectState(projectId, "ON_ERROR", null);
                throw e;
            }
        }
    }
}
