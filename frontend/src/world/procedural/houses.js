// Houses drawn with code (pixel art), from a description: size, roof,
// walls, windows, chimney, the sign of the trade and things around the
// door. Made to be described by the language model (village plan), so every
// building of the village can look different.

import { OUTLINE, rect, seeded, shade } from "./pixel.js";

export const ROOFS = {
  red: "#c4475d",
  slate: "#5d6f8a",
  green: "#4f8a5b",
  brown: "#9a6240",
  thatch: "#d4a64a",
  teal: "#3f8a8a",
};

export const WALLS = {
  plaster: "#f1e4cc",
  wood: "#b07848",
  stone: "#a2a6ac",
  brick: "#b4584a",
};

const TRIM = "#e39a5a";
const WOOD = "#9a6240";
const GLASS = "#4f7fb8";
const SHUTTERS = ["#4c9a52", "#3f7fc4", "#c4475d", "#8a5ab8"];

// Little pictures for the signs (6 x 5): "#" dark, "o" color, "." empty
const ICONS = {
  bread: {
    color: "#e3a24c",
    art: ["......", ".oooo.", "oooooo", "o#o#oo", ".oooo."],
  },
  anvil: {
    color: "#5b5f66",
    art: ["oooooo", ".oooo#", "..oo..", ".oooo.", "oooooo"],
  },
  cross: {
    color: "#d6455d",
    art: ["..oo..", "..oo..", "oooooo", "..oo..", "..oo.."],
  },
  fish: {
    color: "#6aa6c8",
    art: ["......", "o.ooo.", "ooooo#", "o.ooo.", "......"],
  },
  wheat: {
    color: "#e8c45a",
    art: ["o.o.o.", ".ooo..", "..o...", "..o...", "..o..."],
  },
  book: {
    color: "#8a5ab8",
    art: ["oo.oo.", "oo.oo.", "oo.oo.", "oo.oo.", "######"],
  },
  potion: {
    color: "#4cb06a",
    art: ["..##..", "..oo..", ".oooo.", "oooooo", ".oooo."],
  },
  mug: {
    color: "#e8c45a",
    art: ["oooo..", "oooo#.", "oooo.#", "oooo#.", "oooo.."],
  },
  needle: {
    color: "#c4475d",
    art: ["....#.", "...o..", "..o...", ".o....", "o....."],
  },
};

/** Size in pixels of a house (the description may come from the model). */
export function houseSize(spec) {
  const wallHeight = spec.tall ? 38 : 30;
  const roofHeight =
    spec.roofStyle === "gable" ? Math.round(spec.width * 0.55) : 26;
  return { wallHeight, roofHeight, height: roofHeight + wallHeight + 3 };
}

/**
 * @param {CanvasRenderingContext2D} ctx
 * @param {object} spec
 * @param {number} spec.width Pixels (48 to 84).
 * @param {"gable" | "ridge"} spec.roofStyle
 * @param {keyof ROOFS} spec.roof
 * @param {keyof WALLS} spec.wall
 * @param {boolean} [spec.timber] Wooden beams on plaster walls.
 * @param {number} spec.windows 0 to 3 on the front.
 * @param {boolean} spec.chimney
 * @param {keyof ICONS | null} spec.sign
 * @param {string[]} spec.decor flowers, barrels, crates, anvil, hay, net,
 *   woodpile, herbs, bench, lantern
 * @param {number} spec.seed
 * @param {number} x Left of the walls.
 * @param {number} y Top of the roof.
 */
export function drawHouse(ctx, spec, x, y) {
  const random = seeded(spec.seed);
  const { width } = spec;
  const { wallHeight, roofHeight } = houseSize(spec);
  const wallTop = y + roofHeight;
  const ground = wallTop + wallHeight + 3;

  // Shadow on the grass
  rect(ctx, "rgba(20, 40, 20, 0.25)", x + 2, ground - 1, width + 2, 4);

  drawWalls(ctx, spec, random, x, wallTop, width, wallHeight);
  drawFoundation(ctx, random, x, wallTop + wallHeight, width);

  // Door and windows share the front
  const { door, windows } = drawFront(
    ctx,
    spec,
    random,
    x,
    wallTop,
    width,
    wallHeight,
  );

  const chimney =
    spec.roofStyle === "gable"
      ? drawGableRoof(ctx, spec, random, x, y, width, roofHeight)
      : drawRidgeRoof(ctx, spec, random, x, y, width, roofHeight);

  if (spec.sign && spec.sign !== "none") {
    drawSign(ctx, spec.sign, door.x + door.width + 2, wallTop + 8);
  }
  drawDecor(ctx, spec, random, x, ground, width, door);

  return { door, windows, chimney, wallTop, ground };
}

