import { sound } from "../audio/sound";
import { GameObject } from "../GameObject";
import { DOWN } from "../Input";
import { placeBanner } from "../hud/PlaceBanner";
import { PLACES_BY_ID } from "../levels/places";
import {
  REGIONS,
  REGIONS_BY_ID,
  VILLAGE_HEIGHT,
  VILLAGE_WIDTH,
  interiorPoint,
} from "../levels/world";
import * as protocol from "../net/protocol";
import { gameSocket } from "../net/socket";
import {
  addCharacterSprites,
  playMovementAnimation,
} from "../objects/Character";
import { Map as MapObject } from "../objects/Map";
import { Npc } from "../objects/Npc";
import { resources } from "../Resource";
import { worldState } from "../state/worldState";
import { preRenderText } from "../utils/text";
import { Vector2 } from "../utils/Vector2";
import { Lighting } from "./Lighting";
import { lampsLit } from "./rules";
import * as sprites from "./sprites";
import { TileMap } from "./TileMap";

// Where the boat leaves from in the village (left part of the pier)
export const VILLAGE_BOAT = { x: 102, y: 356 };
const INTERACT_DISTANCE = 18;

// Merchants of the town (see backend game/Regions.js)
const MERCHANTS = {
  merchant_tools: {
    name: "Ferreira Odete",
    sprite: "warriorF",
    sells: [
      ["machado", 8],
      ["picareta", 10],
      ["espada", 25],
      ["escudo de couro", 15],
    ],
    buys: [],
  },
  merchant_buyer: {
    name: "Comprador Tobias",
    sprite: "townfolkM",
    sells: [],
    buys: [
      ["minério de ferro", 4],
      ["carvão", 2],
      ["cristal", 15],
      ["lenha", 1],
      ["cogumelo", 2],
    ],
  },
  merchant_seeds: {
    name: "Dona Fia",
    sprite: "healerF",
    sells: [
      ["poção", 12],
      ["pão", 3],
      ["mel silvestre", 6],
    ],
    buys: [
      ["frutas silvestres", 2],
      ["flores", 1],
    ],
  },
};

const NODE_LABELS = {
  tree: "Cortar a árvore",
  ore: "Minerar a pedra",
  crystal: "Tirar o cristal",
  forage: "Colher",
};

/** Something drawn in a region, sorted by depth with the characters. */
class RegionProp extends GameObject {
  constructor(x, y, draw) {
    super({ position: new Vector2(x, y - 11) });
    this.anchor = { x, y };
    this.drawProp = draw;
  }

  drawImage(ctx) {
    this.drawProp(ctx, this.anchor.x, this.anchor.y);
  }
}

/** A merchant of the town: stands at their stall. */
class Merchant extends GameObject {
  constructor(x, y, { name, sprite }) {
    super({ position: new Vector2(x, y), width: 16, height: 12 });
    this.name = name;
    this.body = addCharacterSprites(this, resources.images[sprite]);
    this.nameTag = preRenderText({
      text: name,
      fontSize: 40,
      fontFamily: "Arial",
      fontColor: "black",
    });
  }

  step() {
    playMovementAnimation(this.body, DOWN, false);
  }

  drawImage(ctx, x, y) {
    const width = ctx.measureText(this.name).width;
    this.nameTag.drawImage(
      ctx,
      x - (width - this.width * 2) / 4,
      y - this.height,
    );
  }
}

/**
 * The regions reached by boat: travel, the maps, what can be done there
 * (cut trees, mine, forage, trade, fight the bandits' camp) and how they
 * change (felled trees become stumps until they grow back).
 */
export class Regions {
  constructor({ scene, hero, npcs, camera, menu, screen }) {
    this.scene = scene;
    this.hero = hero;
    this.npcs = npcs;
    this.camera = camera;
    this.menu = menu;
    this.current = null;
    this.lighting = new Lighting(screen);
    this.applied = new Set(); // Depleted nodes drawn as such
    this.time = 0;

    this.rooms = REGIONS.map((region) => {
      const tileMap = new TileMap(region.map);
      const map = new MapObject({
        resource: tileMap.background,
        foregroundResource: tileMap.foreground,
        width: region.width,
        height: region.height,
        position: new Vector2(region.origin.x, region.origin.y),
      });
      scene.addChild(map);
      return { region, tileMap, map };
    });

    this.addProps();

    this.travelScreen = document.createElement("div");
    this.travelScreen.className = "knockout-screen";
    document.getElementById("game-container")?.appendChild(this.travelScreen);

    gameSocket.on(protocol.INTERACT_RESULT, ({ data }) => {
      if (data.travel) this.arrive(data.travel);
    });
  }

