import org.springframework.ai.chat.client.ChatClient;
import org.springframework.ai.bedrock.converse.BedrockProxyChatModel;
import org.springframework.ai.bedrock.converse.BedrockChatOptions;
import org.springframework.ai.tool.annotation.Tool;
import org.springframework.ai.tool.annotation.ToolParam;
import org.springframework.ai.tool.ToolCallback;
import org.springframework.ai.tool.definition.ToolDefinition;
import org.springframework.ai.tool.metadata.ToolMetadata;
import software.amazon.awssdk.services.bedrockruntime.BedrockRuntimeClient;

// --- Tools ---

class WriteResultTool { /* persists index.html */ }
class TaskTools { /* createTask / updateTask */ }

// --- The handoff tool: peers transfer control to each other ---
// KEY: the `context` field is how a peer carries its WORK to the next peer.
// If you just built or fixed the index.html, you paste the WHOLE document here —
// it's the only channel that delivers your code to the reviewer.

ToolCallback buildHandoffTool(String selfName, List<String> peerNames) {
    return new ToolCallback() {
        public ToolDefinition getToolDefinition() {
            return ToolDefinition.builder()
                .name("handoff_to_agent")
                .description("Transfer control to a peer: " + String.join(", ", peerNames))
                .inputSchema("""
                    {"type":"object","properties":{
                      "agent_name":{"type":"string"},
                      "message":{"type":"string"},
                      "context":{"type":"string",
                        "description":"The running deliverable. If you produced or fixed the index.html, paste the COMPLETE document (doctype to </html>) here."}
                    },"required":["agent_name","message"]}
                    """).build();
        }
        public ToolMetadata getToolMetadata() {
            return ToolMetadata.builder().returnDirect(true).build(); // ends the turn
        }
        public String call(String toolInput) {
            // Parse target, record handoff, stop this agent's turn
            return "Handoff accepted. Stop now.";
        }
    };
}

// --- Swarm peers: each gets handoff + their specialist tools ---

ChatClient architect = ChatClient.builder(modelFor("eu.anthropic.claude-haiku-4-5-20251001-v1:0"))
    .defaultSystem("You are the Architect. Sketch a TERSE plan, then hand off to a peer.")
    .defaultToolCallbacks(buildHandoffTool("Architect", List.of("Frontend_Developer", "Reviewer")))
    .defaultTools(new TaskTools())
    .build();

ChatClient frontend = ChatClient.builder(modelFor("eu.anthropic.claude-sonnet-4-6"))
    .defaultSystem("""
        You are the Frontend Developer. IMPLEMENT the complete index.html (doctype to
        </html>, all CSS/JS inline). Do NOT call writeResult. Hand off to the Reviewer
        and paste your COMPLETE index.html into the handoff `context` field.""")
    .defaultToolCallbacks(buildHandoffTool("Frontend", List.of("Architect", "Reviewer")))
    .defaultTools(new TaskTools())
    .build();

ChatClient reviewer = ChatClient.builder(modelFor("eu.anthropic.claude-sonnet-4-6"))
    .defaultSystem("""
        You are the Reviewer. Review the "Current index.html" in your input and FIX
        every blocking bug — the code is always there, never claim it's missing. Then
        call writeResult to ship YOUR corrected version.""")
    .defaultToolCallbacks(buildHandoffTool("Reviewer", List.of("Architect", "Frontend_Developer")),
                          writeResultTool)
    .defaultTools(new TaskTools())
    .build();

// --- Fix #1: capture the deliverable SERVER-SIDE so it reaches the reviewer ---
// An LLM is unreliable about pasting a full HTML doc through a tool field, so we
// ALSO scan each reply + handoff context for a complete document and hold the
// latest. This is what GraphPattern (findHtmlOutput) and OrchestratorPattern
// (HtmlHolder) already do — the swarm was the odd one out.

