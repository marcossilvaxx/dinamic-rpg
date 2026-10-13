import { sound } from "../audio/sound";
import { GameObject } from "../GameObject";
import {
  BUILDINGS,
  BUSHES,
  CAMPFIRE,
  CHICKEN_YARDS,
  FISH_SPOTS,
} from "../levels/decor";
import { Vector2 } from "../utils/Vector2";
import {
  birdsLand,
  butterflyTime,
  campfireLit,
  chickensRest,
  fireflyTime,
  smokeRate,
  windOf,
} from "./rules";
import * as sprites from "./sprites";

const randomBetween = (min, max) => min + Math.random() * (max - min);
const FEET = 11;

// Where the cat lives (in front of the tavern) and the crowns of the trees
// of the garden (falling leaves)
const CAT_HOME = { x: 548, y: 172 };
const TREE_CROWNS = [
  { x: 396, y: 206 },
  { x: 468, y: 206 },
];
// Where the fireflies fly at night
const FIREFLY_AREAS = [
  { x: 432, y: 240 },
  { x: 330, y: 96 },
  { x: 740, y: 170 },
  { x: 230, y: 300 },
];
const BUTTERFLY_COLORS = ["#ffffff", "#f2d064", "#ff9ec4", "#9fc4ff"];
const SCARE_DISTANCE = 30;

/** An animal walking on the ground, sorted by depth with the characters. */
class Critter extends GameObject {
  constructor({ kind, x, y, home, radius, draw }) {
    super({ position: new Vector2(x, y - FEET) });
    this.kind = kind;
    this.x = x;
    this.y = y;
    this.home = home;
    this.radius = radius;
    this.drawCritter = draw;
    this.target = null;
    this.speed = 0.012;
    this.idle = randomBetween(500, 3000);
    this.left = Math.random() < 0.5;
    this.frame = 0;
    this.frameTime = 0;
    this.state = "walk";
    this.age = 0;
  }

  drawImage(ctx) {
    this.drawCritter(ctx, this);
  }

  /** @returns {boolean} Whether it reached the target (or got stuck). */
  moveTowards(delta, collision) {
    if (!this.target) return true;

    const dx = this.target.x - this.x;
    const dy = this.target.y - this.y;
    const distance = Math.hypot(dx, dy);
    const step = Math.min(distance, this.speed * delta);

    if (distance < 1) {
      this.target = null;
      return true;
    }

    const nx = this.x + (dx / distance) * step;
    const ny = this.y + (dy / distance) * step;

    if (collision.isBlocked(nx - 3, ny - 3, 6, 3)) {
      this.target = null;
      return true;
    }

    this.left = dx < 0;
    this.x = nx;
    this.y = ny;
    this.position.x = nx;
    this.position.y = ny - FEET;
    this.frameTime += delta;
    if (this.frameTime > 160) {
      this.frameTime = 0;
      this.frame++;
    }
    return false;
  }

  /** A random free spot around its home. */
  pickTarget(collision, radius = this.radius) {
    for (let attempt = 0; attempt < 6; attempt++) {
      const angle = Math.random() * Math.PI * 2;
      const distance = Math.random() * radius;
      const x = this.home.x + Math.cos(angle) * distance;
      const y = this.home.y + Math.sin(angle) * distance * 0.7;
      if (!collision.isBlocked(x - 3, y - 3, 6, 3)) return { x, y };
    }
    return null;
  }
}

/**
 * Life around the village: chickens, a cat, birds that land and fly away,
 * seagulls, butterflies, fireflies, fish jumping, smoke from the chimneys
 * and leaves falling in the autumn.
 */
export class Ambient {
  /**
   * @param {object} options
   * @param {GameObject} options.scene
   * @param {import("./Village").Village} options.village
   */
  constructor({ scene, village }) {
    this.scene = scene;
    this.village = village;
    this.critters = [];
    this.flock = [];
    this.timeToFlock = randomBetween(8000, 20000);
    this.sky = []; // Flying birds and seagulls: { x, y, vx, vy, frame, color }
    this.timeToGull = randomBetween(6000, 15000);
    this.smoke = [];
    this.smokeDebt = new Map();
    this.butterflies = [];
    this.fireflies = [];
    this.leaves = [];
    this.fish = null;
    this.timeToFish = randomBetween(4000, 9000);
    this.lastCluck = 0;

    for (const yard of CHICKEN_YARDS) {
      for (let i = 0; i < yard.count; i++) {
        this.addCritter({
          kind: "chicken",
          x: yard.x + randomBetween(-10, 10),
          y: yard.y + randomBetween(-6, 6),
          home: yard,
          radius: 26,
          draw: (ctx, c) =>
            sprites.chicken(ctx, c.x, c.y, {
              frame: c.frame,
              left: c.left,
              sitting: c.state === "sit",
            }),
        });
      }
    }

    this.cat = this.addCritter({
      kind: "cat",
      x: CAT_HOME.x,
      y: CAT_HOME.y,
      home: CAT_HOME,
      radius: 70,
      draw: (ctx, c) =>
        sprites.cat(ctx, c.x, c.y, {
          frame: c.frame,
          left: c.left,
          state: c.state,
        }),
    });
    this.cat.speed = 0.018;
    this.cat.followTime = 0;
  }

