import assert from "node:assert/strict";
import { test } from "node:test";
import { TOWNSFOLK_FIRST_ID } from "../game/Regions.js";
import { fakeLlm, recordingSession, setTime } from "./helpers.js";

const townsfolk = () => ({
  people: ["Orla", "Brannoc", "Quilla"].map((name) => ({
    name,
    occupation: "harbor master",
    title: "mestre do porto",
    personality: ["calm"],
    story: "Lives in the town.",
    secret: "A small secret.",
    likes: ["peixe"],
    dislikes: ["lama"],
  })),
});

test("villagers go to Pedravento and people of the town visit", async () => {
  const llm = fakeLlm({ townsfolk });
  const { session, sent } = await recordingSession(llm);
  await session.regions.createTownsfolk();
  const trips = session.trips;
  trips.random = () => 0; // Always a trip, the first candidate

  // Day 2, 09:00: a villager takes the boat (the player is in the village)
  setTime(session, 24 * 60 + 9 * 60);
  assert.equal(await trips.update(2, 9), true);
  const { npcId } = trips.trip;
  assert.ok(session.cast.some(({ slot }) => slot === npcId));
  assert.equal(session.getNpc(npcId).data.away, "town");
  assert.ok(
    sent.some((m) => m.type === "npc_updated" && m.data.away === "town"),
  );
  assert.match(trips.describeFor(npcId), /Pedravento/);
  // They talked with someone of the town (the player wasn't there)
  assert.ok(trips.trip.partnerId >= TOWNSFOLK_FIRST_ID);

  // In the evening they come back with the news
  await trips.update(2, 17);
  assert.equal(trips.trip, null);
  assert.equal(session.getNpc(npcId).data.away, undefined);
  assert.ok(sent.some((m) => m.type === "npc_updated" && m.data.away === null));
  assert.ok(
    session.player.news.some((n) => /voltou de Pedravento/.test(n.text)),
  );

  // Next day someone of the town comes to the village
  assert.equal(await trips.update(3, 9), true);
  assert.ok(trips.trip.npcId >= TOWNSFOLK_FIRST_ID);
  assert.equal(trips.trip.to, "village");

  // Saved with the game
  const state = JSON.parse(JSON.stringify(trips.toState()));
  trips.restoreState(state);
  assert.equal(trips.trip.to, "village");
});