String extractHtml(String text) {
    if (text == null) return null;
    String t = text.strip();
    if (t.startsWith("```")) t = t.replaceAll("^```\\w*\\n", "").replaceAll("```$", "").strip();
    String lower = t.toLowerCase();
    return (lower.startsWith("<!doctype html") || lower.startsWith("<html")) ? t : null;
}

// --- Fix #2: an HTML-READINESS GATE — "took a turn" is NOT "built the artefact" ---
// The deeper bug: a weak junior model (e.g. Qwen as Frontend Dev) takes its turn and
// hands off with PROSE or a stub — no index.html. The swarm marked it "consulted" and
// marched on, so the Reviewer correctly reported "no actual implementation code was
// included". Capturing/propagating HTML can't help when the HTML was NEVER produced.
// So before advancing past an IMPLEMENTER peer, verify it actually emitted a document.
// If not: bounce control straight back with a hard build order (bounded retries), then
// escalate to a code-capable peer (reviewer / CTO) that builds from the spec.

boolean isImplementer(String peer) { return peer.equals("Frontend_Developer"); }
int MAX_BUILD_RETRIES = 2;

// --- Swarm loop: peers hand off until someone ships ---
// Architect → Frontend (builds HTML) → Reviewer (fixes HTML → writeResult → ends)

var peers = Map.of("Architect", architect, "Frontend_Developer", frontend, "Reviewer", reviewer);
var current = "Architect";
String context = "";
String currentHtml = null;   // the running deliverable, captured server-side
int buildRetries = 0;        // bounded retries to make the implementer actually build
String quest = """
    Create a snake-style game. Add levels with different layouts,
    power-ups (speed boost, invincibility), leaderboard, and smooth
    animations. Include explosion animations and game over screen.
    Keep it simple but playable on iPad tablet and touch screen smartphone.
    """;

for (int turn = 0; turn < 20; turn++) {  // MAX_HANDOFFS = 20
    // Inject the captured HTML so the Reviewer ALWAYS sees real code to fix,
    // not just the Architect's spec — this was bug #1: the reviewer kept saying
    // "no actual HTML was provided" because the dev's code never reached it.
    String prompt = quest
        + (context.isBlank() ? "" : "\n\nContext from previous peer:\n" + context)
        + (currentHtml == null ? "" : "\n\n--- Current index.html (review/fix THIS) ---\n" + currentHtml);
    String reply = peers.get(current).prompt().user(prompt).call().content();

    // Capture an HTML deliverable from the reply OR the handoff context. Latest wins,
    // so the Reviewer's correction overwrites the Frontend's draft.
    String html = extractHtml(reply);
    if (html == null) html = extractHtml(handoff.context);
    if (html != null) currentHtml = html;

    // HTML-READINESS GATE (bug #2). If the implementer ended its turn with NO document
    // anywhere, the deliverable doesn't exist — don't advance to the reviewer with empty
    // hands. Bounce back with a build order; after MAX_BUILD_RETRIES, escalate to a
    // code-capable peer that builds from the spec.
    if (isImplementer(current) && currentHtml == null) {
        if (buildRetries++ < MAX_BUILD_RETRIES) {
            context = "You handed off WITHOUT the index.html. It does not exist yet — "
                + "nobody can review or ship it. Output the COMPLETE runnable index.html now.";
            continue;  // re-run the SAME implementer; do not advance
        }
        current = "Reviewer";   // escalate: a code-capable peer builds from the spec
        context = "The Frontend dev couldn't deliver. BUILD the complete index.html yourself.";
        continue;
    }

    if (/* handoff requested */) {
        current = handoff.targetName;   // peer decides who's next
        context = handoff.context;      // carry work forward
    } else {
        break;  // no handoff = final answer (writeResult shipped)
    }
}

// Belt-and-braces: persist the latest captured HTML even if the model ended in
// prose or hit a cap. Guarantees the corrected index.html ships.
if (currentHtml != null) writeResultTool.writeResult(currentHtml, null);
