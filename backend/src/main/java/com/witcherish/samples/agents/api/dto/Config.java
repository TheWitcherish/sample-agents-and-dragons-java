package com.witcherish.samples.agents.api.dto;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * Optional config block. The Java backend doesn't use any of these fields directly —
 * tools are in-memory, no MCP gateway, no S3, no SigV4 token to propagate — but the
 * record exists so the React frontend can post its full payload without 400s.
 */
@JsonIgnoreProperties(ignoreUnknown = true)
public record Config(
        @JsonProperty("gateway_url") String gatewayUrl,
        @JsonProperty("token") String token,
        @JsonProperty("s3_bucket_name") String s3BucketName
) {}
