// Layouts of the regions reached by boat, generated like the island (no
// drawing, tested with node): the forest (trail, trees to cut, bushes, the
// camp of the bandits), the mine (a cave with ore, crystals and torches) and
// the market town of Pedravento (harbor, square, houses and stalls).
//
// Each layout has the same data an interior has (`collisions` and `points`,
// in pixels of the region) plus what the painter needs. The names of the
// points are the ones the server knows (tree_N, ore_N, crystal_N, forage_N,
// camp, camp_chest, merchant_*...).

import { houseFootprint, houseFor } from "../procedural/houses.js";
import { seeded } from "../procedural/pixel.js";
import { TILE } from "./layout.js";
import { valueNoise } from "./noise.js";

const NEIGHBORS = [
  [1, 0],
  [-1, 0],
  [0, 1],
  [0, -1],
];

/** A grid of tiles with the helpers every region uses. */
function grid(columns, rows) {
  const size = columns * rows;
  const g = {
    columns,
    rows,
    index: (c, r) => r * columns + c,
    inside: (c, r) => c >= 0 && r >= 0 && c < columns && r < rows,
    land: new Uint8Array(size),
    blocked: new Uint8Array(size),
    taken: new Uint8Array(size), // Something is planned there
    roads: new Set(),
    points: {},
  };
  g.isLand = (c, r) => g.inside(c, r) && g.land[g.index(c, r)] === 1;
  g.free = (c, r) =>
    g.isLand(c, r) &&
    !g.blocked[g.index(c, r)] &&
    !g.taken[g.index(c, r)] &&
    !g.roads.has(g.index(c, r));
  g.areaFree = (c, r, w, h) => {
    for (let y = r; y < r + h; y++) {
      for (let x = c; x < c + w; x++) if (!g.free(x, y)) return false;
    }
    return true;
  };
  g.take = (c, r, w = 1, h = 1) => {
    for (let y = r; y < r + h; y++) {
      for (let x = c; x < c + w; x++)
        if (g.inside(x, y)) g.taken[g.index(x, y)] = 1;
    }
  };
  g.block = (c, r, w = 1, h = 1) => {
    for (let y = r; y < r + h; y++) {
      for (let x = c; x < c + w; x++)
        if (g.inside(x, y)) g.blocked[g.index(x, y)] = 1;
    }
  };
  g.point = (name, kind, x, y, width = 0, height = 0) => {
    g.points[name] = {
      kind,
      x: Math.round(x),
      y: Math.round(y),
      width,
      height,
    };
  };
  return g;
}

/** A* on the tiles with a cost per tile (Infinity blocks). */
function route(g, start, goal, cost) {
  const key = ([c, r]) => g.index(c, r);
  const open = new Map([[key(start), { tile: start, g: 0, f: 0 }]]);
  const came = new Map();
  const best = new Map([[key(start), 0]]);

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
      if (!g.inside(...tile)) continue;
      const step = cost(...tile);
      if (!Number.isFinite(step)) continue;
      const total = current.g + step;
      const k = key(tile);
      if (total < (best.get(k) ?? Infinity)) {
        best.set(k, total);
        came.set(k, current.tile);
        open.set(k, {
          tile,
          g: total,
          f: total + Math.abs(tile[0] - goal[0]) + Math.abs(tile[1] - goal[1]),
        });
      }
    }
  }
  return null;
}

/** A road two tiles wide along a path. */
const addRoad = (g, path) => {
  for (const [c, r] of path) {
    for (const [x, y] of [
      [c, r],
      [c + 1, r],
      [c, r + 1],
    ]) {
      if (g.isLand(x, y) && !g.blocked[g.index(x, y)])
        g.roads.add(g.index(x, y));
    }
  }
};

/** Land with the sea on the west side (where the boat arrives). */
function westShore(g, noise) {
  for (let r = 0; r < g.rows; r++) {
    const shore = 3 + Math.round(noise(r * 0.25, 1.5) * 3);
    for (let c = shore; c < g.columns; c++) g.land[g.index(c, r)] = 1;
  }
}

