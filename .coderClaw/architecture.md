# CoderClaw Architecture

## Overview

CoderClaw is a self-hosted AI coding agent gateway that runs on developer machines.
It provides 7 specialized agent roles, a multi-agent orchestrator, 56 skills, and
a WebSocket-based transport layer. It connects to **coderClawLink** (cloud portal)
for fleet management, task delegation, approval workflows, and observability.

## System Diagram

```
Human Developer (TUI / IDE / messaging channel)
        │
        ▼
┌─────────────────────────────────────────┐
│            CoderClaw Gateway             │
│         ws://127.0.0.1:18789            │
│                                          │
│  ┌──────────┐  ┌────────────────────┐   │
│  │ Sessions  │  │ Agent Dispatcher   │   │
│  │ (in-mem)  │  │ spawnSubagentDirect│   │
│  └──────────┘  └────────────────────┘   │
│  ┌──────────────────────────────────┐   │
│  │ Tool Registry                    │   │
│  │ create|edit|view|bash|grep|glob  │   │
│  │ + coderclaw tools (orchestrate,  │   │
│  │   workflow_status, code_analysis, │   │
│  │   project_knowledge, git_history) │   │
│  └──────────────────────────────────┘   │
│  ┌──────────────────────────────────┐   │
│  │ Extension System                 │   │
│  │ diagnostics-otel, memory-core,   │   │
│  │ memory-lancedb, channels, etc.   │   │
│  └──────────────────────────────────┘   │
│  ┌──────────────────────────────────┐   │
│  │ Model Providers                  │   │
│  │ Anthropic, OpenAI, Google,       │   │
│  │ Ollama, node-llama-cpp,          │   │
│  │ coderclawLLM (planned)           │   │
│  └──────────────────────────────────┘   │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│  ClawLinkTransportAdapter (HTTP)        │
│  → POST /api/runtime/executions         │
│  → GET  /api/runtime/executions/:id     │
│                                          │
│  ClawLinkRelayService (WS)              │
│  → wss://.../api/claws/:id/upstream     │
│  → bridges local gateway ↔ ClawRelayDO  │
│  → PATCH .../heartbeat every 5 min      │
│                                          │
│  ClawLinkDirectorySync (HTTP)           │
│  → PUT /api/claws/:id/directories/sync  │
│  → one-way upload of .coderClaw/ files  │
└─────────────┬───────────────────────────┘
              │
              ▼
┌─────────────────────────────────────────┐
│        coderClawLink (Cloud)            │
│  Hono on Cloudflare Workers             │
│  Drizzle ORM → Postgres (Hyperdrive)    │
│  ClawRelayDO (Durable Object, WS relay) │
│  SPA (React) for management             │
└─────────────────────────────────────────┘
```

## Core Modules

### Gateway (`src/gateway/`)

- WebSocket server on port 18789
- JSON-RPC message protocol
- Session management (create, switch, reset, message history)
- Agent dispatch — spawns subagents with tool access

### Agent System (`src/agents/`)

- `subagent-spawn.ts` — `spawnSubagentDirect()`: the actual agent execution engine
- `agent-scope.ts` — resolves agent configuration from YAML config
- `model-selection.ts` — model routing, allowlists, provider resolution
- `tools/` — built-in tools (create, edit, view, bash, grep, glob, task)

### CoderClaw Layer (`src/coderclaw/`)

- `agent-roles.ts` — 7 built-in role definitions (⚠️ not wired to runtime yet)
- `orchestrator.ts` — workflow engine, dependency DAG, task scheduling
- `orchestrator-enhanced.ts` — distributed orchestrator (Phase 2 target)
- `project-context.ts` — `.coderClaw/` directory management, YAML I/O
- `types.ts` — ProjectContext, AgentRole, SessionHandoff, CodeMap types
- `tools/` — orchestrate, workflow_status, code_analysis, project_knowledge, git_history

### TUI (`src/tui/`)

- Ink + React terminal interface
- Slash commands: /agent, /model, /init, /session, /think, /compact, /cost
- `tui-command-handlers.ts` — command dispatch

### Transport (`src/transport/`)

