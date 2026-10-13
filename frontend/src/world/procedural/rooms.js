// Interiors drawn with code: a room (floor, walls, windows) and furniture
// from a catalog, placed so that every piece can be reached from the door.
// The furniture list can come from the language model (the trade of who
// lives there), so a clinic gets cots and herbs, a smithy a forge.

import { OUTLINE, rect, seeded, shade } from "./pixel.js";

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
const FABRICS = ["#c4475d", "#3f7fc4", "#4c9a52", "#8a5ab8", "#d98a3a"];

// ---------------------------------------------------------------------------
// Furniture: size in tiles, where it goes and how it is drawn (x, y = top
// left of its tiles; tall pieces are drawn above them, against the wall)

const box = (ctx, color, x, y, width, height) => {
  rect(ctx, OUTLINE, x - 1, y - 1, width + 2, height + 2);
  rect(ctx, color, x, y, width, height);
  if (width > 3 && height > 3) {
    rect(ctx, shade(color, 0.18), x, y, width, 1);
    rect(ctx, shade(color, -0.22), x, y + height - 1, width, 1);
    rect(ctx, shade(color, -0.12), x + width - 1, y + 1, 1, height - 2);
  }
};

export const FURNITURE = {
  bed: {
    size: [2, 3],
    place: "wall",
    draw(ctx, x, y, random) {
      const blanket = random.pick(FABRICS);
      box(ctx, "#7d5232", x + 2, y - 6, 28, 8);
      rect(ctx, "#9a6240", x + 3, y - 5, 26, 2);
      box(ctx, "#f4ede0", x + 3, y + 2, 26, 40);
      rect(ctx, "#ffffff", x + 6, y + 4, 20, 8);
      rect(ctx, "#d9d1c0", x + 6, y + 11, 20, 1);
      rect(ctx, blanket, x + 3, y + 16, 26, 26);
      rect(ctx, shade(blanket, 0.2), x + 3, y + 16, 26, 3);
      rect(ctx, shade(blanket, -0.25), x + 3, y + 40, 26, 2);
      box(ctx, "#7d5232", x + 2, y + 42, 28, 4);
    },
  },
  cot: {
    size: [1, 2],
    place: "wall",
    draw(ctx, x, y) {
      box(ctx, "#8a8f96", x + 2, y + 2, 12, 28);
      rect(ctx, "#f4ede0", x + 3, y + 3, 10, 26);
      rect(ctx, "#ffffff", x + 4, y + 4, 8, 5);
      rect(ctx, "#cfd8e6", x + 3, y + 14, 10, 15);
    },
  },
  table: {
    size: [2, 2],
    place: "floor",
    draw(ctx, x, y, random) {
      rect(ctx, "rgba(0,0,0,0.2)", x + 3, y + 26, 28, 4);
      rect(ctx, "#5a3626", x + 4, y + 18, 3, 10);
      rect(ctx, "#5a3626", x + 25, y + 18, 3, 10);
      box(ctx, "#b07848", x + 2, y + 4, 28, 16);
      for (let px = x + 6; px < x + 30; px += 8) {
        rect(ctx, "#9a6240", px, y + 6, 1, 12);
      }
      if (random.chance(0.5)) {
        const cloth = random.pick(["#f4ede0", "#c4475d", "#3f7fc4"]);
        rect(ctx, cloth, x + 6, y + 6, 20, 13);
        rect(ctx, shade(cloth, -0.2), x + 6, y + 18, 20, 3);
        if (cloth !== "#f4ede0") {
          for (let px = x + 7; px < x + 26; px += 4)
            rect(ctx, "#f4ede0", px, y + 8, 2, 2);
        }
      }
      // Plates, a cup and a candle
      for (const px of [x + 6, x + 19]) {
        rect(ctx, "#e8e2d4", px, y + 9, 7, 4);
        rect(ctx, "#ffffff", px + 1, y + 9, 5, 1);
        if (random.chance(0.6))
          rect(
            ctx,
            random.pick(["#e3a24c", "#c4475d", "#7cbf5b"]),
            px + 2,
            y + 10,
            3,
            2,
          );
      }
      if (random.chance(0.7)) {
        box(ctx, "#d9cdb0", x + 15, y + 6, 3, 4);
      }
      if (random.chance(0.6)) {
        rect(ctx, "#f4ede0", x + 14, y + 13, 2, 4);
        rect(ctx, "#ffd84a", x + 14, y + 11, 2, 2);
        rect(ctx, "#fff6c8", x + 14, y + 11, 1, 1);
      }
    },
  },
  stool: {
    size: [1, 1],
    place: "floor",
    draw(ctx, x, y, random) {
      const backrest = random.chance(0.6);
      rect(ctx, "rgba(0,0,0,0.2)", x + 2, y + 13, 12, 3);
      rect(ctx, "#5a3626", x + 3, y + 9, 2, 6);
      rect(ctx, "#5a3626", x + 11, y + 9, 2, 6);
      if (backrest) {
        box(ctx, "#8a5a38", x + 3, y - 1, 10, 4);
        rect(ctx, "#5a3626", x + 3, y + 3, 2, 4);
        rect(ctx, "#5a3626", x + 11, y + 3, 2, 4);
      }
      box(ctx, "#b07848", x + 2, y + 6, 12, 4);
    },
  },
  shelf: {
    size: [2, 1],
    place: "wall",
    draw(ctx, x, y, random) {
      box(ctx, "#7d5232", x + 1, y - 24, 30, 38);
      rect(ctx, "#5a3a26", x + 3, y - 22, 26, 34);
      for (let level = 0; level < 3; level++) {
        const sy = y - 22 + level * 12;
        rect(ctx, "#9a6240", x + 3, sy + 10, 26, 2);
        for (let px = x + 4; px < x + 27;) {
          const width = random.int(2, 4);
          const height = random.int(6, 9);
          rect(ctx, random.pick(FABRICS), px, sy + 10 - height, width, height);
          px += width + (random.chance(0.3) ? 2 : 0);
        }
      }
    },
  },
  bottles: {
    size: [2, 1],
    place: "wall",
    draw(ctx, x, y, random) {
      box(ctx, "#7d5232", x + 1, y - 20, 30, 32);
      rect(ctx, "#5a3a26", x + 3, y - 18, 26, 28);
      for (let level = 0; level < 2; level++) {
        const sy = y - 18 + level * 14;
        rect(ctx, "#9a6240", x + 3, sy + 12, 26, 2);
        for (let px = x + 5; px < x + 27; px += 5) {
          const color = random.pick([
            "#4cb06a",
            "#6aa6c8",
            "#c4475d",
            "#e8c45a",
          ]);
          rect(ctx, color, px, sy + 5, 3, 7);
          rect(ctx, "#d9d1c0", px + 1, sy + 3, 1, 2);
        }
      }
    },
  },
  stove: {
    size: [2, 1],
    place: "wall",
    draw(ctx, x, y) {
      rect(ctx, "#3d3a40", x + 13, y - 28, 6, 18);
      box(ctx, "#4a474f", x + 3, y - 10, 26, 22);
      rect(ctx, "#5d5a63", x + 3, y - 10, 26, 3);
      box(ctx, "#2b2930", x + 9, y - 2, 14, 10);
      rect(ctx, "#ff8a3a", x + 11, y + 2, 10, 5);
      rect(ctx, "#ffd36a", x + 13, y + 4, 6, 2);
    },
  },
  fireplace: {
    size: [3, 1],
    place: "wall",
    draw(ctx, x, y) {
      box(ctx, "#8a8f96", x + 2, y - 24, 44, 36);
      for (let row = 0; row < 6; row++) {
        for (let column = 0; column < 6; column++) {
          rect(
            ctx,
            (row + column) % 2 ? "#7a7f86" : "#9aa0a6",
            x + 3 + column * 7 + (row % 2 ? 3 : 0),
            y - 23 + row * 6,
            6,
            5,
          );
        }
      }
      box(ctx, "#1f1a1e", x + 12, y - 8, 24, 18);
      rect(ctx, "#6e4430", x + 15, y + 6, 18, 3);
      rect(ctx, "#ff6a2a", x + 17, y - 2, 14, 8);
      rect(ctx, "#ffb43c", x + 20, y, 8, 5);
      rect(ctx, "#fff0a0", x + 23, y + 2, 3, 2);
      rect(ctx, "#6e4430", x, y - 26, 48, 3);
    },
  },
  forge: {
    size: [2, 2],
    place: "wall",
    draw(ctx, x, y) {
      rect(ctx, "#5d5a63", x + 6, y - 26, 20, 18);
      rect(ctx, "#4a474f", x + 4, y - 10, 24, 4);
      box(ctx, "#8a8f96", x + 2, y - 6, 28, 30);
      rect(ctx, "#7a7f86", x + 2, y + 6, 28, 2);
      box(ctx, "#2b1a14", x + 6, y - 2, 20, 8);
      rect(ctx, "#ff6a2a", x + 7, y - 1, 18, 6);
      rect(ctx, "#ffd36a", x + 10, y + 1, 4, 2);
      rect(ctx, "#ffd36a", x + 17, y, 3, 2);
    },
  },
  anvil: {
    size: [1, 1],
    place: "floor",
    draw(ctx, x, y) {
      rect(ctx, "rgba(0,0,0,0.25)", x + 2, y + 13, 12, 2);
      box(ctx, "#6e4430", x + 4, y + 8, 8, 6);
      box(ctx, "#4a474f", x + 1, y + 3, 14, 5);
      rect(ctx, "#8a8f96", x + 2, y + 3, 10, 1);
    },
  },
  workbench: {
    size: [3, 1],
    place: "wall",
    draw(ctx, x, y) {
      rect(ctx, "#6e4430", x + 4, y + 6, 3, 9);
      rect(ctx, "#6e4430", x + 41, y + 6, 3, 9);
      box(ctx, "#b07848", x + 2, y - 2, 44, 9);
      rect(ctx, "#c98f5d", x + 2, y - 2, 44, 2);
      rect(ctx, "#8a8f96", x + 8, y - 6, 8, 3);
      rect(ctx, "#6e4430", x + 15, y - 5, 6, 1);
      rect(ctx, "#c9cfd6", x + 26, y - 5, 10, 2);
      rect(ctx, "#6e4430", x + 36, y - 5, 4, 2);
    },
  },
  counter: {
    size: [4, 1],
    place: "floor",
    draw(ctx, x, y, random) {
      box(ctx, "#9a6240", x + 1, y + 2, 62, 12);
      rect(ctx, "#c98f5d", x + 1, y + 2, 62, 3);
      for (let px = x + 4; px < x + 60; px += 8)
        rect(ctx, "#7d5232", px, y + 6, 1, 8);
      for (let i = 0; i < 4; i++) {
        box(
          ctx,
          random.pick(["#e3a24c", "#c4475d", "#4cb06a", "#e8c45a"]),
          x + 6 + i * 14,
          y - 3,
          6,
          5,
        );
      }
    },
  },
  barrel: {
    size: [1, 1],
    place: "corner",
    draw(ctx, x, y) {
      box(ctx, "#9a6240", x + 2, y + 1, 12, 14);
      rect(ctx, "#6e4430", x + 2, y + 4, 12, 1);
      rect(ctx, "#6e4430", x + 2, y + 11, 12, 1);
      rect(ctx, "#c98a5a", x + 4, y + 1, 8, 2);
    },
  },
  crate: {
    size: [1, 1],
    place: "corner",
    draw(ctx, x, y) {
      box(ctx, "#b07848", x + 2, y + 2, 12, 12);
      rect(ctx, "#7d5232", x + 2, y + 7, 12, 1);
      rect(ctx, "#7d5232", x + 7, y + 2, 1, 12);
    },
  },
  sacks: {
    size: [1, 1],
    place: "corner",
    draw(ctx, x, y) {
      box(ctx, "#e6dcc4", x + 1, y + 5, 7, 10);
      box(ctx, "#d9cdb0", x + 8, y + 3, 7, 12);
      rect(ctx, "#a89a7a", x + 10, y + 3, 3, 1);
    },
  },
  plant: {
    size: [1, 1],
    place: "corner",
    draw(ctx, x, y) {
      box(ctx, "#a8573e", x + 4, y + 9, 8, 6);
      rect(ctx, "#3f8f4a", x + 3, y + 1, 10, 8);
      rect(ctx, "#6fc070", x + 5, y + 2, 3, 3);
      rect(ctx, "#ff8fb8", x + 9, y + 3, 2, 2);
    },
  },
  chest: {
    size: [1, 1],
    place: "corner",
    draw(ctx, x, y) {
      box(ctx, "#9a6240", x + 1, y + 5, 14, 10);
      rect(ctx, "#7d5232", x + 1, y + 5, 14, 3);
      rect(ctx, "#e2b73c", x + 7, y + 8, 2, 3);
    },
  },
  cauldron: {
    size: [1, 1],
    place: "floor",
    draw(ctx, x, y) {
      box(ctx, "#2b2930", x + 2, y + 4, 12, 10);
      rect(ctx, "#4cb06a", x + 3, y + 4, 10, 3);
      rect(ctx, "#8ce08a", x + 5, y + 4, 2, 1);
      rect(ctx, "#ff8a3a", x + 5, y + 14, 6, 2);
    },
  },
  herbs: {
    size: [2, 1],
    place: "wall",
    draw(ctx, x, y) {
      rect(ctx, "#6e4430", x + 2, y - 18, 28, 2);
      for (let i = 0; i < 5; i++) {
        rect(ctx, "#c9b98a", x + 5 + i * 5, y - 16, 1, 3);
        rect(ctx, i % 2 ? "#3f8f4a" : "#6a9a3a", x + 3 + i * 5, y - 13, 5, 7);
      }
      box(ctx, "#9a6240", x + 3, y + 2, 26, 10);
      rect(ctx, "#4cb06a", x + 6, y - 1, 3, 3);
      rect(ctx, "#c4475d", x + 22, y - 1, 3, 3);
    },
  },
  oven: {
    size: [2, 1],
    place: "wall",
    draw(ctx, x, y) {
      box(ctx, "#a85c48", x + 2, y - 16, 28, 28);
      for (let row = 0; row < 5; row++) {
        for (let column = 0; column < 4; column++) {
          rect(
            ctx,
            "#8a4a3a",
            x + 2 + column * 7 + (row % 2 ? 3 : 0),
            y - 16 + row * 6 + 5,
            6,
            1,
          );
        }
      }
      box(ctx, "#2b1a14", x + 9, y - 4, 14, 10);
      rect(ctx, "#ff8a3a", x + 10, y + 1, 12, 4);
      rect(ctx, "#e3a24c", x + 12, y - 2, 8, 3);
    },
  },
  desk: {
    size: [2, 1],
    place: "wall",
    draw(ctx, x, y) {
      rect(ctx, "#6e4430", x + 4, y + 6, 3, 8);
      rect(ctx, "#6e4430", x + 25, y + 6, 3, 8);
      box(ctx, "#9a6240", x + 2, y - 1, 28, 8);
      box(ctx, "#f4ede0", x + 7, y - 4, 10, 4);
      rect(ctx, "#3d3a40", x + 9, y - 3, 6, 1);
      rect(ctx, "#f4ede0", x + 22, y - 6, 2, 5);
      rect(ctx, "#ffd84a", x + 22, y - 8, 2, 2);
    },
  },
  rug: {
    size: [3, 2],
    place: "floor",
    walkable: true,
    draw(ctx, x, y, random) {
      const color = random.pick(FABRICS);
      rect(ctx, shade(color, -0.3), x + 2, y + 4, 44, 24);
      rect(ctx, color, x + 4, y + 6, 40, 20);
      rect(ctx, shade(color, 0.3), x + 8, y + 10, 32, 1);
      rect(ctx, shade(color, 0.3), x + 8, y + 21, 32, 1);
      for (let px = x + 4; px < x + 44; px += 3)
        rect(ctx, "#f4ede0", px, y + 3, 1, 1);
    },
  },
};

