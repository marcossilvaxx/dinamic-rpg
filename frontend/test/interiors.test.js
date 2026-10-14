import assert from "node:assert/strict";
import { test } from "node:test";
import {
  BUILDING_INTERIOR_ORIGINS,
  INTERIORS,
  LOT_INTERIOR_ORIGINS,
  VILLAGE_WIDTH,
  addInterior,
  interiorAt,
  interiorPoint,
  rasterizeArea,
  worldCollisionRows,
} from "../src/levels/world.js";
import { CollisionGrid } from "../src/utils/collisionGrid.js";
import { findShortestPath } from "../src/utils/findShortestPath.js";
import {
  ROOM_PRESETS,
  roomFor,
  roomMap,
} from "../src/world/procedural/rooms.js";
import { buildingAccess } from "../src/world/rules.js";

const IDS = [
  ...Object.keys(BUILDING_INTERIOR_ORIGINS),
  ...Object.keys(LOT_INTERIOR_ORIGINS),
];

test("interiors are out of the village, apart from each other", () => {
  const origins = IDS.map(
    (id) => BUILDING_INTERIOR_ORIGINS[id] ?? LOT_INTERIOR_ORIGINS[id],
  );
  for (const origin of origins) {
    assert.ok(origin.x >= VILLAGE_WIDTH);
    assert.equal(origin.x % 12, 0);
  }
  const xs = origins.map(({ x }) => x).sort((a, b) => a - b);
  xs.slice(1).forEach((x, i) =>
    assert.ok(x - xs[i] >= 224, `${xs[i]} -> ${x}`),
  );
});

test("in every generated room the player reaches the mat and every spot (counter, bed...)", () => {
  const trades = Object.keys(ROOM_PRESETS);
  for (let seed = 1; seed <= 12; seed++) {
    INTERIORS.length = 0;
    IDS.forEach((id, i) =>
      addInterior(
        { id, name: id },
        {
          map: roomMap(
            roomFor(trades[(i + seed) % trades.length], seed * 31 + i),
          ),
        },
      ),
    );
    const rows = worldCollisionRows();
    INTERIORS.forEach((interior) => rasterizeArea(rows, interior));
    const grid = new CollisionGrid(rows, 12);
    const isBlocked = (x, y) => grid.isBlocked(x, y, 16, 12);

    for (const interior of INTERIORS) {
      assert.equal(
        interiorAt(interior.origin.x + 1, interior.origin.y + 1),
        interior,
      );
      const entrance = interiorPoint(interior, "entrance");
      assert.equal(
        isBlocked(entrance.x, entrance.y),
        false,
        `${interior.id} entrance`,
      );

      const exit = interiorPoint(interior, "exit");
      assert.ok(
        findShortestPath(entrance, { x: exit.x + 8, y: exit.y }, isBlocked),
        `${interior.id} mat`,
      );

      for (const [name, point] of Object.entries(interior.map.points)) {
        if (!["spot", "center"].includes(point.kind)) continue;
        const target = interiorPoint(interior, name);
        const stand = target;
        assert.ok(
          findShortestPath(entrance, stand, isBlocked),
          `seed ${seed} ${interior.id}:${name}`,
        );
      }
    }
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
  );
  assert.equal(
    buildingAccess("west_house", 23, { ...nobody, friend: true }).open,
    true,
  );
});
