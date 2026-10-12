// Activities of the player (fishing, gathering): pure rules, tested with
// node. No browser imports on purpose.

import { PLACE_RADIUS, PLACES_BY_ID } from "../levels/places.js";

// Activities of the player in places of the map (mirrors backend
// game/Activities.js)
export const ACTIVITIES = {
  fishing: { places: ["dock"], label: "Pescar", verb: "Pescando..." },
  gathering: {
    places: ["north_meadow", "east_meadow", "garden"],
    label: "Colher",
    verb: "Procurando...",
  },
};

export const NEEDLE_SPEED = 0.0009; // Bar widths per ms
export const ZONE_WIDTH = 0.2;
const PERFECT_WIDTH = 0.05;

/** Result of stopping the needle at `position` (0..1). */
export function timingResult(position, zoneStart) {
  const zoneCenter = zoneStart + ZONE_WIDTH / 2;

  if (Math.abs(position - zoneCenter) <= PERFECT_WIDTH / 2) return "perfect";
  if (position >= zoneStart && position <= zoneStart + ZONE_WIDTH) return "hit";
  return "miss";
}

/** The activity available at `position` (of the player), if any. */
export function activityAt(position) {
  return (
    Object.entries(ACTIVITIES).find(([, { places }]) =>
      places.some((id) => {
        const place = PLACES_BY_ID[id];
        return (
          place &&
          Math.hypot(place.x - position.x, place.y - position.y) <=
            PLACE_RADIUS + 10
        );
      }),
    )?.[0] ?? null
  );
}
