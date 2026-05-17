package com.witcherish.samples.agents.tools;

import com.fasterxml.jackson.core.json.JsonReadFeature;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.ai.tool.definition.ToolDefinition;
import org.springframework.ai.tool.metadata.ToolMetadata;
import software.amazon.awssdk.auth.credentials.DefaultCredentialsProvider;
import software.amazon.awssdk.core.sync.RequestBody;
import software.amazon.awssdk.regions.Region;
import software.amazon.awssdk.services.s3.S3Client;
import software.amazon.awssdk.services.s3.model.PutObjectRequest;
import software.amazon.awssdk.services.s3.model.ServerSideEncryption;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;

/**
 * Per-request {@code write_result} tool. Persists the quest's deliverable so participants
 * can <em>play it</em>: a single self-contained {@code index.html} that any browser can render.
 *
 * <h2>Two storage modes</h2>
 * <ul>
 *   <li><strong>S3</strong> when {@link #bucket} is non-blank: writes to
 *       {@code s3://<bucket>/apps/<projectId>/index.html} (KMS server-side-encrypted).
 *       Returns the {@code https://<bucket>.s3.<region>.amazonaws.com/...} URL so the
 *       orchestrator can hand it to the user.</li>
 *   <li><strong>Local file</strong> when {@link #bucket} is blank: writes to
 *       {@code target/runs/<projectId>/index.html} relative to the working directory and
 *       returns a {@code file://...} URL. Lets the talk demo run with no AWS S3 setup.</li>
 * </ul>
 *
 * <p>This tool is instantiated <em>per HTTP request</em> by the pattern code and wired
 * into every agent's tool list. That way the {@code projectId} stays scoped to the run
 * (no risk of one quest's content overwriting another), and the bucket name is read
 * straight from the {@code config} block of the {@code RequestPayload}.
 */
public class WriteResultTool {

    private static final Logger log = LoggerFactory.getLogger(WriteResultTool.class);

    /**
     * Lenient parser used by {@link #asToolCallback()}. Bedrock often emits raw newlines
     * inside {@code content} when the LLM passes a multi-line HTML document — the
     * default Spring AI mapper rejects those as JSON parse errors. We tolerate them.
     */
    private static final ObjectMapper LENIENT_TOOL_INPUT = JsonMapper.builder()
            .enable(JsonReadFeature.ALLOW_UNESCAPED_CONTROL_CHARS)
            .build();

    private static final String WRITE_RESULT_INPUT_SCHEMA = """
            {
              "type": "object",
              "properties": {
                "content": {
                  "type": "string",
                  "description": "The complete HTML document (with embedded CSS and JavaScript) to persist."
                }
              },
              "required": ["content"]
            }
            """;

    private static final String WRITE_RESULT_DESCRIPTION =
            "Persist the project's deliverable as a single self-contained index.html. " +
            "Use this once you have the final HTML/CSS/JavaScript for the requested app. " +
            "The 'content' parameter must be the entire HTML document, ready to render in a browser. " +
            "Returns a URL the user can open to play the deliverable. " +
            "Call this tool exactly once at the end of the run.";

    private final String projectId;
    private final String bucket;
    private final String region;

    /** Lazily initialised: only when an S3 write actually happens. */
    private volatile S3Client s3;

    public WriteResultTool(String projectId, String bucket, String region) {
        this.projectId = projectId;
        this.bucket = bucket;
        this.region = (region == null || region.isBlank()) ? "us-east-1" : region;
    }

    @Tool(description = WRITE_RESULT_DESCRIPTION)
    public String writeResult(
            @ToolParam(description = "The complete HTML document (with embedded CSS and JavaScript) to persist.")
            String content) {
        return doWrite(content);
    }

    /**
     * Return this tool wrapped as a {@link ToolCallback} so it goes through the lenient
     * parser instead of {@code MethodToolCallback}'s strict one. Use this in patterns
     * that expect tool inputs to contain multi-line content (HTML, code, prose).
     */
    public ToolCallback asToolCallback() {
        ToolDefinition definition = ToolDefinition.builder()
                .name("writeResult")
                .description(WRITE_RESULT_DESCRIPTION)
                .inputSchema(WRITE_RESULT_INPUT_SCHEMA)
                .build();
        // returnDirect=true: when the LLM calls writeResult, Spring AI returns the result
        // straight to the caller WITHOUT looping the model for one more turn. This dodges
        // a Spring AI 1.1.3 bug where re-encoding a previous tool_use.input containing raw
        // newlines into the next Bedrock request fails with a strict JSON parse error.
        // It's also good UX: once the deliverable is written, there's nothing left to say.
        ToolMetadata metadata = ToolMetadata.builder().returnDirect(true).build();
        return new ToolCallback() {
            @Override
            public ToolDefinition getToolDefinition() {
                return definition;
            }

            @Override
            public ToolMetadata getToolMetadata() {
                return metadata;
            }

            @Override
            public String call(String toolInput) {
                try {
                    @SuppressWarnings("unchecked")
                    Map<String, Object> parsed = LENIENT_TOOL_INPUT.readValue(toolInput, Map.class);
                    Object c = parsed.get("content");
                    return doWrite(c == null ? "" : c.toString());
                } catch (Exception e) {
                    log.error("write_result lenient-parse failed", e);
                    return "Error parsing write_result arguments: " + e.getMessage();
                }
            }
        };
    }

    private String doWrite(String content) {
        if (content == null || content.isBlank()) {
            return "Error: write_result called with empty content. Provide the complete index.html document.";
        }
        if (bucket == null || bucket.isBlank()) {
            return writeLocal(content);
        }
        return writeToS3(content);
    }

    private String writeLocal(String content) {
        try {
            Path dir = Paths.get("target", "runs", projectId);
            Files.createDirectories(dir);
            Path file = dir.resolve("index.html");
            Files.writeString(file, content);
            String url = file.toAbsolutePath().toUri().toString();
            log.info("write_result wrote {} bytes to {}", content.length(), url);
            return "Successfully wrote deliverable to " + url;
        } catch (Exception e) {
            log.error("write_result local fallback failed", e);
            return "Error writing deliverable locally: " + e.getMessage();
        }
    }

    private String writeToS3(String content) {
        try {
            String key = "apps/" + projectId + "/index.html";
            s3Client().putObject(
                    PutObjectRequest.builder()
                            .bucket(bucket)
                            .key(key)
                            .contentType("text/html")
                            .serverSideEncryption(ServerSideEncryption.AWS_KMS)
                            .build(),
                    RequestBody.fromString(content));
            String url = "https://" + bucket + ".s3." + region + ".amazonaws.com/" + key;
            log.info("write_result wrote {} bytes to s3://{}/{}", content.length(), bucket, key);
            return "Successfully wrote deliverable to " + url;
        } catch (Exception e) {
            log.error("write_result S3 write failed", e);
            return "Error writing deliverable to S3: " + e.getMessage();
        }
    }

    private S3Client s3Client() {
        S3Client local = s3;
        if (local == null) {
            synchronized (this) {
                local = s3;
                if (local == null) {
                    local = S3Client.builder()
                            .region(Region.of(region))
                            .credentialsProvider(DefaultCredentialsProvider.create())
                            .build();
                    s3 = local;
                }
            }
        }
        return local;
    }
}
