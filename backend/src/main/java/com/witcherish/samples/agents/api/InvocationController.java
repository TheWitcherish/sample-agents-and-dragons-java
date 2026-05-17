package com.witcherish.samples.agents.api;

import com.witcherish.samples.agents.api.dto.RequestPayload;
import com.witcherish.samples.agents.observer.AgentEvent;
import com.witcherish.samples.agents.observer.EventLog;
import com.witcherish.samples.agents.patterns.PatternDispatcher;
import com.witcherish.samples.agents.patterns.PatternResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springaicommunity.agentcore.annotation.AgentCoreInvocation;
import org.springaicommunity.agentcore.context.AgentCoreContext;
import org.springaicommunity.agentcore.context.AgentCoreHeaders;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
public class InvocationController {

    private static final Logger log = LoggerFactory.getLogger(InvocationController.class);

    private final PatternDispatcher dispatcher;
    private final EventLog eventLog;

    public InvocationController(PatternDispatcher dispatcher, EventLog eventLog) {
        this.dispatcher = dispatcher;
        this.eventLog = eventLog;
    }

    /** Structured endpoint accepting the full {@link RequestPayload} JSON. */
    @PostMapping("/run")
    public PatternResult run(@RequestBody RequestPayload payload) {
        return dispatcher.dispatch(payload);
    }

    /** AgentCore-compatible endpoint. Accepts the same RequestPayload (we override the default {"prompt":"..."}). */
    @AgentCoreInvocation
    public PatternResult invocations(RequestPayload payload, AgentCoreContext context) {
        log.info("[/invocations] sessionId={}", context.getHeader(AgentCoreHeaders.SESSION_ID));
        return dispatcher.dispatch(payload);
    }

    @GetMapping("/events")
    public List<AgentEvent> events(@RequestParam(required = false) String projectId) {
        return projectId == null ? eventLog.snapshot() : eventLog.snapshotForProject(projectId);
    }
}
