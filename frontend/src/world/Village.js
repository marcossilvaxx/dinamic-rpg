import { sound } from "../audio/sound";
import { notifications } from "../hud/Notifications";
import {
  BLOCKING_PROPS,
  BUILDINGS,
  CAMPFIRE,
  CHESTS,
  FARM_PLOTS,
  LAMPS,
  SIGNS,
  VILLAGE_BOAT,
  WELL,
  WOODPILE,
} from "../levels/decor";
import { PLACES_BY_ID, PLACE_RADIUS, nearestPlace } from "../levels/places";
import { VILLAGE } from "../levels/world";
import * as protocol from "../net/protocol";
import { gameSocket } from "../net/socket";
import { worldState } from "../state/worldState";
import { gameClock } from "../systems/GameClock";
import { activityAt } from "../systems/activity";
import { lightingAt } from "../systems/time";
import { pathfinder } from "../utils/pathfinding";
import { Ambient } from "./Ambient";
import { GroundLayer } from "./GroundLayer";
import { Lighting } from "./Lighting";
import { MapEvents } from "./MapEvents";
import { Props } from "./Props";
import {
  campfireLit,
  isDaytime,
  lampsLit,
  windmillSpeed,
  windowsLit,
} from "./rules";
import { burnedHouse } from "./sprites";
import { analyzeTerrain } from "./terrain";

const SEASONS = ["spring", "summer", "autumn", "winter"];
// Seasons, snow and puddles change little by little (per ms)
const SEASON_FADE = 1 / 6000;
const GROUND_FADE = 1 / 4000;
const INTERACT_DISTANCE = 16;
const FOOTPRINT_STEP = 7; // px walked between two footprints
const FOOTPRINT_MS = { snow: 60000, mud: 30000 };
const MAX_FOOTPRINTS = 400;
// Worn paths: where people are is sampled and sent to the server
const WEAR_SAMPLE_MS = 500;
const WEAR_REPORT_MS = 20000;

const approach = (value, target, amount) =>
  value +
  Math.sign(target - value) * Math.min(Math.abs(target - value), amount);

/**
 * The living map: what the server says about it (world_state.map), the
 * layers drawn over the village map, the props, the animals, the lights and the
 * objects the player uses with F.
 */
export class Village {
  /**
   * @param {object} options
   * @param {import("../GameObject").GameObject} options.scene
   * @param {import("../objects/Map").Map} options.map
   * @param {import("../objects/Hero").Hero} options.hero
   * @param {Map<number, import("../objects/Npc").Npc>} options.npcs
   * @param {import("../utils/collisionGrid").CollisionGrid} options.collision
   * @param {import("./Interiors").Interiors} options.interiors
   * @param {import("./Regions").Regions} options.regions
   * @param {{width: number, height: number}} options.screen
   * @param {object} [options.island] Layout of the generated island.
   */
  constructor({
    scene,
    map,
    hero,
    npcs,
    collision,
    interiors,
    regions,
    screen,
    island,
  }) {
    this.map = map;
    this.interiors = interiors;
    this.regions = regions;
    this.hero = hero;
    this.npcs = npcs;
    this.collision = collision;
    this.terrain = null;
    this.time = 0;
    this.seasonWeights = { spring: 1, summer: 0, autumn: 0, winter: 0 };
    this.ground = { snow: 0, wet: 0 };
    this.windmillAngle = 0;
    this.footprints = [];
    this.lastSteps = new Map(); // character -> { x, y, left }
    this.tracks = null; // { key, points, inspected }
    this.lastGathering = -Infinity; // Game minute
    this.wearBuffer = new Map(); // tile index -> steps
    this.wearTiles = new Map(); // character -> last tile
    this.timeToWearSample = WEAR_SAMPLE_MS;
    this.timeToWearReport = WEAR_REPORT_MS;

    map.addChild(new GroundLayer(this));
    this.props = new Props({ scene, village: this });
    this.ambient = new Ambient({ scene, village: this });
    // Fallen trees, high tide, smoke of the forest fire (see MapEvents.js)
    this.events = island ? new MapEvents({ scene, island, hero, npcs }) : null;
    this.lighting = new Lighting(screen);

    gameSocket.on(protocol.INTERACT_RESULT, ({ data }) =>
      this.showResult(data),
    );
    gameSocket.on(protocol.ACTIVITY_RESULT, ({ data }) => {
      if (data.ok && activityAt(this.heroFeet) === "gathering") {
        this.lastGathering = gameClock.totalMinutes;
      }
    });
  }

