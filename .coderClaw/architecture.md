# CoderClaw Architecture

> Last updated: 2026-03-04  
> See also: [Feature Gap Analysis](../docs/FEATURE_GAP_ANALYSIS.md) | [Business Roadmap](../docs/BUSINESS_ROADMAP.md)

## Overview

CoderClaw is a self-hosted AI coding agent gateway that runs on developer machines.
It provides 7 specialised agent roles, a multi-agent orchestrator, 53 skills, a
semantic knowledge loop, and a WebSocket-based transport layer. It connects to
**coderClawLink** (cloud portal) for fleet management, task delegation, approval
workflows, and observability.

**New Architecture (2026.3.x): Distributed Cloudflare Worker Control Plane**
The gateway now operates as a local "brain" connected to a Cloudflare Worker-based
control plane. The local agent maintains full filesystem/shell access and persistent
state, while Cloudflare Workers provide scalable routing, container orchestration,
and user entry points. All persistent state remains on the user's machine; the
Cloudflare Worker is stateless and can be restarted/replaced at any time.

---

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

---

## Core Modules

### Gateway (`src/gateway/`)

- WebSocket server on port 18789
- JSON-RPC message protocol
- Session management (create, switch, reset, message history)
- Agent dispatch — spawns subagents with tool access

### Agent System (`src/agents/`)

- `subagent-spawn.ts` — `spawnSubagentDirect()`: primary agent execution engine
- `agent-scope.ts` — resolves agent configuration from YAML config
- `model-selection.ts` — model routing, allowlists, provider resolution
- `system-prompt.ts` — modular system prompt builder (full / minimal / none modes)
- `tools/` — core tools: create, edit, view, bash, grep, glob, task
- `context.ts` — context window discovery and token budget management
- `pi-embedded-runner/` — embedded agent runner with auto-compaction, safety timeout,
  post-compaction audit, tool-result context guard

### CoderClaw Layer (`src/coderclaw/`)

- `agent-roles.ts` — 7 built-in roles + custom role loading from `.coderClaw/agents/*.yaml`;
  `registerCustomRoles()` / `clearCustomRoles()` for runtime management
- `orchestrator.ts` — workflow engine: dependency DAG, task scheduling, disk persistence,
  `remote:<clawId>` routing via `dispatchToRemoteClaw`
- `orchestrator-enhanced.ts` — workflow factory functions: `createPlanningWorkflow()`,
  `createFeatureWorkflow()`, `createBugFixWorkflow()`, `createRefactorWorkflow()`,
  `createAdversarialReviewWorkflow()`
- `project-context.ts` — `.coderClaw/` directory management, YAML I/O, session handoff,
  workflow state persistence, knowledge memory append
- `staged-edits.ts` — **staged edit buffer** for inline diff/accept/reject pair programming
  mode (competes with Cursor Composer, Continue.dev `⌘K`); `stageEdit()`, `acceptEdit()`,
  `acceptAllEdits()`, `rejectEdit()`, `buildUnifiedDiff()`, `buildStagedSummary()`
- `types.ts` — ProjectContext, AgentRole, SessionHandoff, CodeMap types
- `tools/` — orchestrate, workflow_status, code_analysis, project_knowledge,
  git_history, save_session_handoff, claw_fleet
- `tools/codebase-search-tool.ts` — **`codebase_search`** tool: natural-language keyword
  extraction → ripgrep/grep multi-keyword search → relevance ranking by hit count +
  path bonus + breadth bonus → ranked snippets (competes with Cursor/Continue `@codebase`)

### TUI (`src/tui/`)

