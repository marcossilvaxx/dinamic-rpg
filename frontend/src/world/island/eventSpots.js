// Where the events of the map happen on a generated island (see
// world/MapEvents.js). Pure: tested with node.

const TILE = 12;
const COLUMNS = 70;

/**
 * Where a tree can fall: the left edge of a road going up and down, so the
 * trunk lies across it.
 */
export function fallenTreeSpots(island) {
  const road = (c, r) => island.roads.has(r * COLUMNS + c);
  const spots = [];
  for (const index of [...island.roads].sort((a, b) => a - b)) {
    const c = index % COLUMNS;
    const r = Math.floor(index / COLUMNS);
    if (
      road(c + 1, r) &&
      !road(c - 1, r) &&
      !road(c + 2, r) &&
      road(c, r - 2) &&
      road(c, r + 2) &&
      !spots.some((spot) => Math.abs(spot.r - r) < 4 && spot.c === c)
    ) {
      spots.push({ c, r, x: (c + 1) * TILE, y: (r + 1) * TILE - 1 });
    }
  }
  return spots;
}