  addCritter(options) {
    const critter = new Critter(options);
    this.scene.addChild(critter);
    this.critters.push(critter);
    return critter;
  }

  removeCritter(critter) {
    critter.removed = true;
    this.critters = this.critters.filter((other) => other !== critter);
    critter.destroy();
  }

  /** Feet of the player and of the NPCs. */
  people() {
    const { hero, npcs } = this.village;
    return [hero, ...npcs.values()].map(({ position }) => ({
      x: position.x + 8,
      y: position.y + 10,
    }));
  }

  step(delta) {
    const v = this.village;
    const people = this.people();
    const heroFeet = people[0];

    for (const critter of this.critters) {
      if (critter.removed) continue;
      critter.age += delta;
      if (critter.kind === "chicken")
        this.stepChicken(critter, delta, heroFeet);
      else if (critter.kind === "cat") this.stepCat(critter, delta, heroFeet);
      else if (critter.kind === "bird") this.stepBird(critter, delta, people);
    }

    this.stepFlock(delta, heroFeet);
    this.stepSky(delta);
    this.stepSmoke(delta);
    this.stepButterflies(delta);
    this.stepFireflies(delta);
    this.stepLeaves(delta);
    this.stepFish(delta, heroFeet);

    if (v.weather === "storm")
      this.timeToFlock = Math.max(this.timeToFlock, 5000);
  }

  stepChicken(chicken, delta, hero) {
    const { collision, hour, weather } = this.village;
    const distance = Math.hypot(hero.x - chicken.x, hero.y - chicken.y);

    if (distance < SCARE_DISTANCE && chicken.state !== "flee") {
      // Runs away clucking
      const angle = Math.atan2(chicken.y - hero.y, chicken.x - hero.x);
      chicken.state = "flee";
      chicken.speed = 0.055;
      chicken.target = {
        x: chicken.x + Math.cos(angle) * 28,
        y: chicken.y + Math.sin(angle) * 20,
      };
      if (performance.now() - this.lastCluck > 1500) {
        this.lastCluck = performance.now();
        sound.cluck();
      }
    }

    if (chicken.state === "flee") {
      if (chicken.moveTowards(delta, collision)) {
        chicken.state = "walk";
        chicken.speed = 0.012;
        chicken.idle = randomBetween(500, 1500);
      }
      return;
    }

    if (chickensRest(hour, weather)) {
      chicken.target ??= { x: chicken.home.x, y: chicken.home.y };
      chicken.state = chicken.moveTowards(delta, collision) ? "sit" : "walk";
      return;
    }

    chicken.state = "walk";
    if (chicken.target) {
      chicken.moveTowards(delta, collision);
      return;
    }

    chicken.idle -= delta;
    chicken.frameTime += delta;
    if (chicken.frameTime > 400) {
      chicken.frameTime = 0;
      chicken.frame++; // Pecking
    }
    if (chicken.idle <= 0) {
      chicken.idle = randomBetween(1000, 4000);
      chicken.target = chicken.pickTarget(collision);
    }
  }

  stepCat(cat, delta, hero) {
    const { collision, hour } = this.village;

    // After being petted it follows the player for a while
    if (cat.followTime > 0) {
      cat.followTime -= delta;
      const distance = Math.hypot(hero.x - cat.x, hero.y - cat.y);
      if (distance > 16) {
        cat.state = "walk";
        cat.speed = 0.04;
        cat.target = { x: hero.x - 10, y: hero.y + 2 };
        cat.moveTowards(delta, collision);
      } else {
        cat.state = "sit";
        cat.target = null;
      }
      return;
    }

    cat.speed = 0.018;

    if (hour >= 22 || hour < 6) {
      cat.target ??= { x: cat.home.x, y: cat.home.y };
      cat.state = cat.moveTowards(delta, collision) ? "sleep" : "walk";
      return;
    }

    if (cat.target) {
      cat.state = "walk";
      cat.moveTowards(delta, collision);
      return;
    }

    cat.idle -= delta;
    if (cat.state === "walk") cat.state = Math.random() < 0.3 ? "sleep" : "sit";
    if (cat.idle <= 0) {
      cat.idle = randomBetween(3000, 9000);
      cat.target = cat.pickTarget(collision);
    }
  }