// Small things on the floor (they don't block the way)
const CLUTTER = {
  basket(ctx, x, y) {
    rect(ctx, OUTLINE, x + 3, y + 8, 10, 7);
    rect(ctx, "#c99a5a", x + 4, y + 9, 8, 5);
    rect(ctx, "#a87d40", x + 4, y + 11, 8, 1);
    rect(ctx, "#e05a3a", x + 5, y + 7, 3, 2);
    rect(ctx, "#7cbf5b", x + 8, y + 7, 3, 2);
  },
  bucket(ctx, x, y) {
    rect(ctx, OUTLINE, x + 4, y + 7, 8, 8);
    rect(ctx, "#8a8f96", x + 5, y + 8, 6, 6);
    rect(ctx, "#4f7fb8", x + 5, y + 8, 6, 2);
    rect(ctx, "#5b5f66", x + 4, y + 5, 8, 1);
  },
  books(ctx, x, y) {
    for (const [dy, color] of [
      [12, "#c4475d"],
      [9, "#3f7fc4"],
      [6, "#e8c45a"],
    ]) {
      rect(ctx, OUTLINE, x + 3, y + dy - 1, 10, 4);
      rect(ctx, color, x + 4, y + dy, 8, 2);
    }
  },
  broom(ctx, x, y) {
    rect(ctx, "#9a6240", x + 7, y - 4, 1, 14);
    rect(ctx, OUTLINE, x + 4, y + 9, 8, 6);
    rect(ctx, "#d9b452", x + 5, y + 10, 6, 4);
  },
  pot(ctx, x, y) {
    rect(ctx, OUTLINE, x + 4, y + 8, 9, 7);
    rect(ctx, "#a8573e", x + 5, y + 9, 7, 5);
    rect(ctx, "#c97a5a", x + 5, y + 9, 7, 1);
  },
  tools(ctx, x, y) {
    rect(ctx, "#6e4430", x + 3, y + 12, 10, 2);
    rect(ctx, "#8a8f96", x + 3, y + 10, 4, 3);
    rect(ctx, "#6e4430", x + 9, y + 6, 1, 8);
    rect(ctx, "#8a8f96", x + 8, y + 5, 3, 2);
  },
};

