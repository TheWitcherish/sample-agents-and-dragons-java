package com.witcherish.samples.agents.core;

import com.witcherish.samples.agents.api.dto.AgentDefinition;

import java.util.Locale;

/**
 * Per-role and per-pattern system-prompt augmentations.
 *
 * <p>The seed data's prompts describe what each persona <em>is</em> (capabilities, style,
 * tone). Those prompts are generally polite — and weaker tool-using models (Haiku at
 * temperature 0.3) take politeness as license to skip the actual work, replying with
 * "I'll build it" prose instead of invoking the tool that ships the deliverable.
 *
 * <p>This class fixes that by composing two contracts onto every agent at build time:
 *
 * <ol>
 *   <li>{@link #forRole(String) Role contract} — what this persona MUST produce and
 *       MUST NOT do, regardless of pattern. Frontend UI ships an HTML file via
 *       {@code writeResult}; Code Reviewers return PASS/FAIL reports; Architects return
 *       structured plans; etc.</li>
 *   <li>{@link #forPattern(String, boolean) Pattern epilogue} — how the role behaves in
 *       the surrounding pattern. The same Frontend UI agent has a different contract in
 *       Mono (it owns the whole quest) vs. Orchestrator (it's a specialist tool) vs.
 *       Swarm (it can hand off to a Reviewer before shipping).</li>
 * </ol>
 *
 * <p>The augmentation idiom mirrors {@code SwarmPattern.SINGLE_HANDOFF_INSTRUCTION} —
 * we return a fresh {@link AgentDefinition} so the original seed data stays immutable.
 */
public final class RoleContracts {

    private RoleContracts() {}

    /**
     * RFC 2119 keyword preamble prepended to every shaped agent prompt. Names the RFC
     * once so the LLM treats uppercase MUST / MUST NOT / SHOULD / SHOULD NOT / MAY in
     * the role contract + pattern epilogue as normative directives, not casual prose.
     *
     * <p>Empirically: LLMs trained on technical documentation weight uppercase normative
     * keywords noticeably higher than lowercase ones. Pinning the convention up front
     * removes the ambiguity that makes weaker tool-using models (Haiku 4.5) treat polite
     * "you should…" as soft suggestion rather than absolute requirement.
     *
     * @see <a href="https://datatracker.ietf.org/doc/html/rfc2119">RFC 2119 — Key words for use in RFCs to Indicate Requirement Levels</a>
     */
    private static final String RFC_2119_PREAMBLE = """

            --- INTERPRETATION RULES (RFC 2119) ---
            The key words MUST, MUST NOT, REQUIRED, SHALL, SHALL NOT, SHOULD, SHOULD NOT, \
            RECOMMENDED, MAY, and OPTIONAL in the rules below are to be interpreted as \
            described in RFC 2119 (https://datatracker.ietf.org/doc/html/rfc2119). When \
            you see them in UPPERCASE, treat them as binding constraints — not casual prose.""";

    // ── Role contracts ────────────────────────────────────────────────────────
    //
    // Substring matchers (case-insensitive against role) — the seed data has small
    // spelling variations (e.g. "Code reviewer" vs "Code Reviewer") so we use
    // toLowerCase().contains(...) rather than equals().

    private static final String FRONTEND_UI_CONTRACT = """

            --- ROLE CONTRACT: Frontend UI Developer ---
            Your ONLY successful response is a call to the `writeResult` tool with the \
            complete, self-contained `index.html` document as its `content` argument. \
            The HTML must be a single file — all CSS in <style> tags, all JavaScript in \
            <script> tags, no external URLs. Game logic must run when the file is opened \
            in a browser. Mobile / touch / responsive support per the project brief. \
            Implement EVERY feature in the brief — no `TODO` placeholders, no stub \
            functions. After `writeResult` returns a URL, return that URL verbatim as \
            your reply, nothing else. Do NOT respond with prose summaries, plans, or \
            markdown explanations. If you respond with anything other than a \
            `writeResult` call, the run fails.""";

