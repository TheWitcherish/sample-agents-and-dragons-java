# sample-agents-and-dragons

**Agents and Dragons** is a hands-on demo of the canonical agentic-AI patterns — **Mono**, **Orchestrator**, **Graph**, **Swarm** — implemented in **Java 25 + Spring AI + Spring AI Community AgentCore**, served behind a React + Amplify Gen 2 frontend. The same Spring Boot app runs locally in Mode A and as a Bedrock AgentCore Runtime container in Mode C — one codebase, one contract, two deployment topologies.

```
sample-agents-and-dragons/
├── backend/                    # Java 25 + Spring AI + AgentCore (Spring Boot)
└── frontend/                   # React 18 + Vite + Amplify Gen 2 — talks to local OR deployed backend
```

| Tier | Pin |
|---|---|
| Java | 25 |
| Spring Boot | 3.5.14 |
| Spring AI | 1.1.6 |
| Spring AI AgentCore | 1.0.0 |
| MCP SDK | `io.modelcontextprotocol.sdk:mcp-core:1.1.0` |
| Bedrock model (default) | `eu.anthropic.claude-sonnet-4-6` (cross-region inference profile) |
| AWS region (default) | `eu-central-1` |
| Frontend | React 18 + Vite + AWS Amplify Gen 2 |

---

## Run the demo (pick a mode)

Both modes use the **exact same** React frontend on `http://localhost:5173`. Pick the mode that matches what you want the audience to see, then jump to the per-pattern walkthroughs below.

| Mode | What the audience sees | When to reach for it |
|---|---|---|
| **A — Local Java backend** | Spring Boot + Spring AI talking to Bedrock directly | Show typed Java agent code, advisor pattern, `@Tool` annotations |
| **C — Deployed Java AgentCore Runtime** | Same Java app, packaged in ARM64 container, registered in AgentCore | Show "this is what I just deployed; it's serving live traffic now" |

> **The pedagogical punchline** of swapping A↔C mid-demo: same `/invocations` contract, same RequestPayload, same Bedrock model — local laptop or managed AgentCore container, the **agent contract** doesn't change.

### Mode A — Local Java backend

```bash
# Terminal 1 — Java backend (port 8080)
cd backend
JAVA_HOME=$(/usr/libexec/java_home -v 25) AWS_REGION=eu-central-1 mvn spring-boot:run

# Terminal 2 — React frontend (proxies /local-runtime → localhost:8080)
cd frontend
npm ci                                              # one-time
VITE_LOCAL_BACKEND_URL=/local-runtime npm run dev
```

Open `http://localhost:5173`, sign in via Cognito, build a Mono team, kick it off.

### Mode C — Deployed Java AgentCore Runtime

```bash
# Build the ARM64 container, push to ECR, register the runtime, and confirm via DynamoDB.
cd backend
AWS_REGION=eu-central-1 ./deploy.sh

# Frontend talks to the deployed runtime via the AgentsPatternRuntime DynamoDB lookup.
cd frontend
unset VITE_LOCAL_BACKEND_URL    # important — falls through to the deployed branch
npm run dev
```

You'll need to seed the `AgentsPatternRuntime` table with the runtime ARN that `deploy.sh` prints — see [Wiring the deployed AgentCore branch](#wiring-the-deployed-agentcore-branch-agentspatternruntime).

> The Amplify Gen 2 sandbox (`npx ampx sandbox`) provisions Cognito + AppSync + storage + the `invokeAgentRuntime` Lambda. The Java runtime itself is deployed out-of-band via `backend/deploy.sh` and referenced through the `AgentsPatternRuntime` lookup.

---

## Per-pattern teaching notes

Each pattern ships a ready-to-curl JSON payload in `backend/samples/`. The `/run` and `/invocations` endpoints both accept the same shape, so you can copy-paste straight into a curl tab during the talk.

### Mono — Pattern 1.1 (Basic Reasoning)

**The story.** One specialist, one prompt, one Bedrock call. The simplest agent that can ship a deliverable.

**Sample.** `backend/samples/mono.json` — single Frontend Builder asked to ship a Web Paint app.

**What the audience watches.**
- The agent's `BEFORE_MODEL_CALL` event in `/events` (the prompt going in).
- `writeResult` tool firing once.
- The deliverable URL (`file:///tmp/runs/<projectId>/index.html` locally, `https://<bucket>.s3.<region>.amazonaws.com/...` on a deployed runtime).