  /** The props can't be walked through (before the pathfinding starts). */
  static blockProps(collision) {
    collision.block(BLOCKING_PROPS.flatMap((prop) => prop.tiles));
  }

  // ---------------------------------------------------------------------------
  // State of the world

  get hour() {
    return gameClock.minuteOfDay / 60;
  }

  get season() {
    return worldState.state.season ?? "spring";
  }

  get weather() {
    return worldState.weather;
  }

  get mapState() {
    return worldState.state.map ?? null;
  }

  get farm() {
    return this.mapState?.farm ?? null;
  }

  get terrainState() {
    return worldState.state.terrain ?? { wear: [], burned: [] };
  }

  /** Burned building of the place ({ placeId, progress }), if any. */
  burnedAt(placeId) {
    return this.terrainState.burned.find((fire) => fire.placeId === placeId);
  }

  get emptyChests() {
    return this.mapState?.emptyChests ?? [];
  }

  get darkness() {
    return lightingAt(gameClock.minuteOfDay).alpha;
  }

  get isDay() {
    return isDaytime(this.hour);
  }

  get heroFeet() {
    return { x: this.hero.position.x + 8, y: this.hero.position.y + 10 };
  }

  minutesSinceGathering() {
    return gameClock.totalMinutes - this.lastGathering;
  }

  // ---------------------------------------------------------------------------

  step(delta) {
    this.time += delta;
    this.loadTerrain();
    this.events?.step(delta);

    for (const season of SEASONS) {
      const target = season === this.season ? 1 : 0;
      this.seasonWeights[season] = approach(
        this.seasonWeights[season],
        target,
        SEASON_FADE * delta,
      );
    }

    const ground = this.mapState?.ground ?? { snow: 0, wet: 0 };
    this.ground.snow = approach(
      this.ground.snow,
      ground.snow,
      GROUND_FADE * delta,
    );
    this.ground.wet = approach(
      this.ground.wet,
      ground.wet,
      GROUND_FADE * delta,
    );
    this.windmillAngle += windmillSpeed(this.weather) * delta;

    this.updateFootprints(delta);
    this.updateWear(delta);
    this.updateTracks();
    this.props.sync({
      festival: worldState.festival,
      day: gameClock.day,
      map: this.mapState,
    });
    this.ambient.step(delta);
  }

  loadTerrain() {
    const { resource, foregroundResource, width, height, roofs } = this.map;

    if (this.terrain || !resource.isLoaded || !foregroundResource.isLoaded) {
      return;
    }

    this.terrain = analyzeTerrain(
      resource.image,
      foregroundResource.image,
      width,
      height,
      roofs,
    );
  }

  /** Characters leave footprints in the snow and in the mud. */
  updateFootprints(delta) {
    const { terrain, ground } = this;

    for (const print of this.footprints) {
      print.age += delta;
      print.alpha = 0.5 * (1 - print.age / FOOTPRINT_MS[print.kind]);
    }
    this.footprints = this.footprints.filter((print) => print.alpha > 0.02);

    if (!terrain || (ground.snow < 0.25 && ground.wet < 0.35)) return;

    for (const character of [this.hero, ...this.npcs.values()]) {
      const x = character.position.x + 7;
      const y = character.position.y + 10;
      const last = this.lastSteps.get(character);

      if (last && Math.hypot(x - last.x, y - last.y) < FOOTPRINT_STEP) continue;

      const left = !last?.left;
      this.lastSteps.set(character, { x, y, left });
      if (!last) continue;

      const kind =
        ground.snow >= 0.25 && terrain.isLand(x, y)
          ? "snow"
          : ground.wet >= 0.35 && terrain.isSand(x, y)
            ? "mud"
            : null;

      if (kind) {
        this.footprints.push({
          x: x + (left ? -2 : 1),
          y,
          kind,
          age: 0,
          alpha: 0.5,
        });
      }
    }

    if (this.footprints.length > MAX_FOOTPRINTS) {
      this.footprints.splice(0, this.footprints.length - MAX_FOOTPRINTS);
    }

    // Characters that left the game
    for (const character of this.lastSteps.keys()) {
      if (character !== this.hero && !this.npcs.has(character.id)) {
        this.lastSteps.delete(character);
      }
    }
  }

