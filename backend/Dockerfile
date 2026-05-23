# syntax=docker/dockerfile:1.7
# Build & run sample-agents-and-dragons on ARM64 (AgentCore Runtime is Graviton-only).
# Build with:  docker buildx build --platform linux/arm64 ...
#
# Runtime expectations:
#   - Spring Boot 3.5.14 + Spring AI 1.1.6 + MCP SDK 1.1.0 (see pom.xml)
#   - Listens on $PORT (default 8080), AgentCore-compatible /invocations endpoint
#   - Reads AWS_REGION + BEDROCK_MODEL_ID from env (set by AgentCore Runtime)
#   - Writes deliverables to S3 (when bucket configured) or $SAD_LOCAL_RUNS_DIR
#     as a fallback. /app is read-only at runtime; /tmp is ephemeral RW.

# --- build stage ----------------------------------------------------------
FROM --platform=linux/arm64 maven:3.9-eclipse-temurin-25 AS build
WORKDIR /workspace

# Layer-cache the Maven dependency download. Includes spring-ai-bedrock-converse,
# spring-ai-agentcore-runtime-starter, mcp-core, and the AWS SDK v2 transitively.
COPY pom.xml ./
RUN mvn -B -q -e -ntp dependency:go-offline

COPY src ./src
RUN mvn -B -q -e -ntp -DskipTests package

# --- runtime stage --------------------------------------------------------
FROM --platform=linux/arm64 eclipse-temurin:25-jre
WORKDIR /app

# Temurin's runtime image already ships a UID-1000 user; pick a fixed high UID
# instead so we don't collide. AWS AgentCore samples conventionally use 10001.
RUN useradd --system --uid 10001 --create-home spring

COPY --from=build /workspace/target/sample-agents-and-dragons.jar /app/app.jar
RUN chown spring:spring /app/app.jar

USER spring:spring

EXPOSE 8080

# JVM flags:
# -XX:+UseContainerSupport (default on JDK 25, kept explicit) reads cgroup memory.
# -XX:MaxRAMPercentage=65 caps heap at 65% of container memory. The AWS SDK v2
#   Netty allocator + Bedrock streaming buffers + Spring AI tool-call machinery
#   reserve a few hundred MB of native (off-heap) memory; 65% leaves enough
#   room on 512 MB / 1 GB AgentCore tiers without OOM-killing on cold start.
# -Dfile.encoding=UTF-8 pins the default charset (Java 18+ default, but explicit
#   here so a future base-image swap can't regress text handling for HTML
#   deliverables and Bedrock UTF-8 responses).
ENV JAVA_OPTS="-XX:+UseContainerSupport -XX:MaxRAMPercentage=65 -Dfile.encoding=UTF-8"

# /app is read-only for the spring user (UID 10001); writeResult's local fallback
# needs a writable directory. AgentCore mounts /tmp as ephemeral RW.
ENV SAD_LOCAL_RUNS_DIR=/tmp/runs

# No HEALTHCHECK directive: the eclipse-temurin:25-jre base image ships without
# wget/curl, so a meaningful HEALTHCHECK would require installing one (extra
# layer + ~5MB) for no production benefit — AgentCore Runtime polls /ping
# itself for liveness, and local development is run via `mvn spring-boot:run`,
# not `docker run`.

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
