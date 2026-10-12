import assert from "node:assert/strict";
import { test } from "node:test";
import { rollLoot } from "../game/Activities.js";
import { canHaveBond } from "../game/Bonds.js";
import { nextWeather } from "../game/Weather.js";
import { isFood, seasonOf, seasonalPriceFactor } from "../game/seasons.js";
import {
  PLACES,
  conversation,
  fakeLlm,
  recordingSession,
  setTime,
  toolCall,
  toolLlm,
} from "./helpers.js";

const DAY = 24 * 60;

// --- Seasons ---------------------------------------------------------------

test("seasons follow each other every few days", () => {
  assert.equal(seasonOf(1, 2), "spring");
  assert.equal(seasonOf(3, 2), "summer");
  assert.equal(seasonOf(7, 2), "winter");
  assert.equal(seasonOf(9, 2), "spring");
});

test("in winter it snows instead of raining, and food is expensive", () => {
  for (let i = 0; i < 100; i++) {
    assert.notEqual(nextWeather("cloudy", 12, Math.random, "winter"), "rain");
  }
  assert.equal(
    nextWeather("rain", 12, () => 0.5, "winter"),
    "snow",
  );
  assert.notEqual(
    nextWeather("snow", 12, () => 0.1, "spring"),
    "snow",
  );

  assert.ok(isFood("Pães"));
  assert.ok(!isFood("corda"));
  assert.equal(seasonalPriceFactor("peixe", "winter"), 1.3);
  assert.equal(seasonalPriceFactor("corda", "winter"), 1);
});

test("a new season is announced", async () => {
  const { session, sent } = await recordingSession(fakeLlm());
  setTime(session, 10 * 60);
  session.life.updateSeason();

  setTime(session, 2 * DAY + 10 * 60); // day 3: summer
  session.life.updateSeason();

  assert.ok(sent.some((m) => /estação: Verão/.test(m.data?.text)));
  assert.equal(session.snapshot().world.season, "summer");
});

// --- Economy ---------------------------------------------------------------

test("NPCs restock in the morning and buy from each other", async () => {
  const { session } = await recordingSession(fakeLlm(), { quantity: 3 });
  session.commerce.stocks.get(1).set("pao", 0);

  await session.commerce.update(2, 7);
  assert.ok(session.commerce.stockOf(1, "Pão") >= 3);

  const before = session.commerce.stockOf(1, "Pão");
  await session.commerce.update(2, 10, () => 0);
  assert.equal(session.commerce.stockOf(1, "Pão"), before - 1);
  assert.ok(
    (await session.store.getFacts(1)).some((fact) => /I sold Pão/.test(fact)),
  );
});

test("world events and seasons change the prices", async () => {
  const { session, sent } = await recordingSession(fakeLlm());

  session.commerce.applyMarketEvent({
    villager: "Npc1",
    change: "up",
    reason: "a farinha acabou",
  });
  assert.equal(session.commerce.waresFor(1)[0].price, 6); // 4 * 1.4
  assert.equal(session.commerce.waresFor(1)[0].trend, "up");
  assert.ok(sent.some((m) => /aumentou os preços/.test(m.data?.text)));

  // A day later the event is over; in winter bread costs more
  setTime(session, 6 * DAY + 12 * 60);
  assert.equal(session.season, "winter");
  assert.equal(session.commerce.waresFor(1)[0].price, 5); // 4 * 1.3
});

test("NPCs buy what the player has", async () => {
  const llm = toolLlm(fakeLlm(), [
    [toolCall("buyItem", { item: "peixe", quantity: 2, price: 50 })],
  ]);
  const { session } = await recordingSession(llm);
  session.player.addItem("peixe", 3);

  const { actions } = await session.chat(1, "Quer comprar peixe?");

  assert.equal(actions[0].price, 30, "at most 15 each");
  assert.deepEqual(session.player.items, [
    { name: "moedas", quantity: 40 },
    { name: "peixe", quantity: 1 },
  ]);
});

// --- Activities ------------------------------------------------------------

test("fishing and gathering give items of the season", async () => {
  assert.equal(rollLoot("fishing", "spring", "miss"), null);
  assert.equal(
    rollLoot("gathering", "autumn", "hit", () => 0).item,
    "cogumelo",
  );
  assert.equal(rollLoot("fishing", "summer", "perfect", () => 0).quantity, 2);

  const { session } = await recordingSession(fakeLlm());
  setTime(session, 10 * 60);

  const first = session.doActivity("fishing", "hit");
  assert.equal(first.ok, true);
  assert.ok(session.player.hasItem(first.item));

  assert.equal(session.doActivity("fishing", "hit").ok, false, "cooldown");
  assert.equal(session.doActivity("gathering", "hit").ok, true);

  setTime(session, 23 * 60);
  assert.match(session.doActivity("gathering", "hit").message, /escuro/);
  assert.throws(() => session.doActivity("hunting", "hit"));
});