  /** The player petted the cat. */
  petCat() {
    this.cat.followTime = 20000;
    this.cat.state = "sit";
    sound.meow();
  }

  get catPosition() {
    return { x: this.cat.x, y: this.cat.y };
  }

  stepFlock(delta, hero) {
    const { collision, hour, weather, terrain } = this.village;

    if (this.flock.length || !terrain) return;

    this.timeToFlock -= delta;
    if (this.timeToFlock > 0 || !birdsLand(hour, weather)) return;

    this.timeToFlock = randomBetween(20000, 45000);
    const angle = Math.random() * Math.PI * 2;
    const distance = randomBetween(55, 95);
    const cx = hero.x + Math.cos(angle) * distance;
    const cy = hero.y + Math.sin(angle) * distance * 0.6;

    if (
      !terrain.isLand(cx, cy) ||
      collision.isBlocked(cx - 6, cy - 6, 12, 12)
    ) {
      return;
    }

    const count = 3 + Math.floor(Math.random() * 3);
    for (let i = 0; i < count; i++) {
      const bird = this.addCritter({
        kind: "bird",
        x: cx + randomBetween(-10, 10),
        y: cy + randomBetween(-6, 6),
        home: { x: cx, y: cy },
        radius: 14,
        draw: (ctx, c) =>
          sprites.groundBird(ctx, c.x, c.y, { frame: c.frame, left: c.left }),
      });
      bird.speed = 0.02;
      this.flock.push(bird);
    }
  }

  stepBird(bird, delta, people) {
    const { collision, hour, weather } = this.village;
    const scared =
      people.some(
        (person) =>
          Math.hypot(person.x - bird.x, person.y - bird.y) < SCARE_DISTANCE,
      ) ||
      bird.age > 50000 ||
      !birdsLand(hour, weather);

    if (scared) {
      this.flyAway(bird, people[0]);
      return;
    }

    if (bird.target) {
      bird.moveTowards(delta, collision);
      return;
    }

    bird.frameTime += delta;
    if (bird.frameTime > 250) {
      bird.frameTime = 0;
      bird.frame++;
    }
    bird.idle -= delta;
    if (bird.idle <= 0) {
      bird.idle = randomBetween(800, 2500);
      bird.target = bird.pickTarget(collision);
    }
  }

  /** The whole flock takes off. */
  flyAway(bird, hero) {
    for (const member of this.flock) {
      const direction = member.x < hero.x ? -1 : 1;
      this.sky.push({
        x: member.x,
        y: member.y - 4,
        vx: direction * randomBetween(0.04, 0.07),
        vy: -randomBetween(0.03, 0.05),
        frame: 0,
        frameTime: 0,
        color: "#5f4636",
      });
      this.removeCritter(member);
    }

    if (Math.hypot(hero.x - bird.x, hero.y - bird.y) < 120) sound.flap();
    this.flock = [];
  }

  stepSky(delta) {
    const { weather, terrain } = this.village;

    // Seagulls fly over the island from time to time
    this.timeToGull -= delta;
    if (this.timeToGull <= 0 && terrain) {
      this.timeToGull = randomBetween(9000, 25000);
      if (weather !== "storm" && weather !== "snow") {
        const fromLeft = Math.random() < 0.5;
        this.sky.push({
          x: fromLeft ? -10 : terrain.width + 10,
          y: randomBetween(20, terrain.height - 20),
          vx: (fromLeft ? 1 : -1) * randomBetween(0.03, 0.045),
          vy: randomBetween(-0.004, 0.004),
          frame: 0,
          frameTime: 0,
          color: "#f4f4f4",
        });
      }
    }

    for (const bird of this.sky) {
      bird.x += bird.vx * delta;
      bird.y += bird.vy * delta;
      bird.frameTime += delta;
      if (bird.frameTime > 140) {
        bird.frameTime = 0;
        bird.frame++;
      }
    }

    const width = terrain?.width ?? 840;
    this.sky = this.sky.filter(
      (bird) => bird.x > -20 && bird.x < width + 20 && bird.y > -20,
    );
  }