const CLUTTER_FOR = {
  smithy: ["tools", "bucket", "tools"],
  bakery: ["basket", "broom", "basket"],
  clinic: ["bucket", "books", "pot"],
  school: ["books", "books", "basket"],
  shop: ["basket", "pot", "basket"],
  tavern: ["bucket", "broom", "basket"],
  home: ["basket", "books", "broom", "pot"],
};

// Things hanging on the back wall
const WALL_DECOR = {
  painting(ctx, x, y, random) {
    rect(ctx, OUTLINE, x, y + 6, 14, 12);
    rect(ctx, "#c98a5a", x + 1, y + 7, 12, 10);
    rect(ctx, "#9ccbe8", x + 2, y + 8, 10, 5);
    rect(ctx, random.pick(["#4c9a52", "#6a9a3a"]), x + 2, y + 13, 10, 3);
    rect(ctx, "#ffd84a", x + 9, y + 9, 2, 2);
  },
  clock(ctx, x, y) {
    rect(ctx, OUTLINE, x + 3, y + 6, 9, 9);
    rect(ctx, "#f4ede0", x + 4, y + 7, 7, 7);
    rect(ctx, OUTLINE, x + 7, y + 8, 1, 3);
    rect(ctx, OUTLINE, x + 7, y + 10, 3, 1);
  },
  plates(ctx, x, y) {
    rect(ctx, "#6e4430", x, y + 15, 16, 2);
    for (const px of [x + 1, x + 6, x + 11]) {
      rect(ctx, OUTLINE, px, y + 9, 5, 6);
      rect(ctx, "#e8e2d4", px + 1, y + 10, 3, 4);
      rect(ctx, "#3f7fc4", px + 2, y + 11, 1, 2);
    }
  },
  pans(ctx, x, y) {
    rect(ctx, "#5a3626", x, y + 6, 16, 1);
    for (const px of [x + 2, x + 9]) {
      rect(ctx, "#3d3a40", px + 2, y + 7, 1, 3);
      rect(ctx, OUTLINE, px, y + 10, 6, 6);
      rect(ctx, "#5b5f66", px + 1, y + 11, 4, 4);
    }
  },
  horseshoe(ctx, x, y) {
    rect(ctx, "#8a8f96", x + 4, y + 8, 2, 7);
    rect(ctx, "#8a8f96", x + 10, y + 8, 2, 7);
    rect(ctx, "#8a8f96", x + 5, y + 7, 6, 2);
  },
  map(ctx, x, y) {
    rect(ctx, OUTLINE, x, y + 6, 16, 11);
    rect(ctx, "#e8d9b0", x + 1, y + 7, 14, 9);
    rect(ctx, "#7cbf5b", x + 3, y + 9, 5, 4);
    rect(ctx, "#6aa6c8", x + 9, y + 10, 4, 4);
    rect(ctx, "#c4475d", x + 6, y + 12, 1, 1);
  },
};

