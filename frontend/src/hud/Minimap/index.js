import { PLACES } from "../../levels/places";
import { resources } from "../../Resource";
import { worldState } from "../../state/worldState";

const SCALE = 1 / 4;
const REDRAW_MS = 200;

/**
 * Small map in the bottom left corner with the places, the villagers and the
 * player (N shows / hides it).
 */
export class Minimap {
  /**
   * @param {object} options
   * @param {number} options.mapWidth In pixels of the world.
   * @param {number} options.mapHeight
   * @param {() => {x: number, y: number}} options.getPlayer
   * @param {() => import("../../objects/Npc").Npc[]} options.getNpcs
   */
  constructor({
    mapWidth,
    mapHeight,
    getPlayer,
    getNpcs,
    root = "game-container",
  }) {
    this.getPlayer = getPlayer;
    this.getNpcs = getNpcs;
    this.visible = true;
    this.timeSinceDraw = Infinity;

    this.canvas = document.createElement("canvas");
    this.canvas.className = "minimap";
    this.canvas.width = mapWidth * SCALE;
    this.canvas.height = mapHeight * SCALE;
    this.ctx = this.canvas.getContext("2d");
    document.getElementById(root).appendChild(this.canvas);
  }

  toggle() {
    this.visible = !this.visible;
  }

  /** @param {boolean} hidden Hide it for now (e.g. while chatting). */
  update(delta, hidden = false) {
    this.canvas.style.display = this.visible && !hidden ? "block" : "none";
    this.timeSinceDraw += delta;

    if (
      this.canvas.style.display === "none" ||
      this.timeSinceDraw < REDRAW_MS
    ) {
      return;
    }

    this.timeSinceDraw = 0;
    this.draw();
  }

  dot(x, y, radius, fill, stroke = "#000") {
    const { ctx } = this;
    ctx.beginPath();
    ctx.arc(x * SCALE, y * SCALE, radius, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  draw() {
    const { ctx, canvas } = this;
    const map = resources.images.map;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (map.isLoaded) {
      ctx.globalAlpha = 0.85;
      ctx.drawImage(map.image, 0, 0, canvas.width, canvas.height);
      ctx.globalAlpha = 1;
    }

    const festivalPlace =
      worldState.festival?.status !== "over"
        ? worldState.festival?.placeId
        : null;

    ctx.font = "bold 8px Arial";
    ctx.textAlign = "center";
    PLACES.forEach(({ id, name, x, y }) => {
      const isFestival = id === festivalPlace;
      ctx.fillStyle = isFestival ? "#ffca28" : "rgba(255, 255, 255, 0.9)";
      ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
      ctx.lineWidth = 2;
      const label = isFestival ? `★ ${name}` : name;
      ctx.strokeText(label, x * SCALE, y * SCALE - 4);
      ctx.fillText(label, x * SCALE, y * SCALE - 4);
    });
    ctx.textAlign = "start";

    this.getNpcs().forEach((npc) => {
      const { x, y } = npc.position;
      if (npc.isSeekingPlayer) {
        this.dot(x, y, 4, "#e53935", "#fff");
      } else {
        this.dot(
          x,
          y,
          2.5,
          npc.isSleeping ? "#78909c" : npc.data.visitor ? "#ab47bc" : "#ffa726",
        );
      }
    });

    const player = this.getPlayer();
    this.dot(player.x, player.y, 3.5, "#fff");
  }
}
