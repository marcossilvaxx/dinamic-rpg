// The generated island of the game: its layout (pure), the data the rest of
// the game reads (places, props, collisions) and its drawing.

import { applyDecor } from "../../levels/decor.js";
import { applyPlaces } from "../../levels/places.js";
import { applyRegions, applyVillageCollisions } from "../../levels/world.js";
import { generateIsland } from "./layout.js";
import { generateRegions } from "./regions.js";

export { generateIsland } from "./layout.js";
export { paintIsland } from "./paint.js";
export { generateRegions } from "./regions.js";
export { paintRegion } from "./paintRegions.js";

/** Fills places, props and collisions of the village from a layout. */
export function applyIsland(layout) {
  applyPlaces(layout.places);
  applyDecor(layout);
  applyVillageCollisions(layout.collisions);
  return layout;
}

/**
 * Generates the island of `seed` and the regions around it (reached by
 * boat) and fills the data of the game with them.
 */
export function createIsland(seed) {
  const layout = applyIsland(generateIsland(seed));
  applyRegions(generateRegions(seed));
  return layout;
}
