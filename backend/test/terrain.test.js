import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeLlm, recordingSession, setTime } from "./helpers.js";

test("paths are worn where people walk and grow back with the days", async () => {
  const { session } = await recordingSession(fakeLlm());
  const { terrain } = session;
  await terrain.update(1);

  session.addWear([
    [10, 20],
    [10, 20],
    [11, 5],
    [-1, 50],
    ["x", 3],
    [99999, 5],
  ]);
  assert.deepEqual(terrain.toJSON().wear, [[10, 40]], "only visible wear");

  await terrain.update(2);
  assert.deepEqual(terrain.toJSON().wear, [[10, 32]]);

  await terrain.update(12);
  assert.deepEqual(terrain.toJSON().wear, []);
});

test("bandits may burn a home, rebuilt by the villagers and the player", async () => {
  const { session, sent } = await recordingSession(fakeLlm());
  setTime(session, 15 * 60);
  await session.terrain.update(1);
  session.bandits.start(3);
  for (const npc of session.npcs.values()) npc.data.routine = ["tavern"];

  await session.bandits.end(false, () => 0); // Always sets the fire

  const [fire] = session.terrain.toJSON().burned;
  assert.ok(fire, "a building burned");
  assert.equal(fire.placeId, "tavern");
  assert.ok(sent.some((m) => /incendiaram/.test(m.data?.text)));
  assert.match((await session.getSituation(1)).surroundings, /burned down/);

  // The player helps with wood
  assert.equal((await session.interact(`rebuild:${fire.placeId}`)).ok, false);
  session.player.addItem("lenha", 2);
  const help = await session.interact(`rebuild:${fire.placeId}`);
  assert.equal(help.ok, true);
  assert.equal(session.terrain.toJSON().burned[0].progress, 25);

  // The villagers go on every day
  await session.terrain.update(2);
  assert.equal(session.terrain.toJSON().burned[0].progress, 75);
  await session.terrain.update(3);
  assert.deepEqual(session.terrain.toJSON().burned, []);
  assert.ok(sent.some((m) => /reconstruída/.test(m.data?.text)));
});

test("the terrain is saved with the game", async () => {
  const { session } = await recordingSession(fakeLlm());
  session.addWear([[5, 20]]);
  session.terrain.burn("tavern");

  const copy = await recordingSession(fakeLlm());
  await copy.session.restoreState(
    JSON.parse(JSON.stringify(session.toState())),
  );
  assert.deepEqual(copy.session.terrain.toJSON(), session.terrain.toJSON());
});
