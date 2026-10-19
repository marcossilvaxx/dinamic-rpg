// Pixel art of the things added over the map, drawn with rectangles (no
// image files). Every function draws at (x, y) = the bottom center of the
// thing, in map pixels; `t` is the animation time in ms.

const rect = (ctx, color, x, y, width = 1, height = 1) => {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x), Math.round(y), width, height);
};

const WOOD = "#9a6240";
const WOOD_DARK = "#6e4430";
const WOOD_LIGHT = "#c98a5a";
const STONE = "#9aa0a6";
const STONE_DARK = "#6c7178";
const IRON = "#3d3a40";

export function lamp(ctx, x, y, lit) {
  rect(ctx, "rgba(0,0,0,0.2)", x - 3, y - 1, 7, 2);
  rect(ctx, IRON, x - 2, y - 2, 5, 2);
  rect(ctx, IRON, x - 1, y - 20, 2, 18);
  rect(ctx, IRON, x - 3, y - 26, 6, 1);
  rect(ctx, lit ? "#ffe38a" : "#8b97a3", x - 2, y - 25, 4, 4);
  rect(ctx, lit ? "#fff6c8" : "#aab4bd", x - 1, y - 24, 1, 2);
  rect(ctx, IRON, x - 3, y - 21, 6, 1);
  rect(ctx, IRON, x - 1, y - 28, 2, 2);
}

export function windmill(ctx, x, y, angle) {
  // Tower
  rect(ctx, "rgba(0,0,0,0.2)", x - 12, y - 2, 24, 3);
  for (let row = 0; row < 40; row++) {
    const half = Math.round(10 - row * 0.12);
    rect(
      ctx,
      row % 6 === 0 ? "#cdbb9c" : "#e8d8b8",
      x - half,
      y - row - 1,
      half * 2,
      1,
    );
  }
  rect(ctx, "#b39d7c", x + 3, y - 40, 6, 40);
  rect(ctx, WOOD_DARK, x - 3, y - 10, 6, 10);
  rect(ctx, WOOD, x - 2, y - 9, 4, 9);
  rect(ctx, "#4b6a8a", x - 2, y - 26, 4, 4);
  // Roof
  for (let row = 0; row < 8; row++) {
    rect(
      ctx,
      row % 2 ? "#a8475d" : "#c45a74",
      x - 8 + row,
      y - 41 - row,
      16 - row * 2,
      1,
    );
  }
  // Sails
  const hubX = Math.round(x);
  const hubY = Math.round(y - 38);
  ctx.save();
  ctx.translate(hubX + 0.5, hubY + 0.5);
  for (let i = 0; i < 4; i++) {
    ctx.save();
    ctx.rotate(angle + (i * Math.PI) / 2);
    ctx.fillStyle = WOOD_DARK;
    ctx.fillRect(-0.5, 0, 1, 20);
    ctx.fillStyle = "#f2ead8";
    ctx.fillRect(1, 5, 4, 15);
    ctx.fillStyle = "#cdbfa2";
    for (let j = 8; j < 20; j += 4) ctx.fillRect(1, j, 4, 1);
    ctx.restore();
  }
  ctx.restore();
  rect(ctx, IRON, hubX - 1, hubY - 1, 3, 3);
}

export function well(ctx, x, y) {
  rect(ctx, "rgba(0,0,0,0.2)", x - 11, y - 2, 22, 3);
  rect(ctx, STONE_DARK, x - 10, y - 10, 20, 9);
  for (let i = 0; i < 5; i++) {
    rect(ctx, STONE, x - 10 + i * 4, y - 10 + (i % 2), 3, 3);
    rect(ctx, STONE, x - 9 + i * 4, y - 5 + ((i + 1) % 2), 3, 3);
  }
  rect(ctx, "#1f3d5a", x - 7, y - 12, 14, 3);
  rect(ctx, STONE, x - 10, y - 13, 20, 2);
  // Posts and roof
  rect(ctx, WOOD_DARK, x - 9, y - 26, 2, 14);
  rect(ctx, WOOD_DARK, x + 7, y - 26, 2, 14);
  rect(ctx, WOOD, x - 8, y - 22, 16, 1);
  for (let row = 0; row < 5; row++) {
    rect(
      ctx,
      row % 2 ? "#a8475d" : "#c45a74",
      x - 12 + row,
      y - 27 - row,
      24 - row * 2,
      1,
    );
  }
  rect(ctx, "#cfd3d6", x - 1, y - 21, 2, 6);
  rect(ctx, WOOD, x - 2, y - 16, 4, 3);
}

export function woodpile(ctx, x, y) {
  rect(ctx, "rgba(0,0,0,0.2)", x - 12, y - 2, 24, 3);
  const logs = [
    [-10, -6],
    [-5, -6],
    [0, -6],
    [-7.5, -11],
    [-2.5, -11],
  ];
  for (const [dx, dy] of logs) {
    rect(ctx, WOOD_DARK, x + dx, y + dy - 1, 5, 6);
    rect(ctx, "#e0b080", x + dx + 1, y + dy, 3, 4);
    rect(ctx, WOOD_LIGHT, x + dx + 2, y + dy + 1, 1, 2);
  }
  // Chopping block with an axe
  rect(ctx, WOOD_DARK, x + 6, y - 6, 6, 6);
  rect(ctx, "#d9a776", x + 6, y - 7, 6, 2);
  rect(ctx, WOOD_LIGHT, x + 9, y - 14, 1, 8);
  rect(ctx, "#b9c0c6", x + 7, y - 15, 4, 3);
}

