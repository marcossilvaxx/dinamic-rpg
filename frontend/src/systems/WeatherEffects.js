import { sound } from "../audio/sound";

const randomBetween = (min, max) => min + Math.random() * (max - min);

// How each weather looks: darkening of the screen, rain drops and fog
const LOOKS = {
  clear: { shade: 0, drops: 0, fog: 0 },
  cloudy: { shade: 0.12, drops: 0, fog: 0 },
  rain: { shade: 0.2, drops: 140, fog: 0 },
  storm: { shade: 0.32, drops: 260, fog: 0 },
  fog: { shade: 0.05, drops: 0, fog: 0.45 },
  snow: { shade: 0.1, drops: 0, flakes: 180, fog: 0.08 },
};

// Color over the map in each season (winter is pale and cold, autumn warm)
const SEASON_TINTS = {
  spring: null,
  summer: "rgba(255, 220, 120, 0.05)",
  autumn: "rgba(255, 140, 40, 0.08)",
  winter: "rgba(225, 238, 255, 0.18)",
};

// Weather changes fade in and out (per ms)
const FADE_SPEED = 1 / 4000;

/**
 * Draws the weather over the map, in screen coordinates: rain, fog, the
 * darker sky of cloudy days and the lightning of storms (with thunder).
 */
export class WeatherEffects {
  constructor({ width, height }) {
    this.width = width;
    this.height = height;
    this.weather = "clear";
    this.shade = 0;
    this.fog = 0;
    this.drops = [];
    this.flakes = [];
    this.season = "spring";
    this.fogPatches = Array.from({ length: 7 }, () => ({
      x: Math.random() * width,
      y: Math.random() * height,
      radius: randomBetween(120, 260),
      speed: randomBetween(0.005, 0.015),
    }));
    this.flash = 0;
    this.timeToLightning = randomBetween(4000, 9000);
  }

  setWeather(weather) {
    this.weather = LOOKS[weather] ? weather : "clear";
  }

  setSeason(season) {
    this.season = SEASON_TINTS[season] !== undefined ? season : "spring";
  }

  newFlake(anywhere = false) {
    return {
      x: Math.random() * this.width,
      y: anywhere ? Math.random() * this.height : -5,
      speed: randomBetween(0.03, 0.08),
      size: randomBetween(1, 2.5),
      phase: Math.random() * Math.PI * 2,
    };
  }

  newDrop(anywhere = false) {
    return {
      x: Math.random() * (this.width + 100),
      y: anywhere ? Math.random() * this.height : -20,
      speed: randomBetween(0.6, 1.0),
      length: randomBetween(10, 18),
    };
  }

  step(delta) {
    const look = LOOKS[this.weather];
    const approach = (value, target) =>
      value +
      Math.sign(target - value) *
        Math.min(Math.abs(target - value), FADE_SPEED * delta);

    this.shade = approach(this.shade, look.shade);
    this.fog = approach(this.fog, look.fog);

    // Drops are added and removed little by little
    if (this.drops.length < look.drops) {
      this.drops.push(this.newDrop(true));
    } else if (this.drops.length > look.drops) {
      this.drops.pop();
    }

    const flakes = look.flakes ?? 0;
    if (this.flakes.length < flakes) {
      this.flakes.push(this.newFlake(true));
    } else if (this.flakes.length > flakes) {
      this.flakes.pop();
    }

    this.flakes.forEach((flake, i) => {
      flake.y += flake.speed * delta;
      flake.phase += delta / 600;
      flake.x += Math.sin(flake.phase) * 0.3;

      if (flake.y > this.height) {
        this.flakes[i] = this.newFlake();
      }
    });

    this.drops.forEach((drop, i) => {
      drop.y += drop.speed * delta;
      drop.x -= drop.speed * delta * 0.25;

      if (drop.y > this.height || drop.x < -20) {
        this.drops[i] = this.newDrop();
      }
    });

    this.fogPatches.forEach((patch) => {
      patch.x = (patch.x + patch.speed * delta) % (this.width + patch.radius);
    });

    this.flash = Math.max(0, this.flash - delta / 400);

    if (this.weather === "storm") {
      this.timeToLightning -= delta;

      if (this.timeToLightning <= 0) {
        this.timeToLightning = randomBetween(6000, 15000);
        this.flash = 1;
        sound.thunder(randomBetween(0.3, 1.2));
      }
    }
  }

  draw(ctx) {
    const tint = SEASON_TINTS[this.season];
    if (tint) {
      ctx.fillStyle = tint;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    if (this.shade > 0) {
      ctx.fillStyle = `rgba(40, 50, 70, ${this.shade})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    if (this.fog > 0) {
      this.fogPatches.forEach(({ x, y, radius }) => {
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
        gradient.addColorStop(0, `rgba(225, 230, 235, ${this.fog})`);
        gradient.addColorStop(1, "rgba(225, 230, 235, 0)");
        ctx.fillStyle = gradient;
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      });
      ctx.fillStyle = `rgba(225, 230, 235, ${this.fog * 0.4})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }

    if (this.drops.length) {
      ctx.strokeStyle = "rgba(190, 210, 235, 0.55)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      this.drops.forEach(({ x, y, length }) => {
        ctx.moveTo(x, y);
        ctx.lineTo(x - length * 0.25, y + length);
      });
      ctx.stroke();
    }

    if (this.flakes.length) {
      ctx.fillStyle = "rgba(255, 255, 255, 0.85)";
      this.flakes.forEach(({ x, y, size }) => {
        ctx.fillRect(x, y, size, size);
      });
    }

    if (this.flash > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${this.flash * 0.6})`;
      ctx.fillRect(0, 0, this.width, this.height);
    }
  }
}