// ---------------------------------------------------------------------------
// Walls

function drawWalls(ctx, spec, random, x, top, width, height) {
  const base = WALLS[spec.wall] ?? WALLS.plaster;

  rect(ctx, base, x, top, width, height);

  if (spec.wall === "wood") {
    for (let row = 0; row * 4 < height; row++) {
      const py = top + row * 4;
      rect(ctx, row % 2 ? shade(base, 0.08) : base, x, py, width, 4);
      rect(ctx, shade(base, -0.35), x, py + 3, width, 1);
      if (random.chance(0.6))
        rect(
          ctx,
          shade(base, -0.25),
          x + random.int(2, width - 3),
          py + 1,
          1,
          1,
        );
    }
  } else if (spec.wall === "stone" || spec.wall === "brick") {
    const [w, h] = spec.wall === "stone" ? [7, 4] : [5, 3];
    for (let row = 0; row * h < height; row++) {
      for (let column = -1; column * w < width; column++) {
        const px = x + column * w + (row % 2 ? Math.floor(w / 2) : 0);
        const tone = random() * 0.16 - 0.08;
        rect(
          ctx,
          shade(base, tone),
          Math.max(x, px),
          top + row * h,
          Math.min(w - 1, x + width - Math.max(x, px)),
          h - 1,
        );
      }
      rect(ctx, shade(base, -0.3), x, top + row * h + h - 1, width, 1);
    }
  } else {
    // Plaster with some texture, and wooden beams
    for (let i = 0; i < (width * height) / 18; i++) {
      rect(
        ctx,
        shade(base, random.chance(0.5) ? -0.06 : 0.05),
        x + random.int(0, width - 1),
        top + random.int(0, height - 1),
      );
    }
    if (spec.timber) {
      const beam = shade(WOOD, -0.1);
      rect(ctx, beam, x, top, width, 2);
      rect(ctx, beam, x, top + Math.round(height / 2), width, 2);
      rect(ctx, beam, x, top, 2, height);
      rect(ctx, beam, x + width - 2, top, 2, height);
      for (let i = 0; i < 5; i++) {
        rect(
          ctx,
          beam,
          x + 2 + i * 2,
          top + Math.round(height / 2) - 2 - i * 2,
          2,
          2,
        );
        rect(
          ctx,
          beam,
          x + width - 4 - i * 2,
          top + Math.round(height / 2) - 2 - i * 2,
          2,
          2,
        );
      }
    }
  }

  // Shade under the roof and the corners
  rect(ctx, "rgba(0, 0, 0, 0.18)", x, top, width, 3);
  rect(ctx, OUTLINE, x - 1, top, 1, height);
  rect(ctx, OUTLINE, x + width, top, 1, height);
}

function drawFoundation(ctx, random, x, top, width) {
  rect(ctx, "#6c7178", x - 1, top, width + 2, 3);
  for (let px = x; px < x + width; px += 4) {
    rect(ctx, random.chance(0.5) ? "#8a8f96" : "#7a7f86", px, top, 3, 2);
  }
  rect(ctx, OUTLINE, x - 1, top + 3, width + 2, 1);
}

/** Door (in the middle or to a side) and the windows around it. */
function drawFront(ctx, spec, random, x, top, width, height) {
  const doorWidth = 10;
  const doorHeight = Math.min(17, height - 6);
  const slots = Math.max(1, Math.floor((width - doorWidth) / 14));
  const doorX = x + doorOffset(spec);
  const door = {
    x: doorX,
    y: top + height - doorHeight,
    width: doorWidth,
    height: doorHeight,
  };

  drawDoor(ctx, door, random);

  // Windows: left and right of the door, as many as fit
  const free = [];
  for (let px = x + 4; px + 11 <= x + width - 3; px += 14) {
    if (px + 11 < door.x - 1 || px > door.x + doorWidth + 1) free.push(px);
  }
  const windows = free
    .sort((a, b) => Math.abs(a + 5 - door.x) - Math.abs(b + 5 - door.x))
    .slice(0, Math.min(spec.windows, slots + 1));
  const shutters = random.chance(0.6) ? random.pick(SHUTTERS) : null;
  windows.forEach((px) =>
    drawWindow(
      ctx,
      px,
      top + 8,
      { shutters, flowers: spec.decor?.includes("flowers") },
      random,
    ),
  );

  return {
    door,
    windows: windows.map((px) => ({ x: px + 4, y: top + 12 })),
  };
}

