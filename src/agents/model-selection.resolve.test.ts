import { describe, expect, it } from "vitest";
import type { CoderClawConfig } from "../config/config.js";
import { resolveAllowedModelRef } from "./model-selection.js";

describe("resolveAllowedModelRef", () => {
  it("accepts explicitly allowlisted free-tier models", () => {
    const cfg: CoderClawConfig = {
      agents: {
        defaults: {
          models: {
            "opencode/glm-5-free": {},
            "openrouter/google/gemma-3-27b-it:free": {},
            "openrouter/openai/gpt-oss-120b:free": {},
          },
        },
      },
    };

    const catalog = [
      { provider: "anthropic", id: "claude-opus-4-5", name: "Claude Opus 4.5" },
      { provider: "openai", id: "gpt-4o", name: "GPT-4o" },
    ];

    const testCases = [
      { raw: "opencode/glm-5-free", expectedKey: "opencode/glm-5-free" },
      {
        raw: "openrouter/google/gemma-3-27b-it:free",
        expectedKey: "openrouter/google/gemma-3-27b-it:free",
      },
      {
        raw: "openrouter/openai/gpt-oss-120b:free",
        expectedKey: "openrouter/openai/gpt-oss-120b:free",
      },
    ];

    for (const { raw, expectedKey } of testCases) {
      const result = resolveAllowedModelRef({
        cfg,
        catalog,
        raw,
        defaultProvider: "anthropic",
      });

      if ("error" in result) {
        throw new Error(`Expected success for ${raw}, got error: ${result.error}`);
      }
      expect(result.key).toBe(expectedKey);
      expect(result.ref.provider).toBe(expectedKey.split("/")[0]);
      expect(result.ref.model).toBe(expectedKey.split("/").slice(1).join("/"));
    }
  });

  it("rejects models that are not in allowlist", () => {
    const cfg: CoderClawConfig = {
      agents: {
        defaults: {
          models: {
            "anthropic/claude-opus-4-5": {},
          },
        },
      },
    };

    const catalog = [
      { provider: "anthropic", id: "claude-opus-4-5", name: "Claude Opus 4.5" },
      { provider: "openai", id: "gpt-4o", name: "GPT-4o" },
    ];

    const result = resolveAllowedModelRef({
      cfg,
      catalog,
      raw: "openai/gpt-4o",
      defaultProvider: "anthropic",
    });

    expect("error" in result).toBe(true);
    if ("error" in result) {
      expect(result.error).toContain("model not allowed:");
    }
  });

  it("accepts models when allowlist is empty (allowAny mode)", () => {
    const cfg: CoderClawConfig = {};
    const catalog = [{ provider: "anthropic", id: "claude-opus-4-5", name: "Claude Opus 4.5" }];

    const result = resolveAllowedModelRef({
      cfg,
      catalog,
      raw: "anthropic/claude-opus-4-5",
      defaultProvider: "anthropic",
    });

    if ("error" in result) {
      throw new Error(`Expected success in allowAny mode, got error: ${result.error}`);
    }
    expect(result.key).toBe("anthropic/claude-opus-4-5");
  });
});
