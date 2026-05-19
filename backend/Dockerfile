# syntax=docker/dockerfile:1.7
# Build & run sample-agents-and-dragons on ARM64 (AgentCore Runtime is Graviton-only).
# Build with:  docker buildx build --platform linux/arm64 ...

# --- build stage ----------------------------------------------------------
FROM --platform=linux/arm64 maven:3.9-eclipse-temurin-25 AS build
WORKDIR /workspace

# Layer-cache the Maven dependency download.
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
USER spring:spring

COPY --from=build /workspace/target/sample-agents-and-dragons.jar /app/app.jar

EXPOSE 8080

# JVM flags:
# -XX:+UseContainerSupport (default on JDK 25, but explicit) reads cgroup memory limits
# -XX:MaxRAMPercentage caps heap at 75% of container memory — leaves room for
#   metaspace, code cache, native buffers used by the Bedrock SDK.
ENV JAVA_OPTS="-XX:+UseContainerSupport -XX:MaxRAMPercentage=75 -Djava.security.egd=file:/dev/./urandom"
# /app is read-only for the spring user (UID 10001); writeResult's local fallback
# needs a writable directory. AgentCore mounts /tmp as ephemeral RW.
ENV SAD_LOCAL_RUNS_DIR=/tmp/runs

ENTRYPOINT ["sh", "-c", "exec java $JAVA_OPTS -jar /app/app.jar"]
