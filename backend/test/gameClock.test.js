import assert from "node:assert/strict";
import { test } from "node:test";
import { GameClock, periodOf } from "../game/GameClock.js";
import { isSleepTime, needsAt } from "../game/needs.js";

test("game time advances with real time and pauses", () => {
  let now = 0;
  const clock = new GameClock({
    startMinutes: 8 * 60,
    msPerGameMinute: 1000,
    now: () => now,
  });

  now = 90 * 1000;
  assert.equal(clock.format(), "09:30");
  assert.equal(clock.period, "morning");

  clock.pause();
  now = 500 * 1000;
  assert.equal(clock.format(), "09:30");

  clock.resume();
  now = 501 * 1000;
  assert.equal(clock.format(), "09:31");

  now += 24 * 60 * 1000;
  assert.equal(clock.day, 2);
});

test("periods, sleep and meals follow the hour", () => {
  assert.equal(periodOf(23), "night");
  assert.equal(periodOf(19), "evening");
  assert.ok(isSleepTime(2));
  assert.ok(!isSleepTime(8));
  assert.match(needsAt(12).hunger, /hungry/);
  assert.equal(needsAt(15).energy, "rested");
});