const WALL_DECOR_FOR = {
  smithy: ["horseshoe", "pans", "horseshoe"],
  bakery: ["pans", "plates", "clock"],
  clinic: ["clock", "painting", "map"],
  school: ["map", "clock", "painting"],
  tavern: ["plates", "painting", "pans"],
  shop: ["clock", "map", "plates"],
  home: ["painting", "clock", "plates", "pans"],
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
    const [w, h] = FURNITURE[name].size;
    if (!FURNITURE[name].walkable) {
      rect(
        ctx,
        "rgba(0, 0, 0, 0.16)",
        x + column * T + 2,
        y + (row + h) * T - 3,
        w * T - 2,
        4,
      );
    }
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
    rect(ctx, shade(base, -0.35), x, y, width, height);
    for (let row = 0; row * 8 < height; row++) {
      for (let px = x - (row % 2) * 5; px < x + width; px += 10) {
        const w = random.int(7, 9);
        rect(
          ctx,
          shade(base, random() * 0.2 - 0.1),
          Math.max(x, px + 1),
          y + row * 8 + 1,
          Math.min(w, x + width - Math.max(x, px + 1)),
          6,
        );
      }
    }
    return;
  }

  if (kind === "tiles") {
    for (let row = 0; row * 8 < height; row++) {
      for (let column = 0; column * 8 < width; column++) {
        rect(
          ctx,
          (row + column) % 2 ? base : shade(base, -0.18),
          x + column * 8,
          y + row * 8,
          8,
          8,
        );
      }
    }
    return;
  }

  // Wooden planks
  for (let row = 0; row * 5 < height; row++) {
    const py = y + row * 5;
    rect(ctx, row % 2 ? base : shade(base, -0.06), x, py, width, 5);
    rect(ctx, shade(base, -0.35), x, py + 4, width, 1);
    for (let px = x + ((row * 13) % 24); px < x + width; px += 24) {
      rect(ctx, shade(base, -0.35), px, py, 1, 4);
    }
    if (random.chance(0.5))
      rect(ctx, shade(base, 0.12), x + random.int(0, width - 6), py + 1, 5, 1);
  }
}

