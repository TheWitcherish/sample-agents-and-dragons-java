#!/usr/bin/env python3
"""
Deployment seed script — runs after `npx ampx pipeline-deploy`.
Uses the AppSync GraphQL endpoint (IAM auth / SigV4) from amplify_outputs.json
to check if Agent and Quest tables are empty, and seeds initial data if so.

Requires: boto3, requests — both available in the Amplify build environment.
"""

import json
import os
import sys
from datetime import datetime, timezone
import boto3
from botocore.auth import SigV4Auth
from botocore.awsrequest import AWSRequest
import requests

# ── Load outputs ──────────────────────────────────────────────────────────────

_outputs_path = os.path.join(os.path.dirname(__file__), "..", "amplify_outputs.json")
try:
    with open(_outputs_path) as f:
        outputs = json.load(f)
except FileNotFoundError:
    print(f"[seed] ERROR: amplify_outputs.json not found at {_outputs_path}", file=sys.stderr)
    sys.exit(1)

GRAPHQL_ENDPOINT = outputs.get("data", {}).get("url", "")
REGION           = outputs.get("data", {}).get("aws_region") \
                or outputs.get("custom", {}).get("aws_region") \
                or os.environ.get("AWS_DEFAULT_REGION", "us-east-1")

if not GRAPHQL_ENDPOINT:
    print("[seed] ERROR: GraphQL endpoint not found in amplify_outputs.json", file=sys.stderr)
    print(f"[seed] outputs keys: {list(outputs.keys())}", file=sys.stderr)
    sys.exit(1)

print(f"[seed] Endpoint : {GRAPHQL_ENDPOINT}")
print(f"[seed] Region   : {REGION}")

# ── GraphQL helper ────────────────────────────────────────────────────────────

def gql(query: str, variables: dict = None) -> dict:
    """Execute a GraphQL operation signed with SigV4 (IAM auth)."""
    session = boto3.session.Session()
    creds   = session.get_credentials().get_frozen_credentials()

    body    = json.dumps({"query": query, "variables": variables or {}})
    request = AWSRequest(method="POST", url=GRAPHQL_ENDPOINT,
                         data=body, headers={"Content-Type": "application/json"})
    SigV4Auth(creds, "appsync", REGION).add_auth(request)

    resp = requests.post(GRAPHQL_ENDPOINT,
                         data=body,
                         headers=dict(request.headers),
                         timeout=30)
    resp.raise_for_status()
    result = resp.json()
    if "errors" in result:
        raise RuntimeError(f"GraphQL errors: {result['errors']}")
    return result["data"]


# ── Queries / Mutations ───────────────────────────────────────────────────────

LIST_AGENTS = """
query ListAgents { listAgents(limit: 1) { items { id } } }
"""

LIST_QUESTS = """
query ListQuests { listQuests(limit: 1) { items { id } } }
"""

CREATE_AGENT = """
mutation CreateAgent($input: CreateAgentInput!) {
  createAgent(input: $input) { id name }
}
"""

CREATE_QUEST = """
mutation CreateQuest($input: CreateQuestInput!) {
  createQuest(input: $input) { id name }
}
"""

LIST_PATTERN_RUNTIMES = """
query ListAgentsPatternRuntimes { listAgentsPatternRuntimes { items { id agentsPattern } } }
"""

CREATE_PATTERN_RUNTIME = """
mutation CreateAgentsPatternRuntime($input: CreateAgentsPatternRuntimeInput!) {
  createAgentsPatternRuntime(input: $input) { id agentsPattern runtimeName }
}
"""

LIST_ALL_AGENTS_FOR_MIGRATION = """
query ListAllAgents($nextToken: String) {
  listAgents(limit: 1000, nextToken: $nextToken) {
    items { id name compatiblePatterns }
    nextToken
  }
}
"""

UPDATE_AGENT_PATTERNS = """
mutation UpdateAgent($input: UpdateAgentInput!) {
  updateAgent(input: $input) { id name compatiblePatterns }
}
"""

# ── Initial data ──────────────────────────────────────────────────────────────

