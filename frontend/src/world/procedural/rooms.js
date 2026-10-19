// Interiors drawn with code: a room (floor, walls, windows) and furniture
// from a catalog, placed so that every piece can be reached from the door.
// The furniture list can come from the language model (the trade of who
// lives there), so a clinic gets cots and herbs, a smithy a forge.

import {
  CLUTTER,
  CLUTTER_FOR,
  FURNITURE,
  WALL_DECOR,
  WALL_DECOR_FOR,
} from "./furniture.js";
import { OUTLINE, rect, seeded, shade } from "./pixel.js";

export { FURNITURE };

const T = 16; // Tile size of the interiors

const FLOORS = {
  wood: "#b98454",
  darkwood: "#7d5236",
  stone: "#8d9096",
  tiles: "#d9c9a8",
};
const ROOM_WALLS = {
  plaster: "#efe0c4",
  wood: "#a8714a",
  stone: "#8a8f96",
};
/** Furniture of a room for a kind of building (when the model gives none). */
export const ROOM_PRESETS = {
  home: [
    "bed",
    "table",
    "stool",
    "stool",
    "shelf",
    "stove",
    "rug",
    "plant",
    "chest",
    "barrel",
  ],
  bakery: [
    "oven",
    "counter",
    "sacks",
    "sacks",
    "table",
    "stool",
    "stool",
    "shelf",
    "barrel",
    "rug",
  ],
  smithy: [
    "forge",
    "anvil",
    "workbench",
    "barrel",
    "crate",
    "crate",
    "bottles",
    "table",
    "stool",
    "chest",
  ],
  clinic: [
    "cot",
    "cot",
    "cot",
    "herbs",
    "cauldron",
    "bottles",
    "desk",
    "plant",
    "stool",
    "rug",
  ],
  tavern: [
    "fireplace",
    "counter",
    "bottles",
    "table",
    "table",
    "stool",
    "stool",
    "stool",
    "barrel",
    "barrel",
  ],
  school: [
    "desk",
    "shelf",
    "shelf",
    "table",
    "stool",
    "stool",
    "stool",
    "rug",
    "plant",
  ],
  shop: [
    "counter",
    "shelf",
    "bottles",
    "crate",
    "crate",
    "sacks",
    "barrel",
    "plant",
  ],
};

// ---------------------------------------------------------------------------
// Placement

/**
 * Places the furniture in a room of `columns` x `rows` tiles (the first two
 * rows are the back wall, the door is in the middle of the bottom row). The
 * player needs 2 free tiles side by side to pass, so every piece must be
 * next to a place like that, connected to the door.
 * @returns {{placed: {name: string, column: number, row: number}[],
 *   blocked: boolean[][], door: number, reachable: Set<string>}}
 */
