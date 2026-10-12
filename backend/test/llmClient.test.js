import assert from "node:assert/strict";
import { test } from "node:test";
import { buildSystemMessages, LlmClient, LlmError } from "../llm/client.js";

const fakeOpenAI = (message, finishReason = "stop") => {
  const calls = [];
  return {
    calls,
    chat: {
      completions: {
        create: async (body) => {
          calls.push(body);
          return { choices: [{ message, finish_reason: finishReason }] };
        },
      },
    },
  };
};

const schema = { name: "x", schema: { type: "object" } };

test("parses structured content and prepends the system prompt", async () => {
  const openai = fakeOpenAI({ content: '{"content":"hi"}' });
  const llm = new LlmClient({ openai, model: "m" });
  const messages = [{ role: "user", content: "hello" }];

  const result = await llm.complete({ system: "sys", messages, schema });

  assert.deepEqual(result.content, { content: "hi" });
  assert.deepEqual(result.toolCalls, []);
  assert.equal(openai.calls[0].messages[0].role, "system");
  assert.equal(openai.calls[0].response_format.json_schema.strict, true);
  assert.equal(messages.length, 1, "input messages must not be mutated");
});

test("returns every tool call with parsed arguments", async () => {
  const openai = fakeOpenAI({
    content: null,
    tool_calls: [
      {
        id: "a",
        function: { name: "followPlayer", arguments: '{"lastWords":"ok"}' },
      },
      { id: "b", function: { name: "endConversation", arguments: "{bad" } },
    ],
  });
  const llm = new LlmClient({ openai, model: "m" });

  const result = await llm.complete({ messages: [], schema });

  assert.deepEqual(result.toolCalls, [
    { id: "a", name: "followPlayer", arguments: { lastWords: "ok" } },
    { id: "b", name: "endConversation", arguments: {} },
  ]);
  assert.equal(result.content, null);
  assert.equal(result.assistantMessage.tool_calls.length, 2);
});

test("throws on invalid JSON or empty response", async () => {
  const invalid = new LlmClient({
    openai: fakeOpenAI({ content: "not json" }, "length"),
    model: "m",
  });
  await assert.rejects(invalid.complete({ messages: [], schema }), LlmError);

  const empty = new LlmClient({
    openai: fakeOpenAI({ content: null }),
    model: "m",
  });
  await assert.rejects(empty.complete({ messages: [] }), LlmError);
});

test("puts the cached prefix in its own system message", async () => {
  const openai = fakeOpenAI({ content: '{"content":"hi"}' });
  const llm = new LlmClient({ openai, model: "m", promptCache: true });

  await llm.complete({
    system: "WORLD|persona",
    cachePrefix: "WORLD|",
    cacheSystem: true,
    messages: [{ role: "user", content: "hi" }],
    schema,
  });

  const request = openai.calls[0];
  const breakpoint = { mode: "explicit" };
  assert.deepEqual(request.prompt_cache_options, { mode: "explicit" });
  assert.deepEqual(request.messages, [
    {
      role: "system",
      content: [
        { type: "text", text: "WORLD|", prompt_cache_breakpoint: breakpoint },
      ],
    },
    {
      role: "system",
      content: [
        { type: "text", text: "persona", prompt_cache_breakpoint: breakpoint },
      ],
    },
    { role: "user", content: "hi" },
  ]);
});

test("one-off prompts only cache the shared prefix", () => {
  const { messages } = buildSystemMessages("WORLD|event", {
    cachePrefix: "WORLD|",
  });

  assert.equal(messages.length, 2);
  assert.equal(messages[1].content, "event");
});

test("sends a plain system prompt when the cache is disabled", async () => {
  const openai = fakeOpenAI({ content: '{"content":"hi"}' });
  const llm = new LlmClient({ openai, model: "m" });

  await llm.complete({
    system: "WORLD|persona",
    cachePrefix: "WORLD|",
    cacheSystem: true,
    messages: [],
    schema,
  });

  assert.deepEqual(openai.calls[0].messages, [
    { role: "system", content: "WORLD|persona" },
  ]);
  assert.equal(openai.calls[0].prompt_cache_options, undefined);
});

test("tool choice is only sent with tools", async () => {
  const openai = fakeOpenAI({ content: '{"content":"hi"}' });
  const llm = new LlmClient({ openai, model: "m" });
  const tools = [{ type: "function", function: { name: "f" } }];

  await llm.complete({ messages: [], tools, toolChoice: "none", schema });
  await llm.complete({ messages: [], toolChoice: "none", schema });

  assert.equal(openai.calls[0].tool_choice, "none");
  assert.equal(openai.calls[1].tool_choice, undefined);
});
