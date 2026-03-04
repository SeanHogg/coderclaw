import type { StreamFn } from "@mariozechner/pi-agent-core";
import type { AssistantMessage, StopReason, TextContent, Usage } from "@mariozechner/pi-ai";
import { createAssistantMessageEventStream } from "@mariozechner/pi-ai";

export const TRANSFORMERS_DEFAULT_MODEL_ID = "HuggingFaceTB/SmolLM2-1.7B-Instruct";
export const TRANSFORMERS_DEFAULT_DTYPE = "q4";
export const TRANSFORMERS_DEFAULT_CACHE_DIR = "./models";

// ── Dynamic import helper ────────────────────────────────────────────────────

// @huggingface/transformers is an optional peer dependency.
// Dynamically import to avoid crashing when it is not installed.
async function importTransformers() {
  try {
    return await import("@huggingface/transformers");
  } catch {
    throw new Error(
      "Package '@huggingface/transformers' is not installed. " +
        "Run `npm install @huggingface/transformers` (or pnpm/yarn equivalent) to use local Transformers.js inference.",
    );
  }
}

// ── Pipeline cache ───────────────────────────────────────────────────────────

type TextGenerationPipeline = Awaited<
  ReturnType<typeof import("@huggingface/transformers").pipeline>
>;

const pipelineCache = new Map<string, TextGenerationPipeline>();

async function getOrCreatePipeline(
  modelId: string,
  dtype: string,
  cacheDir: string,
): Promise<TextGenerationPipeline> {
  const key = `${modelId}:${dtype}`;
  const cached = pipelineCache.get(key);
  if (cached) {
    return cached;
  }

  const transformers = await importTransformers();
  transformers.env.cacheDir = cacheDir;
  transformers.env.allowRemoteModels = true;

  const pipe = await transformers.pipeline("text-generation", modelId, {
    dtype: dtype as Parameters<typeof transformers.pipeline>[2] extends { dtype?: infer D }
      ? D
      : string,
  });

  pipelineCache.set(key, pipe);
  return pipe;
}

// ── Message conversion ───────────────────────────────────────────────────────

type InputContentPart =
  | { type: "text"; text: string }
  | { type: "toolCall"; id: string; name: string; arguments: Record<string, unknown> }
  | { type: "tool_use"; id: string; name: string; input: Record<string, unknown> };

function extractTextContent(content: unknown): string {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) {
    return "";
  }
  return (content as InputContentPart[])
    .filter((part): part is { type: "text"; text: string } => part.type === "text")
    .map((part) => part.text)
    .join("");
}

type ChatMessage = { role: string; content: string };

export function convertToTransformersMessages(
  messages: Array<{ role: string; content: unknown }>,
  system?: string,
): ChatMessage[] {
  const result: ChatMessage[] = [];

  if (system) {
    result.push({ role: "system", content: system });
  }

  for (const msg of messages) {
    const text = extractTextContent(msg.content);
    if (msg.role === "user") {
      result.push({ role: "user", content: text });
    } else if (msg.role === "assistant") {
      result.push({ role: "assistant", content: text });
    }
    // Tool result and tool call messages are not natively supported by
    // small Transformers.js models — they are folded into user/assistant turns.
  }

  return result;
}

// ── Main StreamFn factory ────────────────────────────────────────────────────

export type TransformersStreamOptions = {
  modelId?: string;
  dtype?: string;
  cacheDir?: string;
};

export function createTransformersStreamFn(opts: TransformersStreamOptions = {}): StreamFn {
  const modelId = opts.modelId ?? TRANSFORMERS_DEFAULT_MODEL_ID;
  const dtype = opts.dtype ?? TRANSFORMERS_DEFAULT_DTYPE;
  const cacheDir = opts.cacheDir ?? TRANSFORMERS_DEFAULT_CACHE_DIR;

  return (model, context, options) => {
    const stream = createAssistantMessageEventStream();

    const run = async () => {
      try {
        const pipe = await getOrCreatePipeline(modelId, dtype, cacheDir);

        const chatMessages = convertToTransformersMessages(
          context.messages ?? [],
          context.systemPrompt,
        );

        const maxNewTokens =
          typeof options?.maxTokens === "number" ? options.maxTokens : 512;
        const temperature =
          typeof options?.temperature === "number" ? options.temperature : 0.6;

        // Transformers.js pipeline call with chat template support.
        // apply_chat_template is handled automatically when passing an array of
        // {role, content} messages to a text-generation pipeline.
        type PipeOutput = Array<{ generated_text: string | Array<{ role: string; content: string }> }>;
        const rawOutput = (await (pipe as (input: unknown, params: unknown) => Promise<unknown>)(
          chatMessages,
          {
            max_new_tokens: maxNewTokens,
            temperature,
            do_sample: temperature > 0,
            top_p: 0.95,
            repetition_penalty: 1.1,
            return_full_text: false,
          },
        )) as PipeOutput;

        // Extract generated text from the response.
        let generatedText = "";
        const first = rawOutput[0]?.generated_text;
        if (typeof first === "string") {
          generatedText = first.trim();
        } else if (Array.isArray(first)) {
          // When the pipeline returns a message array, grab the last assistant entry.
          const lastMsg = first.findLast(
            (m: { role: string; content: string }) => m.role === "assistant",
          );
          generatedText = (lastMsg?.content ?? "").trim();
        }

        const content: TextContent[] = generatedText
          ? [{ type: "text" as const, text: generatedText }]
          : [];

        const usage: Usage = {
          input: 0,
          output: 0,
          cacheRead: 0,
          cacheWrite: 0,
          totalTokens: 0,
          cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
        };

        const assistantMessage: AssistantMessage = {
          role: "assistant",
          content,
          stopReason: "stop" as StopReason,
          api: model.api,
          provider: model.provider,
          model: model.id,
          usage,
          timestamp: Date.now(),
        };

        stream.push({
          type: "done",
          reason: "stop",
          message: assistantMessage,
        });
      } catch (err) {
        const errorMessage = err instanceof Error ? err.message : String(err);
        stream.push({
          type: "error",
          reason: "error",
          error: {
            role: "assistant" as const,
            content: [],
            stopReason: "error" as StopReason,
            errorMessage,
            api: model.api,
            provider: model.provider,
            model: model.id,
            usage: {
              input: 0,
              output: 0,
              cacheRead: 0,
              cacheWrite: 0,
              totalTokens: 0,
              cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0, total: 0 },
            },
            timestamp: Date.now(),
          },
        });
      } finally {
        stream.end();
      }
    };

    queueMicrotask(() => void run());
    return stream;
  };
}