export function chest(ctx, x, y, open) {
  rect(ctx, "rgba(0,0,0,0.2)", x - 6, y - 1, 12, 2);
  rect(ctx, WOOD_DARK, x - 6, y - 7, 12, 7);
  rect(ctx, WOOD, x - 5, y - 6, 10, 5);
  rect(ctx, "#e2b73c", x - 6, y - 4, 12, 1);
  if (open) {
    rect(ctx, "#2b1d14", x - 5, y - 8, 10, 2);
    rect(ctx, WOOD_DARK, x - 6, y - 13, 12, 5);
    rect(ctx, WOOD, x - 5, y - 12, 10, 3);
  } else {
    rect(ctx, WOOD_DARK, x - 6, y - 10, 12, 4);
    rect(ctx, WOOD_LIGHT, x - 5, y - 9, 10, 2);
    rect(ctx, "#e2b73c", x - 1, y - 7, 2, 3);
  }
}

export function sign(ctx, x, y) {
  rect(ctx, "rgba(0,0,0,0.2)", x - 3, y - 1, 6, 2);
  rect(ctx, WOOD_DARK, x - 1, y - 12, 2, 12);
  rect(ctx, WOOD_DARK, x - 7, y - 17, 14, 7);
  rect(ctx, WOOD_LIGHT, x - 6, y - 16, 12, 5);
  rect(ctx, WOOD_DARK, x - 4, y - 15, 8, 1);
  rect(ctx, WOOD_DARK, x - 4, y - 13, 6, 1);
}

export function scarecrow(ctx, x, y, t) {
  const sway = Math.round(Math.sin(t / 900));
  rect(ctx, "rgba(0,0,0,0.2)", x - 4, y - 1, 8, 2);
  rect(ctx, WOOD_DARK, x - 1, y - 18, 2, 18);
  rect(ctx, WOOD_DARK, x - 9 + sway, y - 17, 18, 2);
  rect(ctx, "#4f7cac", x - 4 + sway, y - 18, 8, 8);
  rect(ctx, "#d9b452", x - 10 + sway, y - 17, 2, 3);
  rect(ctx, "#d9b452", x + 8 + sway, y - 17, 2, 3);
  rect(ctx, "#e9cf7a", x - 3 + sway, y - 24, 6, 6);
  rect(ctx, IRON, x - 2 + sway, y - 22, 1, 1);
  rect(ctx, IRON, x + 1 + sway, y - 22, 1, 1);
  rect(ctx, "#7a5230", x - 5 + sway, y - 25, 10, 2);
  rect(ctx, "#7a5230", x - 3 + sway, y - 28, 6, 3);
}

const BUSH_FRUITS = {
  spring: ["#ffa6c9", "#ffffff"],
  summer: ["#d6334a", "#7a3fa8"],
  autumn: ["#c9772e", "#8a4b2b"],
  winter: [],
};

export function bush(ctx, x, y, season, empty) {
  const winter = season === "winter";
  rect(ctx, "rgba(0,0,0,0.18)", x - 6, y - 1, 12, 2);
  rect(ctx, winter ? "#5f7d58" : "#3f8f4a", x - 6, y - 6, 12, 6);
  rect(ctx, winter ? "#6f8f66" : "#4fa85a", x - 5, y - 8, 10, 3);
  rect(ctx, winter ? "#86a37c" : "#69c070", x - 3, y - 9, 5, 2);
  if (empty) return;

  const [a, b] = BUSH_FRUITS[season] ?? [];
  if (!a) return;
  if (season === "autumn") {
    // Mushrooms at the base
    rect(ctx, "#efe3cf", x - 7, y - 2, 1, 2);
    rect(ctx, a, x - 8, y - 4, 3, 2);
    rect(ctx, "#efe3cf", x + 6, y - 2, 1, 2);
    rect(ctx, b, x + 5, y - 3, 3, 1);
    return;
  }
  for (const [dx, dy, color] of [
    [-4, -6, a],
    [1, -7, b],
    [3, -4, a],
    [-2, -3, b],
  ]) {
    rect(ctx, color, x + dx, y + dy, 1, 1);
  }
}

export function campfire(ctx, x, y, t, lit) {
  rect(ctx, STONE_DARK, x - 6, y - 2, 3, 2);
  rect(ctx, STONE, x + 3, y - 2, 3, 2);
  rect(ctx, STONE, x - 4, y - 4, 2, 2);
  rect(ctx, STONE_DARK, x + 2, y - 4, 2, 2);
  rect(ctx, WOOD_DARK, x - 4, y - 3, 8, 2);
  rect(ctx, WOOD, x - 2, y - 4, 4, 2);
  if (!lit) return;

  const frame = Math.floor(t / 120) % 3;
  const heights = [
    [5, 7, 4],
    [6, 5, 7],
    [4, 8, 5],
  ][frame];
  heights.forEach((height, i) => {
    rect(ctx, "#e8582c", x - 3 + i * 2, y - 3 - height, 2, height);
    rect(ctx, "#ffb43c", x - 3 + i * 2, y - 2 - height / 2, 2, height / 2);
  });
  rect(ctx, "#fff0a0", x - 1, y - 5, 2, 2);
}

