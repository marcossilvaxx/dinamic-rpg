import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BLOCKING_PROPS,
  BUSHES,
  CHICKEN_YARDS,
  FARM_PLOTS,
  HOUSE_PREFAB,
  LOTS,
  STRUCTURE_SPOTS,
  lotPlace,
} from "../src/levels/decor.js";
import { MAPS } from "../src/levels/maps.js";

const mapCollisions = MAPS.village.collisions;
import { PLACES } from "../src/levels/places.js";
import { CollisionGrid } from "../src/utils/collisionGrid.js";
import { findShortestPath } from "../src/utils/findShortestPath.js";

const rows = [];
for (let i = 0; i < mapCollisions.length; i += 70) {
  rows.push(mapCollisions.slice(i, i + 70));
}
const map = new CollisionGrid(rows, 12);
const withProps = new CollisionGrid(rows, 12);
withProps.block(BLOCKING_PROPS.flatMap((prop) => prop.tiles));

test("props stand on free tiles of the map", () => {
  for (const prop of BLOCKING_PROPS) {
    for (const [column, row] of prop.tiles) {
      assert.equal(
        map.rows[row][column],
        0,
        `${prop.kind} at ${column},${row}`,
      );
    }
  }
});

test("places stay free and reachable with the props", () => {
  const isBlocked = (x, y) => withProps.isBlocked(x, y, 16, 12);

  for (const place of PLACES) {
    assert.equal(isBlocked(place.x, place.y), false, `${place.id} is blocked`);
    assert.ok(
      findShortestPath({ x: 424, y: 355 }, place, isBlocked),
      `${place.id} is unreachable`,
    );
  }
});

test("spots, bushes, yards and plots are walkable", () => {
  const spots = [
    ...Object.values(STRUCTURE_SPOTS).flat(),
    ...BUSHES,
    ...CHICKEN_YARDS,
    ...FARM_PLOTS.map(({ x, y }) => ({ x: x + 12, y: y + 6 })),
  ];

  for (const { x, y } of spots) {
    assert.equal(withProps.isBlocked(x - 4, y - 4, 8, 8), false, `${x},${y}`);
  }

  for (const place of PLACES) {
    assert.ok(STRUCTURE_SPOTS[place.id], `no spots for ${place.id}`);
  }
});

test("the lots are free for a house and don't cover any prop or spot", () => {
  const { columns, rows: height } = HOUSE_PREFAB;

  for (const lot of LOTS) {
    for (let r = lot.row; r < lot.row + height; r++) {
      for (let c = lot.column; c < lot.column + columns; c++) {
        assert.equal(withProps.rows[r][c], 0, `${lot.id} ${c},${r}`);
      }
    }

    const inside = ({ x, y }) =>
      x >= lot.column * 12 - 4 &&
      x < (lot.column + columns) * 12 + 4 &&
      y >= lot.row * 12 - 4 &&
      y < (lot.row + height) * 12 + 4;
    const spots = [
      ...Object.values(STRUCTURE_SPOTS).flat(),
      ...BUSHES,
      ...CHICKEN_YARDS,
      ...PLACES,
    ];
    for (const spot of spots) {
      assert.equal(inside(spot), false, `${lot.id} covers ${spot.x},${spot.y}`);
    }

    // The place at the door can be reached once the house is built
    const built = new CollisionGrid(withProps.rows, 12);
    built.block(
      Array.from({ length: 20 }, (_, i) => [
        lot.column + 1 + (i % 4),
        lot.row + 2 + Math.floor(i / 4),
      ]),
    );
    const place = lotPlace(lot);
    const isBlocked = (x, y) => built.isBlocked(x, y, 16, 12);
    assert.equal(isBlocked(place.x, place.y), false, `${lot.id} door`);
    assert.ok(
      findShortestPath({ x: 424, y: 355 }, place, isBlocked),
      `${lot.id} unreachable`,
    );
  }
});
