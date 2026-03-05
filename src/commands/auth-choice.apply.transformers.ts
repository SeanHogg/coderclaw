import path from "node:path";
import type { CoderClawConfig } from "../config/config.js";
import { resolveStateDir } from "../config/paths.js";
import { ensureAuthProfileStore } from "../agents/auth-profiles.js";
import { downloadCoderClawLlmModel } from "../agents/transformers-stream.js";
import type { ApplyAuthChoiceParams, ApplyAuthChoiceResult } from "./auth-choice.apply.js";
import { promptAuthChoiceGrouped } from "./auth-choice-prompt.js";
import { applyPrimaryModel } from "./model-picker.js";

/** Provider ID written into the config for the local-brain entry. */
export const CODERCLAWLLM_LOCAL_PROVIDER_ID = "coderclawllm-local";
/** @deprecated Use CODERCLAWLLM_LOCAL_PROVIDER_ID */
export const TRANSFORMERS_PROVIDER_ID = CODERCLAWLLM_LOCAL_PROVIDER_ID;
// HuggingFaceTB/SmolLM2-1.7B-Instruct ships ONNX-quantized weights that are
// natively supported by @huggingface/transformers without any extra tooling.
export const TRANSFORMERS_DEFAULT_MODEL_ID = "HuggingFaceTB/SmolLM2-1.7B-Instruct";
export const TRANSFORMERS_DEFAULT_DTYPE = "q4";

const DTYPE_OPTIONS = ["q4", "q5", "q8", "fp16", "fp32"] as const;
type TransformersDtype = (typeof DTYPE_OPTIONS)[number];

function defaultCacheDir(): string {
  return path.join(resolveStateDir(), "models");
}

function toModelKey(modelId: string): string {
  return `${TRANSFORMERS_PROVIDER_ID}/${modelId}`;
}

function applyTransformersProviderConfig(
  cfg: CoderClawConfig,
  modelId: string,
  dtype: string,
  cacheDir: string,
): CoderClawConfig {
  return {
    ...cfg,
    models: {
      ...cfg.models,
      mode: cfg.models?.mode ?? "merge",
      providers: {
        ...cfg.models?.providers,
        [TRANSFORMERS_PROVIDER_ID]: {
          // baseUrl is repurposed as the model cache directory for this provider.
          baseUrl: cacheDir,
          api: "transformers",
          models: [
            {
              id: modelId,
              name: modelId,
              reasoning: false,
              input: ["text"],
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
              contextWindow: 8192,
              maxTokens: 2048,
              // dtype is stored as a custom header so attempt.ts can read it.
              headers: { "x-transformers-dtype": dtype },
            },
          ],
        },
      },
    },
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractPrimaryModel(cfg: CoderClawConfig): string | undefined {
  const model = cfg.agents?.defaults?.model;
  if (typeof model === "string") return model;
  if (model && typeof model === "object") return model.primary;
  return undefined;
}

function setModelWithFallback(
  cfg: CoderClawConfig,
  primary: string,
  fallback: string,
): CoderClawConfig {
  const defaults = cfg.agents?.defaults;
  const existingModel = defaults?.model;

  return {
    ...cfg,
    agents: {
      ...cfg.agents,
      defaults: {
        ...defaults,
        model: {
          ...(typeof existingModel === "object" ? existingModel : undefined),
          primary,
          fallbacks: [fallback],
        },
      },
    },
  };
}

// ── Download & wire (step 3 only) ─────────────────────────────────────────────
// Exported so the onboarding wizard can call it directly when the user has
// already chosen their LLM provider and opted into the local brain.

import type { WizardPrompter } from "../wizard/prompts.js";

export async function downloadAndWireLocalBrain(opts: {
  config: CoderClawConfig;
  prompter: WizardPrompter;
}): Promise<{ config: CoderClawConfig }> {
  let nextConfig = opts.config;
  const configuredModelKey = extractPrimaryModel(nextConfig);

  const modelId = TRANSFORMERS_DEFAULT_MODEL_ID;
  const dtype = TRANSFORMERS_DEFAULT_DTYPE;
  const cacheDir = defaultCacheDir();

  // Register the transformers provider in the config.
  nextConfig = applyTransformersProviderConfig(nextConfig, modelId, dtype, cacheDir);

  // Download the model with live progress.
  let lastFile = "";
  const spinner = opts.prompter.progress(
    `Downloading local brain (${dtype})…`,
  );
  try {
    await downloadCoderClawLlmModel({
      modelId,
      dtype,
      cacheDir,
      onProgress: (file, pct) => {
        if (file !== lastFile) {
          lastFile = file;
        }
        spinner.update(`Downloading ${path.basename(file)} — ${pct}%`);
      },
    });
    spinner.stop("Local brain downloaded and ready.");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    spinner.stop(
      `Download failed: ${msg}\nThe configured LLM will be used without a local brain.\nRe-run "coderclaw configure" to try again.`,
    );
    return { config: nextConfig };
  }

  const localModelKey = toModelKey(modelId);
  if (configuredModelKey && configuredModelKey !== localModelKey) {
    nextConfig = setModelWithFallback(nextConfig, localModelKey, configuredModelKey);
  } else {
    nextConfig = applyPrimaryModel(nextConfig, localModelKey);
  }

  return { config: nextConfig };
}

// ── Main handler ──────────────────────────────────────────────────────────────
// Used when the user picks "coderclawllm-local" as their *primary* auth choice
// (standalone flow — not from the onboarding wizard).

export async function applyAuthChoiceTransformers(
  params: ApplyAuthChoiceParams,
): Promise<ApplyAuthChoiceResult | null> {
  if (params.authChoice !== "coderclawllm-local") {
    return null;
  }

  // ── Step 1: Select the main LLM provider ───────────────────────────────────
  await params.prompter.note(
    "First, pick your main LLM provider.\nThis handles coding tasks, complex reasoning, and everything the local brain defers.",
    "Configure LLM",
  );

  const llmChoice = await promptAuthChoiceGrouped({
    prompter: params.prompter,
    store: ensureAuthProfileStore(params.agentDir, { allowKeychainPrompt: false }),
    includeSkip: false,
  });

  const { applyAuthChoice } = await import("./auth-choice.apply.js");
  const llmResult = await applyAuthChoice({
    authChoice: llmChoice,
    config: params.config,
    prompter: params.prompter,
    runtime: params.runtime,
    setDefaultModel: true,
  });

  let nextConfig = llmResult.config;

  // ── Step 2: Smarter brain toggle ───────────────────────────────────────────
  const enableLocalBrain = await params.prompter.confirm({
    message: "Enable local brain? (handles simple tasks, defers complex ones)",
    initialValue: true,
  });

  if (!enableLocalBrain) {
    return { config: nextConfig };
  }

  // ── Step 3: Download & wire ────────────────────────────────────────────────
  const result = await downloadAndWireLocalBrain({
    config: nextConfig,
    prompter: params.prompter,
  });

  return { config: result.config };
}

