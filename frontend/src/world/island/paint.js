// Draws a generated island (see layout.js) in pixel art: water with waves,
// an organic coast with cliffs, grass with tufts and flowers, sand roads,
// fences, vegetable gardens, the pier, trees and the houses. Surfaces use the
// colors of the old tileset, so snow, autumn, mud and foam (world/terrain.js)
// keep working. Returns the background (under the characters) and the
// foreground (tree crowns and roofs, over them).

import { BUILDINGS } from "../../levels/decor.js";
import { addInterior } from "../../levels/world.js";
import { buildHouse } from "../procedural/houses.js";
import { OUTLINE, rect, seeded, shade } from "../procedural/pixel.js";
import { buildRoom, roomFor } from "../procedural/rooms.js";
import { COLUMNS, ROWS, TILE } from "./layout.js";
import { valueNoise } from "./noise.js";

const WIDTH = COLUMNS * TILE;
const HEIGHT = ROWS * TILE;

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const GRASS = rgb("#74c857");
const GRASS_DARK = rgb("#56b742");
const SAND = rgb("#f8c984");
const SAND_LIGHT = rgb("#f8d49f");
const WATER = rgb("#67e6d2");
const WATER_LIGHT = rgb("#91eddf");
const WATER_DARK = rgb("#58cbb9");
const FOAM = rgb("#bffcf3");
const CLIFF = [rgb("#d38658"), rgb("#b56e4b"), rgb("#a0654d"), rgb("#91583f")];
const SHORE_GRASS = rgb("#3f8f4a");
const ROAD_EDGE = rgb("#e6b071");
const FLOWERS = [
  rgb("#ff8fb8"),
  rgb("#ffffff"),
  rgb("#ffd84a"),
  rgb("#9fb4ff"),
];
const LEAF_DARK = "#498f7b";
const LEAF = "#49a867";
const LEAF_LIGHT = "#4faf7b";
const LEAF_SHINE = "#bdef6f";
const WOOD = "#9a6240";
const WOOD_DARK = "#6e4430";
const WOOD_LIGHT = "#c98a5a";

const hash = (x, y, seed) => {
  let h = (x * 374761393 + y * 668265263 + seed * 2246822519) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
};

/** Land at the level of the pixels: a smooth version of the tiles. */
// Size of a layout (the island or a region), in tiles and pixels
const sizeOf = (layout) => {
  const columns = layout.columns ?? COLUMNS;
  const rows = layout.rows ?? ROWS;
  return { columns, rows, width: columns * TILE, height: rows * TILE };
};

// Colors of the roads: sand (village), dirt (forest), stone (town)
const ROAD_STYLES = {
  sand: { base: SAND, light: SAND_LIGHT, edge: ROAD_EDGE },
  dirt: { base: rgb("#b98a5a"), light: rgb("#cfa070"), edge: rgb("#8a6440") },
  stone: { base: rgb("#a9adb3"), light: rgb("#c6cacf"), edge: rgb("#7d8188") },
};

function landPixels(layout) {
  const { columns, rows, width, height } = sizeOf(layout);
  const noise = valueNoise(layout.seed + 3);
  const tile = (c, r) =>
    c < 0 || r < 0 || c >= columns || r >= rows
      ? 0
      : layout.land[r * columns + c];
  const land = new Uint8Array(width * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const fx = x / TILE - 0.5;
      const fy = y / TILE - 0.5;
      const c = Math.floor(fx);
      const r = Math.floor(fy);
      const tx = fx - c;
      const ty = fy - r;
      const value =
        tile(c, r) * (1 - tx) * (1 - ty) +
        tile(c + 1, r) * tx * (1 - ty) +
        tile(c, r + 1) * (1 - tx) * ty +
        tile(c + 1, r + 1) * tx * ty;
      const wobble = (noise(x * 0.09, y * 0.09, 2) - 0.5) * 0.45;
      if (value + wobble > 0.5) land[y * width + x] = 1;
    }
  }

  // Inner land stays land (roads and buildings are planned on it)
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const i = r * columns + c;
      if (!layout.land[i] || layout.edge[i]) continue;
      for (let y = r * TILE; y < (r + 1) * TILE; y++) {
        for (let x = c * TILE; x < (c + 1) * TILE; x++) land[y * width + x] = 1;
      }
    }
  }

  return land;
}

