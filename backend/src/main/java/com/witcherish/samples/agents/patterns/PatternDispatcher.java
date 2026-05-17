package com.witcherish.samples.agents.patterns;

import com.witcherish.samples.agents.api.dto.RequestPayload;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

@Component
public class PatternDispatcher {

    private static final Logger log = LoggerFactory.getLogger(PatternDispatcher.class);

    private final MonoPattern mono;
    private final HierarchicalPattern hierarchical;
    private final GraphPattern graph;
    private final SwarmPattern swarm;

    public PatternDispatcher(MonoPattern mono, HierarchicalPattern hierarchical,
                             GraphPattern graph, SwarmPattern swarm) {
        this.mono = mono;
        this.hierarchical = hierarchical;
        this.graph = graph;
        this.swarm = swarm;
    }

    public PatternResult dispatch(RequestPayload payload) {
        String pattern = payload.team().pattern();
        log.info("Dispatching pattern '{}' for project={} ({} agents)",
                pattern, payload.project().id(), payload.team().agents().size());
        return switch (pattern) {
            case "mono" -> mono.run(payload.project(), payload.team());
            case "hierarchical" -> hierarchical.run(payload.project(), payload.team());
            case "graph" -> graph.run(payload.project(), payload.team());
            case "swarm" -> swarm.run(payload.project(), payload.team());
            default -> throw new IllegalArgumentException("Unknown pattern: " + pattern);
        };
    }
}