export function arrangeRoom(columns, rows, furniture, random) {
  const blocked = Array.from({ length: rows }, (_, row) =>
    Array.from({ length: columns }, () => row < 2),
  );
  const door = Math.floor(columns / 2) - 1;
  const reserved = (column, row) =>
    row >= rows - 2 && column >= door - 1 && column <= door + 2;
  const placed = [];

  const fits = (column, row, [w, h]) => {
    if (column < 0 || row < 2 || column + w > columns || row + h > rows - 1) {
      return false;
    }
    for (let r = row; r < row + h; r++) {
      for (let c = column; c < column + w; c++) {
        if (blocked[r][c] || reserved(c, r)) return false;
      }
    }
    return true;
  };

  const setBlocked = (column, row, [w, h], value) => {
    for (let r = row; r < row + h; r++) {
      for (let c = column; c < column + w; c++) blocked[r][c] = value;
    }
  };

  // Where the player can stand: 2 free tiles side by side
  const stands = (c, r) =>
    r >= 2 &&
    r < rows &&
    c >= 0 &&
    c + 1 < columns &&
    !blocked[r][c] &&
    !blocked[r][c + 1];

  const reachableStands = () => {
    const seen = new Set([`${door},${rows - 1}`]);
    const queue = [[door, rows - 1]];
    while (queue.length) {
      const [c, r] = queue.shift();
      for (const [dc, dr] of [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ]) {
        const [nc, nr] = [c + dc, r + dr];
        const key = `${nc},${nr}`;
        if (!seen.has(key) && stands(nc, nr)) {
          seen.add(key);
          queue.push([nc, nr]);
        }
      }
    }
    return seen;
  };

  // Every piece has a place to stand next to it
  const allReachable = () => {
    const seen = reachableStands();
    const touches = ({ column, row, size: [w, h] }) => {
      for (let c = column - 2; c <= column + w; c++) {
        for (let r = row - 1; r <= row + h; r++) {
          const inside =
            c + 1 >= column && c < column + w && r >= row && r < row + h;
          if (!inside && seen.has(`${c},${r}`)) return true;
        }
      }
      return false;
    };
    return placed
      .filter(({ name }) => !FURNITURE[name].walkable)
      .every(({ name, column, row }) =>
        touches({ column, row, size: FURNITURE[name].size }),
      );
  };

  // Rugs first (under everything), then the big pieces
  const order = [...furniture].sort(
    (a, b) =>
      (FURNITURE[b]?.walkable ? 1 : 0) - (FURNITURE[a]?.walkable ? 1 : 0) ||
      (FURNITURE[b]?.size[0] ?? 0) * (FURNITURE[b]?.size[1] ?? 0) -
        (FURNITURE[a]?.size[0] ?? 0) * (FURNITURE[a]?.size[1] ?? 0),
  );

  for (const name of order) {
    const item = FURNITURE[name];
    if (!item) continue;
    const candidates = [];

    for (let row = 2; row < rows - 1; row++) {
      for (let column = 0; column < columns; column++) {
        const atWall = row === 2;
        const atSide = column === 0 || column + item.size[0] === columns;
        const inMiddle =
          row >= 4 && column >= 1 && column + item.size[0] <= columns - 1;
        if (item.place === "wall" && !atWall) continue;
        if (item.place === "corner" && !atWall && !atSide) continue;
        if (item.place === "floor" && !inMiddle) continue;
        if (fits(column, row, item.size)) candidates.push([column, row]);
      }
    }

    for (let attempt = 0; attempt < 14 && candidates.length; attempt++) {
      const index = Math.floor(random() * candidates.length);
      const [column, row] = candidates.splice(index, 1)[0];
      if (item.walkable) {
        placed.push({ name, column, row });
        break;
      }
      setBlocked(column, row, item.size, true);
      placed.push({ name, column, row });
      if (allReachable()) break;
      placed.pop();
      setBlocked(column, row, item.size, false);
    }
  }

  return { placed, blocked, door, reachable: reachableStands() };
}

// ---------------------------------------------------------------------------
// Drawing

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} spec
 * @param {number} spec.columns
 * @param {number} spec.rows
 * @param {keyof FLOORS} spec.floor
 * @param {keyof ROOM_WALLS} spec.wall
 * @param {string[]} spec.furniture
 * @param {number} spec.seed
 */
