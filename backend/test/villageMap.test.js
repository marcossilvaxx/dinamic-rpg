import assert from "node:assert/strict";
import { test } from "node:test";
import {
  FARM_PLOTS,
  RIPE_STAGE,
  nextGround,
  rollChest,
  structureKindFor,
} from "../game/VillageMap.js";
import { fakeLlm, recordingSession, setTime } from "./helpers.js";

test("snow piles up while it snows and melts away after", () => {
  let ground = { snow: 0, wet: 0 };
  for (let i = 0; i < 20; i++) ground = nextGround(ground, "snow", "winter");
  assert.equal(ground.snow, 1);

  for (let i = 0; i < 5; i++) ground = nextGround(ground, "clear", "spring");
  assert.ok(ground.snow < 1);
  assert.ok(ground.wet > 0, "melting snow wets the ground");

  for (let i = 0; i < 40; i++) ground = nextGround(ground, "clear", "spring");
  assert.equal(ground.snow, 0);
});

test("rain makes puddles that dry with the sun", () => {
  let ground = { snow: 0, wet: 0 };
  for (let i = 0; i < 10; i++) ground = nextGround(ground, "rain", "spring");
  assert.equal(ground.wet, 1);

  for (let i = 0; i < 50; i++) ground = nextGround(ground, "clear", "summer");
  assert.equal(ground.wet, 0);
});

test("goals become buildings", () => {
  assert.equal(structureKindFor("Abrir uma barraca no mercado"), "stall");
  assert.equal(structureKindFor("Build a small boat"), "boat");
  assert.equal(structureKindFor("Plantar uma horta"), "flowerbed");
  assert.equal(structureKindFor("Reformar a oficina"), "workshop");
  assert.equal(structureKindFor("Aprender a cantar"), "banner");
});

test("chests give coins or an item", () => {
  assert.deepEqual(
    rollChest(() => 0),
    { item: "moedas", quantity: 5 },
  );
  assert.equal(rollChest(() => 0.99).quantity, 1);
});

test("the field grows, the player harvests it and food prices change", async () => {
  const { session, sent } = await recordingSession(fakeLlm());
  const { villageMap } = session;
  setTime(session, 8 * 60); // Day 1, spring
  await villageMap.update(session.clock.totalMinutes, 1, 8);

  // Rain once (better quality) and grow until ripe
  session.life.weather.current = "rain";
  for (let hour = 9; villageMap.stage < RIPE_STAGE; hour++) {
    setTime(session, hour * 60);
    await villageMap.update(session.clock.totalMinutes, 1, hour % 24);
    session.life.weather.current = "clear";
  }

  assert.equal(villageMap.toJSON().farm.crop, "cenoura");
  assert.ok(sent.some((m) => /pronta para a colheita/.test(m.data?.text)));

  for (let plot = 0; plot < FARM_PLOTS; plot++) {
    const result = await session.interact(`plot:${plot}`);
    assert.equal(result.ok, true);
  }

  assert.ok(session.player.hasItem("cenoura", FARM_PLOTS * 2));
  assert.equal(villageMap.stage, 0, "the field is planted again");
  assert.equal(villageMap.foodPriceFactor(), 0.8, "good harvest");
  assert.equal(villageMap.toJSON().farm.plots, FARM_PLOTS + 1, "one more plot");
  assert.equal((await session.interact("plot:0")).ok, false);
});

test("the well, the woodpile and the chests have cooldowns", async () => {
  const { session, sent } = await recordingSession(fakeLlm());
  setTime(session, 10 * 60);

  const water = await session.interact("well");
  assert.equal(water.item, "água fresca");
  assert.equal((await session.interact("well")).ok, false);

  assert.equal((await session.interact("woodpile")).item, "lenha");

  assert.equal((await session.interact("chest_north")).ok, true);
  assert.match((await session.interact("chest_north")).message, /vazio/);
  assert.deepEqual(session.villageMap.toJSON().emptyChests, ["chest_north"]);
  assert.ok(sent.some((m) => m.type === "world_state"));

  await assert.rejects(session.interact("nothing"), /Unknown object/);
});

