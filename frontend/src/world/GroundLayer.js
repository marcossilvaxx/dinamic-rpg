import { GameObject } from "../GameObject";
import { FARM_PLOTS, FISH_SPOTS } from "../levels/decor";
import { VILLAGE } from "../levels/world";
import { GRASS_PIXEL, seededRandom } from "./terrain";
import { cropLook } from "./rules";

const SEASONS = ["spring", "summer", "autumn", "winter"];
const SEASON_LAYERS = {
  spring: "springGround",
  summer: "summerGround",
  autumn: "autumnGround",
  winter: "winterGround",
};

/**
 * Everything drawn on the ground, under the characters: colors of the
 * season, snow, mud and puddles, the foam of the coast, the farm field and
 * footprints. Child of the map, right after its image.
 */
export class GroundLayer extends GameObject {
  /** @param {import("./Village").Village} village */
  constructor(village) {
    super({});
    this.village = village;
    this.wearCanvas = null;
    this.wearKey = "";
  }

  /** Dirt where the grass is worn (redrawn when the server changes it). */
  wearLayer() {
    const { terrain, terrainState } = this.village;
    const key = JSON.stringify(terrainState.wear);

    if (key === this.wearKey && this.wearCanvas) return this.wearCanvas;

    this.wearKey = key;
    this.wearCanvas ??= document.createElement("canvas");
    this.wearCanvas.width = terrain.width;
    this.wearCanvas.height = terrain.height;
    const ctx = this.wearCanvas.getContext("2d");
    const colors = ["#b98e5c", "#a87d50", "#c9a070"];

    for (const [index, wear] of terrainState.wear) {
      const x0 = (index % VILLAGE.width) * 12;
      const y0 = Math.floor(index / VILLAGE.width) * 12;
      const random = seededRandom(index + 1);
      const coverage = Math.min(1, wear / 70);

      for (let y = y0; y < y0 + 12; y++) {
        for (let x = x0; x < x0 + 12; x++) {
          if (terrain.classAt(x, y) !== GRASS_PIXEL) continue;
          // Ragged edges: the middle of the tile wears out first
          const edge =
            Math.max(Math.abs(x - x0 - 5.5), Math.abs(y - y0 - 5.5)) / 6;
          if (random() > coverage * (1.2 - edge * 0.6)) continue;
          ctx.globalAlpha = 0.55 + 0.35 * coverage;
          ctx.fillStyle = colors[Math.floor(random() * colors.length)];
          ctx.fillRect(x, y, 1, 1);
        }
      }
    }

    return this.wearCanvas;
  }

  drawImage(ctx) {
    const { village } = this;
    const { terrain } = village;

    if (!terrain) return;

    const { layers } = terrain;
    const draw = (canvas, alpha) => {
      if (alpha <= 0.01) return;
      ctx.globalAlpha = Math.min(1, alpha);
      ctx.drawImage(canvas, 0, 0);
    };

    ctx.save();
    for (const season of SEASONS) {
      draw(layers[SEASON_LAYERS[season]], village.seasonWeights[season]);
    }
    ctx.globalAlpha = 1;
    if (village.terrainState.wear.length) ctx.drawImage(this.wearLayer(), 0, 0);
    this.drawFarm(ctx);
    draw(layers.mud, village.ground.wet * 0.55);
    draw(layers.snowGround, village.ground.snow);
    ctx.globalAlpha = 1;
    this.drawWater(ctx);
    this.drawPuddles(ctx);
    this.drawFootprints(ctx);
    ctx.restore();
  }

  drawWater(ctx) {
    const { village } = this;
    const { layers, sparkles } = village.terrain;
    const t = village.time;

    // Waves: the two bands of foam come and go
    ctx.globalAlpha = 0.35 + 0.35 * Math.sin(t / 900);
    ctx.drawImage(layers.foamNear, 0, 0);
    ctx.globalAlpha = 0.25 + 0.25 * Math.sin(t / 900 - 1.8);
    ctx.drawImage(layers.foamFar, 0, 0);
    ctx.globalAlpha = 1;

    // Sun on the water (less with clouds, none at night)
    const sun = village.isDay && village.weather === "clear" ? 1 : 0.3;
    ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
    for (const sparkle of sparkles) {
      const shine = Math.sin((t / 1000) * sparkle.speed + sparkle.phase);
      if (shine > 1 - 0.12 * sun) {
        ctx.fillRect(sparkle.x, sparkle.y, sparkle.long ? 2 : 1, 1);
      }
    }

    // Ripples where the fish are
    ctx.strokeStyle = "rgba(255, 255, 255, 0.45)";
    ctx.lineWidth = 1;
    FISH_SPOTS.forEach(({ x, y }, i) => {
      const phase = (((t / 1800 + i * 0.37) % 1) + 1) % 1;
      ctx.globalAlpha = 1 - phase;
      ctx.beginPath();
      ctx.ellipse(x, y, 2 + phase * 7, 1 + phase * 3, 0, 0, Math.PI * 2);
      ctx.stroke();
    });
    ctx.globalAlpha = 1;
  }

