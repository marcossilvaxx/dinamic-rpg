// Points of interest of the village map. `x`/`y` are free positions (for a
// 16x12 hitbox) reachable from each other; see test/island.test.js.
// `name` is shown to the player, `description` goes to the LLM prompts.
// No imports on purpose: shared with the node tests.

export const PLACE_RADIUS = 30; // NPCs walk around this distance of a place

// Filled by the generated island (see world/island and applyPlaces): tavern,
// west_house, east_house, garden, dock, south_road, north_meadow,
// east_meadow, and the lots the village plan builds.
export const PLACES = [];

export const PLACES_BY_ID = {};

/** Replaces the places (from a generated island). */
export function applyPlaces(places) {
  PLACES.splice(0, PLACES.length, ...places);
  for (const id of Object.keys(PLACES_BY_ID)) delete PLACES_BY_ID[id];
  places.forEach((place) => (PLACES_BY_ID[place.id] = place));
}

/** The place closest to `position`, if it is at most `maxDistance` away. */
export function nearestPlace(position, maxDistance = Infinity) {
  let nearest = null;
  let nearestDistance = maxDistance;

  for (const place of PLACES) {
    const distance = Math.hypot(place.x - position.x, place.y - position.y);

    if (distance <= nearestDistance) {
      nearest = place;
      nearestDistance = distance;
    }
  }

  return nearest;
}
