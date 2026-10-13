// The village plan made by the language model (backend VillageBuilder):
// a copy of the house of the map is stamped on each built lot, with its
// collisions, its place (for routines and prompts), its door, windows and
// chimney, and its interior.

import {
  BUILDINGS,
  HOUSE_PREFAB,
  LOTS,
  STRUCTURE_SPOTS,
  lotBuilding,
  lotPlace,
} from "../levels/decor";
import { PLACES, PLACES_BY_ID } from "../levels/places";
import { VILLAGE, addLotInterior, rasterizeArea } from "../levels/world";
import { pathfinder } from "../utils/pathfinding";

/** Copies the tiles and collisions of the house of the map onto a lot. */
function stampHouse(tileMap, collision, lot) {
  const { column, row, columns, rows, layers } = HOUSE_PREFAB;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < columns; c++) {
      const source = (row + r) * VILLAGE.width + column + c;

      for (const name of layers) {
        const gid = VILLAGE.layers.find((layer) => layer.name === name)?.data[
          source
        ];
        if (gid) tileMap.setTile(name, lot.column + c, lot.row + r, gid);
      }

      if (VILLAGE.collisions[source]) {
        collision.rows[lot.row + r][lot.column + c] = 1;
      }
    }
  }
}

/**
 * @param {{id: string, name: string, kind: "home" | "work"}[]} built
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
  let changed = false;

  for (const building of built) {
    const lot = LOTS.find((candidate) => candidate.id === building.id);
    if (!lot || PLACES_BY_ID[lot.id]) continue;

    stampHouse(villageTiles, collision, lot);

    const place = {
      id: lot.id,
      name: building.name,
      description: lot.description,
      ...lotPlace(lot),
      building: true,
      kind: building.kind,
    };
    PLACES.push(place);
    PLACES_BY_ID[lot.id] = place;
    BUILDINGS.push(lotBuilding(lot));
    STRUCTURE_SPOTS[lot.id] = [
      { x: place.x - 34, y: place.y + 8 },
      { x: place.x + 46, y: place.y + 8 },
      { x: place.x + 8, y: place.y + 30 },
    ];

    const interior = addLotInterior(building);
    rasterizeArea(collision.rows, interior);
    interiors.addRoom(interior);
    changed = true;
  }

  if (changed) {
    pathfinder.update(collision);
    // Snow, autumn and footprints know the new houses
    village.terrain = null;
  }
}
