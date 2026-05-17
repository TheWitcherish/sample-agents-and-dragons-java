package com.witcherish.samples.agents.observer;

import org.springframework.ai.chat.client.ChatClientRequest;
import org.springframework.ai.chat.client.ChatClientResponse;
import org.springframework.ai.chat.client.advisor.api.CallAdvisor;
import org.springframework.ai.chat.client.advisor.api.CallAdvisorChain;

public class EventCaptureAdvisor implements CallAdvisor {

    private final EventLog eventLog;
    private final String projectId;
    private final String agentId;
    private final String agentName;

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

        ChatClientResponse response = chain.nextCall(request);

        String text = response.chatResponse() != null
                && response.chatResponse().getResult() != null
                && response.chatResponse().getResult().getOutput() != null
                ? response.chatResponse().getResult().getOutput().getText()
                : "";
        eventLog.emit(AgentEvent.of(projectId, agentId, agentName, "AFTER_MODEL_CALL", text));

        return response;
    }
}