AGENTS = [
    {"name":"Sonnet Swiftblade","prompt":"You are the Performance Optimizer. Architect high-performance game systems with expert-level optimization. Implement advanced techniques for rendering and algorithm efficiency. Deliver exceptional performance across all devices and platforms. Specialized in Touchscreen devices Mobile and Tablets.","model":"global.anthropic.claude-sonnet-4-5-20250929-v1:0","tools":[],"role":"Performance Analyst","avatar":"/elfic-hunter-avatar.png","roleDisplayName":"Senior Performance Analyst","skills":["Performance Analysis","Optimization","Profiling","Resource Management"],"modelDisplayName":"Claude Sonnet 4.5","speed":50,"precision":90,"frugality":45,"compatiblePatterns":["swarm","graph","orchestrator"],"cost":3},
    {"name":"Haiku Jean","prompt":"You are the Performance Optimizer. Analyze game code for performance bottlenecks and optimization opportunities. Identify inefficient algorithms, memory leaks, and rendering issues. Provide recommendations for improving frame rates, load times, and resource usage.","model":"global.anthropic.claude-haiku-4-5-20251001-v1:0","tools":[],"role":"Performance Analyst","avatar":"/young-paladin-avatar.png","roleDisplayName":"Junior Performance Analyst","skills":["Performance Analysis","Optimization","Profiling","Resource Management"],"modelDisplayName":"Claude Haiku 4.5","speed":75,"precision":60,"frugality":65,"compatiblePatterns":["swarm","graph","orchestrator"],"cost":1},
    {"name":"Nova Goldnugget","prompt":"You are the Code Reviewer. Conduct comprehensive code reviews for quality, performance, and reliability. Check: syntax correctness, algorithm efficiency, edge cases, memory management, responsive design, accessibility, cross-browser compatibility. Identify subtle bugs and optimization opportunities. Return detailed validation report with PASS/FAIL status.","model":"us.amazon.nova-premier-v1:0","tools":[],"role":"Code reviewer","avatar":"/elfic-girl-whitehair-avatar.png","roleDisplayName":"Junior code reviewer","skills":["Code Review","Bug Detection","Quality Assurance","Testing"],"modelDisplayName":"Amazon Nova Premier","speed":33,"precision":55,"frugality":33,"compatiblePatterns":[],"cost":2},
    {"name":"Nova Zircum","prompt":"You are the UI Developer. Architect and implement exceptional HTML5 games with expert-level code quality in a SINGLE index.html file. Create scalable, performant solutions with: advanced CSS animations, WebGL effects, procedural graphics, adaptive difficulty, accessibility features, and elegant design patterns. Deliver polished, production-grade implementations that exceed expectations. ALL code must be inline - no external files.","model":"us.amazon.nova-2-lite-v1:0","tools":[],"role":"Developer Frontend UI","avatar":"/elfic-girl-blondie-avatar.png","roleDisplayName":"Junior UI Developer","skills":["HTML5 Games","Canvas Rendering","Bug-Free Code","Responsive Design"],"modelDisplayName":"Nova2 Lite","speed":60,"precision":85,"frugality":45,"compatiblePatterns":["swarm","graph","orchestrator"],"cost":2},
    {"name":"Deeps Brightcode","prompt":"You are the UI Developer. Allowed to Architect and implement exceptional HTML5 games with expert-level code quality in a SINGLE index.html file. Create scalable, performant solutions with: advanced CSS animations, WebGL effects, procedural graphics, adaptive difficulty, accessibility features, and elegant design patterns. Deliver polished, production-grade implementations that exceed expectations. ALL code must be inline - no external files.","model":"us.deepseek.r1-v1:0","tools":[],"role":"Developer Frontend UI","avatar":"/nova-brightcode-avatar.png","roleDisplayName":"Junior UI Developper","skills":["HTML5 Games","Canvas Rendering","Bug-Free Code","Responsive Design"],"modelDisplayName":"Deepseek R1","speed":55,"precision":66,"frugality":58,"compatiblePatterns":["orchestrator","graph"],"cost":1},
    {"name":"Opus Codewing","prompt":"You are the Frontend UI Developer. Architect and implement exceptional HTML5 games with expert-level code quality in a SINGLE index.html file. Create scalable, performant solutions with: advanced CSS animations, WebGL effects, procedural graphics, adaptive difficulty, accessibility features, and elegant design patterns. Deliver polished, production-grade implementations that exceed expectations. ALL code must be inline - no external files.","model":"global.anthropic.claude-opus-4-5-20251101-v1:0","tools":[],"role":"Developer Frontend UI","avatar":"/schedule-optimizer-avatar.png","roleDisplayName":"Principal UI Developer","skills":["HTML5 Games","Canvas Rendering","Bug-Free Code","Responsive Design"],"modelDisplayName":"Claude Opus 4.5","speed":20,"precision":100,"frugality":10,"compatiblePatterns":["orchestrator","swarm","graph"],"cost":7},
    {"name":"Qwen Codewing","prompt":"You are the UI Developer. Architect and implement exceptional HTML5 games with expert-level code quality. Create scalable, performant solutions with advanced optimizations and elegant design patterns. Deliver polished, production-grade implementations that exceed expectations.","model":"qwen.qwen3-coder-30b-a3b-v1:0","tools":[],"role":"Developer Frontend UI","avatar":"/elfic-girl-whitehair-avatar.png","roleDisplayName":"Junior UI Developer","skills":["HTML5 Games","Canvas Rendering","Bug-Free Code","Responsive Design"],"modelDisplayName":"Qwen Coder 30B","speed":65,"precision":42,"frugality":65,"compatiblePatterns":["swarm","graph","orchestrator"],"cost":1},
    {"name":"Sonnet Werner","prompt":"You are the Game Development Studio CTO with Hands-on capabilities. You are able to deliver full software stak and game with polished, feature-complete HTML5 games. Logic Architect for mechanics design, UI Developer for implementation, QA Tester for validation. Manage complex workflows, optimize team efficiency, and maintain high code standards. Output must be a SINGLE index.html file with ALL HTML, CSS, and JavaScript inline.","model":"global.anthropic.claude-sonnet-4-5-20250929-v1:0","tools":[],"role":"Hands-On CTO","avatar":"/old-magician-avatar.png","roleDisplayName":"Hands-On CTO","skills":[],"modelDisplayName":"Claude Sonnet 4.5","speed":50,"precision":90,"frugality":45,"compatiblePatterns":["mono","swarm","orchestrator","graph"],"cost":3},
    {"name":"Sonnet auntie","prompt":"You are the Game Development Coordinator. Lead the team to deliver polished, feature-complete HTML5 games. Hand of to specialists agents strategically. Manage creation workflow, optimize team efficiency, and maintain high code standards. Output must be a SINGLE index.html file with ALL HTML, CSS, and JavaScript inline, ensure that all the agents have this knowledge.","model":"global.anthropic.claude-sonnet-4-5-20250929-v1:0","tools":[],"role":"Coordinator","avatar":"/session-curator-avatar.png","roleDisplayName":"Senior Game Coordinator","skills":[],"modelDisplayName":"Claude Sonnet 4.5","speed":50,"precision":90,"frugality":45,"compatiblePatterns":["orchestrator","swarm","graph"],"cost":3},
    {"name":"Sonnet Magnus","prompt":"You are the Game Logic Architect. Architect innovative game mechanics and robust systems. Design complex, scalable architectures with advanced features. Your design will help other agents to build a better system.","model":"global.anthropic.claude-sonnet-4-5-20250929-v1:0","tools":[],"role":"Game Logic Architect","avatar":"/booth-navigator-avatar.png","roleDisplayName":"Senior Architect","skills":[],"modelDisplayName":"Claude Sonnet 4.5","speed":50,"precision":90,"frugality":45,"compatiblePatterns":["mono","orchestrator","swarm","graph"],"cost":3},
    {"name":"Opus Thornfield","prompt":"You are the Game Development Coordinator. Architect and execute complex game development projects with expert-level coordination. Strategically delegate to specialists, optimize team performance, and deliver exceptional games with advanced features and flawless execution. Ensure seamless collaboration across all specialists. Output must be a SINGLE index.html file containing ALL HTML structure, CSS styles, and JavaScript logic inline - NO external files.","model":"global.anthropic.claude-opus-4-5-20251101-v1:0","tools":[],"role":"Coordinator","avatar":"/scarface-soldier-avatar.png","roleDisplayName":"Principal Game Coordinator","skills":["Team Coordination","Workflow Management","Quality Assurance","Deployment"],"modelDisplayName":"Claude Opus 4.5","speed":20,"precision":100,"frugality":10,"compatiblePatterns":["orchestrator","swarm","graph"],"cost":7},
    {"name":"Qwen Rockethall","prompt":"You are the Game Logic Architect. Architect innovative game mechanics and robust systems. Design complex, scalable architectures with advanced features: particle systems, physics engines, procedural generation, AI opponents with multiple strategies, and extensible component systems. Create visionary designs that push creative boundaries while maintaining technical excellence.","model":"qwen.qwen3-coder-30b-a3b-v1:0","tools":[],"role":"Game Logic Architect","avatar":"/soldier-man-avatar.png","roleDisplayName":"Junior Architect","skills":["Game Design","Architecture","Mechanics Planning","State Management"],"modelDisplayName":"Qwen 3 Coder 30B","speed":65,"precision":42,"frugality":65,"compatiblePatterns":["swarm","graph","orchestrator"],"cost":1},
    {"name":"Opus Thornfield 2","prompt":"You are the Game Development Coordinator. Architect and execute complex game development projects with expert-level coordination. Strategically delegate to specialists, optimize team performance, and deliver exceptional games with advanced features and flawless execution.","model":"global.anthropic.claude-opus-4-5-20251101-v1:0","tools":[],"role":"Coordinator","avatar":"/elfic-girl-blackhair-avatar.png","roleDisplayName":"Principal Coordinator","skills":["Team Coordination","Development Workflow Management","Quality Assurance","Deployment"],"modelDisplayName":"Claude Opus 4.5","speed":20,"precision":100,"frugality":10,"compatiblePatterns":[],"cost":7},
    {"name":"opus Ironforge","prompt":"You are the Game Logic Architect. Design sophisticated game mechanics and scalable architecture. Create comprehensive logic plans with advanced features, edge cases, and optimization strategies. Ensure designs support complex gameplay, future enhancements, and performance requirements.","model":"global.anthropic.claude-opus-4-5-20251101-v1:0","tools":[],"role":"Game Logic Architect","avatar":"/old-magician-avatar.png","roleDisplayName":"Principal Architect","skills":["Game Design","Architecture","Mechanics Planning","State Management"],"modelDisplayName":"Claude Opus 4.5","speed":20,"precision":100,"frugality":10,"compatiblePatterns":["swarm","graph","orchestrator"],"cost":7},
    {"name":"Haiku Silvermoon","prompt":"You are the code reviewer. Perform expert-level code reviews ensuring exceptional quality, performance, and maintainability. Analyze: architectural patterns, code complexity, security vulnerabilities, performance bottlenecks, UX issues, and production-readiness. Provide comprehensive audit with actionable recommendations. Return detailed PASS/FAIL report.","model":"global.anthropic.claude-haiku-4-5-20251001-v1:0","tools":[],"role":"Code reviewer","avatar":"/quality-reviewer-avatar.png","roleDisplayName":"Junior Code Reviewer","skills":["Code Review","Bug Detection","Quality Assurance","Testing"],"modelDisplayName":"Claude Haiku 4.5","speed":75,"precision":65,"frugality":60,"compatiblePatterns":["orchestrator","swarm","graph"],"cost":1},
    {"name":"Sonnet Amberfield","prompt":"You are the Code Reviewer. Conduct comprehensive code reviews for quality, performance, and reliability. Check: syntax correctness, algorithm efficiency, edge cases, memory management, responsive design, accessibility, cross-browser compatibility. Identify subtle bugs and optimization opportunities. Return detailed validation report with PASS/FAIL status.","model":"global.anthropic.claude-sonnet-4-5-20250929-v1:0","tools":[],"role":"Code reviewer","avatar":"/elfic-torch-man-avatar.png","roleDisplayName":"Senior Code Reviewer","skills":["Code Review","Bug Detection","Quality Assurance","Testing"],"modelDisplayName":"Claude Sonnet 4.5","speed":50,"precision":90,"frugality":45,"compatiblePatterns":["orchestrator","swarm","graph"],"cost":3},
    {"name":"GPT Arrowlight","prompt":"You are the Game Development Coordinator. Architect and execute complex game development projects with expert-level coordination. Strategically delegate to specialists, optimize team performance, and deliver exceptional games with advanced features and flawless execution.","model":"openai.gpt-oss-120b-1:0","tools":[],"role":"Coordinator","avatar":"/soldier-longhair-avatar.png","roleDisplayName":"Junior Game Coordinator","skills":["Team Coordination","Development Workflow Management","Quality Assurance","Deployment"],"modelDisplayName":"GPT OSS 120B","speed":60,"precision":35,"frugality":40,"compatiblePatterns":["swarm","graph","orchestrator"],"cost":1},
    {"name":"sonnet Zephyr","prompt":"You are the UI Developer. Implement sophisticated, production-ready HTML5 games in a SINGLE index.html file with ALL code inline. Create polished experiences with: smooth animations, particle effects, responsive design, touch support, sound feedback patterns, and elegant visual design. Write optimized, maintainable code with comprehensive error handling. Output ONLY the complete index.html file.","model":"global.anthropic.claude-sonnet-4-5-20250929-v1:0","tools":[],"role":"Developer Frontend UI","avatar":"/elfic-girl-him-avatar.png","roleDisplayName":"Senior UI Developer","skills":[],"modelDisplayName":"Claude Sonnet 4.5","speed":50,"precision":90,"frugality":45,"compatiblePatterns":["orchestrator","swarm","graph"],"cost":3},
]