function drawBackWall(ctx, kind, random, x, y, width) {
  const base = ROOM_WALLS[kind] ?? ROOM_WALLS.plaster;
  const height = 2 * T;

  rect(ctx, base, x, y, width, height);

  if (kind === "wood") {
    for (let px = x; px < x + width; px += 6) {
      rect(ctx, shade(base, random() * 0.12 - 0.06), px, y, 5, height);
      rect(ctx, shade(base, -0.35), px + 5, y, 1, height);
    }
  } else if (kind === "stone") {
    for (let row = 0; row * 6 < height; row++) {
      for (let px = x - (row % 2) * 5; px < x + width; px += 10) {
        rect(
          ctx,
          shade(base, random() * 0.16 - 0.08),
          Math.max(x, px + 1),
          y + row * 6 + 1,
          8,
          4,
        );
      }
    }
  } else {
    for (let i = 0; i < width / 2; i++) {
      rect(
        ctx,
        shade(base, random.chance(0.5) ? -0.05 : 0.04),
        x + random.int(0, width - 1),
        y + random.int(0, height - 1),
      );
    }
    rect(ctx, "#8a5a38", x, y + 3, width, 2);
  }

  rect(ctx, OUTLINE, x, y, width, 2);
  rect(ctx, "#6e4430", x, y + height - 4, width, 4);
  rect(ctx, "#9a6240", x, y + height - 4, width, 1);
  rect(ctx, "rgba(0, 0, 0, 0.18)", x, y + height, width, 3);
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
  const { columns, rows } = spec;
  const canvas = document.createElement("canvas");
  canvas.width = columns * T;
  canvas.height = rows * T;
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  const layout = drawRoom(ctx, spec, 0, 0);

  const collisions = layout.blocked.flat().map((blocked) => (blocked ? 1 : 0));
  const stand = ([column, row]) => ({
    x: column * T,
    y: row * T + 2,
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
    canvas,
    map: {
      width: columns,
      height: rows,
      tileWidth: T,
      tileHeight: T,
      collisions,
      points,
    },
  };
}