/** Water to the land: edges are where the coast is drawn. */
function edges(g) {
  const edge = new Uint8Array(g.columns * g.rows);
  for (let r = 0; r < g.rows; r++) {
    for (let c = 0; c < g.columns; c++) {
      if (
        g.isLand(c, r) &&
        NEIGHBORS.some(
          ([dc, dr]) => g.inside(c + dc, r + dr) && !g.isLand(c + dc, r + dr),
        )
      ) {
        edge[g.index(c, r)] = 1;
      }
    }
  }
  return edge;
}

/** A small pier from the coast into the sea, the arrival and the boat. */
function harbor(g, row) {
  let shore = 0;
  while (!g.isLand(shore, row) || !g.isLand(shore, row + 1)) shore++;
  const tiles = [];
  for (let c = shore - 3; c < shore; c++) tiles.push([c, row], [c, row + 1]);
  const pier = {
    side: "west",
    tiles,
    landing: [
      [shore, row],
      [shore, row + 1],
    ],
    end: [shore - 3, row],
  };
  g.take(shore, row - 1, 5, 4);
  // The road starts at the end of the pier
  for (const [c, r] of [
    ...pier.landing,
    [shore + 1, row],
    [shore + 1, row + 1],
  ])
    g.roads.add(g.index(c, r));
  g.point("arrival", "arrival", (shore + 1) * TILE, row * TILE);
  g.point("boat", "boat", (shore - 3) * TILE - 2, (row + 2) * TILE + 10);
  return pier;
}

/**
 * Whether every point the player uses can be reached from the arrival
 * (the player is 2 tiles wide): the feet of the player standing on some
 * tile reached are close enough to use it. `targets` are [name, x, y], in
 * pixels of the region.
 */
// A bit less than the distance of the interactions (world/Regions.js)
const REACH = 15;

function reachable(g, extraBlocked, targets) {
  const free = (c, r) =>
    g.isLand(c, r) &&
    !g.blocked[g.index(c, r)] &&
    !extraBlocked.has(g.index(c, r));
  const stand = (c, r) => free(c, r) && free(c + 1, r);
  const arrival = g.points.arrival;
  const start = [Math.floor(arrival.x / TILE), Math.floor(arrival.y / TILE)];
  const seen = new Set([g.index(...start)]);
  const queue = [start];
  while (queue.length) {
    const [c, r] = queue.shift();
    for (const [dc, dr] of NEIGHBORS) {
      const next = [c + dc, r + dr];
      if (!seen.has(g.index(...next)) && stand(...next)) {
        seen.add(g.index(...next));
        queue.push(next);
      }
    }
  }
  return targets.every(([, x, y]) => {
    const c = Math.floor(x / TILE);
    const r = Math.floor(y / TILE);
    for (let sr = r - 2; sr <= r + 2; sr++) {
      for (let sc = c - 3; sc <= c + 2; sc++) {
        if (!g.inside(sc, sr) || !seen.has(g.index(sc, sr))) continue;
        // Feet of the player (16 x 12, at the corner of the tile)
        const feet = { x: sc * TILE + 8, y: sr * TILE + 10 };
        if (Math.hypot(feet.x - x, feet.y - y) <= REACH) return true;
      }
    }
    return false;
  });
}

/** Decorative trees (2 x 3 tiles: crown, trunk) where `density` says. */
function forestTrees(g, random, density, keepAway) {
  const trees = [];
  for (let r = -1; r < g.rows - 2; r++) {
    for (let c = 0; c < g.columns - 1; c++) {
      if (random() > density(c, r)) continue;
      // Trunks must be on free land; crowns may hang over the border
      if (!g.free(c, r + 2) || !g.free(c + 1, r + 2)) continue;
      if (!g.areaFree(c, Math.max(0, r), 2, Math.min(3, r + 3))) continue;
      if (keepAway(c, r)) continue;
      trees.push({ column: c, row: r, variant: random.int(0, 2) });
      g.take(c, Math.max(0, r), 2, Math.min(3, r + 3));
      g.block(c, r + 2, 2, 1);
    }
  }
  return trees;
}

const distanceTo = (tiles, c, r) => {
  let best = Infinity;
  for (const [x, y] of tiles)
    best = Math.min(best, Math.abs(x - c) + Math.abs(y - r));
  return best;
};

