import assert from "node:assert/strict";
import { test } from "node:test";
import {
  REGIONS,
  applyRegions,
  interiorPoint,
  worldCollisionRows,
} from "../src/levels/world.js";
import { createIsland } from "../src/world/island/index.js";
import { generateRegions } from "../src/world/island/regions.js";
import { CollisionGrid } from "../src/utils/collisionGrid.js";
import { findShortestPath } from "../src/utils/findShortestPath.js";

const SEEDS = Array.from(
  { length: Number(globalThis.process?.env.ISLAND_SEEDS ?? 4) },
  (_, i) => 3 + i * 7919,
);

// Points the player uses (the server knows them by these names)
const USED = [
  "tree",
  "ore",
  "crystal",
  "forage",
  "camp_chest",
  "islet_chest",
  "merchant",
];

test("regions have the size of their place in the world", () => {
  const layouts = generateRegions(11);
  for (const region of REGIONS) {
    assert.equal(layouts[region.id].columns, region.columns, region.id);
    assert.equal(layouts[region.id].rows, region.rows, region.id);
  }
});

test("each region has what the server expects", () => {
  for (const seed of SEEDS) {
    const { forest, mine, town } = generateRegions(seed);
    const count = (layout, kind) =>
      Object.values(layout.points).filter((p) => p.kind === kind).length;

    for (const layout of [forest, mine, town]) {
      assert.ok(layout.points.arrival, `${layout.id} ${seed} arrival`);
      for (const name of Object.keys(layout.points)) {
        const index = name.match(/^(tree|ore|crystal|forage)_(\d+)$/)?.[2];
        if (index) assert.ok(Number(index) < 20, `${name} (MAX_NODE)`);
      }
    }
    assert.ok(count(forest, "tree") >= 8, `trees ${seed}`);
    assert.ok(forest.points.camp && forest.points.camp_chest);
    assert.ok(count(mine, "ore") >= 5, `ore ${seed}`);
    for (const name of ["tools", "buyer", "seeds"]) {
      assert.ok(town.points[`merchant_${name}`], `merchant_${name} ${seed}`);
    }
    assert.ok(town.points.square);
  }
});

test("the same seed makes the same regions", () => {
  const a = generateRegions(42);
  const b = generateRegions(42);
  for (const id of ["forest", "mine", "town"]) {
    assert.deepEqual(a[id].collisions, b[id].collisions);
    assert.deepEqual(a[id].points, b[id].points);
  }
});

const GROWN = { forest: 3, mine: 2, town: 2 };

test("regions grow without changing what was there", () => {
  for (const seed of SEEDS) {
    const before = generateRegions(seed);
    const after = generateRegions(seed, GROWN);
    for (const id of ["forest", "mine", "town"]) {
      for (const [name, point] of Object.entries(before[id].points)) {
        // A new building of the town can take the place of a lamp
        if (point.kind === "lamp") continue;
        assert.deepEqual(after[id].points[name], point, `${id}:${name}`);
      }
    }
    const trees = (l) =>
      Object.values(l.points).filter((p) => p.kind === "tree").length;
    assert.equal(trees(after.forest), trees(before.forest) + 6, `${seed}`);
    assert.ok(after.town.houses.length > before.town.houses.length);
  }
});

const cases = SEEDS.flatMap((seed) => [
  [seed, {}],
  [seed, GROWN],
]);

test("the player can arrive in every region and reach what is there", () => {
  for (const [seed, levels] of cases) {
    createIsland(seed);
    applyRegions(generateRegions(seed, levels));
    const grid = new CollisionGrid(worldCollisionRows(), 12);
    const isBlocked = (x, y) => grid.isBlocked(x, y, 16, 12);

    // Free positions for the hero whose feet are close to (x, y), nearest
    // first
    const standingSpots = (x, y, distance = 18) => {
      const spots = [];
      for (let dy = -distance; dy <= distance; dy++) {
        for (let dx = -distance; dx <= distance; dx++) {
          if (Math.hypot(dx, dy) > distance) continue;
          const spot = { x: x + dx - 8, y: y + dy - 10 };
          if (!isBlocked(spot.x, spot.y))
            spots.push([Math.hypot(dx, dy), spot]);
        }
      }
      return spots.sort((a, b) => a[0] - b[0]).map(([, spot]) => spot);
    };

    for (const region of REGIONS) {
      const arrival = interiorPoint(region, "arrival");
      assert.equal(
        isBlocked(arrival.x, arrival.y),
        false,
        `${region.id} ${seed} arrival`,
      );

      for (const [name, point] of Object.entries(region.map.points)) {
        if (!USED.includes(point.kind)) continue;
        const world = interiorPoint(region, name);
        const center =
          point.kind === "merchant"
            ? { x: world.x + 8, y: world.y + 10 }
            : world;
        const spots = standingSpots(center.x, center.y);
        assert.ok(spots.length, `${region.id}:${name} (${seed}) has no spot`);
        assert.ok(
          spots.some((spot) => findShortestPath(arrival, spot, isBlocked)),
          `${region.id}:${name} (${seed}) is unreachable`,
        );
      }
    }
  }
});