// --- Bonds -----------------------------------------------------------------

test("bonds with the player need enough reputation", async () => {
  assert.ok(canHaveBond("friend", 4));
  assert.ok(!canHaveBond("best_friend", 6));
  assert.ok(canHaveBond("rival", -5));

  const llm = toolLlm(fakeLlm(), [
    [toolCall("setBond", { bond: "romance", lastWords: "" })],
    [], // explains why not
    [toolCall("setBond", { bond: "romance", lastWords: "" })],
    [toolCall("setBond", { bond: "romance", lastWords: "" })],
    [],
  ]);
  const { session, sent } = await recordingSession(llm);

  await session.chat(1, "Quer namorar comigo?");
  assert.equal(session.bonds.get(1), null);

  session.player.changeReputation(1, 7);
  await session.chat(1, "Quer namorar comigo?");
  assert.equal(session.bonds.get(1), "romance");
  assert.ok(sent.some((m) => /estão namorando/.test(m.data?.text)));
  assert.match((await session.getSituation(1)).bond, /romantic/);

  // Only one romance at a time
  session.player.changeReputation(2, 7);
  await session.chat(2, "E você?");
  assert.equal(session.bonds.get(2), null);
  assert.match((await session.getSituation(2)).bond, /dating Npc1/);

  // Bonds end when the reputation falls
  session.player.changeReputation(1, -10);
  session.bonds.decay();
  assert.equal(session.bonds.get(1), null);
});

test("gifts the NPC loves are worth more", async () => {
  const llm = toolLlm(fakeLlm(), [
    [toolCall("takeItem", { item: "mel", quantity: 1, gift: true })],
    [toolCall("takeItem", { item: "cebola", quantity: 1, gift: true })],
  ]);
  const { session } = await recordingSession(llm);
  session.player.addItem("mel");
  session.player.addItem("cebola");

  await session.chat(1, "Um presente!");
  assert.equal(session.player.getReputation(1), 2);

  await session.chat(2, "Um presente!");
  assert.equal(session.player.getReputation(2), -1);
});

test("an invited villager goes to the gathering with the player", async () => {
  const llm = toolLlm(fakeLlm(), [[toolCall("acceptInvitation", {})]]);
  const { session, sent } = await recordingSession(llm, {
    quantity: 3,
    places: [...PLACES, { id: "garden", name: "Jardim", description: "" }],
  });
  session.player.changeReputation(1, 4);
  setTime(session, 9 * 60);
  await session.tick();

  await session.chat(1, "Vamos juntos à festa?");
  assert.equal(session.bonds.dates.get(1), 1);

  setTime(session, 17 * 60);
  await session.tick();
  assert.deepEqual(
    sent.filter((m) => m.type === "npc_follow").map((m) => m.agentId),
    [1],
  );

  setTime(session, 19 * 60);
  await session.tick();
  assert.equal(session.player.getReputation(1), 5);
  assert.equal(session.bonds.dates.size, 0);
});

test("a friend walking with the player helps in the investigation", async () => {
  const { session } = await recordingSession(fakeLlm(), { quantity: 3 });
  session.bonds.bonds.set(3, "best_friend");

  await session.greet(1, { companionId: 3 });
  const { companion } = await session.getSituation(1);

  assert.match(companion, /Npc3 is walking with the traveler/);
  assert.match(companion, /Npc2 was not fishing/);
});

// --- Goals -----------------------------------------------------------------

test("goals advance every day and become news when achieved", async () => {
  const { session, sent } = await recordingSession(fakeLlm());

  assert.match((await session.getSituation(1)).goal, /telhado novo.*0%/);

  session.goals.update(2, 8, () => 1);
  assert.ok(session.goals.get(1).progress >= 15);

  session.goals.advance(1, 100);
  await session.flush();

  assert.ok(sent.some((m) => /realizou um sonho/.test(m.data?.text)));
  assert.equal(session.goals.get(1).goal, "Ensinar alguém a pescar.");
  assert.equal(session.goals.get(1).progress, 0);
});