export function drawRoom(ctx, spec, x, y) {
  const random = seeded(spec.seed);
  const { columns, rows } = spec;
  const width = columns * T;
  const height = rows * T;
  const layout = arrangeRoom(
    columns,
    rows,
    spec.furniture,
    seeded(spec.seed + 1),
  );

  drawFloor(ctx, spec.floor, random, x, y + 2 * T, width, height - 2 * T);
  drawBackWall(ctx, spec.wall, random, x, y, width);

  // Light coming in from the windows
  const windows = Math.max(1, Math.floor(columns / 5));
  const windowColumns = [];
  for (let i = 0; i < windows; i++) {
    const wx = x + Math.round(((i + 0.5) * width) / windows) - 8;
    windowColumns.push(Math.round((wx - x + 8) / T));
    rect(ctx, "#5a3a26", wx - 1, y + 5, 18, 16);
    rect(ctx, "#9ccbe8", wx + 1, y + 7, 14, 12);
    rect(ctx, "#d6eefa", wx + 2, y + 8, 4, 3);
    rect(ctx, "#5a3a26", wx + 7, y + 7, 2, 12);
    rect(ctx, "#5a3a26", wx + 1, y + 12, 14, 2);
    const beam = ctx.createLinearGradient(0, y + 2 * T, 0, y + 2 * T + 40);
    beam.addColorStop(0, "rgba(255, 245, 200, 0.16)");
    beam.addColorStop(1, "rgba(255, 245, 200, 0)");
    ctx.fillStyle = beam;
    ctx.beginPath();
    ctx.moveTo(wx, y + 2 * T);
    ctx.lineTo(wx + 16, y + 2 * T);
    ctx.lineTo(wx + 24, y + 2 * T + 40);
    ctx.lineTo(wx - 6, y + 2 * T + 40);
    ctx.fill();
  }

  // Rugs, then the rest from the back to the front
  const sorted = [...layout.placed].sort(
    (a, b) =>
      (FURNITURE[b.name].walkable ? 1 : 0) -
        (FURNITURE[a.name].walkable ? 1 : 0) || a.row - b.row,
  );
  // Things on the back wall, where there is no window or tall furniture
  const trade = spec.trade ?? "home";
  const wallFree = (column) =>
    !layout.placed.some(
      (piece) =>
        FURNITURE[piece.name].place === "wall" &&
        column >= piece.column - 1 &&
        column <= piece.column + FURNITURE[piece.name].size[0],
    ) && !windowColumns.some((wc) => Math.abs(wc - column) <= 1);
  const decor = WALL_DECOR_FOR[trade] ?? WALL_DECOR_FOR.home;
  let decorIndex = 0;
  for (let column = 1; column < columns - 1 && decorIndex < 3; column += 2) {
    if (wallFree(column) && random.chance(0.7)) {
      WALL_DECOR[decor[decorIndex % decor.length]](
        ctx,
        x + column * T,
        y,
        random,
      );
      decorIndex++;
    }
  }

  // Small things on the floor, away from the way of the door
  const clutter = CLUTTER_FOR[trade] ?? CLUTTER_FOR.home;
  const occupied = new Set(
    layout.placed.flatMap(({ name, column, row }) => {
      const [w, h] = FURNITURE[name].size;
      return Array.from(
        { length: w * h },
        (_, i) => `${column + (i % w)},${row + Math.floor(i / w)}`,
      );
    }),
  );
  let clutterIndex = 0;
  for (let row = 2; row < rows - 2 && clutterIndex < clutter.length; row++) {
    for (const column of [0, columns - 1]) {
      if (clutterIndex >= clutter.length || occupied.has(`${column},${row}`))
        continue;
      if (layout.blocked[row][column] || !random.chance(0.35)) continue;
      CLUTTER[clutter[clutterIndex++]](ctx, x + column * T, y + row * T);
    }
  }

  for (const { name, column, row } of sorted) {
    FURNITURE[name].draw(ctx, x + column * T, y + row * T, random);
  }

  // Side walls, bottom wall and the door mat
  rect(ctx, OUTLINE, x - 3, y, 3, height);
  rect(ctx, OUTLINE, x + width, y, 3, height);
  rect(ctx, OUTLINE, x - 3, y + height, width + 6, 3);
  const doorX = x + layout.door * T;
  rect(ctx, "#5a3a26", doorX + 4, y + height - 6, 24, 9);
  rect(ctx, "#8a5a38", doorX + 6, y + height - 4, 20, 5);
  for (let px = doorX + 7; px < doorX + 25; px += 3)
    rect(ctx, "#6e4430", px, y + height - 4, 1, 5);

  return layout;
}

