import assert from "node:assert/strict";
import { test } from "node:test";
import { PLACES_BY_ID } from "../src/levels/places.js";
import { createIsland } from "../src/world/island/index.js";
import {
  ZONE_WIDTH,
  activityAt,
  timingResult,
} from "../src/systems/activity.js";

test("stopping the needle in the zone catches something", () => {
  const zoneStart = 0.4;
  assert.equal(timingResult(zoneStart + ZONE_WIDTH / 2, zoneStart), "perfect");
  assert.equal(timingResult(zoneStart + 0.01, zoneStart), "hit");
  assert.equal(timingResult(0.1, zoneStart), "miss");
  assert.equal(timingResult(zoneStart + ZONE_WIDTH + 0.01, zoneStart), "miss");
});

test("fishing at the pier and gathering in the fields", () => {
  createIsland(7);
  assert.equal(activityAt(PLACES_BY_ID.dock), "fishing");
  assert.equal(activityAt(PLACES_BY_ID.north_meadow), "gathering");
  assert.equal(activityAt(PLACES_BY_ID.tavern), null);
});
