# sample-agents-and-dragons

**Agents and Dragons** is a Java application that demonstrates the canonical agentic AI patterns — **Mono**, **Hierarchical**, **Graph**, **Swarm** — built on **Spring AI Community AgentCore** + Amazon Bedrock. It ships with a React frontend so you can build agent teams interactively and watch them work end-to-end on your own machine.

| Tier | Pin |
|---|---|
| Java | 25 |
| Spring Boot | 3.5.14 |
| Spring AI | 1.1.3 |
| Spring AI AgentCore | 1.0.0 |
| Bedrock model (default) | `us.anthropic.claude-sonnet-4-6` |
| Frontend | React 18 + Vite + AWS Amplify Gen 2 |

```
sample-agents-and-dragons/
├── backend/                      # Java 25 + Spring AI + AgentCore (Spring Boot)
│   ├── pom.xml
│   ├── samples/                  # Ready-to-curl JSON payloads
│   └── src/main/java/com/witcherish/samples/agents/…
└── frontend/                     # React 18 + Vite + Amplify Gen 2
```

---

## Prerequisites

```bash
# 1. JDK 25 (Amazon Corretto recommended)
/usr/libexec/java_home -v 25 || brew install --cask corretto

# 2. Maven 3.9+
mvn -v

# 3. Node.js 18+ for the frontend
node -v

# 4. AWS credentials with Bedrock access in us-east-1 (or wherever Claude 4 is enabled)
aws sts get-caller-identity
aws bedrock list-inference-profiles --region us-east-1 | grep claude-sonnet-4-6
```

---

## Quick start (3 terminals)

```bash
# Terminal 1 — Java backend
cd sample-agents-and-dragons/backend
JAVA_HOME=$(/usr/libexec/java_home -v 25) AWS_REGION=us-east-1 mvn spring-boot:run

# Terminal 2 — React frontend (points at the local Java backend)
cd sample-agents-and-dragons/frontend
npm ci
VITE_LOCAL_BACKEND_URL=http://localhost:8080 npm run dev

# Terminal 3 — quick curl smoke test
cd sample-agents-and-dragons/backend
curl -sS -X POST http://localhost:8080/run \
     -H 'Content-Type: application/json' \
     -d @samples/mono.json | python3 -m json.tool
```

Open `http://localhost:5173` in the browser. Pick a quest, build a team with the **Mono** pattern, kick it off — the call goes to the local Java backend, the answer comes back, the dashboards still read from the deployed AppSync data plane.

---

## Frontend — full options

The frontend stays Amplify Gen 2 (Cognito + AppSync + DynamoDB + Lambdas) for everything *except* the agent runtime invocation. The runtime call has three modes, picked at request time:

| Mode | Selected by | What it does |
|---|---|---|
| **Local Java backend** | `VITE_LOCAL_BACKEND_URL` env var | `fetch(${url}/run, {method: POST, body: payload})`. Runs **first** in the runtime hook: skips `AgentsPatternRuntime` lookup, MCP gateway URL, S3 bucket, and Cognito SigV4 entirely — all unnecessary for a local Spring Boot service. **Default for local development.** |
| **Lambda → AgentCore** | `outputs.custom.useAgentCoreRuntimeFunction === true` | Calls the `invokeAgentRuntime` Lambda which then invokes a Bedrock AgentCore Runtime ARN read from the `AgentsPatternRuntime` table. |
| **Direct BedrockAgentCore** | `useAgentCoreRuntimeFunction === false` | Same as above, but the browser calls Bedrock AgentCore directly with SigV4 instead of going through Lambda. |

The runtime payload (`{project, team, config}`) is identical across all three. The local-Java branch leaves `config.gateway_url` / `token` / `s3_bucket_name` empty — the Java backend has its own in-memory tools.

### Run the frontend locally against the Java backend

```bash
cd frontend
npm ci                                                         # one-time
VITE_LOCAL_BACKEND_URL=http://localhost:8080 npm run dev       # http://localhost:5173
```

Persist the env var by creating `frontend/.env.local`:

```env
VITE_LOCAL_BACKEND_URL=http://localhost:8080
```

> **Auth still required.** The frontend uses Cognito for sign-in even when the runtime call is local. Use the credentials from your Amplify deployment, or sign up via the app if your User Pool allows it.

### Run the frontend against a deployed AgentCore Runtime (no local Java)

```bash
cd frontend
npm ci
npm run dev      # no env var → falls through to the Lambda branch
```

In this mode the agents run on whatever Bedrock AgentCore Runtime ARN is mapped in the `AgentsPatternRuntime` table per pattern (configured by an admin). The local Java service is bypassed.

### Redeploy the frontend (Amplify CI/CD)

`frontend/amplify_outputs.json` is committed (it points at the existing deployed backend). Push the repo and Amplify will rebuild + redeploy:

```bash
git push
```

To run the full Amplify sandbox locally (frontend + Amplify backend + Python AgentCore container):

```bash
cd frontend
npx ampx sandbox
```

### Build the frontend for production

```bash
cd frontend
npm run build       # outputs frontend/dist/
npm run preview     # serve the production bundle locally
```

### Frontend tests