const finish = (g, extra) => {
  const collisions = [];
  for (let i = 0; i < g.columns * g.rows; i++) {
    collisions.push(
      g.blocked[i] || (!g.land[i] && !extra.walkable?.has(i)) ? 1 : 0,
    );
  }
  return {
    columns: g.columns,
    rows: g.rows,
    width: g.columns,
    height: g.rows,
    tileWidth: TILE,
    tileHeight: TILE,
    land: g.land,
    roads: g.roads,
    collisions,
    points: g.points,
    ...extra,
  };
};

// ---------------------------------------------------------------------------
// Forest

export function generateForest(seed) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const layout = tryForest(seed + attempt * 101);
    if (layout) return { ...layout, seed };
  }
  throw new Error(`No forest from seed ${seed}`);
}

function tryForest(seed) {
  const random = seeded(seed);
  const noise = valueNoise(seed);
  const g = grid(42, 26);
  westShore(g, noise);
  const edge = edges(g);
  edge.forEach((value, i) => value && (g.blocked[i] = 1));

  const arrivalRow = random.int(9, 14);
  const pier = harbor(g, arrivalRow);
  pier.landing.forEach(([c, r]) => (g.blocked[g.index(c, r)] = 0));

  // Clearing with the camp of the bandits, on the east side
  const campC = g.columns - random.int(9, 11);
  const campR = random.int(9, 15);
  g.take(campC - 5, campR - 4, 10, 8);

  // Winding trail from the beach to the camp
  const start = [Math.floor(g.points.arrival.x / TILE), arrivalRow];
  const trail = route(g, start, [campC - 4, campR], (c, r) =>
    g.isLand(c, r) && !edge[g.index(c, r)]
      ? 1 + noise(c * 0.3, r * 0.3) * 4
      : Infinity,
  );
  if (!trail) return null;
  addRoad(g, trail);
  for (const [c, r] of trail) g.take(c - 1, r - 1, 3, 3);
  g.take(campC - 5, campR - 4, 10, 8);

  // Tents, fire, crates and the chest of the camp
  const camp = { tents: [], crates: [] };
  for (const [dc, dr] of [
    [-4, -3],
    [1, 1],
  ]) {
    const [c, r] = [campC + dc, campR + dr];
    camp.tents.push({ column: c, row: r });
    g.block(c, r + 1, 2, 1);
    g.point(
      `tent_${camp.tents.length}`,
      "tent",
      (c + 1) * TILE,
      (r + 2) * TILE,
    );
  }
  g.point("campfire", "campfire", campC * TILE, campR * TILE + 6);
  for (const [dc, dr] of [
    [3, -3],
    [4, -3],
    [-3, 2],
  ]) {
    camp.crates.push({ column: campC + dc, row: campR + dr });
    g.block(campC + dc, campR + dr);
  }
  camp.chest = { column: campC + 3, row: campR - 1 };
  g.block(campC + 3, campR - 1);
  g.point(
    "camp_chest",
    "camp_chest",
    (campC + 3) * TILE + 6,
    campR * TILE + 10,
  );
  g.point("camp", "camp", (campC - 2) * TILE, (campR + 1) * TILE);

  // Trees that can be cut, along the trail
  const nodeTiles = [];
  let trees = 0;
  for (let attempt = 0; attempt < 600 && trees < 12; attempt++) {
    const [tc, tr] = trail[random.int(4, trail.length - 3)];
    const c = tc + random.int(-4, 3);
    const r = tr + random.pick([-5, -4, 2, 3]);
    if (!g.inside(c, r) || !g.inside(c + 1, r + 3)) continue;
    if (!g.areaFree(c, r, 2, 3) || !g.isLand(c, r + 3)) continue;
    if (nodeTiles.some(([x, y]) => Math.abs(x - c) < 4 && Math.abs(y - r) < 4))
      continue;
    g.take(c - 1, r, 4, 4);
    g.block(c, r + 2, 2, 1);
    g.point(`tree_${trees}`, "tree", (c + 1) * TILE, (r + 2) * TILE + 10);
    nodeTiles.push([c, r + 2]);
    trees++;
  }
  if (trees < 8) return null;

  // Bushes with berries and mushrooms
  let bushes = 0;
  for (let attempt = 0; attempt < 400 && bushes < 6; attempt++) {
    const [tc, tr] = trail[random.int(3, trail.length - 3)];
    const c = tc + random.pick([-2, 2, 3]);
    const r = tr + random.pick([-2, 2]);
    if (
      !g.free(c, r) ||
      nodeTiles.some(([x, y]) => Math.abs(x - c) < 3 && Math.abs(y - r) < 3)
    )
      continue;
    g.take(c, r);
    g.point(`forage_${bushes}`, "forage", c * TILE + 6, r * TILE + 8);
    nodeTiles.push([c, r]);
    bushes++;
  }

  // The rest is a dense forest, thicker near the borders
  const decor = forestTrees(
    g,
    random,
    (c, r) => {
      const border = Math.min(r + 1, g.rows - 3 - r, g.columns - 2 - c);
      return border <= 2 ? 0.95 : 0.22 + noise(c * 0.2, r * 0.2) * 0.35;
    },
    (c, r) => distanceTo(nodeTiles, c, r + 2) < 2,
  );

  const mushrooms = [];
  for (let i = 0; i < 10; i++) {
    const c = random.int(g.columns / 4, g.columns - 2);
    const r = random.int(1, g.rows - 2);
    if (g.free(c, r))
      mushrooms.push({
        x: c * TILE + random.int(2, 9),
        y: r * TILE + random.int(4, 10),
      });
  }

  const targets = Object.entries(g.points)
    .filter(([, p]) =>
      ["tree", "forage", "camp", "camp_chest"].includes(p.kind),
    )
    .map(([name, p]) => [name, p.x, p.y]);
  if (!reachable(g, new Set(), targets)) return null;

  return finish(g, {
    id: "forest",
    edge,
    pier,
    trees: decor,
    camp,
    mushrooms,
    roadStyle: "dirt",
    grass: [96, 176, 76],
    grassTuft: [70, 150, 60],
    walkable: new Set(pier.tiles.map(([c, r]) => g.index(c, r))),
  });
}

