package com.witcherish.samples.agents.patterns;

import com.witcherish.samples.agents.api.dto.QuestResult;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.chat.model.ChatModel;
import org.springframework.ai.chat.prompt.ChatOptions;
import org.springframework.stereotype.Component;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * Strands-style structured-output coercion.
 *
 * <p>Each pattern produces a free-form final answer (HTML, prose, possibly with the URL
 * mentioned by name). This helper takes that prose and asks a fresh, tool-less ChatClient
 * to coerce it into a {@link QuestResult} record using Spring AI's
 * {@code BeanOutputConverter} (driven by {@code .entity(Class)} on the call response).
 *
 * <p>The fallback path matters for live demos: if the LLM fails to honour the JSON
 * schema (rare on Sonnet/Opus, occasional on smaller models), we extract the URL with
 * a regex and synthesise a {@link QuestResult} ourselves so the frontend always gets a
 * usable structured payload.
 */
@Component
public class StructuredAnswer {

    private static final Logger log = LoggerFactory.getLogger(StructuredAnswer.class);

    private static final String FORMATTER_SYSTEM = """
            You are a strict formatting function. You receive a description of a quest run
            written by another agent. Your only job is to summarise it as JSON conforming to
            the QuestResult schema. Never invent fields, never write prose outside JSON.
            Set deliverableUrl to the exact URL the prior agent reported (look for an
            'https://...' or 'file://...' URL pointing at index.html). If no deliverable URL
            is mentioned, set deliverableUrl to "". Set status to "COMPLETED" unless the
            prior agent reported an error, in which case set it to "ON_ERROR".
            """;

    /** Permissive URL extractor: catches https/http/file URLs that point at the deliverable. */
    private static final Pattern DELIVERABLE_URL = Pattern.compile(
            "(https?://\\S+?/index\\.html|file://\\S+?/index\\.html)");

    private final ChatModel chatModel;

    public StructuredAnswer(ChatModel chatModel) {
        this.chatModel = chatModel;
    }

    /**
     * Coerce {@code freeFormAnswer} into a {@link QuestResult}. Never throws — falls back
     * to a regex-extracted URL if the LLM call fails or produces invalid JSON.
     */
    public QuestResult coerce(String freeFormAnswer) {
        String safe = freeFormAnswer == null ? "" : freeFormAnswer;
        try {
            // Build a minimal tool-less ChatClient with low temperature; we want
            // deterministic JSON, not creative writing.
            ChatClient formatter = ChatClient.builder(chatModel)
                    .defaultSystem(FORMATTER_SYSTEM)
                    .defaultOptions(ChatOptions.builder()
                            .temperature(0.0)
                            .maxTokens(2048)
                            .build())
                    .build();

            QuestResult coerced = formatter.prompt()
                    .user("Quest run report:\n\n" + safe)
                    .call()
                    .entity(QuestResult.class);
            if (coerced != null) {
                return coerced;
            }
            log.warn("[structured-output] formatter returned null — falling back to regex extraction");
        } catch (Exception e) {
            log.warn("[structured-output] formatter call failed — falling back to regex extraction", e);
        }
        return regexFallback(safe);
    }

    private static QuestResult regexFallback(String text) {
        Matcher m = DELIVERABLE_URL.matcher(text);
        String url = m.find() ? m.group(1) : "";
        boolean errorMentioned = text.toLowerCase().contains("error");
        String summary = text.length() <= 800 ? text : text.substring(0, 800) + "…";
        if (errorMentioned && url.isBlank()) {
            return QuestResult.error(summary);
        }
        return QuestResult.ok(summary, url);
    }
}