QUESTS = [
    {"name":"Web Paint","prompt":"Create a web application like paint running in the browser. It muste be usable on smartphone and tablet with touchscreen. you can choose color, pen style and thickness. you are able to save your drawing.","mandatoryAgentRoles":[],"authorizedAgentList":[],"authorizedPatternList":[],"teamDirectionSamples":["add some shapes like stars or circle","create a fancy ui"]},
    {"name":"Flappy Pigeon","prompt":"Build a Flappy Bird-style game in browser based language. Implement gravity, pipes, jumping, scoring, and collision detection. Keep it simple but playable on ipad tablet with small screen and touch screen on a smartphone. polish the Flappy Bird style game: add background images, custom bird and pipe images, sound effects for jump/collision/scoring, smoother animations. Also list the required assets.","mandatoryAgentRoles":[],"authorizedAgentList":[],"authorizedPatternList":[],"teamDirectionSamples":["Add parallax scrolling for the background to make the game feel more dynamic","Create animated sprites for the bird flapping wings during jump and fall"]},
    {"name":"Snake","prompt":"Create a snake-style game. Add levels with different layouts, power-ups (speed boost, invincibility), leaderboard, and smooth animations to the game. Include explosion animations and game over screen. Keep it simple but playable on ipad tablet with small screen and touch screen on a smartphone.","mandatoryAgentRoles":[],"authorizedAgentList":[],"authorizedPatternList":[],"teamDirectionSamples":["create a fancy ui","add sound effects"]},
    {"name":"Wordle","prompt":"Create a daily word guessing game where players have 6 attempts to guess a 5-letter word. Include a touch-friendly keyboard, color-coded feedback tiles (green, yellow, gray), and statistics tracking. Optimize for iPad display and touch interaction. Stay simple","mandatoryAgentRoles":[],"authorizedAgentList":[],"authorizedPatternList":[],"teamDirectionSamples":["create a fancy ui and animated background","add sound effects"]},
    {"name":"Solitaire","prompt":"Create a playable Klondike solitaire card game in a single index.html file with embedded CSS and JavaScript. Make it responsive for iPad and mobile with touch-enabled drag-and-drop. Include 7 tableau piles, 4 foundation piles, stock and waste piles. Use standard solitaire rules and simple card visuals.","mandatoryAgentRoles":[],"authorizedAgentList":[],"authorizedPatternList":[],"teamDirectionSamples":["las vegas casino stylized HUD design","add sound effects reflecting cards slaping"]},
    {"name":"Sudoku","prompt":"Create an iPad-optimized Sudoku web app featuring a touch-friendly 9x9 grid, comfortable number input pad, multiple difficulty levels, and smart hints. Include pencil marks, auto-save, and progress tracking in a clean interface that works seamlessly. Keep it simple but playable on ipad tablet with small screen and touch screen on a smartphone.","mandatoryAgentRoles":[],"authorizedAgentList":[],"authorizedPatternList":[],"teamDirectionSamples":["fancy UI"]},
    {"name":"Space Invaders","prompt":"Build a classic Space Invaders game with rows of descending aliens, player spaceship with left/right movement and shooting, shields that degrade when hit, increasing difficulty per wave, score system, and retro pixel art style. Include explosion animations and game over screen. Keep it simple but playable on ipad tablet with small screen and touch screen on a smartphone.","mandatoryAgentRoles":[],"authorizedAgentList":[],"authorizedPatternList":[],"teamDirectionSamples":["Authentic retro arcade feel","Smooth alien movement patterns","Satisfying explosion effects"]},
]