/** Water, coast, cliffs, grass and roads, pixel by pixel. */
export function paintGround(ctx, layout) {
  const { columns, width, height } = sizeOf(layout);
  const style = ROAD_STYLES[layout.roadStyle ?? "sand"];
  const land = landPixels(layout);
  const image = ctx.createImageData(width, height);
  const data = image.data;
  const isLand = (x, y) =>
    x >= 0 && y >= 0 && x < width && y < height && land[y * width + x] === 1;
  const road = (x, y) => {
    const c = Math.floor(x / TILE);
    const r = Math.floor(y / TILE);
    return layout.roads.has(r * columns + c);
  };
  const set = (i, [r, g, b]) => {
    data[i * 4] = r;
    data[i * 4 + 1] = g;
    data[i * 4 + 2] = b;
    data[i * 4 + 3] = 255;
  };
  const { seed } = layout;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = y * width + x;

      if (!isLand(x, y)) {
        // Cliff under the land on the south coast
        let above = 0;
        while (above < 11 && !isLand(x, y - above - 1)) above++;
        if (above < 11 && isLand(x, y - above - 1)) {
          const crack = hash(x >> 1, (y - above) >> 2, seed) < 0.12;
          const band = above < 2 ? 0 : above < 5 ? 1 : above < 9 ? 2 : 3;
          set(i, crack ? CLIFF[3] : CLIFF[band]);
          if (above === 10) set(i, rgb("#5a3a2a"));
          continue;
        }
        // Water: foam near the coast, waves further away
        const nearLand =
          isLand(x, y - 2) ||
          isLand(x - 2, y) ||
          isLand(x + 2, y) ||
          isLand(x, y + 2);
        if (nearLand) set(i, FOAM);
        else if ((x + (y >> 2) * 5) % 13 < 3 && y % 4 === 0)
          set(i, WATER_LIGHT);
        else if (hash(x >> 3, y >> 3, seed) < 0.06) set(i, WATER_DARK);
        else set(i, WATER);
        continue;
      }

      // Dark grass on the very edge of the land
      if (
        !isLand(x, y + 1) ||
        !isLand(x - 1, y) ||
        !isLand(x + 1, y) ||
        !isLand(x, y - 1)
      ) {
        set(i, SHORE_GRASS);
        continue;
      }

      if (road(x, y)) {
        // Rounded corners where the road turns
        const c = Math.floor(x / TILE);
        const r = Math.floor(y / TILE);
        const lx = x - c * TILE;
        const ly = y - r * TILE;
        const missing = (dc, dr) =>
          !layout.roads.has((r + dr) * columns + c + dc);
        const corner =
          (lx < 3 && ly < 3 && missing(-1, 0) && missing(0, -1)) ||
          (lx > 8 && ly < 3 && missing(1, 0) && missing(0, -1)) ||
          (lx < 3 && ly > 8 && missing(-1, 0) && missing(0, 1)) ||
          (lx > 8 && ly > 8 && missing(1, 0) && missing(0, 1));
        if (!corner) {
          const border =
            (lx === 0 && missing(-1, 0)) ||
            (lx === TILE - 1 && missing(1, 0)) ||
            (ly === 0 && missing(0, -1)) ||
            (ly === TILE - 1 && missing(0, 1));
          if (border) set(i, style.edge);
          else if (layout.roadStyle === "stone") {
            // Cobblestones
            const cx = (x + ((y >> 2) % 2) * 2) % 4;
            const cy = y % 4;
            set(
              i,
              cx === 0 || cy === 0
                ? style.edge
                : hash(x >> 2, y >> 2, seed) < 0.3
                  ? style.light
                  : style.base,
            );
          } else set(i, hash(x, y, seed) < 0.07 ? style.light : style.base);
          continue;
        }
      }

      // Grass with tufts and a few flowers
      const roll = hash(x, y, seed + 1);
      if (roll < 0.004)
        set(i, FLOWERS[Math.floor(hash(y, x, seed) * FLOWERS.length)]);
      else if (roll < 0.035 && hash(x, y - 1, seed + 1) >= 0.035) {
        set(i, layout.grassTuft ?? GRASS_DARK);
        if (y > 0) set(i - width, layout.grassTuft ?? GRASS_DARK);
      } else if (data[i * 4 + 3] === 0) set(i, layout.grass ?? GRASS);
    }
  }

  ctx.putImageData(image, 0, 0);
}

// ---------------------------------------------------------------------------

