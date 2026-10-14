// Draws the regions reached by boat (see regions.js) in the same pixel art
// as the island. Things that change (trees cut, rocks mined, bushes picked,
// tents, stalls, merchants...) are props of world/Regions.js; here is what
// stays the same. Returns the background and the foreground of each region.

import { buildHouse } from "../procedural/houses.js";
import { OUTLINE, rect, seeded, shade } from "../procedural/pixel.js";
import { TILE } from "./layout.js";
import { paintGround, paintPier, paintTree } from "./paint.js";

const canvases = (layout) => {
  const make = () => {
    const canvas = document.createElement("canvas");
    canvas.width = layout.columns * TILE;
    canvas.height = layout.rows * TILE;
    return canvas;
  };
  const background = make();
  const foreground = make();
  return {
    background,
    foreground,
    bg: background.getContext("2d"),
    fg: foreground.getContext("2d"),
  };
};

const hash = (x, y, seed) => {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

const trees = (bg, fg, layout, random) =>
  [...layout.trees]
    .sort((a, b) => a.row - b.row)
    .forEach((tree) => paintTree(bg, fg, tree, random));

// ---------------------------------------------------------------------------

function paintCrate(ctx, x, y) {
  rect(ctx, "rgba(0, 0, 0, 0.2)", x + 1, y + 10, 11, 3);
  rect(ctx, OUTLINE, x, y, 12, 11);
  rect(ctx, "#b07848", x + 1, y + 1, 10, 9);
  rect(ctx, "#c98f5d", x + 1, y + 1, 10, 1);
  rect(ctx, "#7d5232", x + 1, y + 5, 10, 1);
  rect(ctx, "#7d5232", x + 5, y + 1, 1, 9);
}

function paintChest(ctx, x, y) {
  rect(ctx, "rgba(0, 0, 0, 0.2)", x + 1, y + 10, 12, 3);
  rect(ctx, OUTLINE, x, y + 1, 13, 11);
  rect(ctx, "#9a6240", x + 1, y + 5, 11, 6);
  rect(ctx, "#b07848", x + 1, y + 2, 11, 3);
  rect(ctx, "#c98f5d", x + 1, y + 2, 11, 1);
  rect(ctx, "#e2b73c", x + 1, y + 5, 11, 1);
  rect(ctx, "#e2b73c", x + 5, y + 6, 3, 3);
}

export function paintForest(layout) {
  const { background, foreground, bg, fg } = canvases(layout);
  const random = seeded(layout.seed + 5);

  paintGround(bg, layout);
  paintPier(bg, layout);

  for (const { x, y } of layout.mushrooms) {
    rect(bg, "#efe3cf", x, y, 1, 2);
    rect(bg, OUTLINE, x - 2, y - 2, 5, 3);
    rect(
      bg,
      random.pick(["#c4475d", "#d98a3a", "#8a5ab8"]),
      x - 1,
      y - 2,
      3,
      2,
    );
    rect(bg, "#ffffff", x, y - 2, 1, 1);
  }

  const { camp } = layout;
  // Trampled ground of the camp
  const fire = layout.points.campfire;
  for (let i = 0; i < 40; i++) {
    rect(
      bg,
      "rgba(110, 80, 50, 0.25)",
      fire.x - 30 + random() * 60,
      fire.y - 22 + random() * 40,
      3,
      2,
    );
  }
  camp.crates.forEach(({ column, row }) =>
    paintCrate(bg, column * TILE, row * TILE),
  );
  paintChest(bg, camp.chest.column * TILE, camp.chest.row * TILE);

  trees(bg, fg, layout, random);
  return { background, foreground };
}

// ---------------------------------------------------------------------------

const FLOOR = "#8a6a4a";
const ROCK = "#6c5a52";

export function paintMine(layout) {
  const { background, foreground, bg } = canvases(layout);
  const { columns, rows, seed } = layout;
  const floor = (c, r) =>
    c >= 0 &&
    r >= 0 &&
    c < columns &&
    r < rows &&
    layout.land[r * columns + c] === 1;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const x = c * TILE;
      const y = r * TILE;

      if (floor(c, r)) {
        // Dirt with pebbles and darker corners near the walls
        rect(bg, FLOOR, x, y, TILE, TILE);
        for (let i = 0; i < 6; i++) {
          const px = x + Math.floor(hash(c * 7 + i, r, seed) * TILE);
          const py = y + Math.floor(hash(c, r * 7 + i, seed) * TILE);
          rect(bg, i % 2 ? "#a8865e" : "#6e523a", px, py, i % 3 ? 1 : 2, 1);
        }
        if (!floor(c - 1, r)) rect(bg, "rgba(0, 0, 0, 0.3)", x, y, 3, TILE);
        if (!floor(c + 1, r))
          rect(bg, "rgba(0, 0, 0, 0.3)", x + TILE - 3, y, 3, TILE);
        continue;
      }

      if (floor(c, r + 1)) {
        // Rock face of the wall above the floor
        rect(bg, shade(ROCK, -0.2), x, y, TILE, TILE);
        for (let row = 0; row < 3; row++) {
          for (let column = -1; column < 3; column++) {
            const sx = x + column * 5 + (row % 2) * 2;
            const left = Math.max(x, sx);
            const right = Math.min(x + TILE, sx + 4);
            if (right <= left) continue;
            const tone = hash(c * 3 + column, r * 3 + row, seed) * 0.2 - 0.1;
            rect(bg, shade(ROCK, tone), left, y + row * 4, right - left, 3);
            rect(
              bg,
              shade(ROCK, tone + 0.2),
              left,
              y + row * 4,
              right - left,
              1,
            );
          }
        }
        rect(bg, "#2b1f1c", x, y + TILE - 1, TILE, 1);
        continue;
      }

      // Rock mass seen from above: cracked stone, lit where it meets the
      // floor of the cave
      const near =
        floor(c, r - 1) ||
        floor(c - 1, r) ||
        floor(c + 1, r) ||
        floor(c, r + 2);
      rect(bg, near ? "#4a3b3a" : "#2a2024", x, y, TILE, TILE);
      for (let i = 0; i < 3; i++) {
        const px = x + Math.floor(hash(c * 5 + i, r, seed) * (TILE - 3));
        const py = y + Math.floor(hash(c, r * 5 + i, seed) * (TILE - 3));
        rect(bg, near ? "#5c4a46" : "#352a2e", px, py, 3, 2);
        rect(bg, near ? "#3a2e2e" : "#1d1519", px, py + 2, 3, 1);
      }
      if (floor(c, r - 1)) rect(bg, "#6c5a52", x, y, TILE, 2);
      if (floor(c - 1, r)) rect(bg, "#5c4a46", x, y, 2, TILE);
      if (floor(c + 1, r)) rect(bg, "#3a2e2e", x + TILE - 2, y, 2, TILE);
    }
  }

  // Boulders: round rocks with light on the top left
  for (const { column, row } of layout.boulders) {
    const cx = column * TILE + 12;
    const cy = row * TILE + 13;
    rect(bg, "rgba(0, 0, 0, 0.3)", cx - 11, cy + 8, 22, 4);
    for (const [color, radius, dx, dy] of [
      [OUTLINE, 11, 0, 0],
      ["#5f646b", 10, 0, 0],
      ["#7d8188", 8, -1, -1],
      ["#9aa0a6", 5, -3, -3],
      ["#c3c7cc", 2, -4, -5],
    ]) {
      for (let py = -radius; py <= radius; py++) {
        const span = Math.round(
          Math.sqrt(radius * radius - py * py) * (py > 0 ? 1 : 1.05),
        );
        rect(
          bg,
          color,
          cx + dx - span,
          cy + dy + Math.round(py * 0.85),
          span * 2,
          1,
        );
      }
    }
    rect(bg, "#4f545b", cx + 2, cy + 1, 5, 1);
    rect(bg, "#4f545b", cx - 5, cy + 4, 4, 1);
  }

  // Torches on the walls
  for (const { column, row } of layout.torches) {
    const x = column * TILE + 4;
    const y = row * TILE + 2;
    rect(bg, "#3d3a40", x + 1, y + 6, 2, 5);
    rect(bg, OUTLINE, x, y + 5, 4, 2);
    rect(bg, "#ff6a2a", x, y, 4, 5);
    rect(bg, "#ffd36a", x + 1, y + 2, 2, 3);
  }

  // Light coming from the tunnel
  const arrival = layout.points.arrival;
  const glow = bg.createRadialGradient(
    arrival.x + 8,
    rows * TILE,
    0,
    arrival.x + 8,
    rows * TILE,
    60,
  );
  glow.addColorStop(0, "rgba(255, 245, 210, 0.35)");
  glow.addColorStop(1, "rgba(255, 245, 210, 0)");
  bg.fillStyle = glow;
  bg.fillRect(arrival.x - 60, rows * TILE - 60, 136, 60);

  return { background, foreground };
}

