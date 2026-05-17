package com.witcherish.samples.agents.patterns;

import com.witcherish.samples.agents.api.dto.Project;
import com.witcherish.samples.agents.api.dto.Team;

final class Prompts {

    private Prompts() {}

    /** Mirrors the Python: "This is the project to be done: …\nAdditional directions: …". */
    static String composeUserPrompt(Project project, Team team) {
        StringBuilder sb = new StringBuilder("This is the project to be done: ").append(project.prompt());
        if (team.prompt() != null && !team.prompt().isBlank()) {
            sb.append("\nAdditional directions for the team:\n").append(team.prompt());
        }
        return sb.toString();
    }
}
