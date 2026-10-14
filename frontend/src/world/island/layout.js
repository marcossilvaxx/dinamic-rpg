// Layout of a generated island (no drawing, so it can be tested with node):
// the shape of the island, the garden in the middle, the buildings around
// it, the pier, the roads between the doors, the farm with its windmill,
// fences and vegetable gardens, trees, the props of the map, the places
// (for routines and prompts) and the collisions. Everything comes from a
// seed, so a saved game always gets the same island back.

import { houseFootprint, houseFor } from "../procedural/houses.js";
import { seeded } from "../procedural/pixel.js";
import { valueNoise } from "./noise.js";

export const COLUMNS = 70;
export const ROWS = 40;
export const TILE = 12;

const index = (column, row) => row * COLUMNS + column;
const inside = (column, row) =>
  column >= 0 && row >= 0 && column < COLUMNS && row < ROWS;
const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

// ---------------------------------------------------------------------------
// Shape

function islandShape(seed) {
  const noise = valueNoise(seed);
  const land = new Uint8Array(COLUMNS * ROWS);

  for (let row = 0; row < ROWS; row++) {
    for (let column = 0; column < COLUMNS; column++) {
      if (column < 2 || column > 67 || row < 1 || row > 36) continue;
      const nx = (column - 34.5) / 33;
      const ny = (row - 19) / 18;
      const value =
        1 -
        Math.hypot(nx, ny) +
        (noise(column * 0.11, row * 0.11, 3) - 0.5) * 0.7;
      if (value > 0.04) land[index(column, row)] = 1;
    }
  }

  // Keep the biggest piece of land, and fill the lakes inside it
  const component = (value, start, seen) => {
    const tiles = [start];
    seen[start] = 1;
    for (let i = 0; i < tiles.length; i++) {
      const column = tiles[i] % COLUMNS;
      const row = Math.floor(tiles[i] / COLUMNS);
      for (const [dc, dr] of NEIGHBORS) {
        const [c, r] = [column + dc, row + dr];
        if (!inside(c, r)) continue;
        const next = index(c, r);
        if (!seen[next] && land[next] === value) {
          seen[next] = 1;
          tiles.push(next);
        }
      }
    }
    return tiles;
  };

  let seen = new Uint8Array(COLUMNS * ROWS);
  let biggest = [];
  for (let i = 0; i < land.length; i++) {
    if (land[i] && !seen[i]) {
      const tiles = component(1, i, seen);
      if (tiles.length > biggest.length) biggest = tiles;
    }
  }
  land.fill(0);
  biggest.forEach((i) => (land[i] = 1));

  seen = new Uint8Array(COLUMNS * ROWS);
  const sea = component(0, 0, seen);
  const isSea = new Uint8Array(COLUMNS * ROWS);
  sea.forEach((i) => (isSea[i] = 1));
  for (let i = 0; i < land.length; i++) if (!isSea[i]) land[i] = 1;

  return land;
}

// ---------------------------------------------------------------------------

/** A* on the tiles (4 directions) with a cost per tile (Infinity blocks). */
function findRoute(start, goal, cost) {
  const key = ([c, r]) => index(c, r);
  const open = new Map([[key(start), { tile: start, g: 0, f: 0 }]]);
  const came = new Map();
  const best = new Map([[key(start), 0]]);
  const h = ([c, r]) => Math.abs(c - goal[0]) + Math.abs(r - goal[1]);

  while (open.size) {
    let current = null;
    for (const node of open.values())
      if (!current || node.f < current.f) current = node;
    open.delete(key(current.tile));

    if (current.tile[0] === goal[0] && current.tile[1] === goal[1]) {
      const path = [current.tile];
      let k = key(current.tile);
      while (came.has(k)) {
        const previous = came.get(k);
        path.unshift(previous);
        k = key(previous);
      }
      return path;
    }

    for (const [dc, dr] of NEIGHBORS) {
      const tile = [current.tile[0] + dc, current.tile[1] + dr];
      if (!inside(...tile)) continue;
      const step = cost(...tile);
      if (!Number.isFinite(step)) continue;
      const g = current.g + step;
      const k = key(tile);
      if (g < (best.get(k) ?? Infinity)) {
        best.set(k, g);
        came.set(k, current.tile);
        open.set(k, { tile, g, f: g + h(tile) });
      }
    }
  }

  return null;
}

