// Layout of the world: the village map and, to the right of it (out of
// sight), the interiors of the buildings and the regions reached by boat. Everything shares one collision
// grid of 12 px tiles, so walking, pathfinding and fights work the same
// inside. No browser imports on purpose: shared with the node tests.

import { MAPS } from "./maps.js";

export const TILE = 12;
export const VILLAGE = MAPS.village;
export const VILLAGE_WIDTH = VILLAGE.width * VILLAGE.tileWidth;
export const VILLAGE_HEIGHT = VILLAGE.height * VILLAGE.tileHeight;

// Interiors: `placeId` is the place of the village with the door
export const INTERIORS = [
  {
    id: "tavern",
    placeId: "tavern",
    name: "Taverna",
    origin: { x: 900, y: 0 },
  },
  {
    id: "west_house",
    placeId: "west_house",
    name: "Casa do oeste",
    origin: { x: 1200, y: 0 },
  },
  {
    id: "east_house",
    placeId: "east_house",
    name: "Armazém",
    origin: { x: 1440, y: 0 },
  },
].map((interior) => {
  const map = MAPS[interior.id];
  return {
    ...interior,
    map,
    width: map.width * map.tileWidth,
    height: map.height * map.tileHeight,
  };
});

// Places beyond the island, reached by boat (see backend game/Regions.js)
export const REGIONS = [
  { id: "forest", name: "Floresta Sombria", origin: { x: 1704, y: 0 } },
  {
    id: "mine",
    name: "Mina do Penhasco",
    origin: { x: 2232, y: 0 },
    dark: true,
  },
  { id: "town", name: "Vila de Pedravento", origin: { x: 2640, y: 0 } },
].map((region) => {
  const map = MAPS[region.id];
  return {
    ...region,
    map,
    width: map.width * map.tileWidth,
    height: map.height * map.tileHeight,
  };
});

export const REGIONS_BY_ID = Object.fromEntries(
  REGIONS.map((region) => [region.id, region]),
);

// Interiors of the houses the village plan builds on the empty lots (see
// decor.js LOTS): homes look like the west house, workplaces like the store
// (far enough from each other: a small room is centered on the screen and
// what is around it shows)
export const LOT_INTERIOR_ORIGINS = {
  lot_north: { x: 3168, y: 0 },
  lot_meadow: { x: 3468, y: 0 },
  lot_garden: { x: 3768, y: 0 },
  lot_east: { x: 4068, y: 0 },
};
const LOT_TEMPLATES = { home: "west_house", work: "east_house" };
const LOT_MAX_WIDTH = 224;

// Interiors and regions: maps placed out of the village (lots are added
// when the village plan arrives)
const AREAS = [...INTERIORS, ...REGIONS];

export const INTERIORS_BY_ID = Object.fromEntries(
  INTERIORS.map((interior) => [interior.id, interior]),
);
export const INTERIORS_BY_PLACE = Object.fromEntries(
  INTERIORS.map((interior) => [interior.placeId, interior]),
);

export const WORLD_COLUMNS = Math.ceil(
  Math.max(
    ...AREAS.map(({ origin, width }) => origin.x + width),
    ...Object.values(LOT_INTERIOR_ORIGINS).map(({ x }) => x + LOT_MAX_WIDTH),
  ) / TILE,
);
export const WORLD_ROWS = Math.max(
  VILLAGE.height,
  Math.ceil(
    Math.max(...AREAS.map(({ origin, height }) => origin.y + height)) / TILE,
  ),
);

/** The interior that contains the point, or null (the village). */
export const interiorAt = (x, y) =>
  INTERIORS.find(
    ({ origin, width, height }) =>
      x >= origin.x &&
      y >= origin.y &&
      x < origin.x + width &&
      y < origin.y + height,
  ) ?? null;

/** A point of an interior or region (its "Points" layer), in world pixels. */
export const interiorPoint = (interior, name) => {
  const point = interior.map.points[name];
  return point
    ? {
        x: interior.origin.x + point.x,
        y: interior.origin.y + point.y,
        width: point.width,
        height: point.height,
        kind: point.kind,
      }
    : null;
};

/**
 * Rows of the world collision grid (1 = blocked). Interiors use 16 px tiles:
 * a 12 px cell is blocked when its center is on a blocked tile. Everything
 * out of the village and of the interiors is blocked.
 */
export function worldCollisionRows() {
  const rows = Array.from({ length: WORLD_ROWS }, () =>
    Array(WORLD_COLUMNS).fill(1),
  );

  VILLAGE.collisions.forEach((value, i) => {
    rows[Math.floor(i / VILLAGE.width)][i % VILLAGE.width] = value ? 1 : 0;
  });

  AREAS.forEach((area) => rasterizeArea(rows, area));

  return rows;
}

/**
 * Writes the collisions of an interior or region (16 px tiles) on the rows
 * of the world grid (12 px): a cell is blocked when its center is.
 */
export function rasterizeArea(rows, { origin, width, height, map }) {
  for (
    let row = Math.floor(origin.y / TILE);
    row * TILE < origin.y + height;
    row++
  ) {
    for (
      let column = Math.floor(origin.x / TILE);
      column * TILE < origin.x + width;
      column++
    ) {
      const cx = column * TILE + TILE / 2 - origin.x;
      const cy = row * TILE + TILE / 2 - origin.y;
      if (cx < 0 || cy < 0 || cx >= width || cy >= height) continue;
      const tile =
        Math.floor(cy / map.tileHeight) * map.width +
        Math.floor(cx / map.tileWidth);
      rows[row][column] = map.collisions[tile] ? 1 : 0;
    }
  }
}

/** Adds the interior of a house built on a lot ({ id, name, kind }). */
export function addLotInterior({ id, name, kind }) {
  const map = MAPS[LOT_TEMPLATES[kind] ?? LOT_TEMPLATES.home];
  const interior = {
    id,
    placeId: id,
    name,
    origin: LOT_INTERIOR_ORIGINS[id],
    map,
    width: map.width * map.tileWidth,
    height: map.height * map.tileHeight,
  };

  INTERIORS.push(interior);
  INTERIORS_BY_ID[id] = interior;
  INTERIORS_BY_PLACE[id] = interior;
  return interior;
}
