package com.witcherish.samples.agents.api.dto;

public record Config(
        String gatewayUrl,
        String token,
        String s3BucketName
) {}