  /** Where people walk the grass wears out (see backend game/Terrain.js). */
  updateWear(delta) {
    this.timeToWearSample -= delta;
    this.timeToWearReport -= delta;

    if (this.timeToWearSample <= 0) {
      this.timeToWearSample = WEAR_SAMPLE_MS;

      for (const character of [this.hero, ...this.npcs.values()]) {
        if (character.indoor || character.data?.bandit) continue;
        const column = Math.floor((character.position.x + 8) / 12);
        const row = Math.floor((character.position.y + 10) / 12);
        if (
          column < 0 ||
          row < 0 ||
          column >= VILLAGE.width ||
          row >= VILLAGE.height
        ) {
          continue;
        }
        const tile = row * VILLAGE.width + column;
        if (this.wearTiles.get(character) !== tile) {
          this.wearTiles.set(character, tile);
          this.wearBuffer.set(tile, (this.wearBuffer.get(tile) ?? 0) + 1);
        }
      }
    }

    if (this.timeToWearReport <= 0) {
      this.timeToWearReport = WEAR_REPORT_MS;
      if (this.wearBuffer.size) {
        gameSocket.send(protocol.WEAR, {
          data: { tiles: [...this.wearBuffer] },
        });
        this.wearBuffer.clear();
      }
    }
  }

  /** Footprints of the mystery: a path between two places. */
  updateTracks() {
    const tracks = this.mapState?.tracks ?? null;
    const key = tracks ? `${tracks.fromPlaceId}>${tracks.toPlaceId}` : null;

    if (!key) {
      this.tracks = null;
      return;
    }

    if (this.tracks?.key === key) {
      this.tracks.inspected = tracks.inspected;
      return;
    }

    const from = PLACES_BY_ID[tracks.fromPlaceId];
    const to = PLACES_BY_ID[tracks.toPlaceId];
    this.tracks = { key, points: null, inspected: tracks.inspected };

    if (!from || !to) return;

    pathfinder.find(from, to, 16, 12).then((path) => {
      if (this.tracks?.key !== key || !path) return;
      const points = [];
      let walked = 0;
      for (let i = 1; i < path.length; i++) {
        walked += Math.hypot(
          path[i].x - path[i - 1].x,
          path[i].y - path[i - 1].y,
        );
        if (walked >= 6) {
          walked = 0;
          points.push({ x: path[i].x + 7, y: path[i].y + 9 });
        }
      }
      this.tracks.points = points;
    });
  }

  // ---------------------------------------------------------------------------
  // Drawing

  /** Over the foreground (roofs and trees), in map coordinates. */
  drawTop(ctx) {
    const { terrain } = this;

    if (terrain) {
      ctx.save();
      const autumn = this.seasonWeights.autumn;
      if (autumn > 0.01) {
        ctx.globalAlpha = autumn;
        ctx.drawImage(terrain.layers.autumnForeground, 0, 0);
      }
      if (this.ground.snow > 0.01) {
        ctx.globalAlpha = this.ground.snow;
        ctx.drawImage(terrain.layers.snowForeground, 0, 0);
      }
      ctx.restore();
    }

    for (const { placeId, area } of BUILDINGS) {
      const fire = this.burnedAt(placeId);
      if (fire) burnedHouse(ctx, area, fire.progress, this.time);
    }

    this.ambient.drawSky(ctx);
    this.events?.drawTop(ctx);
  }

