import assert from "node:assert/strict";
import { test } from "node:test";
import {
  formatTime,
  isFestivalTime,
  lightingAt,
  scheduleFor,
} from "../src/systems/time.js";

const npc = (id) => ({ id, routine: ["dock", "garden"] });

test("NPCs sleep at home at night", () => {
  assert.deepEqual(scheduleFor(2, npc(1)), {
    placeId: "dock",
    sleeping: true,
    reason: "sleep",
  });
  assert.equal(scheduleFor(23, npc(2)).sleeping, true);
});

test("NPCs eat at the tavern at meal times", () => {
  assert.equal(scheduleFor(12, npc(2)).placeId, "tavern");
  assert.equal(scheduleFor(12, npc(2), false).placeId, null);
});

test("in the evening half of the village goes to the tavern", () => {
  assert.equal(scheduleFor(21, npc(1)).placeId, "tavern");
  assert.equal(scheduleFor(21, npc(2)).placeId, "dock");
});

test("during the day NPCs follow their routine", () => {
  assert.deepEqual(scheduleFor(10, npc(1)), {
    placeId: null,
    sleeping: false,
    reason: null,
  });
});

const festival = { day: 2, startHour: 17, endHour: 19, placeId: "garden" };

test("everybody goes to the gathering of the day", () => {
  assert.ok(isFestivalTime(festival, 2, 17));
  assert.ok(!isFestivalTime(festival, 2, 19));
  assert.ok(!isFestivalTime(festival, 1, 18), "other day");

  const world = { festival, day: 2, weather: "rain" };
  assert.equal(scheduleFor(18, npc(2), true, world).placeId, "garden");
  assert.equal(scheduleFor(23, npc(2), true, world).reason, "sleep");
});

test("in the rain NPCs go to shelter", () => {
  const rain = { weather: "rain" };
  assert.equal(scheduleFor(10, npc(1), true, rain).placeId, "tavern");
  assert.equal(scheduleFor(10, npc(2), true, rain).placeId, "dock");
  assert.equal(scheduleFor(10, npc(1), false, rain).placeId, "dock");
  assert.equal(scheduleFor(10, npc(1), true, { weather: "fog" }).placeId, null);
  assert.equal(
    scheduleFor(10, npc(2), true, { weather: "snow" }).reason,
    "shelter",
  );
});

test("it is dark at night and clear at noon", () => {
  assert.ok(lightingAt(2 * 60).alpha >= 0.45);
  assert.equal(lightingAt(12 * 60).alpha, 0);
  const dusk = lightingAt(19 * 60);
  assert.ok(dusk.alpha > 0 && dusk.alpha < 0.45);
  assert.equal(lightingAt(24 * 60 + 12 * 60).alpha, 0, "wraps around");
});

test("formats the time of the day", () => {
  assert.equal(formatTime(8 * 60 + 5), "08:05");
});

test("everybody hides from the bandits", () => {
  const raid = { placeId: "east_meadow" };
  assert.equal(scheduleFor(15, npc(1), true, { raid }).reason, "raid");
  assert.equal(scheduleFor(15, npc(2), true, { raid }).placeId, "dock");
});
