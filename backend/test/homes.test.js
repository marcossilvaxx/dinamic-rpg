import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeLlm, recordingSession } from "./helpers.js";

test("the inside of a home shows the life of who lives there", async () => {
  const { session } = await recordingSession(fakeLlm());
  const npc = [...session.npcs.values()][0];
  npc.data.routine = ["tavern", ...(npc.data.routine ?? [])];
  const placeId = npc.data.routine[0];
  const home = () =>
    session.playerStateJSON().homes.find((entry) => entry.placeId === placeId);

  assert.ok(home(), `${placeId} is in the homes`);
  assert.equal(home().mess, 0);

  // Sad: the place gets messy
  session.moods.set(npc.id, -4);
  assert.equal(home().mess, 1);

  // Gifts go on the shelf (only the last ones)
  for (const item of ["flores", "pão", "mel", "fita"]) {
    await session.bonds.gift(npc.id, item);
  }
  assert.deepEqual(session.bonds.gifts.get(npc.id), ["pão", "mel", "fita"]);
  assert.ok(home().gifts.includes("fita"));

  // Orders pile up where people work and are gone the next morning
  session.commerce.addOrder(npc.id, 3);
  assert.equal(home().orders, 3, "the tavern is a workplace");
  await session.commerce.update(5, 8);
  assert.equal(session.commerce.orders.size, 0);

  // Saved with the game
  const state = JSON.parse(JSON.stringify(session.toState()));
  assert.deepEqual(new Map(state.bonds.gifts).get(npc.id), [
    "pão",
    "mel",
    "fita",
  ]);
});
