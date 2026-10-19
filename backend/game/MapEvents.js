// Events that change the map for a while: a storm knocks a tree down on a
// road of the village, the high tide covers the pier (the boat doesn't
// leave) and, in a dry summer, the forest catches fire. Everybody hears
// about them and the villagers comment on them (frontend). Where things
// happen is chosen by the frontend from `spot` (see world/MapEvents.js).

import { REGIONS } from "./Regions.js";

const HOUR = 60;
const DAY = 24 * HOUR;

// Chance per game hour
const TREE_FALL_CHANCE = 0.25; // During a storm
const TIDE_CHANCE = 0.06; // Any hour (more in a storm)
const STORM_TIDE_CHANCE = 0.3;
const FIRE_CHANCE = 0.12; // Dry summer afternoons

const FALLEN_TREE_CLEARED = DAY; // The villagers clear it
const TIDE_MINUTES = 3 * HOUR;
const FIRE_MINUTES = 8 * HOUR;
const BURNED_MINUTES = 3 * DAY;
const DRY_HOURS_FOR_FIRE = 24;
const DAYS_BETWEEN_FIRES = 4;
const BURNED_TREES = 4; // Trees to cut of the forest that burn
export const FALLEN_TREE_WOOD = 4;

const WET = new Set(["rain", "storm", "snow"]);

