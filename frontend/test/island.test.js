import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BLOCKING_PROPS,
  BUILDINGS,
  BUSHES,
  CHICKEN_YARDS,
  FARM_PLOTS,
  LOTS,
  STRUCTURE_SPOTS,
  VILLAGE_BOAT,
} from "../src/levels/decor.js";
import { PLACES, PLACES_BY_ID } from "../src/levels/places.js";
import { VILLAGE } from "../src/levels/world.js";
import { CollisionGrid } from "../src/utils/collisionGrid.js";
import { findShortestPath } from "../src/utils/findShortestPath.js";
import { applyIsland } from "../src/world/island/index.js";
import { generateIsland } from "../src/world/island/layout.js";

const SEEDS = globalThis.process?.env.ISLAND_SEEDS
  ? Array.from(
      { length: Number(globalThis.process?.env.ISLAND_SEEDS) },
      (_, i) => i * 7919 + 3,
    )
  : [1, 7, 42, 977, 2024, 31337, 123456, 999999];

const gridOf = (collisions) => {
  const rows = [];
  for (let i = 0; i < collisions.length; i += VILLAGE.width) {
    rows.push(collisions.slice(i, i + VILLAGE.width));
  }
  return new CollisionGrid(rows, 12);
};

for (const seed of SEEDS) {
  test(`island ${seed}: the same seed makes the same island`, () => {
    const a = generateIsland(seed);
    const b = generateIsland(seed);
    assert.deepEqual(a.collisions, b.collisions);
    assert.deepEqual(a.places, b.places);
  });

  test(`island ${seed}: places, props and doors can be reached`, () => {
    applyIsland(generateIsland(seed));
    const map = gridOf(VILLAGE.collisions);

    // Props stand on free tiles
    for (const prop of BLOCKING_PROPS) {
      for (const [column, row] of prop.tiles) {
        assert.equal(
          map.rows[row][column],
          0,
          `${prop.kind} at ${column},${row}`,
        );
      }
    }

    const world = gridOf(VILLAGE.collisions);
    world.block(BLOCKING_PROPS.flatMap((prop) => prop.tiles));
    const isBlocked = (x, y) => world.isBlocked(x, y, 16, 12);
    const dock = PLACES_BY_ID.dock;

    for (const id of [
      "tavern",
      "west_house",
      "east_house",
      "garden",
      "dock",
      "south_road",
      "north_meadow",
      "east_meadow",
    ]) {
      const place = PLACES_BY_ID[id];
      assert.ok(place, `no ${id}`);
      assert.equal(isBlocked(place.x, place.y), false, `${id} is blocked`);
      assert.ok(findShortestPath(dock, place, isBlocked), `${id} unreachable`);
      assert.equal(STRUCTURE_SPOTS[id].length, 3);
    }

    // Outside of each door
    for (const { door, placeId } of BUILDINGS) {
      assert.equal(isBlocked(door.x - 8, door.y + 4), false, `${placeId} door`);
    }

    // The boat at the pier
    const boat = { x: VILLAGE_BOAT.x - 8, y: VILLAGE_BOAT.y - 10 };
    assert.ok(findShortestPath(dock, boat, isBlocked), "boat unreachable");

    // Lots are free for a house and their door can be reached
    for (const lot of LOTS) {
      for (let r = lot.row; r < lot.row + 8; r++) {
        for (let c = lot.column; c < lot.column + 6; c++) {
          assert.equal(world.rows[r][c], 0, `${lot.id} ${c},${r}`);
        }
      }
      const front = { x: (lot.column + 2) * 12, y: (lot.row + 8) * 12 };
      assert.ok(findShortestPath(dock, front, isBlocked), `${lot.id} door`);
    }

    // Walkable things
    for (const { x, y } of [
      ...BUSHES,
      ...CHICKEN_YARDS,
      ...FARM_PLOTS.map((p) => ({ x: p.x + 12, y: p.y + 6 })),
    ]) {
      assert.equal(map.isBlocked(x - 4, y - 4, 8, 8), false, `${x},${y}`);
    }
    assert.equal(FARM_PLOTS.length, 9);
    assert.equal(LOTS.length, 4);
    assert.ok(PLACES.length >= 8);
  });
}