function drawDoor(ctx, { x, y, width, height }, random) {
  const frame = shade(TRIM, -0.15);
  rect(ctx, frame, x - 1, y - 1, width + 2, height + 1);
  rect(ctx, "#6e4430", x, y, width, height);
  for (let i = 1; i < width; i += 3)
    rect(ctx, "#5a3626", x + i, y + 2, 1, height - 2);
  // Rounded top
  rect(ctx, frame, x, y, 2, 1);
  rect(ctx, frame, x + width - 2, y, 2, 1);
  rect(ctx, frame, x, y + 1, 1, 1);
  rect(ctx, frame, x + width - 1, y + 1, 1, 1);
  rect(ctx, "#e2b73c", x + width - 3, y + Math.round(height / 2), 1, 2);
  rect(ctx, "#8a8f96", x - 1, y + height, width + 2, 1);
  if (random.chance(0.5))
    rect(ctx, "#a8475d", x + 2, y + height + 1, width - 4, 1);
}

function drawWindow(ctx, x, y, { shutters, flowers }, random) {
  const frame = TRIM;
  rect(ctx, shade(frame, -0.3), x - 1, y - 1, 11, 11);
  rect(ctx, frame, x, y, 9, 9);
  rect(ctx, GLASS, x + 1, y + 1, 7, 7);
  rect(ctx, shade(GLASS, 0.35), x + 2, y + 2, 2, 1);
  rect(ctx, shade(GLASS, 0.35), x + 2, y + 3, 1, 1);
  rect(ctx, frame, x + 4, y + 1, 1, 7);
  rect(ctx, frame, x + 1, y + 4, 7, 1);
  rect(ctx, shade(frame, -0.2), x - 1, y + 9, 11, 2);

  if (shutters) {
    for (const sx of [x - 4, x + 10]) {
      rect(ctx, shade(shutters, -0.35), sx, y - 1, 3, 11);
      rect(ctx, shutters, sx, y, 2, 9);
      rect(ctx, shade(shutters, -0.2), sx, y + 3, 2, 1);
    }
  }

  if (flowers) {
    rect(ctx, "#6e4430", x - 1, y + 11, 11, 3);
    const colors = ["#ff8fb8", "#ffd84a", "#ffffff", "#ff6b6b", "#9fb4ff"];
    for (let i = 0; i < 5; i++) {
      rect(ctx, "#3f8f4a", x + i * 2, y + 10, 1, 1);
      rect(ctx, random.pick(colors), x + i * 2, y + 9 - (i % 2), 2, 1);
    }
  }
}

// ---------------------------------------------------------------------------
// Roofs

function shingles(ctx, spec, random, left, right, top, bottom) {
  const base = ROOFS[spec.roof] ?? ROOFS.red;
  const thatch = spec.roof === "thatch";
  const rowHeight = thatch ? 3 : 4;

  for (let py = bottom - rowHeight; py >= top - rowHeight; py -= rowHeight) {
    const row = Math.round((bottom - py) / rowHeight);
    const [from, to] = [left(py), right(py)];
    if (to <= from) continue;
    rect(
      ctx,
      row % 2 ? base : shade(base, 0.06),
      from,
      Math.max(py, top),
      to - from,
      rowHeight,
    );
    rect(ctx, shade(base, -0.3), from, py + rowHeight - 1, to - from, 1);

    if (thatch) {
      for (let px = from + (row % 2); px < to; px += 2) {
        if (random.chance(0.55))
          rect(
            ctx,
            shade(base, random.chance(0.5) ? 0.15 : -0.15),
            px,
            py,
            1,
            rowHeight - 1,
          );
      }
    } else {
      for (let px = from + (row % 2 ? 3 : 0); px < to; px += 6) {
        rect(ctx, shade(base, -0.22), px, Math.max(py, top), 1, rowHeight - 1);
      }
      if (random.chance(0.35))
        rect(
          ctx,
          shade(base, 0.18),
          from + random.int(0, Math.max(0, to - from - 3)),
          py + 1,
          2,
          1,
        );
    }
  }
}

