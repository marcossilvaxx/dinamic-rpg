// Reads the pixels of the village map (drawn from the Tiled map) to
// know where there is grass, sand, water, roofs and trees, and pre-renders
// the layers drawn over them: snow, autumn colors, flowers, mud, the foam of
// the coast... They are drawn every frame with some opacity (season, snow
// on the ground...), so nothing is computed per frame.

// Colors of the tileset used by the map
const GRASS = ["116,200,87", "86,183,66"];
const SAND = ["248,201,132", "248,212,159"];
const WATER = [
  "103,230,210",
  "145,237,223",
  "88,203,185",
  "84,173,159",
  "191,252,243",
];
const ROOF = ["215,82,120", "194,84,120", "166,73,112"];
const LEAVES = ["79,175,123", "73,168,103", "73,143,123", "189,239,111"];

export const OTHER = 0;
export const GRASS_PIXEL = 1;
export const SAND_PIXEL = 2;
export const WATER_PIXEL = 3;
export const ROOF_PIXEL = 4;
export const LEAF_PIXEL = 5;

const CLASSES = new Map([
  ...GRASS.map((color) => [color, GRASS_PIXEL]),
  ...SAND.map((color) => [color, SAND_PIXEL]),
  ...WATER.map((color) => [color, WATER_PIXEL]),
  ...ROOF.map((color) => [color, ROOF_PIXEL]),
  ...LEAVES.map((color) => [color, LEAF_PIXEL]),
]);

// Deterministic random numbers, so the village looks the same every time
export const seededRandom = (seed) => () => {
  seed = (seed * 1664525 + 1013904223) % 4294967296;
  return seed / 4294967296;
};

/** Smooth noise (0..1) for patches: a few overlapping waves. */
const patchNoise = (x, y, scale = 1) =>
  (Math.sin(x * 0.045 * scale + Math.sin(y * 0.03)) +
    Math.sin(y * 0.05 * scale + x * 0.012) +
    Math.sin((x + y) * 0.021 * scale) +
    3) /
  6;

const readPixels = (image, width, height) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  ctx.drawImage(image, 0, 0);
  return ctx.getImageData(0, 0, width, height).data;
};

const classify = (data) => {
  const classes = new Uint8Array(data.length / 4);

  for (let i = 0; i < classes.length; i++) {
    if (data[i * 4 + 3] === 0) continue;
    const key = `${data[i * 4]},${data[i * 4 + 1]},${data[i * 4 + 2]}`;
    classes[i] = CLASSES.get(key) ?? OTHER;
  }

  return classes;
};

const markRoofs = (classes, mask) => {
  for (let i = 0; i < classes.length; i++) {
    if (mask[i * 4 + 3] > 0) classes[i] = ROOF_PIXEL;
  }
};

/** A canvas painted pixel by pixel with `paint(x, y, index)` -> [r,g,b,a]. */
const paintLayer = (width, height, paint) => {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const image = ctx.createImageData(width, height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const color = paint(x, y, y * width + x);
      if (!color) continue;
      const i = (y * width + x) * 4;
      image.data[i] = color[0];
      image.data[i + 1] = color[1];
      image.data[i + 2] = color[2];
      image.data[i + 3] = color[3] ?? 255;
    }
  }

  ctx.putImageData(image, 0, 0);
  return canvas;
};

/** Distance (in pixels, up to `max`) of each water pixel to the land. */
const distanceToLand = (classes, width, height, max) => {
  const distance = new Uint8Array(classes.length).fill(max + 1);
  let frontier = [];

  for (let i = 0; i < classes.length; i++) {
    if (classes[i] !== WATER_PIXEL) {
      distance[i] = 0;
      frontier.push(i);
    }
  }

  for (let step = 1; step <= max && frontier.length; step++) {
    const next = [];
    for (const i of frontier) {
      const x = i % width;
      const neighbors = [
        x > 0 ? i - 1 : -1,
        x < width - 1 ? i + 1 : -1,
        i - width,
        i + width,
      ];
      for (const n of neighbors) {
        if (n >= 0 && n < classes.length && distance[n] > step) {
          distance[n] = step;
          next.push(n);
        }
      }
    }
    frontier = next;
  }

  return distance;
};

/**
 * @param {HTMLImageElement} mapImage
 * @param {HTMLImageElement} foregroundImage
 */