function drawFloor(ctx, kind, random, x, y, width, height) {
  const base = FLOORS[kind] ?? FLOORS.wood;

  if (kind === "stone") {
    // Flagstones of different sizes, with light on the top left
    rect(ctx, shade(base, -0.45), x, y, width, height);
    for (let row = 0; row * 8 < height; row++) {
      let px = x - random.int(0, 6);
      while (px < x + width) {
        const w = random.int(8, 14);
        const left = Math.max(x, px + 1);
        const right = Math.min(x + width, px + w);
        const top = y + row * 8 + 1;
        if (right > left) {
          const tone = random() * 0.18 - 0.09;
          rect(ctx, shade(base, tone), left, top, right - left, 6);
          rect(ctx, shade(base, tone + 0.14), left, top, right - left, 1);
          rect(ctx, shade(base, tone + 0.08), left, top, 1, 6);
          rect(ctx, shade(base, tone - 0.16), left, top + 5, right - left, 1);
          if (random.chance(0.12))
            rect(ctx, "#5f8a5a", left + 1, top + 4, 2, 1);
          if (random.chance(0.15)) {
            rect(ctx, shade(base, -0.3), left + 2, top + 2, 1, 2);
            rect(ctx, shade(base, -0.3), left + 3, top + 3, 2, 1);
          }
        }
        px += w;
      }
    }
  } else if (kind === "tiles") {
    // Ceramic tiles with soft grout and a little shine
    rect(ctx, shade(base, -0.12), x, y, width, height);
    for (let row = 0; row * 8 < height; row++) {
      for (let column = 0; column * 8 < width; column++) {
        const color = (row + column) % 2 ? base : shade(base, -0.07);
        const tx = x + column * 8;
        const ty = y + row * 8;
        rect(ctx, color, tx, ty, 7, 7);
        rect(ctx, shade(color, 0.1), tx, ty, 7, 1);
        if (random.chance(0.06))
          rect(ctx, shade(color, 0.2), tx + 2, ty + 2, 2, 1);
      }
    }
  } else {
    // Wooden planks of different tones, with grain, nails and knots
    for (let row = 0; row * 5 < height; row++) {
      const py = y + row * 5;
      let px = x - ((row * 11) % 28);
      while (px < x + width) {
        const length = random.int(20, 34);
        const left = Math.max(x, px);
        const right = Math.min(x + width, px + length);
        const tone = random() * 0.12 - 0.06;
        const plank = shade(base, tone);
        rect(ctx, plank, left, py, right - left, 4);
        rect(ctx, shade(base, tone + 0.1), left, py, right - left, 1);
        for (let gx = left + 2; gx < right - 3; gx += random.int(5, 9)) {
          rect(ctx, shade(base, tone - 0.12), gx, py + 2, random.int(2, 4), 1);
        }
        if (random.chance(0.15)) {
          const kx = left + random.int(3, Math.max(4, right - left - 4));
          rect(ctx, shade(base, -0.35), kx, py + 1, 2, 2);
        }
        if (px + length < x + width) {
          rect(ctx, shade(base, -0.4), px + length - 1, py, 1, 4);
          rect(ctx, "#d9c6a5", px + length - 3, py + 1, 1, 1);
          rect(ctx, "#d9c6a5", px + length - 3, py + 3, 1, 1);
        }
        px += length;
      }
      rect(ctx, shade(base, -0.4), x, py + 4, width, 1);
    }
  }

  // Darker corners near the walls
  rect(ctx, "rgba(0, 0, 0, 0.12)", x, y, 3, height);
  rect(ctx, "rgba(0, 0, 0, 0.12)", x + width - 3, y, 3, height);
}

