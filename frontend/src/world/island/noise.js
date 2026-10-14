// Smooth noise for the shape of the island (value noise with octaves).

import { seeded } from "../procedural/pixel.js";

export function valueNoise(seed) {
  const random = seeded(seed);
  const size = 256;
  const values = Array.from({ length: size }, () => random());
  const perm = Array.from({ length: size }, (_, i) => i);
  for (let i = size - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [perm[i], perm[j]] = [perm[j], perm[i]];
  }
  const at = (x, y) => values[perm[(perm[x & 255] + y) & 255]];
  const smooth = (t) => t * t * (3 - 2 * t);

  const noise = (x, y) => {
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const tx = smooth(x - x0);
    const ty = smooth(y - y0);
    const top = at(x0, y0) * (1 - tx) + at(x0 + 1, y0) * tx;
    const bottom = at(x0, y0 + 1) * (1 - tx) + at(x0 + 1, y0 + 1) * tx;
    return top * (1 - ty) + bottom * ty;
  };

  /** 0..1, with `octaves` layers of detail. */
  return (x, y, octaves = 3) => {
    let total = 0;
    let amplitude = 1;
    let frequency = 1;
    let max = 0;
    for (let i = 0; i < octaves; i++) {
      total += noise(x * frequency, y * frequency) * amplitude;
      max += amplitude;
      amplitude /= 2;
      frequency *= 2;
    }
    return total / max;
  };
}
