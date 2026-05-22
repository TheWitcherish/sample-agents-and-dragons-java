package com.witcherish.samples.agents.tools;

import com.witcherish.samples.agents.telemetry.McpTelemetryPublisher.Session;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;

import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ConcurrentMap;

/**
 * In-flight task tracker for a single quest.
 *
 * <p>One instance is built per request via {@link TaskToolsFactory#build(String, Session)}
 * — the {@code projectId} and the per-quest {@link Session} are baked in so each
 * {@code @Tool} call can both update the local in-memory map (for fast lookup by ids)
 * and publish to AppSync via the manage-tasks MCP target so the React frontend's
 * Adventure Log lights up live.
 *
 * <p>This mirrors the Python Strands runtime: every task tool call goes through the
 * AgentCore MCP gateway so the AppSync subscription on the {@code Task} table receives
 * a push the moment an agent decides to create or update a task.
 */
public class TaskTools {

    private static final Logger log = LoggerFactory.getLogger(TaskTools.class);

    public record TaskRecord(
            String id,
            String name,
            String description,
            String status,
            String createdBy,
            String assignee,
            String result,
            Instant createdAt,
            Instant updatedAt
    ) {}

    private final ConcurrentMap<String, TaskRecord> tasks = new ConcurrentHashMap<>();
    private final String projectId;
    private final Session telemetry;

    public TaskTools(String projectId, Session telemetry) {
        this.projectId = projectId;
        this.telemetry = telemetry == null ? Session.NO_OP : telemetry;
    }

    @Tool(description = "Create a new task. Tasks track activities done to achieve a project. Returns the new task id.")
    public String createTask(
            @ToolParam(description = "Short, imperative task name") String name,
            @ToolParam(description = "Precise description: what needs to be done and how") String description,
            @ToolParam(description = "Id of the agent that creates the task") String createdBy,
            @ToolParam(description = "Id of the agent assigned to the task — can equal createdBy if self-assigned") String assignee) {

        String id = UUID.randomUUID().toString();
        Instant now = Instant.now();
        tasks.put(id, new TaskRecord(id, name, description, "CREATED", createdBy, assignee, null, now, now));
        log.info("createTask id={} name={} createdBy={} assignee={}", id, name, createdBy, assignee);
        // Mirror to AppSync via the manage-tasks MCP target so the Adventure Log animates live.
        telemetry.createTask(projectId, id, name, description, createdBy, assignee);
        return id;
    }

    @Tool(description = "Update a task. Use to record progress: status transitions and a result/comment.")
    public String updateTask(
            @ToolParam(description = "Id of the task to update") String taskId,
            @ToolParam(description = "New status: CREATED | IN_PROGRESS | COMPLETED | ABORTED | ON_ERROR") String newStatus,
            @ToolParam(description = "Comment describing what was done and how") String newComment,
            @ToolParam(description = "Id of the agent that updates the task") String updatedBy) {

        TaskRecord existing = tasks.get(taskId);
        if (existing == null) {
            log.warn("updateTask taskId={} not found", taskId);
            return "ERROR: task " + taskId + " not found";
        }
        TaskRecord updated = new TaskRecord(
                existing.id(), existing.name(), existing.description(), newStatus,
                existing.createdBy(), existing.assignee(),
                newComment, existing.createdAt(), Instant.now());
        tasks.put(taskId, updated);
        log.info("updateTask id={} newStatus={} updatedBy={}", taskId, newStatus, updatedBy);
        telemetry.updateTask(taskId, newStatus, newComment, updatedBy);
        return "OK";
    }

    @Tool(description = "Read a task by id. Useful to load the full task description before working on it.")
    public TaskRecord readTask(
            @ToolParam(description = "Id of the task to read") String taskId) {
        TaskRecord t = tasks.get(taskId);
        log.info("readTask id={} found={}", taskId, t != null);
        return t;
    }

    public List<TaskRecord> listAll() {
        return new ArrayList<>(tasks.values());
    }
}
