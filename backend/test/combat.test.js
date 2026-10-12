import assert from "node:assert/strict";
import { test } from "node:test";
import { BANDIT_FIRST_ID, RAID_HOUR } from "../game/Bandits.js";
import { INJURY_MINUTES, defenderTitleFor } from "../game/Combat.js";
import { courageOf, healValue, reactionToAttack } from "../game/combatRules.js";
import {
  fakeLlm,
  recordingSession,
  setTime,
  toolCall,
  toolLlm,
} from "./helpers.js";

test("a villager agrees to train, and both remember it", async () => {
  const llm = toolLlm(fakeLlm(), [
    [toolCall("startSparring", { lastWords: "Vamos lá!" })],
  ]);
  const { session, sent } = await recordingSession(llm);

  const { actions } = await session.chat(1, "Vamos treinar luta?");
  assert.equal(actions[0].action, "startSparring");

  await session.endFight(1, "player");

  assert.equal(session.player.getReputation(1), 1);
  assert.deepEqual(session.playerStateJSON().combat, {
    wins: 1,
    losses: 0,
    defenses: 0,
    title: null,
  });
  assert.ok(sent.some((m) => /venceu o treino/.test(m.data?.text)));
  assert.ok(
    (await session.store.getFacts(1)).some((fact) =>
      /beat me in a fight|they beat me/.test(fact),
    ),
  );
  await assert.rejects(session.endFight(1, "player"), /no fight/);
});

test("villagers that dislike the player don't train with them", async () => {
  const { session } = await recordingSession(fakeLlm());
  session.player.changeReputation(1, -2);

  assert.match(session.combat.startSparring(1), /dislike/);
});

test("a knocked out villager stays hurt for some hours", async () => {
  const { session, sent } = await recordingSession(fakeLlm());
  setTime(session, 10 * 60);
  session.combat.startFight(1);

  await session.endFight(1, "player");

  assert.ok(session.combat.isInjured(1));
  assert.match((await session.getSituation(1)).injury, /hurt/);
  assert.match(session.combat.startSparring(1), /hurt/);
  assert.equal(session.snapshot().agents[0].data.injured, true);
  assert.ok(
    sent.some((m) => m.type === "npc_updated" && m.data.injured === true),
  );

  setTime(session, 10 * 60 + INJURY_MINUTES);
  session.combat.update(session.clock.totalMinutes);
  assert.ok(!session.combat.isInjured(1));
  assert.ok(
    sent.some((m) => m.type === "npc_updated" && m.data.injured === false),
  );
});

test("a knocked out player loses some coins", async () => {
  const { session } = await recordingSession(fakeLlm());
  session.combat.startFight(2);

  await session.endFight(2, "npc");

  assert.deepEqual(session.player.items, [{ name: "moedas", quantity: 7 }]);
  assert.equal(session.playerStateJSON().combat.losses, 1);
});

// --- Stage 2: causes and consequences --------------------------------------

const villager = (overrides) => ({
  sprite: "townfolkM",
  occupation: "Farmer",
  personality: ["kind"],
  ...overrides,
});

test("brave villagers fight back, the others run away", () => {
  const guard = villager({ sprite: "warriorM", occupation: "Village guard" });
  const shy = villager({ personality: ["shy", "gentle"] });

  assert.ok(courageOf(guard) > courageOf(shy));
  assert.equal(reactionToAttack(guard, { reputation: 0 }), "fight");
  assert.equal(reactionToAttack(shy, { reputation: 0 }), "flee");
  assert.equal(
    reactionToAttack(villager({ sprite: "ninjaF" }), {
      reputation: 0,
      bond: "rival",
    }),
    "fight",
  );
  assert.equal(
    reactionToAttack(guard, { reputation: 0, injured: true }),
    "flee",
  );
});

const brawlSession = async () => {
  const llm = fakeLlm();
  const { session, sent } = await recordingSession(llm, { quantity: 3 });
  // Npc1 is a brave guard, Npc2 a shy farmer
  Object.assign(session.npcs.get(1).data, {
    sprite: "warriorM",
    occupation: "Village guard",
    personality: ["brave"],
  });
  Object.assign(session.npcs.get(2).data, {
    sprite: "townfolkF",
    occupation: "Farmer",
    personality: ["shy"],
  });
  Object.assign(session.npcs.get(3).data, {
    sprite: "warriorF",
    occupation: "Hunter",
    personality: ["proud"],
  });
  return { session, sent, llm };
};

