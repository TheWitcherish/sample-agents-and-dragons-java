package com.witcherish.samples.agents.observer;

import org.springframework.ai.chat.client.ChatClientRequest;
import org.springframework.ai.chat.client.ChatClientResponse;
import org.springframework.ai.chat.client.advisor.api.CallAdvisor;
import org.springframework.ai.chat.client.advisor.api.CallAdvisorChain;
import org.springframework.ai.chat.metadata.Usage;
import org.springframework.ai.chat.model.ChatResponse;

import java.util.concurrent.atomic.AtomicInteger;
import java.util.concurrent.atomic.AtomicLong;

/**
 * Per-agent advisor wired into every {@link org.springframework.ai.chat.client.ChatClient}
 * by {@link com.witcherish.samples.agents.core.AgentFactory}. Two responsibilities:
 *
 * <ul>
 *   <li>Emit BEFORE_MODEL_CALL / AFTER_MODEL_CALL prose into the in-memory
 *       {@link EventLog} so the {@code /events} endpoint and CloudWatch tails stay
 *       useful.</li>
 *   <li>Accumulate token usage and cycle counts from every {@link ChatResponse}
 *       so the surrounding pattern can publish them via the MCP telemetry channel
 *       at the end of an agent's turn ({@code save_agent_state} STOPPED event).</li>
 * </ul>
 *
 * <p>Spring AI normalises Bedrock/Anthropic/OpenAI usage on
 * {@link Usage#getPromptTokens()} / {@link Usage#getCompletionTokens()} /
 * {@link Usage#getTotalTokens()}, so this works the same against any backing model
 * supported by Spring AI.
 */
public class EventCaptureAdvisor implements CallAdvisor {

    private final EventLog eventLog;
    private final String projectId;
    private final String agentId;
    private final String agentName;

    private final AtomicInteger cycleCount = new AtomicInteger(0);
    private final AtomicInteger messageCount = new AtomicInteger(0);
    private final AtomicLong inputTokens = new AtomicLong(0);
    private final AtomicLong outputTokens = new AtomicLong(0);
    private final AtomicLong totalTokens = new AtomicLong(0);
    /** Cumulative wall-clock time spent inside model round-trips for this agent (ms). */
    private final AtomicLong totalLatencyMs = new AtomicLong(0);

    public EventCaptureAdvisor(EventLog eventLog, String projectId, String agentId, String agentName) {
        this.eventLog = eventLog;
        this.projectId = projectId;
        this.agentId = agentId;
        this.agentName = agentName;
    }

    @Override
    public String getName() {
        return "EventCaptureAdvisor[" + agentName + "]";
    }

    @Override
    public int getOrder() {
        return 0;
    }

    @Override
    public ChatClientResponse adviseCall(ChatClientRequest request, CallAdvisorChain chain) {
        eventLog.emit(AgentEvent.of(projectId, agentId, agentName, "BEFORE_MODEL_CALL",
                request.prompt().getContents()));

        long callStart = System.currentTimeMillis();
        ChatClientResponse response = chain.nextCall(request);
        long callElapsed = System.currentTimeMillis() - callStart;

        ChatResponse chatResponse = response.chatResponse();
        String text = chatResponse != null
                && chatResponse.getResult() != null
                && chatResponse.getResult().getOutput() != null
                ? chatResponse.getResult().getOutput().getText()
                : "";
        eventLog.emit(AgentEvent.of(projectId, agentId, agentName, "AFTER_MODEL_CALL", text));

        // Aggregate counters. Each adviseCall is one round-trip to the model — bumps the
        // cycle (and message) counter by 1, pulls token deltas from the response metadata
        // when the provider populated it, and accumulates wall-clock latency so the UI
        // card shows a running total even between turns.
        cycleCount.incrementAndGet();
        messageCount.incrementAndGet();
        totalLatencyMs.addAndGet(callElapsed);
        if (chatResponse != null && chatResponse.getMetadata() != null) {
            Usage usage = chatResponse.getMetadata().getUsage();
            if (usage != null) {
                addNonNull(inputTokens, usage.getPromptTokens());
                addNonNull(outputTokens, usage.getCompletionTokens());
                addNonNull(totalTokens, usage.getTotalTokens());
            }
        }

        return response;
    }

    private static void addNonNull(AtomicLong target, Integer delta) {
        if (delta != null && delta > 0) {
            target.addAndGet(delta);
        }
    }

    /** Number of model round-trips this agent has completed so far in the run. */
    public int cycleCount() { return cycleCount.get(); }

    /** Number of model messages produced so far. Currently 1:1 with cycleCount. */
    public int messageCount() { return messageCount.get(); }

    public int inputTokens() { return (int) Math.min(Integer.MAX_VALUE, inputTokens.get()); }

    public int outputTokens() { return (int) Math.min(Integer.MAX_VALUE, outputTokens.get()); }

    public int totalTokens() {
        long t = totalTokens.get();
        if (t > 0) return (int) Math.min(Integer.MAX_VALUE, t);
        // Fallback: some providers populate prompt+completion but not total.
        long sum = inputTokens.get() + outputTokens.get();
        return (int) Math.min(Integer.MAX_VALUE, sum);
    }

    /**
     * Cumulative wall-clock time (in milliseconds) this agent has spent inside model
     * round-trips so far. The UI card uses this as the running total — it never
     * decreases, even between turns when the agent is idle waiting on peers.
     */
    public long totalLatencyMs() {
        return totalLatencyMs.get();
    }
}