# ── Main ──────────────────────────────────────────────────────────────────────

def find_default_runtime() -> tuple[str, str] | None:
    """
    Read the AgentCore runtime ARN and name from amplify_outputs.json.
    The CDK exports these as custom.agentCoreRuntimeArn and custom.agentCoreRuntimeName.
    Returns (runtimeName, runtimeArn) or None.
    """
    name = outputs.get("custom", {}).get("agentCoreRuntimeName", "")
    arn  = outputs.get("custom", {}).get("agentCoreRuntimeArn", "")
    if name and arn:
        print(f"[seed] Found default runtime: {name}")
        return name, arn
    print("[seed] WARNING: agentCoreRuntimeArn/Name not found in amplify_outputs.json")
    return None


def migrate_agent_compatible_patterns():
    """
    Walk every Agent row and fix stale `compatiblePatterns` values:
        "hierarchical" → "orchestrator"
        "Mono"         → "mono"
    Idempotent: a row that's already clean is left alone.
    """
    fixmap = {"hierarchical": "orchestrator", "Mono": "mono"}
    next_token: str | None = None
    fixed = 0
    scanned = 0

    while True:
        page = gql(LIST_ALL_AGENTS_FOR_MIGRATION,
                   {"nextToken": next_token} if next_token else {})
        data = page.get("listAgents", {})
        for agent in data.get("items", []) or []:
            scanned += 1
            old = agent.get("compatiblePatterns") or []
            new = [fixmap.get(p, p) for p in old]
            if new != old:
                gql(UPDATE_AGENT_PATTERNS, {"input": {
                    "id": agent["id"],
                    "compatiblePatterns": new,
                }})
                fixed += 1
                print(f"[seed]   fixed agent {agent['name']!r}: {old} → {new}")
        next_token = data.get("nextToken")
        if not next_token:
            break

    if fixed == 0:
        print(f"[seed] No stale compatiblePatterns found across {scanned} agent(s).")
    else:
        print(f"[seed] Patched {fixed} agent(s) out of {scanned}.")