const AWNINGS = [
  ["#d6455d", "#f4ede0"],
  ["#3f7fc4", "#f4ede0"],
  ["#4c9a52", "#f2d064"],
  ["#8a5ab8", "#f4ede0"],
];

export function stall(ctx, x, y, seed = 0) {
  const [a, b] = AWNINGS[seed % AWNINGS.length];
  rect(ctx, "rgba(0,0,0,0.2)", x - 13, y - 2, 26, 3);
  rect(ctx, WOOD_DARK, x - 12, y - 22, 2, 22);
  rect(ctx, WOOD_DARK, x + 10, y - 22, 2, 22);
  rect(ctx, WOOD, x - 12, y - 9, 24, 5);
  rect(ctx, WOOD_LIGHT, x - 12, y - 10, 24, 2);
  // Goods on the table
  const goods = ["#e05a3a", "#f2c14e", "#7cbf5b", "#c97a3a", "#e8e0c8"];
  for (let i = 0; i < 6; i++) {
    rect(ctx, goods[(i + seed) % goods.length], x - 10 + i * 4, y - 12, 3, 2);
  }
  // Striped awning
  for (let i = 0; i < 7; i++) {
    rect(ctx, i % 2 ? b : a, x - 14 + i * 4, y - 27, 4, 5);
    rect(ctx, i % 2 ? b : a, x - 14 + i * 4, y - 22, 4, 1 + (i % 2));
  }
}

export function boat(ctx, x, y, t) {
  const bob = Math.round(Math.sin(t / 700));
  rect(ctx, "rgba(20,60,80,0.25)", x - 13, y - 1 + bob, 26, 3);
  rect(ctx, WOOD_DARK, x - 11, y - 6 + bob, 22, 5);
  rect(ctx, WOOD, x - 10, y - 7 + bob, 20, 3);
  rect(ctx, WOOD_LIGHT, x - 9, y - 6 + bob, 18, 1);
  rect(ctx, "#4b6a8a", x - 12, y - 5 + bob, 2, 2);
  rect(ctx, WOOD_LIGHT, x - 2, y - 18 + bob, 1, 12);
  rect(ctx, "#f2ead8", x - 1, y - 17 + bob, 7, 8);
}

export function flowerbed(ctx, x, y) {
  rect(ctx, WOOD_DARK, x - 11, y - 7, 22, 7);
  rect(ctx, "#6b4a35", x - 10, y - 6, 20, 5);
  const colors = ["#ff8fb8", "#ffffff", "#ffd84a", "#9fb4ff", "#ff6b6b"];
  for (let i = 0; i < 9; i++) {
    rect(ctx, "#3f8f4a", x - 9 + i * 2, y - 8, 1, 3);
    rect(
      ctx,
      colors[i % colors.length],
      x - 10 + i * 2,
      y - 10 + (i % 2),
      2,
      2,
    );
  }
}

export function workshop(ctx, x, y) {
  rect(ctx, "rgba(0,0,0,0.2)", x - 13, y - 2, 26, 3);
  rect(ctx, WOOD_DARK, x - 12, y - 16, 24, 16);
  for (let i = 0; i < 6; i++) rect(ctx, WOOD, x - 11 + i * 4, y - 15, 3, 15);
  rect(ctx, "#4a4048", x - 3, y - 10, 6, 10);
  for (let row = 0; row < 6; row++) {
    rect(
      ctx,
      row % 2 ? "#5d6670" : "#77818c",
      x - 14 + row,
      y - 17 - row,
      28 - row * 2,
      1,
    );
  }
  rect(ctx, IRON, x + 6, y - 5, 5, 2);
  rect(ctx, IRON, x + 7, y - 3, 3, 3);
}

export function banner(ctx, x, y, t, seed = 0) {
  const [color] = AWNINGS[seed % AWNINGS.length];
  rect(ctx, "rgba(0,0,0,0.2)", x - 3, y - 1, 6, 2);
  rect(ctx, WOOD_DARK, x - 1, y - 30, 2, 30);
  rect(ctx, "#e2b73c", x - 1, y - 32, 2, 2);
  for (let i = 0; i < 12; i++) {
    const wave = Math.round(Math.sin(t / 250 + i * 0.6));
    rect(ctx, color, x + 1 + i, y - 29 + wave, 1, 8);
  }
  rect(ctx, "#f4ede0", x + 5, y - 26 + Math.round(Math.sin(t / 250 + 3)), 3, 2);
}

