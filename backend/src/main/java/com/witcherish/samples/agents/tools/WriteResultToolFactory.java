package com.witcherish.samples.agents.tools;

import com.witcherish.samples.agents.api.dto.Config;
import com.witcherish.samples.agents.api.dto.Project;
import com.witcherish.samples.agents.telemetry.McpTelemetryPublisher.Session;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

/**
 * Builds a per-request {@link WriteResultTool} closing over the current project's id
 * and the S3 bucket name from the wire payload's {@code Config} block.
 *
 * <p>Region is read from the same {@code spring.ai.bedrock.aws.region} property used by
 * the Bedrock chat model — keeping the deliverable bucket and the LLM in the same region
 * avoids cross-region egress.
 */
@Component
public class WriteResultToolFactory {

    private final String region;

    public WriteResultToolFactory(@Value("${spring.ai.bedrock.aws.region:us-east-1}") String region) {
        this.region = region;
    }

    public WriteResultTool build(Project project, Config config, Session telemetry) {
        String bucket = (config != null) ? config.s3BucketName() : null;
        return new WriteResultTool(project.id(), bucket, region, telemetry);
    }
}
