import { sound } from "../audio/sound";
import { placeBanner } from "../hud/PlaceBanner";
import { BUILDINGS } from "../levels/decor";
import {
  INTERIORS,
  INTERIORS_BY_ID,
  INTERIORS_BY_PLACE,
  VILLAGE_HEIGHT,
  VILLAGE_WIDTH,
  interiorPoint,
} from "../levels/world";
import { Map as MapObject } from "../objects/Map";
import { playerState } from "../state/playerState";
import { gameClock } from "../systems/GameClock";
import { Vector2 } from "../utils/Vector2";
import { Lighting } from "./Lighting";
import { buildingAccess, interiorDarkness } from "./rules";
import { TileMap } from "./TileMap";

const FRIEND_REPUTATION = 5;
const WORK_HOURS = [8, 18];

const randomOf = (items) => items[Math.floor(Math.random() * items.length)];

/**
 * The inside of the buildings. Each interior is a small map placed to the
 * right of the village (out of sight) and the player goes in through the
 * door (F) and out by the mat. Villagers whose place is a building go inside
 * when they get there, and come out when their routine takes them away.
 */
export class Interiors {
  /**
   * @param {object} options
   * @param {import("../GameObject").GameObject} options.scene
   * @param {import("../objects/Hero").Hero} options.hero
   * @param {Map<number, import("../objects/Npc").Npc>} options.npcs
   * @param {import("../objects/Camera").Camera} options.camera
   * @param {import("../utils/collisionGrid").CollisionGrid} options.collision
   * @param {{width: number, height: number}} options.screen
   */
  constructor({ scene, hero, npcs, camera, collision, screen }) {
    this.hero = hero;
    this.npcs = npcs;
    this.camera = camera;
    this.collision = collision;
    this.current = null; // Interior where the player is
    this.lighting = new Lighting(screen);

    this.rooms = INTERIORS.map((interior) => {
      const tileMap = new TileMap(interior.map);
      const map = new MapObject({
        resource: tileMap.background,
        foregroundResource: tileMap.foreground,
        width: interior.width,
        height: interior.height,
        position: new Vector2(interior.origin.x, interior.origin.y),
      });
      scene.addChild(map);
      return { interior, tileMap, map };
    });
  }

  get isInside() {
    return Boolean(this.current);
  }

  doorOf(placeId) {
    return BUILDINGS.find((building) => building.placeId === placeId)?.door;
  }

  /** Villagers inside a building (or living there). */
  peopleInside(interiorId) {
    return [...this.npcs.values()].filter(
      (npc) => npc.indoor?.interiorId === interiorId,
    );
  }

  /** Whether the player can go into the building of `placeId`. */
  access(placeId) {
    const interior = INTERIORS_BY_PLACE[placeId];
    if (!interior) return { open: false, reason: null };

    const inside = this.peopleInside(interior.id);
    const residents = [...this.npcs.values()].filter(
      (npc) => !npc.data.visitor && npc.data.routine?.[0] === placeId,
    );
    const reputation = playerState.state?.reputation ?? [];
    const friend = residents.some(
      (npc) =>
        (reputation.find((entry) => entry.npcId === npc.id)?.value ?? 0) >=
        FRIEND_REPUTATION,
    );

    return buildingAccess(placeId, gameClock.hour, {
      awakeInside: inside.filter((npc) => !npc.isSleeping).length,
      asleepInside: inside.filter((npc) => npc.isSleeping).length,
      friend,
    });
  }

  // ---------------------------------------------------------------------------
  // The player

  enter(placeId) {
    const interior = INTERIORS_BY_PLACE[placeId];
    if (!interior) return;

    const entrance = interiorPoint(interior, "entrance");
    const companions = this.companions();
    this.current = interior;
    this.placeHero(entrance.x, entrance.y);
    this.camera.setBounds({
      x: interior.origin.x,
      y: interior.origin.y,
      width: interior.width,
      height: interior.height,
    });
    companions.forEach((npc) => this.moveIn(npc, interior));
    this.hero.emitPosition();
    placeBanner.show(interior.name);
    sound.door();

    // Someone awake inside says hello
    const host = this.peopleInside(interior.id).find(
      (npc) => !npc.isSleeping && !companions.includes(npc) && !npc.isTalking,
    );
    host?.sayLine(
      randomOf(["Entre, entre!", "Seja bem-vindo!", "Olá! Fique à vontade."]),
      { emotion: "happy" },
    );
  }

  exit() {
    const interior = this.current;
    if (!interior) return;

    const door = this.doorOf(interior.placeId);
    const companions = this.companions();
    this.current = null;
    this.placeHero(door.x - 8, door.y + 4);
    this.camera.setBounds({
      x: 0,
      y: 0,
      width: VILLAGE_WIDTH,
      height: VILLAGE_HEIGHT,
    });
    companions.forEach((npc) => this.moveOut(npc, interior));
    this.hero.emitPosition();
    placeBanner.show(interior.name);
    sound.door();
  }