  /** The night, with its lights (screen coordinates). */
  drawLighting(ctx, camera) {
    this.lighting.draw(ctx, {
      camera: camera.position,
      darkness: lightingAt(gameClock.minuteOfDay),
      lights: this.lights(),
    });
  }

  lights() {
    const { hour, darkness, time } = this;
    const flicker = (seed) => 0.92 + 0.08 * Math.sin(time / 90 + seed);
    const lights = [];

    for (const { placeId, windows } of BUILDINGS) {
      if (!windowsLit(placeId, hour)) continue;
      windows.forEach(({ x, y }, i) =>
        lights.push({ x, y, radius: 16, strength: 0.85 * flicker(i) }),
      );
    }

    if (lampsLit(darkness)) {
      for (const lamp of LAMPS) {
        lights.push({
          x: lamp.x + 6,
          y: lamp.y - 12,
          radius: 34,
          strength: 0.9,
        });
      }
      for (const lantern of this.props.festivalLanterns) {
        lights.push({
          ...lantern,
          radius: 26,
          strength: 0.8 * flicker(lantern.x),
          color: [255, 140, 90],
        });
      }
    }

    if (campfireLit(hour, this.weather)) {
      lights.push({
        x: CAMPFIRE.x,
        y: CAMPFIRE.y - 3,
        radius: 48 * flicker(1),
        strength: 1,
        color: [255, 150, 60],
      });
    }

    // The player carries a small lantern
    if (darkness > 0.3) {
      const { x, y } = this.heroFeet;
      lights.push({
        x,
        y: y - 6,
        radius: 30,
        strength: 0.75,
        color: [255, 200, 130],
      });
    }

    return [...lights, ...this.ambient.lights()];
  }

  // ---------------------------------------------------------------------------
  // Interactions (F)

  /** The object of the map close to `position` (top of the hero hitbox). */
  interactionAt(position) {
    // Inside a building only the door matters
    if (this.interiors.isInside) {
      return this.interiors.interactionAt(position);
    }
    if (this.regions.isAway) {
      return this.regions.interactionAt(position);
    }

    const feet = { x: position.x + 8, y: position.y + 10 };
    if (Math.hypot(feet.x - VILLAGE_BOAT.x, feet.y - VILLAGE_BOAT.y) <= 16) {
      return {
        label: "Viajar de barco",
        run: () => this.regions.openTravelMenu(),
      };
    }
    const near = (x, y, distance = INTERACT_DISTANCE) =>
      Math.hypot(feet.x - x, feet.y - y) <= distance;
    const server = (objectId) => () => this.interact(objectId);

    const event = this.events?.interactionAt(feet, server);
    if (event) return event;

    if (WELL.tiles.length && near(WELL.x + 12, WELL.y + 26, 20)) {
      return { label: "Encher o cantil", run: server("well") };
    }
    if (WOODPILE.tiles.length && near(WOODPILE.x + 12, WOODPILE.y + 14)) {
      return { label: "Cortar lenha", run: server("woodpile") };
    }
    for (const chest of CHESTS) {
      if (near(chest.x + 6, chest.y + 14)) {
        return {
          label: this.emptyChests.includes(chest.id)
            ? "Baú (vazio)"
            : "Abrir o baú",
          run: server(chest.id),
        };
      }
    }

    const { farm } = this;
    if (farm?.crop && farm.stage >= 4) {
      for (const plot of FARM_PLOTS.slice(0, farm.plots ?? 6)) {
        const inside =
          feet.x >= plot.x - 4 &&
          feet.x <= plot.x + plot.width + 4 &&
          feet.y >= plot.y - 4 &&
          feet.y <= plot.y + plot.height + 8;
        if (inside && !farm.harvested[plot.index]) {
          return {
            label: `Colher ${farm.crop}`,
            run: server(`plot:${plot.index}`),
          };
        }
      }
    }

    for (const wreck of this.props.wrecks) {
      if (near(wreck.x, wreck.y, 18)) {
        return {
          label: "Consertar o estrago",
          run: server(`wreck:${wreck.id}`),
        };
      }
    }

    if (this.tracks?.points?.some(({ x, y }) => near(x, y, 10))) {
      return { label: "Examinar as pegadas", run: server("tracks") };
    }

    if (near(this.ambient.catPosition.x, this.ambient.catPosition.y, 14)) {
      return {
        label: "Fazer carinho no gato",
        run: () => {
          this.ambient.petCat();
          notifications.push("O gato ronrona e passa a te seguir.");
        },
      };
    }

    for (const sign of SIGNS) {
      if (near(sign.x + 6, sign.y + 14)) {
        return { label: "Ler a placa", run: () => this.readSign(sign.placeId) };
      }
    }

    for (const { placeId, door } of BUILDINGS) {
      if (near(door.x, door.y + 4, 14)) {
        if (this.burnedAt(placeId)) {
          return {
            label: "Ajudar na reconstrução (2 lenha)",
            run: server(`rebuild:${placeId}`),
          };
        }

        const access = this.interiors.access(placeId);
        return access.open
          ? { label: "Entrar", run: () => this.interiors.enter(placeId) }
          : { label: "Bater na porta", run: () => this.knock(placeId, access) };
      }
    }

    for (const structure of this.props.structures) {
      if (near(structure.x, structure.y, 16)) {
        return {
          label: `Ver: ${structure.label}`,
          run: () => notifications.push(structure.label),
        };
      }
    }

    return null;
  }

