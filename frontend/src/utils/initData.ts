import agents from "../data/agents.json";
import quests from "../data/quests.json";

/**
 * Canonical seed data lives in JSON under {@link "../data/agents.json"} and
 * {@link "../data/quests.json"}. Both this file (used by the Admin Page's
 * "Load Agents" / "Load Quests" buttons) and {@code frontend/scripts/seed-data.py}
 * (used at first-deploy bootstrap) read from the same JSON, so model-id fixes only
 * have to happen once.
 */
export const agentsInitialData = agents;
export const questsInitialData = quests;