export function analyzeTerrain(
  mapImage,
  foregroundImage,
  width,
  height,
  roofs = null,
) {
  const classes = classify(readPixels(mapImage, width, height));
  const foreground = readPixels(foregroundImage, width, height);
  const foregroundClasses = classify(foreground);
  // Roofs drawn with code have their own colors: a mask says where they are
  if (roofs) {
    markRoofs(classes, readPixels(roofs.background, width, height));
    markRoofs(foregroundClasses, readPixels(roofs.foreground, width, height));
  }
  const random = seededRandom(7);
  const at = (x, y) =>
    x < 0 || y < 0 || x >= width || y >= height
      ? OTHER
      : classes[y * width + x];
  const isLand = (c) => c === GRASS_PIXEL || c === SAND_PIXEL;

  // Snow: white over the ground and the roofs, on top of the tree crowns
  const snowColor = () => {
    const shade = random() < 0.08 ? 228 : 244 - Math.round(random() * 6);
    return [shade - 6, shade - 2, 255];
  };
  const snowGround = paintLayer(width, height, (x, y, i) => {
    const c = classes[i];
    if (isLand(c)) return [...snowColor(), c === SAND_PIXEL ? 225 : 255];
    if (c === ROOF_PIXEL) return [...snowColor(), 245];
    if (c === LEAF_PIXEL && (at(x, y - 1) !== LEAF_PIXEL || random() < 0.3)) {
      return [...snowColor(), 235];
    }
    return null;
  });
  const snowForeground = paintLayer(width, height, (x, y, i) => {
    if (foreground[i * 4 + 3] === 0) return null;
    const above = y > 0 ? foreground[(i - width) * 4 + 3] : 0;
    const c = foregroundClasses[i];
    if (c === ROOF_PIXEL || above === 0 || random() < 0.3) {
      return [...snowColor(), 235];
    }
    return null;
  });

  // Autumn: yellowed grass in patches, orange crowns and fallen leaves
  const leafColors = [
    [226, 128, 52],
    [204, 86, 44],
    [240, 186, 70],
    [176, 98, 50],
  ];
  const autumnGround = paintLayer(width, height, (x, y, i) => {
    const c = classes[i];
    if (c === LEAF_PIXEL) {
      const leaf = leafColors[(x * 7 + y * 13) % 3];
      return [...leaf, 200];
    }
    if (c !== GRASS_PIXEL) return null;
    if (random() < 0.03) return [...leafColors[Math.floor(random() * 4)], 255];
    // Warmer grass everywhere, yellowed in patches
    const patch = patchNoise(x, y);
    return [196, 168, 76, 70 + Math.round(Math.max(0, patch - 0.45) * 330)];
  });
  const autumnForeground = paintLayer(width, height, (x, y, i) => {
    if (foregroundClasses[i] !== LEAF_PIXEL) return null;
    return [...leafColors[(x * 7 + y * 13) % 3], 200];
  });

  // Spring: flowers over the grass
  const flowerColors = [
    [255, 160, 200],
    [255, 255, 255],
    [255, 226, 90],
    [150, 170, 255],
  ];
  const springCanvas = document.createElement("canvas");
  springCanvas.width = width;
  springCanvas.height = height;
  const springCtx = springCanvas.getContext("2d");
  for (let n = 0; n < 900; n++) {
    const x = Math.floor(random() * width);
    const y = Math.floor(random() * height);
    if (
      at(x, y) !== GRASS_PIXEL ||
      at(x - 1, y) !== GRASS_PIXEL ||
      at(x + 1, y + 1) !== GRASS_PIXEL
    ) {
      continue;
    }
    const [r, g, b] = flowerColors[Math.floor(random() * 4)];
    springCtx.fillStyle = `rgb(${r}, ${g}, ${b})`;
    springCtx.fillRect(x - 1, y, 3, 1);
    springCtx.fillRect(x, y - 1, 1, 3);
    springCtx.fillStyle = "rgb(255, 210, 60)";
    springCtx.fillRect(x, y, 1, 1);
  }

  // Summer: dry patches; winter without snow: frosty, pale grass
  const summerGround = paintLayer(width, height, (x, y, i) => {
    if (classes[i] !== GRASS_PIXEL) return null;
    const patch = patchNoise(x + 300, y + 120, 1.3);
    return patch > 0.6
      ? [214, 206, 110, Math.round((patch - 0.6) * 420)]
      : null;
  });
  const winterGround = paintLayer(width, height, (x, y, i) =>
    classes[i] === GRASS_PIXEL
      ? [168, 190, 160, 120 + Math.round(patchNoise(x, y) * 80)]
      : null,
  );

  // Rain: dark, muddy sand
  const mud = paintLayer(width, height, (x, y, i) =>
    classes[i] === SAND_PIXEL
      ? [150, 104, 70, 150 + Math.round(random() * 40)]
      : classes[i] === GRASS_PIXEL
        ? [40, 90, 40, 50]
        : null,
  );

  // Foam along the coast, in two bands that come and go like waves
  const distance = distanceToLand(classes, width, height, 4);
  const foamNear = paintLayer(width, height, (x, y, i) =>
    classes[i] === WATER_PIXEL && distance[i] === 1
      ? [235, 255, 252, 230]
      : null,
  );
  const foamFar = paintLayer(width, height, (x, y, i) =>
    classes[i] === WATER_PIXEL &&
    (distance[i] === 3 || (distance[i] === 4 && (x + y) % 3 === 0))
      ? [220, 252, 248, 170]
      : null,
  );

  // Water far from the coast, where the sun sparkles
  const sparkles = [];
  while (sparkles.length < 160) {
    const x = Math.floor(random() * width);
    const y = Math.floor(random() * height);
    if (classes[y * width + x] === WATER_PIXEL && distance[y * width + x] > 4) {
      sparkles.push({
        x,
        y,
        phase: random() * Math.PI * 2,
        speed: 0.6 + random() * 1.2,
        long: random() < 0.5,
      });
    }
  }

  // Spots of the roads where puddles form
  const puddles = [];
  for (let attempt = 0; attempt < 4000 && puddles.length < 26; attempt++) {
    const x = Math.floor(random() * width);
    const y = Math.floor(random() * height);
    const fits = [
      [-6, -3],
      [6, -3],
      [-6, 3],
      [6, 3],
      [0, 0],
    ].every(([dx, dy]) => at(x + dx, y + dy) === SAND_PIXEL);
    const isFar = puddles.every(
      (puddle) => Math.hypot(puddle.x - x, puddle.y - y) > 34,
    );
    if (fits && isFar) {
      puddles.push({ x, y, size: 3 + random() * 3, threshold: random() });
    }
  }

  return {
    width,
    height,
    classAt: at,
    isLand: (x, y) => isLand(at(Math.round(x), Math.round(y))),
    isSand: (x, y) => at(Math.round(x), Math.round(y)) === SAND_PIXEL,
    layers: {
      snowGround,
      snowForeground,
      autumnGround,
      autumnForeground,
      springGround: springCanvas,
      summerGround,
      winterGround,
      mud,
      foamNear,
      foamFar,
    },
    sparkles,
    puddles,
  };
}
