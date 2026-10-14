// Furniture, small things and wall decoration of the interiors, in pixel art
// drawn with code: wood with grain, metal with rivets, fabrics with patterns,
// several tones of light and shadow. Sizes are in tiles of 16 px; `draw`
// gets the top left of the tiles (tall pieces are drawn above them, against
// the wall).

import { OUTLINE, rect, shade } from "./pixel.js";

const WOOD = "#a8714a";
const DARK_WOOD = "#7d5232";
const LIGHT_WOOD = "#c98f5d";
const IRON = "#4a474f";
const STEEL = "#8a8f96";
const BRASS = "#e2b73c";
export const FABRICS = [
  "#c4475d",
  "#3f7fc4",
  "#4c9a52",
  "#8a5ab8",
  "#d98a3a",
  "#2f8f8a",
];

// ---------------------------------------------------------------------------
// Materials

/** Shadow on the floor under a piece. */
const floorShadow = (ctx, x, y, width) => {
  rect(ctx, "rgba(0, 0, 0, 0.12)", x + 1, y, width - 2, 3);
  rect(ctx, "rgba(0, 0, 0, 0.12)", x + 3, y + 3, width - 6, 1);
};

/** A piece of wood: outline, grain, light on top and shade below. */
function wood(
  ctx,
  x,
  y,
  width,
  height,
  base = WOOD,
  { grain = "h", random } = {},
) {
  rect(ctx, OUTLINE, x - 1, y - 1, width + 2, height + 2);
  rect(ctx, base, x, y, width, height);

  const line = shade(base, -0.18);
  if (grain === "h") {
    for (let py = y + 2; py < y + height - 1; py += 3) {
      let px = x + 1;
      while (px < x + width - 1) {
        const length = 3 + Math.floor((random?.() ?? 0.5) * 7);
        rect(ctx, line, px, py, Math.min(length, x + width - 1 - px), 1);
        px += length + 2;
      }
    }
  } else {
    for (let px = x + 2; px < x + width - 1; px += 4) {
      rect(ctx, line, px, y + 1, 1, height - 2);
    }
  }

  rect(ctx, shade(base, 0.22), x, y, width, 1);
  rect(ctx, shade(base, 0.1), x, y + 1, 1, height - 1);
  rect(ctx, shade(base, -0.3), x, y + height - 1, width, 1);
  rect(ctx, shade(base, -0.2), x + width - 1, y + 1, 1, height - 2);
}

/** Metal with a bright edge and rivets. */
function metal(ctx, x, y, width, height, base = IRON, rivets = true) {
  rect(ctx, OUTLINE, x - 1, y - 1, width + 2, height + 2);
  rect(ctx, base, x, y, width, height);
  rect(ctx, shade(base, 0.35), x, y, width, 1);
  rect(ctx, shade(base, 0.15), x, y + 1, 1, height - 1);
  rect(ctx, shade(base, -0.35), x, y + height - 1, width, 1);
  if (rivets && width > 6 && height > 6) {
    for (const [rx, ry] of [
      [1, 2],
      [width - 2, 2],
      [1, height - 3],
      [width - 2, height - 3],
    ]) {
      rect(ctx, shade(base, 0.45), x + rx, y + ry, 1, 1);
    }
  }
}

/** Fire with three tones and a bright core. */
function fire(ctx, x, y, width, height) {
  rect(ctx, "#2b1a14", x, y, width, height);
  rect(
    ctx,
    "#c4381a",
    x + 1,
    y + Math.floor(height / 3),
    width - 2,
    height - Math.floor(height / 3),
  );
  for (let px = x + 1; px < x + width - 1; px += 3) {
    rect(
      ctx,
      "#ff6a2a",
      px,
      y + Math.floor(height / 2) - (px % 2),
      2,
      height - Math.floor(height / 2),
    );
  }
  rect(
    ctx,
    "#ffb43c",
    x + Math.floor(width / 2) - 2,
    y + Math.floor(height / 2),
    4,
    height - Math.floor(height / 2) - 1,
  );
  rect(ctx, "#fff0a0", x + Math.floor(width / 2) - 1, y + height - 3, 2, 2);
  rect(ctx, "#6e4430", x + 1, y + height - 2, width - 2, 2);
}

/** Things on a shelf: books, jars and pots. */
function shelfThings(ctx, x, y, width, random, kind = "mixed") {
  let px = x;
  while (px < x + width - 2) {
    const roll = kind === "books" ? 0 : kind === "jars" ? 1 : random.int(0, 2);
    if (roll === 0) {
      const w = random.int(2, 3);
      const h = random.int(6, 8);
      const color = random.pick(FABRICS);
      rect(ctx, color, px, y - h, w, h);
      rect(ctx, shade(color, 0.3), px, y - h, w, 1);
      rect(ctx, shade(color, -0.3), px + w - 1, y - h + 1, 1, h - 1);
      if (h > 6) rect(ctx, BRASS, px, y - h + 2, w, 1);
      px += w + (random.chance(0.2) ? 1 : 0);
    } else if (roll === 1) {
      const color = random.pick([
        "#4cb06a",
        "#6aa6c8",
        "#c4475d",
        "#e8c45a",
        "#8a5ab8",
      ]);
      rect(ctx, OUTLINE, px, y - 7, 4, 7);
      rect(ctx, color, px + 1, y - 5, 2, 4);
      rect(ctx, "#cfe6f2", px + 1, y - 6, 2, 1);
      rect(ctx, "#8a5a38", px + 1, y - 8, 2, 1);
      px += 5;
    } else {
      rect(ctx, OUTLINE, px, y - 5, 5, 5);
      rect(ctx, "#b0654a", px + 1, y - 4, 3, 4);
      rect(ctx, "#d08a6a", px + 1, y - 4, 3, 1);
      px += 6;
    }
  }
}

