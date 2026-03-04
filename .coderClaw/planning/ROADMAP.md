# Local Roadmap Mirror (for coderClaw self-improvement)

> Last updated: 2026-03-04
> Canonical source: workspace-root ROADMAP.md

---

## Phase -1: Core Infrastructure ✅ Complete

### -1.1 Wire `executeWorkflow()` into `orchestrate` ✅
- `orchestrate` tool calls `globalOrchestrator.executeWorkflow()` synchronously.
- All 6 workflow types (feature, bugfix, refactor, planning, adversarial, custom) execute.

### -1.2 Bridge `agent-roles.ts` into runtime ✅
- 7 built-in roles + custom roles from `.coderClaw/agents/*.yaml` loaded at gateway startup.
- Role model / tools / system-prompt applied at subagent spawn via `roleConfig`.

### -1.3 Wire session handoff save/load ✅
- `save_session_handoff` tool writes `.coderClaw/sessions/<id>.yaml`.
- TUI auto-loads latest handoff on session start.
- `/handoff` slash command triggers agent to produce and save a handoff.

### -1.4 Workflow persistence ✅
- `saveWorkflowState()` checkpoints each task transition to disk.
- `loadPersistedWorkflows()` restores incomplete workflows at gateway restart.
- `resumeWorkflow()` resets in-flight tasks to `pending` and re-executes.

### -1.5 Post-task knowledge loop ✅
- `KnowledgeLoopService` writes `.coderClaw/memory/YYYY-MM-DD.md` after every run.
- `project_knowledge memory` query surfaces recent entries to agents.
- Auto-synced to CoderClawLink on write.

### -1.6 Claw-to-claw mesh ✅
- Fleet discovery via `GET /api/claws/fleet`.
- Heartbeat PATCH reports capabilities array.
- `POST /api/claws/:id/forward` delivers `remote.task` to peer claw.
- `claw_fleet` tool exposes fleet to agents.
- Orchestrator routes `remote:<clawId>` steps via `dispatchToRemoteClaw`.

---

## Phase 0: TUI UX & Context Quality ✅ Complete (2026-03-04)

### 0.1 `/spec <goal>` TUI command ✅
- Triggers spec-driven planning workflow from TUI (PRD → arch spec → task breakdown).
- File: `src/tui/commands.ts`, `src/tui/tui-command-handlers.ts`

### 0.2 `/workflow [id]` TUI command ✅
- Queries orchestrator workflow status directly from TUI.
- File: `src/tui/commands.ts`, `src/tui/tui-command-handlers.ts`

### 0.3 `/compact` in TUI help ✅
- Explicit `case "compact":` handler added; `/compact [instructions]` added to `/help`.
- File: `src/tui/commands.ts`, `src/tui/tui-command-handlers.ts`

### 0.4 Session-reset handoff hint ✅
- `ChatLog.hasUserMessages()` tracks session activity.
- `/new`/`/reset` shows `/handoff` reminder when session has user messages.
- File: `src/tui/components/chat-log.ts`, `src/tui/tui-command-handlers.ts`

### 0.5 Semantic knowledge summaries ✅
- `deriveActivitySummary()` produces one-line semantic label per run (no model call).
- Appended as `**Summary**:` in each memory entry.
- File: `src/infra/knowledge-loop.ts`, `src/infra/knowledge-loop.test.ts`

---

## Phase 1: Open Items

### 1.1 Remote task result streaming 🔲
- Claw-to-claw tasks are fire-and-forget; dependent steps cannot consume remote output.
- **Requires coderClawLink change**: result frame in `ClawRelayDO` or polling endpoint.
- See CAPABILITY_GAPS.md Gap I.

### 1.2 Capability-based claw routing 🔲
- Orchestrator should auto-select the best peer claw by `requiredCapabilities`.
- No coderClawLink change required (capabilities already in heartbeat).
- See CAPABILITY_GAPS.md Gap J.

### 1.3 Architecture.md semantic auto-update 🔲
- After runs with ≥ N structural file changes, trigger a `documentation-agent` subagent
  to refresh `.coderClaw/architecture.md`.
- Add `/knowledge update` TUI command.
- See CAPABILITY_GAPS.md Gap K.

### 1.4 coderClawLink feature gaps 🔲
- See `.coderClaw/planning/CODERCLAW_LINK_GAPS.md` for full list.
- Key items: workflow/spec portal UI, execution WS streaming, spec storage API,
  result-streaming relay frame, enhanced fleet management.

---

## Canonical Code Paths

```
src/tui/commands.ts                              — slash command definitions + helpText
src/tui/tui-command-handlers.ts                  — slash command handlers (spec, workflow, compact…)
src/tui/components/chat-log.ts                   — ChatLog with hasUserMessages()
src/infra/knowledge-loop.ts                      — KnowledgeLoopService + deriveActivitySummary
src/coderclaw/tools/orchestrate-tool.ts          — orchestrate tool entry point
src/coderclaw/orchestrator.ts                    — workflow engine (AgentOrchestrator)
src/coderclaw/orchestrator-enhanced.ts           — workflow factory functions
src/coderclaw/agent-roles.ts                     — role registry
src/agents/subagent-spawn.ts                     — spawnSubagentDirect
src/infra/clawlink-relay.ts                      — ClawLinkRelayService
src/infra/remote-subagent.ts                     — dispatchToRemoteClaw
src/coderclaw/tools/claw-fleet-tool.ts           — claw_fleet tool
```

## Non-Existent Paths (do not reference)

```
src/coderclaw/agents/subagent-spawn.ts   ← wrong directory
src/coderclaw/tools/common.ts            ← does not exist
src/agents/agent-manager.ts             ← does not exist
```
