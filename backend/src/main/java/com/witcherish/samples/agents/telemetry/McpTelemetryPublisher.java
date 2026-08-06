package com.witcherish.samples.agents.telemetry;

import com.witcherish.samples.agents.api.dto.Config;
import io.modelcontextprotocol.client.McpClient;
import io.modelcontextprotocol.client.McpSyncClient;
import io.modelcontextprotocol.client.transport.HttpClientStreamableHttpTransport;
import io.modelcontextprotocol.spec.McpSchema.CallToolRequest;
import io.modelcontextprotocol.spec.McpSchema.CallToolResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.net.URI;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * Fire-and-forget telemetry publisher that calls the manage-tasks Lambda via the
 * Bedrock AgentCore MCP Gateway. Mirrors the four observability tools the Python
 * Strands runtime called: save_agent_state, save_agent_transition, save_agent_message,
 * save_project_state.
 *
 * <p><strong>Lifecycle.</strong> One {@link McpSyncClient} per quest (per
 * {@link Config}). The gateway authorizes via {@code CUSTOM_JWT} so the user's
 * Cognito access token (passed in {@code config.token}) becomes the bearer header.
 * Tokens are short-lived; building the client per-invocation keeps token rotation
 * simple at the cost of one extra HTTP handshake per quest.
 *
 * <p><strong>Failure policy.</strong> Telemetry must never break a quest. Every
 * tool call is wrapped in a swallow-all catch — the in-memory
 * {@code EventLog} remains the durable record exposed via {@code /events}.
 */
@Component
public class McpTelemetryPublisher {

    private static final Logger log = LoggerFactory.getLogger(McpTelemetryPublisher.class);

    /** Gateway target name in {@code MCPGateway.ts} → tool prefix on the wire. */
    private static final String TARGET_PREFIX = "lambda___";

    private static final Duration INIT_TIMEOUT = Duration.ofSeconds(10);
    private static final Duration CALL_TIMEOUT = Duration.ofSeconds(5);

    /**
     * Build a per-quest publisher. The returned {@link Session} is meant to be used
     * for the lifetime of one {@code RequestPayload} and then closed; reuse across
     * quests is not supported because the JWT is per-user-session.
     *
     * <p>If {@code config} is missing the gateway URL or token (e.g. local dev,
     * legacy payloads), this returns a no-op session so callers don't have to
     * branch on the absence.
     */
    public Session openSession(Config config) {
        if (config == null || isBlank(config.gatewayUrl()) || isBlank(config.token())) {
            log.info("[telemetry] no gateway_url/token in config — telemetry disabled for this quest");
            return Session.NO_OP;
        }
        try {
            return new ActiveSession(config.gatewayUrl(), config.token());
        } catch (RuntimeException e) {
            log.warn("[telemetry] failed to open MCP session — falling back to no-op", e);
            return Session.NO_OP;
        }
    }

    /**
     * Quest-scoped handle. All calls accept positional values matching
     * {@code amplify/functions/manage-tasks/schema.json}.
     */
    public sealed interface Session extends AutoCloseable permits ActiveSession, NoOpSession {

        Session NO_OP = new NoOpSession();

        void saveAgentState(String projectId, String agentId, String agentName, String status,
                            int cycleCount, int messageCount,
                            int inputTokens, int outputTokens, int totalTokens,
                            long latencyMs);

        void saveAgentTransition(String projectId, String transitionId, String sourceAgentId, String targetAgentId);

        void saveAgentMessage(String projectId, String agentId, String role, String text);

        void saveProjectState(String projectId, String status, String url);

        /** Mirror createTask to the manage-tasks Lambda so the Adventure Log lights up live. */
        void createTask(String projectId, String taskId, String name, String description,
                        String createdBy, String assignee);

        /** Mirror updateTask to the manage-tasks Lambda. */
        void updateTask(String taskId, String newStatus, String newComment, String updatedBy);

        @Override void close();
    }

    /** Concrete session backed by a real {@link McpSyncClient}. */
    static final class ActiveSession implements Session {

        private final McpSyncClient client;

        ActiveSession(String gatewayUrl, String token) {
            // The MCP transport accepts a base URI without the /mcp suffix — the
            // streamable-http transport appends "/mcp" automatically. Bedrock AgentCore
            // gateways expose the protocol at that exact endpoint, so we strip a
            // trailing /mcp if the caller passed the full path.
            String baseUri = gatewayUrl.endsWith("/mcp")
                    ? gatewayUrl.substring(0, gatewayUrl.length() - "/mcp".length())
                    : gatewayUrl;

            HttpClientStreamableHttpTransport transport = HttpClientStreamableHttpTransport
                    .builder(baseUri)
                    .customizeRequest(rb -> rb.header("Authorization", "Bearer " + token))
                    .build();

            this.client = McpClient.sync(transport)
                    .requestTimeout(CALL_TIMEOUT)
                    .initializationTimeout(INIT_TIMEOUT)
                    .build();
            this.client.initialize();
            log.info("[telemetry] MCP session ready at {}", URI.create(baseUri));
        }