  interact(objectId) {
    gameSocket.send(protocol.INTERACT, { data: { objectId } });

    if (objectId === "woodpile") sound.chop();
    else if (objectId === "well") sound.water();
    else if (objectId.startsWith("chest")) sound.creak();
  }

  showResult({ ok, message }) {
    notifications.push(message, ok ? "item" : undefined);
    if (ok) sound.chime("item");
  }

  /** People close to a place right now. */
  peopleAt(placeId) {
    return [...this.npcs.values()].filter(
      (npc) =>
        !npc.data.bandit &&
        (npc.indoor
          ? npc.indoor.placeId === placeId
          : nearestPlace(npc.position, PLACE_RADIUS + 30)?.id === placeId),
    );
  }

  readSign(placeId) {
    const place = PLACES_BY_ID[placeId];
    if (!place) return;

    const people = this.peopleAt(placeId).map((npc) => npc.data.name);
    notifications.push(
      `${place.name}${people.length ? ` — agora: ${people.join(", ")}` : " — ninguém por aqui agora"}`,
    );
  }

  /** Where an NPC is now (a place of the village or a building). */
  whereIs(npc) {
    if (npc.indoor) return PLACES_BY_ID[npc.indoor.placeId]?.name ?? "em casa";
    return nearestPlace(npc.position, PLACE_RADIUS + 60)?.name ?? "pela vila";
  }

  /** Knocking on a closed door: why nobody opens it. */
  knock(placeId, { reason }) {
    sound.knock();
    const place = PLACES_BY_ID[placeId];

    if (placeId === "tavern") {
      notifications.push("A taverna está fechada. Abre às 6h.");
      return;
    }

    if (reason === "sleeping") {
      notifications.push("Ninguém atende. Estão todos dormindo.");
      return;
    }

    const residents = [...this.npcs.values()].filter(
      (npc) =>
        !npc.data.visitor &&
        !npc.data.bandit &&
        npc.data.routine?.[0] === placeId,
    );

    if (residents.length === 0) {
      notifications.push(`Ninguém mora em ${place?.name ?? "aqui"}.`);
      return;
    }

    const where = residents.map(
      (npc) => `${npc.data.name} (${this.whereIs(npc)})`,
    );
    notifications.push(`Ninguém em casa. Moram aqui: ${where.join(", ")}.`);
  }
}
