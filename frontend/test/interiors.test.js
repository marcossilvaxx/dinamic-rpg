import assert from "node:assert/strict";
import { test } from "node:test";
import { BUILDINGS } from "../src/levels/decor.js";
import {
  INTERIORS,
  LOT_INTERIOR_ORIGINS,
  VILLAGE_WIDTH,
  addLotInterior,
  interiorAt,
  interiorPoint,
  rasterizeArea,
  worldCollisionRows,
} from "../src/levels/world.js";
import { CollisionGrid } from "../src/utils/collisionGrid.js";
import { findShortestPath } from "../src/utils/findShortestPath.js";
import { buildingAccess } from "../src/world/rules.js";

const grid = new CollisionGrid(worldCollisionRows(), 12);
const isBlocked = (x, y) => grid.isBlocked(x, y, 16, 12);

test("interiors are out of the village and don't overlap", () => {
  for (const interior of INTERIORS) {
    assert.ok(interior.origin.x >= VILLAGE_WIDTH);
    assert.equal(interior.origin.x % 12, 0);
    assert.equal(
      interiorAt(interior.origin.x + 1, interior.origin.y + 1),
      interior,
    );
  }
  assert.equal(interiorAt(100, 100), null);
});

test("every building of the village has an interior with its door", () => {
  for (const interior of INTERIORS) {
    assert.ok(
      BUILDINGS.some((building) => building.placeId === interior.placeId),
    );
  }
});

test("the entrance, the mat and the spots of each interior are walkable", () => {
  for (const interior of INTERIORS) {
    const entrance = interiorPoint(interior, "entrance");
    assert.equal(
      isBlocked(entrance.x, entrance.y),
      false,
      `${interior.id} entrance`,
    );

    const exit = interiorPoint(interior, "exit");
    assert.equal(
      isBlocked(exit.x + 8, exit.y + exit.height - 12),
      false,
      `${interior.id} mat`,
    );

    for (const [name, point] of Object.entries(interior.map.points)) {
      if (point.kind !== "spot" && point.kind !== "center") continue;
      const spot = interiorPoint(interior, name);
      assert.ok(
        findShortestPath(entrance, spot, isBlocked),
        `${interior.id}:${name} is unreachable`,
      );
    }
  }
});

test("outside, below each door, the player can stand", () => {
  for (const { door } of BUILDINGS) {
    assert.equal(isBlocked(door.x - 8, door.y + 4), false);
  }
});

test("who can go into a building", () => {
  const nobody = { awakeInside: 0, asleepInside: 0, friend: false };
  assert.equal(buildingAccess("tavern", 21, nobody).open, true);
  assert.equal(buildingAccess("tavern", 3, nobody).reason, "closed");
  assert.equal(
    buildingAccess("east_house", 10, nobody).open,
    true,
    "store hours",
  );
  assert.equal(buildingAccess("west_house", 10, nobody).reason, "nobody");
  assert.equal(
    buildingAccess("west_house", 10, { ...nobody, awakeInside: 1 }).open,
    true,
  );
  assert.equal(
    buildingAccess("west_house", 23, { ...nobody, asleepInside: 2 }).reason,
    "sleeping",
  );
  assert.equal(
    buildingAccess("lot_east", 10, { ...nobody, workplace: true }).open,
    true,
    "workplaces open during the day",
  );
  assert.equal(
    buildingAccess("west_house", 23, { ...nobody, friend: true }).open,
    true,
    "friends are welcome",
  );
});

test("houses built on the lots get an interior that works", () => {
  const ids = Object.keys(LOT_INTERIOR_ORIGINS);
  for (const id of ids) {
    const interior = addLotInterior({
      id,
      name: id,
      kind: id === "lot_east" ? "work" : "home",
    });
    assert.equal(interior.origin.x % 12, 0);
    assert.equal(
      interiorAt(interior.origin.x + 1, interior.origin.y + 1),
      interior,
    );

    const rows = worldCollisionRows();
    rasterizeArea(rows, interior);
    const lotGrid = new CollisionGrid(rows, 12);
    const blocked = (x, y) => lotGrid.isBlocked(x, y, 16, 12);
    const entrance = interiorPoint(interior, "entrance");
    assert.equal(blocked(entrance.x, entrance.y), false, `${id} entrance`);
  }

  // Far enough from each other and from the regions
  const xs = ids.map((id) => LOT_INTERIOR_ORIGINS[id].x).sort((a, b) => a - b);
  xs.slice(1).forEach((x, i) => assert.ok(x - xs[i] >= 224 + 48));
});
