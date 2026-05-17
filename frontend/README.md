# Frontend — Agents and Dragons

React 18 + TypeScript progressive web app, built on AWS Amplify Gen 2 with real-time GraphQL subscriptions and a Witcher-flavoured Cloudscape UI.

The frontend talks to **two** backends, switchable per-request:

- **Local Java backend** (`../backend`) — Spring AI + AgentCore, running on `http://localhost:8080`. The default for local development.
- **Deployed AWS Amplify backend** (Cognito + AppSync + DynamoDB + Lambdas) — defined under `amplify/`, deployed via Amplify Hosting / `npx ampx sandbox`. The agent runtime itself is whatever Bedrock AgentCore Runtime ARN is mapped per pattern in the `AgentsPatternRuntime` table (set by an admin).

## Project context

This frontend is part of the [`sample-agents-and-dragons`](../) monorepo:

```
sample-agents-and-dragons/
├── backend/      # Java 25 + Spring AI + AgentCore (this is what /run hits in dev)
└── frontend/     # ← you are here
```

See the [repo README](../README.md) for the full local-development quick-start (3 terminals, runs in under 2 minutes).

## Quick start

```bash
# 1. install (one-time)
npm ci

# 2. start the Vite dev server pointing at the local Java backend
VITE_LOCAL_BACKEND_URL=http://localhost:8080 npm run dev
```

That sets the runtime hook to POST `{project, team, config}` payloads to your local Spring Boot service. Without the env var the app falls back to a deployed Bedrock AgentCore Runtime ARN (set per pattern in the `AgentsPatternRuntime` DynamoDB table by an admin).

Persist the env var by creating `.env.local`:

```env
VITE_LOCAL_BACKEND_URL=http://localhost:8080
```

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server on `http://localhost:5173` |
| `npm run build` | Type-check + production build to `dist/` |
| `npm run preview` | Serve the production bundle locally |
| `npm run lint` | ESLint with `--max-warnings 0` |
| `npm run test` | Vitest unit tests |
| `npx ampx sandbox` | Deploy the Amplify backend (auth, data, storage, Lambdas, AgentCore container) to your AWS account |

## How the runtime call routes

`src/hooks/useAgentRuntime.ts` picks the runtime branch in this order:

1. **`VITE_LOCAL_BACKEND_URL` set** → `fetch(${url}/run, …)` to the local Java backend. Skips `AgentsPatternRuntime`, MCP gateway URL, S3 bucket, and SigV4 entirely — none are required for the local Spring Boot service. This is the local-dev path.
2. **`outputs.custom.useAgentCoreRuntimeFunction === true`** → invokes the `invokeAgentRuntime` Lambda, which calls a Bedrock AgentCore Runtime ARN read from the `AgentsPatternRuntime` table.
3. **Otherwise** → same target, but the browser calls `BedrockAgentCoreClient.InvokeAgentRuntime` directly with SigV4.

The `RequestPayload` (`{project, team, config}`) is identical across all three branches.

## Tech stack

- **React 18** + TypeScript + **Vite**
- **AWS Amplify Gen 2** — typed `generateClient<Schema>()` against AppSync + DynamoDB
- **Cloudscape Design System** + custom Fantasy theme
- **`@xyflow/react`** for the live agent network graph
- **Vitest** + `@testing-library/react`

## Amplify backend (the deployed one)

Defined under `amplify/`:

```
amplify/
├── auth/                 # Cognito User Pool (admin-only sign-up)
├── data/resource.ts      # GraphQL schema + auth rules
├── storage/              # S3 bucket
├── functions/
│   ├── verify-owner/         # ownerKey-based project visibility check
│   ├── manage-tasks/         # MCP gateway target — agent-side task CRUD
│   └── invoke-agent-runtime/ # Browser-friendly wrapper around Bedrock AgentCore
├── agentcore/
│   ├── DirectToAgentCoreRuntime.ts  # CDK construct for an AgentCore Runtime container
│   ├── MCPGateway.ts                # Bedrock MCP gateway with Cognito JWT authorizer
│   └── …
└── backend.ts            # Wires everything together
```

Deployment:

| Path | Command | Effect |
|---|---|---|
| Sandbox (your AWS account) | `npx ampx sandbox` | Deploys the full backend to a per-developer stack, regenerates `amplify_outputs.json` |
| Hosting CI/CD | `git push` (with Amplify Hosting connected) | Triggers the `amplify.yml` pipeline → lint → test → build → deploy |

## Further reading

- [Repository README](../README.md) — End-to-end Java + frontend dev loop.
- [Spring AI AgentCore community module](https://github.com/spring-ai-community/spring-ai-agentcore) — what the local Java backend is built on.
