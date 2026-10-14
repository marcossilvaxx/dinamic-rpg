// Layout of the world: the village (generated island) and, to the right of
// it (out of sight), the interiors of the buildings and the regions reached
// by boat. Everything shares one collision
// grid of 12 px tiles, so walking, pathfinding and fights work the same
// inside. No browser imports on purpose: shared with the node tests.

import { MAPS } from "./maps.js";

export const TILE = 12;
// The village is generated (world/island): its collisions are filled by
// applyIsland. The Tiled map (MAPS.village) stays only as a reference.
export const VILLAGE = {
  width: 70,
  height: 40,
  tileWidth: TILE,
  tileHeight: TILE,
  collisions: [...MAPS.village.collisions],
};
export const VILLAGE_WIDTH = VILLAGE.width * VILLAGE.tileWidth;
export const VILLAGE_HEIGHT = VILLAGE.height * VILLAGE.tileHeight;

/** Replaces the collisions of the village (from a generated island). */
export function applyVillageCollisions(collisions) {
  VILLAGE.collisions = [...collisions];
}

// Interiors: `placeId` is the place of the village with the door. Filled
// when the island is drawn (rooms drawn with code, see addInterior)
export const INTERIORS = [];
// Where the interiors of the buildings that always exist go
export const BUILDING_INTERIOR_ORIGINS = {
  tavern: { x: 900, y: 0 },
  west_house: { x: 1200, y: 0 },
  east_house: { x: 1440, y: 0 },
};

// Places beyond the island, reached by boat (see backend game/Regions.js).
// Their maps are generated with the island (world/island/regions.js) and
// filled by applyRegions; the size (12 px tiles) is fixed, so they fit
// between the interiors.
const blankMap = (columns, rows) => ({
  width: columns,
  height: rows,
  tileWidth: TILE,
  tileHeight: TILE,
  collisions: Array(columns * rows).fill(1),
  points: {},
});

export const REGIONS = [
  {
    id: "forest",
    name: "Floresta Sombria",
    origin: { x: 1704, y: 0 },
    columns: 42,
    rows: 26,
  },
  {
    id: "mine",
    name: "Mina do Penhasco",
    origin: { x: 2232, y: 0 },
    columns: 32,
    rows: 21,
    dark: true,
  },
  {
    id: "town",
    name: "Vila de Pedravento",
    origin: { x: 2640, y: 0 },
    columns: 37,
    rows: 24,
  },
].map((region) => ({
  ...region,
  map: blankMap(region.columns, region.rows),
  layout: null,
  width: region.columns * TILE,
  height: region.rows * TILE,
}));

/** Puts the generated regions ({ forest, mine, town }) in the world. */
export function applyRegions(layouts) {
  for (const region of REGIONS) {
    const layout = layouts[region.id];
    if (layout.columns !== region.columns || layout.rows !== region.rows) {
      throw new Error(`The ${region.id} has the wrong size`);
    }
    region.layout = layout;
    region.map = {
      width: layout.columns,
      height: layout.rows,
      tileWidth: layout.tileWidth,
      tileHeight: layout.tileHeight,
      collisions: layout.collisions,
      points: layout.points,
    };
  }
}

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
const LOT_MAX_WIDTH = 224;

// Interiors and regions: maps placed out of the village (interiors are
// added when the island is drawn and when the village plan arrives)
const AREAS = () => [...INTERIORS, ...REGIONS];

export const INTERIORS_BY_ID = {};
export const INTERIORS_BY_PLACE = {};

export const WORLD_COLUMNS = Math.ceil(
  Math.max(
    ...REGIONS.map(({ origin, width }) => origin.x + width),
    ...Object.values(LOT_INTERIOR_ORIGINS).map(({ x }) => x + LOT_MAX_WIDTH),
  ) / TILE,
);
export const WORLD_ROWS = Math.max(
  VILLAGE.height,
  Math.ceil(
    Math.max(...REGIONS.map(({ origin, height }) => origin.y + height)) / TILE,
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
 * Rows of the world collision grid (1 = blocked). Interiors use 16 px tiles,
 * regions 12 px:
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

  AREAS().forEach((area) => rasterizeArea(rows, area));

  return rows;
}

/**
 * Writes the collisions of an interior (16 px tiles) or region (12 px) on the rows
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

/**
 * Adds the interior of a building: a room drawn with code ({ canvas, map },
 * see world/procedural/rooms.js) at the origin of the building (the three
 * that always exist and the lots).
 */
export function addInterior({ id, name }, room) {
  const interior = {
    id,
    placeId: id,
    name,
    origin: BUILDING_INTERIOR_ORIGINS[id] ?? LOT_INTERIOR_ORIGINS[id],
    map: room.map,
    canvas: room.canvas ?? null,
    width: room.map.width * room.map.tileWidth,
    height: room.map.height * room.map.tileHeight,
  };

  INTERIORS.push(interior);
  INTERIORS_BY_ID[id] = interior;
  INTERIORS_BY_PLACE[id] = interior;
  return interior;
}