**Expected timing.** ~50-90 seconds. One inference round; nothing parallel.

**The "now you try" hook.** Swap the model from `eu.anthropic.claude-sonnet-4-6` to `eu.anthropic.claude-haiku-4-5-20251001-v1:0` and watch the latency drop ~3x at the cost of HTML quality.

**Pedagogical contrast.** Mono is the *baseline* you measure the multi-agent patterns against. If your problem fits in Mono, the multi-agent overhead is wasted tokens.

### Orchestrator — Pattern 4.2 (Agents as Tools, Strands doctrine)

**The story.** A boss agent decomposes the goal and routes sub-tasks to specialists *wrapped as tools*. Specialists never see each other. The boss synthesises one final answer.

**Sample.** `backend/samples/orchestrator.json` — Coordinator + Architect + Frontend Developer + Reviewer.

**What the audience watches.**
- The Coordinator calls `Game_Logic_Architect` (a tool, not a peer), then `Frontend_Developer`, then `Code_Reviewer` — visible in the events stream.
- The frontend specialist calls `writeResult` directly; the boss only forwards the URL.
- Each agent card lighting up READY → WORKING → STOPPED with token + cycle counts (Spring AI's `Usage` metadata, surfaced via `EventCaptureAdvisor`).
- The Adventure Log filling progressively as agents call `createTask` / `updateTask` over MCP — same wire format as their domain tools, but routed to the `manage-tasks` Lambda for AppSync writes.

**Expected timing.** ~90-150 seconds. 3-4 sequential inference rounds, one per specialist.

**The "now you try" hook.** Add a fifth specialist (e.g., a Performance Auditor) and watch the orchestrator pick the right one for "make this load faster."

**Pedagogical contrast.** Orchestrator is **dynamic but centralised** — the LLM picks who runs next. Compare to Graph (topology picks) and Swarm (peers pick).

### Graph — Pattern 4.1 (Workflow DAG)

**The story.** A deterministic DAG of agents. Each connection is a directed edge, execution is topologically ordered, fan-in waits for all predecessors.

**Sample.** `backend/samples/graph.json` — `Architect → {Frontend, UX} → Finalizer`.

**What the audience watches.**
- The execution log line `[graph] order=[agent-architect, agent-frontend, agent-ux, agent-finalizer]` — sibling order is *insertion order in the JSON*, deterministic across runs.
- The Finalizer's input shows two upstream blocks (`--- Output from Frontend (...) ---` and `--- Output from UX Copywriter (...) ---`).
- The merged HTML at the deliverable URL: Frontend's full document with UX's onboarding overlay woven in at line ~350.

**Expected timing.** ~140-180 seconds. 4 sequential rounds with one parallelism opportunity (Frontend and UX could run concurrently — the current implementation runs them sequentially in roster order; faithful Strands behaviour).

**The "now you try" hook.** Add an edge `agent-ux → agent-frontend` (so Frontend depends on UX too) and watch the topo-sort serialize them.

**Pedagogical contrast.** Graph is the right primitive when the workflow is **known up front**. The audience can predict the execution order before you hit run — that's the whole point.

### Swarm — Pattern 4.2 (Peer + handoff)

**The story.** Peers with a `handoff_to_agent` tool. Agent X calls handoff; control transfers to Y. When an agent ends its turn *without* handing off, its reply (or `writeResult`) is the swarm's final answer.

**Sample.** `backend/samples/swarm.json` — `Architect → Frontend → Reviewer`. Frontend hands the HTML to Reviewer in the handoff `context` field; Reviewer calls `writeResult` to ship.

**What the audience watches.**
- Two `[swarm] handoff #N X -> Y : <message>` log lines.
- The third agent terminates the swarm by calling `writeResult` with `returnDirect=true` (no further handoff).
- `participatingAgentIds` reflects actual execution order from `nodeHistory`, not the team roster.

**Expected timing.** ~140-180 seconds. 3 sequential turns + 2 handoffs.

**The "now you try" hook.** Add a "Code Critic" peer; have the Reviewer hand off to it before shipping. Watch the bounded-loop safety net (`max_handoffs=20`) keep things tight.

**Pedagogical contrast.** Swarm is **dynamic and decentralised** — peers decide. Vs Orchestrator (boss decides), vs Graph (topology decides). Swarm is overkill for our 3-agent demo; the *design choice* shows up clearly only with 5+ agents and ambiguous routing.

---

## Spring AI Recipes alignment

Our four patterns map onto Mark Heckler's [`spring-ai-recipes`](https://github.com/habuma/spring-ai-recipes) — a community catalogue of single-purpose Spring AI demos. Every recipe in that repo is laser-focused on **one** primitive; our patterns weave several together. The table below is the audience's bridge: if they've read a recipe, they can find its concept in our code.

| Our pattern | Recipe(s) it leverages | Where to look in our code |
|---|---|---|
| **Mono** | [`skills`](https://github.com/habuma/spring-ai-recipes/tree/main/skills), [`todo-write-tool`](https://github.com/habuma/spring-ai-recipes/tree/main/todo-write-tool), [`tool-choice-explanation`](https://github.com/habuma/spring-ai-recipes/tree/main/tool-choice-explanation) | `MonoPattern.java` + `WriteResultTool.java` + `TaskTools.java`. Same `@Tool` POJOs the recipes show, plus a `ToolChoiceExplanation` reasoning sidecar (see below). |
| **Orchestrator** | [`a2a-client`](https://github.com/habuma/spring-ai-recipes/tree/main/a2a-client) (TaskTool subagents), [`tool-choice-explanation`](https://github.com/habuma/spring-ai-recipes/tree/main/tool-choice-explanation) | `OrchestratorPattern.asTool(...)` hand-rolls what `TaskTool.builder().subagentReferences(...)` does in the recipe — but with hooks for telemetry and reasoning. |
| **Graph** | [`graph-workflow`](https://github.com/habuma/spring-ai-recipes/tree/main/graph-workflow), [`graph-workflow-loop`](https://github.com/habuma/spring-ai-recipes/tree/main/graph-workflow-loop), [`graph-workflow-hitl`](https://github.com/habuma/spring-ai-recipes/tree/main/graph-workflow-hitl) | `GraphPattern.java` — class Javadoc maps every Alibaba `StateGraph` concept (`addNode`, `addConditionalEdges`, `START`/`END`, `KeyStrategy`/`ReplaceStrategy`, `interruptBefore`) onto our hand-rolled topology so readers can switch between mental models. |
| **Swarm** | (no direct recipe — Strands-native) | `SwarmPattern.java`. The `handoff_to_agent` tool with `returnDirect=true` is custom; a future port could use `a2a-server`/`a2a-client` to model peer-to-peer over A2A. |

### What we adopted: `tool-choice-explanation` reasoning sidecar

Inspired by the [`tool-choice-explanation`](https://github.com/habuma/spring-ai-recipes/tree/main/tool-choice-explanation) recipe (Spring AI 2.0.0-M5's `AugmentedToolCallbackProvider`). Since we're pinned to **Spring AI 1.1.6** for AgentCore compatibility, we hand-roll the same effect:

- A typed record in [`api/dto/ToolChoiceExplanation.java`](backend/src/main/java/com/witcherish/samples/agents/api/dto/ToolChoiceExplanation.java) carries `innerThought` + `confidence` + `memoryNotes` alongside the real tool arguments.
- `WriteResultTool.writeResult(...)` and the orchestrator's specialist `asTool(...)` both accept the record (or its lenient JSON shape) and forward `innerThought` to `Session.saveAgentMessage(role="reasoning", ...)`.
- The frontend's existing `AgentMessage` subscription renders the reasoning in the Adventure Log alongside model output — viewers see *why* the orchestrator picked a specialist, *why* the agent shipped now, in real time.

> The orchestrator's system prompt explicitly asks for `reasoning` on every specialist call. The Frontend specialist's `writeResult` reasoning is optional — Sonnet 4.x usually fills it in unprompted.

### What we deliberately skipped (for now)

- **`a2a-server` / `a2a-client`** — A2A is a great future direction but adds an HTTP transport layer that competes with the MCP gateway story we already tell. Park as roadmap.
- **`longterm-memory` (`AutoMemoryToolsAdvisor`)** — our quests are single-session. LTM gives no audience-visible payoff in a 90-second demo.
- **`graph-workflow-loop` / `graph-workflow-hitl`** — conditional cycles + human-in-the-loop. Both natural extensions; would land as a `HumanReviewPattern` (Pattern 5) in a future iteration.
- **`AugmentedToolCallbackProvider` itself** — only ships in Spring AI 2.x. We'd swap our hand-roll for the upstream construct on the 2.x bump.

---

## Live UI from a Java backend (Strands-style telemetry)

The React frontend's agent cards, edges, and Adventure Log are wired to AppSync subscriptions on `AgentRun` / `AgentTransition` / `AgentMessage` / `Task`. Strands' Python runtime fed those tables natively; the Java port reaches them through **the same Bedrock AgentCore MCP Gateway** the agents already use for their domain tools — one protocol, two roles.

```
Java AgentCore runtime  ──MCP─▶  AgentCore Gateway (CUSTOM_JWT)  ──Lambda─▶  manage-tasks
   ↑                                                                              │
   │                                                                              ▼
ChatClient + EventCaptureAdvisor                                              AppSync (DynamoDB)
   │                                                                              │
   └── pattern hooks: saveAgentState / saveAgentTransition / saveAgentMessage     │
                                                                                  ▼
                                                      Frontend subscriptions ── live UI
```

- **`backend/src/main/java/.../telemetry/McpTelemetryPublisher.java`** — per-quest `McpSyncClient` (`io.modelcontextprotocol.sdk:mcp-core`), JWT forwarded as bearer, fire-and-forget. Fails open with a no-op `Session` if the gateway is unreachable.
- **`backend/src/main/java/.../patterns/PatternDispatcher.java`** — opens one telemetry session per `RequestPayload`; emits `IN_PROGRESS` / `COMPLETED` / `ON_ERROR` for the project.
- **Each pattern (Mono/Orchestrator/Graph/Swarm)** — emits `READY` → `WORKING` → `STOPPED` per agent + `saveAgentTransition` on edges. `EventCaptureAdvisor` accumulates real token + cycle counts from `ChatResponse.getMetadata().getUsage()`, so cards display actual numbers, not zeros.
- **`frontend/amplify/functions/manage-tasks/handler.ts`** — Amplify Function exposing `create_task`, `update_task`, `read_task`, `save_agent_state`, `save_agent_transition`, `save_agent_message`, `save_project_state`. Tool schemas live in `manage-tasks/schema.json`; `MCPGateway.ts` registers it as a gateway target named `lambda` (so tools appear on the wire as `lambda___save_agent_state` etc.).
- **`frontend/src/data/{agents,quests}.json`** — canonical seed data, read by both the Admin "Load Agents" button (`utils/initData.ts`) and the bootstrap `scripts/seed-data.py`.

### Strands-style structured output

Each pattern's free-form final answer is also coerced into a `QuestResult` record (`api/dto/QuestResult.java` — `summary`, `deliverableUrl`, `status`) via Spring AI's `BeanOutputConverter` (`patterns/StructuredAnswer.java`, `.entity(QuestResult.class)`). Frontend reads `body.result.deliverableUrl` directly — no parsing prose for URLs. A regex fallback covers the rare case where the formatter LLM goes off-schema.

---

## Live-demo tips

**The 90-second rule.** Mono is fast (~60s). Orchestrator/Graph/Swarm are 100-180s — stream them so the audience sees a `BEFORE_MODEL_CALL` line every 30-60 seconds. If you're talking through a quiet patch, narrate the architecture diagram from the per-pattern note above.

**The "show CloudWatch" beat.** When demoing Mode C, open the AgentCore log group while the runtime cold-starts. Watch the Spring Boot startup sequence appear in CloudWatch in real time — `Started AgentsApplication in 1.3 seconds` lands like a magic trick.

**Switching topologies mid-demo (the headline moment).**
1. With Mode A running and a quest in flight, kill the Java terminal.
2. In the frontend terminal, `unset VITE_LOCAL_BACKEND_URL && npm run dev` to flip onto the deployed AgentCore Runtime.
3. Re-run the same quest payload. Same React UI, same RequestPayload, same model — local laptop swapped for a managed AgentCore container.
4. Land the punchline: **"This is what one well-defined agent contract buys you."**

**Failure-mode demos worth keeping.** The kind that play well on stream:
- **Spring AI strict-JSON quirk** → when the LLM emits a `tool_use.input` argument with raw newlines, Spring AI's `ModelOptionsUtils.OBJECT_MAPPER` fails to re-encode it on the next turn. We patch this globally at startup in `core/SpringAiJsonLeniency.java` (one `@PostConstruct`, flips `ALLOW_UNESCAPED_CONTROL_CHARS` on the static factory). Read the comment aloud — it's a great "production agentic AI has scars" moment, and it covers all four patterns at once.
- **AgentCore cold start** (~30s on first invocation) → describe what the runtime is doing while the audience waits. CloudWatch tail makes the wait feel productive.
- **Region-mismatched model ID** → pasting a `us.*` model ID into a JSON when running in `eu-central-1` gives an instant `ValidationException`. Fix on stream by changing one character. (Both `frontend/scripts/seed-data.py` and `frontend/src/utils/initData.ts` now read from canonical JSON in `frontend/src/data/{agents,quests}.json`, so the fix applies in one place.)
- **Specialist failure leaking up** → when an orchestrator's specialist tool throws, the orchestrator gets a typed `Error in <agent>: <root-cause>` string. CloudWatch shows the full stack via `log.error("...", e)`. Bedrock SDK debug logs (`logging.level.software.amazon.awssdk.request=DEBUG`) carry the request ID + validation reason for post-mortem.

> Local backend tail in Mode A: `cd backend && AWS_REGION=eu-central-1 mvn spring-boot:run`. The frontend doesn't care which Java process owns port 8080.

---

## Troubleshooting cribsheet

| Symptom | Likely fix |
|---|---|
| Frontend "Local backend /local-runtime returned HTTP 500" | The local backend crashed — tail the terminal where you ran `mvn spring-boot:run`. |
| Frontend never sees a response | Vite proxy isn't forwarding. Confirm `VITE_LOCAL_BACKEND_URL=/local-runtime` and that something is listening on 8080. |
| `AccessDeniedException` from Bedrock | Enable model access in the AWS console: Bedrock → Model access → request access for Claude Sonnet 4.6 / Haiku 4.5 in `eu-central-1`. |
| `ValidationException: model id ...` | Use the `eu.…` prefix (e.g. `eu.anthropic.claude-sonnet-4-6`). `us.…` profiles only work from US regions; `global.…` works from anywhere. |
| AgentCore invocation hangs >2 min | Cold start. First invocation after a deploy takes 30-90s while the container boots. Subsequent calls are warm. Use `--cli-read-timeout 600` with `aws bedrock-agentcore invoke-agent-runtime`. |
| `useradd: UID 1000 is not unique` during Docker build | The Temurin base image already uses UID 1000; the Dockerfile pins UID 10001 to avoid this. If you forked, keep that pin. |
| `ValidationException: Access denied while validating ECR URI` | The exec role is missing `ecr:GetAuthorizationToken` / `ecr:BatchGetImage` / `ecr:GetDownloadUrlForLayer`. `deploy.sh` adds them automatically — re-run it. |
| `Error writing deliverable locally: /app/target` | Old image cached. The Dockerfile sets `SAD_LOCAL_RUNS_DIR=/tmp/runs` for containers; rebuild and redeploy. |
| Frontend says "No runtime ARN configured for pattern" | You're in deployed mode but the `AgentsPatternRuntime` DynamoDB table is empty. See [Wiring the deployed branch](#wiring-the-deployed-agentcore-branch-agentspatternruntime). |
| `npm ci` fails on Node < 18 | `nvm install 20`. |
| Port 8080 already in use | One backend is still running. `lsof -i :8080` to find the PID, `kill <pid>`. |
| `/events` returns 500 | Stale build — `cd backend && mvn clean compile` and restart. |
| `JsonParseException: Illegal unquoted character ((CTRL-CHAR, code 10))` | Spring AI's `ModelOptionsUtils.OBJECT_MAPPER` re-encoding a stored `tool_use.input` containing raw newlines. Fixed at startup by `core/SpringAiJsonLeniency.java`; if the bug returns, confirm the bean is being instantiated (`grep '\[json-leniency\]' CloudWatch logs`). |
| Frontend cards stay blank during a run | Java backend isn't reaching the MCP gateway. Confirm `config.gateway_url` and `config.token` in the request payload (frontend computes these from `outputs.custom.gatewayUrl`); CloudWatch should show `[telemetry] MCP session ready at …` at quest start. |
| `Error in <agent> (<role>): null` in the orchestrator's reply | An older build. Newer code returns a real root-cause via `Throwables.rootMessage(e)` and stack-traces via `log.error("...", e)`. Redeploy. |
| Agent uses a stale model ID after edit to `seed-data.py` or `initData.ts` | Both files now read from `frontend/src/data/{agents,quests}.json`. Edit the JSON, then either hit the Admin "Load Agents" button (adds rows) or hot-patch DynamoDB rows directly. `npx ampx sandbox` only reseeds when the table is empty. |
| HTTP 415 from AgentCore (`Content-Type 'application/octet-stream' is not supported`) | `frontend/amplify/functions/invoke-agent-runtime/handler.ts` must set `contentType: 'application/json'` on `InvokeAgentRuntimeCommand`. The default is octet-stream, which Spring MVC rejects. |
| `s3:PutObject` 403 from the AgentCore exec role | `backend/deploy.sh` auto-resolves the bucket name from `frontend/amplify_outputs.json`. If you ran `deploy.sh` before `npx ampx sandbox`, re-run it once the outputs file exists, or set `S3_BUCKET=<bucket>` explicitly. |

---

## Java backend — full options

All `mvn` commands run from `backend/`:

```bash
cd backend

# Compile
JAVA_HOME=$(/usr/libexec/java_home -v 25) mvn clean compile

# Run (foreground)
JAVA_HOME=$(/usr/libexec/java_home -v 25) AWS_REGION=eu-central-1 mvn spring-boot:run

# Run on a non-default port
PORT=8081 mvn spring-boot:run

# Override the Bedrock model id at runtime (no rebuild)
BEDROCK_MODEL_ID=eu.anthropic.claude-haiku-4-5-20251001-v1:0 mvn spring-boot:run
```

> Or invoke from the repo root with `-f backend/pom.xml`.

Endpoints:

| Endpoint | Method | Purpose |
|---|---|---|
| `/run` | POST | Structured `{project, team, config}` payload (legacy alias for `/invocations`) |
| `/invocations` | POST | AgentCore-compatible (`@AgentCoreInvocation`) — same payload |
| `/events` | GET | In-memory event log (`?projectId=...` to filter) |
| `/ping` | GET | AgentCore liveness probe |
| `/actuator/health` | GET | Spring Boot health |

CORS is open for `http://localhost:5173` (Vite dev server) on `/**`. See `backend/src/main/java/com/witcherish/samples/agents/api/CorsConfig.java`.

### Curl cheat-sheet

```bash
# Direct (no proxy) — talks to Java backend
curl -sS -X POST http://localhost:8080/invocations \
     -H 'Content-Type: application/json' \
     -H 'X-Amzn-Bedrock-AgentCore-Runtime-Session-Id: demo-mono-session-pad-to-33-bytes' \
     -d @samples/mono.json | python3 -m json.tool

# Through the Vite proxy (frontend running) — works for whichever backend is up
curl -sS -X POST http://localhost:5173/local-runtime/invocations \
     -H 'Content-Type: application/json' \
     -H 'X-Amzn-Bedrock-AgentCore-Runtime-Session-Id: demo-mono-session-pad-to-33-bytes' \
     -d @backend/samples/mono.json | python3 -m json.tool

# Deployed AgentCore Runtime
RUNTIME_ARN="$(aws bedrock-agentcore-control list-agent-runtimes --region eu-central-1 \
  --query "agentRuntimes[?agentRuntimeName=='sample_agents_and_dragons'].agentRuntimeArn | [0]" \
  --output text)"
aws bedrock-agentcore invoke-agent-runtime \
  --region eu-central-1 \
  --cli-read-timeout 600 \
  --agent-runtime-arn "$RUNTIME_ARN" \
  --runtime-session-id "demo-$(date +%s)-pad-to-33-bytes-suffix" \
  --content-type application/json --accept application/json \
  --payload fileb://backend/samples/mono.json /tmp/out.json && cat /tmp/out.json | jq
```

---

## Frontend — full options

```bash
cd frontend
npm ci                                                   # one-time
VITE_LOCAL_BACKEND_URL=/local-runtime npm run dev        # local Java backend
unset VITE_LOCAL_BACKEND_URL && npm run dev              # deployed AgentCore Runtime

# Build for production
npm run build && npm run preview

# Tests + lint
npm run lint
npm run test
```

The Vite dev server forwards `/local-runtime/*` to `http://localhost:8080` by default. Override the target with `LOCAL_BACKEND_URL=http://localhost:8081 npm run dev` (e.g. when running the Java backend on a non-standard port).

The runtime call has three branches inside `src/hooks/useAgentRuntime.ts`:

| Mode | Selected by | What it does |
|---|---|---|
| **Local Java backend** | `VITE_LOCAL_BACKEND_URL` set (e.g. `/local-runtime`) | `fetch(${url}/invocations)` with the AgentCore session header. Skips `AgentsPatternRuntime` lookup and Cognito SigV4 entirely. |
| **Lambda → AgentCore** | `outputs.custom.useAgentCoreRuntimeFunction === true` | Calls the `invokeAgentRuntime` Lambda which then invokes a Bedrock AgentCore Runtime ARN read from `AgentsPatternRuntime`. |
| **Direct Bedrock AgentCore** | `useAgentCoreRuntimeFunction === false` | Browser calls Bedrock AgentCore directly with SigV4 instead of going through Lambda. |

> **Auth still required.** Cognito sign-in is needed even when the runtime call is local — the project/agent metadata reads still go through Amplify Data.

---

## Wiring the deployed AgentCore branch (`AgentsPatternRuntime`)

When `VITE_LOCAL_BACKEND_URL` is unset, the frontend reads a runtime ARN per pattern from the `AgentsPatternRuntime` DynamoDB table. Each row maps a pattern to a Bedrock AgentCore Runtime ARN.

After running `cd backend && AWS_REGION=eu-central-1 ./deploy.sh`, the script prints the runtime ARN — seed all four pattern rows pointing at it (the Spring Boot app dispatches on `team.pattern` internally, so all four can share one runtime).

**Quickest — AppSync console**

1. Open AppSync → your API → **Queries** tab.
2. Sign in as a Cognito user in the `ADMINS` group.
3. Run for each pattern (`mono`, `orchestrator`, `graph`, `swarm`):

```graphql
mutation Seed {
  createAgentsPatternRuntime(input: {
    agentsPattern: "mono"
    runtimeName: "sample_agents_and_dragons"
    runtimeArn: "arn:aws:bedrock-agentcore:eu-central-1:111122223333:runtime/sample_agents_and_dragons-XXXX"
  }) { id agentsPattern runtimeArn }
}
```

The Java runtime ARN is also exposed as `outputs.custom.agentCoreRuntimeArn` after `npx ampx sandbox` runs, which is what `frontend/scripts/seed-data.py` uses for idempotent seeding.

---

## Project layout

```
sample-agents-and-dragons/
├── backend/                                      # Java 25 + Spring AI + AgentCore
│   ├── pom.xml
│   ├── Dockerfile                                # ARM64 multi-stage (Maven build → Temurin 25 JRE)
│   ├── deploy.sh                                 # ECR + IAM + AgentCore Runtime registration
│   ├── samples/
│   │   ├── mono.json
│   │   ├── orchestrator.json
│   │   ├── graph.json
│   │   └── swarm.json
│   └── src/main/java/com/witcherish/samples/agents/
│       ├── AgentsApplication.java
│       ├── api/
│       │   ├── InvocationController.java         # /run, /invocations, /events
│       │   ├── CorsConfig.java                   # localhost:5173
│       │   └── dto/                              # RequestPayload, Project, Team, QuestResult, …
│       ├── core/
│       │   ├── AgentFactory.java                 # ChatClient + advisor per AgentDefinition (BuiltAgent)
│       │   ├── BedrockModels.java                # eu.* / global.* defaults
│       │   └── SpringAiJsonLeniency.java         # @PostConstruct hot-fix for Spring AI strict-JSON quirk
│       ├── observer/
│       │   ├── AgentEvent.java
│       │   ├── EventLog.java                     # in-memory ring buffer for /events
│       │   ├── EventCaptureAdvisor.java          # captures tokens + cycle counts from ChatResponse usage
│       │   └── Throwables.java                   # rootMessage(t) — walk getCause() chain for clean errors
│       ├── patterns/
│       │   ├── PatternDispatcher.java            # opens MCP telemetry Session, dispatches by team.pattern
│       │   ├── MonoPattern.java                  # Pattern 1.1 — Basic Reasoning
│       │   ├── OrchestratorPattern.java          # Pattern 4.2 — Agents as Tools
│       │   ├── GraphPattern.java                 # Pattern 4.1 — Workflow DAG
│       │   ├── SwarmPattern.java                 # Pattern 4.2 — Peer + handoff
│       │   └── StructuredAnswer.java             # Strands-style structured output → QuestResult
│       ├── telemetry/
│       │   └── McpTelemetryPublisher.java        # per-quest MCP client → manage-tasks Lambda (live UI feed)
│       └── tools/
│           ├── TaskTools.java                    # per-quest @Tool create/update/read (mirrors to MCP)
│           ├── TaskToolsFactory.java             # builds TaskTools bound to the active MCP Session
│           ├── WriteResultTool.java              # /tmp/runs (container) or target/runs (laptop) or S3
│           └── WriteResultToolFactory.java
└── frontend/                                     # React 18 + Vite + Amplify Gen 2
    ├── vite.config.ts                            # /local-runtime/* → :8080 proxy
    ├── src/
    │   ├── data/                                 # canonical seed data (JSON)
    │   │   ├── agents.json                       # 18 agent definitions (eu.* / global.* model IDs)
    │   │   └── quests.json                       # 7 sample quests
    │   ├── hooks/useAgentRuntime.ts              # 3-branch runtime selector
    │   ├── pages/ProjectRunPage.tsx              # agent cards + Adventure Log + deliverable URL
    │   └── utils/initData.ts                     # re-exports agents.json/quests.json for Admin "Load" buttons
    ├── scripts/
    │   └── seed-data.py                          # bootstrap: AppSync IAM + reads from src/data/*.json
    ├── amplify/                                  # Amplify Gen 2 backend (auth, data, storage, Lambdas)
    │   ├── agentcore/
    │   │   ├── MCPGateway.ts                     # CUSTOM_JWT gateway + Lambda target (manage-tasks)
    │   │   └── AgentCoreRuntimeRole.ts           # exec role for AgentCore-managed runtimes
    │   └── functions/manage-tasks/
    │       ├── handler.ts                        # task CRUD + AgentRun/Message/Transition/Project writes
    │       └── schema.json                       # canonical tool schema (gateway target reads this at synth)
    └── amplify_outputs.json                      # Pinned to the deployed Amplify environment
```

---

## Roadmap

Aligned with the talk-flow:

- [x] **Step 6 — Mono** (Pattern 1.1, Basic Reasoning) — single specialist agent.
- [x] **Step 7 — Orchestrator** (Pattern 4.2, "Agents as Tools" — Strands doctrine) — entrypoint agent routes sub-tasks to specialists wrapped as tools.
- [x] **Step 8 — Graph** (Pattern 4.1, Workflow DAG) — agents executed in topological order from `team.connections`.
- [x] **Step 9 — Swarm** (Pattern 4.2, Peer + handoff) — peer agents with a `handoff_to_agent` tool and a bounded loop.
- [x] **Step 10 — AgentCore deployment** — multi-stage ARM64 Dockerfile, ECR push, IAM exec role, `bedrock-agentcore-control create-agent-runtime`, read-back from the AgentCore registry.
- [x] **Step 11 — Live-demo runbook** — this README + per-pattern teaching notes + dual-backend Vite proxy.
- [x] **Step 12 — Live UI feed via MCP** — Java patterns publish `AgentRun` / `AgentTransition` / `AgentMessage` / `Task` / `Project` updates through the AgentCore MCP Gateway → `manage-tasks` Lambda → AppSync, so the React frontend's agent cards and Adventure Log animate during a run.
- [x] **Step 13 — Strands-style structured output** — every pattern coerces its final answer into a `QuestResult` record via Spring AI's `BeanOutputConverter`, so the frontend reads `body.result.deliverableUrl` directly instead of parsing prose.
- [x] **Step 14 — Real token + cycle aggregates** — `EventCaptureAdvisor` reads Spring AI's normalised `Usage` metadata; agent cards show actual prompt/completion/total tokens plus model-call cycle counts.
- [x] **Step 15 — Production scars patched** — global `SpringAiJsonLeniency` workaround for the strict-JSON re-encoding bug, full-stack error logging via `Throwables.rootMessage(e)` + `log.error("...", e)`, AWS SDK request-level DEBUG logs in CloudWatch.
- [x] **Step 16 — Canonical seed data** — `frontend/src/data/{agents,quests}.json` is the single source of truth; both the Admin "Load Agents" button (TS) and the `seed-data.py` bootstrap import the same files. Edits stop drifting between consumers.
- [x] **Step 17 — `spring-ai-recipes` alignment** — `GraphPattern` Javadoc maps onto Alibaba `StateGraph` vocabulary; `OrchestratorPattern` and `WriteResultTool` adopt the [`tool-choice-explanation`](https://github.com/habuma/spring-ai-recipes/tree/main/tool-choice-explanation) recipe via a hand-rolled `ToolChoiceExplanation` record so the model's reasoning shows up live in the Adventure Log.
