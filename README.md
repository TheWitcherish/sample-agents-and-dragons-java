# sample-agents-and-dragons

**Agents and Dragons** is a hands-on demo of the canonical agentic-AI patterns — **Mono**, **Orchestrator**, **Graph**, **Swarm** — implemented twice over: once in **Java 25 + Spring AI + Spring AI Community AgentCore**, once in **Python + Strands Agents + bedrock-agentcore**. Both back the same React frontend, so during a talk you can flip between them mid-demo and watch the contracts converge.

```
sample-agents-and-dragons/
├── backend/                    # Java 25 + Spring AI + AgentCore (Spring Boot)
├── strands-python-runtime/     # Python + Strands + bedrock-agentcore (BedrockAgentCoreApp)
└── frontend/                   # React 18 + Vite + Amplify Gen 2 — works against either backend
```

| Tier | Pin |
|---|---|
| Java | 25 |
| Spring Boot | 3.5.14 |
| Spring AI | 1.1.3 |
| Spring AI AgentCore | 1.0.0 |
| Python | 3.11+ |
| Strands Agents | 1.29.0+ |
| bedrock-agentcore | 1.4.1+ |
| Bedrock model (default) | `eu.anthropic.claude-sonnet-4-6` (cross-region inference profile) |
| AWS region (default) | `eu-central-1` |
| Frontend | React 18 + Vite + AWS Amplify Gen 2 |

---

## Run the demo (pick a mode)

All four modes use the **exact same** React frontend on `http://localhost:5173`. Pick the mode that matches what you want the audience to see, then jump to the per-pattern walkthroughs below.

| Mode | What the audience sees | When to reach for it |
|---|---|---|
| **A — Local Java backend** | Spring Boot + Spring AI talking to Bedrock directly | Show typed Java agent code, advisor pattern, `@Tool` annotations |
| **B — Local Python backend** | Strands `Swarm`/`Graph` builders running locally | Show how Strands abstracts the same patterns in fewer lines |
| **C — Deployed Java AgentCore Runtime** | Same Java app, packaged in ARM64 container, registered in AgentCore | Show "this is what I just deployed; it's serving live traffic now" |
| **D — Deployed Python AgentCore Runtime** | Same Python app, packaged via `npx ampx sandbox` | Show Amplify Gen 2 + AgentCore convergence story |

> **The pedagogical punchline** of swapping A↔B mid-demo: same `/invocations` contract, same RequestPayload, same Bedrock model — language doesn't matter, the **agent contract** does.

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

### Mode B — Local Python backend

```bash
# Terminal 1 — Python backend (port 8080 — SAME port as Java; only one runs at a time)
cd strands-python-runtime
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
AWS_REGION=eu-central-1 python agent.py

# Terminal 2 — same frontend command as Mode A
cd frontend
VITE_LOCAL_BACKEND_URL=/local-runtime npm run dev
```

The frontend is identical — Vite's dev-server proxy forwards `/local-runtime/*` to whichever backend owns port 8080. **To switch from Java to Python mid-demo: stop the Java terminal, start the Python terminal, hit refresh in the browser.** No frontend env-var changes.

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

### Mode D — Deployed Python AgentCore Runtime

```bash
cd frontend
npx ampx sandbox               # provisions Cognito + AppSync + Amplify Gen 2 + AgentCore Python runtime
unset VITE_LOCAL_BACKEND_URL
npm run dev
```

See `strands-python-runtime/SEEDING.md` for the AppSync/DynamoDB seed mutations after the sandbox finishes.

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
- The recovery message in `finalAnswer` if Spring AI 1.1.3's strict-JSON quirk fires (search for "strict-JSON quirk" in `InvocationController.java` to explain on stream).

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

## Live-demo tips

**The 90-second rule.** Mono is fast (~60s). Orchestrator/Graph/Swarm are 100-180s — stream them so the audience sees a `BEFORE_MODEL_CALL` line every 30-60 seconds. If you're talking through a quiet patch, narrate the architecture diagram from the per-pattern note above.

**The "show CloudWatch" beat.** When demoing Mode C/D, open the AgentCore log group while the runtime cold-starts. Watch the Spring Boot startup sequence appear in CloudWatch in real time — `Started AgentsApplication in 1.3 seconds` lands like a magic trick.

**Switching backends mid-demo (the headline moment).**
1. With Mode A running and a quest in flight, hit Cmd+C in the Java terminal.
2. `cd ../strands-python-runtime && python agent.py`
3. Back in the browser, the in-flight quest is gone (the Java process held it in memory), but a *new* quest with the *same* React UI now runs against Strands. Same payload, same model, different runtime.
4. Land the punchline: **"This is what cross-language agent contracts buy you."**

