// The village plan made by the language model (backend VillageBuilder): on
// each built lot a house is drawn with code from the description the model
// gave (roof, walls, sign...), with its collisions, its place (routines and
// prompts), its door, windows and chimney, and an interior furnished for its
// trade (see world/procedural).

import { BUILDINGS, LOTS, STRUCTURE_SPOTS } from "../levels/decor";
import { PLACES, PLACES_BY_ID } from "../levels/places";
import { addLotInterior, rasterizeArea } from "../levels/world";
import { pathfinder } from "../utils/pathfinding";
import { seedOf } from "./procedural/pixel";
import { buildHouse, houseFromLook } from "./procedural/houses";
import { buildRoom, roomFor } from "./procedural/rooms";

const TILE = 12;
// A lot is 6 x 8 tiles; the doorstep is on its last row
const LOT_WIDTH = 6 * TILE;

/** Blocks the cells of the collision grid whose center is in the rectangle. */
function blockRect(collision, { x, y, width, height }) {
  for (let row = Math.floor(y / TILE); row * TILE < y + height; row++) {
    for (
      let column = Math.floor(x / TILE);
      column * TILE < x + width;
      column++
    ) {
      const cx = column * TILE + TILE / 2;
      const cy = row * TILE + TILE / 2;
      if (cx >= x && cx < x + width && cy >= y && cy < y + height) {
        collision.rows[row][column] = 1;
      }
    }
  }
}

/**
 * @param {{id: string, name: string, kind: "home" | "work", trade?: string,
 *   look?: object, furniture?: string[]}[]} built
 * @param {object} game
 * @param {import("./TileMap").TileMap} game.villageTiles
 * @param {import("../utils/collisionGrid").CollisionGrid} game.collision
 * @param {import("./Interiors").Interiors} game.interiors
 * @param {import("./Village").Village} game.village
 */
export function applyVillageLayout(
  built,
  { villageTiles, collision, interiors, village },
) {
  const houses = [];

  for (const building of built) {
    const lot = LOTS.find((candidate) => candidate.id === building.id);
    if (!lot || PLACES_BY_ID[lot.id]) continue;

    const trade =
      building.trade ?? (building.kind === "work" ? "shop" : "home");
    const seed = seedOf(`${lot.id}:${building.name}`);
    const spec = houseFromLook(building.look, trade, seed);
    const house = buildHouse(spec, {
      x: lot.column * TILE + Math.round((LOT_WIDTH - spec.width) / 2),
      ground: (lot.row + 7) * TILE + 2,
    });
    houses.push(house);
    blockRect(collision, house.blocked);

    const place = {
      id: lot.id,
      name: building.name,
      description: lot.description,
      x: Math.round(house.door.x - 8),
      y: house.door.y + 6,
      building: true,
      kind: building.kind,
    };
    PLACES.push(place);
    PLACES_BY_ID[lot.id] = place;
    BUILDINGS.push({
      placeId: lot.id,
      area: house.area,
      door: house.door,
      windows: house.windows,
      chimney: house.chimney,
      // The chimney is part of the drawing of the house
      drawnChimney: true,
    });
    STRUCTURE_SPOTS[lot.id] = [
      { x: place.x - 34, y: place.y + 8 },
      { x: place.x + 46, y: place.y + 8 },
      { x: place.x + 8, y: place.y + 30 },
    ];

    const room = buildRoom(roomFor(trade, seed, building.furniture));
    const interior = addLotInterior(building, room);
    rasterizeArea(collision.rows, interior);
    interiors.addRoom(interior);
  }

  if (houses.length === 0) return;

  pathfinder.update(collision);

  // The houses are drawn once the tiles of the village are (or the tiles
  // would cover them)
  villageTiles.ready.then(() => {
    const background = villageTiles.background.image.getContext("2d");
    const foreground = villageTiles.foreground.image.getContext("2d");
    houses.forEach((house) => house.paint(background, foreground));
    // Snow, autumn and footprints know the new houses
    village.terrain = null;
  });
}