  get isAway() {
    return Boolean(this.current);
  }

  points(region, kind) {
    return Object.entries(region.map.points)
      .filter(([, point]) => !kind || point.kind === kind)
      .map(([name]) => ({ name, ...interiorPoint(region, name) }));
  }

  addProps() {
    const add = (x, y, draw) => this.scene.addChild(new RegionProp(x, y, draw));

    for (const region of REGIONS) {
      for (const boat of this.points(region, "boat")) {
        add(boat.x, boat.y, (ctx, x, y) => sprites.boat(ctx, x, y, this.time));
      }
      for (const tent of this.points(region, "tent")) {
        add(tent.x, tent.y, (ctx, x, y) => sprites.tent(ctx, x, y));
      }
      for (const fire of this.points(region, "campfire")) {
        add(fire.x, fire.y, (ctx, x, y) =>
          sprites.campfire(ctx, x, y, this.time, this.camp.guarded),
        );
      }
      for (const stall of this.points(region, "stall")) {
        add(stall.x, stall.y, (ctx, x, y) =>
          sprites.stall(ctx, x, y, stall.name.length),
        );
      }
      for (const merchant of this.points(region, "merchant")) {
        this.scene.addChild(
          new Merchant(merchant.x, merchant.y, MERCHANTS[merchant.name]),
        );
      }
    }

    // The boat at the pier of the village
    add(VILLAGE_BOAT.x - 22, VILLAGE_BOAT.y + 26, (ctx, x, y) =>
      sprites.boat(ctx, x, y, this.time),
    );
  }

  get state() {
    return (
      worldState.state.regions ?? {
        depleted: [],
        camp: { bandits: [], guarded: true },
      }
    );
  }

  get camp() {
    return this.state.camp;
  }

  // ---------------------------------------------------------------------------
  // Travel

  /** At the pier of the village: where to go. */
  openTravelMenu() {
    this.menu.open("Viajar de barco (meia hora)", [
      ...REGIONS.map((region) => ({
        label: region.name,
        detail: {
          forest: "madeira, cogumelos e o acampamento dos bandidos",
          mine: "minério e cristais (precisa de picareta)",
          town: "ferramentas, sementes e compradores",
        }[region.id],
        run: () => this.travel(region.id),
      })),
    ]);
  }

  travel(destination) {
    this.travelScreen.textContent =
      destination === "village"
        ? "Voltando para a vila..."
        : "Viajando de barco...";
    this.travelScreen.classList.add("visible");
    sound.splash();
    gameSocket.send(protocol.INTERACT, {
      data: { objectId: `travel:${destination}` },
    });
  }

  /** The server says the boat arrived. */
  arrive(destination) {
    // Who was walking with the player waits for them
    for (const npc of this.npcs.values()) {
      if (npc.followTarget === this.hero || npc.guide) {
        npc.guide = null;
        npc.stopFollow();
        npc.sayLine("Te espero aqui!", { emotion: "happy" });
      }
    }

    setTimeout(() => {
      if (destination === "village") this.leave();
      else this.enter(REGIONS_BY_ID[destination]);
      this.travelScreen.classList.remove("visible");
    }, 900);
  }

  enter(region) {
    const arrival = interiorPoint(region, "arrival");
    this.current = region;
    this.placeHero(arrival.x, arrival.y);
    this.camera.setBounds({
      x: region.origin.x,
      y: region.origin.y,
      width: region.width,
      height: region.height,
    });
    this.hero.emitPosition();
    placeBanner.show(region.name);
    this.syncCampBandits();
  }

