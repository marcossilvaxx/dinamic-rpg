import assert from "node:assert/strict";
import { test } from "node:test";
import { mapCollisions } from "../src/levels/map.js";
import { PLACES, nearestPlace } from "../src/levels/places.js";
import { CollisionGrid } from "../src/utils/collisionGrid.js";
import { findShortestPath } from "../src/utils/findShortestPath.js";

const rows = [];
for (let i = 0; i < mapCollisions.length; i += 70) {
  rows.push(mapCollisions.slice(i, i + 70));
}
const grid = new CollisionGrid(rows, 12);
const isBlocked = (x, y) => grid.isBlocked(x, y, 16, 12);

test("every place is free and reachable from the NPC spawn", () => {
  for (const place of PLACES) {
    assert.equal(isBlocked(place.x, place.y), false, `${place.id} is blocked`);
    assert.ok(
      findShortestPath({ x: 424, y: 355 }, place, isBlocked),
      `${place.id} is unreachable`,
    );
  }
});

test("place ids are valid for the server", () => {
  for (const place of PLACES) {
    assert.match(place.id, /^[a-z_]{1,30}$/);
    assert.ok(place.name.length <= 40);
    assert.ok(place.description.length <= 200);
  }
});

test("nearestPlace respects the max distance", () => {
  assert.equal(nearestPlace({ x: 500, y: 160 }).id, "tavern");
  assert.equal(nearestPlace({ x: 500, y: 160 }, 5), null);
});
