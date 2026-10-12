import assert from "node:assert/strict";
import { test } from "node:test";
import {
  conversation,
  fakeLlm,
  recordingSession,
  toolCall,
  toolLlm,
} from "./helpers.js";

test("what the player says changes their reputation and is remembered", async () => {
  const llm = fakeLlm({
    npc_response: () => ({
      content: "Que grosseria!",
      reputationChange: -2,
      reputationReason: "The traveler insulted my bread.",
    }),
  });
  const { session, sent } = await recordingSession(llm);

  await session.chat(1, "Seu pão é horrível");

  assert.equal(session.player.getReputation(1), -2);
  assert.ok(session.player.met.has(1));
  assert.deepEqual(await session.store.getFacts(1), [
    "[about the traveler] The traveler insulted my bread.",
  ]);
  assert.ok(sent.some((m) => m.type === "notification"));
  assert.ok(sent.some((m) => m.type === "player_state"));
  assert.equal((await session.getSituation(1)).reputation, -2);
});

test("a request given by one NPC is completed by the villager involved", async () => {
  let calls = 0;
  const llm = {
    ...fakeLlm(),
    complete: async (options) => {
      if (options.schema?.name !== "npc_response") {
        return fakeLlm().complete(options);
      }
      calls++;
      const toolCalls =
        calls === 1
          ? [
              toolCall("giveQuest", {
                title: "Recado",
                description: "Diga ao Npc2 que o pão está pronto",
                villager: "Npc2",
                lastWords: "Pode me ajudar?",
              }),
            ]
          : [toolCall("completeQuest", { questId: 1, lastWords: "Obrigado" })];
      return {
        content: null,
        toolCalls,
        assistantMessage: { role: "assistant", content: null },
      };
    },
  };
  const { session } = await recordingSession(llm);

  const first = await session.chat(1, "Precisa de ajuda?");
  assert.equal(first.actions[0].questId, 1);
  assert.equal((await session.getSituation(2)).quests[0].giverName, "Npc1");

  await session.chat(2, "O Npc1 disse que o pão está pronto");

  assert.equal(session.player.quests[0].status, "completed");
  assert.equal(session.player.getReputation(1), 2);
});

test("NPCs can't take items the player doesn't have", async () => {
  const llm = toolLlm(fakeLlm(), [
    [
      toolCall("takeItem", { item: "peixe", quantity: 1, lastWords: "" }),
      toolCall("giveItem", { item: "Pão", quantity: 99, lastWords: "" }),
      toolCall("takeItem", { item: "moedas", quantity: 3, lastWords: "" }),
    ],
  ]);
  const { session } = await recordingSession(llm);

  const { actions } = await session.chat(1, "Toma 3 moedas");

  assert.deepEqual(
    actions.map((action) => action.action),
    ["giveItem", "takeItem"],
  );
  assert.deepEqual(session.player.items, [
    { name: "moedas", quantity: 7 },
    { name: "Pão", quantity: 5 },
  ]);
  const toolMessages = (await session.store.getMemory(1)).filter(
    (message) => message.role === "tool",
  );
  assert.match(toolMessages[0].content, /doesn't have/);
});

test("old facts are written in the diary instead of forgotten", async () => {
  const { session } = await recordingSession(fakeLlm());

  for (let i = 0; i < 3 + 5; i++) {
    await session.remember(1, `Fact ${i}`);
  }
  await session.flush();

  const knowledge = await session.getKnowledge(1);
  assert.deepEqual(knowledge.facts, ["Fact 5", "Fact 6", "Fact 7"]);
  assert.deepEqual(knowledge.diary, ["A summary of old memories."]);
});

test("NPCs that become friends are news in the village", async () => {
  const { session, sent } = await recordingSession(
    fakeLlm({ npc_conversation: () => conversation({ affinityDelta: 2 }) }),
  );

  for (let i = 0; i < 3; i++) {
    const { conversationId, lines } = await session.startNpcConversation(1, 2);
    await session.endNpcConversation(conversationId, lines.length);
  }

  assert.ok(
    sent.some(
      (m) => m.type === "notification" && /grandes amigos/.test(m.data.text),
    ),
  );
  assert.match(session.player.news.at(-1).text, /grandes amigos/);
  assert.deepEqual(sent.filter((m) => m.type === "relationships").at(-1).data, [
    { a: 1, b: 2, affinity: 6, couple: null },
  ]);
  assert.ok(
    (await session.store.getFacts(1)).some((fact) => /good friends/.test(fact)),
  );
});

test("accusing the culprit solves the mystery", async () => {
  const { session } = await recordingSession(fakeLlm(), { quantity: 3 });

  const wrong = await session.accuse(1);
  assert.equal(wrong.correct, false);
  assert.equal(session.player.getReputation(1), -3);

  const right = await session.accuse(2);
  assert.equal(right.correct, true);
  assert.equal(session.playerStateJSON().mystery.status, "solved");
  assert.ok(
    session.player.news.some((news) => /Mistério resolvido/.test(news.text)),
  );
  assert.equal(session.playerStateJSON().title, "Curioso da vila");
});

test("the world stops while the player is away", async () => {
  const { session } = await recordingSession(fakeLlm());
  let now = 0;
  session.clock.now = () => now;
  session.clock.startedAt = 0;
  session.clock.baseMinutes = 600;

  session.detach();
  now = 60 * 60 * 1000;
  assert.equal(session.clock.format(), "10:00");
  assert.equal(session.moodTimer, null);

  session.attach(() => {});
  now += 1000;
  assert.equal(session.clock.format(), "10:01");
  await session.dispose();
});

test("an NPC that refuses an offer takes nothing", async () => {
  const llm = toolLlm(fakeLlm(), [
    [
      toolCall("takeItem", {
        item: "moedas",
        quantity: 2,
        accept: false,
        lastWords: "Não aceito suborno.",
      }),
    ],
  ]);
  const { session } = await recordingSession(llm);

  const { actions } = await session.chat(1, "Te dou 2 moedas por um segredo");

  assert.equal(actions[0].lastWords, "Não aceito suborno.");
  assert.deepEqual(session.player.items, [{ name: "moedas", quantity: 10 }]);
  const memory = await session.store.getMemory(1);
  assert.match(memory.at(-1).content, /nothing changed hands/);
});

test("pausing stops the time of the game", async () => {
  const { session, sent } = await recordingSession(fakeLlm());
  let now = 0;
  session.clock.now = () => now;
  session.clock.startedAt = 0;
  session.clock.pausedAt = null;
  session.clock.baseMinutes = 600;

  session.setPaused(true);
  assert.equal(session.tickTimer, null);
  assert.equal(sent.at(-1).data.paused, true);

  now = 60 * 60 * 1000;
  assert.equal(session.clock.format(), "10:00");
  await session.tick(); // nothing happens while paused

  session.setPaused(false);
  assert.ok(session.tickTimer);
  now += 1000;
  assert.equal(session.clock.format(), "10:01");
  assert.equal(sent.at(-1).data.paused, false);
  await session.dispose();
});
