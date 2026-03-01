import { appendKnowledgeMemory } from "../coderclaw/project-context.js";
import { logDebug } from "../logger.js";
import { onAgentEvent } from "./agent-events.js";
import { syncCoderClawDirectory, type SyncCoderClawDirParams } from "./clawlink-directory-sync.js";

export type KnowledgeLoopOptions = {
  workspaceDir: string;
  apiKey?: string | null;
  baseUrl?: string;
  clawId?: string | null;
  projectId?: number;
};

type RunAccumulator = {
  sessionKey: string;
  filesCreated: string[];
  filesEdited: string[];
  toolNames: string[];
};

/**
 * Listens for agent run completions and writes a timestamped activity entry to
 * .coderClaw/memory/YYYY-MM-DD.md, then syncs .coderClaw/ to CoderClawLink if credentials
 * are configured.
 */
export class KnowledgeLoopService {
  private readonly runs = new Map<string, RunAccumulator>();
  private unsub: (() => void) | null = null;

  constructor(private readonly opts: KnowledgeLoopOptions) {}

  /** Start listening for agent events. Safe to call once. */
  start(): void {
    if (this.unsub) {
      return;
    }
    this.unsub = onAgentEvent((evt) => {
      if (!this.unsub) {
        return; // stopped
      }

      if (evt.stream === "tool") {
        this.accumulate(evt.runId, evt.sessionKey ?? "unknown", evt.data);
      }

      if (
        evt.stream === "lifecycle" &&
        typeof evt.data["phase"] === "string" &&
        (evt.data["phase"] === "end" || evt.data["phase"] === "error")
      ) {
        void this.onRunComplete(evt.runId, evt.sessionKey ?? "unknown");
      }
    });
    logDebug("[knowledge-loop] started");
  }

  /** Stop listening and clear accumulated state. */
  stop(): void {
    if (this.unsub) {
      this.unsub();
      this.unsub = null;
    }
    this.runs.clear();
    logDebug("[knowledge-loop] stopped");
  }

  // ---------------------------------------------------------------------------

  private accumulate(runId: string, sessionKey: string, data: Record<string, unknown>): void {
    if (!this.runs.has(runId)) {
      this.runs.set(runId, {
        sessionKey,
        filesCreated: [],
        filesEdited: [],
        toolNames: [],
      });
    }
    const acc = this.runs.get(runId)!;
    const toolName = typeof data["toolName"] === "string" ? data["toolName"] : null;
    if (toolName) {
      acc.toolNames.push(toolName);
    }
    const filePath = typeof data["path"] === "string" ? data["path"] : null;
    if (filePath) {
      if (toolName === "create" || toolName === "write") {
        acc.filesCreated.push(filePath);
      } else if (toolName === "edit") {
        acc.filesEdited.push(filePath);
      }
    }
  }

  private async onRunComplete(runId: string, sessionKey: string): Promise<void> {
    const acc = this.runs.get(runId);
    this.runs.delete(runId);

    const ts = new Date().toISOString();
    const lines: string[] = [`\n## [${ts}] session:${sessionKey}`, ""];

    if (acc) {
      const created = [...new Set(acc.filesCreated)];
      const edited = [...new Set(acc.filesEdited)];
      const tools = [...new Set(acc.toolNames)];
      if (created.length > 0) {
        lines.push(`**Created**: ${created.join(", ")}`);
      }
      if (edited.length > 0) {
        lines.push(`**Edited**: ${edited.join(", ")}`);
      }
      if (tools.length > 0) {
        lines.push(`**Tools**: ${tools.join(", ")}`);
      }
    }
    lines.push("");

    const entry = lines.join("\n");

    try {
      await appendKnowledgeMemory(this.opts.workspaceDir, entry);
    } catch (err) {
      logDebug(`[knowledge-loop] failed to write memory entry: ${String(err)}`);
    }

    await this.syncIfConfigured();
  }

  private async syncIfConfigured(): Promise<void> {
    const { apiKey, baseUrl, clawId, workspaceDir, projectId } = this.opts;
    if (!apiKey || !clawId) {
      return;
    }
    const syncParams: SyncCoderClawDirParams = {
      workspaceDir,
      apiKey,
      baseUrl: baseUrl ?? "https://api.coderclaw.ai",
      clawId,
      projectId,
    };
    try {
      await syncCoderClawDirectory(syncParams);
      logDebug("[knowledge-loop] .coderClaw/ synced to CoderClawLink");
    } catch (err) {
      logDebug(`[knowledge-loop] sync failed: ${String(err)}`);
    }
  }
}
