import assert from "node:assert/strict";
import { test } from "node:test";
import { PLACES, PLACES_BY_ID, nearestPlace } from "../src/levels/places.js";
import { createIsland } from "../src/world/island/index.js";

createIsland(42);

test("place ids are valid for the server", () => {
  for (const place of PLACES) {
    assert.match(place.id, /^[a-z_]{1,30}$/);
    assert.ok(place.name.length <= 40);
    assert.ok(place.description.length <= 200);
  }
});

test("nearestPlace respects the max distance", () => {
  const tavern = PLACES_BY_ID.tavern;
  assert.equal(nearestPlace({ x: tavern.x + 2, y: tavern.y + 2 }).id, "tavern");
  assert.equal(nearestPlace({ x: tavern.x + 50, y: tavern.y + 50 }, 5), null);
});
