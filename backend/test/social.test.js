import assert from "node:assert/strict";
import { test } from "node:test";
import { hearsayChange } from "../game/hearsay.js";
import { SeekPlanner } from "../game/Seeking.js";
import {
  conversation,
  fakeLlm,
  recordingSession,
  setTime,
  toolCall,
  toolLlm,
} from "./helpers.js";

test("gossip moves the opinion towards the speaker's", () => {
  assert.equal(hearsayChange(6, 0), 2);
  assert.equal(hearsayChange(-9, 0), -2);
  assert.equal(hearsayChange(1, 0), 0);
  assert.equal(hearsayChange(-4, 2), -2);
});

test("NPCs that talk about the player spread their opinion", async () => {
  const llm = fakeLlm({
    npc_conversation: () => conversation({ aboutTraveler: true }),
  });
  const { session, sent } = await recordingSession(llm);
  setTime(session, 10 * 60);
  session.player.met.add(1);
  session.player.changeReputation(1, 6);

  const { conversationId, lines } = await session.startNpcConversation(1, 2);
  await session.endNpcConversation(conversationId, lines.length);

  assert.equal(session.player.getReputation(2), 2);
  assert.ok(sent.some((m) => /Boatos: Npc2 ouviu Npc1/.test(m.data?.text)));
  assert.ok(
    (await session.store.getFacts(2)).some((fact) =>
      /Npc1 told me good things/.test(fact),
    ),
  );
  // Npc2 never met the player: it gets curious and goes after them
  assert.deepEqual(
    sent.filter((m) => m.type === "npc_seeks_player").map((m) => m.agentId),
    [2],
  );
  assert.match((await session.getSituation(2)).reputation.toString(), /2/);
});

test("private conversations show secrets and the culprit may slip", async () => {
  let prompt = "";
  const llm = fakeLlm({
    npc_conversation: ({ system }) => {
      prompt = system;
      return conversation();
    },
  });
  const { session } = await recordingSession(llm, { quantity: 3 });

  await session.startNpcConversation(2, 1, null, true);
  assert.match(prompt, /They think they are ALONE/);
  assert.match(prompt, /Secret \(may come up/);
  assert.match(prompt, /\[secret\] Npc2 escondeu o sino/);

  session.social.busyNpcs.clear();
  await session.startNpcConversation(2, 1, null, false);
  assert.match(prompt, /standing right next to them/);
  assert.doesNotMatch(prompt, /\[secret\]/);
});

test("NPCs that catch the player eavesdropping don't like it", async () => {
  const { session, sent } = await recordingSession(fakeLlm());

  const { conversationId } = await session.startNpcConversation(
    1,
    2,
    null,
    true,
  );
  await session.endNpcConversation(conversationId, 1, null, true);

  assert.equal(session.player.getReputation(1), -1);
  assert.equal(session.player.getReputation(2), -1);
  assert.ok(sent.some((m) => /perceberam que você estava/.test(m.data?.text)));
  assert.ok(
    (await session.store.getFacts(1)).some((fact) =>
      /eavesdropping/.test(fact),
    ),
  );
});

test("requests with a deadline: reminder, then failure", async () => {
  const llm = toolLlm(fakeLlm(), [
    [
      toolCall("giveQuest", {
        title: "Lenha",
        description: "Traga lenha",
        villager: "",
        hours: 3,
        lastWords: "",
      }),
    ],
  ]);
  const { session, sent } = await recordingSession(llm);
  setTime(session, 10 * 60);

  await session.chat(1, "Precisa de algo?");
  const [quest] = session.player.quests;
  assert.equal(quest.deadline, 13 * 60);
  assert.equal(
    session.playerStateJSON().quests[0].deadlineLabel,
    "Dia 1, 13:00",
  );

  setTime(session, 12 * 60 + 5);
  await session.tick();
  assert.deepEqual(
    sent.filter((m) => m.type === "npc_seeks_player").map((m) => m.agentId),
    [1],
  );

  setTime(session, 13 * 60);
  await session.tick();
  assert.equal(quest.status, "failed");
  assert.equal(session.player.getReputation(1), -2);
  assert.ok(sent.some((m) => /Pedido não cumprido/.test(m.data?.text)));
});

test("helping someone annoys their enemies", async () => {
  const llm = toolLlm(fakeLlm(), [
    [
      toolCall("giveQuest", {
        title: "Recado",
        description: "Fale com a Npc3",
        villager: "",
        hours: 0,
        lastWords: "",
      }),
    ],
    [toolCall("completeQuest", { questId: 1, lastWords: "" })],
  ]);
  const { session } = await recordingSession(llm, { quantity: 3 });
  await session.store.setRelationship(1, 3, {
    affinity: -6,
    talks: 3,
    lastTalk: {},
  });

  await session.chat(1, "Precisa de algo?");
  await session.chat(1, "Feito!");

  assert.equal(session.player.getReputation(1), 2);
  assert.equal(session.player.getReputation(3), -1);
  assert.equal(session.player.getReputation(2), 0);
});

test("the NPC greets the player only when there is something to say", async () => {
  const { session, sent } = await recordingSession(fakeLlm());

  assert.equal(await session.greet(1), null, "first time: the player talks");

  await session.chat(1, "Oi");
  let typing = false;
  const greeting = await session.greet(1, { onTyping: () => (typing = true) });

  assert.equal(greeting.content, "I'm fine.");
  assert.ok(typing);
  const memory = await session.store.getMemory(1);
  assert.match(memory.at(-2).content, /walks up to talk to you again/);
  assert.equal(session.player.getReputation(1), 0);
  assert.ok(sent.some((m) => m.type === "player_state"));
});

test("only one NPC goes after the player at a time", () => {
  const planner = new SeekPlanner();

  assert.ok(planner.request(1, { reason: "a", now: 0 }));
  assert.ok(!planner.request(2, { reason: "b", now: 5 }), "cooldown");
  assert.ok(planner.request(2, { reason: "b", now: 5, force: true }));
  assert.ok(planner.request(3, { reason: "c", now: 100, key: "k" }));
  assert.ok(!planner.request(4, { reason: "d", now: 200, key: "k" }), "once");

  assert.equal(planner.take(1, 10), "a");
  assert.equal(planner.take(1, 10), null);
  assert.equal(planner.take(3, 1000), null, "too old");
});