  placeHero(x, y) {
    this.hero.position.x = Math.round(x);
    this.hero.position.y = Math.round(y);
  }

  /** NPCs walking with the player go in and out with them. */
  companions() {
    return [...this.npcs.values()].filter(
      (npc) => npc.followTarget === this.hero || npc.guide,
    );
  }

  /** The mat by the door, in world pixels. */
  exitArea(interior = this.current) {
    return interiorPoint(interior, "exit");
  }

  /** The player is on the mat (or close to it, for the F prompt). */
  isAtExit(position, margin = 0) {
    const area = this.current && this.exitArea();
    if (!area) return false;

    const x = position.x + 8;
    const y = position.y + 10;
    return (
      x >= area.x - margin &&
      x <= area.x + area.width + margin &&
      y >= area.y - margin &&
      y <= area.y + area.height + margin
    );
  }

  // ---------------------------------------------------------------------------
  // The villagers

  step(_delta, { fighting }) {
    if (this.current && !fighting && this.isAtExit(this.hero.position)) {
      this.exit();
    }

    for (const npc of this.npcs.values()) {
      if (
        npc.data.bandit ||
        npc.inFight ||
        npc.knockedOut ||
        npc.isTalking ||
        npc.npcConversation ||
        npc.followTarget === this.hero ||
        npc.guide ||
        npc.seeking
      ) {
        continue;
      }

      const place = npc.outdoorPlace;

      if (npc.indoor) {
        const interior = INTERIORS_BY_ID[npc.indoor.interiorId];
        if (place?.id !== interior.placeId) this.moveOut(npc, interior);
        continue;
      }

      const interior = place && INTERIORS_BY_PLACE[place.id];
      if (interior && npc.isAt(place)) this.moveIn(npc, interior);
    }
  }

  /** Where the NPC stays inside: its counter, its bed or a table. */
  spotFor(npc, interior) {
    const points = Object.entries(interior.map.points).filter(
      ([, point]) => point.kind === "spot" || point.kind === "center",
    );
    const hour = gameClock.hour;
    const worksHere =
      npc.routine?.[0]?.id === interior.placeId &&
      hour >= WORK_HOURS[0] &&
      hour < WORK_HOURS[1];
    const name =
      (worksHere && interior.map.points.keeper && "keeper") ||
      ((hour >= 22 || hour < 6) && interior.map.points.bed && "bed") ||
      randomOf(points)[0];

    return interiorPoint(interior, name);
  }

  moveIn(npc, interior) {
    const spot = this.spotFor(npc, interior);
    const entrance = interiorPoint(interior, "entrance");

    npc.cancelPath();
    npc.indoor = {
      interiorId: interior.id,
      placeId: interior.placeId,
      place: {
        id: `${interior.id}:inside`,
        name: interior.name,
        x: spot.x,
        y: spot.y,
      },
    };
    this.placeNpc(npc, entrance.x + (Math.random() - 0.5) * 16, entrance.y - 4);
  }

  moveOut(npc, interior) {
    const door = this.doorOf(interior.placeId);

    npc.cancelPath();
    npc.indoor = null;
    this.placeNpc(npc, door.x - 8 + (Math.random() - 0.5) * 12, door.y + 6);
  }

  placeNpc(npc, x, y) {
    const free = [
      [0, 0],
      [8, 0],
      [-8, 0],
      [0, 8],
      [0, -8],
      [12, 8],
      [-12, 8],
    ]
      .map(([dx, dy]) => ({ x: Math.round(x + dx), y: Math.round(y + dy) }))
      .find(
        (spot) =>
          !this.collision.isBlocked(spot.x, spot.y, npc.width, npc.height),
      ) ?? { x: Math.round(x), y: Math.round(y) };

    npc.position.x = free.x;
    npc.position.y = free.y;
  }

  /** Where to show someone on the minimap (inside: at the door). */
  mapPosition(character) {
    const interiorId =
      character === this.hero ? this.current?.id : character.indoor?.interiorId;

    if (!interiorId) return character.position;

    const door = this.doorOf(INTERIORS_BY_ID[interiorId].placeId);
    return { x: door.x - 8, y: door.y - 4 };
  }

  // ---------------------------------------------------------------------------
  // Drawing

  /** Tops of the furniture (over the characters). */
  drawForeground(ctx) {
    for (const { map, interior } of this.rooms) {
      map.foreground.draw(ctx, interior.origin.x, interior.origin.y);
    }
  }

  /** Light of the room: fireplace, lamps and the light of the day. */
  drawLighting(ctx, darknessOutside, time) {
    const interior = this.current;
    const lights = Object.values(interior.map.points)
      .filter((point) => point.kind === "light")
      .map((point, i) => ({
        x: interior.origin.x + point.x,
        y: interior.origin.y + point.y,
        radius: 56,
        strength: 0.9 + 0.1 * Math.sin(time / 110 + i),
        color: [255, 160, 70],
      }));

    this.lighting.draw(ctx, {
      camera: this.camera.position,
      darkness: interiorDarkness(darknessOutside),
      lights,
    });
  }
}