// ---------------------------------------------------------------------------
// Furniture

export const FURNITURE = {
  bed: {
    size: [2, 3],
    place: "wall",
    draw(ctx, x, y, random) {
      const quilt = random.pick(FABRICS);
      floorShadow(ctx, x + 2, y + 46, 28);
      // Carved headboard
      wood(ctx, x + 2, y - 8, 28, 10, DARK_WOOD, { grain: "v", random });
      rect(ctx, shade(DARK_WOOD, 0.25), x + 6, y - 6, 20, 1);
      rect(ctx, BRASS, x + 4, y - 9, 2, 2);
      rect(ctx, BRASS, x + 26, y - 9, 2, 2);
      // Mattress and pillows
      rect(ctx, OUTLINE, x + 2, y + 1, 28, 42);
      rect(ctx, "#ece4d2", x + 3, y + 2, 26, 40);
      for (const px of [x + 5, x + 17]) {
        rect(ctx, OUTLINE, px - 1, y + 3, 12, 8);
        rect(ctx, "#ffffff", px, y + 4, 10, 6);
        rect(ctx, "#ddd6c6", px, y + 9, 10, 1);
        rect(ctx, "#ddd6c6", px + 9, y + 4, 1, 6);
      }
      // Patchwork quilt with a folded edge
      rect(ctx, quilt, x + 3, y + 15, 26, 27);
      for (let row = 0; row < 4; row++) {
        for (let column = 0; column < 4; column++) {
          if ((row + column) % 2)
            rect(
              ctx,
              shade(quilt, 0.18),
              x + 4 + column * 6,
              y + 19 + row * 6,
              6,
              6,
            );
        }
      }
      rect(ctx, "#f4ede0", x + 3, y + 14, 26, 4);
      rect(ctx, shade(quilt, -0.25), x + 3, y + 18, 26, 1);
      rect(ctx, shade(quilt, -0.35), x + 3, y + 41, 26, 1);
      rect(ctx, shade(quilt, -0.2), x + 28, y + 18, 1, 23);
      // Footboard
      wood(ctx, x + 2, y + 42, 28, 4, DARK_WOOD, { random });
    },
  },
  cot: {
    size: [1, 2],
    place: "wall",
    draw(ctx, x, y) {
      floorShadow(ctx, x + 2, y + 30, 12);
      metal(ctx, x + 2, y + 1, 12, 29, STEEL, false);
      rect(ctx, "#f4ede0", x + 3, y + 2, 10, 27);
      rect(ctx, OUTLINE, x + 4, y + 3, 8, 5);
      rect(ctx, "#ffffff", x + 5, y + 4, 6, 3);
      rect(ctx, "#cfd8e6", x + 3, y + 13, 10, 16);
      rect(ctx, "#b8c4d8", x + 3, y + 13, 10, 1);
      rect(ctx, "#e8eef6", x + 4, y + 16, 2, 10);
      rect(ctx, "#c4475d", x + 7, y + 20, 2, 4);
      rect(ctx, "#c4475d", x + 6, y + 21, 4, 2);
    },
  },
  table: {
    size: [2, 2],
    place: "floor",
    draw(ctx, x, y, random) {
      floorShadow(ctx, x + 2, y + 26, 28);
      for (const lx of [x + 4, x + 25]) {
        rect(ctx, OUTLINE, lx - 1, y + 17, 5, 12);
        rect(ctx, DARK_WOOD, lx, y + 17, 3, 11);
        rect(ctx, shade(DARK_WOOD, 0.2), lx, y + 17, 1, 11);
      }
      wood(ctx, x + 2, y + 4, 28, 15, WOOD, { random });
      rect(ctx, shade(WOOD, -0.25), x + 2, y + 19, 28, 2);

      if (random.chance(0.5)) {
        const cloth = random.pick(["#f4ede0", "#c4475d", "#3f7fc4", "#4c9a52"]);
        rect(ctx, cloth, x + 7, y + 5, 18, 13);
        rect(ctx, shade(cloth, -0.18), x + 7, y + 17, 18, 4);
        for (let px = x + 8; px < x + 25; px += 2)
          rect(ctx, shade(cloth, -0.3), px, y + 20, 1, 2);
        if (cloth !== "#f4ede0") {
          for (let px = x + 8; px < x + 24; px += 4) {
            for (let py = y + 6; py < y + 17; py += 4)
              rect(ctx, "#f4ede0", px, py, 2, 2);
          }
        }
      }

      // Plates with food, a mug, a candle
      const foods = ["#e3a24c", "#c4475d", "#7cbf5b", "#f2c14e"];
      for (const px of [x + 5, x + 19]) {
        rect(ctx, OUTLINE, px - 1, y + 9, 9, 6);
        rect(ctx, "#e8e2d4", px, y + 10, 7, 4);
        rect(ctx, "#ffffff", px + 1, y + 10, 5, 1);
        if (random.chance(0.7)) {
          const food = random.pick(foods);
          rect(ctx, food, px + 2, y + 11, 3, 2);
          rect(ctx, shade(food, 0.3), px + 2, y + 11, 1, 1);
        }
      }
      if (random.chance(0.7)) {
        rect(ctx, OUTLINE, x + 14, y + 5, 5, 6);
        rect(ctx, "#c98a5a", x + 15, y + 6, 3, 4);
        rect(ctx, "#f4ede0", x + 15, y + 6, 3, 1);
        rect(ctx, OUTLINE, x + 18, y + 7, 1, 2);
      }
      if (random.chance(0.6)) {
        rect(ctx, "#f4ede0", x + 15, y + 12, 2, 5);
        rect(ctx, BRASS, x + 14, y + 16, 4, 1);
        rect(ctx, "#ffb43c", x + 15, y + 10, 2, 2);
        rect(ctx, "#fff6c8", x + 15, y + 10, 1, 1);
      }
    },
  },
  stool: {
    size: [1, 1],
    place: "floor",
    draw(ctx, x, y, random) {
      floorShadow(ctx, x + 2, y + 13, 12);
      for (const lx of [x + 3, x + 11]) {
        rect(ctx, OUTLINE, lx - 1, y + 8, 4, 7);
        rect(ctx, DARK_WOOD, lx, y + 8, 2, 6);
      }
      if (random.chance(0.6)) {
        // Chair back with slats
        rect(ctx, OUTLINE, x + 2, y - 3, 12, 9);
        rect(ctx, WOOD, x + 3, y - 2, 10, 2);
        rect(ctx, shade(WOOD, 0.2), x + 3, y - 2, 10, 1);
        for (const sx of [x + 4, x + 7, x + 10])
          rect(ctx, DARK_WOOD, sx, y, 2, 6);
      }
      wood(ctx, x + 2, y + 6, 12, 4, LIGHT_WOOD, { random });
      if (random.chance(0.4)) {
        const cushion = random.pick(FABRICS);
        rect(ctx, cushion, x + 3, y + 6, 10, 2);
        rect(ctx, shade(cushion, 0.25), x + 3, y + 6, 10, 1);
      }
    },
  },
  shelf: {
    size: [2, 1],
    place: "wall",
    draw(ctx, x, y, random) {
      floorShadow(ctx, x + 1, y + 14, 30);
      wood(ctx, x + 1, y - 25, 30, 39, DARK_WOOD, { grain: "v", random });
      rect(ctx, "#4a2e1e", x + 3, y - 22, 26, 33);
      for (let level = 0; level < 3; level++) {
        const sy = y - 22 + level * 11 + 10;
        shelfThings(
          ctx,
          x + 4,
          sy,
          24,
          random,
          level === 2 ? "mixed" : "books",
        );
        rect(ctx, WOOD, x + 3, sy, 26, 2);
        rect(ctx, shade(WOOD, 0.25), x + 3, sy, 26, 1);
      }
      rect(ctx, shade(DARK_WOOD, 0.3), x + 1, y - 26, 30, 2);
    },
  },
  bottles: {
    size: [2, 1],
    place: "wall",
    draw(ctx, x, y, random) {
      floorShadow(ctx, x + 1, y + 13, 30);
      wood(ctx, x + 1, y - 21, 30, 34, DARK_WOOD, { grain: "v", random });
      rect(ctx, "#4a2e1e", x + 3, y - 18, 26, 28);
      for (let level = 0; level < 2; level++) {
        const sy = y - 18 + level * 14 + 12;
        shelfThings(ctx, x + 4, sy, 24, random, "jars");
        rect(ctx, WOOD, x + 3, sy, 26, 2);
        rect(ctx, shade(WOOD, 0.25), x + 3, sy, 26, 1);
      }
    },
  },
  stove: {
    size: [2, 1],
    place: "wall",
    draw(ctx, x, y) {
      // Pipe up the wall
      rect(ctx, OUTLINE, x + 12, y - 30, 8, 22);
      rect(ctx, "#3d3a40", x + 13, y - 30, 6, 21);
      rect(ctx, "#5d5a63", x + 13, y - 30, 2, 21);
      rect(ctx, "#2b2930", x + 12, y - 20, 8, 2);
      floorShadow(ctx, x + 3, y + 12, 26);
      metal(ctx, x + 3, y - 10, 26, 22);
      // Cooking plates and a pot
      rect(ctx, "#2b2930", x + 5, y - 9, 9, 3);
      rect(ctx, OUTLINE, x + 17, y - 14, 9, 7);
      rect(ctx, "#6c7178", x + 18, y - 13, 7, 5);
      rect(ctx, "#a8aeb5", x + 18, y - 13, 7, 1);
      rect(ctx, "rgba(230,230,235,0.6)", x + 20, y - 17, 2, 2);
      // Fire door
      rect(ctx, OUTLINE, x + 8, y - 2, 16, 12);
      fire(ctx, x + 9, y - 1, 14, 10);
      rect(ctx, "#5d5a63", x + 8, y - 2, 16, 2);
      rect(ctx, BRASS, x + 15, y - 3, 2, 1);
    },
  },
  fireplace: {
    size: [3, 1],
    place: "wall",
    draw(ctx, x, y, random) {
      floorShadow(ctx, x + 2, y + 12, 44);
      rect(ctx, OUTLINE, x + 1, y - 25, 46, 38);
      for (let row = 0; row < 7; row++) {
        for (let column = -1; column < 7; column++) {
          const sx = x + 2 + column * 7 + (row % 2 ? 3 : 0);
          const tone = random() * 0.2 - 0.1;
          const left = Math.max(sx, x + 2);
          const right = Math.min(sx + 6, x + 46);
          if (right <= left) continue;
          rect(
            ctx,
            shade("#9aa0a6", tone),
            left,
            y - 24 + row * 5,
            right - left,
            4,
          );
          rect(
            ctx,
            shade("#9aa0a6", tone + 0.15),
            left,
            y - 24 + row * 5,
            right - left,
            1,
          );
        }
      }
      // Hearth with fire and logs
      rect(ctx, OUTLINE, x + 11, y - 9, 26, 20);
      fire(ctx, x + 12, y - 8, 24, 18);
      rect(ctx, "#6e4430", x + 14, y + 6, 20, 3);
      rect(ctx, "#e0b080", x + 14, y + 6, 2, 3);
      // Mantel with things on it
      wood(ctx, x, y - 28, 48, 4, DARK_WOOD, { random });
      rect(ctx, OUTLINE, x + 6, y - 34, 5, 6);
      rect(ctx, "#4cb06a", x + 7, y - 33, 3, 5);
      rect(ctx, "#f4ede0", x + 36, y - 33, 2, 5);
      rect(ctx, "#ffb43c", x + 36, y - 35, 2, 2);
      rect(ctx, OUTLINE, x + 20, y - 34, 8, 6);
      rect(ctx, "#e8e2d4", x + 21, y - 33, 6, 4);
    },
  },
  forge: {
    size: [2, 2],
    place: "wall",
    draw(ctx, x, y, random) {
      // Hood and chimney
      rect(ctx, OUTLINE, x + 5, y - 30, 22, 22);
      rect(ctx, "#5d5a63", x + 6, y - 30, 20, 20);
      rect(ctx, "#74717a", x + 6, y - 30, 4, 20);
      rect(ctx, OUTLINE, x + 2, y - 12, 28, 5);
      rect(ctx, "#4a474f", x + 3, y - 11, 26, 3);
      floorShadow(ctx, x + 2, y + 24, 28);
      // Stone base
      rect(ctx, OUTLINE, x + 1, y - 7, 30, 32);
      for (let row = 0; row < 6; row++) {
        for (let column = -1; column < 5; column++) {
          const sx = x + 2 + column * 7 + (row % 2 ? 3 : 0);
          const left = Math.max(sx, x + 2);
          const right = Math.min(sx + 6, x + 30);
          if (right <= left) continue;
          const tone = random() * 0.16 - 0.08;
          rect(
            ctx,
            shade("#8a8f96", tone),
            left,
            y - 6 + row * 5,
            right - left,
            4,
          );
          rect(
            ctx,
            shade("#8a8f96", tone + 0.15),
            left,
            y - 6 + row * 5,
            right - left,
            1,
          );
        }
      }
      // Glowing coals
      rect(ctx, OUTLINE, x + 5, y - 3, 22, 9);
      rect(ctx, "#2b1a14", x + 6, y - 2, 20, 7);
      for (let px = x + 7; px < x + 25; px += 3) {
        rect(
          ctx,
          random.pick(["#ff6a2a", "#c4381a", "#ffb43c"]),
          px,
          y + random.int(-1, 2),
          2,
          2,
        );
      }
      rect(ctx, "#fff0a0", x + 15, y + 1, 2, 1);
      // Bellows
      rect(ctx, OUTLINE, x + 22, y + 10, 9, 7);
      rect(ctx, "#8a5a38", x + 23, y + 11, 7, 5);
      rect(ctx, "#6e4430", x + 23, y + 13, 7, 1);
    },
  },
  anvil: {
    size: [1, 1],
    place: "floor",
    draw(ctx, x, y) {
      floorShadow(ctx, x + 1, y + 13, 14);
      wood(ctx, x + 4, y + 8, 8, 6, DARK_WOOD);
      rect(ctx, OUTLINE, x, y + 2, 16, 7);
      rect(ctx, IRON, x + 1, y + 3, 14, 5);
      rect(ctx, "#2b2930", x + 1, y + 7, 14, 1);
      rect(ctx, "#a8aeb5", x + 2, y + 3, 10, 1);
      rect(ctx, IRON, x + 13, y + 3, 3, 2);
      rect(ctx, "#c9cfd6", x + 4, y + 3, 3, 1);
      // A hammer on top
      rect(ctx, "#6e4430", x + 5, y, 6, 1);
      rect(ctx, STEEL, x + 10, y - 1, 3, 3);
    },
  },
  workbench: {
    size: [3, 1],
    place: "wall",
    draw(ctx, x, y, random) {
      // Tools hanging on the wall
      rect(ctx, DARK_WOOD, x + 4, y - 22, 40, 2);
      rect(ctx, STEEL, x + 8, y - 20, 1, 8);
      rect(ctx, STEEL, x + 6, y - 13, 5, 2);
      rect(ctx, "#6e4430", x + 16, y - 20, 1, 9);
      rect(ctx, STEEL, x + 15, y - 21, 4, 3);
      rect(ctx, "#c9cfd6", x + 25, y - 20, 9, 5);
      rect(ctx, "#6e4430", x + 34, y - 19, 3, 3);
      rect(ctx, STEEL, x + 40, y - 20, 2, 7);
      floorShadow(ctx, x + 2, y + 13, 44);
      for (const lx of [x + 4, x + 41]) {
        rect(ctx, OUTLINE, lx - 1, y + 5, 5, 10);
        rect(ctx, DARK_WOOD, lx, y + 5, 3, 9);
      }
      rect(ctx, DARK_WOOD, x + 5, y + 10, 38, 2);
      wood(ctx, x + 2, y - 3, 44, 9, WOOD, { random });
      // Things on the bench
      rect(ctx, "#e0b080", x + 8, y - 5, 10, 2);
      rect(ctx, OUTLINE, x + 24, y - 7, 8, 4);
      rect(ctx, STEEL, x + 25, y - 6, 6, 2);
      rect(ctx, "#6e4430", x + 36, y - 6, 6, 3);
    },
  },
  counter: {
    size: [4, 1],
    place: "floor",
    draw(ctx, x, y, random) {
      floorShadow(ctx, x + 1, y + 14, 62);
      wood(ctx, x + 1, y + 4, 62, 10, DARK_WOOD, { grain: "v", random });
      for (let px = x + 4; px < x + 60; px += 15) {
        rect(ctx, shade(DARK_WOOD, -0.25), px, y + 6, 12, 6);
        rect(ctx, shade(DARK_WOOD, 0.15), px, y + 6, 12, 1);
      }
      wood(ctx, x, y, 64, 4, LIGHT_WOOD, { random });
      // Goods: loaves, apples, jars
      const goods = [
        () => ["#c98a3a", "#e3a24c"],
        () => ["#a8282a", "#d6334a"],
        () => ["#3f8f4a", "#7cbf5b"],
        () => ["#c9a63a", "#f2d064"],
      ];
      for (let i = 0; i < 4; i++) {
        const [dark, light] = random.pick(goods)();
        const gx = x + 4 + i * 15;
        rect(ctx, OUTLINE, gx, y - 5, 10, 6);
        rect(ctx, dark, gx + 1, y - 4, 8, 4);
        rect(ctx, light, gx + 1, y - 4, 4, 2);
      }
    },
  },
  barrel: {
    size: [1, 1],
    place: "corner",
    draw(ctx, x, y, random) {
      floorShadow(ctx, x + 2, y + 14, 12);
      rect(ctx, OUTLINE, x + 1, y, 14, 16);
      rect(ctx, WOOD, x + 2, y + 1, 12, 14);
      for (let px = x + 4; px < x + 14; px += 3)
        rect(ctx, shade(WOOD, -0.18), px, y + 3, 1, 12);
      rect(ctx, shade(WOOD, 0.2), x + 3, y + 3, 2, 11);
      rect(ctx, shade(WOOD, -0.3), x + 12, y + 3, 2, 11);
      for (const hy of [y + 5, y + 11]) {
        rect(ctx, "#5b5f66", x + 2, hy, 12, 1);
        rect(ctx, "#a8aeb5", x + 3, hy, 3, 1);
      }
      // Lid
      rect(ctx, LIGHT_WOOD, x + 2, y + 1, 12, 2);
      rect(ctx, shade(LIGHT_WOOD, -0.2), x + 7, y + 1, 1, 2);
      if (random.chance(0.3)) rect(ctx, "#d6334a", x + 5, y, 3, 2);
    },
  },
  crate: {
    size: [1, 1],
    place: "corner",
    draw(ctx, x, y, random) {
      floorShadow(ctx, x + 2, y + 14, 12);
      wood(ctx, x + 2, y + 2, 12, 12, LIGHT_WOOD, { random });
      rect(ctx, DARK_WOOD, x + 2, y + 2, 12, 1);
      rect(ctx, DARK_WOOD, x + 2, y + 13, 12, 1);
      for (let i = 0; i < 10; i++)
        rect(ctx, DARK_WOOD, x + 3 + i, y + 3 + i, 1, 1);
      for (const [nx, ny] of [
        [3, 3],
        [12, 3],
        [3, 12],
        [12, 12],
      ])
        rect(ctx, "#5b5f66", x + nx, y + ny, 1, 1);
      if (random.chance(0.5)) {
        rect(ctx, "#d6334a", x + 4, y, 3, 3);
        rect(ctx, "#7cbf5b", x + 8, y, 3, 3);
      }
    },
  },
  sacks: {
    size: [1, 1],
    place: "corner",
    draw(ctx, x, y) {
      floorShadow(ctx, x + 1, y + 14, 14);
      for (const [sx, sy, h] of [
        [1, 5, 10],
        [8, 3, 12],
      ]) {
        rect(ctx, OUTLINE, x + sx - 1, y + sy - 1, 9, h + 2);
        rect(ctx, "#e6dcc4", x + sx, y + sy, 7, h);
        rect(ctx, "#f6efdc", x + sx, y + sy, 2, h - 1);
        rect(ctx, "#c9bd9e", x + sx + 5, y + sy + 1, 2, h - 1);
        rect(ctx, "#a89a7a", x + sx + 2, y + sy + 1, 3, 1);
        rect(ctx, "#a89a7a", x + sx + 3, y + sy + 4, 1, 3);
      }
      rect(ctx, "#f6efdc", x + 9, y + 2, 4, 1);
    },
  },
  plant: {
    size: [1, 1],
    place: "corner",
    draw(ctx, x, y, random) {
      floorShadow(ctx, x + 3, y + 14, 10);
      rect(ctx, OUTLINE, x + 3, y + 8, 10, 8);
      rect(ctx, "#a8573e", x + 4, y + 9, 8, 6);
      rect(ctx, "#c97a5a", x + 4, y + 9, 8, 1);
      rect(ctx, "#7a3e2c", x + 4, y + 14, 8, 1);
      const leaves = [
        [2, 2],
        [6, 0],
        [10, 2],
        [4, 5],
        [8, 4],
      ];
      for (const [lx, ly] of leaves) {
        rect(ctx, "#2f6e3a", x + lx, y + ly + 1, 5, 4);
        rect(ctx, "#4c9a52", x + lx, y + ly, 4, 3);
        rect(ctx, "#7cc070", x + lx + 1, y + ly, 2, 1);
      }
      if (random.chance(0.6)) {
        const flower = random.pick(["#ff8fb8", "#ffd84a", "#ffffff"]);
        rect(ctx, flower, x + 7, y, 2, 2);
        rect(ctx, flower, x + 11, y + 3, 2, 2);
      }
    },
  },
  chest: {
    size: [1, 1],
    place: "corner",
    draw(ctx, x, y, random) {
      floorShadow(ctx, x + 1, y + 14, 14);
      wood(ctx, x + 1, y + 6, 14, 9, WOOD, { random });
      rect(ctx, OUTLINE, x + 1, y + 2, 14, 5);
      rect(ctx, shade(WOOD, 0.15), x + 2, y + 3, 12, 3);
      rect(ctx, shade(WOOD, 0.35), x + 2, y + 3, 12, 1);
      for (const bx of [x + 3, x + 12]) rect(ctx, "#5b5f66", bx, y + 2, 1, 13);
      rect(ctx, OUTLINE, x + 6, y + 6, 4, 4);
      rect(ctx, BRASS, x + 7, y + 7, 2, 2);
    },
  },
  cauldron: {
    size: [1, 1],
    place: "floor",
    draw(ctx, x, y, random) {
      rect(ctx, "#ff6a2a", x + 4, y + 13, 8, 2);
      rect(ctx, "#ffb43c", x + 6, y + 13, 4, 1);
      rect(ctx, OUTLINE, x + 1, y + 3, 14, 11);
      rect(ctx, "#2b2930", x + 2, y + 4, 12, 9);
      rect(ctx, "#4a474f", x + 2, y + 4, 3, 8);
      rect(ctx, "#4cb06a", x + 3, y + 4, 10, 3);
      rect(ctx, "#8ce08a", x + 4 + random.int(0, 5), y + 4, 2, 1);
      rect(ctx, "#8ce08a", x + 9, y + 5, 1, 1);
      rect(ctx, "rgba(140, 224, 138, 0.5)", x + 6, y, 2, 2);
      rect(ctx, "#5b5f66", x, y + 6, 2, 2);
      rect(ctx, "#5b5f66", x + 14, y + 6, 2, 2);
    },
  },
  herbs: {
    size: [2, 1],
    place: "wall",
    draw(ctx, x, y, random) {
      // Bundles drying on a beam
      rect(ctx, OUTLINE, x + 1, y - 21, 30, 4);
      rect(ctx, WOOD, x + 2, y - 20, 28, 2);
      for (let i = 0; i < 5; i++) {
        const hx = x + 3 + i * 6;
        rect(ctx, "#c9b98a", hx + 2, y - 18, 1, 3);
        const green = random.pick(["#3f8f4a", "#6a9a3a", "#2f6e3a", "#8a7a3a"]);
        rect(ctx, OUTLINE, hx, y - 15, 5, 9);
        rect(ctx, green, hx + 1, y - 15, 3, 8);
        rect(ctx, shade(green, 0.3), hx + 1, y - 15, 1, 7);
      }
      floorShadow(ctx, x + 2, y + 13, 28);
      wood(ctx, x + 2, y + 2, 28, 11, WOOD, { random });
      // Mortar and jars on the table
      rect(ctx, OUTLINE, x + 5, y - 3, 7, 6);
      rect(ctx, "#cfd3d6", x + 6, y - 2, 5, 4);
      rect(ctx, "#4cb06a", x + 7, y - 2, 3, 1);
      shelfThings(ctx, x + 16, y + 2, 12, random, "jars");
    },
  },
  oven: {
    size: [2, 1],
    place: "wall",
    draw(ctx, x, y, random) {
      floorShadow(ctx, x + 2, y + 13, 28);
      rect(ctx, OUTLINE, x + 1, y - 19, 30, 32);
      for (let row = 0; row < 6; row++) {
        for (let column = -1; column < 5; column++) {
          const sx = x + 2 + column * 7 + (row % 2 ? 3 : 0);
          const left = Math.max(sx, x + 2);
          const right = Math.min(sx + 6, x + 30);
          if (right <= left) continue;
          const tone = random() * 0.16 - 0.08;
          rect(
            ctx,
            shade("#a85c48", tone),
            left,
            y - 18 + row * 5,
            right - left,
            4,
          );
          rect(
            ctx,
            shade("#a85c48", tone + 0.15),
            left,
            y - 18 + row * 5,
            right - left,
            1,
          );
        }
      }
      rect(ctx, OUTLINE, x + 8, y - 6, 16, 14);
      fire(ctx, x + 9, y - 5, 14, 12);
      // Bread baking
      rect(ctx, OUTLINE, x + 11, y - 1, 10, 4);
      rect(ctx, "#c98a3a", x + 12, y, 8, 2);
      rect(ctx, "#e3a24c", x + 12, y, 4, 1);
      // Peel leaning against it
      rect(ctx, "#6e4430", x + 28, y - 12, 1, 22);
      rect(ctx, OUTLINE, x + 26, y + 8, 5, 5);
      rect(ctx, LIGHT_WOOD, x + 27, y + 9, 3, 3);
    },
  },
  desk: {
    size: [2, 1],
    place: "wall",
    draw(ctx, x, y, random) {
      floorShadow(ctx, x + 2, y + 13, 28);
      wood(ctx, x + 2, y + 3, 10, 10, DARK_WOOD, { random });
      rect(ctx, BRASS, x + 6, y + 6, 2, 1);
      rect(ctx, BRASS, x + 6, y + 10, 2, 1);
      rect(ctx, shade(DARK_WOOD, -0.3), x + 3, y + 8, 8, 1);
      rect(ctx, OUTLINE, x + 25, y + 3, 5, 11);
      rect(ctx, DARK_WOOD, x + 26, y + 3, 3, 10);
      wood(ctx, x + 1, y - 2, 30, 5, WOOD, { random });
      // Open book, quill, candle, papers
      rect(ctx, OUTLINE, x + 6, y - 6, 13, 5);
      rect(ctx, "#f4ede0", x + 7, y - 5, 5, 3);
      rect(ctx, "#ece4d2", x + 13, y - 5, 5, 3);
      rect(ctx, "#8a8f96", x + 8, y - 4, 3, 1);
      rect(ctx, "#8a8f96", x + 14, y - 4, 3, 1);
      rect(ctx, "#f4ede0", x + 21, y - 8, 1, 6);
      rect(ctx, "#ffffff", x + 22, y - 9, 1, 3);
      rect(ctx, "#f4ede0", x + 25, y - 7, 2, 5);
      rect(ctx, "#ffb43c", x + 25, y - 9, 2, 2);
    },
  },
  rug: {
    size: [3, 2],
    place: "floor",
    walkable: true,
    draw(ctx, x, y, random) {
      const color = random.pick(FABRICS);
      const border = shade(color, -0.3);
      rect(ctx, border, x + 2, y + 4, 44, 24);
      rect(ctx, color, x + 4, y + 6, 40, 20);
      rect(ctx, shade(color, 0.25), x + 6, y + 8, 36, 1);
      rect(ctx, shade(color, 0.25), x + 6, y + 23, 36, 1);
      // Diamond pattern in the middle
      const cx = x + 24;
      const cy = y + 16;
      for (let i = 0; i < 6; i++) {
        rect(ctx, "#f4ede0", cx - i, cy - 5 + i, 1, 1);
        rect(ctx, "#f4ede0", cx + i, cy - 5 + i, 1, 1);
        rect(ctx, "#f4ede0", cx - i, cy + 5 - i, 1, 1);
        rect(ctx, "#f4ede0", cx + i, cy + 5 - i, 1, 1);
      }
      rect(ctx, shade(color, 0.35), cx - 1, cy - 1, 3, 3);
      for (const px of [x + 10, x + 38]) {
        rect(ctx, shade(color, 0.25), px - 2, cy - 2, 4, 4);
      }
      // Fringe
      for (let px = x + 3; px < x + 46; px += 2) {
        rect(ctx, "#f4ede0", px, y + 3, 1, 1);
        rect(ctx, "#f4ede0", px, y + 28, 1, 1);
      }
    },
  },
};