```bash
cd frontend
npm run lint
npm run test
```

---

## Java backend — full options

All `mvn` commands run from `backend/`:

```bash
cd backend

# Compile
JAVA_HOME=$(/usr/libexec/java_home -v 25) mvn clean compile

# Run (foreground)
JAVA_HOME=$(/usr/libexec/java_home -v 25) AWS_REGION=us-east-1 mvn spring-boot:run

# Run on a non-default port
PORT=8081 mvn spring-boot:run

# Override the Bedrock model id at runtime (no rebuild)
BEDROCK_MODEL_ID=us.anthropic.claude-haiku-4-5-20251001-v1:0 mvn spring-boot:run
```

> Or invoke from the repo root with `-f backend/pom.xml`, e.g. `mvn -f backend/pom.xml spring-boot:run`.

Endpoints:

| Endpoint | Method | Purpose |
|---|---|---|
| `/run` | POST | Structured `{project, team, config}` payload |
| `/invocations` | POST | AgentCore-compatible (`@AgentCoreInvocation`) — same payload |
| `/events` | GET | In-memory event log (`?projectId=...` to filter) |
| `/ping` | GET | AgentCore liveness probe |
| `/actuator/health` | GET | Spring Boot health |

CORS is open for `http://localhost:5173` (Vite dev server) on `/run`, `/invocations`, `/events`. See `backend/src/main/java/com/witcherish/samples/agents/api/CorsConfig.java`.

---

## Mono agent — setup & test

The **Mono** pattern is the foundation block — single specialist agent, single Bedrock invocation. Use it to verify your local setup before exercising the multi-agent patterns.

### 1. Sample payload

```bash
cat backend/samples/mono.json
```

It builds a one-witcher team and asks it to explain a noonwraith.

### 2. Hit `/run`

```bash
curl -sS -X POST http://localhost:8080/run \
     -H 'Content-Type: application/json' \
     -d @backend/samples/mono.json | python3 -m json.tool
```

Expected (model text varies):

```json
{
    "status": "COMPLETED",
    "pattern": "mono",
    "entrypointAgentId": "agent-geralt",
    "finalAnswer": "A noonwraith is the spirit of a woman who died a violent death during harvest season ...",
    "participatingAgentIds": ["agent-geralt"]
}
```

### 3. Same payload via the AgentCore-compatible endpoint

```bash
curl -sS -X POST http://localhost:8080/invocations \
     -H 'Content-Type: application/json' \
     -d @backend/samples/mono.json | python3 -m json.tool
```

Both endpoints return the identical `PatternResult` schema.

### 4. Inspect the captured events (Observer pattern)

```bash
curl -sS 'http://localhost:8080/events?projectId=demo-mono-001' | python3 -m json.tool
```

You should see at least two events per call:
- `BEFORE_MODEL_CALL` — the prompt sent to the model
- `AFTER_MODEL_CALL` — the model's reply (truncated to ~200 chars)

### 5. Customising the agent

Edit `backend/samples/mono.json` to:
- Change the **prompt** (`project.prompt` and/or `team.prompt`).
- Swap the **model** (`team.agents[0].model`):
  - `us.anthropic.claude-haiku-4-5-20251001-v1:0` (cheaper, faster)
  - `us.anthropic.claude-sonnet-4-6` (default)
  - `us.anthropic.claude-opus-4-7` (highest quality)
- Replace the **system prompt** (`team.agents[0].prompt`) to change the persona.

> Bedrock requires the `us.…` cross-region inference-profile prefix for the Claude 4 family. Bare `anthropic.claude-…` IDs raise `ValidationException`.

---

## Troubleshooting

| Symptom | Likely fix |
|---|---|
| `AccessDeniedException` from Bedrock | Enable model access in the AWS console (`Bedrock → Model access`). |
| `ValidationException: model id ...` | Use the `us.…` prefix (e.g. `us.anthropic.claude-sonnet-4-6`). |
| Frontend says "No runtime ARN configured for pattern" | The frontend reached the Lambda branch — set `VITE_LOCAL_BACKEND_URL` and restart `npm run dev`. |
| CORS error in browser console | Check the Java backend started cleanly and the URL in `VITE_LOCAL_BACKEND_URL` matches `http://localhost:8080` (no trailing slash). |
| `npm ci` fails on Node < 18 | Upgrade Node — `nvm install 20`. |
| Port 8080 already in use | `PORT=8081 mvn spring-boot:run` and update `VITE_LOCAL_BACKEND_URL`. |
| `/events` returns 500 | Stale build — `cd backend && mvn clean compile` and restart. |

---

## Project layout

