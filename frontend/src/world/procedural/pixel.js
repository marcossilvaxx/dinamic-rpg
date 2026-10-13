// Helpers for pixel art drawn with code: seeded random numbers, colors and
// rectangles on whole pixels.

/** Deterministic random numbers (the same seed draws the same thing). */
export function seeded(seed) {
  let value = Math.abs(Math.floor(seed)) % 2147483647 || 1;
  const next = () => {
    value = (value * 16807) % 2147483647;
    return (value - 1) / 2147483646;
  };
  next.int = (min, max) => min + Math.floor(next() * (max - min + 1));
  next.pick = (items) => items[Math.floor(next() * items.length)];
  next.chance = (probability) => next() < probability;
  return next;
}

/** A seed from a text (the name of a building, for example). */
export const seedOf = (text) =>
  [...String(text)].reduce(
    (hash, char) => (hash * 31 + char.charCodeAt(0)) | 0,
    7,
  );

const hex = (value) => Math.max(0, Math.min(255, Math.round(value)));

/** Makes a "#rrggbb" color lighter (amount > 0) or darker (amount < 0). */
export function shade(color, amount) {
  const n = parseInt(color.slice(1), 16);
  const r = (n >> 16) & 255;
  const g = (n >> 8) & 255;
  const b = n & 255;
  const mix = (channel) =>
    amount >= 0 ? channel + (255 - channel) * amount : channel * (1 + amount);
  return `rgb(${hex(mix(r))}, ${hex(mix(g))}, ${hex(mix(b))})`;
}

/** Rectangle on whole pixels. */
export const rect = (ctx, color, x, y, width = 1, height = 1) => {
  if (width <= 0 || height <= 0) return;
  ctx.fillStyle = color;
  ctx.fillRect(
    Math.round(x),
    Math.round(y),
    Math.round(width),
    Math.round(height),
  );
};

/** A dark outline around a rectangle (1 px). */
export const outline = (ctx, color, x, y, width, height) => {
  rect(ctx, color, x, y, width, 1);
  rect(ctx, color, x, y + height - 1, width, 1);
  rect(ctx, color, x, y, 1, height);
  rect(ctx, color, x + width - 1, y, 1, height);
};

export const OUTLINE = "#2b1d1a";
