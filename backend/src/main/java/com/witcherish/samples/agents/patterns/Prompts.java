package com.witcherish.samples.agents.patterns;

import com.witcherish.samples.agents.api.dto.Project;
import com.witcherish.samples.agents.api.dto.Team;

final class Prompts {

    private Prompts() {}

    /** Mirrors the Python: "This is the project to be done: …\nAdditional directions: …". */
    static String composeUserPrompt(Project project, Team team) {
        var directions = (team.prompt() == null || team.prompt().isBlank())
                ? ""
                : "%nAdditional directions for the team:%n%s".formatted(team.prompt());
        return "This is the project to be done: %s%s".formatted(project.prompt(), directions);
    }

    /**
     * Augment a single-agent prompt with the "deliverable goal" framing: ship a runnable
     * index.html via the {@code writeResult} tool. Used by the Mono pattern so the lone
     * agent produces something playable, not just prose.
     */
    static String composeMonoPrompt(Project project, Team team) {
        return """
                %s

                Your goal is to ship a runnable deliverable: a single self-contained `index.html` \
                that runs in any modern browser. The user wants to PLAY the result, not read about it.

                Procedure (mandatory):
                1. Plan the app briefly (data model, main flows, UI).
                2. Write the complete `<!DOCTYPE html>…</html>` document with embedded CSS and JavaScript. \
                No external dependencies. Touch-friendly.
                3. CALL the `writeResult` tool exactly once, passing the full HTML document as the `content` argument.
                4. After writeResult returns, your final reply MUST be a SHORT plain-text message containing: \
                (a) the URL writeResult returned, (b) a one-paragraph summary of what was built. \
                Keep it under 150 words. NO markdown bullets, NO code blocks, NO HTML — just plain prose. \
                The user opens the URL to play the deliverable."""
                .formatted(composeUserPrompt(project, team));
    }
}
