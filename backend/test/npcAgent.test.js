import assert from "node:assert/strict";
import { test } from "node:test";
import { NpcAgent, trimMemory } from "../agents/NpcAgent.js";

const npcData = {
  name: "Joseph",
  gender: "Male",
  personality: ["wary"],
  story: "A story.",
};

const memoryStore = () => {
  const memories = new Map();
  return {
    getMemory: async (id) => memories.get(id) ?? [],
    setMemory: async (id, messages) => memories.set(id, messages),
  };
};

const createAgent = (complete, store = memoryStore()) =>
  new NpcAgent({
    id: 1,
    data: npcData,
    llm: { complete },
    store,
    getWorldContext: () => "World context.",
    maxMemoryMessages: 40,
  });

test("trimMemory keeps whole turns starting at a user message", () => {
  const messages = [
    { role: "user", content: "1" },
    { role: "assistant", tool_calls: [{}] },
    { role: "tool", content: "x" },
    { role: "user", content: "2" },
    { role: "assistant", content: "y" },
  ];

  assert.equal(trimMemory(messages, 10), messages);
  assert.deepEqual(trimMemory(messages, 3), messages.slice(3));
  assert.deepEqual(trimMemory(messages, 1), []);
});

test("chat keeps the system prompt out of the memory", async () => {
  const store = memoryStore();
  let request;
  const agent = createAgent(async (options) => {
    request = options;
    return {
      content: { content: "Hello!" },
      toolCalls: [],
      assistantMessage: { role: "assistant", content: '{"content":"Hello!"}' },
    };
  }, store);

  const result = await agent.chat("Hi");

  assert.deepEqual(result, {
    content: "Hello!",
    reputationChange: 0,
    reputationReason: "",
    actions: [],
  });
  assert.match(request.system, /Joseph/);
  assert.match(request.system, /first time/);
  const memory = await store.getMemory(1);
  assert.deepEqual(
    memory.map((m) => m.role),
    ["user", "assistant"],
  );
  assert.equal(memory[0].content, "Hi");
});

test("chat answers every tool call and explains failed actions", async () => {
  const store = memoryStore();
  const requests = [];
  const agent = createAgent(async (options) => {
    requests.push(options);
    return requests.length === 1
      ? {
          content: null,
          toolCalls: [
            {
              id: "a",
              name: "followPlayer",
              arguments: { lastWords: "Let's go" },
            },
            { id: "b", name: "unknownTool", arguments: {} },
          ],
          assistantMessage: {
            role: "assistant",
            content: null,
            tool_calls: [],
          },
        }
      : {
          content: { content: "Sorry, I can't do that." },
          toolCalls: [],
          assistantMessage: { role: "assistant", content: "Sorry" },
        };
  }, store);

  const result = await agent.chat("Follow me");

  assert.deepEqual(result, {
    content: "Sorry, I can't do that.",
    reputationChange: 0,
    reputationReason: "",
    actions: [{ action: "followPlayer", lastWords: "Let's go" }],
  });
  // The second request sees why the action failed
  assert.equal(requests.length, 2);
  assert.match(requests[1].messages.at(-1).content, /Unknown function/);
  assert.equal(requests[1].toolChoice, "none");
  const memory = await store.getMemory(1);
  assert.deepEqual(
    memory.filter((m) => m.role === "tool").map((m) => m.tool_call_id),
    ["a", "b"],
  );
  assert.equal(memory.at(-1).content, "Sorry");
});

test("a chat without failed actions takes a single call", async () => {
  let calls = 0;
  const agent = createAgent(async () => {
    calls++;
    return {
      content: null,
      toolCalls: [{ id: "a", name: "endConversation", arguments: {} }],
      assistantMessage: { role: "assistant", content: null },
    };
  });

  await agent.chat("Bye");
  assert.equal(calls, 1);
});

test("concurrent chats are processed sequentially", async () => {
  const store = memoryStore();
  let calls = 0;
  const agent = createAgent(async ({ messages }) => {
    calls++;
    await new Promise((resolve) => setTimeout(resolve, 5));
    return {
      content: { content: `answer ${messages.length}` },
      toolCalls: [],
      assistantMessage: { role: "assistant", content: "a" },
    };
  }, store);

  const [first, second] = await Promise.all([
    agent.chat("one"),
    agent.chat("two"),
  ]);

  assert.equal(calls, 2);
  assert.equal(first.content, "answer 1");
  assert.equal(second.content, "answer 3");
  assert.equal((await store.getMemory(1)).length, 4);
});
