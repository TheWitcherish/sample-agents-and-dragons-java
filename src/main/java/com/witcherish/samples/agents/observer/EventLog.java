package com.witcherish.samples.agents.observer;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

import java.util.ArrayDeque;
import java.util.ArrayList;
import java.util.Deque;
import java.util.List;

@Component
public class EventLog {

    private static final Logger log = LoggerFactory.getLogger(EventLog.class);
    private static final int CAPACITY = 1000;

    private final Deque<AgentEvent> ring = new ArrayDeque<>(CAPACITY);

    public synchronized void emit(AgentEvent event) {
        if (ring.size() == CAPACITY) ring.removeFirst();
        ring.addLast(event);
        log.info("[{}] project={} agent={}({}) {}",
                event.phase(), event.projectId(), event.agentName(), event.agentId(),
                summarize(event.content()));
    }

    public synchronized List<AgentEvent> snapshot() {
        return new ArrayList<>(ring);
    }

    public synchronized List<AgentEvent> snapshotForProject(String projectId) {
        return ring.stream().filter(e -> projectId.equals(e.projectId())).toList();
    }

    public synchronized void clear() {
        ring.clear();
    }

    private static String summarize(String content) {
        if (content == null) return "";
        String oneLine = content.replace('\n', ' ').strip();
        return oneLine.length() <= 200 ? oneLine : oneLine.substring(0, 200) + "…";
    }
}
