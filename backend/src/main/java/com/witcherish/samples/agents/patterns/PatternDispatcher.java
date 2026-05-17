package com.witcherish.samples.agents.patterns;

import com.witcherish.samples.agents.api.dto.RequestPayload;
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

    public PatternDispatcher(MonoPattern mono, OrchestratorPattern orchestrator,
                             GraphPattern graph, SwarmPattern swarm) {
        this.mono = mono;
        this.orchestrator = orchestrator;
        this.graph = graph;
        this.swarm = swarm;
    }

    public PatternResult dispatch(RequestPayload payload) {
        String pattern = payload.team().pattern();
        log.info("Dispatching pattern '{}' for project={} ({} agents)",
                pattern, payload.project().id(), payload.team().agents().size());
        return switch (pattern) {
            case "mono" -> mono.run(payload.project(), payload.team(), payload.config());
            case "orchestrator" -> orchestrator.run(payload.project(), payload.team(), payload.config());
            case "graph" -> graph.run(payload.project(), payload.team(), payload.config());
            case "swarm" -> swarm.run(payload.project(), payload.team(), payload.config());
            default -> throw new IllegalArgumentException("Unknown pattern: " + pattern);
        };
    }
}
