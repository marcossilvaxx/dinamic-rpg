import assert from "node:assert/strict";
import { test } from "node:test";
import { mapCollisions } from "../src/levels/map.js";
import { retangularCollision } from "../src/utils/collision.js";
import { CollisionGrid } from "../src/utils/collisionGrid.js";
import { findShortestPath } from "../src/utils/findShortestPath.js";

const TILE = 12;
const COLUMNS = 70;
const rows = [];
for (let i = 0; i < mapCollisions.length; i += COLUMNS) {
  rows.push(mapCollisions.slice(i, i + COLUMNS));
}

const grid = new CollisionGrid(rows, TILE);
const W = 16;
const H = 12;
const isBlocked = (x, y) => grid.isBlocked(x, y, W, H);

test("grid lookup matches the per-block rectangle collision", () => {
  const blocks = [];
  rows.forEach((row, y) =>
    row.forEach((tile, x) => {
      if (tile !== 0) {
        blocks.push({
          position: { x: x * TILE, y: y * TILE },
          width: TILE,
          height: TILE,
        });
      }
    }),
  );

  for (let i = 0; i < 5000; i++) {
    const x = Math.floor(Math.random() * (grid.width - W));
    const y = Math.floor(Math.random() * (grid.height - H));
    const expected = blocks.some((block) =>
      retangularCollision(block, { position: { x, y }, width: W, height: H }),
    );

    assert.equal(grid.isBlocked(x, y, W, H), expected, `at ${x},${y}`);
  }
});

test("positions outside the map are blocked", () => {
  assert.equal(grid.isBlocked(-1, 100, W, H), true);
  assert.equal(grid.isBlocked(grid.width - W + 1, 100, W, H), true);
});

test("hero and NPC spawn points are free", () => {
  assert.equal(isBlocked(424, 225), false);
  assert.equal(isBlocked(424, 355), false);
});

test("finds a valid, contiguous path between spawn points", () => {
  const start = { x: 424, y: 355 };
  const end = { x: 424, y: 225 };

  const path = findShortestPath(start, end, isBlocked);

  assert.ok(path, "path should exist");
  assert.deepEqual(path[0], start);
  assert.deepEqual(path.at(-1), end);
  for (let i = 1; i < path.length; i++) {
    const step =
      Math.abs(path[i].x - path[i - 1].x) + Math.abs(path[i].y - path[i - 1].y);
    assert.equal(step, 1);
    assert.equal(isBlocked(path[i].x, path[i].y), false);
  }
  // Manhattan distance is a lower bound of the shortest path
  assert.ok(path.length - 1 >= 130);
});

test("returns null for blocked or unreachable targets", () => {
  assert.equal(
    findShortestPath({ x: 424, y: 355 }, { x: 0, y: 0 }, isBlocked),
    null,
  );

  // A target enclosed by walls is unreachable
  const box = new CollisionGrid(
    [
      [0, 0, 0, 0, 0],
      [0, 1, 1, 1, 0],
      [0, 1, 0, 1, 0],
      [0, 1, 1, 1, 0],
      [0, 0, 0, 0, 0],
    ],
    1,
  );
  assert.equal(
    findShortestPath({ x: 0, y: 0 }, { x: 2, y: 2 }, (x, y) =>
      box.isBlocked(x, y, 1, 1),
    ),
    null,
  );
});