```
sample-agents-and-dragons/
├── backend/                                # Java 25 + Spring AI + AgentCore
│   ├── pom.xml
│   ├── samples/
│   │   └── mono.json
│   └── src/main/java/com/witcherish/samples/agents/
│       ├── AgentsApplication.java
│       ├── api/
│       │   ├── InvocationController.java   # /run, /invocations, /events
│       │   ├── CorsConfig.java             # Allow localhost:5173
│       │   └── dto/                        # RequestPayload, Project, Team, …
│       ├── core/
│       │   ├── AgentFactory.java           # ChatClient per AgentDefinition
│       │   └── BedrockModels.java
│       ├── observer/
│       │   ├── AgentEvent.java
│       │   ├── EventLog.java
│       │   └── EventCaptureAdvisor.java    # Spring AI CallAdvisor
│       ├── patterns/
│       │   ├── PatternDispatcher.java
│       │   ├── MonoPattern.java            # ✅ Pattern 1.1 — Basic Reasoning
│       │   ├── HierarchicalPattern.java    # 🚧 Pattern 4.2 — Supervisor
│       │   ├── GraphPattern.java           # 🚧 Pattern 4.1 — Workflow DAG
│       │   └── SwarmPattern.java           # 🚧 Pattern 4.2 — Peer + handoff
│       └── tools/
│           └── TaskTools.java              # @Tool create/update/read
└── frontend/                               # React 18 + Vite + Amplify Gen 2
    ├── src/
    │   └── hooks/useAgentRuntime.ts        # Local-Java toggle via VITE_LOCAL_BACKEND_URL
    ├── amplify/                            # Amplify Gen 2 backend (auth, data, storage, Lambdas)
    ├── amplify_outputs.json                # Pinned to the deployed Amplify environment
    └── package.json
```

## Wiring the deployed AgentCore branch (`AgentsPatternRuntime`)

The frontend's "Lambda → AgentCore" branch (active when `VITE_LOCAL_BACKEND_URL` is unset) reads a runtime ARN per pattern from the **`AgentsPatternRuntime`** DynamoDB table. Each row maps a pattern name to a Bedrock AgentCore Runtime ARN.

For local development you don't need this — set `VITE_LOCAL_BACKEND_URL=http://localhost:8080` and the frontend hits the Java backend directly. The seeding below is only needed when:

- You've deployed the Java backend as an AgentCore Runtime container (Step 12 / coming later), **and**
- You want the deployed frontend (or a teammate without a local backend) to invoke that runtime.

### Required rows

You'll insert one row per pattern you want to expose:

| `agentsPattern` | `runtimeName` | `runtimeArn` |
|---|---|---|
| `mono` | (e.g. `agents-and-dragons-mono`) | `arn:aws:bedrock-agentcore:<region>:<account>:runtime/<id>` |
| `hierarchical` | … | … |
| `graph` | … | … |
| `swarm` | … | … |

Until Step 12 is shipped, the four patterns share a *single* AgentCore Runtime (the Spring Boot app dispatches on `team.pattern` internally), so all four rows can point at the same ARN.

### How to insert the rows

**Option A — AppSync console (easiest)**

1. Open the AWS AppSync console → your API → **Queries** tab.
2. Sign in with a Cognito user in the `ADMINS` group.
3. Run the mutation below for each pattern:

```graphql
mutation Seed {
  createAgentsPatternRuntime(input: {
    agentsPattern: "mono"
    runtimeName: "agents-and-dragons"
    runtimeArn: "arn:aws:bedrock-agentcore:us-east-1:111122223333:runtime/agents-and-dragons-XXXX"
  }) { id agentsPattern runtimeArn }
}
```

**Option B — DynamoDB console**

1. Find the table named `AgentsPatternRuntime-<apiId>-NONE`.
2. *Create item* → set `agentsPattern`, `runtimeName`, `runtimeArn`, plus the standard Amplify-managed `id`, `createdAt`, `updatedAt` fields.

**Option C — AWS CLI** (one row at a time)

```bash
aws dynamodb put-item \
  --table-name "AgentsPatternRuntime-<apiId>-NONE" \
  --item '{
    "id": {"S": "mono"},
    "agentsPattern": {"S": "mono"},
    "runtimeName": {"S": "agents-and-dragons"},
    "runtimeArn": {"S": "arn:aws:bedrock-agentcore:us-east-1:111122223333:runtime/agents-and-dragons-XXXX"},
    "createdAt": {"S": "2026-01-01T00:00:00Z"},
    "updatedAt": {"S": "2026-01-01T00:00:00Z"},
    "__typename": {"S": "AgentsPatternRuntime"}
  }'
```

> Step 12 will replace this manual step with a CDK Custom Resource that seeds the four rows from the deployed runtime ARN automatically.

---

## Roadmap

Aligned with the talk-flow:

- [x] **Step 6 — Mono** (Pattern 1.1, Basic Reasoning) — single specialist agent.
- [ ] **Step 7 — Hierarchical** (Pattern 4.2, Supervisor) — orchestrator delegates to specialists wrapped as tools.
- [ ] **Step 8 — Graph** (Pattern 4.1, Workflow DAG) — agents executed in topological order from `team.connections`.
- [ ] **Step 9 — Swarm** (Pattern 4.2, Peer + handoff) — peer agents with a `handoff_to_agent` tool and a bounded loop.
- [ ] **Step 12 — AgentCore deployment** — package the Java backend as a Bedrock AgentCore Runtime container (multi-stage Dockerfile + ECR + `CfnRuntime` in `CONTAINER` mode), CDK construct that builds + pushes the image, Custom Resource that seeds `AgentsPatternRuntime` automatically.