// ---------------------------------------------------------------------------
// Mine

export function generateMine(seed) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const layout = tryMine(seed + attempt * 131);
    if (layout) return { ...layout, seed };
  }
  throw new Error(`No mine from seed ${seed}`);
}

function tryMine(seed) {
  const random = seeded(seed);
  const noise = valueNoise(seed);
  const g = grid(32, 21);

  // Floor of the cave: open in the middle, rocky borders
  for (let r = 3; r < g.rows - 2; r++) {
    for (let c = 2; c < g.columns - 2; c++) {
      const dx = (c - g.columns / 2) / (g.columns / 2);
      const dy = (r - g.rows / 2) / (g.rows / 2);
      const value =
        noise(c * 0.17, r * 0.17, 3) + 0.62 * (1 - Math.hypot(dx, dy));
      if (value > 0.66) g.land[g.index(c, r)] = 1;
    }
  }
  // Tunnel to the outside, at the bottom
  const tunnel = Math.floor(g.columns / 2) - 1;
  for (let r = g.rows - 6; r < g.rows; r++) {
    for (let c = tunnel - 1; c <= tunnel + 2; c++) g.land[g.index(c, r)] = 1;
  }
  // Keep the part connected to the tunnel
  const seen = new Set([g.index(tunnel, g.rows - 1)]);
  const queue = [[tunnel, g.rows - 1]];
  while (queue.length) {
    const [c, r] = queue.shift();
    for (const [dc, dr] of NEIGHBORS) {
      const next = [c + dc, r + dr];
      if (g.isLand(...next) && !seen.has(g.index(...next))) {
        seen.add(g.index(...next));
        queue.push(next);
      }
    }
  }
  for (let i = 0; i < g.land.length; i++) if (!seen.has(i)) g.land[i] = 0;
  const floorCount = seen.size;
  if (floorCount < 220) return null;

  g.point("arrival", "arrival", tunnel * TILE + 6, (g.rows - 2) * TILE);
  g.take(tunnel - 2, g.rows - 5, 6, 5);

  const nextToWall = (c, r) =>
    NEIGHBORS.some(([dc, dr]) => !g.isLand(c + dc, r + dr)) &&
    !g.isLand(c, r - 1);

  // Ore and crystals by the walls, boulders in the middle
  const nodes = [];
  const place = (kind, count) => {
    for (
      let attempt = 0, placed = 0;
      attempt < 800 && placed < count;
      attempt++
    ) {
      const c = random.int(2, g.columns - 3);
      const r = random.int(3, g.rows - 4);
      if (!g.free(c, r) || !nextToWall(c, r) || !g.free(c, r + 1)) continue;
      if (
        nodes.some((n) => Math.abs(n.column - c) < 4 && Math.abs(n.row - r) < 3)
      )
        continue;
      g.block(c, r);
      g.take(c - 1, r - 1, 3, 3);
      nodes.push({ kind, column: c, row: r });
      g.point(`${kind}_${placed}`, kind, c * TILE + 6, (r + 1) * TILE + 8);
      placed++;
    }
  };
  place("crystal", 3);
  place("ore", 7);
  if (nodes.filter((n) => n.kind === "ore").length < 5) return null;

  const boulders = [];
  for (let attempt = 0; attempt < 200 && boulders.length < 4; attempt++) {
    const c = random.int(3, g.columns - 5);
    const r = random.int(4, g.rows - 6);
    if (!g.areaFree(c - 1, r - 1, 4, 4)) continue;
    g.block(c, r, 2, 2);
    g.take(c - 1, r - 1, 4, 4);
    boulders.push({ column: c, row: r });
  }

  // Torches on the walls above the floor
  const torches = [];
  for (
    let c = 3;
    c < g.columns - 3 && torches.length < 5;
    c += random.int(4, 7)
  ) {
    for (let r = 2; r < g.rows - 4; r++) {
      if (!g.isLand(c, r) && g.isLand(c, r + 1) && g.isLand(c + 1, r + 1)) {
        torches.push({ column: c, row: r });
        g.point(
          `torch_${torches.length}`,
          "light",
          c * TILE + 6,
          (r + 1) * TILE,
        );
        break;
      }
    }
  }

  // Nodes can be reached; otherwise drop the boulders in the way
  const targets = () =>
    nodes.map((n) => [n.kind, n.column * TILE + 6, (n.row + 1) * TILE + 8]);
  while (!reachable(g, new Set(), targets()) && boulders.length) {
    const boulder = boulders.pop();
    for (const [dc, dr] of [
      [0, 0],
      [1, 0],
      [0, 1],
      [1, 1],
    ]) {
      g.blocked[g.index(boulder.column + dc, boulder.row + dr)] = 0;
    }
  }
  if (!reachable(g, new Set(), targets())) return null;

  return finish(g, { id: "mine", nodes, boulders, torches, dark: true });
}

