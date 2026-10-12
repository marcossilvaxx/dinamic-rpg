import assert from "node:assert/strict";
import { test } from "node:test";
import { festivalStatus, pickFestivalSetup } from "../game/festivals.js";
import { Weather, nextWeather } from "../game/Weather.js";
import { PLACES, fakeLlm, recordingSession, setTime } from "./helpers.js";

test("the weather follows its transitions and fog only forms in the morning", () => {
  assert.equal(
    nextWeather("clear", 12, () => 0),
    "clear",
  );
  assert.equal(
    nextWeather("cloudy", 12, () => 0.99),
    "rain",
  );
  assert.equal(
    nextWeather("storm", 12, () => 0.99),
    "rain",
  );

  for (let i = 0; i < 200; i++) {
    assert.notEqual(nextWeather("clear", 15), "fog");
  }
  assert.equal(
    nextWeather("clear", 6, () => 0.999),
    "fog",
  );
});

test("a weather change returns a message for the player", () => {
  const weather = new Weather("cloudy");

  assert.equal(
    weather.update(12, () => 0.5),
    null,
    "stays cloudy",
  );
  assert.match(
    weather.update(12, () => 0.99),
    /chover/,
  );
  assert.equal(weather.current, "rain");
});

test("gatherings happen in the garden and avoid repeating kinds", () => {
  const places = [{ id: "dock" }, { id: "garden" }];
  const villagers = [{ slot: 1, name: "Ana" }];
  const first = pickFestivalSetup({
    recentKinds: [],
    places,
    villagers,
    random: () => 0,
  });

  assert.equal(first.place.id, "garden");
  assert.notEqual(
    pickFestivalSetup({
      recentKinds: [first.kind],
      places,
      villagers,
      random: () => 0,
    }).kind,
    first.kind,
  );
  assert.equal(festivalStatus(10), "announced");
  assert.equal(festivalStatus(17), "active");
  assert.equal(festivalStatus(19), "over");
});

test("the gathering is announced, starts and becomes a memory", async () => {
  const { session, sent } = await recordingSession(fakeLlm(), {
    quantity: 3,
    places: [
      ...PLACES,
      { id: "garden", name: "Jardim", description: "The garden." },
    ],
  });
  const worldStates = () => sent.filter((m) => m.type === "world_state");

  setTime(session, 9 * 60);
  await session.tick();

  assert.equal(session.life.festival.title, "Feira do peixe");
  assert.equal(session.life.festival.status, "announced");
  assert.ok(sent.some((m) => /Feira do peixe/.test(m.data?.text)));
  assert.match(
    (await session.getSituation(1)).festival,
    /Today from 17:00 to 19:00 at Jardim: There is a fish fair/,
  );

  // It rains (and keeps raining): the gathering moves to the tavern
  session.life.weather.current = "rain";
  session.life.updateWeather = () => {};
  setTime(session, 17 * 60);
  await session.tick();

  assert.equal(session.life.festival.status, "active");
  assert.equal(session.life.festival.placeId, "tavern");
  assert.equal(worldStates().at(-1).data.festival.placeName, "Taverna");

  setTime(session, 19 * 60 + 5);
  await session.tick();

  assert.equal(session.life.festival.status, "over");
  assert.ok(
    (await session.store.getFacts(2)).some((fact) =>
      fact.startsWith("[village news] Today: There is a fish fair"),
    ),
  );
  assert.equal((await session.getSituation(1)).festival, null);
  assert.equal(
    session.llm.calls.filter((name) => name === "festival").length,
    1,
  );
});

test("the weather changes at most once per game hour", async () => {
  const { session } = await recordingSession(fakeLlm());
  let rolls = 0;
  session.life.updateWeather = () => rolls++;

  setTime(session, 10 * 60);
  await session.tick();
  setTime(session, 10 * 60 + 30);
  await session.tick();
  assert.equal(rolls, 0, "first tick only sets the hour");

  setTime(session, 11 * 60);
  await session.tick();
  setTime(session, 11 * 60 + 5);
  await session.tick();
  assert.equal(rolls, 1);
});

test("the weather goes to the prompts", async () => {
  const { session } = await recordingSession(fakeLlm());
  session.life.weather.current = "storm";

  assert.match((await session.getSituation(1)).weather, /storm/);
  assert.equal(session.snapshot().world.weather, "storm");
});

test("NPCs have wares, a secret and a work, and sell to the player", async () => {
  const { session } = await recordingSession(fakeLlm());
  const npc = session.npcs.get(1).data;

  assert.deepEqual(npc.wares, [{ item: "Pão", price: 4 }]);
  assert.equal(npc.secret, "Owes money to the tavern.");
  assert.equal(npc.work, "cooking");

  // Friends get a discount
  session.player.changeReputation(1, 6);
  session.commerce.stocks.get(1).set("pao", 3);
  assert.deepEqual(session.playerStateJSON().shops[0], {
    npcId: 1,
    wares: [{ item: "Pão", price: 3, stock: 3, trend: null }],
  });

  const action = { action: "sellItem", item: "pão", quantity: 2 };
  assert.equal(session.commerce.sell(1, action), null);
  assert.equal(action.price, 6);
  assert.deepEqual(session.player.items, [
    { name: "moedas", quantity: 4 },
    { name: "Pão", quantity: 2 },
  ]);

  assert.match(
    session.commerce.sell(1, { item: "pão", quantity: 2 }),
    /only have 1/,
  );
  session.player.removeItem("moedas", 3);
  assert.match(
    session.commerce.sell(1, { item: "pão", quantity: 1 }),
    /enough coins/,
  );
  assert.match(session.commerce.sell(1, { item: "espada" }), /You sell: Pão/);
});
