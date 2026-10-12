import assert from "node:assert/strict";
import { test } from "node:test";
import { conversation, createSession, fakeLlm } from "./helpers.js";

test("starts a conversation mapping speakers and outcome to NPC ids", async () => {
  const session = await createSession();

  const result = await session.startNpcConversation(1, 2);

  assert.equal(session.language, "Portuguese");
  assert.deepEqual(
    result.lines.map((line) => line.speakerId),
    [1, 2],
  );
  assert.deepEqual(result.outcome, {
    action: "walk_together",
    targetId: 2,
    callout: "",
  });
  await assert.rejects(
    session.startNpcConversation(2, 1),
    /can't talk now/,
    "NPCs already in a conversation are busy",
  );
});

test("a finished conversation becomes memories and relationship", async () => {
  const session = await createSession();
  const { conversationId, lines } = await session.startNpcConversation(1, 2);

  await session.endNpcConversation(conversationId, lines.length);

  const knowledgeA = await session.getKnowledge(1);
  assert.deepEqual(knowledgeA.facts, [
    "[talking with Npc2] B told me about a dragon.",
  ]);
  assert.deepEqual(knowledgeA.acquaintances, [
    { name: "Npc2", affinity: 2, lastTalkSummary: "B told me about a dragon." },
  ]);
  assert.equal(
    (await session.getKnowledge(2)).acquaintances[0].lastTalkSummary,
    "I told A about the dragon.",
  );

  // NPCs are free again and the conversation can't be ended twice
  await session.endNpcConversation(conversationId, lines.length);
  assert.equal((await session.getKnowledge(1)).facts.length, 1);
  await session.startNpcConversation(1, 2);
});

test("affinity is clamped and facts are limited", async () => {
  const session = await createSession(
    fakeLlm({ npc_conversation: () => conversation({ affinityDelta: -2 }) }),
  );

  for (let i = 0; i < 7; i++) {
    const { conversationId, lines } = await session.startNpcConversation(1, 2);
    await session.endNpcConversation(conversationId, lines.length);
  }

  const relationship = await session.store.getRelationship(1, 2);
  assert.equal(relationship.affinity, -10);
  assert.equal(relationship.talks, 7);
  assert.equal((await session.store.getFacts(1)).length, 3);
});

test("an interrupted conversation only remembers what was shown", async () => {
  const session = await createSession();
  const { conversationId } = await session.startNpcConversation(1, 2);

  await session.endNpcConversation(conversationId, 1, 2);

  const [fact] = await session.store.getFacts(2);
  assert.match(fact, /interrupted by the traveler/);
  assert.match(fact, /Npc1: "Hello there!"/);
  assert.doesNotMatch(fact, /dragon/);
  assert.equal((await session.store.getRelationship(1, 2)).affinity, 0);
  assert.equal(session.npcs.get(2).interruptedConversationWith, "Npc1");
  assert.equal(session.npcs.get(1).interruptedConversationWith, null);
});

test("a conversation ended with no lines shown changes nothing", async () => {
  const session = await createSession();
  const { conversationId } = await session.startNpcConversation(1, 2);

  await session.endNpcConversation(conversationId, 0);

  assert.equal((await session.store.getRelationship(1, 2)).talks, 0);
  assert.deepEqual(await session.store.getFacts(1), []);
});

test("a closed chat with the player becomes a fact for gossip", async () => {
  const llm = fakeLlm();
  const session = await createSession(llm);

  assert.equal(await session.summarizeChat(1), null, "nothing to summarize");
  assert.ok(!llm.calls.includes("chat_summary"));

  await session.chat(1, "I'm looking for a sword");
  const fact = await session.summarizeChat(1);

  assert.equal(fact, "The traveler is looking for a sword.");
  assert.deepEqual(await session.store.getFacts(1), [
    "[talking with the traveler] The traveler is looking for a sword.",
  ]);
  assert.deepEqual(
    (await session.getKnowledge(1)).facts,
    await session.store.getFacts(1),
  );
});
