import { OpenAI } from "openai";
import { config } from "../config.js";
import { parseJsonLoose, partialStringField } from "./partialJson.js";

export class LlmError extends Error {}

const CACHE_BREAKPOINT = { mode: "explicit" };

const textWithBreakpoint = (text) => [
  { type: "text", text, prompt_cache_breakpoint: CACHE_BREAKPOINT },
];

/**
 * Builds the system messages. With `cachePrefix`, the shared start of the
 * prompt (world context) goes in its own message with an explicit prompt
 * cache breakpoint (GPT-5.6+ models), so every NPC reads it from the cache;
 * with `cacheSystem` the rest of the system prompt is cached too, for the
 * next turns of the same NPC.
 *
 * The prefix must be a separate message: with tools or structured outputs,
 * breakpoints in the middle of a message are ignored. Without explicit
 * breakpoints these models write the whole prompt to the cache (billed at
 * 1.25x) and never reuse it across NPCs.
 */
export function buildSystemMessages(system, { cachePrefix, cacheSystem }) {
  const hasPrefix = Boolean(cachePrefix) && system.startsWith(cachePrefix);
  const rest = hasPrefix ? system.slice(cachePrefix.length) : system;

  return {
    hasBreakpoint: hasPrefix || cacheSystem,
    messages: [
      ...(hasPrefix
        ? [{ role: "system", content: textWithBreakpoint(cachePrefix) }]
        : []),
      {
        role: "system",
        content: cacheSystem ? textWithBreakpoint(rest) : rest,
      },
    ],
  };
}

const parseJson = (text) => {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
};

export class LlmClient {
  constructor({
    openai,
    model,
    reasoningEffort,
    promptCache = false,
    logUsage = false,
  }) {
    this.openai = openai;
    this.model = model;
    this.reasoningEffort = reasoningEffort;
    this.promptCache = promptCache;
    this.logUsage = logUsage;
  }

  /**
   * Calls the chat completion API.
   *
   * The given messages are never mutated: the caller receives the assistant
   * message (`assistantMessage`) and decides what to persist.
   *
   * @param {object} options
   * @param {string} [options.system] System prompt, prepended to the messages.
   * @param {string} [options.cachePrefix] Start of `system` shared by many
   *   calls, cached on its own (see buildSystemMessages).
   * @param {boolean} [options.cacheSystem] Also cache the whole `system`.
   * @param {object[]} options.messages Conversation messages.
   * @param {object[]} [options.tools] OpenAI tool definitions.
   * @param {string} [options.toolChoice] "none" keeps the tools in the
   *   prompt (and in the cache) but doesn't let the model call them.
   * @param {{name: string, schema: object}} [options.schema] JSON schema the
   *   response content must follow (OpenAI structured outputs).
   * @param {(text: string) => void} [options.onContent] Streams the answer:
   *   called with the text written so far (with a schema, the text of its
   *   "content" field).
   * @returns {Promise<{content: object|string|null, toolCalls: {id: string, name: string, arguments: object}[], assistantMessage: object}>}
   */
  async complete({
    system,
    cachePrefix,
    cacheSystem = false,
    messages,
    tools,
    toolChoice,
    schema,
    temperature = 1,
    maxTokens = 2000,
    onContent,
  }) {
    const systemMessages = system
      ? buildSystemMessages(system, {
          cachePrefix: this.promptCache ? cachePrefix : null,
          cacheSystem: this.promptCache && cacheSystem,
        })
      : { hasBreakpoint: false, messages: [] };

    const body = {
      model: this.model,
      messages: [...systemMessages.messages, ...messages],
      ...(systemMessages.hasBreakpoint
        ? { prompt_cache_options: { mode: "explicit" } }
        : {}),
      temperature,
      max_completion_tokens: maxTokens,
      ...(this.reasoningEffort
        ? { reasoning_effort: this.reasoningEffort }
        : {}),
      ...(tools?.length ? { tools } : {}),
      ...(tools?.length && toolChoice ? { tool_choice: toolChoice } : {}),
      ...(schema
        ? {
            response_format: {
              type: "json_schema",
              json_schema: {
                name: schema.name,
                schema: schema.schema,
                strict: true,
              },
            },
          }
        : {}),
    };

    const { message, finishReason, usage } = onContent
      ? await this.stream(body, { schema, onContent })
      : await this.request(body);

    if (this.logUsage && usage) {
      const { prompt_tokens, completion_tokens, prompt_tokens_details } = usage;
      console.log(
        `[llm] ${schema?.name ?? "text"}${onContent ? " (stream)" : ""}: input ${prompt_tokens} (cache read ${prompt_tokens_details?.cached_tokens ?? 0}, write ${prompt_tokens_details?.cache_write_tokens ?? 0}), output ${completion_tokens}`,
      );
    }

    if (message.refusal) {
      throw new LlmError(`Model refused: ${message.refusal}`);
    }

    const toolCalls = (message.tool_calls ?? []).map((toolCall) => ({
      id: toolCall.id,
      name: toolCall.function.name,
      arguments: parseJson(toolCall.function.arguments) ?? {},
    }));

    let content = message.content ?? null;

    if (content && schema) {
      content = parseJsonLoose(content);

      if (!content) {
        const text = String(message.content);
        throw new LlmError(
          `Invalid JSON returned by the model (finish_reason: ${finishReason}): ${text.length > 300 ? `${text.slice(0, 150)}...${text.slice(-150)}` : text}`,
        );
      }
    }

    if (!content && toolCalls.length === 0) {
      throw new LlmError(
        `Empty response from the model (finish_reason: ${finishReason})`,
      );
    }

    const assistantMessage = {
      role: "assistant",
      content: message.content ?? null,
      ...(message.tool_calls?.length ? { tool_calls: message.tool_calls } : {}),
    };

    return { content, toolCalls, assistantMessage };
  }

