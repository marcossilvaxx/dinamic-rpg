import { SCALE } from "../config/constants";

/**
 * Darkness of the night with holes where there is light (windows, lamps,
 * fires, the lantern of the player...) and a warm glow around the lights.
 * Drawn in screen coordinates, after the scene.
 */
export class Lighting {
  constructor({ width, height }) {
    this.width = width;
    this.height = height;
    this.canvas = document.createElement("canvas");
    this.canvas.width = width;
    this.canvas.height = height;
    this.ctx = this.canvas.getContext("2d");
  }

  /**
   * @param {CanvasRenderingContext2D} ctx
   * @param {object} options
   * @param {{x: number, y: number}} options.camera Translation of the scene.
   * @param {{color: number[], alpha: number}} options.darkness
   * @param {{x: number, y: number, radius: number, strength?: number,
   *   color?: number[], core?: boolean}[]} options.lights In map pixels.
   */
  draw(ctx, { camera, darkness, lights }) {
    const { alpha, color } = darkness;

    if (alpha <= 0.01) return;

    const visible = lights
      .map((light) => ({
        ...light,
        sx: camera.x + light.x * SCALE,
        sy: camera.y + light.y * SCALE,
        r: light.radius * SCALE,
      }))
      .filter(
        ({ sx, sy, r }) =>
          sx + r > 0 &&
          sy + r > 0 &&
          sx - r < this.width &&
          sy - r < this.height,
      );

    const dark = this.ctx;
    dark.globalCompositeOperation = "source-over";
    dark.clearRect(0, 0, this.width, this.height);
    dark.fillStyle = `rgba(${color.join(", ")}, ${alpha})`;
    dark.fillRect(0, 0, this.width, this.height);

    // Lights remove the darkness around them
    dark.globalCompositeOperation = "destination-out";
    for (const { sx, sy, r, strength = 1 } of visible) {
      const gradient = dark.createRadialGradient(sx, sy, 0, sx, sy, r);
      gradient.addColorStop(0, `rgba(0, 0, 0, ${strength})`);
      gradient.addColorStop(0.45, `rgba(0, 0, 0, ${strength * 0.7})`);
      gradient.addColorStop(1, "rgba(0, 0, 0, 0)");
      dark.fillStyle = gradient;
      dark.fillRect(sx - r, sy - r, r * 2, r * 2);
    }

    ctx.drawImage(this.canvas, 0, 0);

    // Warm glow (stronger the darker it is)
    ctx.save();
    ctx.globalCompositeOperation = "lighter";
    for (const {
      sx,
      sy,
      r,
      strength = 1,
      color: lightColor = [255, 170, 80],
      core,
    } of visible) {
      const glow = ctx.createRadialGradient(sx, sy, 0, sx, sy, r * 0.8);
      glow.addColorStop(
        0,
        `rgba(${lightColor.join(", ")}, ${0.32 * alpha * strength})`,
      );
      glow.addColorStop(1, `rgba(${lightColor.join(", ")}, 0)`);
      ctx.fillStyle = glow;
      ctx.fillRect(sx - r, sy - r, r * 2, r * 2);

      if (core) {
        ctx.fillStyle = `rgba(${lightColor.join(", ")}, ${strength})`;
        ctx.fillRect(sx - SCALE / 2, sy - SCALE / 2, SCALE, SCALE);
      }
    }
    ctx.restore();
  }
}
