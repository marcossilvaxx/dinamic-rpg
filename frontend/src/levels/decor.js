// Things added over the village map (tiled/game-test-map.tmx): lamps, the windmill, the farm
// field, the well, chests... and where the buildings of the map have their
// windows, doors and chimneys. Positions are in map pixels (tile = 12 px).
// Blocking props occupy whole tiles (`tiles`), checked by
// test/decor.test.js. No imports on purpose: shared with the node tests.

export const TILE = 12;

const tileRect = (column, row, columns = 1, rows = 1) => ({
  x: column * TILE,
  y: row * TILE,
  tiles: Array.from({ length: columns * rows }, (_, i) => [
    column + (i % columns),
    row + Math.floor(i / columns),
  ]),
});

// The three houses of the map are the same drawing, moved
const house = (placeId, dx, dy) => ({
  placeId,
  door: { x: 156 + dx, y: 132 + dy },
  windows: [
    { x: 156 + dx, y: 104 + dy, round: true },
    { x: 142 + dx, y: 117 + dy },
    { x: 169 + dx, y: 117 + dy },
  ],
  chimney: { x: 166 + dx, y: 64 + dy },
});

export const BUILDINGS = [
  house("west_house", 0, 0),
  house("tavern", 360, 25),
  house("east_house", 540, 133),
];

// Street lamps (lit at night)
export const LAMPS = [
  [20, 13],
  [30, 13],
  [47, 13],
  [46, 25],
  [25, 27],
  [40, 31],
  [60, 27],
  [15, 32],
].map(([column, row]) => ({ ...tileRect(column, row), kind: "lamp" }));

export const WINDMILL = { ...tileRect(58, 9, 2, 2), kind: "windmill" };
export const WELL = { ...tileRect(36, 11, 2, 2), kind: "well", id: "well" };
export const WOODPILE = {
  ...tileRect(16, 10, 2, 1),
  kind: "woodpile",
  id: "woodpile",
};
export const SCARECROW = { ...tileRect(56, 6), kind: "scarecrow" };

export const CHESTS = [
  { ...tileRect(22, 3), kind: "chest", id: "chest_north" },
  { ...tileRect(30, 32), kind: "chest", id: "chest_south" },
  { ...tileRect(66, 20), kind: "chest", id: "chest_east" },
];

// Signposts with the name of the place
export const SIGNS = [
  { ...tileRect(45, 13), placeId: "tavern" },
  { ...tileRect(14, 13), placeId: "west_house" },
  { ...tileRect(60, 23), placeId: "east_house" },
  { ...tileRect(37, 25), placeId: "garden" },
  { ...tileRect(14, 31), placeId: "dock" },
].map((sign) => ({ ...sign, kind: "sign" }));

// Farm field: plots of 2x1 tiles (walkable), index = plot id of the server
export const FARM_PLOTS = [
  [47, 5],
  [50, 5],
  [53, 5],
  [47, 7],
  [50, 7],
  [53, 7],
].map(([column, row], index) => ({
  index,
  x: column * TILE,
  y: row * TILE,
  width: 2 * TILE,
  height: TILE,
}));

// Props the characters can't walk through
export const BLOCKING_PROPS = [
  ...LAMPS,
  WINDMILL,
  WELL,
  WOODPILE,
  SCARECROW,
  ...CHESTS,
  ...SIGNS,
];

// Campfire on the old stone circle of the garden (lit in the evening)
export const CAMPFIRE = { x: 432, y: 231 };

// Bushes where the player gathers (fruits, flowers, mushrooms by season)
export const BUSHES = [
  { x: 310, y: 76 },
  { x: 352, y: 104 },
  { x: 300, y: 112 },
  { x: 722, y: 146 },
  { x: 762, y: 176 },
  { x: 384, y: 262 },
  { x: 466, y: 240 },
];

// Where fish jump and the water ripples, around the pier
export const FISH_SPOTS = [
  { x: 60, y: 344 },
  { x: 132, y: 410 },
  { x: 40, y: 392 },
];

// Where chickens live (they wander around)
export const CHICKEN_YARDS = [
  { x: 196, y: 148, count: 3 },
  { x: 650, y: 300, count: 2 },
];

// Spots near each place for things that appear with the story (stalls,
// wrecks, festival decoration...): walkable and away from the paths.
export const STRUCTURE_SPOTS = {
  tavern: [
    { x: 470, y: 150 },
    { x: 566, y: 150 },
    { x: 560, y: 116 },
  ],
  west_house: [
    { x: 112, y: 150 },
    { x: 212, y: 150 },
    { x: 200, y: 176 },
  ],
  east_house: [
    { x: 646, y: 250 },
    { x: 744, y: 250 },
    { x: 740, y: 286 },
  ],
  garden: [
    { x: 396, y: 240 },
    { x: 452, y: 262 },
    { x: 420, y: 256 },
  ],
  dock: [
    { x: 162, y: 330 },
    { x: 190, y: 380 },
    { x: 180, y: 320 },
  ],
  south_road: [
    { x: 380, y: 384 },
    { x: 470, y: 384 },
    { x: 520, y: 316 },
  ],
  north_meadow: [
    { x: 290, y: 70 },
    { x: 372, y: 70 },
    { x: 260, y: 100 },
  ],
  east_meadow: [
    { x: 716, y: 184 },
    { x: 776, y: 140 },
    { x: 700, y: 160 },
  ],
};

/** Spot `index` (wraps around) near the place, or null. */
export const spotFor = (placeId, index = 0) => {
  const spots = STRUCTURE_SPOTS[placeId];
  return spots
    ? spots[((index % spots.length) + spots.length) % spots.length]
    : null;
};
