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
#
# Canonical seed data lives in `frontend/src/data/{agents,quests}.json` so this
# script and the in-app "Load Agents" / "Load Quests" buttons (TS path:
# `frontend/src/utils/initData.ts`) read from the same source. Editing models,
# prompts, or roster size happens in one place — JSON.

_data_root = os.path.join(os.path.dirname(__file__), "..", "src", "data")

with open(os.path.join(_data_root, "agents.json")) as _f:
    AGENTS = json.load(_f)
with open(os.path.join(_data_root, "quests.json")) as _f:
    QUESTS = json.load(_f)
print(f"[seed] Loaded {len(AGENTS)} agents and {len(QUESTS)} quests from src/data/")

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
        print("[seed] No agentCoreRuntimeArn found in amplify_outputs.json — skipping pattern-runtime mapping.")

    # Idempotent migration: rename legacy enum values in existing Agent rows.
    migrate_agent_compatible_patterns()

    print("[seed] Done.")


if __name__ == "__main__":
    main()