export function paintPier(ctx, layout) {
  const { tiles, side } = layout.pier;
  const xs = tiles.map(([c]) => c);
  const ys = tiles.map(([, r]) => r);
  const x = Math.min(...xs) * TILE;
  const y = Math.min(...ys) * TILE;
  const width = (Math.max(...xs) + 1) * TILE - x;
  const height = (Math.max(...ys) + 1) * TILE - y;
  const vertical = side === "south";

  // Posts in the water
  for (const [px, py] of [
    [x + 1, y + height - 2],
    [x + width - 4, y + height - 2],
    [x + Math.floor(width / 2), y + height - 2],
  ]) {
    rect(ctx, OUTLINE, px - 1, py, 5, 7);
    rect(ctx, WOOD_DARK, px, py, 3, 6);
  }
  rect(ctx, "rgba(0, 0, 0, 0.18)", x + 2, y + height, width - 2, 3);
  rect(ctx, OUTLINE, x - 1, y - 1, width + 2, height + 2);

  // Planks across the pier
  if (vertical) {
    for (let py = y; py < y + height; py += 4) {
      rect(ctx, py % 8 ? WOOD : shade(WOOD, 0.08), x, py, width, 3);
      rect(ctx, WOOD_DARK, x, py + 3, width, 1);
    }
  } else {
    for (let px = x; px < x + width; px += 4) {
      rect(ctx, px % 8 ? WOOD : shade(WOOD, 0.08), px, y, 3, height);
      rect(ctx, WOOD_DARK, px + 3, y, 1, height);
      rect(ctx, WOOD_LIGHT, px, y, 3, 1);
    }
  }
  rect(ctx, WOOD_DARK, x, y + height - 2, width, 2);
}

export function paintFences(ctx, layout) {
  const columns = layout.columns ?? COLUMNS;
  const has = (c, r) => layout.fences.has(r * columns + c);

  for (const i of layout.fences) {
    const c = i % columns;
    const r = Math.floor(i / columns);
    const x = c * TILE;
    const y = r * TILE;

    // Rails to the neighbours
    if (has(c + 1, r)) {
      rect(ctx, OUTLINE, x + 6, y + 3, 12, 6);
      rect(ctx, WOOD_LIGHT, x + 6, y + 4, 12, 1);
      rect(ctx, WOOD, x + 6, y + 7, 12, 1);
    }
    if (has(c, r + 1)) {
      rect(ctx, OUTLINE, x + 5, y + 8, 3, 12);
      rect(ctx, WOOD, x + 6, y + 8, 1, 12);
    }
    // Post
    rect(ctx, "rgba(0, 0, 0, 0.2)", x + 4, y + 10, 6, 2);
    rect(ctx, OUTLINE, x + 4, y, 5, 11);
    rect(ctx, WOOD, x + 5, y + 1, 3, 9);
    rect(ctx, WOOD_LIGHT, x + 5, y + 1, 3, 1);
    rect(ctx, WOOD_DARK, x + 7, y + 2, 1, 8);
  }
}

function paintHortas(ctx, layout, random) {
  for (const { column, row, columns, rows } of layout.hortas) {
    const x = (column + 1) * TILE;
    const y = (row + 1) * TILE;
    const width = (columns - 2) * TILE;
    const height = (rows - 2) * TILE;
    rect(ctx, "#6e4a2e", x, y, width, height);
    for (let py = y + 2; py < y + height; py += 6) {
      rect(ctx, "#8a5e3a", x + 1, py, width - 2, 3);
      rect(ctx, "#5e3d26", x + 1, py + 3, width - 2, 1);
      for (let px = x + 3; px < x + width - 3; px += 5) {
        const kind = random.int(0, 3);
        if (kind === 0) {
          rect(ctx, "#3f8f4a", px, py - 2, 3, 3);
          rect(ctx, "#6fc070", px + 1, py - 2, 1, 1);
        } else if (kind === 1) {
          rect(ctx, "#4c9a52", px + 1, py - 3, 1, 3);
          rect(ctx, "#f08a2c", px, py, 3, 1);
        } else if (kind === 2) {
          rect(ctx, "#2f6e3a", px, py - 1, 4, 3);
          rect(ctx, "#7cbf5b", px + 1, py - 1, 2, 2);
        } else {
          rect(ctx, "#4c9a52", px + 1, py - 2, 1, 2);
          rect(ctx, "#d6334a", px, py, 2, 2);
        }
      }
    }
  }
}

/** The garden: a stone circle for the fire and flower beds. */
function paintGarden(ctx, layout, random) {
  const { column, row } = layout.garden;
  const cx = (column + 6) * TILE;
  const cy = (row + 4) * TILE + 6;

  for (let i = 0; i < 10; i++) {
    const angle = (i / 10) * Math.PI * 2;
    const sx = Math.round(cx + Math.cos(angle) * 10);
    const sy = Math.round(cy + Math.sin(angle) * 6);
    rect(ctx, OUTLINE, sx - 2, sy - 1, 5, 4);
    rect(ctx, "#9aa0a6", sx - 1, sy, 3, 2);
    rect(ctx, "#c3c7cc", sx - 1, sy, 2, 1);
  }

  for (const bx of [(column + 1) * TILE + 4, (column + 9) * TILE]) {
    const by = (row + 5) * TILE;
    rect(ctx, OUTLINE, bx - 1, by - 1, 22, 10);
    rect(ctx, "#6e4a2e", bx, by, 20, 8);
    for (let i = 0; i < 6; i++) {
      rect(ctx, "#3f8f4a", bx + 2 + i * 3, by + 3, 2, 3);
      rect(
        ctx,
        random.pick(["#ff8fb8", "#ffd84a", "#ffffff", "#c4475d"]),
        bx + 2 + i * 3,
        by + 1,
        2,
        2,
      );
    }
  }
}

