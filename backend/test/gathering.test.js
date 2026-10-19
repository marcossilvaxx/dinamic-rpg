import assert from "node:assert/strict";
import { test } from "node:test";
import {
  describeGathering,
  gatherableItems,
  sanitizeResources,
} from "../game/Gathering.js";
import { fakeLlm, recordingSession } from "./helpers.js";

const RESOURCES = {
  forest: { tree: 11, forage: 6, ore: 0, crystal: 0 },
  mine: { tree: 0, forage: 0, ore: 7, crystal: 0 }, // No crystals this game
  islet_1: { tree: 3, forage: 4 },
  moon: { tree: 99 },
};

test("only what exists on the maps of this game can be asked for", () => {
  const resources = sanitizeResources(RESOURCES);
  assert.equal(resources.moon, undefined);

  const items = gatherableItems(resources).map(({ item }) => item);
  assert.ok(items.includes("lenha") && items.includes("carvão"));
  assert.ok(!items.includes("cristal"), "no crystals in this mine");

  // Islets count once they are found
  const lenha = (discovered) =>
    gatherableItems(resources, discovered).find((i) => i.item === "lenha");
  assert.equal(lenha([]).where.length, 1);
  assert.equal(lenha(["islet_1"]).where.length, 2);
  assert.match(
    describeGathering(gatherableItems(resources)),
    /Mina do Penhasco \(7 spots\); needs uma picareta/,
  );
});

test("a request to bring things is done only when the player has them", async () => {
  const { session } = await recordingSession(fakeLlm());
  session.regionResources = sanitizeResources(RESOURCES);

  // Something that doesn't exist this game is not an item to bring
  assert.equal(
    session.quests.give(1, { title: "Cristais", item: "cristal", quantity: 3 }),
    null,
  );
  assert.equal(session.player.quests[0].item, null);
  session.player.quests = [];

  session.quests.give(1, { title: "Lenha", item: "lenha", quantity: 9 });
  const quest = session.player.quests[0];
  assert.equal(quest.item, "lenha");
  assert.equal(quest.quantity, 5, "at most 5");

  session.player.addItem("lenha", 2);
  assert.match(
    await session.quests.complete(1, quest.id),
    /doesn't have 5 lenha/,
  );
  session.player.addItem("lenha", 4);
  assert.equal(await session.quests.complete(1, quest.id), null);
  assert.equal(session.player.quantityOf("lenha"), 1, "handed over");
});
