import assert from "node:assert/strict";
import { test } from "node:test";
import {
  CAMP_FIRST_ID,
  TOWNSFOLK_FIRST_ID,
  rollNode,
} from "../game/Regions.js";
import { fakeLlm, recordingSession, setTime } from "./helpers.js";

test("the boat takes the player to the regions and back", async () => {
  const { session, sent } = await recordingSession(fakeLlm());
  setTime(session, 10 * 60);

  const trip = await session.interact("travel:forest");
  assert.equal(trip.travel, "forest");
  assert.equal(session.clock.minuteOfDay, 10 * 60 + 30);
  assert.equal(session.snapshot().world.regions.location, "forest");
  assert.ok(sent.some((m) => m.type === "clock"));

  await session.interact("travel:village");
  assert.equal(session.regions.location, "village");
  await assert.rejects(session.interact("travel:moon"), /Unknown region/);
});

test("trees need an axe, give wood and grow back", async () => {
  const { session } = await recordingSession(fakeLlm());
  setTime(session, 10 * 60);
  await session.interact("travel:forest");

  assert.match((await session.interact("tree_2")).message, /machado/);
  session.player.addItem("machado", 1);
  const cut = await session.interact("tree_2");
  assert.equal(cut.item, "lenha");
  assert.deepEqual(session.regions.toJSON().depleted, ["forest:tree_2"]);
  assert.match((await session.interact("tree_2")).message, /toco/);

  setTime(session, 10 * 60 + 3 * 24 * 60);
  assert.deepEqual(session.regions.toJSON().depleted, [], "grew back");
});

test("the mine gives ore, coal and crystals", () => {
  assert.equal(rollNode("ore", () => 0.9)[0][0], "minério de ferro");
  assert.equal(rollNode("ore", () => 0.1)[0][0], "carvão");
  assert.deepEqual(rollNode("crystal"), [["cristal", 1]]);
});

test("beating the camp of the bandits postpones the next raid", async () => {
  const { session, sent } = await recordingSession(fakeLlm());
  setTime(session, 10 * 60 + 24 * 60); // Day 2
  await session.interact("travel:forest");
  const { bandits } = session.regions.toJSON().camp;
  assert.deepEqual(bandits, [CAMP_FIRST_ID, CAMP_FIRST_ID + 1]);

  assert.equal((await session.interact("camp_chest")).ok, false);
  for (const id of bandits) await session.banditDefeated(id);

  assert.equal(session.regions.toJSON().camp.guarded, false);
  assert.equal(session.bandits.lastRaidDay, 3, "the raid of day 3 is skipped");
  assert.ok(sent.some((m) => /acampamento/.test(m.data?.text)));
  assert.equal((await session.interact("camp_chest")).ok, true);
  assert.equal((await session.interact("camp_chest")).ok, false, "looted");
});

test("the town merchants buy and sell", async () => {
  const { session } = await recordingSession(fakeLlm());
  await session.interact("travel:town");
  session.player.addItem("moedas", 20);

  const axe = await session.interact("trade:merchant_tools:buy:0");
  assert.equal(axe.item, "machado");

  session.player.addItem("Minério de Ferro", 3);
  const sale = await session.interact("trade:merchant_buyer:sell:0");
  assert.match(sale.message, /vendeu 3/);
  assert.equal(session.player.hasItem("minério de ferro"), false);

  await assert.rejects(session.interact("trade:nobody:buy:0"), /No merchant/);
});

test("NPCs know the places beyond the island", async () => {
  const { session } = await recordingSession(fakeLlm());
  assert.match(session.worldContext, /Floresta Sombria/);
});

test("the first trip to the town creates its people", async () => {
  const llm = fakeLlm({
    townsfolk: () => ({
      people: ["Orla", "Brannoc", "Quilla", "Extra"].map((name) => ({
        name,
        occupation: "harbor master",
        personality: ["calm"],
        story: "Lives in the town.",
        secret: "A small secret.",
        likes: ["peixe"],
        dislikes: ["lama"],
      })),
    }),
  });
  const { session, sent } = await recordingSession(llm);

  await session.interact("travel:town");
  await session.flush();

  const created = sent.filter(
    (m) => m.type === "agent_created" && m.data.townsfolk,
  );
  assert.equal(created.length, 3);
  assert.equal(created[0].data.agent.data.region, "town");
  assert.equal(session.getNpc(TOWNSFOLK_FIRST_ID).data.name, "Orla");
  assert.equal(session.isVillager(TOWNSFOLK_FIRST_ID), false);

  // Only once, and saved with the game
  await session.interact("travel:village");
  await session.interact("travel:town");
  await session.flush();
  assert.equal(llm.calls.filter((name) => name === "townsfolk").length, 1);
  assert.deepEqual(session.toState().regions.townsfolk, [400, 401, 402]);
});