  stepSmoke(delta) {
    const { hour, season, weather, time } = this.village;
    const wind = windOf(weather);
    const sources = BUILDINGS.map(({ placeId, chimney }) => ({
      id: placeId,
      x: chimney.x,
      y: chimney.y - 10,
      rate: smokeRate(placeId, hour, season),
    }));

    if (campfireLit(hour, weather)) {
      sources.push({
        id: "campfire",
        x: CAMPFIRE.x,
        y: CAMPFIRE.y - 8,
        rate: 2,
      });
    }

    for (const source of sources) {
      const debt =
        (this.smokeDebt.get(source.id) ?? 0) + (source.rate * delta) / 1000;
      const count = Math.floor(debt);
      this.smokeDebt.set(source.id, debt - count);

      for (let i = 0; i < count; i++) {
        this.smoke.push({
          x: source.x + randomBetween(-1, 1),
          y: source.y,
          life: 0,
          maxLife: randomBetween(2500, 4000),
          drift: randomBetween(0.5, 1.5),
          phase: time / 500,
        });
      }
    }

    for (const puff of this.smoke) {
      puff.life += delta;
      puff.y -= 0.008 * delta;
      puff.x +=
        (wind * puff.drift + Math.sin(puff.phase + puff.life / 600) * 0.002) *
        delta;
    }
    this.smoke = this.smoke.filter((puff) => puff.life < puff.maxLife);
  }

  stepButterflies(delta) {
    const { hour, season, weather } = this.village;
    const wanted = butterflyTime(season, hour, weather) ? 7 : 0;

    if (this.butterflies.length < wanted && Math.random() < delta / 1500) {
      const anchor = BUSHES[Math.floor(Math.random() * BUSHES.length)];
      this.butterflies.push({
        x: anchor.x,
        y: anchor.y - 8,
        anchor,
        vx: 0,
        vy: 0,
        frame: 0,
        color:
          BUTTERFLY_COLORS[Math.floor(Math.random() * BUTTERFLY_COLORS.length)],
      });
    } else if (
      this.butterflies.length > wanted &&
      Math.random() < delta / 2000
    ) {
      this.butterflies.shift();
    }

    for (const butterfly of this.butterflies) {
      butterfly.vx += randomBetween(-0.0006, 0.0006) * delta;
      butterfly.vy += randomBetween(-0.0006, 0.0006) * delta;
      // Pulled back to its flowers
      butterfly.vx += (butterfly.anchor.x - butterfly.x) * 0.00002 * delta;
      butterfly.vy += (butterfly.anchor.y - 10 - butterfly.y) * 0.00002 * delta;
      butterfly.vx = Math.max(-0.03, Math.min(0.03, butterfly.vx));
      butterfly.vy = Math.max(-0.03, Math.min(0.03, butterfly.vy));
      butterfly.x += butterfly.vx * delta;
      butterfly.y += butterfly.vy * delta;
      butterfly.frame = Math.floor(this.village.time / 120);
    }
  }

  stepFireflies(delta) {
    const { hour, season, weather } = this.village;
    const wanted = fireflyTime(season, hour, weather) ? 26 : 0;

    if (this.fireflies.length < wanted && Math.random() < delta / 300) {
      const area =
        FIREFLY_AREAS[Math.floor(Math.random() * FIREFLY_AREAS.length)];
      this.fireflies.push({
        x: area.x + randomBetween(-40, 40),
        y: area.y + randomBetween(-25, 25),
        vx: 0,
        vy: 0,
        phase: Math.random() * Math.PI * 2,
      });
    } else if (this.fireflies.length > wanted && Math.random() < delta / 400) {
      this.fireflies.shift();
    }

    for (const firefly of this.fireflies) {
      firefly.vx = Math.max(
        -0.01,
        Math.min(0.01, firefly.vx + randomBetween(-0.0004, 0.0004) * delta),
      );
      firefly.vy = Math.max(
        -0.01,
        Math.min(0.01, firefly.vy + randomBetween(-0.0004, 0.0004) * delta),
      );
      firefly.x += firefly.vx * delta;
      firefly.y += firefly.vy * delta;
    }
  }