/** "14:30" for a game minute. */
const clockTime = (minutes) => {
  const minute = Math.round(minutes) % DAY;
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(Math.floor(minute / HOUR))}:${pad(minute % HOUR)}`;
};

export class MapEvents {
  /** @param {import("./GameSession.js").GameSession} session */
  constructor(session, random = Math.random) {
    this.session = session;
    this.random = random;
    this.fallenTree = null; // { spot, since }
    this.tide = null; // { until }
    this.fire = null; // { trees, since, until, burnedUntil }
    this.dryHours = 0;
    this.lastHour = null;
    this.lastFireDay = -Infinity;
    this.nextId = 1;
  }

  get now() {
    return this.session.clock.totalMinutes;
  }

  get isTideHigh() {
    return Boolean(this.tide && this.tide.until > this.now);
  }

  get isForestBurning() {
    return Boolean(this.fire && this.fire.until > this.now);
  }

  /** Why the boat can't go to `destination` now (or null). */
  travelProblem(destination, from) {
    if (from === "village" && this.isTideHigh) {
      return `A maré está alta e cobriu o píer: o barco só sai quando ela baixar (por volta das ${clockTime(this.tide.until)}).`;
    }
    if (destination === "forest" && this.isForestBurning) {
      return "A Floresta Sombria está pegando fogo! Nenhum barqueiro leva ninguém para lá agora.";
    }
    return null;
  }

  /**
   * Once per game hour: storms knock trees down and raise the tide, dry
   * summers set the forest on fire. Returns whether something changed.
   */
  async update(now, hour, weather, season) {
    const hourIndex = Math.floor(now / HOUR);
    if (hourIndex === this.lastHour) return false;
    const first = this.lastHour === null;
    this.lastHour = hourIndex;
    if (first) return false;

    let changed = false;
    this.dryHours = WET.has(weather) ? 0 : this.dryHours + 1;

    // Things that end
    if (this.fallenTree && now - this.fallenTree.since >= FALLEN_TREE_CLEARED) {
      this.fallenTree = null;
      await this.announce(
        "Os moradores tiraram da estrada a árvore que a tempestade derrubou",
        "[village life] The villagers cleared the tree the storm had knocked down on the road.",
      );
      changed = true;
    }
    if (this.tide && this.tide.until <= now) {
      this.tide = null;
      this.session.notify("A maré baixou: o barco voltou a sair do píer.");
      changed = true;
    }
    if (this.fire && this.isForestBurning && WET.has(weather)) {
      this.fire.until = now; // The rain put it out
    }
    if (this.fire && !this.fire.out && this.fire.until <= now) {
      this.fire.out = true;
      await this.announce(
        "O incêndio da Floresta Sombria apagou; parte da mata ficou queimada",
        "[village news] The fire in the forest is over. Part of it burned: black trunks and ashes near the trail. It will take time to grow back.",
      );
      changed = true;
    }
    if (this.fire && this.fire.burnedUntil <= now) {
      this.fire = null;
      changed = true;
    }

    // Things that start
    if (
      weather === "storm" &&
      !this.fallenTree &&
      this.random() < TREE_FALL_CHANCE
    ) {
      this.fallenTree = {
        id: this.nextId++,
        spot: Math.floor(this.random() * 100),
        since: now,
      };
      await this.announce(
        "A tempestade derrubou uma árvore numa estrada da vila",
        "[village news] The storm knocked a big tree down on a road of the village. It blocks part of the way; someone with an axe could cut it into firewood.",
        "warning",
      );
      changed = true;
    }

    const tideChance = weather === "storm" ? STORM_TIDE_CHANCE : TIDE_CHANCE;
    if (!this.isTideHigh && this.random() < tideChance) {
      this.tide = { id: this.nextId++, until: now + TIDE_MINUTES };
      await this.announce(
        "A maré subiu e cobriu o píer; o barco não sai por algumas horas",
        "[village news] The tide is very high: the water covered the pier and the boat can't leave for a few hours.",
        "warning",
      );
      changed = true;
    }

    const { day } = this.session.clock;
    if (
      season === "summer" &&
      !this.fire &&
      hour >= 11 &&
      hour <= 17 &&
      this.dryHours >= DRY_HOURS_FOR_FIRE &&
      day - this.lastFireDay >= DAYS_BETWEEN_FIRES &&
      this.random() < FIRE_CHANCE
    ) {
      this.startFire(now, day);
      await this.announce(
        "Fogo na Floresta Sombria! Dá para ver a fumaça da vila",
        "[village news] With the dry summer, the forest across the water caught fire. A column of smoke can be seen from the village. Nobody can go there until it ends.",
        "warning",
      );
      changed = true;
    }

    return changed;
  }

  startFire(now, day) {
    // Some of the trees to cut burn (they come back in a few days)
    const first = Math.floor(this.random() * 4);
    const trees = Array.from({ length: BURNED_TREES }, (_, i) => first + i);
    this.fire = {
      id: this.nextId++,
      trees,
      since: now,
      until: now + FIRE_MINUTES,
      burnedUntil: now + FIRE_MINUTES + BURNED_MINUTES,
      out: false,
    };
    this.lastFireDay = day;
    for (const index of trees) {
      this.session.regions.depleted.set(
        `forest:tree_${index}`,
        this.fire.burnedUntil,
      );
    }
  }

  async announce(news, memory, kind = "info") {
    const { session } = this;
    session.notify(`${news}.`, kind);
    session.addNews(news);
    await session.rememberAll(memory);
  }

  /** The player cuts the fallen tree with an axe. */
  async clearFallenTree() {
    const { session } = this;
    if (!this.fallenTree) {
      return { ok: false, message: "Não há nenhuma árvore caída aqui." };
    }
    if (!session.player.hasItem("machado")) {
      return {
        ok: false,
        message:
          "Uma árvore enorme caída na estrada. Com um machado dá para cortá-la (a Ferreira Odete vende em Pedravento).",
      };
    }

    this.fallenTree = null;
    session.player.addItem("lenha", FALLEN_TREE_WOOD);
    for (const villager of session.cast) {
      session.player.changeReputation(villager.slot, 1);
    }
    session.emitPlayerState();
    session.emitWorldState();
    session.addNews("O viajante cortou a árvore que bloqueava a estrada");
    await session.rememberAll(
      "[village news] The traveler cut the tree the storm had knocked down and cleared the road. People are grateful.",
    );
    return {
      ok: true,
      item: "lenha",
      quantity: FALLEN_TREE_WOOD,
      message: `Você liberou a estrada e ganhou ${FALLEN_TREE_WOOD} lenha. Os moradores agradecem (+1 com todos).`,
    };
  }

  /** What the prompts of the NPCs know about it now. */
  describe() {
    const lines = [];
    if (this.fallenTree) {
      lines.push("A tree knocked down by a storm blocks part of a road.");
    }
    if (this.isTideHigh) {
      lines.push("The tide is high: the pier is under water, no boat leaves.");
    }
    if (this.isForestBurning) {
      lines.push(`${REGIONS.forest.name} is on fire: smoke over the sea.`);
    } else if (this.fire) {
      lines.push(`Part of ${REGIONS.forest.name} burned some days ago.`);
    }
    return lines.length ? lines.join(" ") : null;
  }

  toJSON() {
    return {
      fallenTree: this.fallenTree && {
        id: this.fallenTree.id,
        spot: this.fallenTree.spot,
      },
      tide: this.isTideHigh ? { id: this.tide.id } : null,
      fire: this.fire && {
        id: this.fire.id,
        trees: this.fire.trees,
        burning: this.isForestBurning,
      },
    };
  }

  toState() {
    return {
      fallenTree: this.fallenTree,
      tide: this.tide,
      fire: this.fire,
      dryHours: this.dryHours,
      lastHour: this.lastHour,
      lastFireDay: Number.isFinite(this.lastFireDay) ? this.lastFireDay : null,
      nextId: this.nextId,
    };
  }

  restoreState(state) {
    Object.assign(this, {
      ...state,
      lastFireDay: state.lastFireDay ?? -Infinity,
    });
  }
}