def seed_pattern_runtimes(runtime_name: str, runtime_arn: str):
    """Create AgentsPatternRuntime mappings for any pattern that has no mapping yet."""
    result = gql(LIST_PATTERN_RUNTIMES)
    existing_patterns = {
        item["agentsPattern"]
        for item in result.get("listAgentsPatternRuntimes", {}).get("items", [])
    }

    patterns = ["mono", "orchestrator", "swarm", "graph"]
    missing = [p for p in patterns if p not in existing_patterns]

    if not missing:
        print("[seed] All pattern-runtime mappings already exist. Skipping.")
        return

    for pattern in missing:
        gql(CREATE_PATTERN_RUNTIME, {"input": {
            "agentsPattern": pattern,
            "runtimeName": runtime_name,
            "runtimeArn": runtime_arn,
        }})
    print(f"[seed] Created pattern-runtime mappings for: {', '.join(missing)}")


def main():
    print("[seed] Checking existing data...")

    agents_data = gql(LIST_AGENTS)
    quests_data = gql(LIST_QUESTS)

    has_agents = len(agents_data.get("listAgents", {}).get("items", [])) > 0
    has_quests = len(quests_data.get("listQuests", {}).get("items", [])) > 0

    if has_agents or has_quests:
        print("[seed] Data already exists. Skipping.")
    else:
        print("[seed] Empty database — loading initial data...")

        for agent in AGENTS:
            gql(CREATE_AGENT, {"input": agent})
        print(f"[seed] Created {len(AGENTS)} agents.")

        for quest in QUESTS:
            gql(CREATE_QUEST, {"input": quest})
        print(f"[seed] Created {len(QUESTS)} quests.")

    # Always attempt to seed pattern-runtime mappings (idempotent)
    runtime = find_default_runtime()
    if runtime:
        seed_pattern_runtimes(*runtime)
    else:
        print("[seed] No auto_agent_ runtime found — skipping pattern-runtime mapping.")

    # Idempotent migration: rename legacy enum values in existing Agent rows.
    migrate_agent_compatible_patterns()

    print("[seed] Done.")


if __name__ == "__main__":
    main()
