# CoderClaw Feature Gap Analysis

> Last updated: 2026-03-04  
> Scope: Agent → Orchestrator gap analysis vs. market leaders

## Market Landscape

### Tier 1: IDE-Embedded Assistants

| Tool | Model | Self-hosted | Multi-agent | Orchestration | MCP | Pair Programming | Open Source |
|------|-------|-------------|-------------|---------------|-----|-----------------|-------------|
| **Cursor** | GPT-4o / Claude 3.5 | ❌ | ❌ | ❌ | ✅ | ✅ Composer | ❌ |
| **Windsurf (Codeium)** | GPT-4o / Claude | ❌ | ❌ | ❌ | ✅ | ✅ Cascade | ❌ |
| **GitHub Copilot** | GPT-4o / Claude | ❌ | ❌ | ❌ | ❌ | ✅ Chat | ❌ |
| **Continue.dev** | Any | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ MIT |
| **Tabnine** | Tabnine | ❌ | ❌ | ❌ | ❌ | ✅ Chat | ❌ |

### Tier 2: Agentic CLI / Terminal Tools

| Tool | Model | Self-hosted | Multi-agent | Orchestration | MCP | Pair Programming | Open Source |
|------|-------|-------------|-------------|---------------|-----|-----------------|-------------|
| **Claude Code** | Claude | ❌ | ❌ | ❌ | ✅ | ✅ | ❌ |
| **Aider** | Any (GPT/Claude/Ollama) | ✅ | ❌ | ❌ | ❌ | ✅ chat mode | ✅ Apache 2 |
| **Goose** (Block) | Any | ✅ | ❌ | ❌ | ✅ | ✅ | ✅ Apache 2 |
| **OpenHands (SWE-agent)** | Any | ✅ | ❌ | ⚠️ basic | ❌ | ❌ | ✅ MIT |
| **Plandex** | GPT-4o | ✅ | ❌ | ⚠️ plan-only | ❌ | ⚠️ plan only | ✅ AGPL |
| **GPT Engineer** | GPT-4o | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ MIT |
| **Mentat** | GPT-4o | ✅ | ❌ | ❌ | ❌ | ✅ | ✅ MIT |

### Tier 3: Autonomous Agents / SWE Bots

| Tool | Model | Self-hosted | Multi-agent | Orchestration | MCP | Pair Programming | Open Source |
|------|-------|-------------|-------------|---------------|-----|-----------------|-------------|
| **Devin** (Cognition AI) | Proprietary | ❌ | ❌ | ✅ (black box) | ❌ | ✅ | ❌ |
| **SWE-agent** | GPT-4o | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ MIT |
| **AutoCodeRover** | GPT-4o | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| **OpenCopilot** | Any | ✅ | ❌ | ⚠️ basic | ❌ | ❌ | ✅ MIT |

### CoderClaw Position

| Tool | Model | Self-hosted | Multi-agent | Orchestration | MCP | Pair Programming | Open Source |
|------|-------|-------------|-------------|---------------|-----|-----------------|-------------|
| **CoderClaw** | Any (30+ providers) | ✅ | ✅ 7 roles | ✅ DAG-based | ✅ via mcporter | ✅ TUI + channels | ✅ MIT |

---

## Feature Gap Analysis: Agent → Orchestrator

### What Competitors Have That CoderClaw Lacks

#### 1. Orchestration Workspace UI (Live Agent Dashboard)

**Competitors with this:**
- **Devin**: Shows a live browser + terminal panel beside the chat, with every action visible in real time
- **Windsurf Cascade**: Shows step-by-step AI actions with live diffs and terminal output
- **Cursor Composer**: Tabbed workspace showing file changes, terminal output, and accepted/rejected diffs
- **OpenHands**: Web UI shows agent thinking, bash commands, file edits, and browser actions live

**CoderClaw Gap:**
- Workflows execute in TUI as text output; no graphical DAG of running/completed/failed tasks
- No live agent persona display (which role is currently executing, what it is doing, estimated completion)
- No diff preview panel — changes are applied silently
- No split-pane: chat left, agent actions right

**Required:**
- `coderClawLink` portal: live workflow DAG view with per-task status, elapsed time, and output preview
- WebSocket relay frames: `workflow.update`, `task.started`, `task.output_delta`, `task.completed`
- TUI: `pane` command to toggle between chat and live workflow view

