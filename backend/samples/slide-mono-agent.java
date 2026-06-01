import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.bedrock.converse.BedrockProxyChatModel;
import org.springframework.ai.bedrock.converse.BedrockChatOptions;
import software.amazon.awssdk.services.bedrockruntime.BedrockRuntimeClient;

import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;

// --- Tools: what the agent can DO ---

class WriteResultTool {
    @Tool(description = "Persist the deliverable as index.html. Returns a URL to play it.")
    public String writeResult(
            @ToolParam(description = "The complete HTML document") String content) {
        Files.writeString(Path.of("target/runs/index.html"), content);
        return "Deliverable written to target/runs/index.html";
    }
}

class TaskTools {
    @Tool(description = "Create a task to track progress. Returns the task id.")
    public String createTask(
            @ToolParam(description = "Task name") String name,
            @ToolParam(description = "What needs to be done") String description) {
        return UUID.randomUUID().toString();
    }

    @Tool(description = "Update a task status: CREATED | IN_PROGRESS | COMPLETED")
    public String updateTask(
            @ToolParam(description = "Task id") String taskId,
            @ToolParam(description = "New status") String newStatus) {
        return "OK";
    }
}

// --- ChatModel: Amazon Bedrock + Claude Sonnet 4.5 ---

ChatModel chatModel = BedrockProxyChatModel.builder()
    .bedrockRuntimeClient(BedrockRuntimeClient.create())
    .defaultOptions(BedrockChatOptions.builder()
        .model("global.anthropic.claude-sonnet-4-5-20250929-v1:0")
        .temperature(0.3)
        // 32768, not the ~4096 default: a full inline game overflows a small cap and the
        // model stops mid-<html>, so a reviewer downstream sees a truncated, broken file.
        .maxTokens(32768)
        .build())
    .build();

// --- Agent Creation: Spring AI Mono Pattern ---

ChatClient agent = ChatClient.builder(chatModel)
    .defaultSystem("""
        You are the Game Development Studio CTO with Hands-on capabilities.
        You are able to deliver full software stack and game with polished,
        feature-complete HTML5 games. Output MUST be a SINGLE index.html file
        with ALL HTML, CSS, and JavaScript inline.
        """)
    .defaultTools(new WriteResultTool(), new TaskTools())
    .build();

// --- Invoke: one .call() = N agentic loop iterations ---
// Spring AI's ToolCallAdvisor re-enters the model until no more tool calls:
//   Turn 1 → agent plans, calls createTask(...)
//   Turn 2 → agent implements, calls updateTask(...)
//   Turn 3 → agent ships, calls writeResult(...) → loop ends

String response = agent.prompt()
    .user("""
        Create a snake-style game. Add levels with different layouts,
        power-ups (speed boost, invincibility), leaderboard, and smooth
        animations. Include explosion animations and game over screen.
        Keep it simple but playable on iPad tablet and touch screen smartphone.
        """)
    .call()
    .content();
