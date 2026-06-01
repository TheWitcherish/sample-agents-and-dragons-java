import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.bedrock.converse.BedrockProxyChatModel;
import org.springframework.ai.bedrock.converse.BedrockChatOptions;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import software.amazon.awssdk.services.bedrockruntime.BedrockRuntimeClient;

// --- Tools ---

class TaskTools { /* same as Mono — createTask / updateTask */ }

// --- ChatModel factory (each node can use a different model) ---

ChatModel modelFor(String modelId) {
    return BedrockProxyChatModel.builder()
        .bedrockRuntimeClient(BedrockRuntimeClient.create())
        .defaultOptions(BedrockChatOptions.builder()
            // 32768, not the ~4096 default: a full inline game overflows a small cap and
            // the model stops mid-<html>, handing the reviewer a truncated, broken file.
            .model(modelId).temperature(0.3).maxTokens(32768).build())
        .build();
}

// --- Graph: define nodes (agents) ---
// NOTE: graph nodes do NOT get writeResult. Its returnDirect=true would replace a node's
// reply with a URL string — unreviewable by a downstream node. Instead each node emits its
// work as plain text (the Frontend emits raw HTML), and the framework persists the
// most-downstream HTML output AFTER the DAG completes (see findHtmlOutput below).

ChatClient architect = ChatClient.builder(modelFor("eu.anthropic.claude-haiku-4-5-20251001-v1:0"))
    .defaultSystem("You are a Game Logic Architect. Design the data model, state machine, and key user events.")
    .defaultTools(new TaskTools())
    .build();

ChatClient frontend = ChatClient.builder(modelFor("eu.anthropic.claude-sonnet-4-6"))
    .defaultSystem("You are a Frontend Developer. Implement a SINGLE self-contained index.html. Reply with raw HTML starting at <!DOCTYPE html>.")
    .defaultTools(new TaskTools())
    .build();

ChatClient reviewer = ChatClient.builder(modelFor("eu.anthropic.claude-sonnet-4-6"))
    .defaultSystem("You are a Code Reviewer. Fix bugs in the upstream index.html and reply with the COMPLETE corrected document.")
    .defaultTools(new TaskTools())
    .build();

// --- Graph: define edges (connections) ---
//
//   Architect ──→ Frontend ──→ Reviewer   (Reviewer is the SINK → its fixed HTML ships)
//
// The topology decides who runs — not the LLM. Put the Code Reviewer DOWNSTREAM of the
// Frontend so its corrected HTML is the most-downstream document and wins the ship.

record Edge(String source, String target) {}
var edges = List.of(
    new Edge("architect", "frontend"),
    new Edge("frontend", "reviewer")
);

// --- Execute: topological order, parallel ready-batches ---
// Kahn's algorithm gives the order. Each "ready batch" (every node whose predecessors are
// all done) runs concurrently on Java 25 virtual threads. Here the chain is linear, so the
// batches are singletons; siblings with no shared dependency would run together.

String quest = """
    Create a snake-style game. Add levels with different layouts,
    power-ups (speed boost, invincibility), leaderboard, and smooth
    animations. Include explosion animations and game over screen.
    Keep it simple but playable on iPad tablet and touch screen smartphone.
    """;

Map<String, String> outputs = new ConcurrentHashMap<>();
List<String> order = List.of("architect", "frontend", "reviewer");   // from Kahn's topo-sort

try (var pool = Executors.newVirtualThreadPerTaskExecutor()) {
    Set<String> done = ConcurrentHashMap.newKeySet();
    while (done.size() < order.size()) {
        // Ready batch = unfinished nodes whose every predecessor is already done.
        List<String> batch = order.stream()
            .filter(id -> !done.contains(id))
            .filter(id -> done.containsAll(predecessorsOf(id, edges)))
            .toList();
        var futures = batch.stream()
            .map(id -> CompletableFuture.runAsync(() -> {
                // Input propagation: original task + each upstream output, labelled by node.
                String prompt = quest;
                for (String src : predecessorsOf(id, edges)) {
                    prompt += "\n\n--- Output from " + src + " ---\n" + outputs.get(src);
                }
                outputs.put(id, nodeFor(id).prompt().user(prompt).call().content());
            }, pool))
            .toList();
        CompletableFuture.allOf(futures.toArray(CompletableFuture[]::new)).join();
        done.addAll(batch);
    }
}

// --- Persist: walk topo order in REVERSE, ship the most-downstream HTML document ---
// Usually the Frontend, but a downstream Code Reviewer's corrected HTML overrides it.
String html = null;
for (int i = order.size() - 1; i >= 0 && html == null; i--) {
    String out = stripFence(outputs.get(order.get(i))).strip();
    if (out.toLowerCase().startsWith("<!doctype html") || out.toLowerCase().startsWith("<html")) {
        html = out;   // framework calls writeResult(html) here, after the DAG completes
    }
}