test("bandits leave wrecks that the player can repair", async () => {
  const { session } = await recordingSession(fakeLlm());
  setTime(session, 15 * 60);
  session.bandits.start(3);
  const { placeId } = session.bandits.raid;

  await session.bandits.end(false);

  const { wrecks } = session.villageMap.toJSON();
  assert.equal(wrecks.length, 2);
  assert.equal(wrecks[0].placeId, placeId);
  assert.match(session.villageMap.describe(), /mess left by the bandits/);

  const { ownerId } = session.villageMap.wrecks[0];
  const before = session.player.getReputation(ownerId);
  const result = await session.interact(`wreck:${wrecks[0].id}`);
  assert.equal(result.ok, true);
  assert.equal(session.villageMap.toJSON().wrecks.length, 1);
  assert.equal(session.player.getReputation(ownerId), before + 2, "the seller");

  // The villagers repair the rest after a day
  setTime(session, 15 * 60 + 25 * 60);
  await session.villageMap.update(session.clock.totalMinutes, 2, 16);
  assert.equal(session.villageMap.toJSON().wrecks.length, 0);
});

test("achieving a goal builds something at home", async () => {
  const { session } = await recordingSession(fakeLlm());
  session.goals.init(1, "Abrir uma barraca de pão");
  session.goals.advance(1, 100);
  await session.flush();

  const [structure] = session.villageMap.toJSON().structures;
  assert.equal(structure.kind, "stall");
  assert.equal(structure.placeId, session.getNpc(1).data.routine[0]);
  assert.match(structure.label, /Barraca de Npc1/);
});

test("the footprints of the culprit become a testimony", async () => {
  const { session } = await recordingSession(fakeLlm(), { quantity: 3 });
  assert.ok(session.mystery?.isOpen);

  await session.villageMap.update(session.clock.totalMinutes, 1, 10);
  const { tracks } = session.villageMap.toJSON();
  assert.ok(tracks);
  assert.equal(
    tracks.toPlaceId,
    session.getNpc(session.mystery.culpritId).data.routine[0],
  );

  const result = await session.interact("tracks");
  assert.match(result.message, /Pegadas de botas/);
  const { testimonies } = session.playerStateJSON().mystery;
  assert.equal(testimonies.at(-1).name, "Pegadas");
});

test("the map is saved with the game", async () => {
  const { session } = await recordingSession(fakeLlm());
  session.villageMap.ground = { snow: 0.5, wet: 0.2 };
  session.villageMap.addWrecks("dock", 1);

  const copy = await recordingSession(fakeLlm());
  await copy.session.restoreState(
    JSON.parse(JSON.stringify(session.toState())),
  );

  assert.deepEqual(copy.session.villageMap.toJSON().ground, {
    snow: 0.5,
    wet: 0.2,
  });
  assert.equal(copy.session.villageMap.toJSON().wrecks.length, 2);
});

test("resting in a bed passes the time", async () => {
  const { session, sent } = await recordingSession(fakeLlm());
  setTime(session, 22 * 60); // Day 1, 22:00

  const night = await session.interact("rest");
  assert.equal(night.rested, 9 * 60);
  assert.equal(session.clock.day, 2);
  assert.equal(session.clock.hour, 7);
  assert.ok(sent.some((m) => m.type === "clock"));

  const nap = await session.interact("rest");
  assert.equal(nap.rested, 120);
  assert.equal(session.clock.hour, 9);
});

test("the tavern sells a meal", async () => {
  const { session } = await recordingSession(fakeLlm());
  const coins = () =>
    session.player.items.find((i) => i.name === "moedas").quantity;
  const before = coins();

  const meal = await session.interact("tavern_meal");
  assert.equal(meal.ok, true);
  assert.equal(coins(), before - 3);
  assert.ok(session.player.hasItem("sopa da taverna"));

  session.player.removeItem("moedas", coins());
  assert.equal((await session.interact("tavern_meal")).ok, false);
});
