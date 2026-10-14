// Things on the village map: buildings (doors, windows, chimneys), lamps,
// the windmill, the farm field, the well, chests, signs, bushes... The island
// is generated from a seed (world/island): these containers are filled by
// `applyIsland` before the game starts, so the rest of the game reads them
// as before. Positions are in map pixels (tile = 12 px); blocking props have
// the tiles they occupy (`tiles`). No imports on purpose: shared with the
// node tests.

export const TILE = 12;

/** Buildings of the map: { placeId, area, door, windows, chimney }. */
export const BUILDINGS = [];
/** Empty lots where the village plan (language model) may build. */
export const LOTS = [];

export const LAMPS = [];
export const WINDMILL = { x: 0, y: 0, tiles: [], kind: "windmill" };
export const WELL = { x: 0, y: 0, tiles: [], kind: "well", id: "well" };
export const WOODPILE = {
  x: 0,
  y: 0,
  tiles: [],
  kind: "woodpile",
  id: "woodpile",
};
export const SCARECROW = { x: 0, y: 0, tiles: [], kind: "scarecrow" };
export const CHESTS = [];
export const SIGNS = [];
/** Plots of the farm field (2x1 tiles, walkable), index = plot of the server. */
export const FARM_PLOTS = [];
/** Props the characters can't walk through. */
export const BLOCKING_PROPS = [];

export const CAMPFIRE = { x: 0, y: 0 };
export const BUSHES = [];
export const FISH_SPOTS = [];
export const CHICKEN_YARDS = [];
/** Where the boat leaves from in the village (end of the pier). */
export const VILLAGE_BOAT = { x: 0, y: 0 };
/** Where the cat lives, the crowns of the garden trees, fireflies. */
export const CAT_HOME = { x: 0, y: 0 };
export const TREE_CROWNS = [];
export const FIREFLY_AREAS = [];

/** Spots near each place for things that come with the story. */
export const STRUCTURE_SPOTS = {};

/** Spot `index` (wraps around) near the place, or null. */
export const spotFor = (placeId, index = 0) => {
  const spots = STRUCTURE_SPOTS[placeId];
  return spots
    ? spots[((index % spots.length) + spots.length) % spots.length]
    : null;
};

const replace = (array, items) => array.splice(0, array.length, ...items);

/**
 * Fills the containers above from a generated island (world/island/layout).
 * Windows and chimneys of the buildings come when they are drawn.
 */
export function applyDecor(layout) {
  const { props } = layout;

  replace(
    BUILDINGS,
    layout.buildings
      .filter((building) => !building.lot)
      .map(({ id, area, door }) => ({
        placeId: id,
        area,
        door,
        windows: [],
        chimney: null,
        drawnChimney: true,
      })),
  );
  replace(LOTS, layout.lots);
  replace(LAMPS, props.lamps);
  Object.assign(WINDMILL, props.windmill);
  Object.assign(WELL, props.well ?? { tiles: [] });
  Object.assign(WOODPILE, props.woodpile ?? { tiles: [] });
  Object.assign(SCARECROW, props.scarecrow);
  replace(CHESTS, props.chests);
  replace(SIGNS, props.signs);
  replace(FARM_PLOTS, props.farmPlots);
  replace(
    BLOCKING_PROPS,
    [...LAMPS, WINDMILL, WELL, WOODPILE, SCARECROW, ...CHESTS, ...SIGNS].filter(
      (prop) => prop.tiles.length,
    ),
  );
  Object.assign(CAMPFIRE, props.campfire);
  replace(BUSHES, props.bushes);
  replace(FISH_SPOTS, props.fishSpots);
  replace(CHICKEN_YARDS, props.chickenYards);
  Object.assign(VILLAGE_BOAT, props.boat);
  Object.assign(CAT_HOME, props.catHome);
  replace(TREE_CROWNS, props.treeCrowns);
  replace(FIREFLY_AREAS, props.fireflyAreas);
  for (const key of Object.keys(STRUCTURE_SPOTS)) delete STRUCTURE_SPOTS[key];
  Object.assign(STRUCTURE_SPOTS, props.structureSpots);
}
