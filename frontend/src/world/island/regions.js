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

/**
 * @param {number} seed
 * @param {number} [growth] How much the forest grew where nobody cut it
 *   (0..3, see backend game/Regions.js): trees near the trail can be cut.
 */
export function generateForest(seed, growth = 0) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const layout = tryForest(seed + attempt * 101, growth);
    if (layout) return { ...layout, seed };
  }
  throw new Error(`No forest from seed ${seed}`);
}

function tryForest(seed, growth) {
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

  // What grew (after everything else, so the rest stays the same)
  growTrees(g, decor, trail, growth * 2);

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

/**
 * The forest grew: the decorative trees closest to the trail (that the
 * player can reach) become trees to cut, named after the others.
 */
function growTrees(g, decor, trail, count) {
  let next = Object.values(g.points).filter((p) => p.kind === "tree").length;
  const candidates = decor
    .filter((tree) => tree.row >= 0)
    .map((tree) => ({
      tree,
      distance: distanceTo(trail, tree.column, tree.row + 2),
    }))
    .sort((a, b) => a.distance - b.distance);

  for (const { tree } of candidates) {
    if (count <= 0) break;
    const point = [(tree.column + 1) * TILE, (tree.row + 2) * TILE + 10];
    if (!reachable(g, new Set(), [["tree", ...point]])) continue;
    decor.splice(decor.indexOf(tree), 1);
    g.point(`tree_${next++}`, "tree", ...point);
    count--;
  }
}

// ---------------------------------------------------------------------------
// Mine

/**
 * @param {number} seed
 * @param {number} [galleries] Galleries opened after a lot of mining (0..2).
 */
export function generateMine(seed, galleries = 0) {
  for (let attempt = 0; attempt < 30; attempt++) {
    const layout = tryMine(seed + attempt * 131, galleries);
    if (layout) return { ...layout, seed };
  }
  throw new Error(`No mine from seed ${seed}`);
}

function tryMine(seed, galleries) {
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

  // Galleries dug later (with their own random numbers: the rest stays)
  const dig = seeded(seed + 977);
  for (let i = 0; i < galleries; i++) digGallery(g, dig, nodes, torches);

  return finish(g, { id: "mine", nodes, boulders, torches, dark: true });
}

const DIRECTIONS = [
  [1, 0],
  [-1, 0],
  [0, -1],
];

/**
 * A new gallery: a tunnel (2 tiles wide) from the wall of the cave into the
 * rock and a chamber at its end, with ore, a crystal and a torch.
 */
function digGallery(g, random, nodes, torches) {
  const inner = (c, r) =>
    c >= 1 && r >= 2 && c < g.columns - 1 && r < g.rows - 3;
  // Where the gallery fits: a tunnel, then the chamber, all in the rock
  const plan = (c, r, [dc, dr], length, [w, h]) => {
    const tiles = [];
    for (let step = 1; step <= length; step++) {
      const [x, y] = [c + dc * step, r + dr * step];
      tiles.push([x, y], dc ? [x, y + 1] : [x + 1, y]);
    }
    const [ec, er] = [c + dc * (length + 1), r + dr * (length + 1)];
    const chamber = {
      column: dc > 0 ? ec : dc < 0 ? ec - w + 1 : ec - Math.floor((w - 2) / 2),
      row: dr < 0 ? er - h + 1 : er - 1,
      columns: w,
    };
    for (let y = chamber.row; y < chamber.row + h; y++) {
      for (let x = chamber.column; x < chamber.column + w; x++)
        tiles.push([x, y]);
    }
    return tiles.every(([x, y]) => inner(x, y) && !g.isLand(x, y))
      ? { tiles, chamber }
      : null;
  };

  for (let attempt = 0; attempt < 400; attempt++) {
    const c = random.int(2, g.columns - 3);
    const r = random.int(3, g.rows - 6);
    const direction = random.pick(DIRECTIONS);
    if (!g.isLand(c, r) || g.isLand(c + direction[0], r + direction[1])) {
      continue;
    }
    const length = random.int(1, 4);
    const found = [
      [5, 4],
      [4, 3],
      [3, 3],
    ]
      .map((size) => plan(c, r, direction, length, size))
      .find(Boolean);
    if (!found) continue;
    const { tiles, chamber } = found;

    const before = g.land.slice();
    tiles.forEach(([x, y]) => (g.land[g.index(x, y)] = 1));

    // Ore and a crystal by the walls of the chamber, a torch above it
    const count = (kind) => nodes.filter((n) => n.kind === kind).length;
    const added = [];
    const last = chamber.column + chamber.columns - 1;
    const spots = [
      ["ore", chamber.column, chamber.row],
      ["ore", last, chamber.row],
      ...(chamber.columns >= 5
        ? [["crystal", chamber.column + 2, chamber.row]]
        : []),
    ];
    for (const [kind, x, y] of spots) {
      if (!g.isLand(x, y + 1)) continue;
      const node = { kind, column: x, row: y };
      g.block(x, y);
      added.push({ node, name: `${kind}_${count(kind)}` });
      nodes.push(node);
      g.point(added.at(-1).name, kind, x * TILE + 6, (y + 1) * TILE + 8);
    }
    const ok = reachable(
      g,
      new Set(),
      added.map(({ node }) => [
        node.kind,
        node.column * TILE + 6,
        (node.row + 1) * TILE + 8,
      ]),
    );
    if (!ok || !added.length) {
      // Undo: the gallery doesn't fit here
      g.land.set(before);
      for (const { node, name } of added) {
        g.blocked[g.index(node.column, node.row)] = 0;
        nodes.splice(nodes.indexOf(node), 1);
        delete g.points[name];
      }
      continue;
    }

    const torch = { column: chamber.column + 1, row: chamber.row - 1 };
    if (inner(torch.column, torch.row) && !g.isLand(torch.column, torch.row)) {
      torches.push(torch);
      g.point(
        `torch_${torches.length}`,
        "light",
        torch.column * TILE + 6,
        (torch.row + 1) * TILE,
      );
    }
    return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Town (Pedravento)

const TOWN_HOUSES = [
  { trade: "tavern", sign: "mug" },
  { trade: "smithy" },
  { trade: "shop" },
  { trade: "home" },
];

/**
 * @param {number} seed
 * @param {number} [buildings] New buildings of a richer town (0..2).
 */
export function generateTown(seed, buildings = 0) {
  for (let attempt = 0; attempt < 20; attempt++) {
    const layout = tryTown(seed + attempt * 211, buildings);
    if (layout) return { ...layout, seed };
  }
  throw new Error(`No town from seed ${seed}`);
}

function tryTown(seed, buildings) {
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
  const addHouse = (column, row, spec) => {
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
    return footprint;
  };
  const order = [...TOWN_HOUSES].sort(() => random() - 0.5);
  for (let i = 0; i < 3; i++) {
    const column = plaza.column + i * 6 - 1 + (i === 0 ? 1 : 0);
    const row = plaza.row - 8;
    const spec = { ...houseFor(order[i].trade, seed + i * 17), door: "center" };
    spec.width = Math.min(spec.width, 60);
    if (order[i].sign) spec.sign = order[i].sign;
    const footprint = addHouse(column, row, spec);
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

  // Buildings of a richer town, east and west of the others
  const growth = [
    [
      [plaza.column + plaza.columns + 1, plaza.column + plaza.columns],
      order[3].trade,
    ],
    [[plaza.column - 7, plaza.column - 6], "bakery"],
  ];
  for (const [columns, trade] of growth.slice(0, buildings)) {
    columns.some((column) =>
      buildInTown(g, {
        column,
        row: plaza.row - 8,
        trade,
        seed,
        plaza,
        trees,
        addHouse,
      }),
    );
  }

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

/**
 * A new building of the town on 6 x 8 tiles (trees there are cut), with a
 * path from its door to the square.
 */
function buildInTown(g, { column, row, trade, seed, plaza, trees, addHouse }) {
  for (let r = row; r < row + 8; r++) {
    for (let c = column; c < column + 6; c++) {
      if (!g.isLand(c, r) || g.roads.has(g.index(c, r))) return false;
    }
  }
  const overlaps = (tree) =>
    tree.column + 1 >= column &&
    tree.column <= column + 5 &&
    tree.row + 2 >= row &&
    tree.row <= row + 7;
  const lamps = Object.entries(g.points).filter(([, p]) => {
    const [c, r] = [Math.floor(p.x / TILE), Math.floor(p.y / TILE)];
    return (
      p.kind === "lamp" &&
      c >= column &&
      c < column + 6 &&
      r >= row &&
      r <= row + 8
    );
  });
  const blocked = (c, r) =>
    g.blocked[g.index(c, r)] &&
    !trees.some(
      (t) =>
        overlaps(t) &&
        t.row + 2 === r &&
        (t.column === c || t.column + 1 === c),
    ) &&
    !lamps.some(
      ([, p]) =>
        Math.floor(p.x / TILE) === c && Math.floor((p.y + 1) / TILE) - 1 === r,
    );
  for (let r = row; r < row + 8; r++) {
    for (let c = column; c < column + 6; c++) if (blocked(c, r)) return false;
  }

  // The building takes the place of the trees and lamps there
  for (const tree of trees.filter(overlaps)) {
    trees.splice(trees.indexOf(tree), 1);
    g.blocked[g.index(tree.column, tree.row + 2)] = 0;
    g.blocked[g.index(tree.column + 1, tree.row + 2)] = 0;
  }
  for (const [name, p] of lamps) {
    g.blocked[
      g.index(Math.floor(p.x / TILE), Math.floor((p.y + 1) / TILE) - 1)
    ] = 0;
    delete g.points[name];
  }

  const spec = { ...houseFor(trade, seed + column * 31), door: "center" };
  spec.width = Math.min(spec.width, 60);
  const footprint = addHouse(column, row, spec);

  // Path down from the door, then along the square
  const doorC = Math.floor(footprint.door.x / TILE);
  for (let r = row + 7; r <= plaza.row + 1; r++) {
    g.roads.add(g.index(doorC, r));
    g.roads.add(g.index(doorC + 1, r));
  }
  const [from, to] =
    doorC > plaza.column
      ? [plaza.column + plaza.columns, doorC]
      : [doorC, plaza.column - 1];
  for (let c = from; c <= to; c++) {
    g.roads.add(g.index(c, plaza.row));
    g.roads.add(g.index(c, plaza.row + 1));
  }
  return true;
}

// ---------------------------------------------------------------------------
// Islets (found exploring the open sea)

export const ISLET_COLUMNS = 30;
export const ISLET_ROWS = 20;

/**
 * A small island nobody lives on: a beach with the pier on the west, a
 * trail, a few trees to cut, bushes and a chest half buried. `landmark`:
 * "gulls" (rocks with nests), "lighthouse" (ruins) or "wreck" (an old
 * ship on the beach).
 */
export function generateIslet(seed, landmark = "gulls") {
  for (let attempt = 0; attempt < 30; attempt++) {
    const layout = tryIslet(seed + attempt * 173, landmark);
    if (layout) return { ...layout, seed };
  }
  throw new Error(`No islet from seed ${seed}`);
}

function tryIslet(seed, landmark) {
  const random = seeded(seed);
  const noise = valueNoise(seed);
  const g = grid(ISLET_COLUMNS, ISLET_ROWS);

  // A round island, a bit irregular, away from the borders
  for (let r = 2; r < g.rows - 2; r++) {
    for (let c = 3; c < g.columns - 2; c++) {
      const dx = (c - g.columns / 2) / (g.columns / 2.3);
      const dy = (r - g.rows / 2) / (g.rows / 2.4);
      const value = noise(c * 0.2, r * 0.2) * 0.5 + (1 - Math.hypot(dx, dy));
      if (value > 0.42) g.land[g.index(c, r)] = 1;
    }
  }
  // Keep the part with the middle
  const middle = [Math.floor(g.columns / 2), Math.floor(g.rows / 2)];
  if (!g.isLand(...middle)) return null;
  const seen = new Set([g.index(...middle)]);
  const queue = [middle];
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
  if (seen.size < 160) return null;

  const edge = edges(g);
  edge.forEach((value, i) => value && (g.blocked[i] = 1));

  const harborRow = random.int(
    Math.floor(g.rows / 2) - 3,
    Math.floor(g.rows / 2) + 1,
  );
  let shore = 0;
  while (shore < g.columns && !g.isLand(shore, harborRow)) shore++;
  if (shore < 3 || !g.isLand(shore, harborRow + 1)) return null;
  // Where the player gets off must be inside the land (not on its edge)
  for (const [c, r] of [
    [shore + 1, harborRow],
    [shore + 2, harborRow],
    [shore + 1, harborRow + 1],
  ]) {
    if (!g.isLand(c, r) || g.blocked[g.index(c, r)]) return null;
  }
  const pier = harbor(g, harborRow);
  pier.landing.forEach(([c, r]) => (g.blocked[g.index(c, r)] = 0));

  // The landmark, on the east side
  const landmarks = [];
  const size = { gulls: [2, 2], lighthouse: [3, 3], wreck: [5, 2] }[landmark];
  for (let attempt = 0; attempt < 200 && !landmarks.length; attempt++) {
    const c = random.int(Math.floor(g.columns / 2), g.columns - 4 - size[0]);
    const r = random.int(3, g.rows - 4 - size[1]);
    if (!g.areaFree(c - 1, r - 1, size[0] + 2, size[1] + 2)) continue;
    g.block(c, r, ...size);
    g.take(c - 1, r - 1, size[0] + 2, size[1] + 2);
    landmarks.push({ kind: landmark, column: c, row: r });
  }
  if (!landmarks.length) return null;
  if (landmark === "gulls") {
    // More rocks with nests around
    for (let attempt = 0; attempt < 80 && landmarks.length < 4; attempt++) {
      const c = random.int(4, g.columns - 5);
      const r = random.int(3, g.rows - 4);
      if (!g.areaFree(c - 1, r - 1, 3, 3)) continue;
      g.block(c, r);
      g.take(c - 1, r - 1, 3, 3);
      landmarks.push({ kind: "rock", column: c, row: r });
    }
  }

  // Chest near the landmark and a trail from the pier to it
  const main = landmarks[0];
  const chest = { column: main.column - 2, row: main.row + size[1] };
  if (!g.free(chest.column, chest.row)) return null;
  g.block(chest.column, chest.row);
  g.point(
    "islet_chest",
    "islet_chest",
    chest.column * TILE + 6,
    (chest.row + 1) * TILE + 8,
  );
  const trail = route(
    g,
    [Math.floor(g.points.arrival.x / TILE), harborRow],
    [chest.column, chest.row + 1],
    (c, r) =>
      g.isLand(c, r) && !edge[g.index(c, r)] && !g.blocked[g.index(c, r)]
        ? 1 + noise(c * 0.4, r * 0.4) * 3
        : Infinity,
  );
  if (!trail) return null;
  addRoad(g, trail);
  for (const [c, r] of trail) g.take(c - 1, r - 1, 3, 3);

  // Trees to cut and bushes, near the trail
  const nodes = [];
  let trees = 0;
  for (let attempt = 0; attempt < 300 && trees < 3; attempt++) {
    const [tc, tr] = trail[random.int(1, trail.length - 1)];
    const c = tc + random.int(-4, 3);
    const r = tr + random.pick([-5, -4, 2, 3]);
    if (!g.inside(c, r) || !g.inside(c + 1, r + 3)) continue;
    if (!g.areaFree(c, r, 2, 3) || !g.isLand(c, r + 3)) continue;
    if (nodes.some(([x, y]) => Math.abs(x - c) < 4 && Math.abs(y - r) < 4))
      continue;
    g.take(c - 1, r, 4, 4);
    g.block(c, r + 2, 2, 1);
    g.point(`tree_${trees}`, "tree", (c + 1) * TILE, (r + 2) * TILE + 10);
    nodes.push([c, r + 2]);
    trees++;
  }
  let bushes = 0;
  for (let attempt = 0; attempt < 300 && bushes < 4; attempt++) {
    const c = random.int(3, g.columns - 4);
    const r = random.int(3, g.rows - 4);
    if (
      !g.free(c, r) ||
      nodes.some(([x, y]) => Math.abs(x - c) < 3 && Math.abs(y - r) < 3)
    )
      continue;
    g.take(c, r);
    g.point(`forage_${bushes}`, "forage", c * TILE + 6, r * TILE + 8);
    nodes.push([c, r]);
    bushes++;
  }
  if (bushes < 2) return null;

  const decor = forestTrees(
    g,
    random,
    (c, r) => 0.1 + noise(c * 0.25, r * 0.25, 4) * 0.3,
    (c, r) => distanceTo(nodes, c, r + 2) < 2,
  );

  const targets = Object.entries(g.points)
    .filter(([, p]) => ["tree", "forage", "islet_chest"].includes(p.kind))
    .map(([name, p]) => [name, p.x, p.y]);
  if (!reachable(g, new Set(), targets)) return null;

  return finish(g, {
    id: "islet",
    landmark,
    landmarks,
    edge,
    pier,
    trees: decor,
    roadStyle: "sand",
    grass: [128, 196, 92],
    grassTuft: [98, 170, 74],
    walkable: new Set(pier.tiles.map(([c, r]) => g.index(c, r))),
  });
}

export const ISLETS = {
  islet_1: "gulls",
  islet_2: "lighthouse",
  islet_3: "wreck",
};

const GENERATORS = {
  forest: generateForest,
  mine: generateMine,
  town: generateTown,
};

/** One region (`seed` is the one of its layout) at a level of growth. */
export const generateRegion = (id, seed, level = 0) =>
  ISLETS[id]
    ? { ...generateIslet(seed, ISLETS[id]), id }
    : GENERATORS[id](seed, level);

/**
 * The three regions of a game.
 * @param {number} seed
 * @param {{forest?: number, mine?: number, town?: number}} [levels] How much
 *   each one changed (see backend game/Regions.js).
 */
export const generateRegions = (seed, levels = {}) => ({
  forest: generateForest(seed + 1, levels.forest ?? 0),
  mine: generateMine(seed + 2, levels.mine ?? 0),
  town: generateTown(seed + 3, levels.town ?? 0),
  ...Object.fromEntries(
    Object.entries(ISLETS).map(([id, landmark], i) => [
      id,
      { ...generateIslet(seed + 11 + i, landmark), id },
    ]),
  ),
});