/** Ridge roof seen from the front (Stardew style): a slope over the walls. */
function drawRidgeRoof(ctx, spec, random, x, y, width, height) {
  const base = ROOFS[spec.roof] ?? ROOFS.red;
  const left = x - 4;
  const right = x + width + 4;
  const bottom = y + height + 1;

  // Gable ends on the sides, behind the slope
  rect(
    ctx,
    shade(WALLS[spec.wall] ?? WALLS.plaster, -0.12),
    x - 2,
    y + 6,
    width + 4,
    height - 4,
  );

  shingles(
    ctx,
    spec,
    random,
    () => left,
    () => right,
    y + 4,
    bottom,
  );

  // Ridge cap and the edge of the eaves
  rect(ctx, shade(base, -0.4), left, y + 1, right - left, 4);
  rect(ctx, shade(base, 0.12), left + 1, y + 2, right - left - 2, 2);
  rect(ctx, OUTLINE, left, y, right - left, 1);
  rect(ctx, OUTLINE, left - 1, y + 1, 1, height);
  rect(ctx, OUTLINE, right, y + 1, 1, height);
  rect(ctx, shade(base, -0.45), left, bottom - 1, right - left, 2);
  rect(ctx, OUTLINE, left, bottom + 1, right - left, 1);

  if (!spec.chimney) return null;
  const cx = x + Math.round(width * 0.72);
  drawChimney(ctx, cx, y - 7, 12, random);
  return { x: cx + 3, y: y - 7 };
}

/** Gable roof with the triangle of the facade (like the houses of the map). */
function drawGableRoof(ctx, spec, random, x, y, width, height) {
  const base = ROOFS[spec.roof] ?? ROOFS.red;
  const center = x + width / 2;
  const half = width / 2 + 5;
  const bottom = y + height + 2;
  const at = (py) => ((py - y) / (bottom - y)) * half;

  shingles(
    ctx,
    spec,
    random,
    (py) => Math.round(center - at(py)),
    (py) => Math.round(center + at(py)),
    y,
    bottom,
  );

  // Triangle of the facade (inset), with a round window
  const inset = 7;
  const atInner = (py) =>
    Math.max(0, ((py - y - inset) / (bottom - y - inset)) * (half - inset));
  for (let py = y + inset; py < bottom; py++) {
    const span = Math.round(atInner(py));
    if (span <= 0) continue;
    rect(
      ctx,
      WALLS[spec.wall] ?? WALLS.plaster,
      Math.round(center - span),
      py,
      span * 2,
      1,
    );
  }
  const wy = y + Math.round(height * 0.55);
  rect(ctx, shade(TRIM, -0.3), center - 4, wy - 1, 8, 8);
  rect(ctx, TRIM, center - 3, wy, 6, 6);
  rect(ctx, GLASS, center - 2, wy + 1, 4, 4);
  rect(ctx, shade(GLASS, 0.35), center - 2, wy + 1, 1, 1);

  // Trim along the slopes and the outline
  for (let py = y; py < bottom; py++) {
    const span = Math.round(at(py));
    rect(ctx, TRIM, Math.round(center - span), py, 3, 1);
    rect(ctx, TRIM, Math.round(center + span) - 3, py, 3, 1);
    rect(ctx, OUTLINE, Math.round(center - span) - 1, py, 1, 1);
    rect(ctx, OUTLINE, Math.round(center + span), py, 1, 1);
  }
  rect(ctx, shade(TRIM, 0.2), center - 1, y - 1, 2, 2);
  rect(
    ctx,
    OUTLINE,
    Math.round(center - half) - 1,
    bottom,
    Math.round(half * 2) + 2,
    1,
  );

  rect(
    ctx,
    shade(base, -0.4),
    Math.round(center - half),
    bottom - 1,
    Math.round(half * 2),
    1,
  );
  if (!spec.chimney) return null;
  const cx = x + Math.round(width * 0.74);
  const cy = y + Math.round(height * 0.18);
  drawChimney(ctx, cx, cy, 9, random);
  return { x: cx + 3, y: cy };
}

