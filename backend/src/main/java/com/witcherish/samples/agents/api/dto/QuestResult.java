package com.witcherish.samples.agents.api.dto;

import com.fasterxml.jackson.annotation.JsonClassDescription;
import com.fasterxml.jackson.annotation.JsonPropertyDescription;

/**
 * Strands-style structured output. Every pattern's final {@link org.springframework.ai.chat.client.ChatClient}
 * call constrains its reply to this shape via Spring AI's {@code BeanOutputConverter}, so
 * the frontend never has to parse prose to find the deliverable URL.
 *
 * <p>The model reads its own JSON-schema description from the {@code @JsonPropertyDescription}
 * annotations Spring AI auto-injects into the format instruction.
 */
@JsonClassDescription("Final structured result of an agentic quest run.")
public record QuestResult(

        @JsonPropertyDescription("One short paragraph summarising what the team built and any noteworthy choices.")
        String summary,

        @JsonPropertyDescription("Public URL to the persisted index.html deliverable, exactly as returned by the writeResult tool. Empty string when no deliverable was produced.")
        String deliverableUrl,

        @JsonPropertyDescription("Outcome of the run: COMPLETED on success, ON_ERROR if a fatal error prevented completion.")
        String status

) {
    public static QuestResult ok(String summary, String url) {
        return new QuestResult(summary == null ? "" : summary, url == null ? "" : url, "COMPLETED");
    }

    public static QuestResult error(String summary) {
        return new QuestResult(summary == null ? "" : summary, "", "ON_ERROR");
    }
}