function drawBackWall(ctx, kind, random, x, y, width) {
  const base = ROOM_WALLS[kind] ?? ROOM_WALLS.plaster;
  const height = 2 * T;
  const wainscot = 10;

  rect(ctx, base, x, y, width, height);

  if (kind === "wood") {
    for (let px = x; px < x + width; px += 6) {
      const tone = random() * 0.12 - 0.06;
      rect(ctx, shade(base, tone), px, y, 5, height);
      rect(ctx, shade(base, tone + 0.12), px, y, 1, height);
      rect(ctx, shade(base, -0.35), px + 5, y, 1, height);
      if (random.chance(0.3))
        rect(
          ctx,
          shade(base, -0.25),
          px + 2,
          y + random.int(4, height - 6),
          2,
          2,
        );
    }
    rect(ctx, shade(base, -0.4), x, y + 12, width, 2);
  } else if (kind === "stone") {
    for (let row = 0; row * 6 < height; row++) {
      for (let px = x - (row % 2) * 5; px < x + width; px += 10) {
        const left = Math.max(x, px + 1);
        const right = Math.min(x + width, px + 9);
        if (right <= left) continue;
        const tone = random() * 0.16 - 0.08;
        rect(ctx, shade(base, tone), left, y + row * 6 + 1, right - left, 4);
        rect(
          ctx,
          shade(base, tone + 0.14),
          left,
          y + row * 6 + 1,
          right - left,
          1,
        );
        rect(
          ctx,
          shade(base, tone - 0.14),
          left,
          y + row * 6 + 4,
          right - left,
          1,
        );
      }
    }
  } else {
    // Plaster with texture, wooden posts and a panelled lower part
    for (let i = 0; i < width; i++) {
      rect(
        ctx,
        shade(base, random.chance(0.5) ? -0.05 : 0.04),
        x + random.int(0, width - 1),
        y + random.int(2, height - wainscot - 1),
      );
    }
    for (let px = x + 40; px < x + width - 8; px += 48) {
      rect(ctx, OUTLINE, px - 1, y, 6, height - wainscot);
      rect(ctx, "#8a5a38", px, y, 4, height - wainscot);
      rect(ctx, "#a8714a", px, y, 1, height - wainscot);
    }
    rect(ctx, "#8a5a38", x, y + 3, width, 2);
    rect(ctx, "#a8714a", x, y + 3, width, 1);
    // Wainscot panels
    rect(ctx, "#8a5a38", x, y + height - wainscot, width, wainscot);
    for (let px = x + 2; px < x + width - 6; px += 12) {
      rect(ctx, "#7a4e30", px, y + height - wainscot + 2, 10, wainscot - 5);
      rect(ctx, "#a8714a", px, y + height - wainscot + 2, 10, 1);
    }
    rect(ctx, "#c98f5d", x, y + height - wainscot, width, 1);
  }

  rect(ctx, OUTLINE, x, y, width, 2);
  rect(ctx, "#5a3626", x, y + height - 3, width, 3);
  rect(ctx, "#8a5a38", x, y + height - 3, width, 1);
  rect(ctx, "rgba(0, 0, 0, 0.22)", x, y + height, width, 3);
  rect(ctx, "rgba(0, 0, 0, 0.1)", x, y + height + 3, width, 2);
}

/** Description of a room for a kind of building (trade). */
export function roomFor(trade, seed, furniture = null) {
  const random = seeded(seed);
  const looks = {
    smithy: { floor: "stone", wall: "stone" },
    bakery: { floor: "tiles", wall: "plaster" },
    clinic: { floor: "tiles", wall: "plaster" },
    tavern: { floor: "darkwood", wall: "wood" },
    shop: { floor: "wood", wall: "wood" },
  };
  const preset = ROOM_PRESETS[trade] ?? ROOM_PRESETS.home;

  return {
    columns: random.int(10, 12),
    rows: random.int(7, 8),
    floor: random.pick(["wood", "darkwood"]),
    wall: random.pick(["plaster", "wood"]),
    ...looks[trade],
    trade,
    furniture: furniture?.length ? furniture : preset,
    seed,
  };
}

// Where the people of the room stand: in front of these pieces
const KEEPER_PIECES = [
  "counter",
  "workbench",
  "forge",
  "oven",
  "desk",
  "cauldron",
];
const LIGHT_PIECES = ["stove", "fireplace", "forge", "oven", "cauldron"];