function drawChimney(ctx, x, y, height, random) {
  rect(ctx, OUTLINE, x - 1, y - 1, 8, height + 1);
  rect(ctx, "#8a4a3a", x, y, 6, height);
  for (let row = 0; row < height; row += 3) {
    rect(ctx, "#6e3a2e", x, y + row + 2, 6, 1);
    rect(ctx, "#a85c48", x + (row % 6 ? 3 : 0), y + row, 2, 2);
  }
  rect(ctx, "#5a3028", x - 1, y - 1, 8, 2);
  if (random.chance(0.5))
    rect(ctx, "rgba(215,215,220,0.6)", x + 2, y - 4, 3, 2);
}

// ---------------------------------------------------------------------------
// Sign and things around the house

function drawSign(ctx, icon, x, y) {
  const art = ICONS[icon];
  if (!art) return;
  rect(ctx, "#3d3a40", x, y, 7, 1);
  rect(ctx, "#3d3a40", x + 1, y + 1, 1, 2);
  rect(ctx, "#3d3a40", x + 6, y + 1, 1, 2);
  rect(ctx, OUTLINE, x - 1, y + 3, 10, 9);
  rect(ctx, "#c98a5a", x, y + 4, 8, 7);
  art.art.forEach((line, row) =>
    [...line].forEach((cell, column) => {
      if (cell === ".") return;
      rect(
        ctx,
        cell === "#" ? "#2b1d1a" : art.color,
        x + 1 + column,
        y + 5 + row,
      );
    }),
  );
}

function drawDecor(ctx, spec, random, x, ground, width, door) {
  const items = (spec.decor ?? []).filter((item) => item !== "flowers");
  // Free spots on the ground, left and right of the door
  const spots = [x - 6, x + width - 4, x + 2, x + width - 12].filter(
    (px) => px + 10 < door.x || px > door.x + door.width + 2,
  );

  items.slice(0, spots.length).forEach((item, i) => {
    const px = spots[i];
    DECOR[item]?.(ctx, px, ground, random);
  });
}

const DECOR = {
  barrels(ctx, x, ground) {
    for (const dx of [0, 6]) {
      rect(ctx, OUTLINE, x + dx - 1, ground - 10, 7, 10);
      rect(ctx, "#9a6240", x + dx, ground - 9, 5, 8);
      rect(ctx, "#6e4430", x + dx, ground - 7, 5, 1);
      rect(ctx, "#6e4430", x + dx, ground - 3, 5, 1);
      rect(ctx, "#c98a5a", x + dx + 1, ground - 9, 3, 1);
    }
  },
  crates(ctx, x, ground) {
    rect(ctx, OUTLINE, x - 1, ground - 9, 10, 9);
    rect(ctx, "#b07848", x, ground - 8, 8, 7);
    rect(ctx, "#7d5232", x, ground - 8, 8, 1);
    rect(ctx, "#7d5232", x + 3, ground - 8, 1, 7);
    rect(ctx, OUTLINE, x + 2, ground - 15, 7, 7);
    rect(ctx, "#c98f5d", x + 3, ground - 14, 5, 5);
  },
  anvil(ctx, x, ground) {
    rect(ctx, "#6e4430", x + 1, ground - 5, 7, 5);
    rect(ctx, OUTLINE, x - 1, ground - 9, 11, 4);
    rect(ctx, "#5b5f66", x, ground - 8, 9, 2);
    rect(ctx, "#8a8f96", x + 1, ground - 8, 6, 1);
    rect(ctx, "#ff8a3a", x + 9, ground - 4, 2, 2);
  },
  hay(ctx, x, ground) {
    rect(ctx, OUTLINE, x - 1, ground - 8, 13, 8);
    rect(ctx, "#e1b85a", x, ground - 7, 11, 6);
    rect(ctx, "#c49a3e", x + 3, ground - 7, 1, 6);
    rect(ctx, "#c49a3e", x + 7, ground - 7, 1, 6);
    rect(ctx, "#f2d27e", x + 1, ground - 7, 9, 1);
  },
  net(ctx, x, ground) {
    rect(ctx, "#6e4430", x, ground - 14, 1, 14);
    rect(ctx, "#6e4430", x + 10, ground - 14, 1, 14);
    for (let i = 0; i < 4; i++) {
      rect(ctx, "#c9b98a", x + 1, ground - 12 + i * 3, 9, 1);
      rect(ctx, "#c9b98a", x + 2 + i * 2, ground - 13, 1, 11);
    }
  },
  woodpile(ctx, x, ground) {
    for (const [dx, dy] of [
      [0, 0],
      [4, 0],
      [8, 0],
      [2, 4],
      [6, 4],
    ]) {
      rect(ctx, "#6e4430", x + dx, ground - 5 - dy, 4, 4);
      rect(ctx, "#e0b080", x + dx + 1, ground - 4 - dy, 2, 2);
    }
  },
  herbs(ctx, x, ground) {
    for (const dx of [0, 6]) {
      rect(ctx, "#a8573e", x + dx, ground - 5, 5, 5);
      rect(ctx, "#3f8f4a", x + dx, ground - 9, 5, 4);
      rect(ctx, "#6fc070", x + dx + 1, ground - 10, 2, 2);
    }
  },
  bench(ctx, x, ground) {
    rect(ctx, "#6e4430", x, ground - 3, 1, 3);
    rect(ctx, "#6e4430", x + 10, ground - 3, 1, 3);
    rect(ctx, OUTLINE, x - 1, ground - 6, 13, 3);
    rect(ctx, "#b07848", x, ground - 5, 11, 1);
  },
  lantern(ctx, x, ground) {
    rect(ctx, "#3d3a40", x + 3, ground - 16, 1, 16);
    rect(ctx, OUTLINE, x + 1, ground - 20, 5, 5);
    rect(ctx, "#ffe38a", x + 2, ground - 19, 3, 3);
  },
};