  drawPuddles(ctx) {
    const { village } = this;
    const { wet, snow } = village.ground;

    if (wet < 0.25 || snow > 0.5) return;

    const raining = village.weather === "rain" || village.weather === "storm";
    const t = village.time;

    for (const puddle of village.terrain.puddles) {
      // Puddles appear one by one as the ground gets wetter
      const amount = (wet - 0.25 - puddle.threshold * 0.5) * 3;
      if (amount <= 0) continue;
      const size = puddle.size * Math.min(1, amount);
      ctx.fillStyle = "rgba(90, 120, 150, 0.55)";
      ctx.beginPath();
      ctx.ellipse(
        puddle.x,
        puddle.y,
        size * 1.8,
        size * 0.8,
        0,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      ctx.fillStyle = "rgba(200, 225, 245, 0.5)";
      ctx.fillRect(Math.round(puddle.x - size), Math.round(puddle.y - 1), 2, 1);

      if (raining) {
        const phase = (t / 700 + puddle.threshold) % 1;
        ctx.strokeStyle = `rgba(220, 235, 250, ${0.7 * (1 - phase)})`;
        ctx.beginPath();
        ctx.ellipse(
          puddle.x + (puddle.threshold - 0.5) * size,
          puddle.y,
          phase * size,
          phase * size * 0.45,
          0,
          0,
          Math.PI * 2,
        );
        ctx.stroke();
      }
    }
  }

  drawFarm(ctx) {
    const { farm } = this.village;

    for (const plot of FARM_PLOTS.slice(0, farm?.plots ?? 6)) {
      const { x, y, width, height, index } = plot;
      // Tilled soil
      ctx.fillStyle = "#7a5233";
      ctx.fillRect(x, y, width, height);
      ctx.fillStyle = "#5e3d26";
      for (let row = 2; row < height; row += 4) {
        ctx.fillRect(x + 1, y + row, width - 2, 1);
      }

      if (!farm?.crop || farm.harvested?.[index]) continue;

      const look = cropLook(farm.crop, farm.stage);
      for (let column = 3; column < width - 1; column += 5) {
        for (let row = 4; row < height; row += 4) {
          const px = x + column;
          const py = y + row;
          ctx.fillStyle = look.leaf;
          ctx.fillRect(px, py - look.height, 1, look.height);
          if (look.height > 2) ctx.fillRect(px - 1, py - look.height + 1, 3, 1);
          if (look.fruit) {
            ctx.fillStyle = look.fruit;
            if (farm.crop === "trigo") {
              ctx.fillRect(px - 1, py - look.height - 1, 3, 2);
            } else if (farm.crop === "abóbora") {
              ctx.fillRect(px - 1, py - 2, 4, 3);
            } else {
              ctx.fillRect(px, py - 1, 2, 2);
            }
          }
        }
      }
    }
  }

  drawFootprints(ctx) {
    const { footprints, tracks } = this.village;

    for (const print of footprints) {
      ctx.fillStyle =
        print.kind === "snow"
          ? `rgba(150, 165, 190, ${print.alpha})`
          : `rgba(90, 60, 40, ${print.alpha})`;
      ctx.fillRect(Math.round(print.x), Math.round(print.y), 2, 1);
    }

    // Footprints of the mystery: boots from one place to another
    if (tracks?.points) {
      ctx.fillStyle = tracks.inspected
        ? "rgba(80, 50, 30, 0.3)"
        : "rgba(70, 40, 25, 0.5)";
      tracks.points.forEach(({ x, y }, i) => {
        const side = i % 2 ? 1 : -2;
        ctx.fillRect(Math.round(x + side), Math.round(y), 1, 2);
      });
    }
  }
}