  stepLeaves(delta) {
    const { season, weather } = this.village;
    const wind = windOf(weather);

    if (season === "autumn" && Math.random() < delta / 700) {
      const crown = TREE_CROWNS[Math.floor(Math.random() * TREE_CROWNS.length)];
      this.leaves.push({
        x: crown.x + randomBetween(-12, 12),
        y: crown.y + randomBetween(-8, 4),
        groundY: crown.y + randomBetween(18, 30),
        life: 0,
        color: ["#e2802c", "#cc562c", "#f0ba46"][Math.floor(Math.random() * 3)],
      });
    }

    for (const leaf of this.leaves) {
      leaf.life += delta;
      if (leaf.y < leaf.groundY) {
        leaf.y += 0.01 * delta;
        leaf.x += (wind + Math.sin(leaf.life / 300) * 0.012) * delta;
      }
    }
    this.leaves = this.leaves.filter((leaf) => leaf.life < 9000);
  }

  stepFish(delta, hero) {
    if (this.fish) {
      this.fish.t += delta;
      if (this.fish.t > 900) this.fish = null;
      return;
    }

    this.timeToFish -= delta;
    if (this.timeToFish > 0) return;

    this.timeToFish = randomBetween(5000, 12000);
    const spot = FISH_SPOTS[Math.floor(Math.random() * FISH_SPOTS.length)];
    this.fish = { ...spot, t: 0, direction: Math.random() < 0.5 ? -1 : 1 };
    if (Math.hypot(hero.x - spot.x, hero.y - spot.y) < 110) sound.splash();
  }

  /** Lights of the fireflies (see Lighting). */
  lights() {
    const t = this.village.time;
    return this.fireflies.map((firefly) => ({
      x: firefly.x,
      y: firefly.y,
      radius: 6,
      strength: 0.35 + 0.35 * Math.sin(t / 400 + firefly.phase),
      color: [210, 255, 120],
      core: true,
    }));
  }

  /** Things over the roofs and the trees (after the foreground). */
  drawSky(ctx) {
    const t = this.village.time;

    for (const { chimney } of BUILDINGS) {
      sprites.chimney(ctx, chimney.x, chimney.y);
    }

    for (const puff of this.smoke) {
      const progress = puff.life / puff.maxLife;
      const size = Math.round(2 + progress * 4);
      ctx.fillStyle = `rgba(215, 215, 220, ${0.55 * (1 - progress)})`;
      ctx.fillRect(
        Math.round(puff.x - size / 2),
        Math.round(puff.y - size / 2),
        size,
        size,
      );
    }

    for (const leaf of this.leaves) {
      ctx.globalAlpha = leaf.life > 7000 ? (9000 - leaf.life) / 2000 : 1;
      ctx.fillStyle = leaf.color;
      ctx.fillRect(Math.round(leaf.x), Math.round(leaf.y), 2, 1);
    }
    ctx.globalAlpha = 1;

    for (const butterfly of this.butterflies) {
      sprites.butterfly(
        ctx,
        Math.round(butterfly.x),
        Math.round(butterfly.y),
        butterfly.frame,
        butterfly.color,
      );
    }

    for (const firefly of this.fireflies) {
      ctx.fillStyle = `rgba(230, 255, 140, ${0.5 + 0.5 * Math.sin(t / 400 + firefly.phase)})`;
      ctx.fillRect(Math.round(firefly.x), Math.round(firefly.y), 1, 1);
    }

    if (this.fish) {
      const { x, y, t: ft, direction } = this.fish;
      const progress = Math.min(1, ft / 700);
      if (progress < 1) {
        const fx = x + direction * progress * 10;
        const fy = y - Math.sin(progress * Math.PI) * 9;
        ctx.fillStyle = "#c8d4dc";
        ctx.fillRect(Math.round(fx) - 1, Math.round(fy), 3, 1);
        ctx.fillStyle = "#8fa3b0";
        ctx.fillRect(
          Math.round(fx) + (direction > 0 ? -2 : 2),
          Math.round(fy),
          1,
          1,
        );
      }
      if (progress > 0.85) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.8)";
        const sx = Math.round(x + direction * 10);
        ctx.fillRect(sx - 2, Math.round(y) - 1, 1, 1);
        ctx.fillRect(sx + 2, Math.round(y) - 2, 1, 1);
        ctx.fillRect(sx, Math.round(y) - 3, 1, 1);
      }
    }

    for (const bird of this.sky) {
      sprites.flyingBird(
        ctx,
        Math.round(bird.x),
        Math.round(bird.y),
        bird.frame,
        bird.color,
      );
    }
  }
}