/** Description of a house for a kind of building (when the model gives none). */
export function houseFor(kind, seed) {
  const random = seeded(seed);
  const presets = {
    bakery: {
      roof: "brown",
      wall: "plaster",
      timber: true,
      sign: "bread",
      decor: ["flowers", "crates", "bench"],
    },
    smithy: {
      roof: "slate",
      wall: "stone",
      sign: "anvil",
      decor: ["anvil", "woodpile", "barrels"],
      chimney: true,
    },
    clinic: {
      roof: "teal",
      wall: "plaster",
      sign: "cross",
      decor: ["herbs", "flowers", "bench"],
    },
    fisher: {
      roof: "thatch",
      wall: "wood",
      sign: "fish",
      decor: ["net", "barrels"],
    },
    farm: {
      roof: "thatch",
      wall: "wood",
      sign: "wheat",
      decor: ["hay", "woodpile"],
    },
    school: {
      roof: "green",
      wall: "brick",
      sign: "book",
      decor: ["bench", "lantern"],
    },
    tavern: {
      roof: "red",
      wall: "wood",
      sign: "mug",
      decor: ["barrels", "lantern"],
    },
    tailor: {
      roof: "red",
      wall: "plaster",
      timber: true,
      sign: "needle",
      decor: ["flowers", "crates"],
    },
    home: {
      roof: random.pick(["red", "green", "slate", "brown"]),
      wall: random.pick(["plaster", "wood", "brick"]),
      timber: random.chance(0.5),
      sign: null,
      decor: random.chance(0.5)
        ? ["flowers", "bench"]
        : ["woodpile", "flowers"],
    },
  };

  return {
    width: random.pick([48, 60, 72]),
    roofStyle: random.chance(0.5) ? "gable" : "ridge",
    windows: random.int(1, 3),
    chimney: random.chance(0.7),
    seed,
    ...(presets[kind] ?? presets.home),
  };
}

/** A house description from what the model chose (see backend villagePlan). */
export function houseFromLook(look, trade, seed) {
  const preset = houseFor(trade, seed);
  if (!look) return preset;

  return {
    ...preset,
    width: { small: 48, medium: 60, large: 60 }[look.size] ?? 60,
    tall: look.size === "large",
    roofStyle: look.roofStyle,
    roof: look.roof,
    wall: look.wall,
    timber: look.timber,
    windows: look.windows,
    chimney: look.chimney,
    sign: look.sign === "none" ? null : look.sign,
    decor: look.decor?.length ? look.decor : preset.decor,
  };
}

