import assert from "node:assert/strict";
import { test } from "node:test";
import {
  encounterChance,
  lineDuration,
  pairKey,
  selectEncounter,
} from "../src/systems/encounters.js";

const options = (overrides = {}) => ({
  distance: 36,
  chance: 1,
  cooldowns: new Map(),
  pairCooldowns: new Map(),
  random: () => 0,
  ...overrides,
});

const npcs = [
  { id: 1, x: 0, y: 0 },
  { id: 2, x: 30, y: 0 },
  { id: 3, x: 300, y: 300 },
];

test("selects the first pair of close NPCs", () => {
  assert.deepEqual(selectEncounter(npcs, 0, options()), [1, 2]);
});

test("ignores NPCs that are far away", () => {
  assert.equal(selectEncounter([npcs[0], npcs[2]], 0, options()), null);
});

test("respects NPC and pair cooldowns", () => {
  assert.equal(
    selectEncounter(npcs, 100, options({ cooldowns: new Map([[2, 200]]) })),
    null,
  );
  assert.deepEqual(
    selectEncounter(npcs, 200, options({ cooldowns: new Map([[2, 200]]) })),
    [1, 2],
  );
  assert.equal(
    selectEncounter(
      npcs,
      100,
      options({ pairCooldowns: new Map([[pairKey(2, 1), 500]]) }),
    ),
    null,
  );
});

test("uses the chance to start a conversation", () => {
  assert.equal(
    selectEncounter(npcs, 0, options({ chance: 0.3, random: () => 0.5 })),
    null,
  );
  assert.deepEqual(
    selectEncounter(npcs, 0, options({ chance: 0.3, random: () => 0.1 })),
    [1, 2],
  );
});

test("line duration grows with the text and is bounded", () => {
  assert.equal(lineDuration("Oi"), 2000);
  assert.ok(lineDuration("uma frase com algumas palavras a mais aqui") > 2000);
  assert.equal(lineDuration("palavra ".repeat(100)), 7000);
});

test("friends meet more often and enemies always react", () => {
  assert.equal(encounterChance(0, 0.3), 0.3);
  assert.equal(encounterChance(6, 0.3), 0.6);
  assert.equal(encounterChance(6, 0.8), 1);
  assert.equal(encounterChance(-7, 0.3), 1);
});

test("uses the chance of each pair", () => {
  assert.deepEqual(
    selectEncounter(
      npcs,
      0,
      options({ chance: 0, chanceOf: () => 1, random: () => 0.5 }),
    ),
    [1, 2],
  );
});