test("helping someone brings their goal closer", async () => {
  const llm = toolLlm(fakeLlm(), [
    [
      toolCall("giveQuest", {
        title: "X",
        description: "Y",
        villager: "",
        hours: 0,
      }),
    ],
    [toolCall("completeQuest", { questId: 1 })],
  ]);
  const { session } = await recordingSession(llm);

  await session.chat(1, "Precisa de ajuda?");
  await session.chat(1, "Feito");

  assert.equal(session.goals.get(1).progress, 25);
});

// --- Family ----------------------------------------------------------------

test("close friends date, get engaged, marry and move in together", async () => {
  const { session, sent } = await recordingSession(fakeLlm(), {
    quantity: 3,
    places: [...PLACES, { id: "garden", name: "Jardim", description: "" }],
  });
  session.npcs.get(2).data.routine = ["tavern", "dock"];
  await session.store.setRelationship(1, 2, {
    affinity: 9,
    talks: 5,
    lastTalk: {},
    couple: null,
  });

  await session.family.update(2, 7, () => 0);
  assert.equal(
    (await session.store.getRelationship(1, 2)).couple.status,
    "dating",
  );
  assert.match(await session.family.describeFor(1), /dating Npc2/);

  await session.family.update(3, 7, () => 0);
  assert.equal(
    (await session.store.getRelationship(1, 2)).couple.status,
    "engaged",
  );

  // The wedding is the gathering of the day
  setTime(session, 2 * DAY + 9 * 60);
  await session.life.updateFestival(3, 9);
  assert.match(session.life.festival.kind, /wedding of Npc1 and Npc2/);

  await session.life.updateFestival(3, 17);
  await session.life.updateFestival(3, 19);

  const couple = (await session.store.getRelationship(1, 2)).couple;
  assert.equal(couple.status, "married");
  assert.equal(session.npcs.get(2).data.routine[0], "dock", "moved in");
  assert.ok(sent.some((m) => m.type === "npc_updated" && m.agentId === 2));
  assert.ok(sent.some((m) => /se casaram/.test(m.data?.text)));

  await session.family.update(6, 7, () => 0);
  assert.ok((await session.store.getRelationship(1, 2)).couple.child);
});

test("enemies get a peace request, completed by the other one", async () => {
  const llm = fakeLlm({
    npc_conversation: () => conversation({ affinityDelta: -2 }),
  });
  const peaceLlm = toolLlm(llm, [[toolCall("completeQuest", { questId: 1 })]]);
  const { session, sent } = await recordingSession(peaceLlm, { quantity: 3 });
  session.player.changeReputation(1, 2);

  for (let i = 0; i < 3; i++) {
    const { conversationId, lines } = await session.startNpcConversation(1, 2);
    await session.endNpcConversation(conversationId, lines.length);
  }

  const [quest] = session.player.quests;
  assert.equal(quest.kind, "peace");
  assert.equal(quest.giverId, 1);
  assert.equal(quest.targetId, 2);
  assert.ok(sent.some((m) => m.type === "npc_seeks_player" && m.agentId === 1));
  assert.match((await session.getSituation(2)).quests[0].kind, /peace/);

  await session.chat(2, "Faça as pazes com o Npc1");

  assert.equal(quest.status, "completed");
  assert.ok((await session.store.getRelationship(1, 2)).affinity >= 1);
  assert.ok(
    sent.some((m) => /fizeram as pazes graças a você/.test(m.data?.text)),
  );
});

// --- Visitors --------------------------------------------------------------

test("a visitor comes for a day and leaves in the evening", async () => {
  const { session, sent } = await recordingSession(fakeLlm(), { quantity: 3 });

  await session.visitors.update(1, 11);
  assert.equal(session.npcs.size, 3, "no visitor on odd days");

  await session.visitors.update(2, 11);
  const visitor = session.npcs.get(100);
  assert.equal(visitor.data.name, "Zoltan");
  assert.ok(visitor.data.visitor);
  assert.ok(session.isReady, "visitors don't count for the village");
  assert.ok(sent.some((m) => m.type === "agent_created" && m.data.visitor));
  assert.match((await session.getSituation(1)).visitor, /Zoltan/);
  assert.match(
    await session.playerChat.applyAction(100, {
      action: "giveQuest",
      title: "x",
    }),
    /only visiting/,
  );

  await session.visitors.update(2, 20);
  assert.equal(session.npcs.has(100), false);
  assert.ok(sent.some((m) => m.type === "agent_left" && m.agentId === 100));
});