  async request(body) {
    const response = await this.openai.chat.completions.create(body);
    const choice = response.choices[0];

    return {
      message: choice.message,
      finishReason: choice.finish_reason,
      usage: response.usage,
    };
  }

  /** Same as `request`, but reports the text while the model writes it. */
  async stream(body, { schema, onContent }) {
    const stream = await this.openai.chat.completions.create({
      ...body,
      stream: true,
      stream_options: { include_usage: true },
    });

    let text = "";
    let shown = null;
    let refusal = null;
    let finishReason = null;
    let usage = null;
    const toolCalls = [];

    for await (const chunk of stream) {
      if (chunk.usage) usage = chunk.usage;

      const choice = chunk.choices?.[0];
      if (!choice) continue;

      const { content, refusal: refusalDelta, tool_calls } = choice.delta ?? {};

      if (refusalDelta) refusal = (refusal ?? "") + refusalDelta;

      if (content) {
        text += content;
        const visible = schema ? partialStringField(text, "content") : text;

        if (visible && visible !== shown) {
          shown = visible;
          onContent(visible);
        }
      }

      for (const delta of tool_calls ?? []) {
        const call = (toolCalls[delta.index] ??= {
          id: "",
          type: "function",
          function: { name: "", arguments: "" },
        });
        if (delta.id) call.id = delta.id;
        if (delta.function?.name) call.function.name += delta.function.name;
        if (delta.function?.arguments)
          call.function.arguments += delta.function.arguments;
      }

      if (choice.finish_reason) finishReason = choice.finish_reason;
    }

    return {
      message: {
        content: text || null,
        refusal,
        tool_calls: toolCalls.filter(Boolean),
      },
      finishReason,
      usage,
    };
  }
}

export const createLlmClient = () =>
  new LlmClient({
    openai: new OpenAI({
      apiKey: config.OPENAI_API_KEY,
      project: config.OPENAI_PROJECT_ID,
      maxRetries: 3, // network errors, 429 and 5xx are retried with backoff
    }),
    model: config.MODEL,
    reasoningEffort: config.REASONING_EFFORT,
    promptCache: config.PROMPT_CACHE,
    logUsage: config.LOG_LLM_USAGE,
  });
