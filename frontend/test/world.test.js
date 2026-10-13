import assert from "node:assert/strict";
import { test } from "node:test";
import {
  birdsLand,
  campfireLit,
  chickensRest,
  cropLook,
  festivalDecorUp,
  fireflyTime,
  lampsLit,
  smokeRate,
  windmillSpeed,
  windowsLit,
} from "../src/world/rules.js";

test("windows are lit in the evening and dark while people sleep", () => {
  assert.equal(windowsLit("west_house", 19), true);
  assert.equal(windowsLit("west_house", 2), false);
  assert.equal(windowsLit("west_house", 12), false);
  assert.equal(windowsLit("tavern", 23.5), true, "the tavern closes late");
});

test("lamps, campfire and fireflies come out at night", () => {
  assert.equal(lampsLit(0.5), true);
  assert.equal(lampsLit(0), false);
  assert.equal(campfireLit(20, "clear"), true);
  assert.equal(campfireLit(20, "rain"), false);
  assert.equal(fireflyTime("summer", 22, "clear"), true);
  assert.equal(fireflyTime("winter", 22, "clear"), false);
});

test("chimneys smoke more at meal times and in the winter", () => {
  assert.equal(smokeRate("west_house", 2, "spring"), 0, "asleep");
  assert.ok(
    smokeRate("west_house", 12, "spring") >
      smokeRate("west_house", 15, "spring"),
  );
  assert.ok(
    smokeRate("west_house", 15, "winter") >
      smokeRate("west_house", 15, "summer"),
  );
});

test("the wind moves the windmill", () => {
  assert.ok(windmillSpeed("storm") > windmillSpeed("clear"));
  assert.ok(windmillSpeed("fog") < windmillSpeed("clear"));
});

test("animals follow the time and the weather", () => {
  assert.equal(birdsLand(10, "clear"), true);
  assert.equal(birdsLand(10, "rain"), false);
  assert.equal(chickensRest(22, "clear"), true);
  assert.equal(chickensRest(10, "storm"), true);
  assert.equal(chickensRest(10, "clear"), false);
});

test("festival decoration is up on its day", () => {
  const festival = { day: 2, status: "announced" };
  assert.equal(festivalDecorUp(festival, 2), true);
  assert.equal(festivalDecorUp(festival, 3), false);
  assert.equal(festivalDecorUp({ ...festival, status: "over" }, 2), false);
  assert.equal(festivalDecorUp(null, 2), false);
});

test("crops grow and show their fruit when ripe", () => {
  assert.equal(cropLook("cenoura", 1).fruit, null);
  assert.ok(cropLook("cenoura", 4).fruit);
  assert.ok(cropLook("trigo", 4).height > cropLook("trigo", 1).height);
});
