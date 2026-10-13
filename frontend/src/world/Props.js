import { GameObject } from "../GameObject";
import {
  BUSHES,
  CAMPFIRE,
  CHESTS,
  LAMPS,
  SCARECROW,
  SIGNS,
  WELL,
  WINDMILL,
  WOODPILE,
  spotFor,
} from "../levels/decor";
import { PLACES_BY_ID } from "../levels/places";
import { Vector2 } from "../utils/Vector2";
import {
  BUSH_REGROW_MINUTES,
  campfireLit,
  festivalDecorUp,
  lampsLit,
} from "./rules";
import * as sprites from "./sprites";

// Characters are sorted by the top of their 16x12 hitbox: a prop whose base
// is at `y` sorts like a character standing on it
const FEET = 11;

/** A thing on the map, sorted by depth with the characters. */
class Prop extends GameObject {
  constructor({ x, y, draw }) {
    super({ position: new Vector2(x, y - FEET) });
    this.anchor = { x, y };
    this.drawProp = draw;
  }

  drawImage(ctx) {
    this.drawProp(ctx, this.anchor.x, this.anchor.y);
  }
}

// Where the boat someone builds floats (left of the pier)
const BOAT_SPOT = { x: 30, y: 352 };

const STRUCTURE_SPRITES = {
  stall: (ctx, x, y, t, seed) => sprites.stall(ctx, x, y, seed),
  boat: (ctx, x, y, t) => sprites.boat(ctx, x, y, t),
  flowerbed: (ctx, x, y) => sprites.flowerbed(ctx, x, y),
  workshop: (ctx, x, y) => sprites.workshop(ctx, x, y),
  banner: (ctx, x, y, t, seed) => sprites.banner(ctx, x, y, t, seed),
  wedding_arch: (ctx, x, y) => sprites.weddingArch(ctx, x, y),
};

/**
 * The props of the map: fixed ones (lamps, windmill, well...) and the ones
 * that come and go with the story (festival decoration, buildings of the
 * villagers, wrecks left by the bandits).
 */
export class Props {
  /**
   * @param {object} options
   * @param {GameObject} options.scene Where the props are added.
   * @param {import("./Village").Village} options.village
   */
  constructor({ scene, village }) {
    this.scene = scene;
    this.village = village;
    this.dynamic = [];
    this.dynamicKey = "";
    // Positions of the dynamic things, for the interactions
    this.wrecks = []; // { id, x, y }
    this.structures = []; // { label, x, y }
    this.festivalLanterns = []; // { x, y }

    const v = village;
    // Bottom center of a prop that occupies whole tiles
    const bottom = (prop, height) => ({
      x: prop.x + new Set(prop.tiles.map(([column]) => column)).size * 6,
      y: prop.y + height,
    });

    for (const lamp of LAMPS) {
      const { x, y } = bottom(lamp, 11);
      this.add(x, y, (ctx) => sprites.lamp(ctx, x, y, lampsLit(v.darkness)));
    }

    const windmill = bottom(WINDMILL, 23);
    this.add(windmill.x, windmill.y, (ctx, x, y) =>
      sprites.windmill(ctx, x, y, v.windmillAngle),
    );
    const well = bottom(WELL, 23);
    this.add(well.x, well.y, (ctx, x, y) => sprites.well(ctx, x, y));
    const woodpile = bottom(WOODPILE, 11);
    this.add(woodpile.x, woodpile.y, (ctx, x, y) =>
      sprites.woodpile(ctx, x, y),
    );
    const scarecrow = bottom(SCARECROW, 11);
    this.add(scarecrow.x, scarecrow.y, (ctx, x, y) =>
      sprites.scarecrow(ctx, x, y, v.time),
    );

    for (const chest of CHESTS) {
      const { x, y } = bottom(chest, 11);
      this.add(x, y, (ctx) =>
        sprites.chest(ctx, x, y, v.emptyChests.includes(chest.id)),
      );
    }

    for (const sign of SIGNS) {
      const { x, y } = bottom(sign, 11);
      this.add(x, y, (ctx) => sprites.sign(ctx, x, y));
    }

    for (const bush of BUSHES) {
      this.add(bush.x, bush.y, (ctx, x, y) =>
        sprites.bush(
          ctx,
          x,
          y,
          v.season,
          v.minutesSinceGathering() < BUSH_REGROW_MINUTES,
        ),
      );
    }

    this.add(CAMPFIRE.x, CAMPFIRE.y + 2, (ctx, x, y) =>
      sprites.campfire(ctx, x, y, v.time, campfireLit(v.hour, v.weather)),
    );
  }

  add(x, y, draw, list = null) {
    const prop = new Prop({ x, y, draw });
    this.scene.addChild(prop);
    list?.push(prop);
    return prop;
  }

  /** Rebuilds the props of the story when they change. */
  sync({ festival, day, map }) {
    const decor = festivalDecorUp(festival, day) ? festival : null;
    const key = JSON.stringify({
      festival: decor && [decor.placeId, decor.wedding],
      wrecks: map?.wrecks ?? [],
      structures: map?.structures ?? [],
    });

    if (key === this.dynamicKey) return;

    this.dynamicKey = key;
    this.dynamic.forEach((prop) => prop.destroy());
    this.dynamic = [];
    this.wrecks = [];
    this.structures = [];
    this.festivalLanterns = [];

    const v = this.village;

    if (decor) this.addFestival(decor);

    // Wrecks of the bandits: first spots of the place
    (map?.wrecks ?? []).forEach((wreck, i) => {
      const spot = spotFor(wreck.placeId, i);
      if (!spot) return;
      const draw =
        wreck.kind === "cart" ? sprites.wreckCart : sprites.wreckCrates;
      this.add(spot.x, spot.y, (ctx, x, y) => draw(ctx, x, y), this.dynamic);
      this.wrecks.push({ id: wreck.id, x: spot.x, y: spot.y });
    });

    // Buildings of the villagers: last spots of the place
    const perPlace = new Map();
    for (const structure of map?.structures ?? []) {
      const count = perPlace.get(structure.placeId) ?? 0;
      perPlace.set(structure.placeId, count + 1);
      const spot =
        structure.kind === "boat"
          ? { x: BOAT_SPOT.x + count * 4, y: BOAT_SPOT.y + count * 26 }
          : spotFor(structure.placeId, 2 - count);
      const draw =
        STRUCTURE_SPRITES[structure.kind] ?? STRUCTURE_SPRITES.banner;
      if (!spot) continue;
      this.add(
        spot.x,
        spot.y,
        (ctx, x, y) => draw(ctx, x, y, v.time, structure.id),
        this.dynamic,
      );
      this.structures.push({ label: structure.label, x: spot.x, y: spot.y });
    }
  }

  addFestival({ placeId, wedding }) {
    const place = PLACES_BY_ID[placeId];
    if (!place) return;

    const v = this.village;
    const cx = place.x + 8;
    const cy = place.y + 6;

    this.add(
      cx,
      cy - 22,
      (ctx, x, y) => sprites.bunting(ctx, x, y, 64, v.time),
      this.dynamic,
    );
    this.add(
      cx,
      cy - 12,
      (ctx, x, y) =>
        wedding ? sprites.weddingArch(ctx, x, y) : sprites.table(ctx, x, y),
      this.dynamic,
    );

    for (const dx of [-34, 34]) {
      const x = cx + dx;
      const y = cy + 14;
      this.add(
        x,
        y,
        (ctx) => sprites.lantern(ctx, x, y, lampsLit(v.darkness)),
        this.dynamic,
      );
      this.festivalLanterns.push({ x, y: y - 15 });
    }
  }
}
