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

    /**
     * Inline-delivery override of {@link #FRONTEND_UI_CONTRACT}, used in Graph and
     * Orchestrator runs.
     *
     * <p>In both patterns the Frontend's HTML must reach a downstream QA agent (Code
     * Reviewer / Performance Analyst) that will <em>read and correct</em> it. A
     * {@code writeResult} URL is not reviewable — the QA agent needs the HTML source. So we
     * invert the rule: emit the complete {@code index.html} as the reply text, do NOT call
     * {@code writeResult}. The framework persists the final (possibly QA-corrected) HTML via
     * writeResult after the run — GraphPattern via {@code findHtmlOutput}/{@code persistDeliverable}
     * after the DAG completes, OrchestratorPattern via its server-side HTML holder after the
     * orchestration loop ends.
     */
    private static final String FRONTEND_UI_INLINE_CONTRACT = """

            --- ROLE CONTRACT: Frontend UI Developer (inline delivery) ---
            Your reply MUST be the complete, self-contained `index.html` document as raw \
            text — starting with `<!DOCTYPE html>` and ending with `</html>`. Single file: \
            all CSS in <style> tags, all JavaScript in <script> tags, no external URLs. \
            Implement EVERY feature in the brief — no `TODO` placeholders, no stub \
            functions. Do NOT call `writeResult`; the framework persists the final \
            deliverable for you. A downstream QA agent (Code Reviewer / Performance Analyst) \
            may read and CORRECT your HTML, so emit clean, complete, self-contained source. \
            Do NOT wrap the HTML in markdown code fences (```html). Do NOT add prose \
            preambles like "Here's the code:" — any non-HTML lines will be treated as part \
            of the artefact. Begin your reply with `<!DOCTYPE html>` on the first line.""";

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

    /**
     * Fix-capable Code Reviewer contract for Graph and Orchestrator runs (inline delivery).
     *
     * <p>The user's requirement: a Code Reviewer in a multi-agent pattern SHOULD be able to
     * <em>correct</em> the Frontend's HTML so the shipped artefact is functional — not merely
     * report on it. In Graph the framework ships the most-downstream HTML output; in
     * Orchestrator the server-side HTML holder captures the latest HTML. Either way the
     * reviewer makes its fixes land by emitting the corrected, complete {@code index.html}
     * as its reply — doctype first, so it's recognised as the deliverable. The audit findings
     * surface in the reviewer's reasoning turns (streamed to the Adventure Log); the final
     * reply is pure HTML so it can be shipped and re-reviewed downstream.
     */
    private static final String CODE_REVIEWER_FIX_INLINE_CONTRACT = """

            --- ROLE CONTRACT: Code Reviewer (fix-capable) ---
            You receive the Frontend developer's complete `index.html` as upstream context. \
            Audit it for: syntax correctness, algorithm efficiency, edge cases, memory \
            management, responsive / mobile / touch design, accessibility, cross-browser \
            compatibility, and security. Then ACTUALLY FIX every blocking bug you find — you \
            are empowered to rewrite the implementation so the shipped artefact is functional. \
            Your reply MUST be the complete, corrected, self-contained `index.html` document \
            as raw text — starting with `<!DOCTYPE html>` and ending with `</html>`. Single \
            file: all CSS in <style> tags, all JS in <script> tags, no external URLs, every \
            feature from the brief implemented. If the code is already correct, return it \
            UNCHANGED (still the full document). Do NOT call `writeResult`; the framework \
            persists your corrected HTML. Do NOT wrap it in markdown code fences (```html). \
            Do NOT prepend a prose verdict or findings list — any non-HTML lines corrupt the \
            artefact. Begin your reply with `<!DOCTYPE html>` on the first line.""";

    /**
     * Fix-capable Code Reviewer contract for Swarm runs (delivery via handoff context).
     *
     * <p>Swarm peers exchange the running deliverable through the {@code handoff_to_agent}
     * {@code context} field, not as a final reply (the shipper calls {@code writeResult} last,
     * once the {@link #SWARM_PEER_EPILOGUE ShipGate} opens). So a fix-capable reviewer puts its
     * <em>corrected</em> HTML into the {@code context} field on handoff, ensuring the shipper
     * ships the fixed version rather than the Frontend's original.
     */
    private static final String CODE_REVIEWER_FIX_SWARM_CONTRACT = """

            --- ROLE CONTRACT: Code Reviewer (fix-capable, swarm peer) ---
            You receive the running `index.html` in the shared knowledge / handoff message. \
            Audit it for syntax, edge cases, responsive / mobile / touch design, \
            accessibility, cross-browser compatibility, and security — then ACTUALLY FIX \
            every blocking bug you find. You are empowered to rewrite the implementation so \
            the shipped artefact is functional. When you hand off, put the COMPLETE corrected, \
            self-contained `index.html` (doctype to </html>, all CSS/JS inline, no external \
            URLs) into the `context` field of `handoff_to_agent` so the shipper ships YOUR \
            corrected version. If the code is already correct, pass it through unchanged in \
            `context`. Do NOT call `writeResult` yourself; hand off to the shipper.""";

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

    /**
     * Fix-capable Performance Analyst contract for Graph and Orchestrator runs (inline).
     * Mirrors {@link #CODE_REVIEWER_FIX_INLINE_CONTRACT}: the analyst applies its
     * optimisations directly to the HTML and emits the optimised complete document, so the
     * framework ships a faster artefact rather than a list of directives nobody applied.
     */
    private static final String PERFORMANCE_ANALYST_FIX_INLINE_CONTRACT = """

            --- ROLE CONTRACT: Performance Analyst (fix-capable) ---
            You receive the Frontend developer's complete `index.html` as upstream context. \
            APPLY performance optimisations directly to it: rendering (canvas vs DOM, \
            requestAnimationFrame, offscreen-canvas), memory (object pooling, reduced GC \
            pressure), algorithmic (better data structures, cheaper lookups), mobile (touch \
            latency, viewport, battery). You are empowered to rewrite the implementation. \
            Your reply MUST be the complete, optimised, self-contained `index.html` document \
            as raw text — starting with `<!DOCTYPE html>` and ending with `</html>`, all \
            CSS/JS inline, no external URLs, every feature from the brief preserved. Do NOT \
            regress functionality in the name of speed. If no meaningful optimisation \
            applies, return the document UNCHANGED. Do NOT call `writeResult`; the framework \
            persists your output. Do NOT wrap it in markdown fences (```html) or prepend a \
            prose directive list — any non-HTML lines corrupt the artefact. Begin your reply \
            with `<!DOCTYPE html>` on the first line.""";

    /**
     * Fix-capable Performance Analyst contract for Swarm runs (delivery via handoff context).
     * Mirrors {@link #CODE_REVIEWER_FIX_SWARM_CONTRACT}.
     */
    private static final String PERFORMANCE_ANALYST_FIX_SWARM_CONTRACT = """

            --- ROLE CONTRACT: Performance Analyst (fix-capable, swarm peer) ---
            You receive the running `index.html` in the shared knowledge / handoff message. \
            APPLY performance optimisations directly to it (rendering, memory, algorithmic, \
            mobile) — you are empowered to rewrite the implementation, but never regress a \
            feature for speed. When you hand off, put the COMPLETE optimised, self-contained \
            `index.html` (doctype to </html>, all CSS/JS inline, no external URLs) into the \
            `context` field of `handoff_to_agent` so the shipper ships YOUR optimised \
            version. If no meaningful optimisation applies, pass it through unchanged in \
            `context`. Do NOT call `writeResult` yourself; hand off to the shipper.""";

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
            goal, call specialists in a sensible order, and integrate their outputs. The \
            Frontend specialist RETURNS its complete index.html as text and the framework \
            captures it — you get a short ACK, not a URL. Route that captured HTML through a \
            Code Reviewer and/or Performance Analyst: they receive the current HTML \
            automatically and RETURN a corrected version, which the framework re-captures and \
            ships. VERIFY the Frontend delivered (its ACK confirms a captured index.html); if \
            it returned prose instead, RE-INVOKE that specialist once with a stricter query. \
            Do NOT call `writeResult` yourself except as a last resort if no specialist ever \
            produces HTML. Your final reply must be a short plain-text summary; the framework \
            attaches the deliverable URL.""";

    private static final String GRAPH_NODE_EPILOGUE = """

            --- PATTERN: Graph (you are a node) ---
            You are one node in a deterministic DAG. Your output flows downstream to other \
            nodes as a labelled block of upstream context. Produce output that downstream \
            nodes can integrate mechanically — bullet points, structured spec sections, or \
            (for Frontend UI) raw HTML source. Do NOT call `writeResult` from inside a Graph \
            node; the framework persists the final sink output for you after the DAG \
            completes. Do NOT delegate; nodes do not call other nodes. Do NOT reference \
            upstream nodes by name in your output prose; the framework already labels your \
            output for downstream consumers.""";

    private static final String SWARM_PEER_EPILOGUE = """

            --- PATTERN: Swarm (you are a peer) ---
            This quest is a TEAM effort: every peer in the roster MUST contribute before \
            the deliverable ships. Your input lists the peers who have NOT yet been \
            consulted. While that list is non-empty you MUST call `handoff_to_agent` to \
            pass control to one of them — do NOT attempt to finish the quest or call \
            `writeResult` yourself (it will be REJECTED until every peer has contributed). \
            Do your role's work, then hand off the running result (HTML, spec, or review \
            notes) to the next unconsulted peer via the `context` field. Only when no \
            peer remains unconsulted may the designated shipper call `writeResult`. \
            `handoff_to_agent` is `returnDirect=true`, so calling it ends your turn \
            immediately — call it exactly once and stop.""";

    /**
     * Entrypoint variant of {@link #SWARM_PEER_EPILOGUE}. The user designates one agent as
     * the swarm entrypoint in the frontend; that agent must behave as the coordinator that
     * kicks off discovery of the WHOLE team rather than shipping a one-agent answer.
     *
     * <p>This epilogue is appended <em>after</em> the role contract (see {@link #shape}), so
     * it deliberately overrides any role-level "your ONLY successful response is writeResult"
     * directive (e.g. {@link #FRONTEND_UI_CONTRACT}) for the entrypoint: in a swarm the
     * entrypoint routes first and ships last (or never, if a peer is the shipper).
     */
    private static final String SWARM_ENTRYPOINT_EPILOGUE = """

            --- PATTERN: Swarm (you are the ENTRYPOINT / coordinator) ---
            You start the quest, but you do NOT finish it alone. Your input lists the full \
            team roster and which peers have NOT yet been consulted. The quest is bigger \
            than any single role: each specialist MUST contribute before the deliverable \
            ships. Therefore, on your FIRST turn you MUST call `handoff_to_agent` to the \
            peer best suited for the first step (usually the planner / architect), passing \
            the COMPLETE user request in the `message` field. Even if your own role \
            contract above says your only output is a `writeResult` call, in this swarm you \
            MUST hand off first — calling `writeResult` while any peer is still unconsulted \
            is REJECTED by the framework and wastes a turn. Route the work through every \
            peer (architect → implementer → analyst → reviewer, or whatever order fits the \
            quest); the shipper calls `writeResult` only after the unconsulted list is \
            empty. Do not summarise or plan in prose — hand off and let the team build.""";

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
        prompt.append(forRole(def.role(), pattern));
        prompt.append(forPattern(pattern, isEntrypoint));
        return new AgentDefinition(def.id(), def.name(), def.model(),
                prompt.toString(), def.role(), def.tools());
    }

    /** Look up the role contract for an arbitrary role string. Returns {@code ""} for unknown roles. */
    public static String forRole(String role) {
        return forRole(role, null);
    }

    /**
     * Pattern-aware role contract lookup.
     *
     * <p>The QA roles (Code Reviewer, Performance Analyst) and the Frontend role are
     * pattern-sensitive because of the user requirement that downstream agents be able to
     * CORRECT the Frontend's HTML so the shipped artefact is functional:
     * <ul>
     *   <li><b>Mono / null</b> — single agent or unknown pattern: report-only QA contracts,
     *       Frontend ships via {@code writeResult}.</li>
     *   <li><b>Graph / Orchestrator</b> — inline delivery: Frontend emits HTML as its reply,
     *       QA roles emit the CORRECTED HTML as their reply; the framework persists the
     *       most-downstream / latest HTML.</li>
     *   <li><b>Swarm</b> — handoff delivery: QA roles put the CORRECTED HTML into the
     *       {@code handoff_to_agent} {@code context} field so the shipper ships the fix.</li>
     * </ul>
     */
    public static String forRole(String role, Pattern pattern) {
        if (role == null) return "";
        boolean inline = pattern == Pattern.GRAPH || pattern == Pattern.ORCHESTRATOR;
        boolean swarm = pattern == Pattern.SWARM;
        String normalized = role.toLowerCase(Locale.ROOT);
        if (normalized.contains("frontend")) {
            return inline ? FRONTEND_UI_INLINE_CONTRACT : FRONTEND_UI_CONTRACT;
        }
        if (normalized.contains("code reviewer")
                || normalized.contains("reviewer")) {
            if (inline) return CODE_REVIEWER_FIX_INLINE_CONTRACT;
            if (swarm)  return CODE_REVIEWER_FIX_SWARM_CONTRACT;
            return CODE_REVIEWER_CONTRACT;
        }
        if (normalized.contains("game logic architect")
                || normalized.contains("architect"))       return GAME_LOGIC_ARCHITECT_CONTRACT;
        if (normalized.contains("performance")) {
            if (inline) return PERFORMANCE_ANALYST_FIX_INLINE_CONTRACT;
            if (swarm)  return PERFORMANCE_ANALYST_FIX_SWARM_CONTRACT;
            return PERFORMANCE_ANALYST_CONTRACT;
        }
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
            case SWARM        -> isEntrypoint ? SWARM_ENTRYPOINT_EPILOGUE : SWARM_PEER_EPILOGUE;
        };
    }
}
