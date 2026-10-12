import assert from "node:assert/strict";
import { test } from "node:test";
import { LlmClient } from "../llm/client.js";
import { partialStringField } from "../llm/partialJson.js";

test("reads a string field of a JSON that is still being written", () => {
  assert.equal(partialStringField('{"conte', "content"), null);
  assert.equal(partialStringField('{"content":"Ol', "content"), "Ol");
  assert.equal(
    partialStringField('{"content":"Ele disse \\"oi\\"\\n e', "content"),
    'Ele disse "oi"\n e',
  );
  assert.equal(partialStringField('{"content":"P\\u00e3', "content"), "Pã");
  assert.equal(partialStringField('{"content":"Fim\\', "content"), "Fim");
  assert.equal(
    partialStringField('{"content":"Fim.","reputationChange":1}', "content"),
    "Fim.",
  );
});

const chunk = (delta, extra = {}) => ({
  choices: [{ delta, finish_reason: null }],
  ...extra,
});

const streamingOpenAI = (chunks) => {
  const calls = [];
  return {
    calls,
    chat: {
      completions: {
        create: async (body) => {
          calls.push(body);
          return (async function* () {
            yield* chunks;
          })();
        },
      },
    },
  };
};

const schema = { name: "x", schema: { type: "object" } };

test("streams the answer and returns the complete result", async () => {
  const openai = streamingOpenAI([
    chunk({ content: '{"content":"Bom ' }),
    chunk({ content: 'dia!","reputationChange":' }),
    chunk({ content: "0}" }),
    { choices: [{ delta: {}, finish_reason: "stop" }] },
    { choices: [], usage: { prompt_tokens: 10, completion_tokens: 5 } },
  ]);
  const llm = new LlmClient({ openai, model: "m" });
  const partials = [];

  const result = await llm.complete({
    messages: [],
    schema,
    onContent: (text) => partials.push(text),
  });

  assert.deepEqual(partials, ["Bom ", "Bom dia!"]);
  assert.deepEqual(result.content, {
    content: "Bom dia!",
    reputationChange: 0,
  });
  assert.equal(openai.calls[0].stream, true);
  assert.deepEqual(openai.calls[0].stream_options, { include_usage: true });
});

test("joins the tool calls of a stream", async () => {
  const openai = streamingOpenAI([
    chunk({
      tool_calls: [
        {
          index: 0,
          id: "a",
          function: { name: "giveItem", arguments: '{"it' },
        },
      ],
    }),
    chunk({
      tool_calls: [{ index: 0, function: { arguments: 'em":"pão"}' } }],
    }),
    chunk({
      tool_calls: [
        {
          index: 1,
          id: "b",
          function: { name: "endConversation", arguments: "{}" },
        },
      ],
    }),
  ]);
  const llm = new LlmClient({ openai, model: "m" });

  const result = await llm.complete({
    messages: [],
    schema,
    onContent: () => {},
  });

  assert.deepEqual(result.toolCalls, [
    { id: "a", name: "giveItem", arguments: { item: "pão" } },
    { id: "b", name: "endConversation", arguments: {} },
  ]);
  assert.equal(result.assistantMessage.tool_calls.length, 2);
});

test("tolerates a repeated object and raw line breaks", async () => {
  const { parseJsonLoose } = await import("../llm/partialJson.js");

  assert.deepEqual(parseJsonLoose('{"content":"a"}'), { content: "a" });
  assert.deepEqual(parseJsonLoose('{"content":"a}"}{"content":"b"}'), {
    content: "a}",
  });
  assert.deepEqual(parseJsonLoose('{"content":"linha 1\nlinha 2"}'), {
    content: "linha 1\nlinha 2",
  });
  assert.equal(parseJsonLoose("not json"), null);
});