// ---------------------------------------------------------------------------
// Small things on the floor (they don't block the way)

export const CLUTTER = {
  basket(ctx, x, y) {
    floorShadow(ctx, x + 3, y + 14, 10);
    rect(ctx, OUTLINE, x + 3, y + 7, 10, 8);
    rect(ctx, "#c99a5a", x + 4, y + 8, 8, 6);
    for (let px = x + 4; px < x + 12; px += 2)
      rect(ctx, "#a87d40", px, y + 9, 1, 5);
    rect(ctx, "#e0b878", x + 4, y + 8, 8, 1);
    rect(ctx, "#d6334a", x + 5, y + 6, 3, 3);
    rect(ctx, "#ff6b6b", x + 5, y + 6, 1, 1);
    rect(ctx, "#7cbf5b", x + 8, y + 6, 3, 3);
    rect(ctx, "#a8573e", x + 6, y + 3, 1, 4);
    rect(ctx, "#a8573e", x + 10, y + 3, 1, 4);
    rect(ctx, "#a8573e", x + 6, y + 3, 5, 1);
  },
  bucket(ctx, x, y) {
    floorShadow(ctx, x + 4, y + 14, 8);
    rect(ctx, OUTLINE, x + 4, y + 6, 8, 9);
    rect(ctx, WOOD, x + 5, y + 7, 6, 7);
    rect(ctx, "#5b5f66", x + 5, y + 9, 6, 1);
    rect(ctx, "#5b5f66", x + 5, y + 12, 6, 1);
    rect(ctx, "#4f7fb8", x + 5, y + 7, 6, 2);
    rect(ctx, "#9ccbe8", x + 6, y + 7, 2, 1);
    rect(ctx, "#5b5f66", x + 4, y + 3, 1, 3);
    rect(ctx, "#5b5f66", x + 11, y + 3, 1, 3);
    rect(ctx, "#5b5f66", x + 5, y + 2, 6, 1);
  },
  books(ctx, x, y) {
    floorShadow(ctx, x + 3, y + 14, 10);
    for (const [dy, color] of [
      [12, "#c4475d"],
      [9, "#3f7fc4"],
      [6, "#e8c45a"],
    ]) {
      rect(ctx, OUTLINE, x + 3, y + dy - 1, 10, 4);
      rect(ctx, color, x + 4, y + dy, 8, 2);
      rect(ctx, "#f4ede0", x + 11, y + dy, 1, 2);
      rect(ctx, shade(color, 0.3), x + 4, y + dy, 7, 1);
    }
  },
  broom(ctx, x, y) {
    rect(ctx, OUTLINE, x + 6, y - 5, 3, 16);
    rect(ctx, "#9a6240", x + 7, y - 4, 1, 14);
    rect(ctx, OUTLINE, x + 3, y + 9, 9, 7);
    rect(ctx, "#d9b452", x + 4, y + 10, 7, 5);
    for (let px = x + 5; px < x + 11; px += 2)
      rect(ctx, "#b8913a", px, y + 11, 1, 4);
    rect(ctx, "#a8573e", x + 4, y + 10, 7, 1);
  },
  pot(ctx, x, y) {
    floorShadow(ctx, x + 4, y + 14, 9);
    rect(ctx, OUTLINE, x + 3, y + 6, 11, 9);
    rect(ctx, "#a8573e", x + 4, y + 7, 9, 7);
    rect(ctx, "#c97a5a", x + 5, y + 7, 3, 6);
    rect(ctx, "#7a3e2c", x + 11, y + 8, 2, 6);
    rect(ctx, OUTLINE, x + 5, y + 4, 7, 3);
    rect(ctx, "#b0654a", x + 6, y + 5, 5, 1);
  },
  tools(ctx, x, y) {
    floorShadow(ctx, x + 2, y + 14, 12);
    rect(ctx, "#6e4430", x + 2, y + 12, 12, 2);
    rect(ctx, OUTLINE, x + 2, y + 9, 5, 4);
    rect(ctx, STEEL, x + 3, y + 10, 3, 2);
    rect(ctx, "#6e4430", x + 9, y + 5, 1, 9);
    rect(ctx, OUTLINE, x + 7, y + 3, 6, 3);
    rect(ctx, STEEL, x + 8, y + 4, 4, 1);
    rect(ctx, "#c9cfd6", x + 8, y + 4, 1, 1);
  },
};