    private static final String CODE_REVIEWER_CONTRACT = """

            --- ROLE CONTRACT: Code Reviewer ---
            Your reply MUST be a structured PASS/FAIL audit report covering: (1) syntax \
            correctness, (2) algorithm efficiency, (3) edge cases, (4) memory management, \
            (5) responsive / mobile / touch design, (6) accessibility, (7) cross-browser \
            compatibility, (8) security. Format: a SHORT verdict line ("VERDICT: PASS" \
            or "VERDICT: FAIL — <reason in <=15 words>") followed by 3-8 numbered findings. \
            Do NOT call `writeResult`; you do not ship code. Do NOT rewrite the \
            implementation; reviewers find bugs, they don't fix them. If you find no \
            blocking issues, return PASS with at least 3 specific positive findings — \
            never a vague "looks good".""";

    private static final String GAME_LOGIC_ARCHITECT_CONTRACT = """

            --- ROLE CONTRACT: Game Logic Architect ---
            Your reply MUST be a concrete technical specification the Frontend UI \
            developer can implement directly: (1) game state model (what variables hold \
            what), (2) main loop / update / render structure, (3) input handling (keyboard \
            + touch), (4) collision / physics rules, (5) win/lose/score conditions, \
            (6) every feature listed in the project brief mapped to a concrete component. \
            Use bullet points, not prose. Do NOT call `writeResult`; you do not write the \
            HTML. Keep the spec under 600 words; the implementer needs precision, not \
            philosophy.""";

    private static final String PERFORMANCE_ANALYST_CONTRACT = """

            --- ROLE CONTRACT: Performance Analyst ---
            Your reply MUST list specific optimisation directives the Frontend UI \
            developer can apply: rendering (canvas vs DOM, requestAnimationFrame, \
            offscreen-canvas), memory (object pooling, GC pressure), algorithmic \
            (data-structure choices, lookup costs), mobile-specific (battery, touch \
            latency, viewport). Format: 5-10 numbered directives, each with a one-line \
            rationale. Do NOT call `writeResult`. Do NOT include code blocks unless a \
            directive is unambiguous as a 3-line snippet — directives are about INTENT, \
            not implementation.""";

    private static final String COORDINATOR_CONTRACT = """

            --- ROLE CONTRACT: Coordinator ---
            You decompose the goal and route sub-tasks; you do NOT write code yourself. \
            Use `createTask`/`updateTask` for visible progress tracking. Your final reply \
            MUST be plain text containing: (a) the deliverable URL returned by the \
            Frontend specialist (or `writeResult` as last resort), (b) a one-paragraph \
            summary <=120 words. NO markdown bullets in the final reply, NO code blocks, \
            NO HTML, NO repeating the brief. If a specialist returns prose instead of a \
            URL, RE-INVOKE that specialist with a stricter query before falling back.""";

    private static final String HANDS_ON_CTO_CONTRACT = """

            --- ROLE CONTRACT: Hands-On CTO ---
            Unlike a pure Coordinator, you CAN write code. In Mono runs you ship the \
            deliverable yourself by calling `writeResult`. In Orchestrator/Graph/Swarm \
            runs where you appear alongside a Frontend UI Developer, defer to them — \
            you only call `writeResult` if their delivery fails. Your final reply, in any \
            pattern, MUST contain the deliverable URL. NO prose-only responses.""";

    // ── Pattern epilogues ─────────────────────────────────────────────────────

    private static final String MONO_EPILOGUE = """

            --- PATTERN: Mono ---
            You are the SOLE agent on this run. There are no peers, no orchestrator, no \
            specialists. You own the entire goal end-to-end. Whatever the project brief \
            asks for, YOU produce it. If the brief expects an HTML deliverable, YOU call \
            `writeResult`. Treat every role-level guidance above as MUST-DO, not "delegate \
            this part" — there is no one else to delegate to.""";

    private static final String ORCHESTRATOR_SPECIALIST_EPILOGUE = """

            --- PATTERN: Orchestrator (you are a specialist) ---
            You are being invoked AS A TOOL by an orchestrator agent. Do exactly the work \
            this role specifies, return your output as text (or via `writeResult` if your \
            role contract requires it), then STOP. You cannot delegate further; the agents \
            you might want to call don't exist in your tool surface. Your reply will be \
            sent back to the orchestrator as a tool result — keep it focused on the \
            sub-task you were given, not the whole project.""";

