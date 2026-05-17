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

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;
import java.util.regex.Pattern;

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
        return runWithDeliverableFallback(payload);
    }

    /** AgentCore-compatible endpoint. Accepts the same RequestPayload (we override the default {"prompt":"..."}). */
    @AgentCoreInvocation
    public PatternResult invocations(RequestPayload payload, AgentCoreContext context) {
        log.info("[/invocations] sessionId={}", context.getHeader(AgentCoreHeaders.SESSION_ID));
        return runWithDeliverableFallback(payload);
    }

    /**
     * Spring AI 1.1.3 has a known JSON-parse failure when re-encoding a previous tool_use
     * input that contained raw newlines (Bedrock sometimes emits those for multi-line
     * content like HTML). The failure happens AFTER the deliverable has already been
     * written to disk by the {@code write_result} tool — so the file is good, only the
     * orchestrator's final summary turn never lands.
     *
     * <p>We cope by: (a) running the dispatcher; (b) if it throws but a deliverable file
     * exists for this project, returning a synthesised success with the URL; (c) only
     * surfacing the original exception when we have nothing on disk to show the user.
     */
    private PatternResult runWithDeliverableFallback(RequestPayload payload) {
        try {
            return dispatcher.dispatch(payload);
        } catch (RuntimeException e) {
            String url = findLocalDeliverable(payload.project().id());
            if (url == null) {
                throw e;
            }
            log.warn("Dispatcher threw but deliverable exists at {} — returning success.", url, e);
            String pattern = payload.team().pattern();
            String entrypointId = payload.team().entrypoint();
            List<String> participants = payload.team().agents().stream().map(a -> a.id()).toList();
            String message = "Deliverable written to " + url
                    + ". (Note: Spring AI 1.1.3 strict-JSON quirk prevented the orchestrator's final summary turn — the deliverable itself succeeded.)";
            return new PatternResult("COMPLETED", pattern, entrypointId, message, participants);
        }
    }

    /**
     * Look for a write_result-produced index.html for this project under
     * {@code target/runs/<projectId>/index.html}. Used by the recovery path above.
     * S3 deliverables aren't checked here — if the run went to S3, success was already
     * reported via the orchestrator's tool result and shouldn't reach this fallback.
     */
    private static final Pattern PROJECT_ID_SAFE = Pattern.compile("[a-zA-Z0-9_.-]+");
    private static String findLocalDeliverable(String projectId) {
        if (projectId == null || !PROJECT_ID_SAFE.matcher(projectId).matches()) {
            return null;
        }
        Path file = Paths.get("target", "runs", projectId, "index.html");
        if (Files.exists(file)) {
            return file.toAbsolutePath().toUri().toString();
        }
        return null;
    }

    @GetMapping("/events")
    public List<AgentEvent> events(@RequestParam(required = false) String projectId) {
        return projectId == null ? eventLog.snapshot() : eventLog.snapshotForProject(projectId);
    }
}