export function weddingArch(ctx, x, y) {
  rect(ctx, "rgba(0,0,0,0.2)", x - 13, y - 1, 26, 2);
  rect(ctx, "#f4ede0", x - 12, y - 24, 2, 24);
  rect(ctx, "#f4ede0", x + 10, y - 24, 2, 24);
  for (let i = 0; i < 12; i++) {
    const dy = Math.round(Math.sin((i / 11) * Math.PI) * 6);
    rect(ctx, "#f4ede0", x - 12 + i * 2, y - 25 - dy, 2, 2);
  }
  const flowers = ["#ff8fb8", "#ffffff", "#ffd84a"];
  for (let i = 0; i < 14; i++) {
    const side = i % 2 ? -11 : 11;
    rect(ctx, flowers[i % 3], x + side - 1, y - 4 - i * 1.5, 2, 2);
  }
  for (let i = 0; i < 8; i++) {
    const dy = Math.round(Math.sin((i / 7) * Math.PI) * 6);
    rect(ctx, flowers[i % 3], x - 10 + i * 3, y - 28 - dy, 2, 2);
  }
}

export function wreckCart(ctx, x, y) {
  rect(ctx, "rgba(0,0,0,0.2)", x - 12, y - 2, 24, 3);
  // Overturned box
  rect(ctx, WOOD_DARK, x - 11, y - 9, 16, 9);
  rect(ctx, WOOD, x - 10, y - 8, 14, 3);
  rect(ctx, WOOD, x - 10, y - 4, 14, 3);
  // Loose wheel
  rect(ctx, WOOD_DARK, x + 6, y - 7, 7, 7);
  rect(ctx, WOOD_LIGHT, x + 7, y - 6, 5, 5);
  rect(ctx, WOOD_DARK, x + 9, y - 4, 1, 1);
  // Spilled goods
  rect(ctx, "#d6334a", x - 14, y - 2, 2, 2);
  rect(ctx, "#f2c14e", x - 6, y + 1, 2, 2);
}

export function wreckCrates(ctx, x, y) {
  rect(ctx, "rgba(0,0,0,0.2)", x - 10, y - 2, 20, 3);
  rect(ctx, WOOD, x - 9, y - 7, 8, 7);
  rect(ctx, WOOD_DARK, x - 9, y - 7, 8, 1);
  rect(ctx, WOOD_DARK, x - 9, y - 4, 8, 1);
  // Broken boards
  rect(ctx, WOOD_LIGHT, x + 1, y - 2, 7, 2);
  rect(ctx, WOOD, x + 3, y - 5, 2, 4);
  rect(ctx, WOOD_DARK, x + 6, y - 6, 4, 2);
  rect(ctx, "#7cbf5b", x - 1, y, 2, 1);
  rect(ctx, "#d6334a", x + 9, y - 1, 2, 2);
}

/** Two poles with a line of little flags between them. */
export function bunting(ctx, x, y, width, t) {
  const left = x - width / 2;
  rect(ctx, WOOD_DARK, left, y - 26, 2, 26);
  rect(ctx, WOOD_DARK, left + width - 2, y - 26, 2, 26);
  const colors = ["#d6455d", "#f2c14e", "#3f7fc4", "#4c9a52", "#f4ede0"];
  const flags = Math.floor(width / 5);
  for (let i = 0; i < flags; i++) {
    const sag = Math.sin((i / (flags - 1)) * Math.PI) * 5;
    const fx = left + 2 + i * 5;
    const fy = y - 25 + sag;
    const wave = Math.sin(t / 300 + i) > 0.6 ? 1 : 0;
    rect(ctx, "#5a4a3a", fx, fy, 5, 1);
    rect(ctx, colors[i % colors.length], fx + 1, fy + 1, 3, 2 + wave);
    rect(ctx, colors[i % colors.length], fx + 2, fy + 3 + wave, 1, 1);
  }
}

export function lantern(ctx, x, y, lit) {
  rect(ctx, WOOD_DARK, x, y - 18, 1, 18);
  rect(ctx, "#5a4a3a", x - 2, y - 19, 5, 1);
  rect(ctx, lit ? "#ff9b4a" : "#c46a3a", x - 2, y - 18, 5, 5);
  rect(ctx, lit ? "#ffe0a0" : "#d98a5a", x - 1, y - 17, 3, 3);
}

export function table(ctx, x, y) {
  rect(ctx, "rgba(0,0,0,0.2)", x - 11, y - 1, 22, 2);
  rect(ctx, WOOD_DARK, x - 9, y - 6, 2, 6);
  rect(ctx, WOOD_DARK, x + 7, y - 6, 2, 6);
  rect(ctx, "#f4ede0", x - 11, y - 9, 22, 4);
  rect(ctx, "#d6455d", x - 11, y - 6, 22, 1);
  const food = ["#c97a3a", "#e05a3a", "#f2c14e", "#7cbf5b"];
  food.forEach((color, i) => rect(ctx, color, x - 8 + i * 5, y - 11, 3, 2));
}

export function chimney(ctx, x, y) {
  rect(ctx, "#8a4a3a", x - 3, y - 9, 6, 9);
  rect(ctx, "#a85c48", x - 2, y - 8, 1, 7);
  rect(ctx, "#5a3028", x - 4, y - 10, 8, 2);
}

// ---------------------------------------------------------------------------
// Animals