test("hitting a villager: they fight back, and witnesses judge the player", async () => {
  const { session, sent, llm } = await brawlSession();

  const reaction = await session.playerAttacked(3);

  assert.equal(reaction.reaction, "fight");
  assert.equal(reaction.guardId, 1, "the guard comes");
  assert.equal(session.player.getReputation(3), -3);
  await session.flush();
  assert.ok(llm.calls.includes("fight_lines"));
  assert.deepEqual(sent.find((m) => m.type === "fight_lines").data.taunts, [
    "Vem!",
    "Só isso?",
    "Agora vai!",
  ]);

  await session.endFight(3, "player", { witnesses: [2, 3, 99] });

  assert.equal(session.player.getReputation(2), -2, "witness");
  assert.ok(session.combat.isInjured(3));
  assert.match(
    session.player.news.at(-1).text,
    /atacou Npc3 na frente de todos/,
  );
  assert.ok(
    (await session.store.getFacts(2)).some((fact) =>
      /\[seen\] The traveler attacked Npc3/.test(fact),
    ),
  );
  assert.ok(
    (await session.store.getFacts(3)).some((fact) =>
      /The traveler beat me in a fight/.test(fact),
    ),
    "the memory written by the model",
  );
});

test("a shy villager runs away and the guard fines the player", async () => {
  const { session, sent } = await brawlSession();

  const reaction = await session.playerAttacked(2);
  assert.equal(reaction.reaction, "flee");
  assert.equal(session.combat.fights.has(2), false);

  await session.guardArrived(1);

  assert.equal(
    session.player.items.find((i) => i.name === "moedas"),
    undefined,
  );
  assert.equal(session.player.getReputation(1), -1);
  assert.ok(
    sent.some((m) => /separou a briga e te multou em 10/.test(m.data?.text)),
  );
  await assert.rejects(session.guardArrived(1), /not called/);
});

test("a rival challenges the player to a duel", async () => {
  const llm = toolLlm(fakeLlm(), [
    [toolCall("startFight", { kind: "duel", lastWords: "Em guarda!" })],
  ]);
  const { session } = await recordingSession(llm, { quantity: 3 });

  const { actions } = await session.chat(1, "Você não me assusta");
  assert.equal(actions[0].kind, "duel");

  await session.endFight(1, "player", { witnesses: [2] });
  assert.equal(session.player.getReputation(2), 1, "the witness respects it");
  assert.match(session.player.news.at(-1).text, /duelaram/);
});

test("villagers who like the player don't attack them", async () => {
  const { session } = await recordingSession(fakeLlm());
  session.player.changeReputation(1, 6);

  assert.match(session.combat.startFight(1, "fight"), /like the traveler/);
  assert.equal(session.combat.startFight(1, "duel"), null);
});

// --- Stage 3: bandits, equipment and healing -------------------------------

test("bandits attack every few days; beating them all saves the village", async () => {
  const { session, sent } = await recordingSession(fakeLlm(), { quantity: 3 });
  setTime(session, 2 * 24 * 60 + RAID_HOUR * 60); // day 3

  await session.bandits.update(3, RAID_HOUR, session.clock.totalMinutes);
  const raid = session.snapshot().world.raid;
  assert.equal(raid.bandits.length, 2);
  assert.equal(raid.bandits[0].id, BANDIT_FIRST_ID);
  assert.match((await session.getSituation(1)).raid, /Bandits/);

  await session.banditDefeated(BANDIT_FIRST_ID);
  assert.ok(session.bandits.isActive);
  await session.banditDefeated(BANDIT_FIRST_ID + 1);

  assert.equal(session.bandits.isActive, false);
  assert.equal(session.player.getReputation(2), 2);
  assert.equal(session.combat.title, "Protetor da vila");
  assert.match((await session.getSituation(2)).defender, /Protetor/);
  assert.ok(sent.some((m) => /expulsou os bandidos/.test(m.data?.text)));
  await assert.rejects(
    session.banditDefeated(BANDIT_FIRST_ID),
    /not in the village/,
  );
});

test("if nobody stops them, the bandits rob a seller", async () => {
  const { session } = await recordingSession(fakeLlm(), { quantity: 3 });
  setTime(session, 2 * 24 * 60 + RAID_HOUR * 60);
  await session.bandits.update(3, RAID_HOUR, session.clock.totalMinutes);

  session.knockedOutByBandits();
  assert.deepEqual(session.player.items, [{ name: "moedas", quantity: 7 }]);

  await session.bandits.update(3, 18, session.clock.totalMinutes + 999);
  assert.equal(session.bandits.isActive, false);
  assert.match(session.player.news.at(-1).text, /levando as mercadorias/);
});

test("titles for defending the village", () => {
  assert.equal(defenderTitleFor(0), null);
  assert.equal(defenderTitleFor(1), "Protetor da vila");
  assert.equal(defenderTitleFor(3), "Herói da vila");
});

test("healing items are used up", async () => {
  assert.equal(healValue("poção de cura"), 60);
  assert.equal(healValue("ervas"), 25);
  assert.equal(healValue("pão"), 12);
  assert.equal(healValue("corda"), 0);

  const { session } = await recordingSession(fakeLlm());
  session.player.addItem("ervas", 1);

  assert.deepEqual(session.useItem("ervas"), {
    ok: true,
    item: "ervas",
    heal: 25,
  });
  assert.equal(session.useItem("ervas").ok, false, "no more herbs");
  assert.equal(session.useItem("moedas").ok, false, "coins don't heal");
});
