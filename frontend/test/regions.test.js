import assert from "node:assert/strict";
import { test } from "node:test";
import {
  REGIONS,
  interiorPoint,
  worldCollisionRows,
} from "../src/levels/world.js";
import { CollisionGrid } from "../src/utils/collisionGrid.js";
import { findShortestPath } from "../src/utils/findShortestPath.js";

const grid = new CollisionGrid(worldCollisionRows(), 12);
const isBlocked = (x, y) => grid.isBlocked(x, y, 16, 12);

// A free position for the hero whose feet are close to (x, y)
const standingSpot = (x, y, distance = 18) => {
  for (let dy = -distance; dy <= distance; dy += 2) {
    for (let dx = -distance; dx <= distance; dx += 2) {
      if (Math.hypot(dx, dy) > distance) continue;
      const spot = { x: x + dx - 8, y: y + dy - 10 };
      if (!isBlocked(spot.x, spot.y)) return spot;
    }
  }
  return null;
};

test("the player can arrive in every region and reach what is there", () => {
  for (const region of REGIONS) {
    const arrival = interiorPoint(region, "arrival");
    assert.equal(
      isBlocked(arrival.x, arrival.y),
      false,
      `${region.id} arrival`,
    );

    for (const [name, point] of Object.entries(region.map.points)) {
      if (
        ![
          "tree",
          "ore",
          "crystal",
          "forage",
          "camp_chest",
          "merchant",
        ].includes(point.kind)
      ) {
        continue;
      }
      const world = interiorPoint(region, name);
      const center =
        point.kind === "tree" ? { x: world.x + 16, y: world.y + 14 } : world;
      const spot = standingSpot(center.x, center.y);
      assert.ok(spot, `${region.id}:${name} has no free spot`);
      assert.ok(
        findShortestPath(arrival, spot, isBlocked),
        `${region.id}:${name} is unreachable`,
      );
    }
  }
});

test("the boat at the village pier can be reached", () => {
  assert.ok(standingSpot(102, 356));
});