export function chicken(
  ctx,
  x,
  y,
  { frame = 0, left = false, sitting = false },
) {
  const flip = (dx, width = 1) => (left ? -dx - width + 1 : dx);
  const body = (dx, dy, width, height, color) =>
    rect(ctx, color, x + flip(dx, width), y + dy, width, height);

  rect(ctx, "rgba(0,0,0,0.18)", x - 3, y - 1, 7, 2);
  if (!sitting) {
    body(-1, -2, 1, 2, "#e8a03c");
    body(1 + (frame % 2), -2, 1, 2, "#e8a03c");
  }
  const lift = sitting ? 2 : 0;
  body(-3, -6 + lift, 6, 4, "#f7f3ea");
  body(-4, -5 + lift, 1, 2, "#e2dccd");
  body(2, -8 + lift, 3, 3, "#f7f3ea");
  body(3, -9 + lift, 2, 1, "#e0453a");
  body(5, -7 + lift, 1, 1, "#e8a03c");
  body(3, -7 + lift, 1, 1, "#2b2b2b");
}

export function cat(ctx, x, y, { frame = 0, left = false, state = "walk" }) {
  const flip = (dx, width = 1) => (left ? -dx - width + 1 : dx);
  const body = (dx, dy, width, height, color) =>
    rect(ctx, color, x + flip(dx, width), y + dy, width, height);
  const fur = "#d98a3a";
  const dark = "#a8612a";

  rect(ctx, "rgba(0,0,0,0.18)", x - 4, y - 1, 9, 2);
  if (state === "sleep") {
    body(-4, -3, 8, 3, fur);
    body(-3, -4, 5, 1, fur);
    body(2, -4, 3, 3, fur);
    body(-5, -2, 2, 1, dark);
    return;
  }
  if (state === "sit") {
    body(-2, -6, 4, 6, fur);
    body(-1, -9, 4, 4, fur);
    body(-1, -10, 1, 1, dark);
    body(2, -10, 1, 1, dark);
    body(2, -7, 1, 1, "#2b2b2b");
    body(-4, -2, 2, 1, dark);
    return;
  }
  body(-4, -5, 8, 3, fur);
  body(3, -7, 3, 3, fur);
  body(3, -8, 1, 1, dark);
  body(5, -8, 1, 1, dark);
  body(5, -6, 1, 1, "#2b2b2b");
  body(-6, -7 + (frame % 2), 2, 1, fur);
  body(-5, -6, 1, 1, fur);
  body(-3 + (frame % 2), -2, 1, 2, dark);
  body(2 - (frame % 2), -2, 1, 2, dark);
}

export function groundBird(ctx, x, y, { frame = 0, left = false }) {
  const flip = (dx, width = 1) => (left ? -dx - width + 1 : dx);
  const body = (dx, dy, width, height, color) =>
    rect(ctx, color, x + flip(dx, width), y + dy, width, height);
  const peck = frame % 4 === 0 ? 1 : 0;
  body(-2, -3, 4, 2, "#7a5a44");
  body(1, -4 + peck, 2, 2, "#5f4636");
  body(3, -3 + peck, 1, 1, "#e8a03c");
  body(-3, -3, 1, 1, "#5f4636");
}

export function flyingBird(ctx, x, y, frame, color = "#3d3a40") {
  const up = frame % 2 === 0;
  rect(ctx, color, x, y, 1, 1);
  rect(ctx, color, x - 1, y - (up ? 1 : 0), 1, 1);
  rect(ctx, color, x + 1, y - (up ? 1 : 0), 1, 1);
  rect(ctx, color, x - 2, y - (up ? 2 : -1), 1, 1);
  rect(ctx, color, x + 2, y - (up ? 2 : -1), 1, 1);
}

export function butterfly(ctx, x, y, frame, color) {
  const open = frame % 2 === 0;
  rect(ctx, "#3d3a40", x, y, 1, 2);
  if (open) {
    rect(ctx, color, x - 2, y - 1, 2, 2);
    rect(ctx, color, x + 1, y - 1, 2, 2);
  } else {
    rect(ctx, color, x - 1, y - 1, 1, 2);
    rect(ctx, color, x + 1, y - 1, 1, 2);
  }
}

/**
 * A house burned by the bandits: charred roof, broken windows and, while it
 * is rebuilt (`progress` 0..100), scaffolding and new planks.
 */