    private static final String ORCHESTRATOR_BOSS_EPILOGUE = """

            --- PATTERN: Orchestrator (you are the orchestrator) ---
            You are the entrypoint. Specialists are exposed to you AS TOOLS. Decompose the \
            goal, call specialists in a sensible order, and integrate their outputs. \
            VERIFY each specialist reply: if a Frontend specialist returns prose instead \
            of a URL ending in `/index.html`, RE-INVOKE that specialist with a stricter \
            query. Only as a last resort call `writeResult` yourself. Your final reply \
            must be plain text with the deliverable URL plus a brief summary.""";

    private static final String GRAPH_NODE_EPILOGUE = """

            --- PATTERN: Graph (you are a node) ---
            You are one node in a deterministic DAG. Your output flows downstream to other \
            nodes as a labelled block. Produce output that downstream nodes can integrate \
            mechanically — bullet points, structured spec sections, or (for Frontend UI) \
            a complete index.html via `writeResult`. Do NOT delegate; nodes do not call \
            other nodes. Do NOT reference upstream nodes by name in your output prose; \
            the framework already labels your output for downstream consumers.""";

    private static final String SWARM_PEER_EPILOGUE = """

            --- PATTERN: Swarm (you are a peer) ---
            You can either (a) deliver your role's output and stop, or (b) call \
            `handoff_to_agent` to pass control to a peer better suited for the next step. \
            Never both — `handoff_to_agent` is `returnDirect=true`, so calling it ends \
            your turn immediately. Pass useful context in the handoff `context` field; \
            the receiving peer sees it in their input.""";

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Pattern identifiers matching {@code Team.pattern()} values from the wire payload.
     */
    public enum Pattern { MONO, ORCHESTRATOR, GRAPH, SWARM }

    /**
     * Compose the role contract + pattern epilogue onto an agent's prompt and return a
     * fresh {@link AgentDefinition}. The original seed data is never mutated.
     *
     * @param def           the agent as authored in seed data
     * @param pattern       which pattern is wrapping the agent
     * @param isEntrypoint  true if this agent is the pattern's entrypoint (matters in
     *                      Mono and Orchestrator: entrypoints get the "boss" or "sole"
     *                      epilogue; non-entrypoints get the specialist epilogue)
     */
    public static AgentDefinition shape(AgentDefinition def, Pattern pattern, boolean isEntrypoint) {
        if (def == null) return null;
        StringBuilder prompt = new StringBuilder();
        prompt.append(def.prompt() == null ? "" : def.prompt());
        // Prepend the RFC 2119 preamble before any normative directive so the LLM treats
        // uppercase keywords (MUST, MUST NOT, SHOULD, MAY, …) in the role contract +
        // pattern epilogue as binding rather than casual prose.
        prompt.append(RFC_2119_PREAMBLE);
        prompt.append(forRole(def.role()));
        prompt.append(forPattern(pattern, isEntrypoint));
        return new AgentDefinition(def.id(), def.name(), def.model(),
                prompt.toString(), def.role(), def.tools());
    }

    /** Look up the role contract for an arbitrary role string. Returns {@code ""} for unknown roles. */
    public static String forRole(String role) {
        if (role == null) return "";
        String normalized = role.toLowerCase(Locale.ROOT);
        if (normalized.contains("frontend"))               return FRONTEND_UI_CONTRACT;
        if (normalized.contains("code reviewer")
                || normalized.contains("reviewer"))        return CODE_REVIEWER_CONTRACT;
        if (normalized.contains("game logic architect")
                || normalized.contains("architect"))       return GAME_LOGIC_ARCHITECT_CONTRACT;
        if (normalized.contains("performance"))            return PERFORMANCE_ANALYST_CONTRACT;
        if (normalized.contains("hands-on cto")
                || normalized.contains("cto"))             return HANDS_ON_CTO_CONTRACT;
        if (normalized.contains("coordinator"))            return COORDINATOR_CONTRACT;
        return "";
    }

    /** Look up the pattern epilogue. */
    public static String forPattern(Pattern pattern, boolean isEntrypoint) {
        if (pattern == null) return "";
        return switch (pattern) {
            case MONO         -> MONO_EPILOGUE;
            case ORCHESTRATOR -> isEntrypoint ? ORCHESTRATOR_BOSS_EPILOGUE : ORCHESTRATOR_SPECIALIST_EPILOGUE;
            case GRAPH        -> GRAPH_NODE_EPILOGUE;
            case SWARM        -> SWARM_PEER_EPILOGUE;
        };
    }
}