export const CLUTTER_FOR = {
  smithy: ["tools", "bucket", "tools"],
  bakery: ["basket", "broom", "basket"],
  clinic: ["bucket", "books", "pot"],
  school: ["books", "books", "basket"],
  shop: ["basket", "pot", "basket"],
  tavern: ["bucket", "broom", "basket"],
  home: ["basket", "books", "broom", "pot"],
};

// ---------------------------------------------------------------------------
// Things hanging on the back wall

export const WALL_DECOR = {
  painting(ctx, x, y, random) {
    rect(ctx, OUTLINE, x, y + 5, 15, 13);
    rect(ctx, BRASS, x + 1, y + 6, 13, 11);
    rect(ctx, "#9ccbe8", x + 2, y + 7, 11, 5);
    rect(ctx, "#d6eefa", x + 3, y + 8, 3, 1);
    rect(ctx, random.pick(["#4c9a52", "#6a9a3a"]), x + 2, y + 12, 11, 4);
    rect(ctx, "#2f6e3a", x + 4, y + 10, 3, 3);
    rect(ctx, "#ffd84a", x + 10, y + 8, 2, 2);
    rect(ctx, shade(BRASS, -0.3), x + 1, y + 16, 13, 1);
  },
  clock(ctx, x, y) {
    rect(ctx, OUTLINE, x + 3, y + 4, 10, 13);
    rect(ctx, DARK_WOOD, x + 4, y + 5, 8, 11);
    rect(ctx, OUTLINE, x + 4, y + 6, 8, 7);
    rect(ctx, "#f4ede0", x + 5, y + 7, 6, 5);
    rect(ctx, OUTLINE, x + 8, y + 8, 1, 2);
    rect(ctx, OUTLINE, x + 8, y + 9, 2, 1);
    rect(ctx, BRASS, x + 7, y + 13, 2, 2);
  },
  plates(ctx, x, y) {
    rect(ctx, OUTLINE, x, y + 15, 16, 3);
    rect(ctx, WOOD, x + 1, y + 15, 14, 2);
    for (const [px, color] of [
      [x + 1, "#3f7fc4"],
      [x + 6, "#c4475d"],
      [x + 11, "#3f7fc4"],
    ]) {
      rect(ctx, OUTLINE, px, y + 8, 5, 7);
      rect(ctx, "#e8e2d4", px + 1, y + 9, 3, 5);
      rect(ctx, color, px + 2, y + 10, 1, 3);
    }
  },
  pans(ctx, x, y) {
    rect(ctx, DARK_WOOD, x, y + 5, 16, 2);
    for (const px of [x + 1, x + 9]) {
      rect(ctx, "#3d3a40", px + 2, y + 7, 1, 3);
      rect(ctx, OUTLINE, px, y + 10, 7, 7);
      rect(ctx, "#5b5f66", px + 1, y + 11, 5, 5);
      rect(ctx, "#a8aeb5", px + 1, y + 11, 2, 1);
      rect(ctx, "#b8743a", px + 2, y + 13, 3, 2);
    }
  },
  horseshoe(ctx, x, y) {
    rect(ctx, OUTLINE, x + 3, y + 6, 10, 10);
    rect(ctx, STEEL, x + 4, y + 7, 2, 8);
    rect(ctx, STEEL, x + 10, y + 7, 2, 8);
    rect(ctx, STEEL, x + 5, y + 6, 6, 2);
    rect(ctx, "#c9cfd6", x + 4, y + 7, 1, 4);
    rect(ctx, "#4a474f", x + 6, y + 8, 4, 8);
  },
  map(ctx, x, y) {
    rect(ctx, OUTLINE, x, y + 5, 16, 12);
    rect(ctx, "#e8d9b0", x + 1, y + 6, 14, 10);
    rect(ctx, "#6aa6c8", x + 1, y + 6, 14, 3);
    rect(ctx, "#7cbf5b", x + 3, y + 9, 6, 4);
    rect(ctx, "#4c9a52", x + 4, y + 10, 3, 2);
    rect(ctx, "#6aa6c8", x + 10, y + 11, 4, 4);
    rect(ctx, "#c4475d", x + 6, y + 12, 1, 1);
    rect(ctx, "#a89a7a", x + 1, y + 15, 14, 1);
  },
  window_box(ctx, x, y, random) {
    rect(ctx, OUTLINE, x + 1, y + 13, 14, 4);
    rect(ctx, "#a8573e", x + 2, y + 14, 12, 2);
    for (let i = 0; i < 5; i++) {
      rect(ctx, "#4c9a52", x + 2 + i * 3, y + 11, 2, 3);
      rect(
        ctx,
        random.pick(["#ff8fb8", "#ffd84a", "#ffffff"]),
        x + 2 + i * 3,
        y + 10,
        2,
        1,
      );
    }
  },
};

export const WALL_DECOR_FOR = {
  smithy: ["horseshoe", "pans", "horseshoe"],
  bakery: ["pans", "plates", "clock"],
  clinic: ["clock", "painting", "map"],
  school: ["map", "clock", "painting"],
  tavern: ["plates", "painting", "pans"],
  shop: ["clock", "map", "plates"],
  home: ["painting", "clock", "plates", "window_box"],
};