export function burnedHouse(ctx, area, progress, t) {
  const { x, y, width, height } = area;
  const repaired = progress / 100;

  // Soot over the roof and the walls (fewer stains as it is repaired)
  for (let i = 0; i < 46; i++) {
    const sx = x + 4 + ((i * 37) % (width - 8));
    const sy = y + 8 + ((i * 53) % (height - 20));
    const size = 3 + (i % 4);
    if ((i % 10) / 10 < repaired) continue;
    rect(
      ctx,
      `rgba(30, 20, 22, ${0.55 + (i % 3) * 0.12})`,
      sx,
      sy,
      size,
      size - 1,
    );
  }

  // Holes in the roof with a glow of embers at the start
  const embers = Math.max(0, 1 - repaired * 3);
  for (const [dx, dy] of [
    [12, 18],
    [30, 26],
    [20, 34],
  ]) {
    rect(ctx, "#1a1214", x + dx, y + dy, 5, 4);
    if (embers > 0 && Math.sin(t / 200 + dx) > 0) {
      rect(ctx, `rgba(255, 120, 40, ${embers})`, x + dx + 1, y + dy + 1, 2, 2);
    }
  }

  // Scaffolding while it is rebuilt
  if (progress > 0) {
    rect(ctx, WOOD_DARK, x - 2, y + 30, 2, height - 30);
    rect(ctx, WOOD_DARK, x + width, y + 30, 2, height - 30);
    for (let level = 0; level < 3; level++) {
      rect(ctx, WOOD, x - 3, y + 34 + level * 14, width + 6, 2);
    }
    // New planks on the roof
    const planks = Math.round((width / 6) * repaired);
    for (let i = 0; i < planks; i++) {
      rect(ctx, WOOD_LIGHT, x + 4 + i * 6, y + 40, 5, 2);
    }
  }
}

/** A tent of the bandits' camp. */
export function tent(ctx, x, y) {
  rect(ctx, "rgba(0,0,0,0.25)", x - 14, y - 2, 28, 3);
  for (let row = 0; row < 16; row++) {
    const half = Math.round(row * 0.85) + 1;
    rect(
      ctx,
      row % 3 === 0 ? "#6b5a3e" : "#857049",
      x - half,
      y - 17 + row,
      half * 2,
      1,
    );
  }
  rect(ctx, "#2a2018", x - 3, y - 9, 6, 8);
  rect(ctx, WOOD_DARK, x - 1, y - 20, 2, 4);
  rect(ctx, "#8a2b2b", x + 1, y - 20, 4, 2);
}

/** What is left of a felled tree. */
export function stump(ctx, x, y) {
  rect(ctx, "rgba(20,50,20,0.25)", x - 8, y - 2, 16, 3);
  rect(ctx, "#2b1d1a", x - 6, y - 9, 12, 8);
  rect(ctx, "#7a4a2c", x - 5, y - 8, 10, 7);
  rect(ctx, "#9a6240", x - 5, y - 8, 3, 7);
  rect(ctx, "#d9b07a", x - 5, y - 9, 10, 2);
  rect(ctx, "#b98a5a", x - 2, y - 9, 4, 1);
  rect(ctx, WOOD_DARK, x - 8, y - 3, 3, 2);
  rect(ctx, WOOD_DARK, x + 5, y - 3, 3, 2);
  // Chips of wood around it
  rect(ctx, "#d9b07a", x - 10, y - 1, 2, 1);
  rect(ctx, "#d9b07a", x + 8, y, 2, 1);
}

/** A rock with veins of ore, to mine. */
export function oreRock(ctx, x, y) {
  rect(ctx, "rgba(0,0,0,0.3)", x - 8, y - 2, 16, 3);
  rect(ctx, "#2b1d1a", x - 7, y - 13, 14, 12);
  rect(ctx, "#2b1d1a", x - 5, y - 15, 10, 2);
  rect(ctx, STONE_DARK, x - 6, y - 12, 12, 10);
  rect(ctx, "#7d8188", x - 4, y - 14, 8, 6);
  rect(ctx, STONE, x - 4, y - 14, 5, 2);
  rect(ctx, "#c3c7cc", x - 3, y - 14, 2, 1);
  // Veins of iron and coal
  for (const [dx, dy, color] of [
    [-4, -9, "#c96f3a"],
    [2, -11, "#e08a4a"],
    [0, -6, "#c96f3a"],
    [-2, -12, "#1f1c22"],
    [3, -5, "#1f1c22"],
  ]) {
    rect(ctx, color, x + dx, y + dy, 2, 1);
  }
}

/** Broken stones where a rock was mined. */
export function rubble(ctx, x, y) {
  rect(ctx, "rgba(0,0,0,0.2)", x - 7, y - 2, 14, 2);
  for (const [dx, dy, w, h] of [
    [-6, -4, 4, 3],
    [-1, -5, 5, 4],
    [4, -3, 3, 2],
  ]) {
    rect(ctx, "#2b1d1a", x + dx - 1, y + dy - 1, w + 2, h + 2);
    rect(ctx, STONE_DARK, x + dx, y + dy, w, h);
    rect(ctx, STONE, x + dx, y + dy, w - 1, 1);
  }
}

/** A cluster of glowing crystals growing from the rock. */
export function crystal(ctx, x, y, t, taken) {
  rect(ctx, "rgba(0,0,0,0.3)", x - 7, y - 2, 14, 3);
  rect(ctx, "#2b1d1a", x - 6, y - 5, 12, 4);
  rect(ctx, STONE_DARK, x - 5, y - 4, 10, 3);
  if (taken) {
    rect(ctx, "#6c5a8a", x - 2, y - 6, 2, 2);
    rect(ctx, "#6c5a8a", x + 2, y - 5, 1, 1);
    return;
  }
  const glow = Math.sin(t / 400) > 0.5;
  for (const [dx, height, width] of [
    [-4, 8, 3],
    [-1, 13, 4],
    [3, 9, 3],
  ]) {
    rect(ctx, "#2b1d1a", x + dx - 1, y - 4 - height, width + 2, height + 1);
    rect(ctx, "#8a5ab8", x + dx, y - 4 - height + 1, width, height);
    rect(ctx, "#c9a6ff", x + dx, y - 4 - height + 1, 1, height - 1);
    rect(ctx, glow ? "#ffffff" : "#e6d6ff", x + dx, y - 4 - height + 1, 1, 1);
  }
}