---

#### 2. MCP Context Semantic Search

**Competitors with this:**
- **Cursor**: Context window uses vector search over project files (Ctrl+K / `@codebase`)
- **Windsurf**: "Cascade" automatically picks relevant files via semantic retrieval
- **Claude Code**: `@` file pinning + `--search` (grep-style, not semantic)
- **Continue.dev**: Full MCP integration with semantic codebase indexing
- **Goose**: MCP-first tool platform; any MCP server can supply context

**CoderClaw Gap:**
- `project_knowledge` tool does keyword search over `.coderClaw/memory/` files only
- No vector-based semantic search over project source files
- `mcporter` provides MCP bridge but is not wired into the context injection pipeline
- Agents cannot ask "find all files related to authentication" and get semantically relevant results
- No codebase embedding index (LanceDB extension exists but not wired to queries)

**Required:**
- Wire `memory-lancedb` extension into `project_knowledge` tool for vector search
- Add `codebase_search` tool: embeds query → searches LanceDB → returns ranked file/function matches
- MCP server for CoderClaw: expose `codebase_search`, `project_knowledge`, `git_history` as MCP tools so Cursor/Windsurf/Continue can call them
- Semantic auto-context: before dispatching a subagent, pre-fetch top-K semantically relevant files and inject into system prompt

---

#### 3. Inline Pair Programming / Diff Mode

**Competitors with this:**
- **Aider**: Full diff-based pair programming — shows unified diffs before applying, user can accept/reject each hunk
- **Cursor Composer**: Shows changes in a diff panel; user clicks Accept/Reject on each file
- **Windsurf Cascade**: Side-by-side before/after with line-by-line accept
- **Continue.dev**: `⌘K` inline edit with diff overlay in the editor
- **GitHub Copilot**: Ghost text + inline chat with Accept/Dismiss

**CoderClaw Gap:**
- `edit` and `create` tools apply changes immediately; there is no pre-apply diff review
- No "pending changes" buffer — once the agent writes a file, it is written
- No TUI diff viewer — changes are only visible via `git diff` after the fact
- No "accept all / reject all / review file by file" workflow
- `/elevated` flag is all-or-nothing; no granular file-level approval gate

**Required:**
- Diff staging buffer: `edit`/`create` tool writes to a staged store; human approves before `git add`
- TUI `/diff` command: show pending staged changes as unified diff
- TUI `/accept [file]` and `/reject [file]`: apply or discard staged changes
- Integration with approval workflow API (P3-3 in CODERCLAW_LINK_GAPS.md)

---

#### 4. Session / Conversation Continuity (Checkpoint & Resume)

**Competitors with this:**
- **Devin**: Full session replay; any session can be forked or resumed
- **Plandex**: Explicit "plan" object that persists across sessions and can be reviewed/edited
- **Aider**: `--message` flag + git-based undo with `/undo` command
- **Claude Code**: `--continue` flag to resume last session

**CoderClaw Gap:**
- Session handoffs exist (`/handoff`) but are manual and text-based
- No automatic checkpoint on `/new` or `ctrl+C`
- Workflow state persists to YAML but there is no TUI resume picker
- No `/undo` for the last agent action (git-based rollback)

**Required:**
- Auto-checkpoint: on session exit, automatically write handoff if messages exist (Gap -1.3 remainder)
- TUI `/sessions` picker: list available handoffs with date/summary, select to resume
- TUI `/undo`: call `git stash` or `git checkout HEAD` to revert last agent change
- `/fork`: create a branch from current workspace state before running a risky workflow

---

#### 5. Multi-Model Routing & Persona Selection

**Competitors with this:**
- **Cursor**: Model picker per conversation (GPT-4o, Claude 3.5, etc.)
- **Continue.dev**: Per-context-type model routing (chat vs. autocomplete vs. embed)
- **Goose**: `--provider` and `--model` flags; persona profiles in config
- **OpenHands**: Model picker in web UI

**CoderClaw Gap:**
- `/model` command switches the session model but does not assign specific models to specific agent roles
- Architecture Advisor could use Claude Opus for reasoning; Code Creator uses Claude Sonnet for speed
- No "persona" concept: system prompt customization is role-level, not persona-level
- No model-per-role assignment in workflow YAML

