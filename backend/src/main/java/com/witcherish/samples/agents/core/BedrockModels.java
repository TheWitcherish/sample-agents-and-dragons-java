package com.witcherish.samples.agents.core;

public final class BedrockModels {

    /*
     * Bedrock requires inference-profile IDs (with a "us.", "eu.", or "global." prefix)
     * for the Claude 4 family — bare "anthropic.…" model IDs raise ValidationException.
     * Defaults here use the EU cross-region profile so the Spring Boot app can run
     * against Bedrock in eu-central-1; override via BEDROCK_MODEL_ID at runtime.
     */
    public static final String CLAUDE_HAIKU_4_5 = "eu.anthropic.claude-haiku-4-5-20251001-v1:0";
    public static final String CLAUDE_SONNET_4_6 = "eu.anthropic.claude-sonnet-4-6";
    public static final String CLAUDE_OPUS_4_7 = "eu.anthropic.claude-opus-4-7";

    public static final String DEFAULT = CLAUDE_SONNET_4_6;

    private BedrockModels() {}

    public static String resolve(String requested) {
        return (requested == null || requested.isBlank()) ? DEFAULT : requested;
    }
}