- `@mariozechner/pi-tui` terminal interface
- **Full slash command set** (updated 2026-03-04):
  - Session: `/new`, `/reset`, `/handoff`, `/session`, `/sessions`, `/abort`
  - Context: `/compact [instructions]`, `/spec <goal>`, `/workflow [id]`
  - Agent: `/agent`, `/agents`, `/model`, `/models`, `/think`
  - Config: `/verbose`, `/reasoning`, `/usage`, `/elevated`, `/activation`
  - Project: `/init`, `/project`, `/sync`
  - Staged diff: `/diff [file]`, `/accept [file|all]`, `/reject [file|all]`
  - System: `/gateway`, `/daemon`, `/logs`, `/setup`, `/settings`, `/exit`
- `tui-command-handlers.ts` — command dispatch with `/spec` → planning workflow,
  `/workflow` → status query, `/compact` → explicit compaction, `/new` → handoff hint,
  `/diff` → show staged changes, `/accept` → apply staged, `/reject` → discard staged

### MCP Server (`src/gateway/mcp-server-http.ts`)

- Exposes CoderClaw tools as an **MCP server** at `http://localhost:18789/mcp`
- Implements MCP 2024-11-05 protocol: `initialize`, `tools/list`, `tools/call` via JSON-RPC 2.0
- Legacy REST endpoint: `POST /mcp/call` for non-MCP clients
- **Tools exposed**: `codebase_search`, `project_knowledge`, `git_history`,
  `workflow_status`, `claw_fleet`
- CORS headers set for browser-based IDE extensions
- Auth: same Bearer token as gateway auth (loopback allowed without token)
- **Integration**: Add `http://localhost:18789/mcp` to Cursor or Continue.dev as an MCP
  server to use CoderClaw's semantic search and project knowledge inside your IDE

### Transport (`src/transport/`)

- `clawlink-adapter.ts` — HTTP transport to coderClawLink API (runtime executions)
- Types: TransportAdapter interface, ClawLinkConfig, RuntimeInterface

### ClawLink Relay (`src/infra/`)

- `clawlink-relay.ts` — `ClawLinkRelayService`: persistent upstream WS + local gateway bridge
  - Bidirectional: browser→agent and agent→browser
  - Heartbeat PATCH every 5 min with capabilities array
  - Exponential backoff reconnect (1 s → 30 s)
- `clawlink-directory-sync.ts` — one-way upload of `.coderClaw/` on startup and `/sync`
- `remote-subagent.ts` — `dispatchToRemoteClaw()` for claw-to-claw task delegation
- `knowledge-loop.ts` — `KnowledgeLoopService`: per-run activity accumulation,
  semantic summary derivation (`deriveActivitySummary()`), memory file append, auto-sync

### Extensions (`extensions/`)

- `diagnostics-otel` — 20+ OTel metrics, traces, logs via OTLP/http
- `memory-core` / `memory-lancedb` — hybrid BM25 + vector memory (node-llama-cpp embeddings)
- Channel extensions: Discord, Slack, Telegram, Matrix, IRC, and more

### Skills (`skills/`)

- 53 skill definitions with SKILL.md and tool mappings
- `coderclaw` meta-skill: code_analysis, project_knowledge, git_history,
  orchestrate, workflow_status
- `skill-creator`: scaffolds new skills from templates
- `gh-issues`, `github`: Git/GitHub workflow automation

---

## Capability Status (as of 2026-03-04)

### ✅ Core Infrastructure — Complete

1. ✅ `executeWorkflow()` wired — all 6 workflow types execute end-to-end
2. ✅ `agent-roles.ts` wired — 7 built-in + custom YAML roles enforced at spawn
3. ✅ Session handoff — `save_session_handoff` tool + `/handoff` + auto-load on start
4. ✅ Workflow persistence — checkpoints to `.coderClaw/sessions/workflow-*.yaml`; resume after restart
5. ✅ Knowledge loop — activity log + CoderClawLink sync + `project_knowledge memory` query
6. ✅ Claw mesh — fleet discovery, heartbeat, `/forward` dispatch, `claw_fleet` tool,
   `remote:<clawId>` orchestrator routing

### New Subsystems (2026.3.1)