        @Override
        public void saveAgentState(String projectId, String agentId, String agentName, String status,
                                   int cycleCount, int messageCount,
                                   int inputTokens, int outputTokens, int totalTokens,
                                   long latencyMs) {
            Map<String, Object> args = new LinkedHashMap<>();
            args.put("projectId", projectId);
            args.put("agentId", agentId);
            args.put("agentName", agentName);
            args.put("status", status);
            args.put("cycleCount", cycleCount);
            args.put("messageCount", messageCount);
            args.put("inputTokens", inputTokens);
            args.put("outputTokens", outputTokens);
            args.put("totalTokens", totalTokens);
            args.put("latency", latencyMs);
            call("save_agent_state", args);
        }

        @Override
        public void saveAgentTransition(String projectId, String transitionId, String sourceAgentId, String targetAgentId) {
            Map<String, Object> args = new LinkedHashMap<>();
            args.put("projectId", projectId);
            args.put("transitionId", transitionId);
            args.put("sourceAgentId", sourceAgentId);
            args.put("targetAgentId", targetAgentId);
            call("save_agent_transition", args);
        }

        @Override
        public void saveAgentMessage(String projectId, String agentId, String role, String text) {
            Map<String, Object> args = new LinkedHashMap<>();
            args.put("projectId", projectId);
            args.put("agentId", agentId);
            args.put("role", role);
            args.put("text", text);
            call("save_agent_message", args);
        }

        @Override
        public void saveProjectState(String projectId, String status, String url) {
            Map<String, Object> args = new LinkedHashMap<>();
            args.put("projectId", projectId);
            args.put("status", status);
            if (url != null && !url.isBlank()) {
                args.put("url", url);
            }
            call("save_project_state", args);
        }

        @Override
        public void createTask(String projectId, String taskId, String name, String description,
                               String createdBy, String assignee) {
            // Pass the Java-generated UUID as `id` so AppSync stores the row under the same
            // key the agent will later use in update_task. Without this, AppSync would
            // auto-generate its own id and updates would never find the row.
            Map<String, Object> args = new LinkedHashMap<>();
            args.put("id", taskId);
            args.put("projectId", projectId);
            args.put("name", name);
            args.put("description", description);
            args.put("createdBy", createdBy);
            args.put("assignee", assignee);
            call("create_task", args);
        }

        @Override
        public void updateTask(String taskId, String newStatus, String newComment, String updatedBy) {
            Map<String, Object> args = new LinkedHashMap<>();
            args.put("taskId", taskId);
            args.put("newStatus", newStatus);
            args.put("newComment", newComment);
            args.put("updatedBy", updatedBy);
            call("update_task", args);
        }

        private void call(String toolName, Map<String, Object> args) {
            String fqName = TARGET_PREFIX + toolName;
            try {
                CallToolResult result = client.callTool(new CallToolRequest(fqName, args));
                if (Boolean.TRUE.equals(result.isError())) {
                    log.warn("[telemetry] {} returned isError=true: {}", fqName, result);
                }
            } catch (Throwable t) {
                // Telemetry must never break the quest. Log and move on.
                log.warn("[telemetry] {} failed", fqName, t);
            }
        }

        @Override
        public void close() {
            try {
                client.close();
            } catch (Throwable t) {
                log.debug("[telemetry] error closing MCP session: {}", t.toString());
            }
        }
    }

    /** No-op fallback so callers can use try-with-resources unconditionally. */
    static final class NoOpSession implements Session {
        @Override public void saveAgentState(String p, String a, String n, String s, int c, int m,
                                             int it, int ot, int tt, long l) {}
        @Override public void saveAgentTransition(String p, String t, String src, String tgt) {}
        @Override public void saveAgentMessage(String p, String a, String r, String t) {}
        @Override public void saveProjectState(String p, String s, String u) {}
        @Override public void createTask(String p, String tId, String n, String d, String c, String a) {}
        @Override public void updateTask(String t, String s, String c, String u) {}
        @Override public void close() {}
    }

    private static boolean isBlank(String s) { return s == null || s.isBlank(); }
}
