import assert from "node:assert/strict";
import { test } from "node:test";
import {
  LEAK_DELAY_MINUTES,
  NEXT_MYSTERY_DELAY_MINUTES,
  titleFor,
} from "../game/Investigation.js";
import {
  fakeLlm,
  recordingSession,
  setTime,
  toolCall,
  toolLlm,
} from "./helpers.js";

const mysterySession = (llm = fakeLlm()) =>
  recordingSession(llm, { quantity: 3 });

test("the villager holding the evidence gives it to the player", async () => {
  const llm = toolLlm(fakeLlm(), [
    [toolCall("giveItem", { item: "um botão de latão", quantity: 1 })],
  ]);
  const { session } = await mysterySession(llm);

  assert.match((await session.getSituation(3)).mystery, /Botão de latão/);
  assert.match((await session.getSituation(2)).mystery, /evidence against you/);

  const { actions } = await session.chat(3, "Você achou algo?");

  assert.equal(actions[0].item, "Botão de latão", "keeps the exact name");
  assert.ok(session.player.hasItem("Botão de latão"));
  assert.deepEqual(session.playerStateJSON().mystery.evidence, {
    item: "Botão de latão",
    description: "Um botão do casaco do Npc2.",
  });
  assert.match((await session.getSituation(3)).mystery, /already gave/);
});

test("with the evidence, a wrong accusation doesn't cost an attempt", async () => {
  const { session } = await mysterySession();
  session.mystery.evidenceFound = true;
  session.player.addItem("Botão de latão");

  const result = await session.accuse(1);

  assert.equal(result.evidenceMismatch, true);
  assert.equal(result.attemptsLeft, 2);
  assert.equal(session.player.getReputation(1), -3);
});

test("the culprit confesses only to the player, who tells the village", async () => {
  const llm = toolLlm(fakeLlm(), [
    [toolCall("confess", { lastWords: "Fui eu." })],
    [], // The innocent explains, after the failed confession
    [toolCall("confess", { lastWords: "Fui eu." })],
  ]);
  const { session, sent } = await mysterySession(llm);

  const innocent = await session.chat(1, "Confesse!");
  assert.deepEqual(innocent.actions, []);
  assert.equal(session.mystery.status, "open");

  const culprit = await session.chat(2, "Confesse!");
  assert.equal(culprit.actions[0].action, "confess");
  assert.equal(session.mystery.status, "confessed");
  assert.equal(session.playerStateJSON().mystery.culprit, "Npc2");
  assert.match((await session.getSituation(2)).mystery, /beg them/);
  assert.ok(sent.some((m) => /confessou só para você/.test(m.data?.text)));

  await session.decideMystery("expose");

  assert.equal(session.mystery.status, "solved");
  assert.equal(session.investigation.solved, 1);
  assert.ok(sent.some((m) => /Você contou à vila/.test(m.data?.text)));
});

test("keeping the culprit's secret makes an ally, until it leaks", async () => {
  const { session, sent } = await mysterySession();
  setTime(session, 10 * 60);
  session.mystery.confess(2);

  await session.decideMystery("protect");

  assert.equal(session.mystery.status, "covered");
  assert.equal(session.player.getReputation(2), 4);
  assert.equal(session.investigation.solved, 0, "no title for a cover-up");
  assert.match((await session.getSituation(2)).mystery, /kept your secret/);
  assert.match((await session.getSituation(1)).mystery, /never solved/);

  // The secret leaks
  session.investigation.leak.willLeak = true;
  setTime(session, 10 * 60 + LEAK_DELAY_MINUTES);
  await session.investigation.update(session.clock.totalMinutes);

  assert.equal(session.investigation.covered.leaked, true);
  assert.equal(session.player.getReputation(1), -1);
  assert.equal(
    session.player.getReputation(2),
    4,
    "the culprit is still grateful",
  );
  assert.ok(sent.some((m) => /A verdade vazou/.test(m.data?.text)));
  assert.ok(
    (await session.store.getFacts(3)).some((fact) =>
      /knew that Npc2 did .* and kept it secret/.test(fact),
    ),
  );
});

test("a new mystery starts some time after the last one", async () => {
  const { session } = await mysterySession();
  setTime(session, 10 * 60);

  await session.accuse(2);
  assert.equal(
    session.investigation.nextMysteryAt,
    10 * 60 + NEXT_MYSTERY_DELAY_MINUTES,
  );

  await session.tick();
  assert.equal(session.mystery.status, "solved", "too early");

  setTime(session, 10 * 60 + NEXT_MYSTERY_DELAY_MINUTES);
  await session.tick();

  assert.equal(session.mystery.status, "open");
  assert.deepEqual(session.playerStateJSON().pastMysteries, [
    { title: "O sino sumiu", solved: true, covered: false, culprit: "Npc2" },
  ]);
  assert.match((await session.getSituation(1)).investigator.title, /Curioso/);
});

test("titles grow with the solved mysteries", () => {
  assert.equal(titleFor(0), null);
  assert.equal(titleFor(1), "Curioso da vila");
  assert.equal(titleFor(2), "Investigador");
  assert.equal(titleFor(5), "Detetive da vila");
});

test("what the NPC claimed about the mystery goes to the journal", async () => {
  const llm = fakeLlm({
    chat_summary: ({ messages }) => {
      assert.match(messages[0].content, /O sino sumiu/);
      return {
        fact: "The traveler asked about the bell.",
        testimony: "Npc2 disse que estava pescando.",
      };
    },
  });
  const { session } = await mysterySession(llm);

  await session.chat(2, "Onde você estava?");
  await session.summarizeChat(2);

  assert.deepEqual(
    session.playerStateJSON().mystery.testimonies.map(({ name, text }) => ({
      name,
      text,
    })),
    [{ name: "Npc2", text: "Npc2 disse que estava pescando." }],
  );
});

test("villagers that like the player go tell them their clue", async () => {
  const { session, sent } = await mysterySession();
  setTime(session, 10 * 60);
  session.player.changeReputation(1, 3); // Npc1 knows a clue
  session.player.changeReputation(2, 5); // Npc2 is the culprit

  await session.tick();

  const seeks = sent.filter((m) => m.type === "npc_seeks_player");
  assert.deepEqual(
    seeks.map((m) => m.agentId),
    [1],
  );

  // The reason is used in the greeting
  const greeting = await session.greet(1);
  assert.equal(greeting.content, "I'm fine.");
  const memory = await session.store.getMemory(1);
  assert.match(memory[0].content, /saw Npc2 near the tavern/);

  // Only once
  setTime(session, 12 * 60);
  await session.tick();
  assert.equal(sent.filter((m) => m.type === "npc_seeks_player").length, 1);
});