// ---------------------------------------------------------------------------
// Town (Pedravento)

const TOWN_HOUSES = [
  { trade: "tavern", sign: "mug" },
  { trade: "smithy" },
  { trade: "shop" },
  { trade: "home" },
];

export function generateTown(seed) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const layout = tryTown(seed + attempt * 211);
    if (layout) return { ...layout, seed };
  }
  throw new Error(`No town from seed ${seed}`);
}

function tryTown(seed) {
  const random = seeded(seed);
  const noise = valueNoise(seed);
  const g = grid(37, 24);
  westShore(g, noise);
  const edge = edges(g);
  edge.forEach((value, i) => value && (g.blocked[i] = 1));

  // Square of the town, with the houses on its north side
  const plaza = { column: 12, row: 11, columns: 17, rows: 9 };
  for (let r = plaza.row; r < plaza.row + plaza.rows; r++) {
    for (let c = plaza.column; c < plaza.column + plaza.columns; c++) {
      g.roads.add(g.index(c, r));
    }
  }

  const harborRow = random.int(13, 16);
  const pier = harbor(g, harborRow);
  pier.landing.forEach(([c, r]) => (g.blocked[g.index(c, r)] = 0));
  const path = route(
    g,
    [Math.floor(g.points.arrival.x / TILE), harborRow],
    [plaza.column, harborRow],
    (c, r) => (g.isLand(c, r) && !edge[g.index(c, r)] ? 1 : Infinity),
  );
  if (!path) return null;
  addRoad(g, path);

  // Houses: 6 x 8 tiles above the square, doors facing it
  const houses = [];
  const order = [...TOWN_HOUSES].sort(() => random() - 0.5);
  for (let i = 0; i < 3; i++) {
    const column = plaza.column + i * 6 - 1 + (i === 0 ? 1 : 0);
    const row = plaza.row - 8;
    const spec = { ...houseFor(order[i].trade, seed + i * 17), door: "center" };
    spec.width = Math.min(spec.width, 60);
    if (order[i].sign) spec.sign = order[i].sign;
    const at = {
      x: column * TILE + Math.round((6 * TILE - spec.width) / 2),
      ground: (row + 7) * TILE + 2,
    };
    const footprint = houseFootprint(spec, at);
    houses.push({ spec, at, ...footprint });
    g.take(column, row, 6, 8);
    const { x, y, width, height } = footprint.blocked;
    for (let r = Math.floor(y / TILE); r * TILE < y + height; r++) {
      for (let c = Math.floor(x / TILE); c * TILE < x + width; c++) {
        const cx = c * TILE + TILE / 2;
        const cy = r * TILE + TILE / 2;
        if (cx >= x && cx < x + width && cy >= y && cy < y + height)
          g.block(c, r);
      }
    }
    // A short path from the door to the square
    const doorC = Math.floor(footprint.door.x / TILE);
    for (let r = row + 7; r < plaza.row; r++) {
      g.roads.add(g.index(doorC, r));
      g.roads.add(g.index(doorC + 1, r));
    }
  }

  // Fountain in the middle of the square
  const fountain = { column: plaza.column + 7, row: plaza.row + 3 };
  g.block(fountain.column, fountain.row, 3, 2);

  // Stalls of the merchants, and where they stand
  const stalls = [
    ["tools", plaza.column + 2, plaza.row + 2],
    ["buyer", plaza.column + 13, plaza.row + 2],
    ["seeds", plaza.column + 7, plaza.row + 6],
  ];
  for (const [name, c, r] of stalls) {
    g.block(c - 1, r, 3, 1);
    g.point(`stall_${name}`, "stall", c * TILE + 6, (r + 1) * TILE);
    g.point(`merchant_${name}`, "merchant", c * TILE - 2, (r + 1) * TILE + 2);
  }
  g.point("square", "spot", (plaza.column + 4) * TILE, (plaza.row + 5) * TILE);

  // Lamps at the corners of the square
  for (const [i, [c, r]] of [
    [plaza.column - 1, plaza.row - 1],
    [plaza.column + plaza.columns, plaza.row - 1],
    [plaza.column - 1, plaza.row + plaza.rows],
    [plaza.column + plaza.columns, plaza.row + plaza.rows],
  ].entries()) {
    if (g.isLand(c, r) && !g.blocked[g.index(c, r)]) {
      g.block(c, r);
      g.point(`lamp_${i}`, "lamp", c * TILE + 6, (r + 1) * TILE - 1);
    }
  }

  const trees = forestTrees(
    g,
    random,
    (c, r) => {
      const border = Math.min(r + 1, g.rows - 3 - r, g.columns - 2 - c);
      return border <= 1 ? 0.9 : 0.06;
    },
    (c, r) =>
      c >= plaza.column - 2 &&
      c <= plaza.column + plaza.columns + 1 &&
      r + 2 >= plaza.row - 9 &&
      r <= plaza.row + plaza.rows + 1,
  );

  const targets = Object.entries(g.points)
    .filter(([, p]) => p.kind === "merchant" || p.kind === "spot")
    .map(([name, p]) => [name, p.x + 8, p.y + 10]);
  if (!reachable(g, new Set(), targets)) return null;

  return finish(g, {
    id: "town",
    edge,
    pier,
    plaza,
    houses,
    fountain,
    trees,
    roadStyle: "stone",
    walkable: new Set(pier.tiles.map(([c, r]) => g.index(c, r))),
  });
}

/** The three regions of a game. */
export const generateRegions = (seed) => ({
  forest: generateForest(seed + 1),
  mine: generateMine(seed + 2),
  town: generateTown(seed + 3),
});
