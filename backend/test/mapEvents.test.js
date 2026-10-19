import assert from "node:assert/strict";
import { test } from "node:test";
import { FALLEN_TREE_WOOD } from "../game/MapEvents.js";
import { fakeLlm, recordingSession, setTime } from "./helpers.js";

const HOUR = 60;

/** Runs the events of the next game hours with `weather`. */
async function hours(session, count, weather, season = "spring") {
  const events = session.mapEvents;
  let changed = false;
  for (let i = 0; i < count; i++) {
    setTime(session, session.clock.totalMinutes + HOUR);
    changed =
      (await events.update(
        session.clock.totalMinutes,
        session.clock.hour,
        weather,
        season,
      )) || changed;
  }
  return changed;
}

test("a storm knocks a tree down; the player clears it with an axe", async () => {
  const { session, sent } = await recordingSession(fakeLlm());
  setTime(session, 10 * HOUR);
  session.mapEvents.random = () => 0.1; // Tree, no tide
  await hours(session, 1, "clear"); // First hour only starts counting
  assert.equal(await hours(session, 1, "storm"), true);
  assert.ok(session.mapEvents.toJSON().fallenTree);
  assert.ok(sent.some((m) => /derrubou uma árvore/.test(m.data?.text)));
  assert.match(session.mapEvents.describe(), /tree knocked down/);

  assert.match((await session.interact("fallen_tree")).message, /machado/);
  session.player.addItem("machado", 1);
  const cut = await session.interact("fallen_tree");
  assert.equal(cut.ok, true);
  assert.equal(cut.quantity, FALLEN_TREE_WOOD);
  assert.equal(session.mapEvents.toJSON().fallenTree, null);
});

test("the high tide covers the pier and the boat doesn't leave", async () => {
  const { session } = await recordingSession(fakeLlm());
  setTime(session, 10 * HOUR);
  session.mapEvents.random = () => 0.5;
  await hours(session, 1, "clear");
  session.mapEvents.random = () => 0.01;
  await hours(session, 1, "clear");
  assert.ok(session.mapEvents.toJSON().tide);

  const trip = await session.interact("travel:mine");
  assert.equal(trip.ok, false);
  assert.match(trip.message, /maré/);
  assert.equal(session.regions.location, "village");

  session.mapEvents.random = () => 0.9;
  await hours(session, 3, "clear");
  assert.equal(session.mapEvents.toJSON().tide, null);
  assert.equal((await session.interact("travel:mine")).travel, "mine");
});

test("a dry summer sets the forest on fire; rain puts it out", async () => {
  const { session } = await recordingSession(fakeLlm());
  setTime(session, 24 * 60 + 10 * HOUR); // Day 2, 10:00
  session.mapEvents.random = () => 0.9; // Nothing yet
  await hours(session, 26, "clear", "summer");
  session.mapEvents.random = () => 0.05;
  // Waits for the afternoon (the tide may rise too, it doesn't matter)
  for (let i = 0; i < 24 && !session.mapEvents.fire; i++) {
    await hours(session, 1, "clear", "summer");
  }
  const { fire } = session.mapEvents.toJSON();
  assert.ok(fire?.burning);
  assert.ok(
    session.regions.toJSON().depleted.includes(`forest:tree_${fire.trees[0]}`),
  );
  session.mapEvents.tide = null;
  assert.match((await session.interact("travel:forest")).message, /fogo/);

  session.mapEvents.random = () => 0.9;
  await hours(session, 1, "rain", "summer");
  await hours(session, 1, "rain", "summer");
  assert.equal(session.mapEvents.toJSON().fire.burning, false);
  assert.match(session.mapEvents.describe(), /burned/);

  // Saved with the game
  const state = JSON.parse(JSON.stringify(session.mapEvents.toState()));
  session.mapEvents.restoreState(state);
  assert.equal(session.mapEvents.toJSON().fire.burning, false);
});
