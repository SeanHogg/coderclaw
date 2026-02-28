import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { createCommandHandlers } from "./tui-command-handlers.js";

describe("tui command handlers", () => {
  it("forwards unknown slash commands to the gateway", async () => {
    const sendChat = vi.fn().mockResolvedValue({ runId: "r1" });
    const addUser = vi.fn();
    const addSystem = vi.fn();
    const requestRender = vi.fn();
    const setActivityStatus = vi.fn();

    const { handleCommand } = createCommandHandlers({
      client: { sendChat } as never,
      chatLog: { addUser, addSystem } as never,
      tui: { requestRender } as never,
      opts: {},
      state: {
        currentSessionKey: "agent:main:main",
        activeChatRunId: null,
        sessionInfo: {},
      } as never,
      deliverDefault: false,
      openOverlay: vi.fn(),
      closeOverlay: vi.fn(),
      refreshSessionInfo: vi.fn(),
      loadHistory: vi.fn(),
      setSession: vi.fn(),
      refreshAgents: vi.fn(),
      abortActive: vi.fn(),
      setActivityStatus,
      formatSessionKey: vi.fn(),
      applySessionInfoFromPatch: vi.fn(),
      noteLocalRunId: vi.fn(),
    });

    await handleCommand("/context");

    expect(addSystem).not.toHaveBeenCalled();
    expect(addUser).toHaveBeenCalledWith("/context");
    expect(sendChat).toHaveBeenCalledWith(
      expect.objectContaining({
        sessionKey: "agent:main:main",
        message: "/context",
      }),
    );
    expect(requestRender).toHaveBeenCalled();
  });

  it("passes reset reason when handling /new and /reset", async () => {
    const resetSession = vi.fn().mockResolvedValue({ ok: true });
    const addSystem = vi.fn();
    const requestRender = vi.fn();
    const loadHistory = vi.fn().mockResolvedValue(undefined);

    const { handleCommand } = createCommandHandlers({
      client: { resetSession } as never,
      chatLog: { addSystem } as never,
      tui: { requestRender } as never,
      opts: {},
      state: {
        currentSessionKey: "agent:main:main",
        activeChatRunId: null,
        sessionInfo: {},
      } as never,
      deliverDefault: false,
      openOverlay: vi.fn(),
      closeOverlay: vi.fn(),
      refreshSessionInfo: vi.fn(),
      loadHistory,
      setSession: vi.fn(),
      refreshAgents: vi.fn(),
      abortActive: vi.fn(),
      setActivityStatus: vi.fn(),
      formatSessionKey: vi.fn(),
      applySessionInfoFromPatch: vi.fn(),
      noteLocalRunId: vi.fn(),
    });

    await handleCommand("/new");
    await handleCommand("/reset");

    expect(resetSession).toHaveBeenNthCalledWith(1, "agent:main:main", "new");
    expect(resetSession).toHaveBeenNthCalledWith(2, "agent:main:main", "reset");
    expect(loadHistory).toHaveBeenCalledTimes(2);
  });

  it("runs /gateway restart via service command runner", async () => {
    const addSystem = vi.fn();
    const requestRender = vi.fn();
    const runGatewayServiceCommand = vi.fn().mockResolvedValue({
      ok: true,
      lines: ["restarted"],
    });

    const { handleCommand } = createCommandHandlers({
      client: {} as never,
      chatLog: { addSystem } as never,
      tui: { requestRender } as never,
      opts: {},
      state: {
        currentSessionKey: "agent:main:main",
        activeChatRunId: null,
        sessionInfo: {},
      } as never,
      deliverDefault: false,
      openOverlay: vi.fn(),
      closeOverlay: vi.fn(),
      refreshSessionInfo: vi.fn(),
      loadHistory: vi.fn(),
      setSession: vi.fn(),
      refreshAgents: vi.fn(),
      abortActive: vi.fn(),
      setActivityStatus: vi.fn(),
      formatSessionKey: vi.fn(),
      applySessionInfoFromPatch: vi.fn(),
      noteLocalRunId: vi.fn(),
      runGatewayServiceCommand,
    });

    await handleCommand("/gateway restart");

    expect(runGatewayServiceCommand).toHaveBeenCalledWith("restart");
    expect(addSystem).toHaveBeenCalledWith("running: coderclaw gateway restart");
    expect(addSystem).toHaveBeenCalledWith("restarted");
  });

  it("treats /daemon as alias for /gateway", async () => {
    const addSystem = vi.fn();
    const runGatewayServiceCommand = vi.fn().mockResolvedValue({ ok: true, lines: [] });

    const { handleCommand } = createCommandHandlers({
      client: {} as never,
      chatLog: { addSystem } as never,
      tui: { requestRender: vi.fn() } as never,
      opts: {},
      state: {
        currentSessionKey: "agent:main:main",
        activeChatRunId: null,
        sessionInfo: {},
      } as never,
      deliverDefault: false,
      openOverlay: vi.fn(),
      closeOverlay: vi.fn(),
      refreshSessionInfo: vi.fn(),
      loadHistory: vi.fn(),
      setSession: vi.fn(),
      refreshAgents: vi.fn(),
      abortActive: vi.fn(),
      setActivityStatus: vi.fn(),
      formatSessionKey: vi.fn(),
      applySessionInfoFromPatch: vi.fn(),
      noteLocalRunId: vi.fn(),
      runGatewayServiceCommand,
    });

    await handleCommand("/daemon status");

    expect(runGatewayServiceCommand).toHaveBeenCalledWith("status");
    expect(addSystem).toHaveBeenCalledWith("running: coderclaw gateway status");
  });

  it("runs models set and updates state for /model command", async () => {
    const addSystem = vi.fn();
    const patchSession = vi.fn().mockResolvedValue({ ok: true });
    const runLocalCliCommand = vi.fn().mockResolvedValue({ ok: true, lines: [] });
    const sessionInfo: Record<string, unknown> = {};

    const { handleCommand } = createCommandHandlers({
      client: { patchSession } as never,
      chatLog: { addSystem } as never,
      tui: { requestRender: vi.fn() } as never,
      opts: {},
      state: {
        currentSessionKey: "agent:main:main",
        activeChatRunId: null,
        sessionInfo,
      } as never,
      deliverDefault: false,
      openOverlay: vi.fn(),
      closeOverlay: vi.fn(),
      refreshSessionInfo: vi.fn(),
      loadHistory: vi.fn(),
      setSession: vi.fn(),
      refreshAgents: vi.fn(),
      abortActive: vi.fn(),
      setActivityStatus: vi.fn(),
      formatSessionKey: vi.fn(),
      applySessionInfoFromPatch: vi.fn(),
      updateFooter: vi.fn(),
      noteLocalRunId: vi.fn(),
      runLocalCliCommand,
    });

    await handleCommand("/model openrouter/google/gemma-3-27b-it:free");

    // Should run `models set` to update config + allowlist
    expect(runLocalCliCommand).toHaveBeenCalledWith([
      "models",
      "set",
      "openrouter/google/gemma-3-27b-it:free",
    ]);
    // State should be updated immediately with the new model
    expect(sessionInfo.modelProvider).toBe("openrouter");
    expect(sessionInfo.model).toBe("google/gemma-3-27b-it:free");
    expect(addSystem).toHaveBeenCalledWith("model set to openrouter/google/gemma-3-27b-it:free");
  });

  it("launches setup when switching to coderclawllm without registration", async () => {
    const previousStateDir = process.env.CODERCLAW_STATE_DIR;
    const previousLinkKey = process.env.CODERCLAW_LINK_API_KEY;
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "coderclaw-tui-setup-"));
    process.env.CODERCLAW_STATE_DIR = tempDir;
    delete process.env.CODERCLAW_LINK_API_KEY;

    const addSystem = vi.fn();
    const runLocalCliCommand = vi.fn().mockResolvedValue({ ok: true, lines: [] });
    const onSetup = vi.fn().mockResolvedValue(undefined);

    try {
      const { handleCommand } = createCommandHandlers({
        client: { patchSession: vi.fn().mockResolvedValue({ ok: true }) } as never,
        chatLog: { addSystem } as never,
        tui: { requestRender: vi.fn() } as never,
        opts: {},
        state: {
          currentSessionKey: "agent:main:main",
          activeChatRunId: null,
          sessionInfo: {},
        } as never,
        deliverDefault: false,
        openOverlay: vi.fn(),
        closeOverlay: vi.fn(),
        refreshSessionInfo: vi.fn(),
        loadHistory: vi.fn(),
        setSession: vi.fn(),
        refreshAgents: vi.fn(),
        abortActive: vi.fn(),
        setActivityStatus: vi.fn(),
        formatSessionKey: vi.fn(),
        applySessionInfoFromPatch: vi.fn(),
        updateFooter: vi.fn(),
        noteLocalRunId: vi.fn(),
        runLocalCliCommand,
        onSetup,
      });

      await handleCommand("/model coderclawllm/auto");

      expect(onSetup).toHaveBeenCalledTimes(1);
      expect(runLocalCliCommand).not.toHaveBeenCalled();
      expect(addSystem).toHaveBeenCalledWith(
        "coderclawllm requires CoderClawLink registration. Launching setup wizard...",
      );
      expect(addSystem).not.toHaveBeenCalledWith("model set to coderclawllm/auto");
    } finally {
      if (previousStateDir === undefined) {
        delete process.env.CODERCLAW_STATE_DIR;
      } else {
        process.env.CODERCLAW_STATE_DIR = previousStateDir;
      }
      if (previousLinkKey === undefined) {
        delete process.env.CODERCLAW_LINK_API_KEY;
      } else {
        process.env.CODERCLAW_LINK_API_KEY = previousLinkKey;
      }
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