  /** Back to the village pier (or reset after being knocked out). */
  leave({ toPier = true } = {}) {
    this.current = null;
    this.syncCampBandits();
    this.camera.setBounds({
      x: 0,
      y: 0,
      width: VILLAGE_WIDTH,
      height: VILLAGE_HEIGHT,
    });

    if (toPier) {
      const pier = PLACES_BY_ID.dock;
      this.placeHero(pier.x, pier.y);
      this.hero.emitPosition();
      placeBanner.show("Píer");
    }
  }

  placeHero(x, y) {
    this.hero.position.x = Math.round(x);
    this.hero.position.y = Math.round(y);
  }

  // ---------------------------------------------------------------------------

  step(delta) {
    this.time += delta;
    this.applyDepleted();
    if (this.current?.id === "forest") this.syncCampBandits();
  }

  /** Felled trees become stumps, mined rocks become rubble (and back). */
  applyDepleted() {
    const depleted = new Set(this.state.depleted);

    for (const { region, tileMap } of this.rooms) {
      for (const [name, point] of Object.entries(region.map.points)) {
        if (!["tree", "ore", "crystal"].includes(point.kind)) continue;
        const key = `${region.id}:${name}`;
        const isDepleted = depleted.has(key);
        if (isDepleted === this.applied.has(key)) continue;

        if (isDepleted) this.applied.add(key);
        else this.applied.delete(key);
        this.setNodeTiles(region, tileMap, point, isDepleted);
      }
    }
  }

  setNodeTiles(region, tileMap, point, depleted) {
    const tileset = (name) =>
      region.map.tilesets.find((t) => t.name === name)?.firstgid ?? 0;
    const nature = tileset("nature");
    const column = Math.floor(point.x / 16);

    if (point.kind === "tree") {
      // Tall tree (2x4) with its trunk on the row of the point
      const row = Math.floor(point.y / 16);
      const original = (layer, c, r) =>
        region.map.layers.find((l) => l.name === layer).data[
          r * region.map.width + c
        ];
      for (let dx = 0; dx < 2; dx++) {
        const c = column + dx;
        tileMap.setTile(
          "Foreground",
          c,
          row - 3,
          depleted ? 0 : original("Foreground", c, row - 3),
        );
        tileMap.setTile(
          "Foreground",
          c,
          row - 2,
          depleted ? 0 : original("Foreground", c, row - 2),
        );
        tileMap.setTile(
          "Foreground",
          c,
          row - 1,
          depleted ? nature + 76 + dx : original("Foreground", c, row - 1),
        );
        tileMap.setTile(
          "Trees",
          c,
          row,
          depleted ? nature + 106 + dx : original("Trees", c, row),
        );
      }
      return;
    }

    // Rocks and crystals (2x2) end above the point
    const row = Math.floor((point.y - 4) / 16) - 2;
    const left = column - 1;
    const original = (c, r) =>
      region.map.layers.find((l) => l.name === "Objects").data[
        r * region.map.width + c
      ];
    const rubble = [188, 189, 218, 219];
    for (let i = 0; i < 4; i++) {
      const c = left + (i % 2);
      const r = row + Math.floor(i / 2);
      tileMap.setTile(
        "Objects",
        c,
        r,
        depleted
          ? point.kind === "ore"
            ? nature + rubble[i]
            : 0
          : original(c, r),
      );
    }
  }

  /** The bandits guarding their camp, while the player is in the forest. */
  syncCampBandits() {
    const forest = REGIONS_BY_ID.forest;
    const wanted =
      this.current?.id === "forest"
        ? new Set(this.camp.bandits ?? [])
        : new Set();

    for (const [id, npc] of this.npcs) {
      if (npc.data.camp && !wanted.has(id)) {
        const remove = () => {
          this.npcs.delete(id);
          npc.destroy();
        };
        if (npc.knockedOut && this.current) setTimeout(remove, 3000);
        else remove();
        npc.data.camp = false; // Removed once
      }
    }

    const camp = interiorPoint(forest, "camp");
    let i = 0;
    for (const id of wanted) {
      if (this.npcs.has(id)) continue;
      const npc = new Npc(id, camp.x + (i % 2) * 24, camp.y + i * 10, 16, 12, {
        name: i === 0 ? "Vigia dos bandidos" : "Bandido",
        sprite: i === 0 ? "rangerM" : "ninjaM",
        occupation: "bandit",
        personality: ["aggressive"],
        routine: [],
        bandit: true,
        camp: true,
      });
      this.scene.addChild(npc);
      this.npcs.set(id, npc);
      i++;
    }
  }