/** A tree knocked down by a storm, lying across the road (`x` = middle). */
export function fallenTree(ctx, x, y) {
  rect(ctx, "rgba(0,0,0,0.25)", x - 26, y - 1, 52, 3);
  // Roots torn out of the ground, on the left
  rect(ctx, "#2b1d1a", x - 30, y - 14, 7, 14);
  rect(ctx, "#6e4430", x - 29, y - 13, 5, 12);
  for (const [dx, dy] of [
    [-33, -12],
    [-34, -6],
    [-32, -2],
  ]) {
    rect(ctx, "#5a3420", x + dx, y + dy, 4, 1);
  }
  rect(ctx, "#7a5a3a", x - 31, y - 5, 3, 4); // Earth on the roots
  // Trunk
  rect(ctx, "#2b1d1a", x - 24, y - 10, 40, 9);
  rect(ctx, "#7a4a2c", x - 23, y - 9, 38, 7);
  rect(ctx, "#9a6240", x - 23, y - 9, 38, 2);
  rect(ctx, "#5a3420", x - 18, y - 5, 6, 1);
  rect(ctx, "#5a3420", x - 4, y - 4, 8, 1);
  // Crown on the right (round blobs of leaves), with broken branches
  const blob = (cx, cy, radius, color) => {
    for (let py = -radius; py <= radius; py++) {
      const span = Math.round(Math.sqrt(radius * radius - py * py) * 1.2);
      rect(ctx, color, x + cx - span, y + cy + py, span * 2, 1);
    }
  };
  for (const [cx, cy, radius] of [
    [22, -10, 9],
    [30, -9, 7],
    [16, -6, 6],
  ]) {
    blob(cx, cy, radius + 1, "#2b1d1a");
  }
  blob(22, -10, 9, "#3f7f5a");
  blob(30, -9, 7, "#498f7b");
  blob(16, -6, 6, "#3f7f5a");
  blob(21, -12, 6, "#49a867");
  blob(29, -11, 4, "#4faf7b");
  rect(ctx, "#bdef6f", x + 19, y - 15, 2, 1);
  rect(ctx, "#bdef6f", x + 28, y - 13, 2, 1);
  rect(ctx, "#bdef6f", x + 23, y - 9, 1, 1);
  rect(ctx, WOOD_DARK, x + 4, y - 15, 2, 6);
  rect(ctx, WOOD_DARK, x + 6, y - 17, 4, 2);
  // Leaves scattered on the road
  for (const [dx, dy] of [
    [-10, 1],
    [6, 2],
    [-2, -12],
    [32, 0],
  ]) {
    rect(ctx, "#49a867", x + dx, y + dy, 2, 1);
  }
}

/** A tree burned by the fire of the forest. */
export function burntStump(ctx, x, y) {
  rect(ctx, "rgba(0,0,0,0.3)", x - 9, y - 2, 18, 3);
  rect(ctx, "#1a1414", x - 5, y - 20, 10, 19);
  rect(ctx, "#2e2422", x - 4, y - 19, 8, 18);
  rect(ctx, "#4a3a34", x - 4, y - 19, 2, 18);
  rect(ctx, "#1a1414", x - 9, y - 18, 5, 2);
  rect(ctx, "#1a1414", x + 4, y - 14, 6, 2);
  rect(ctx, "#ff7a3a", x - 1, y - 9, 1, 1); // Embers
  rect(ctx, "#ffb43c", x + 2, y - 5, 1, 1);
}

/** Flames (`t` = time in ms), bottom centered at (x, y). */
export function flames(ctx, x, y, t, size = 1) {
  const frame = Math.floor(t / 110);
  for (let i = 0; i < 5; i++) {
    const height = Math.round((6 + ((frame + i * 3) % 5) * 2) * size);
    const dx = Math.round((i - 2) * 3 * size);
    rect(ctx, "#c4351e", x + dx - 1, y - height, 3, height);
    rect(ctx, "#ff7a2a", x + dx - 1, y - height + 2, 3, height - 3);
    rect(ctx, "#ffd36a", x + dx, y - Math.round(height / 2), 1, 3);
  }
}