**Session Handoff** (`src/coderclaw/tools/save-session-handoff-tool.ts`):

- Agent tool that writes `.coderClaw/sessions/<id>.yaml` with summary, decisions, next steps
- TUI loads latest handoff on session start and shows a system message
- `/handoff` slash command triggers agent to produce and save a handoff

**Workflow Persistence** (`src/coderclaw/project-context.ts`, `orchestrator.ts`):

- `saveWorkflowState()` — serializes full workflow (Map→Record, Date→ISO string) to YAML
- `loadPersistedWorkflows()` — scans `sessions/` and hydrates incomplete workflows at startup
- `resumeWorkflow()` — picks up from last checkpoint; in-flight tasks reset to `pending`

**Knowledge Loop** (`src/infra/knowledge-loop.ts`):

- Subscribes to `onAgentEvent`; accumulates tool/file activity per run
- On `lifecycle.end`: appends timestamped entry to `.coderClaw/memory/YYYY-MM-DD.md`
- Calls `syncCoderClawDirectory()` to push the updated file to CoderClawLink

**Claw-to-Claw Mesh** (`src/infra/remote-subagent.ts`, `src/coderclaw/tools/claw-fleet-tool.ts`):

- `claw_fleet` tool: queries `GET /api/claws/fleet` (claw-keyed auth) → returns online claws + capabilities
- `remote:<clawId>` orchestrator role: dispatches task via `POST /api/claws/:id/forward`
- Target claw receives `remote.task` via WS; executes as local chat message
- `ClawLinkRelayService` heartbeat now reports `capabilities: ["chat","tasks","relay","remote-dispatch"]`

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
   a. ClawLinkRelayService opens WS to /api/claws/:id/upstream?key=…
   b. ClawLinkDirectorySync uploads .coderClaw/ files via HTTP PUT
   c. DB: connectedAt and lastSeenAt set immediately
5. Browser client connects to /api/claws/:id/ws → ClawRelayDO
   a. ClawRelayDO sends { type:"claw_online" } immediately
6. Browser → ClawRelayDO → upstream WS → ClawLinkRelayService
   → GatewayClient.request("chat.send") → local agent
7. Agent response → GatewayClient event → ClawLinkRelayService
   → upstream WS → ClawRelayDO.broadcast() → all browser clients
8. HTTP heartbeat PATCH every 5 min keeps lastSeenAt fresh
   Payload: { capabilities: ["chat","tasks","relay","remote-dispatch"] }
9. On run complete: KnowledgeLoopService calls syncCoderClawDirectory()
   → PUT /api/claws/:id/directories/sync (pushes memory files)
```

## Data Flow: Multi-Claw Orchestration

### Explicit Target (`remote:<clawId>`)

```
1. Agent calls orchestrate with role: "remote:<targetClawId>"
2. Orchestrator calls dispatchToRemoteClaw(targetClawId, task)
3. POST /api/claws/:targetId/forward?from=…&key=…
   Body: { type: "remote.task", task: "…", fromClawId: "…", timestamp: "…" }
4. coderClawLink receives request → delivers via ClawRelayDO to target upstream WS
5. Target claw receives { type: "remote.task", task: "…" }
6. Target executes as a local chat message
7. [OPEN] Result streaming back to orchestrating claw — requires coderClawLink relay frame
```

### Capability-Based Auto-Routing (`remote:auto` or `remote:auto[cap1,cap2]`)

```
1. Agent calls orchestrate with role: "remote:auto" or "remote:auto[gpu,high-memory]"
2. Orchestrator calls selectClawByCapability(opts, requiredCaps)
3. GET /api/claws/fleet?from=…&key=… — fetch all online peer claws
4. Filter to claws satisfying ALL required capabilities; pick highest-scoring
5. If no match → workflow step fails with descriptive error
6. Proceed with resolved clawId as if "remote:<selectedId>" was specified
```