**Required:**
- Workflow YAML: add optional `model` field per step (overrides role default)
- TUI: `/persona <name>` command to load persona profile from `.coderClaw/personas/*.yaml`
- Persona file format: `{ name, model, systemPromptAddition, thinkingLevel, tools }`
- coderClawLink: persona registry with shared team personas

---

#### 6. GitHub / GitLab Deep Integration

**Competitors with this:**
- **GitHub Copilot**: Native PR review, issue linking, code search
- **Devin**: Opens PRs, handles review comments, runs CI
- **Aider**: `--auto-commits`, `--commit`, git blame integration
- **Claude Code**: `gh pr create`, `gh issue list` via tool calls

**CoderClaw Gap:**
- `gh-issues` and `github` skills exist but are not wired into orchestrator workflows
- No workflow type for "handle this GitHub issue end-to-end"
- No automatic PR creation after a workflow completes
- No CI/CD feedback loop: if tests fail in GitHub Actions, no automatic retry

**Required:**
- New workflow type: `issue` — takes a GitHub issue URL, fetches context, plans fix, implements, opens PR
- Orchestrator post-workflow hook: `createPR()` if workflow completed successfully
- CI feedback: poll GitHub Actions after PR; if failed, spawn Bug Analyzer subagent with logs
- `gh_issue` tool: fetch issue body + comments; surface as context to first workflow step

---

#### 7. Voice / TTS Interaction

**Competitors with this:**
- **GitHub Copilot Voice**: Dictate commands and code
- **Continue.dev**: Experimental voice mode
- **CoderClaw already has** Talk Mode / Voice Wake on macOS/iOS/Android

**CoderClaw Gap (minor):**
- Voice commands cannot directly trigger slash commands (`/spec`, `/workflow`)
- No voice feedback for workflow status (TTS output of task completions)

**Required:**
- Map voice intent → TUI slash command (e.g., "start a feature for auth" → `/spec Add auth feature`)
- TTS: on workflow completion, speak summary via `sag` skill

---

#### 8. AI-Assisted Code Review as a Service

**Competitors with this:**
- **CodeRabbit**: Automated PR review as a GitHub App
- **Ellipsis**: PR summary + review bot
- **Sourcegraph Cody**: Inline code review suggestions
- **GitHub Copilot**: PR summary in sidebar

**CoderClaw Gap:**
- Code Reviewer role exists but only runs in a local workflow
- No GitHub App webhook handler to auto-review PRs
- No PR comment posting from an agent

**Required:**
- GitHub App integration: on PR opened/updated, trigger `adversarial` review workflow
- Post review as GitHub PR review comments via `gh` tool
- Configurable review depth: quick (security/bugs only) vs. full (style + architecture)

---

## Summary: Priority Feature Gaps

| # | Feature | Priority | Effort | Blocker |
|---|---------|----------|--------|---------|
| 1 | Orchestration workspace live UI | P0 | L | coderClawLink |
| 2 | MCP codebase semantic search | P0 | M | memory-lancedb wiring |
| 3 | Inline diff / pair programming mode | P1 | M | new TUI commands |
| 4 | Session checkpoint & resume (auto) | P1 | S | TUI change |
| 5 | Multi-model routing & persona profiles | P1 | M | workflow YAML + TUI |
| 6 | GitHub issue → PR end-to-end workflow | P1 | M | new workflow type |
| 7 | Voice → slash command mapping | P2 | S | Talk Mode integration |
| 8 | AI PR review as GitHub App | P2 | L | GitHub App infra |

---

## Competitive Differentiation: What CoderClaw Does Better

These are genuine advantages that no competitor currently matches:

| Feature | Advantage |
|---------|-----------|
| **Distributed claw mesh** | Multiple developer machines can collaborate on one workflow via `remote:<clawId>` |
| **Any messaging channel** | WhatsApp, Telegram, Slack, Discord, iMessage — code from your phone |
| **Workflow persistence** | Resume half-finished workflows after restart; no competitor does this |
| **7-role specialization** | Role-specific system prompts, models, and tool access per task |
| **Adversarial review pass** | Built-in critique → defence → revised proposal loop |
| **Post-task memory loop** | Every run appended to `.coderClaw/memory/` with semantic summary |
| **Full MIT license** | No AGPL, no per-seat fee, no black-box cloud |
| **Self-hosting with portal** | Local gateway + coderClawLink cloud portal hybrid |