/**
 * A room ready for the game: its picture and the same data an interior made
 * in Tiled has (collisions, and the points: entrance, exit mat, where the
 * villagers stay, counter, bed and lights). See levels/world.js.
 */
export function buildRoom(spec) {
  const canvas = document.createElement("canvas");
  canvas.width = spec.columns * T;
  canvas.height = spec.rows * T;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  drawRoom(ctx, spec, 0, 0);
  return { canvas, map: roomMap(spec) };
}

/**
 * The data of a room for the game, without drawing it (the same layout the
 * drawing uses): collisions and points. Tested with node.
 */
export function roomMap(spec) {
  const { columns, rows } = spec;
  const layout = arrangeRoom(
    columns,
    rows,
    spec.furniture,
    seeded(spec.seed + 1),
  );

  const collisions = layout.blocked.flat().map((blocked) => (blocked ? 1 : 0));
  // Where the player (16 x 12) stands on the tiles (column, column + 1) of
  // `row`, aligned with the 12 px collision cells of the world (interiors
  // start on multiples of 12), so every cell under them is on those tiles
  const cell = 12;
  const aligned = (start) => Math.ceil((start - cell / 2) / cell) * cell;
  const stand = ([column, row]) => ({
    x: aligned(column * T),
    y: aligned(row * T),
    width: 0,
    height: 0,
  });
  const reachable = [...layout.reachable].map((key) =>
    key.split(",").map(Number),
  );
  const nearest = (column, row) =>
    reachable
      .filter(([, r]) => r < rows - 1)
      .sort(
        (a, b) =>
          Math.hypot(a[0] - column, a[1] - row) -
          Math.hypot(b[0] - column, b[1] - row),
      )[0];

  const points = {
    entrance: { ...stand([layout.door, rows - 2]), kind: "entrance" },
    exit: {
      x: layout.door * T,
      y: (rows - 1) * T,
      width: 2 * T,
      height: T,
      kind: "exit",
    },
    center: {
      ...stand(nearest(Math.floor(columns / 2) - 1, Math.floor(rows / 2) + 1)),
      kind: "center",
    },
  };

  const pieces = layout.placed;
  const keeper = pieces.find((piece) => KEEPER_PIECES.includes(piece.name));
  if (keeper) {
    const [w, h] = FURNITURE[keeper.name].size;
    const spot = nearest(keeper.column + Math.floor(w / 2) - 1, keeper.row + h);
    points.keeper = { ...stand(spot), kind: "spot" };
    points.counter = {
      x: spot[0] * T + 8,
      y: spot[1] * T + 6,
      width: 0,
      height: 0,
      kind: "counter",
    };
  }
  const bed = pieces.find(
    (piece) => piece.name === "bed" || piece.name === "cot",
  );
  if (bed) {
    const spot = nearest(bed.column + 1, bed.row + 1);
    points.bed = { ...stand(spot), kind: "spot" };
    points.rest = {
      x: spot[0] * T + 8,
      y: spot[1] * T + 6,
      width: 0,
      height: 0,
      kind: "rest",
    };
  }
  // A few more places to stay, spread over the room
  const spread = seeded(spec.seed + 7);
  for (let i = 0; i < 3 && reachable.length; i++) {
    points[`spot_${i}`] = {
      ...stand(spread.pick(reachable.filter(([, r]) => r < rows - 1))),
      kind: "spot",
    };
  }
  pieces
    .filter((piece) => LIGHT_PIECES.includes(piece.name))
    .forEach((piece, i) => {
      const [w] = FURNITURE[piece.name].size;
      points[`light_${i}`] = {
        x: (piece.column + w / 2) * T,
        y: piece.row * T + 4,
        width: 0,
        height: 0,
        kind: "light",
      };
    });

  return {
    width: columns,
    height: rows,
    tileWidth: T,
    tileHeight: T,
    collisions,
    points,
    floor: spec.floor,
  };
}