// ---------------------------------------------------------------------------

function paintFountain(ctx, { column, row }) {
  const x = column * TILE;
  const y = row * TILE;
  rect(ctx, "rgba(0, 0, 0, 0.22)", x + 1, y + 21, 35, 4);
  rect(ctx, OUTLINE, x, y + 6, 36, 17);
  rect(ctx, "#9aa0a6", x + 1, y + 7, 34, 15);
  rect(ctx, "#c3c7cc", x + 1, y + 7, 34, 2);
  rect(ctx, "#4f9ac8", x + 4, y + 10, 28, 9);
  rect(ctx, "#8ccdf0", x + 6, y + 11, 10, 2);
  rect(ctx, "#8ccdf0", x + 20, y + 15, 8, 1);
  // Column and the water falling
  rect(ctx, OUTLINE, x + 15, y - 6, 6, 18);
  rect(ctx, "#b4b9bf", x + 16, y - 5, 4, 16);
  rect(ctx, "#d6eefa", x + 13, y - 7, 10, 3);
  rect(ctx, "#8ccdf0", x + 12, y - 4, 2, 10);
  rect(ctx, "#8ccdf0", x + 22, y - 4, 2, 10);
}

export function paintTown(layout) {
  const { background, foreground, bg, fg } = canvases(layout);
  const random = seeded(layout.seed + 9);

  paintGround(bg, layout);
  paintPier(bg, layout);
  layout.houses.forEach((house) =>
    buildHouse(house.spec, house.at).paint(bg, fg),
  );
  paintFountain(bg, layout.fountain);

  // Flower pots around the square
  const { plaza } = layout;
  for (const [c, r] of [
    [plaza.column + 1, plaza.row + plaza.rows - 1],
    [plaza.column + plaza.columns - 2, plaza.row + plaza.rows - 1],
  ]) {
    const x = c * TILE + 2;
    const y = r * TILE + 2;
    rect(bg, OUTLINE, x, y + 4, 9, 7);
    rect(bg, "#a8573e", x + 1, y + 5, 7, 5);
    rect(bg, "#3f8f4a", x + 1, y + 1, 7, 4);
    rect(bg, random.pick(["#ff8fb8", "#ffd84a"]), x + 3, y, 2, 2);
  }

  trees(bg, fg, layout, random);
  return { background, foreground };
}

export const paintRegion = (layout) =>
  ({ forest: paintForest, mine: paintMine, town: paintTown })[layout.id](
    layout,
  );
