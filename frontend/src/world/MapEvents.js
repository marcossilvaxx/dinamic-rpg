// What the events of the map look like in the village (see backend
// game/MapEvents.js): the tree a storm knocked down on a road, the pier
// under the high tide and the smoke of the forest on fire across the water.
// The villagers nearby comment when something starts.

import { GameObject } from "../GameObject";
import { VILLAGE_WIDTH } from "../levels/world";
import { worldState } from "../state/worldState";
import { Vector2 } from "../utils/Vector2";
import { fallenTreeSpots } from "./island/eventSpots";
import * as sprites from "./sprites";

const TILE = 12;
const FEET = 11;
const COMMENT_DISTANCE = 170;

const COMMENTS = {
  fallenTree: [
    "Viu a árvore que caiu na estrada?",
    "Que tempestade! Derrubou uma árvore inteira.",
    "Alguém com um machado precisa tirar aquela árvore dali.",
  ],
  tide: [
    "A maré subiu demais, o píer sumiu!",
    "Hoje o barco não sai, olha essa água.",
    "Nunca vi o mar tão alto.",
  ],
  fire: [
    "Olha a fumaça! A floresta está pegando fogo!",
    "Fogo na Floresta Sombria... que tristeza.",
    "Com esse calor, era questão de tempo.",
  ],
};

/** Something drawn with the characters (sorted by its base, `y`). */
class EventProp extends GameObject {
  constructor(x, y, draw) {
    super({ position: new Vector2(x, y - FEET) });
    this.anchor = { x, y };
    this.drawProp = draw;
  }

  drawImage(ctx) {
    this.drawProp(ctx, this.anchor.x, this.anchor.y);
  }
}

export class MapEvents {
  /**
   * @param {object} options
   * @param {import("../GameObject").GameObject} options.scene
   * @param {object} options.island Layout of the island.
   * @param {import("../objects/Hero").Hero} options.hero
   * @param {Map<number, import("../objects/Npc").Npc>} options.npcs
   */
  constructor({ scene, island, hero, npcs }) {
    this.scene = scene;
    this.hero = hero;
    this.npcs = npcs;
    this.spots = fallenTreeSpots(island);
    this.pier = island.pier;
    this.time = 0;
    this.seen = null; // Ids of the events already shown
    this.fallen = null; // { id, spot, prop }
    this.tideProp = null;
  }

  get state() {
    return worldState.state.events ?? {};
  }

  /** Where the fallen tree is (world pixels), or null. */
  get fallenTreeSpot() {
    return this.fallen?.spot ?? null;
  }

  step(delta) {
    this.time += delta;
    const { fallenTree, tide, fire } = this.state;

    // The fallen tree
    if ((fallenTree?.id ?? null) !== (this.fallen?.id ?? null)) {
      this.fallen?.prop.destroy();
      this.fallen = null;
      if (fallenTree && this.spots.length) {
        const spot = this.spots[fallenTree.spot % this.spots.length];
        const prop = new EventProp(spot.x, spot.y, (ctx, x, y) =>
          sprites.fallenTree(ctx, x, y),
        );
        this.scene.addChild(prop);
        this.fallen = { id: fallenTree.id, spot, prop };
      }
    }

    // Water over the pier
    if (Boolean(tide) !== Boolean(this.tideProp)) {
      this.tideProp?.destroy();
      this.tideProp = null;
      if (tide) {
        const area = this.pierArea();
        this.tideProp = new EventProp(area.x, area.y + 2, (ctx) =>
          this.drawTide(ctx, area),
        );
        this.scene.addChild(this.tideProp);
      }
    }

    // The villagers nearby comment what just started (not what was going
    // on when the game was loaded)
    const ids = {
      fallenTree: fallenTree?.id ?? null,
      tide: tide?.id ?? null,
      fire: fire?.burning ? fire.id : null,
    };
    if (this.seen) {
      for (const [kind, id] of Object.entries(ids)) {
        if (id !== null && id !== this.seen[kind]) this.comment(kind);
      }
    }
    if (worldState.state.events) this.seen = ids;
  }

  comment(kind) {
    const lines = COMMENTS[kind];
    const nearby = [...this.npcs.values()]
      .filter(
        (npc) =>
          !npc.isInTown &&
          npc.position.x < VILLAGE_WIDTH &&
          npc.isAvailableForConversation?.() !== false &&
          Math.hypot(
            npc.position.x - this.hero.position.x,
            npc.position.y - this.hero.position.y,
          ) < COMMENT_DISTANCE,
      )
      .slice(0, 2);
    nearby.forEach((npc, i) =>
      setTimeout(
        () =>
          npc.sayLine(lines[(npc.id + i) % lines.length], {
            emotion: kind === "fallenTree" ? "surprised" : "sad",
          }),
        400 + i * 1600,
      ),
    );
  }

  pierArea() {
    const xs = this.pier.tiles.map(([c]) => c);
    const ys = this.pier.tiles.map(([, r]) => r);
    const x = Math.min(...xs) * TILE;
    const y = Math.min(...ys) * TILE;
    return {
      x,
      y,
      width: (Math.max(...xs) + 1) * TILE - x,
      height: (Math.max(...ys) + 1) * TILE - y,
    };
  }

  /** The pier under the water, with foam coming and going. */
  drawTide(ctx, { x, y, width, height }) {
    ctx.save();
    ctx.fillStyle = "rgba(103, 230, 210, 0.78)";
    ctx.fillRect(x - 2, y - 2, width + 4, height + 4);
    ctx.fillStyle = "rgba(191, 252, 243, 0.9)";
    for (let row = 0; row < height; row += 5) {
      const offset = Math.round(Math.sin(this.time / 500 + row) * 4);
      for (let px = 0; px < width; px += 9) {
        ctx.fillRect(x + px + offset + (row % 2) * 4, y + row, 4, 1);
      }
    }
    ctx.restore();
  }

  /** The player is close to the fallen tree: they can cut it. */
  interactionAt(feet, server) {
    const spot = this.fallenTreeSpot;
    if (!spot || Math.hypot(feet.x - spot.x, feet.y - spot.y) > 30) {
      return null;
    }
    return {
      label: "Cortar a árvore caída",
      run: server("fallen_tree"),
    };
  }

  /** Over everything: the smoke of the forest fire, over the sea. */
  drawTop(ctx) {
    if (!this.state.fire?.burning) return;
    const base = { x: VILLAGE_WIDTH - 30, y: 26 };
    for (let i = 0; i < 14; i++) {
      const life = (((this.time / 2600 + i / 14) % 1) + 1) % 1;
      const size = 6 + life * 20;
      ctx.fillStyle = `rgba(70, 64, 66, ${0.4 * (1 - life)})`;
      ctx.beginPath();
      ctx.arc(
        base.x - life * 40 + Math.sin(i * 1.7 + this.time / 900) * 6,
        base.y - life * 60 + 30,
        size,
        0,
        Math.PI * 2,
      );
      ctx.fill();
    }
    sprites.flames(ctx, base.x, base.y + 34, this.time, 0.8);
  }
}
