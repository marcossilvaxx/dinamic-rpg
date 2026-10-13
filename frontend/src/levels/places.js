// Points of interest of the village map. `x`/`y` are free positions (for a
// 16x12 hitbox) reachable from the spawn points; see test/places.test.js.
// `name` is shown to the player, `description` goes to the LLM prompts.
// No imports on purpose: shared with the node tests.

export const PLACE_RADIUS = 30; // NPCs walk around this distance of a place

export const PLACES = [
  {
    id: "tavern",
    name: "Taverna",
    description:
      "The tavern, the building in the north of the village, by the main road. People eat, drink and talk there.",
    x: 508,
    y: 162,
    building: true,
  },
  {
    id: "west_house",
    name: "Casa do oeste",
    description:
      "A cottage in the northwest of the village, near the cliffs, at the end of the west road. A villager lives there.",
    x: 148,
    y: 140,
    building: true,
  },
  {
    id: "east_house",
    name: "Armazém",
    description:
      "The general store, the house in the east of the village, where people buy tools, food and supplies.",
    x: 688,
    y: 272,
    building: true,
  },
  {
    id: "garden",
    name: "Jardim da vila",
    description:
      "Fenced garden in the center of the village, with two old oak trees and an old stone circle on the ground. The meeting point of the village.",
    x: 424,
    y: 225,
  },
  {
    id: "dock",
    name: "Píer",
    description:
      "Wooden pier in the southwest of the island, with a small rowing boat. People fish there and boats arrive there.",
    x: 111,
    y: 348,
  },
  {
    id: "south_road",
    name: "Estrada principal",
    description:
      "The main road in the south of the village, connecting the pier to the east side.",
    x: 424,
    y: 355,
  },
  {
    id: "north_meadow",
    name: "Campo do norte",
    description:
      "Meadow with wild flowers in the north of the village, used as pasture.",
    x: 330,
    y: 90,
  },
  {
    id: "east_meadow",
    name: "Campo do leste",
    description:
      "Open field in the northeast of the village, near the coast and the sea.",
    x: 740,
    y: 160,
  },
];

export const PLACES_BY_ID = Object.fromEntries(
  PLACES.map((place) => [place.id, place]),
);

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
