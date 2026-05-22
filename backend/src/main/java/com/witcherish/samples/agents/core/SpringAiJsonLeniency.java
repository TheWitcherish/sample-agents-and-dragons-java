package com.witcherish.samples.agents.core;

import com.fasterxml.jackson.core.json.JsonReadFeature;
import jakarta.annotation.PostConstruct;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.model.ModelOptionsUtils;
import org.springframework.ai.util.json.JsonParser;
import org.springframework.stereotype.Component;

/**
 * Workaround for a Spring AI 1.1.x regression: when the model emits a {@code tool_use}
 * block whose input contains a raw newline (Bedrock Sonnet/Haiku do this when the LLM
 * paraphrases a multi-line user prompt into a tool argument), Spring AI's
 * {@link ModelOptionsUtils#OBJECT_MAPPER} fails to re-parse it on the next request
 * with {@code JsonParseException: Illegal unquoted character ((CTRL-CHAR, code 10))}.
 *
 * <p>The fix flips {@link JsonReadFeature#ALLOW_UNESCAPED_CONTROL_CHARS} on the
 * shared {@code OBJECT_MAPPER}'s underlying {@code JsonFactory}, making every
 * Spring AI deserialization tolerant of raw control chars inside string values.
 *
 * <p>Spring AI 1.1.x has <em>two</em> internal Jackson mappers; both need patching:
 * <ul>
 *   <li>{@link ModelOptionsUtils#OBJECT_MAPPER} — re-encodes prior {@code tool_use.input}
 *       blocks during {@code BedrockProxyChatModel.createRequest}.</li>
 *   <li>{@link JsonParser#getObjectMapper()} — parses the LLM's freshly-emitted
 *       {@code tool_use.input} JSON inside {@code MethodToolCallback.extractToolArguments}
 *       when invoking a {@code @Tool}-annotated POJO method.</li>
 * </ul>
 *
 * <p>Why a global tweak instead of per-pattern lenient mappers: the offending parses
 * happen deep inside Spring AI's machinery where we have no call site to interpose.
 * Patching the static mappers is the minimal change that keeps the orchestrator,
 * swarm, and graph patterns working without forking Spring AI.
 *
 * <p>Remove this once Spring AI 2.x exposes a configurable jsonMapper bean and we
 * upgrade — the patched feature will land upstream as a default.
 */
@Component
public class SpringAiJsonLeniency {

    private static final Logger log = LoggerFactory.getLogger(SpringAiJsonLeniency.class);

    @PostConstruct
    void enableLeniency() {
        var feature = JsonReadFeature.ALLOW_UNESCAPED_CONTROL_CHARS.mappedFeature();
        ModelOptionsUtils.OBJECT_MAPPER.getFactory().enable(feature);
        JsonParser.getObjectMapper().getFactory().enable(feature);
        log.info("[json-leniency] enabled ALLOW_UNESCAPED_CONTROL_CHARS on Spring AI's "
                + "ModelOptionsUtils.OBJECT_MAPPER and JsonParser.OBJECT_MAPPER");
    }
}