/** Something on the floor of a messy room (`kind` 0..3). */
export function clutter(ctx, x, y, kind) {
  if (kind === 0) {
    // Clothes thrown on the floor
    rect(ctx, "#2b1d1a", x - 5, y - 4, 10, 4);
    rect(ctx, "#8a5ab8", x - 4, y - 3, 8, 2);
    rect(ctx, "#b48ad6", x - 4, y - 3, 3, 1);
  } else if (kind === 1) {
    // Papers
    rect(ctx, "#efe3cf", x - 4, y - 3, 5, 3);
    rect(ctx, "#d9c9a8", x, y - 2, 5, 3);
    rect(ctx, "#8a7a64", x - 3, y - 2, 3, 1);
  } else if (kind === 2) {
    // Dirty plate and a cup on its side
    rect(ctx, "#2b1d1a", x - 4, y - 2, 8, 2);
    rect(ctx, "#e8e0c8", x - 3, y - 2, 6, 1);
    rect(ctx, "#8a6a3a", x - 1, y - 2, 2, 1);
    rect(ctx, "#c97a3a", x + 4, y - 3, 3, 2);
  } else {
    // Dust and crumbs
    rect(ctx, "rgba(90, 70, 50, 0.45)", x - 5, y - 2, 10, 2);
    rect(ctx, "#a8865e", x - 2, y - 3, 1, 1);
    rect(ctx, "#a8865e", x + 2, y - 1, 1, 1);
  }
}

/** A small shelf on the wall (`x` = left). */
export function wallShelf(ctx, x, y, width) {
  rect(ctx, "rgba(0,0,0,0.2)", x + 1, y + 2, width, 2);
  rect(ctx, "#2b1d1a", x - 1, y - 1, width + 2, 4);
  rect(ctx, WOOD, x, y, width, 2);
  rect(ctx, WOOD_LIGHT, x, y, width, 1);
  rect(ctx, WOOD_DARK, x + 2, y + 2, 1, 3);
  rect(ctx, WOOD_DARK, x + width - 3, y + 2, 1, 3);
}

/** A gift of the player on the shelf, by what it is (bottom center). */
export function giftIcon(ctx, x, y, item = "") {
  const name = item.toLowerCase();
  if (/flor/.test(name)) {
    rect(ctx, "#a8573e", x - 2, y - 4, 4, 4);
    rect(ctx, "#3f8f4a", x - 1, y - 7, 1, 3);
    rect(ctx, "#ff8fb8", x - 2, y - 9, 2, 2);
    rect(ctx, "#ffd84a", x + 1, y - 8, 2, 2);
  } else if (/p[aã]o|bolo|torta/.test(name)) {
    rect(ctx, "#8a5a2a", x - 4, y - 3, 8, 3);
    rect(ctx, "#d9a05a", x - 3, y - 4, 6, 2);
  } else if (/cristal|joia|anel|colar|concha/.test(name)) {
    rect(ctx, "#8a5ab8", x - 1, y - 6, 3, 6);
    rect(ctx, "#c9a6ff", x - 1, y - 6, 1, 4);
  } else if (/peixe/.test(name)) {
    rect(ctx, "#6c8fa8", x - 4, y - 3, 7, 3);
    rect(ctx, "#6c8fa8", x + 3, y - 4, 2, 5);
  } else if (/livro|mapa|carta|bilhete/.test(name)) {
    rect(ctx, "#2b1d1a", x - 3, y - 7, 6, 7);
    rect(ctx, "#8a2b2b", x - 2, y - 6, 4, 6);
    rect(ctx, "#e2b73c", x - 2, y - 5, 4, 1);
  } else if (/mel|po[cç][aã]o|vinho|garrafa|cerveja|leite/.test(name)) {
    rect(ctx, "#2b1d1a", x - 2, y - 8, 4, 8);
    rect(ctx, /mel/.test(name) ? "#e2a93c" : "#4f9a6a", x - 1, y - 6, 2, 5);
    rect(ctx, WOOD_DARK, x - 1, y - 9, 2, 1);
  } else {
    // Wrapped with a ribbon
    rect(ctx, "#2b1d1a", x - 3, y - 6, 6, 6);
    rect(ctx, "#4f9ac8", x - 2, y - 5, 4, 4);
    rect(ctx, "#ffd84a", x - 2, y - 3, 4, 1);
    rect(ctx, "#ffd84a", x, y - 5, 1, 4);
  }
}

/** A parcel of an order, with its tag. */
export function parcel(ctx, x, y, seed = 0) {
  const colors = ["#b98a5a", "#a8714a", "#c9a46a"];
  rect(ctx, "rgba(0,0,0,0.2)", x - 5, y - 1, 11, 2);
  rect(ctx, "#2b1d1a", x - 5, y - 8, 10, 8);
  rect(ctx, colors[seed % 3], x - 4, y - 7, 8, 6);
  rect(ctx, "#6e4430", x - 4, y - 4, 8, 1);
  rect(ctx, "#efe3cf", x + 1, y - 7, 3, 2); // Tag with the name
}

/** A board on the wall with the notes of the orders. */
export function noteBoard(ctx, x, y, notes) {
  rect(ctx, "#2b1d1a", x - 1, y - 1, 20, 14);
  rect(ctx, "#8a6a4a", x, y, 18, 12);
  for (let i = 0; i < notes; i++) {
    const nx = x + 2 + (i % 3) * 5;
    const ny = y + 2 + Math.floor(i / 3) * 5;
    rect(ctx, "#efe3cf", nx, ny, 4, 4);
    rect(ctx, "#c4475d", nx + 1, ny, 1, 1);
  }
}