/** Where the door is, from the left of the walls (pixels). */
export function doorOffset(spec) {
  const doorWidth = 10;
  if (spec.door === "left") return 5;
  if (spec.door === "right") return spec.width - doorWidth - 5;
  return Math.round((spec.width - doorWidth) / 2);
}

/**
 * Where a house stands, without drawing it (for the layout of the village):
 * the door (center of the doorstep), the whole drawing and the blocked
 * rectangle (walls and the lower part of the roof).
 */
export function houseFootprint(spec, at) {
  const { height, roofHeight } = houseSize(spec);
  const blockedTop = at.ground - height + Math.round(roofHeight * 0.55);

  return {
    door: { x: at.x + doorOffset(spec) + 5, y: at.ground },
    area: { x: at.x - 4, y: at.ground - height, width: spec.width + 8, height },
    blocked: {
      x: at.x - 2,
      y: blockedTop,
      width: spec.width + 4,
      height: at.ground - blockedTop,
    },
  };
}

/**
 * Where the roof is (seen from the front), in white: snow covers it in the
 * winter (see world/terrain.js). Same coordinates as drawHouse.
 */
export function drawRoofMask(ctx, spec, x, y) {
  const { roofHeight: height } = houseSize(spec);
  const { width } = spec;
  ctx.fillStyle = "#ffffff";
  if (spec.roofStyle !== "gable") {
    ctx.fillRect(x - 4, y + 1, width + 8, height);
    return;
  }
  const center = x + width / 2;
  const half = width / 2 + 5;
  const bottom = y + height + 2;
  const inset = 7;
  for (let py = y; py < bottom - 1; py++) {
    const span = Math.round(((py - y) / (bottom - y)) * half);
    const inner = Math.round(
      Math.max(0, ((py - y - inset) / (bottom - y - inset)) * (half - inset)),
    );
    if (inner <= 0) {
      ctx.fillRect(Math.round(center - span), py, Math.max(1, span * 2), 1);
      continue;
    }
    ctx.fillRect(Math.round(center - span), py, span - inner, 1);
    ctx.fillRect(Math.round(center + inner), py, span - inner, 1);
  }
}

/**
 * A house for the map at `at` (left of the walls and the ground): its door,
 * windows, chimney, the whole drawing (area), the blocked rectangle (walls
 * and the lower part of the roof) and `paint(background, foreground)`, which
 * puts the part of the roof over the characters on the foreground (they
 * walk behind it) and the rest on the background. `roofs` (optional,
 * { background, foreground }) gets the same split of the roof mask.
 */
export function buildHouse(spec, at) {
  const { height, roofHeight } = houseSize(spec);
  const margin = 12;
  const canvas = document.createElement("canvas");
  canvas.width = spec.width + margin * 2;
  canvas.height = height + margin * 2;
  const ctx = canvas.getContext("2d");
  const drawn = drawHouse(ctx, spec, margin, margin);
  const mask = document.createElement("canvas");
  mask.width = canvas.width;
  mask.height = canvas.height;
  drawRoofMask(mask.getContext("2d"), spec, margin, margin);

  const left = at.x - margin;
  const top = at.ground - height - margin;
  // The upper part of the roof covers who walks behind the house
  const split = margin + Math.round(roofHeight * 0.55);
  const lower = canvas.height - split;
  const drawSplit = (image, background, foreground) => {
    background.drawImage(
      image,
      0,
      split,
      canvas.width,
      lower,
      left,
      top + split,
      canvas.width,
      lower,
    );
    foreground.drawImage(
      image,
      0,
      0,
      canvas.width,
      split,
      left,
      top,
      canvas.width,
      split,
    );
  };

  const paint = (background, foreground, roofs) => {
    drawSplit(canvas, background, foreground);
    if (roofs) drawSplit(mask, roofs.background, roofs.foreground);
  };

  const offset = (point) => point && { x: point.x + left, y: point.y + top };
  const footprint = houseFootprint(spec, at);
  return {
    paint,
    ...footprint,
    windows: drawn.windows.map(offset),
    chimney: drawn.chimney && {
      x: drawn.chimney.x + left,
      y: drawn.chimney.y + top + 10,
    },
  };
}
