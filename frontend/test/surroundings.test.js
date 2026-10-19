import assert from "node:assert/strict";
import { test } from "node:test";
import { surroundingsAt } from "../src/audio/surroundings.js";
import { REGIONS_BY_ID, interiorPoint } from "../src/levels/world.js";
import { createIsland } from "../src/world/island/index.js";

const island = createIsland(5);

test("the ground under the player changes the footsteps", () => {
  const [c, r] = island.pier.tiles[0];
  const onPier = surroundingsAt(
    { x: c * 12 + 6, y: r * 12 + 6 },
    { island, region: null, interior: null },
  );
  assert.equal(onPier.ground, "wood");
  assert.equal(onPier.nearSea, true);

  const road = [...island.roads][0];
  const onRoad = surroundingsAt(
    { x: (road % 70) * 12 + 6, y: Math.floor(road / 70) * 12 + 6 },
    { island, region: null, interior: null, snow: 1 },
  );
  assert.equal(onRoad.ground, "snow");
});

test("each region has its own place and ground", () => {
  const mine = REGIONS_BY_ID.mine;
  const arrival = interiorPoint(mine, "arrival");
  const inMine = surroundingsAt(arrival, { island, region: mine });
  assert.deepEqual(inMine, { ground: "cave", place: "mine", nearSea: false });

  const town = REGIONS_BY_ID.town;
  const square = interiorPoint(town, "square");
  const inTown = surroundingsAt(square, { island, region: town });
  assert.equal(inTown.ground, "stone");
  assert.equal(inTown.place, "town");
});

test("inside a building the floor of the room counts", () => {
  const interior = { map: { floor: "stone" } };
  assert.equal(
    surroundingsAt({ x: 0, y: 0 }, { island, interior }).ground,
    "stone",
  );
  assert.equal(
    surroundingsAt({ x: 0, y: 0 }, { island, interior }).place,
    "interior",
  );
});