  // ---------------------------------------------------------------------------
  // Interactions (F)

  interactionAt(position) {
    const region = this.current;
    if (!region) return null;

    const feet = { x: position.x + 8, y: position.y + 10 };
    const near = ({ x, y }, distance = INTERACT_DISTANCE) =>
      Math.hypot(feet.x - x, feet.y - y) <= distance;
    const server = (objectId) => () =>
      gameSocket.send(protocol.INTERACT, { data: { objectId } });
    const depleted = new Set(this.state.depleted);

    const arrival = interiorPoint(region, "arrival");
    if (near({ x: arrival.x + 8, y: arrival.y + 10 }, 22)) {
      return {
        label: "Voltar de barco para a vila",
        run: () => this.travel("village"),
      };
    }

    for (const point of this.points(region)) {
      // Trees: by the trunk; merchants: where they stand
      const center =
        point.kind === "tree"
          ? { x: point.x + 16, y: point.y + 14 }
          : point.kind === "merchant"
            ? { x: point.x + 8, y: point.y + 10 }
            : point;

      if (!near(center, point.kind === "merchant" ? 24 : INTERACT_DISTANCE)) {
        continue;
      }

      if (NODE_LABELS[point.kind]) {
        return depleted.has(`${region.id}:${point.name}`)
          ? {
              label: point.kind === "tree" ? "Toco de árvore" : "Esgotado",
              run: server(point.name),
            }
          : { label: NODE_LABELS[point.kind], run: server(point.name) };
      }

      if (point.kind === "camp_chest") {
        return { label: "Abrir o baú dos bandidos", run: server("camp_chest") };
      }

      if (point.kind === "merchant") {
        return {
          label: `Negociar com ${MERCHANTS[point.name].name}`,
          run: () => this.openTrade(point.name),
        };
      }
    }

    return null;
  }

  openTrade(merchantId) {
    const merchant = MERCHANTS[merchantId];
    const send = (mode, index) => () =>
      gameSocket.send(protocol.INTERACT, {
        data: { objectId: `trade:${merchantId}:${mode}:${index}` },
      });

    this.menu.open(merchant.name, [
      ...merchant.sells.map(([item, price], i) => ({
        label: `Comprar ${item}`,
        detail: `${price} moedas`,
        run: send("buy", i),
        keepOpen: true,
      })),
      ...merchant.buys.map(([item, price], i) => ({
        label: `Vender todo(a) ${item}`,
        detail: `${price} moedas cada`,
        run: send("sell", i),
        keepOpen: true,
      })),
    ]);
  }

  // ---------------------------------------------------------------------------
  // Drawing

  drawForeground(ctx) {
    for (const { map, region } of this.rooms) {
      map.foreground.draw(ctx, region.origin.x, region.origin.y);
    }
  }

  /** Night (or the dark of the mine) with the light of the player. */
  drawLighting(ctx, outside) {
    const region = this.current;
    const hero = { x: this.hero.position.x + 8, y: this.hero.position.y + 4 };
    const lights = [];

    if (region.dark || outside.alpha > 0.3) {
      lights.push({
        ...hero,
        radius: region.dark ? 44 : 30,
        strength: 0.85,
        color: [255, 200, 130],
      });
    }

    for (const point of this.points(region)) {
      if (point.kind === "light") {
        lights.push({
          x: point.x,
          y: point.y,
          radius: 50,
          strength: 0.9,
          color: [255, 150, 60],
        });
      } else if (point.kind === "crystal") {
        lights.push({
          x: point.x,
          y: point.y - 10,
          radius: 22,
          strength: 0.6,
          color: [190, 150, 255],
        });
      } else if (
        point.kind === "campfire" &&
        this.camp.guarded &&
        lampsLit(outside.alpha)
      ) {
        lights.push({
          x: point.x,
          y: point.y - 4,
          radius: 48,
          strength: 1,
          color: [255, 150, 60],
        });
      }
    }

    this.lighting.draw(ctx, {
      camera: this.camera.position,
      darkness: region.dark ? { color: [8, 6, 14], alpha: 0.62 } : outside,
      lights,
    });
  }
}