**Failure-mode demos worth keeping.** The kind that play well on stream:
- Spring AI 1.1.3's strict-JSON quirk → controller's recovery path returns the deliverable URL anyway. Read the comment block on `InvocationController.runWithDeliverableFallback` aloud — it's a great "how production code earns its scars" moment.
- AgentCore cold start (~30s on first invocation) → describe what the runtime is doing while the audience waits. CloudWatch tail makes the wait feel productive.
- Pasting a `us.*` model ID into a JSON when running in `eu-central-1` → instant `ValidationException`. Fix on stream by changing one character.

---

## Troubleshooting cribsheet

| Symptom | Likely fix |
|---|---|
| Frontend "Local backend /local-runtime returned HTTP 500" | The local backend crashed — tail the terminal where you ran `mvn spring-boot:run` or `python agent.py`. |
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

## Python backend — full options

```bash
cd strands-python-runtime
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

# Run (port 8080)
AWS_REGION=eu-central-1 python agent.py

# Override port (BedrockAgentCoreApp respects PORT)
PORT=8000 AWS_REGION=eu-central-1 python agent.py
```

The Python runtime is fire-and-forget — `/invocations` returns `{status: "started", details: {agentCreated: N}}` while the agents run in a background task. Track completion via the AppSync subscription on `Project` (the frontend already does this).

For deployment, the Amplify Gen 2 sandbox builds and deploys the Python runtime container automatically:

```bash
cd frontend
npx ampx sandbox       # builds + pushes + registers in AgentCore in eu-central-1
```

After it finishes, seed `AgentsPatternRuntime` per `strands-python-runtime/SEEDING.md`.

---

## Frontend — full options

```bash
cd frontend
npm ci                                                   # one-time
VITE_LOCAL_BACKEND_URL=/local-runtime npm run dev        # local backend (Java OR Python)
unset VITE_LOCAL_BACKEND_URL && npm run dev              # deployed AgentCore Runtime

# Build for production
npm run build && npm run preview

# Tests + lint
npm run lint
npm run test
```

The Vite dev server forwards `/local-runtime/*` to `http://localhost:8080` by default. Override the target with `LOCAL_BACKEND_URL=http://localhost:8081 npm run dev` (e.g. when running Java and Python side-by-side on different ports).

The runtime call has three branches inside `src/hooks/useAgentRuntime.ts`:

| Mode | Selected by | What it does |
|---|---|---|
| **Local backend (Java OR Python)** | `VITE_LOCAL_BACKEND_URL` set (e.g. `/local-runtime`) | `fetch(${url}/invocations)` with the AgentCore session header. Skips `AgentsPatternRuntime` lookup and Cognito SigV4 entirely. |
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

For the Python sandbox runtime, see `strands-python-runtime/SEEDING.md` (auto-generated with the right ARN per sandbox).

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
│       │   └── dto/                              # RequestPayload, Project, Team, …
│       ├── core/
│       │   ├── AgentFactory.java                 # ChatClient per AgentDefinition
│       │   └── BedrockModels.java                # eu.* defaults
│       ├── observer/
│       │   ├── AgentEvent.java
│       │   ├── EventLog.java
│       │   └── EventCaptureAdvisor.java
│       ├── patterns/
│       │   ├── PatternDispatcher.java
│       │   ├── MonoPattern.java                  # Pattern 1.1 — Basic Reasoning
│       │   ├── OrchestratorPattern.java          # Pattern 4.2 — Agents as Tools
│       │   ├── GraphPattern.java                 # Pattern 4.1 — Workflow DAG
│       │   └── SwarmPattern.java                 # Pattern 4.2 — Peer + handoff
│       └── tools/
│           ├── TaskTools.java                    # @Tool create/update/read
│           ├── WriteResultTool.java              # /tmp/runs (container) or target/runs (laptop) or S3
│           └── WriteResultToolFactory.java
├── strands-python-runtime/                       # Python + Strands + bedrock-agentcore
│   ├── agent.py                                  # BedrockAgentCoreApp entrypoint
│   ├── graph.py                                  # Strands GraphBuilder
│   ├── swarm.py                                  # Strands Swarm + handoff
│   ├── hierarchical.py                           # Orchestrator (Agents-as-Tools)
│   ├── model.py / utils.py / hooks_*.py
│   └── SEEDING.md                                # AppSync mutations after sandbox deploy
└── frontend/                                     # React 18 + Vite + Amplify Gen 2
    ├── vite.config.ts                            # /local-runtime/* → :8080 proxy
    ├── src/hooks/useAgentRuntime.ts              # 3-branch runtime selector
    ├── amplify/                                  # Amplify Gen 2 backend (auth, data, storage, Lambdas)
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
