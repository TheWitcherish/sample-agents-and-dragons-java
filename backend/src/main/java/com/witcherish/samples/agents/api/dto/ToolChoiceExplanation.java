package com.witcherish.samples.agents.api.dto;

import com.fasterxml.jackson.annotation.JsonClassDescription;
import com.fasterxml.jackson.annotation.JsonPropertyDescription;
import org.springframework.ai.tool.annotation.ToolParam;

import java.util.List;

/**
 * Reasoning sidecar that every "important" tool call is asked to carry. The LLM emits
 * this record alongside the tool's normal arguments; the runtime captures the values
 * (without acting on them) and forwards them to the Adventure Log so viewers see the
 * model's <em>thinking</em>, not just its actions.
 *
 * <p>Aligned with the Spring AI Recipes
 * <a href="https://github.com/habuma/spring-ai-recipes/tree/main/tool-choice-explanation">tool-choice-explanation</a>
 * recipe. That recipe uses {@code AugmentedToolCallbackProvider} from Spring AI 2.0.0-M5
 * to wrap tools with a typed reasoning argument; on Spring AI 1.1.x we instead declare
 * an explicit {@code reasoning} parameter on the tool method (or include it in the
 * JSON-schema of an inline {@link org.springframework.ai.tool.ToolCallback}) — the
 * same pedagogical effect, no milestone dependency.
 *
 * <p>Optional: if the model omits the field on a given tool call (rare with Sonnet 4.x),
 * the runtime simply skips reasoning emission and proceeds with the action.
 */
@JsonClassDescription("Reasoning sidecar accompanying every important tool call.")
public record ToolChoiceExplanation(

        @ToolParam(required = true,
                description = "Why you're calling this tool right now and what you expect to get back. One short sentence.")
        @JsonPropertyDescription("Why you're calling this tool right now and what you expect to get back. One short sentence.")
        String innerThought,

        @ToolParam(required = false,
                description = "How confident you are about this choice: \"high\", \"medium\", or \"low\".")
        @JsonPropertyDescription("How confident you are about this choice: high, medium, or low.")
        String confidence,

        @ToolParam(required = false,
                description = "Key insights worth remembering for the rest of the quest. Bullet points, no prose.")
        @JsonPropertyDescription("Key insights worth remembering for the rest of the quest. Bullet points, no prose.")
        List<String> memoryNotes

) {
    /** Empty placeholder when a caller doesn't supply reasoning (legacy or stripped contexts). */
    public static ToolChoiceExplanation empty() {
        return new ToolChoiceExplanation("", "", List.of());
    }

    public boolean isPresent() {
        return innerThought != null && !innerThought.isBlank();
    }

    /** Pretty-print the reasoning as one block of text — used as the AgentMessage body. */
    public String render() {
        StringBuilder sb = new StringBuilder();
        if (innerThought != null && !innerThought.isBlank()) {
            sb.append(innerThought.strip());
        }
        if (confidence != null && !confidence.isBlank()) {
            sb.append(" [confidence: ").append(confidence.strip()).append("]");
        }
        if (memoryNotes != null && !memoryNotes.isEmpty()) {
            sb.append("\nNotes: ");
            sb.append(String.join("; ", memoryNotes));
        }
        return sb.toString();
    }
}
