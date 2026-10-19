// What is around the player, for the sound: the ground under their feet
// (footsteps) and the place (ambience). Read from the generated layouts of
// the island and the regions (see world/island).

const TILE = 12;
const SEA_DISTANCE = 6; // tiles
// The island layout has no size of its own (see world/island/layout.js)
const columnsOf = (layout) => layout.columns ?? 70;
const rowsOf = (layout) => layout.rows ?? 40;

/** The kind of ground of a layout at (x, y), in pixels of the layout. */
function layoutGround(layout, x, y) {
  const c = Math.floor(x / TILE);
  const r = Math.floor(y / TILE);
  const i = r * columnsOf(layout) + c;
  if (layout.pier?.tiles.some(([pc, pr]) => pc === c && pr === r)) {
    return "wood";
  }
  if (layout.id === "mine") return "cave";
  if (layout.roads?.has(i)) {
    return { dirt: "dirt", stone: "stone" }[layout.roadStyle] ?? "sand";
  }
  return "grass";
}

/** Whether the sea is close to (x, y), in pixels of the layout. */
function nearSea(layout, x, y) {
  if (!layout.land || layout.id === "mine") return false;
  const c = Math.floor(x / TILE);
  const r = Math.floor(y / TILE);
  for (let dr = -SEA_DISTANCE; dr <= SEA_DISTANCE; dr += 2) {
    for (let dc = -SEA_DISTANCE; dc <= SEA_DISTANCE; dc += 2) {
      const tc = c + dc;
      const tr = r + dr;
      if (tc < 0 || tr < 0 || tc >= columnsOf(layout) || tr >= rowsOf(layout)) {
        return true;
      }
      if (!layout.land[tr * columnsOf(layout) + tc]) return true;
    }
  }
  return false;
}

const INTERIOR_GROUND = { stone: "stone", tiles: "stone" };

/**
 * @param {{x: number, y: number}} feet In world pixels.
 * @param {object} world
 * @param {object} world.island Layout of the island.
 * @param {object | null} world.region Region where the player is (with its
 *   layout and origin), or null.
 * @param {object | null} world.interior Interior where the player is.
 * @param {number} world.snow 0..1, snow on the ground of the village.
 * @returns {{ground: string, place: string, nearSea: boolean}}
 */
export function surroundingsAt(feet, { island, region, interior, snow = 0 }) {
  if (interior) {
    return {
      ground: INTERIOR_GROUND[interior.map.floor] ?? "wood",
      place: "interior",
      nearSea: false,
    };
  }

  if (region?.layout) {
    const x = feet.x - region.origin.x;
    const y = feet.y - region.origin.y;
    return {
      ground: layoutGround(region.layout, x, y),
      place: region.id,
      nearSea: nearSea(region.layout, x, y),
    };
  }

  const ground = layoutGround(island, feet.x, feet.y);
  return {
    ground: snow > 0.5 && ground !== "wood" ? "snow" : ground,
    place: "village",
    nearSea: nearSea(island, feet.x, feet.y),
  };
}