const DIRECTIONS_PT = {
  north: "norte",
  south: "sul",
  east: "leste",
  west: "oeste",
};

/** Main direction of a tile seen from the middle of the island. */
const directionOf = (column, row, center) => {
  const dx = column - center[0];
  const dy = (row - center[1]) * 1.6;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "east" : "west";
  return dy > 0 ? "south" : "north";
};

/**
 * @param {number} seed
 * @returns {object} The layout (see the return at the end).
 */
export function generateIsland(seed) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const layout = tryIsland(seed + attempt * 7919, seed);
    if (layout) return layout;
  }
  throw new Error(`No island could be made from seed ${seed}`);
}

function tryIsland(shapeSeed, seed) {
  const random = seeded(shapeSeed);
  const land = islandShape(shapeSeed);
  const landCount = land.reduce((sum, value) => sum + value, 0);
  if (landCount < 1400) return null;

  const isLand = (c, r) => inside(c, r) && land[index(c, r)] === 1;
  const edge = new Uint8Array(COLUMNS * ROWS);
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLUMNS; c++) {
      if (
        isLand(c, r) &&
        NEIGHBORS.some(([dc, dr]) => !isLand(c + dc, r + dr))
      ) {
        edge[index(c, r)] = 1;
      }
    }
  }
  // Land far from the water (two tiles), where things can be built
  const inner = (c, r) =>
    isLand(c, r) &&
    !edge[index(c, r)] &&
    NEIGHBORS.every(
      ([dc, dr]) => !edge[index(c + dc, r + dr)] || !inside(c + dc, r + dr),
    );

  const used = new Uint8Array(COLUMNS * ROWS); // 1: taken, 2: road
  const blocked = new Uint8Array(COLUMNS * ROWS);
  const mark = (c, r, w, h, value = 1) => {
    for (let y = r; y < r + h; y++) {
      for (let x = c; x < c + w; x++)
        if (inside(x, y)) used[index(x, y)] = value;
    }
  };
  const isFree = (c, r) => inner(c, r) && !used[index(c, r)];
  const areaFree = (c, r, w, h, margin = 0) => {
    for (let y = r - margin; y < r + h + margin; y++) {
      for (let x = c - margin; x < c + w + margin; x++) {
        const inArea = x >= c && x < c + w && y >= r && y < r + h;
        if (inArea ? !isFree(x, y) : !inside(x, y) || used[index(x, y)] === 1)
          return false;
      }
    }
    return true;
  };

  /** The free w x h area with the lowest score. */
  const placeArea = (w, h, score, margin = 1) => {
    let best = null;
    for (let r = 0; r < ROWS - h; r++) {
      for (let c = 0; c < COLUMNS - w; c++) {
        if (!areaFree(c, r, w, h, margin)) continue;
        const value = score(c, r) + random() * 0.5;
        if (!best || value < best.value) best = { c, r, value };
      }
    }
    return best && { column: best.c, row: best.r };
  };

  // Middle of the island
  let sumC = 0;
  let sumR = 0;
  for (let i = 0; i < land.length; i++) {
    if (land[i]) {
      sumC += i % COLUMNS;
      sumR += Math.floor(i / COLUMNS);
    }
  }
  const center = [sumC / landCount, sumR / landCount];

  // Garden (square of the village) ------------------------------------------
  const garden = placeArea(
    12,
    8,
    (c, r) => Math.hypot(c + 6 - center[0], r + 4 - center[1]),
    2,
  );
  if (!garden) return null;
  Object.assign(garden, { columns: 12, rows: 8 });
  mark(garden.column, garden.row, 12, 8);
  const gate = [garden.column + 5, garden.row + 8];
  const gardenCenter = [garden.column + 6, garden.row + 4];

  // Buildings around the garden ----------------------------------------------
  // Lots are 6 x 8 tiles (the house, its shadow and doorstep); the tavern is
  // bigger. The two rows in front of the door stay free for the road.
  const BUILDING_PLAN = [
    { id: "tavern", trade: "tavern", columns: 8, target: [0, -12] },
    { id: "east_house", trade: "shop", columns: 6, target: [17, 1] },
    { id: "west_house", trade: "home", columns: 6, target: [-17, -1] },
    { id: "lot_north", lot: true, columns: 6, target: [-9, -12] },
    { id: "lot_meadow", lot: true, columns: 6, target: [11, -11] },
    { id: "lot_garden", lot: true, columns: 6, target: [-12, 11] },
    { id: "lot_east", lot: true, columns: 6, target: [14, 11] },
  ];
  const buildings = [];
  for (const plan of BUILDING_PLAN) {
    const [tx, ty] = [
      gardenCenter[0] + plan.target[0],
      gardenCenter[1] + plan.target[1],
    ];
    const spot = placeArea(
      plan.columns,
      10,
      (c, r) => Math.hypot(c + plan.columns / 2 - tx, r + 4 - ty),
      1,
    );
    if (!spot) return null;
    mark(spot.column, spot.row, plan.columns, 8);
    mark(spot.column, spot.row + 8, plan.columns, 2, 2); // In front of the door
    buildings.push({ ...plan, column: spot.column, row: spot.row });
  }

  // Houses of the three buildings that always exist
  for (const building of buildings) {
    if (building.lot) continue;
    const spec = {
      ...houseFor(building.trade, shapeSeed + building.id.length * 101),
      door: "center",
    };
    if (building.id === "tavern")
      Object.assign(spec, { width: 84, tall: true, windows: 3, chimney: true });
    else spec.width = Math.min(spec.width, 60);
    building.spec = spec;
    building.at = {
      x:
        building.column * TILE +
        Math.round((building.columns * TILE - spec.width) / 2),
      ground: (building.row + 7) * TILE + 2,
    };
    Object.assign(building, houseFootprint(spec, building.at));
  }

  // Pier ---------------------------------------------------------------------
  let pier = null;
  for (const side of ["west", "east", "south"]) {
    for (let attempt = 0; attempt < 300 && !pier; attempt++) {
      const c = random.int(3, COLUMNS - 4);
      const r = random.int(4, ROWS - 6);
      if (!edge[index(c, r)]) continue;
      const [dc, dr] = { west: [-1, 0], east: [1, 0], south: [0, 1] }[side];
      const tiles = [];
      for (let i = 1; i <= 5; i++) {
        for (let j = 0; j < 2; j++) {
          const pc = c + dc * i + (side === "south" ? j : 0);
          const pr = r + dr * i + (side === "south" ? 0 : j);
          if (!inside(pc, pr) || isLand(pc, pr)) tiles.length = 0;
          else if (i <= 4) tiles.push([pc, pr]);
        }
        if (!tiles.length) break;
      }
      // Both tiles of the landing are on the coast
      const landing =
        side === "south"
          ? [
              [c, r],
              [c + 1, r],
            ]
          : [
              [c, r],
              [c, r + 1],
            ];
      if (tiles.length === 8 && landing.every(([lc, lr]) => isLand(lc, lr))) {
        pier = { side, tiles, landing, end: tiles[tiles.length - 2] };
      }
    }
    if (pier) break;
  }
  if (!pier) return null;
  pier.tiles.forEach(([c, r]) => (used[index(c, r)] = 1));

  // Farm with windmill ---------------------------------------------------------
  const farm = placeArea(
    13,
    8,
    (c, r) => {
      const distance = Math.hypot(
        c + 6 - gardenCenter[0],
        r + 4 - gardenCenter[1],
      );
      return Math.abs(distance - 18);
    },
    1,
  );
  if (!farm) return null;
  Object.assign(farm, { columns: 13, rows: 8 });
  mark(farm.column, farm.row, 13, 8);
  // Roads --------------------------------------------------------------------
  const roads = new Set();
  const roadCost = (c, r) => {
    if (!isLand(c, r)) return Infinity;
    const i = index(c, r);
    if (edge[i] && !pier.landing.some(([lc, lr]) => lc === c && lr === r))
      return Infinity;
    if (used[i] === 1) return Infinity;
    return roads.has(i) ? 0.35 : 1;
  };
  const addRoad = (path) => {
    for (const [c, r] of path) {
      roads.add(index(c, r));
      // Two tiles wide
      if (roadCost(c + 1, r) < Infinity) roads.add(index(c + 1, r));
    }
  };
  // Street along the front of the garden
  for (let c = garden.column - 1; c <= garden.column + 12; c++) {
    if (roadCost(c, gate[1]) < Infinity) roads.add(index(c, gate[1]));
    if (roadCost(c, gate[1] + 1) < Infinity) roads.add(index(c, gate[1] + 1));
  }
  for (const building of buildings) {
    const start = building.lot
      ? [building.column + 2, building.row + 8]
      : [Math.floor(building.door.x / TILE), building.row + 8];
    const path = findRoute(start, gate, roadCost);
    if (!path) return null;
    addRoad(path);
    building.doorTile = start;
  }
  const pierRoute = findRoute(pier.landing[0], gate, roadCost);
  if (!pierRoute) return null;
  addRoad(pierRoute);
  for (const i of roads) if (used[i] !== 1) used[i] = 2;

  const farmGate = [farm.column + 4, farm.row + 8];
  const farmRoute = findRoute(farmGate, gate, (c, r) =>
    c === farmGate[0] && r === farmGate[1] ? 1 : roadCost(c, r),
  );
  if (farmRoute) {
    addRoad(farmRoute);
    for (const i of roads) if (used[i] !== 1) used[i] = 2;
  }

  // Fences: around the garden and the farm (with gates)
  const fences = new Set();
  const fenceAround = (c, r, w, h, gates) => {
    for (let x = c; x < c + w; x++) {
      for (const y of [r, r + h - 1]) {
        if (!gates.some(([gx, gy]) => gx === x && gy === y))
          fences.add(index(x, y));
      }
    }
    for (let y = r + 1; y < r + h - 1; y++) {
      for (const x of [c, c + w - 1]) {
        if (!gates.some(([gx, gy]) => gx === x && gy === y))
          fences.add(index(x, y));
      }
    }
  };
  fenceAround(garden.column, garden.row, 12, 8, [
    [gate[0], gate[1] - 1],
    [gate[0] + 1, gate[1] - 1],
    [gate[0], garden.row],
    [gate[0] + 1, garden.row],
  ]);
  fenceAround(farm.column, farm.row, 13, 8, [
    [farmGate[0], farmGate[1] - 1],
    [farmGate[0] + 1, farmGate[1] - 1],
  ]);

  // Vegetable gardens (hortas) next to some homes
  const hortas = [];
  for (const building of buildings.filter(
    (b) => b.id === "west_house" || b.lot,
  )) {
    if (hortas.length >= 3 || !random.chance(0.75)) continue;
    for (const dx of [-7, building.columns + 1]) {
      const c = building.column + dx;
      const r = building.row + 3;
      if (areaFree(c, r, 6, 5, 0)) {
        hortas.push({ column: c, row: r, columns: 6, rows: 5 });
        mark(c, r, 6, 5);
        fenceAround(c, r, 6, 5, [
          [c + 2, r + 4],
          [c + 3, r + 4],
        ]);
        break;
      }
    }
  }

  // Places ---------------------------------------------------------------------
  const px = (c) => c * TILE;
  const places = [];
  const placeAt = (id, name, description, x, y, extra = {}) =>
    places.push({
      id,
      name,
      description,
      x: Math.round(x),
      y: Math.round(y),
      ...extra,
    });
  const dir = (c, r) => directionOf(c, r, center);
  const dirLabel = (c, r) => DIRECTIONS_PT[dir(c, r)];

  for (const building of buildings.filter((b) => !b.lot)) {
    const where = dir(building.column + 3, building.row + 4);
    const placeX = building.door.x - 8;
    const placeY = building.door.y + 6;
    if (building.id === "tavern") {
      placeAt(
        "tavern",
        "Taverna",
        `The tavern, the biggest building, ${where === "north" ? "north" : where} of the village garden. People eat, drink and talk there.`,
        placeX,
        placeY,
        { building: true },
      );
    } else if (building.id === "east_house") {
      placeAt(
        "east_house",
        "Armazém",
        `The general store, in the ${where} of the village, where people buy tools, food and supplies.`,
        placeX,
        placeY,
        { building: true },
      );
    } else {
      placeAt(
        "west_house",
        `Casa do ${dirLabel(building.column + 3, building.row + 4)}`,
        `A cottage in the ${where} of the village where villagers live.`,
        placeX,
        placeY,
        { building: true },
      );
    }
  }
  placeAt(
    "garden",
    "Jardim da vila",
    "Fenced garden in the middle of the village, with two old trees and a stone circle where a fire is lit in the evenings. The meeting point of the village.",
    px(gardenCenter[0]) - 8,
    px(gardenCenter[1]) + 2,
  );

  const [lc, lr] = pier.landing[0];
  const dockTile =
    pier.side === "west"
      ? [lc - 2, lr]
      : pier.side === "east"
        ? [lc + 1, lr]
        : [lc, lr + 1];
  placeAt(
    "dock",
    "Píer",
    `Wooden pier on the ${pier.side} coast of the island, with a small rowing boat. People fish there and boats arrive there.`,
    px(dockTile[0]),
    px(dockTile[1]) + 2,
  );

  // A stretch of the main road where two tiles side by side are free
  const wide = pierRoute.filter(
    ([c, r]) =>
      roads.has(index(c, r)) &&
      roads.has(index(c + 1, r)) &&
      used[index(c, r)] !== 1 &&
      used[index(c + 1, r)] !== 1 &&
      !edge[index(c, r)] &&
      !edge[index(c + 1, r)],
  );
  const middle = (wide.length ? wide : pierRoute)[
    Math.floor((wide.length || pierRoute.length) / 2)
  ];
  placeAt(
    "south_road",
    "Estrada principal",
    "The main road of the village, from the pier to the garden.",
    px(middle[0]),
    px(middle[1]),
  );

  // Two open fields, far from everything
  const fieldTiles = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLUMNS; c++) {
      if (!areaFree(c - 1, r - 1, 4, 3, 1)) continue;
      fieldTiles.push([c, r]);
    }
  }
  const takenPoints = places.map((place) => [place.x / TILE, place.y / TILE]);
  const farthest = (points) =>
    fieldTiles
      .map((tile) => ({
        tile,
        distance: Math.min(
          ...points.map(([x, y]) => Math.hypot(tile[0] - x, tile[1] - y)),
        ),
      }))
      .sort((a, b) => b.distance - a.distance)[0]?.tile;
  const firstField = farthest([
    ...takenPoints,
    [farm.column + 6, farm.row + 4],
  ]);
  if (!firstField) return null;
  const secondField = farthest([
    ...takenPoints,
    firstField,
    [farm.column + 6, farm.row + 4],
  ]);
  if (!secondField) return null;
  for (const [id, tile] of [
    ["north_meadow", firstField],
    ["east_meadow", secondField],
  ]) {
    const label = dirLabel(...tile);
    placeAt(
      id,
      `Campo do ${label}`,
      `Open meadow with wild flowers in the ${dir(...tile)} of the island, used as pasture.`,
      px(tile[0]),
      px(tile[1]) + 2,
    );
    mark(tile[0] - 2, tile[1] - 1, 5, 4, 2);
  }

  // Lots (the village plan may build there)
  const lots = buildings
    .filter((building) => building.lot)
    .map(({ id, column, row }) => ({
      id,
      column,
      row,
      description: `a lot in the ${dir(column + 3, row + 4)} of the village`,
    }));

  // Trees ----------------------------------------------------------------------
  const forest = valueNoise(shapeSeed + 17);
  const trees = [];
  const nearPlace = (c, r, distance) =>
    places.some(
      (place) => Math.hypot(place.x / TILE - c, place.y / TILE - r) < distance,
    );
  const treeFree = (c, r) =>
    areaFree(c, r, 2, 3, 0) &&
    !nearPlace(c + 1, r + 2, 3) &&
    !pier.tiles.some(
      ([pc, pr]) => Math.abs(pc - c) < 3 && Math.abs(pr - r) < 3,
    ) &&
    [...Array(6)].every((_, i) => !roads.has(index(c - 1 + (i % 4), r + 3)));
  for (let r = 1; r < ROWS - 3; r++) {
    for (let c = 1; c < COLUMNS - 2; c++) {
      const density = forest(c * 0.15, r * 0.15, 2);
      if (density < 0.56 && !random.chance(0.025)) continue;
      if (!random.chance(0.45) || !treeFree(c, r)) continue;
      trees.push({ column: c, row: r, variant: random.int(0, 2) });
      mark(c, r, 2, 3);
    }
  }
  // Two old trees in the garden
  const gardenTrees = [
    { column: garden.column + 2, row: garden.row + 1, variant: 0, big: true },
    { column: garden.column + 8, row: garden.row + 1, variant: 1, big: true },
  ];
  trees.push(...gardenTrees);

  // Props ----------------------------------------------------------------------
  const prop = (c, r, w = 1, h = 1) => {
    const tiles = [];
    for (let y = r; y < r + h; y++)
      for (let x = c; x < c + w; x++) tiles.push([x, y]);
    mark(c, r, w, h);
    return { x: c * TILE, y: r * TILE, tiles };
  };
  const near = (c, r, w, h, maxDistance, score = () => 0) => {
    let best = null;
    for (let y = r - maxDistance; y <= r + maxDistance; y++) {
      for (let x = c - maxDistance; x <= c + maxDistance; x++) {
        if (!areaFree(x, y, w, h, 0)) continue;
        const value = Math.hypot(x - c, y - r) + score(x, y) + random() * 0.3;
        if (!best || value < best.value) best = { x, y, value };
      }
    }
    return best && [best.x, best.y];
  };

  const wellTile = near(garden.column + 14, garden.row + 3, 2, 2, 4);
  const well = wellTile && {
    ...prop(...wellTile, 2, 2),
    kind: "well",
    id: "well",
  };

  const westHouse = buildings.find((b) => b.id === "west_house");
  const woodTile = near(westHouse.column + 6, westHouse.row + 6, 2, 1, 3);
  const woodpile = woodTile && {
    ...prop(...woodTile, 2, 1),
    kind: "woodpile",
    id: "woodpile",
  };

  const farmPlots = [];
  for (let i = 0; i < 9; i++) {
    const c = farm.column + 1 + (i % 3) * 3;
    const r = farm.row + 1 + Math.floor(i / 3) * 2;
    farmPlots.push({
      index: i,
      x: c * TILE,
      y: r * TILE,
      width: 2 * TILE,
      height: TILE,
    });
  }
  const windmill = {
    x: (farm.column + 10) * TILE,
    y: (farm.row + 4) * TILE,
    tiles: [
      [farm.column + 10, farm.row + 4],
      [farm.column + 11, farm.row + 4],
      [farm.column + 10, farm.row + 5],
      [farm.column + 11, farm.row + 5],
    ],
    kind: "windmill",
  };
  const scarecrow = {
    x: (farm.column + 10) * TILE,
    y: (farm.row + 1) * TILE,
    tiles: [[farm.column + 10, farm.row + 1]],
    kind: "scarecrow",
  };

  // Lamps along the roads, signs by the doors
  const lamps = [];
  const roadList = [...roads].sort((a, b) => a - b);
  for (let i = 0; i < roadList.length && lamps.length < 9; i += 11) {
    const c = roadList[i] % COLUMNS;
    const r = Math.floor(roadList[i] / COLUMNS);
    const tile = [
      [c - 1, r],
      [c + 2, r],
      [c, r - 1],
      [c, r + 2],
    ].find(([x, y]) => isFree(x, y) && !roads.has(index(x, y)));
    if (tile) lamps.push({ ...prop(...tile), kind: "lamp" });
  }
  const signs = [];
  for (const place of places.filter((p) =>
    ["tavern", "west_house", "east_house", "garden", "dock"].includes(p.id),
  )) {
    const c = Math.floor(place.x / TILE);
    const r = Math.floor(place.y / TILE);
    const tile = near(c, r, 1, 1, 4, (x, y) =>
      roads.has(index(x, y)) ||
      [
        [0, 1],
        [0, -1],
        [1, 0],
        [-1, 0],
      ].every(([dx, dy]) => !roads.has(index(x + dx, y + dy)))
        ? 3
        : 0,
    );
    if (tile && !roads.has(index(...tile))) {
      signs.push({ ...prop(...tile), kind: "sign", placeId: place.id });
    }
  }

  // Chests in quiet corners near the coast
  const chests = [];
  for (let attempt = 0; attempt < 800 && chests.length < 3; attempt++) {
    const c = random.int(2, COLUMNS - 3);
    const r = random.int(2, ROWS - 3);
    const coastal = [
      [2, 0],
      [-2, 0],
      [0, 2],
      [0, -2],
    ].some(([dc, dr]) => edge[index(c + dc, r + dr)]);
    if (
      !coastal ||
      !isFree(c, r) ||
      roads.has(index(c, r)) ||
      nearPlace(c, r, 6)
    )
      continue;
    if (
      chests.some(
        (chest) => Math.hypot(chest.x / TILE - c, chest.y / TILE - r) < 14,
      )
    )
      continue;
    chests.push({
      ...prop(c, r),
      kind: "chest",
      id: ["chest_north", "chest_south", "chest_east"][chests.length],
    });
  }

  // Bushes (gathering), chickens, fish, the cat, fireflies
  const placeOf = (id) => places.find((place) => place.id === id);
  const bushes = [];
  for (const [id, count] of [
    ["north_meadow", 3],
    ["east_meadow", 2],
  ]) {
    const place = placeOf(id);
    for (let i = 0; i < count; i++) {
      const tile = near(
        Math.floor(place.x / TILE) + random.int(-3, 3),
        Math.floor(place.y / TILE) + random.int(-2, 2),
        1,
        1,
        3,
      );
      if (tile) {
        mark(...tile, 1, 1);
        bushes.push({ x: tile[0] * TILE + 6, y: tile[1] * TILE + 6 });
      }
    }
  }
  bushes.push(
    { x: (garden.column + 2) * TILE + 6, y: (garden.row + 6) * TILE + 6 },
    { x: (garden.column + 9) * TILE + 6, y: (garden.row + 6) * TILE + 6 },
  );

  const chickenYards = [];
  for (const building of [
    westHouse,
    buildings.find((b) => b.id === "lot_garden"),
  ]) {
    const tile = near(
      building.column + 3,
      building.row + 10,
      3,
      2,
      4,
      (x, y) => (roads.has(index(x, y)) ? 5 : 0),
    );
    if (tile) {
      chickenYards.push({
        x: tile[0] * TILE + 12,
        y: tile[1] * TILE + 10,
        count: chickenYards.length ? 2 : 3,
      });
      mark(...tile, 3, 2, 2);
    }
  }

  const [ec, er] = pier.end;
  const fishSpots = [
    [ec - 1, er + 3],
    [ec + 2, er + 3],
    [ec - 3, er],
  ]
    .filter(([c, r]) => inside(c, r) && !isLand(c, r))
    .map(([c, r]) => ({ x: c * TILE + 6, y: r * TILE + 6 }));

  const tavern = placeOf("tavern");
  const catHome = { x: tavern.x + 26, y: tavern.y + 8 };
  const treeCrowns = gardenTrees.map(({ column, row }) => ({
    x: (column + 1) * TILE,
    y: row * TILE + 6,
  }));
  const fireflyAreas = [
    "garden",
    "north_meadow",
    "east_meadow",
    "south_road",
  ].map((id) => {
    const place = placeOf(id);
    return { x: place.x + 8, y: place.y + 6 };
  });
  // Where the player stands to take the boat (feet), at the end of the pier
  const boat =
    pier.side === "south"
      ? { x: ec * TILE + 8, y: er * TILE + 2 }
      : pier.side === "east"
        ? { x: ec * TILE + 4, y: er * TILE + 14 }
        : { x: ec * TILE + 8, y: er * TILE + 14 };
  const campfire = { x: gardenCenter[0] * TILE, y: gardenCenter[1] * TILE + 6 };

  // Spots near each place for things that come with the story
  const structureSpots = {};
  for (const place of places) {
    const spots = [];
    const pc = Math.floor(place.x / TILE);
    const pr = Math.floor(place.y / TILE);
    for (const [dc, dr] of [
      [-3, 1],
      [4, 1],
      [0, 3],
      [-3, -2],
      [4, -2],
      [2, 4],
    ]) {
      const [c, r] = [pc + dc, pr + dr];
      if (
        spots.length < 3 &&
        isFree(c, r) &&
        isFree(c + 1, r) &&
        !roads.has(index(c, r))
      ) {
        spots.push({ x: c * TILE + 6, y: r * TILE + 10 });
      }
    }
    while (spots.length < 3)
      spots.push({ x: place.x + 8, y: place.y + 18 + spots.length * 4 });
    structureSpots[place.id] = spots;
  }

  // Collisions -----------------------------------------------------------------
  const pierSet = new Set(pier.tiles.map(([c, r]) => index(c, r)));
  const landingSet = new Set(pier.landing.map(([c, r]) => index(c, r)));
  for (let i = 0; i < blocked.length; i++) {
    if (pierSet.has(i)) continue;
    if (!land[i] || (edge[i] && !landingSet.has(i))) blocked[i] = 1;
  }
  // Roads and the landing of the pier can always be walked, two tiles wide
  // (the player is wider than one tile)
  const walkable = (c, r) =>
    inside(c, r) &&
    (isLand(c, r) || pierSet.has(index(c, r))) &&
    used[index(c, r)] !== 1;
  const open = (c, r) => {
    if (walkable(c, r)) blocked[index(c, r)] = 0;
  };
  for (const i of roads) {
    const c = i % COLUMNS;
    const r = Math.floor(i / COLUMNS);
    open(c, r);
    if (!roads.has(index(c + 1, r)) && !roads.has(index(c - 1, r))) {
      open(c + 1, r);
      open(c - 1, r);
    }
    if (!roads.has(index(c, r + 1)) && !roads.has(index(c, r - 1))) {
      open(c, r + 1);
      open(c, r - 1);
    }
  }
  for (const [c, r] of pier.landing) {
    for (const [dc, dr] of [
      [0, 0],
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ])
      open(c + dc, r + dr);
  }
  for (const i of fences) blocked[i] = 1;
  for (const tree of trees) {
    blocked[index(tree.column, tree.row + 2)] = 1;
    blocked[index(tree.column + 1, tree.row + 2)] = 1;
  }
  const blockRect = ({ x, y, width, height }) => {
    for (let r = Math.floor(y / TILE); r * TILE < y + height; r++) {
      for (let c = Math.floor(x / TILE); c * TILE < x + width; c++) {
        const cx = c * TILE + TILE / 2;
        const cy = r * TILE + TILE / 2;
        if (
          inside(c, r) &&
          cx >= x &&
          cx < x + width &&
          cy >= y &&
          cy < y + height
        ) {
          blocked[index(c, r)] = 1;
        }
      }
    }
  };
  buildings.filter((b) => !b.lot).forEach((b) => blockRect(b.blocked));

  // Every place must be reachable from the pier (the player is 2 tiles wide).
  // Lamps and signs in a narrow passage are taken away.
  const propTiles = () =>
    new Set(
      [...lamps, ...signs, ...chests, well, woodpile, windmill, scarecrow]
        .filter(Boolean)
        .flatMap(({ tiles }) => tiles.map(([c, r]) => index(c, r))),
    );
  const reachableFromDock = () => {
    const props = propTiles();
    const free = (c, r) =>
      inside(c, r) && !blocked[index(c, r)] && !props.has(index(c, r));
    const stand = (c, r) => free(c, r) && free(c + 1, r);
    const dock = places.find((place) => place.id === "dock");
    const start = [Math.floor(dock.x / TILE), Math.floor(dock.y / TILE)];
    const seen = new Set([index(...start)]);
    const queue = [start];
    while (queue.length) {
      const [c, r] = queue.shift();
      for (const [dc, dr] of NEIGHBORS) {
        const next = [c + dc, r + dr];
        if (!seen.has(index(...next)) && stand(...next)) {
          seen.add(index(...next));
          queue.push(next);
        }
      }
    }
    return places.every((place) => {
      const c = Math.floor(place.x / TILE);
      const r = Math.floor(place.y / TILE);
      return [c - 1, c, c + 1].some((x) => seen.has(index(x, r)));
    });
  };
  const nearRoad = ({ tiles: [[c, r]] }) =>
    [-1, 0, 1].some((dc) =>
      [-1, 0, 1].some((dr) => roads.has(index(c + dc, r + dr))),
    );
  for (const list of [lamps, signs]) {
    for (let i = list.length - 1; i >= 0 && !reachableFromDock(); i--) {
      if (nearRoad(list[i])) list.splice(i, 1);
    }
  }
  if (!reachableFromDock()) return null;

  return {
    seed,
    land,
    edge,
    roads,
    fences,
    pier,
    garden,
    gate,
    farm,
    hortas,
    trees,
    buildings,
    lots,
    places,
    collisions: [...blocked],
    props: {
      lamps,
      signs,
      chests,
      well,
      woodpile,
      windmill,
      scarecrow,
      farmPlots,
      campfire,
      bushes,
      fishSpots,
      chickenYards,
      boat,
      catHome,
      treeCrowns,
      fireflyAreas,
      structureSpots,
    },
  };
}