export function paintTree(
  background,
  foreground,
  { column, row, variant, big },
  random,
) {
  const x = column * TILE;
  const y = row * TILE;
  const size = big ? 30 : 24;
  const cx = x + 12;
  const top = y + (big ? -6 : 0);

  // Trunk and shadow (under the characters)
  rect(background, "rgba(20, 50, 20, 0.28)", cx - 10, y + 32, 20, 4);
  rect(background, OUTLINE, cx - 4, y + 18, 8, 17);
  rect(background, "#7a4a2c", cx - 3, y + 18, 6, 16);
  rect(background, "#9a6240", cx - 3, y + 18, 2, 16);
  rect(background, "#5a3420", cx + 1, y + 20, 1, 12);
  rect(background, "#7a4a2c", cx - 6, y + 32, 3, 2);
  rect(background, "#7a4a2c", cx + 3, y + 32, 3, 2);

  // Crown (over the characters): blobs of leaves with light on the top left
  const tones = [
    [LEAF_DARK, 0],
    [LEAF, -2],
    [LEAF_LIGHT, -4],
  ];
  const blobs =
    variant === 2
      ? [
          [0, 6, 1],
          [-6, 12, 0.8],
          [6, 12, 0.8],
        ]
      : [
          [0, 8, 1],
          [-7, 11, 0.75],
          [7, 11, 0.75],
          [0, 15, 0.7],
        ];
  for (const [color, offset] of tones) {
    for (const [dx, dy, scale] of blobs) {
      const radius = (size / 2) * scale + offset;
      const bx = cx + dx + (offset < 0 ? -1 : 0);
      const by = top + dy + offset;
      for (let py = -radius; py <= radius; py++) {
        const span = Math.round(
          Math.sqrt(Math.max(0, radius * radius - py * py)),
        );
        rect(foreground, color, bx - span, by + py, span * 2, 1);
      }
    }
  }
  // Outline at the bottom and shine on the leaves
  for (let i = 0; i < (big ? 14 : 9); i++) {
    const sx = cx - size / 3 + random() * (size / 1.6);
    const sy = top + 2 + random() * (size / 1.8);
    rect(foreground, LEAF_SHINE, sx, sy, 2, 1);
  }
  rect(
    foreground,
    shade(LEAF_DARK, -0.25),
    cx - size / 2 + 3,
    top + size - 2 + 6,
    size - 6,
    2,
  );
}

/**
 * @returns {{background: HTMLCanvasElement, foreground: HTMLCanvasElement,
 *   roofs: {background: HTMLCanvasElement, foreground: HTMLCanvasElement}}}
 * `roofs` marks where the roofs are (snow covers them, see terrain.js).
 */
export function paintIsland(layout) {
  const background = document.createElement("canvas");
  const foreground = document.createElement("canvas");
  const roofs = {
    background: document.createElement("canvas"),
    foreground: document.createElement("canvas"),
  };
  for (const canvas of [
    background,
    foreground,
    roofs.background,
    roofs.foreground,
  ]) {
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
  }
  const bg = background.getContext("2d");
  const fg = foreground.getContext("2d");
  const random = seeded(layout.seed + 11);

  paintGround(bg, layout);
  paintPier(bg, layout);
  paintHortas(bg, layout, random);
  paintGarden(bg, layout, random);
  paintFences(bg, layout);

  // Trees from the back to the front
  [...layout.trees]
    .sort((a, b) => a.row - b.row)
    .forEach((tree) => paintTree(bg, fg, tree, random));

  // The buildings that always exist, and their interiors
  for (const building of layout.buildings.filter((b) => !b.lot)) {
    const house = buildHouse(building.spec, building.at);
    house.paint(bg, fg, roofContexts(roofs));
    const entry = BUILDINGS.find((b) => b.placeId === building.id);
    if (entry)
      Object.assign(entry, { windows: house.windows, chimney: house.chimney });

    const name = { tavern: "Taverna", east_house: "Armazém" }[building.id];
    const placeName =
      name ?? layout.places.find((p) => p.id === building.id)?.name;
    const room = buildRoom(
      roomFor(building.trade, layout.seed + building.id.length * 13),
    );
    addInterior({ id: building.id, name: placeName }, room);
  }

  return { background, foreground, roofs };
}

/** The 2D contexts of the roof masks (to paint more houses later). */
export const roofContexts = (roofs) => ({
  background: roofs.background.getContext("2d"),
  foreground: roofs.foreground.getContext("2d"),
});
