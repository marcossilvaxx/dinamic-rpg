import assert from "node:assert/strict";
import { test } from "node:test";
import { fallenTreeSpots } from "../src/world/island/eventSpots.js";
import { generateIsland } from "../src/world/island/layout.js";

test("every island has roads where a storm can knock a tree down", () => {
  for (const seed of [1, 7, 42, 1234, 99991]) {
    const island = generateIsland(seed);
    const spots = fallenTreeSpots(island);
    assert.ok(spots.length >= 2, `seed ${seed}: ${spots.length} spots`);
    for (const { c, r } of spots) {
      assert.ok(
        island.roads.has(r * 70 + c) && island.roads.has(r * 70 + c + 1),
      );
    }
  }
});