- `clawlink-adapter.ts` — HTTP transport to coderClawLink API (runtime executions)
- Types: TransportAdapter interface, ClawLinkConfig, RuntimeInterface

### ClawLink Relay (`src/infra/`)

- `clawlink-relay.ts` — `ClawLinkRelayService`: persistent upstream WS + local gateway bridge
  - Connects to `wss://.../api/claws/:id/upstream` on gateway startup
  - Bridges browser→agent: translates relay wire messages into local `GatewayClient` requests
  - Bridges agent→browser: converts `"chat"` EventFrames to ClawLink wire protocol for broadcast
  - HTTP heartbeat PATCH every 5 minutes to keep `lastSeenAt` fresh in the DB
  - Exponential backoff reconnect (1 s → 30 s) on WS drop
- `clawlink-directory-sync.ts` — `syncCoderClawDirectoryOnStartup()`: one-way HTTP PUT of
  all `.coderClaw/` files to the API on gateway boot (up to 200 files, 512 KB each)

### Extensions (`extensions/`)

- Plugin system with lifecycle hooks (load, unload, on-message, etc.)
- `diagnostics-otel` — 634 lines, 20+ metrics, OTel traces + logs via OTLP/HTTP
- `memory-core` / `memory-lancedb` — vector memory with node-llama-cpp embeddings
- Channel extensions: Discord, Slack, Telegram, Matrix, IRC, etc.

### Skills (`skills/`)

- 56 skill definitions, each with SKILL.md (instructions + tool mappings)
- `coderclaw` meta-skill: code_analysis, project_knowledge, git_history, orchestrate, workflow_status
- `skill-creator` skill: scaffolds new skills from templates
- `gh-issues`, `github`: Git/GitHub workflow automation
- `coding-agent`: core coding skill used by all code-creation agents

## Known Architectural Gaps

See `.coderClaw/planning/CAPABILITY_GAPS.md` for the full audit. Current status:

1. ✅ PARTIAL — `executeWorkflow()` now called; `planning`/`adversarial` workflow types exist
   in `orchestrator-enhanced.ts` but not yet wired into the tool switch
2. ✅ RESOLVED — `agent-roles.ts` wired; gateway loads custom roles from `.coderClaw/agents/`
   on startup; `findAgentRole` used by orchestrator's `executeTask`
3. MISSING — Session handoff: `saveSessionHandoff`/`loadLatestSessionHandoff` implemented
   but never called from the agent lifecycle
4. MISSING — Workflow persistence: orchestrator state is in-memory only (`Map<string, Workflow>`)
5. MISSING — Post-task knowledge loop: `.coderClaw/memory/` never indexed; no post-task hook

## Data Flow: Agent Task Execution

```
1. User sends message via TUI / WS / channel
2. Gateway routes to active session
3. Session dispatches to agent (via spawnSubagentDirect)
4. Agent receives system prompt + tools + message
5. Agent calls tools (create, edit, bash, etc.)
6. Tool results streamed back to session
7. Agent produces response
8. Response rendered in TUI / forwarded to channel
```

## Data Flow: coderClawLink Integration

```
1. coderclaw init → login → register claw → get API key
2. API key stored in ~/.coderclaw/.env (CODERCLAW_LINK_API_KEY)
3. clawLink.instanceId stored in .coderClaw/context.yaml
4. On gateway startup:
   a. ClawLinkRelayService opens WS to /api/claws/:id/upstream
   b. ClawLinkDirectorySync uploads .coderClaw/ files via HTTP PUT
   c. DB: connectedAt and lastSeenAt set immediately
5. Browser client connects to /api/claws/:id/ws → ClawRelayDO
   a. ClawRelayDO sends { type:"claw_online" } immediately
6. Browser → ClawRelayDO → upstream WS → ClawLinkRelayService
   → GatewayClient.request("chat.send") → local agent
7. Agent response → GatewayClient event → ClawLinkRelayService
   → upstream WS → ClawRelayDO.broadcast() → all browser clients
8. HTTP heartbeat PATCH every 5 min keeps lastSeenAt fresh
```
