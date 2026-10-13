// The map of the village changing with the story: the farm field growing and
// being harvested, snow and puddles on the ground, the wrecks the bandits
// leave behind, the things the villagers build when they achieve their goals,
// the footprints of a mystery and the objects the player can use (the well,
// the woodpile, the chests). Positions are in the frontend
// (src/levels/decor.js); here are only ids and states.

import { COINS } from "./PlayerState.js";

// Objects of the map the player can use with F
export const MAP_OBJECTS = {
  well: "well",
  woodpile: "woodpile",
  chest_north: "chest",
  chest_south: "chest",
  chest_east: "chest",
};
export const FARM_PLOTS = 6;
// Game hours of growth for each stage of the crops (0 = seeds, 4 = ripe)
const HOURS_PER_STAGE = 5;
export const RIPE_STAGE = 4;
// Farmers harvest what is left at this hour
const HARVEST_HOUR = 17;
const CROPS = {
  spring: "cenoura",
  summer: "trigo",
  autumn: "abóbora",
  winter: null, // The field rests under the snow
};
// Price of the food after a good or a bad harvest (until the next one)
const HARVEST_FACTORS = { good: 0.8, bad: 1.3 };

const WRECK_REPAIR_MINUTES = 24 * 60;
const CHEST_REFILL_MINUTES = 2 * 24 * 60;
const COOLDOWNS = { well: 30, woodpile: 60 };
const MAX_STRUCTURES = 6;

const CHEST_LOOT = [
  [COINS, 5],
  ["poção", 1],
  ["ervas", 2],
  ["adaga", 1],
  ["mapa antigo", 1],
  ["bota velha", 1],
];

const FARMER = /farm|fazend|agricult|lavrador|campon|camponês|plant/i;

const clamp01 = (value) => Math.min(1, Math.max(0, value));

// What a villager builds when they achieve a goal about it
const STRUCTURE_KINDS = [
  [/barco|bote|canoa|navio|jangada|boat|canoe|ship/i, "boat"],
  [
    /loja|barraca|banca|tenda|mercad|vend|neg[oó]cio|com[eé]rcio|shop|stall|market|sell|store/i,
    "stall",
  ],
  [/horta|jardim|flor|plant|semear|garden|flower|seed/i, "flowerbed"],
  [
    /oficina|ferraria|forja|ateli|galp[aã]o|constru|reform|casa|workshop|forge|build|house|repair/i,
    "workshop",
  ],
];

const STRUCTURE_LABELS = {
  boat: "Barco",
  stall: "Barraca",
  flowerbed: "Canteiro de flores",
  workshop: "Oficina",
  banner: "Estandarte",
  wedding_arch: "Arco do casamento",
};

/** What the villager builds when they achieve `goal`. */
export function structureKindFor(goal = "") {
  return (
    STRUCTURE_KINDS.find(([pattern]) => pattern.test(goal))?.[1] ?? "banner"
  );
}

/**
 * Snow and puddles on the ground, updated every few game minutes.
 * @returns {{snow: number, wet: number}}
 */
export function nextGround({ snow, wet }, weather, season) {
  let nextSnow = snow;
  let nextWet = wet;

  if (weather === "snow") {
    nextSnow += 0.06;
  } else {
    // Melts faster out of the winter; melting snow wets the ground
    const melt = season === "winter" ? 0.006 : 0.03;
    // Melting snow keeps the ground wet (mud)
    if (snow > 0) nextWet = Math.max(nextWet, 0.6);
    nextSnow -= melt;
  }

  if (weather === "storm") nextWet += 0.2;
  else if (weather === "rain") nextWet += 0.12;
  else if (weather === "fog" || weather === "cloudy") nextWet -= 0.01;
  else if (weather !== "snow" && snow === 0) nextWet -= 0.025;

  return { snow: clamp01(nextSnow), wet: clamp01(nextWet) };
}

/** Item found in a chest. */
export function rollChest(random = Math.random) {
  const total = CHEST_LOOT.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;
  const [item] =
    CHEST_LOOT.find(([, weight]) => (roll -= weight) < 0) ?? CHEST_LOOT[0];

  return { item, quantity: item === COINS ? 5 + Math.floor(random() * 11) : 1 };
}

const newFarm = () => ({
  hours: 0,
  quality: 3, // 1..5
  harvested: Array(FARM_PLOTS).fill(false),
  helped: false,
  lastRainDay: 0,
  lastStormDay: 0,
});

export class VillageMap {
  /** @param {import("./GameSession.js").GameSession} session */
  constructor(session) {
    this.session = session;
    this.ground = { snow: 0, wet: 0 };
    this.farm = newFarm();
    this.lastFarmHour = null;
    this.lastHarvestDay = 0;
    // Food prices after the last harvest
    this.harvestFactor = 1;
    // { id, kind, placeId, ownerId, since }
    this.wrecks = [];
    // { id, kind, placeId, ownerId, label, until }
    this.structures = [];
    this.nextId = 1;
    // Footprints of the culprit: { title, fromPlaceId, toPlaceId, inspected, washed }
    this.tracks = null;
    // objectId -> game minute when it can be used again
    this.cooldowns = new Map();
    this.lastSnapshot = "";
  }

  get crop() {
    return CROPS[this.session.season] ?? null;
  }

  get stage() {
    if (!this.crop) return 0;
    return Math.min(RIPE_STAGE, Math.floor(this.farm.hours / HOURS_PER_STAGE));
  }

  get isRipe() {
    return this.stage === RIPE_STAGE;
  }

  placeName(placeId) {
    return this.session.life.placeName(placeId);
  }

  homeOf(npcId) {
    return this.session.npcs.get(npcId)?.data.routine?.[0] ?? null;
  }

  // ---------------------------------------------------------------------------
  // Time

  /**
   * Runs with the session tick.
   * @returns {boolean} Whether something visible changed (world state).
   */
  async update(now, day, hour) {
    const { session } = this;
    const weather = session.life.weather.current;

    this.ground = nextGround(this.ground, weather, session.season);

    const hourIndex = Math.floor(now / 60);
    if (this.lastFarmHour !== null && hourIndex !== this.lastFarmHour) {
      this.growFarm(day, weather);
    }
    this.lastFarmHour = hourIndex;

    if (this.isRipe && hour >= HARVEST_HOUR && this.lastHarvestDay !== day) {
      await this.finishHarvest(day, { byFarmers: true });
    }

    await this.repairOldWrecks(now);
    this.structures = this.structures.filter(
      (structure) => structure.until === null || structure.until > now,
    );
    this.updateTracks(weather);

    return this.hasVisibleChange();
  }

  hasVisibleChange() {
    const json = this.toJSON();
    const snapshot = JSON.stringify({
      ...json,
      ground: {
        snow: Math.round(json.ground.snow * 20),
        wet: Math.round(json.ground.wet * 20),
      },
    });
    const changed = snapshot !== this.lastSnapshot;
    this.lastSnapshot = snapshot;
    return changed;
  }

  /** One game hour of growth (rain waters the field, storms damage it). */
  growFarm(day, weather) {
    const { farm } = this;

    if (!this.crop) {
      this.farm = newFarm();
      return;
    }

    if (this.isRipe) return;

    farm.hours += weather === "rain" ? 1.5 : 1;

    if (weather === "rain" && farm.lastRainDay !== day) {
      farm.lastRainDay = day;
      farm.quality = Math.min(5, farm.quality + 1);
    } else if (weather === "storm" && farm.lastStormDay !== day) {
      farm.lastStormDay = day;
      farm.quality = Math.max(1, farm.quality - 1);
    }

    if (this.isRipe) {
      this.session.notify(
        `A plantação de ${this.crop} está pronta para a colheita!`,
        "good",
      );
    }
  }

  /** The harvest is over: food gets cheaper or more expensive. */
  async finishHarvest(day, { byFarmers = false } = {}) {
    const { session } = this;
    const crop = this.crop;
    const { quality } = this.farm;
    const result = quality >= 4 ? "good" : quality <= 2 ? "bad" : "normal";

    this.lastHarvestDay = day;
    this.harvestFactor = HARVEST_FACTORS[result] ?? 1;
    this.farm = newFarm();

    const text = {
      good: `Colheita farta de ${crop}: a comida ficou mais barata`,
      bad: `Colheita fraca de ${crop}: a comida ficou mais cara`,
      normal: `Terminou a colheita de ${crop}`,
    }[result];

    session.notify(
      byFarmers ? `${text} (os moradores colheram)` : text,
      "item",
    );
    session.addNews(text);
    await session.rememberAll(
      `[village news] The harvest of ${crop} is over and it was ${result === "normal" ? "an ordinary one" : result === "good" ? "a great one: food is cheaper now" : "a poor one: food is more expensive now"}.`,
    );
  }

  /** Factor of the food prices (see Commerce.priceOf). */
  foodPriceFactor() {
    return this.harvestFactor;
  }

  // ---------------------------------------------------------------------------
  // Story

  /** The bandits robbed `ownerId` near `placeId`: they leave a mess. */
  addWrecks(placeId, ownerId) {
    const since = this.session.clock.totalMinutes;
    this.wrecks = [
      ...this.wrecks.filter((wreck) => wreck.placeId !== placeId),
      { id: this.nextId++, kind: "cart", placeId, ownerId, since },
      { id: this.nextId++, kind: "crates", placeId, ownerId, since },
    ];
  }

  async repairOldWrecks(now) {
    const old = this.wrecks.filter(
      (wreck) => now - wreck.since >= WRECK_REPAIR_MINUTES,
    );

    if (old.length === 0) return;

    this.wrecks = this.wrecks.filter((wreck) => !old.includes(wreck));
    const place = this.placeName(old[0].placeId);
    this.session.addNews(
      `Os moradores consertaram o estrago dos bandidos (${place})`,
    );
    await this.session.rememberAll(
      `[village life] The villagers repaired what the bandits broke near ${place}.`,
    );
  }

  /** A villager achieved their goal and builds something. */
  addStructureForGoal(npcId, goal) {
    const npc = this.session.npcs.get(npcId);
    if (!npc) return null;

    const kind = structureKindFor(goal);
    const placeId = kind === "boat" ? "dock" : this.homeOf(npcId);

    return this.addStructure({
      kind,
      placeId,
      ownerId: npcId,
      label: `${STRUCTURE_LABELS[kind]} de ${npc.data.name}`,
    });
  }

  addStructure({ kind, placeId, ownerId = null, label, until = null }) {
    if (!placeId) return null;

    const structure = {
      id: this.nextId++,
      kind,
      placeId,
      ownerId,
      label,
      until,
    };
    // One of each kind per place; the oldest ones are taken down
    this.structures = [
      ...this.structures.filter(
        (other) => other.kind !== kind || other.placeId !== placeId,
      ),
      structure,
    ].slice(-MAX_STRUCTURES);

    this.session.emitWorldState();
    return structure;
  }

  /** Footprints of the culprit, from the victim's home to their own. */
  updateTracks(weather) {
    const { mystery } = this.session;

    if (!mystery?.isOpen) {
      this.tracks = null;
      return;
    }

    if (this.tracks?.title !== mystery.title) {
      const places = this.session.places.map((place) => place.id);
      const to = this.homeOf(mystery.culpritId) ?? places[0];
      const victimHome = mystery.victimId
        ? this.homeOf(mystery.victimId)
        : null;
      const from =
        victimHome && victimHome !== to
          ? victimHome
          : (places.find((id) => id !== to && id !== "dock") ?? null);

      this.tracks =
        from && to
          ? {
              title: mystery.title,
              fromPlaceId: from,
              toPlaceId: to,
              inspected: false,
              washed: false,
            }
          : null;
    }

    // A storm washes away the footprints nobody looked at
    if (this.tracks && weather === "storm" && !this.tracks.inspected) {
      if (!this.tracks.washed) {
        this.session.notify(
          "A tempestade apagou pegadas pela vila...",
          "weather",
        );
      }
      this.tracks.washed = true;
    }
  }

  // ---------------------------------------------------------------------------
  // The player uses something of the map (F)

  /**
   * @param {string} objectId well | woodpile | chest_* | plot:N | wreck:ID | tracks
   * @returns {Promise<{ok: boolean, message: string, item?: string, quantity?: number}>}
   */
  async interact(objectId) {
    const id = String(objectId ?? "");
    const [kind, arg] = id.split(":");

    if (kind === "plot") return this.harvestPlot(Number(arg));
    if (kind === "wreck") return this.repairWreck(Number(arg));
    if (kind === "tracks") return this.inspectTracks();
    if (!MAP_OBJECTS[id]) throw new Error(`Unknown object: ${id}`);

    const now = this.session.clock.totalMinutes;

    if (MAP_OBJECTS[id] === "chest") return this.openChest(id, now);

    if ((this.cooldowns.get(id) ?? 0) > now) {
      return {
        ok: false,
        message:
          id === "well"
            ? "Você acabou de encher o cantil."
            : "Você já cortou lenha. Descanse um pouco.",
      };
    }

    if (id === "woodpile" && this.session.clock.period === "night") {
      return { ok: false, message: "Está escuro demais para cortar lenha." };
    }

    this.cooldowns.set(id, now + COOLDOWNS[id]);
    const loot =
      id === "well"
        ? { item: "água fresca", quantity: 1 }
        : { item: "lenha", quantity: 1 + Math.floor(Math.random() * 2) };
    return this.give(
      loot,
      id === "well"
        ? `Você encheu o cantil: ${loot.quantity} ${loot.item}${this.session.season === "winter" ? " (gelada!)" : ""}.`
        : `Você cortou ${loot.quantity} ${loot.item}.`,
    );
  }

  give({ item, quantity }, message) {
    this.session.player.addItem(item, quantity);
    this.session.emitPlayerState();
    return { ok: true, item, quantity, message };
  }

  openChest(id, now) {
    if ((this.cooldowns.get(id) ?? 0) > now) {
      return { ok: false, message: "O baú está vazio." };
    }

    this.cooldowns.set(id, now + CHEST_REFILL_MINUTES);
    const loot = rollChest();
    this.session.emitWorldState();
    return this.give(
      loot,
      `Você abriu o baú e achou ${loot.quantity} ${loot.item}!`,
    );
  }

  async harvestPlot(index) {
    const { session, farm } = this;

    if (!(index >= 0 && index < FARM_PLOTS)) throw new Error("Invalid plot");

    if (!this.isRipe || farm.harvested[index]) {
      return {
        ok: false,
        message: this.crop
          ? "Ainda não dá para colher aqui."
          : "A terra descansa durante o inverno.",
      };
    }

    farm.harvested[index] = true;
    const crop = this.crop;
    const result = this.give(
      { item: crop, quantity: farm.quality >= 4 ? 2 : 1 },
      `Você colheu ${farm.quality >= 4 ? 2 : 1} ${crop}.`,
    );

    // Helping with the harvest makes the farmers like the player
    const farmer = [...session.npcs.values()].find(
      (npc) =>
        session.isVillager(npc.id) && FARMER.test(npc.data.occupation ?? ""),
    );
    if (farmer && !farm.helped) {
      farm.helped = true;
      session.player.changeReputation(farmer.id, 1);
      result.message += ` ${farmer.data.name} agradece a ajuda na colheita (+1).`;
      session.runInBackground(
        session.remember(
          farmer.id,
          "[village life] The traveler helped me with the harvest of the field.",
        ),
      );
    }

    if (farm.harvested.every(Boolean)) {
      await this.finishHarvest(session.clock.day);
    }

    session.emitWorldState();
    session.emitPlayerState();
    return result;
  }

  async repairWreck(id) {
    const { session } = this;
    const wreck = this.wrecks.find((candidate) => candidate.id === id);

    if (!wreck)
      return { ok: false, message: "Não há nada para consertar aqui." };

    this.wrecks = this.wrecks.filter((candidate) => candidate !== wreck);
    let message = "Você consertou o estrago dos bandidos.";

    if (wreck.ownerId && session.npcs.has(wreck.ownerId)) {
      session.player.changeReputation(wreck.ownerId, 2);
      message += ` ${session.nameOf(wreck.ownerId)} agradece (+2).`;
      await session.remember(
        wreck.ownerId,
        "[village life] The traveler repaired what the bandits broke at my place.",
      );
    }

    session.emitWorldState();
    session.emitPlayerState();
    return { ok: true, message };
  }

  inspectTracks() {
    const { tracks, session } = this;

    if (!tracks || tracks.washed) {
      return { ok: false, message: "Não há pegadas por aqui." };
    }

    const message = `Pegadas de botas saem de ${this.placeName(tracks.fromPlaceId)} e terminam em ${this.placeName(tracks.toPlaceId)}.`;

    if (!tracks.inspected) {
      tracks.inspected = true;
      session.investigation.addTestimony(0, message);
      session.emitPlayerState();
      session.emitWorldState();
    }

    return { ok: true, message: `${message} Anotado no diário.` };
  }

  // ---------------------------------------------------------------------------

  /** What the villagers see around them, for the prompts. */
  describe() {
    const parts = [];
    const { snow, wet } = this.ground;

    if (snow > 0.5) parts.push("the ground is covered in snow");
    else if (snow > 0.15)
      parts.push("there is a thin layer of snow on the ground");
    if (wet > 0.5) parts.push("the roads are muddy and full of puddles");
    if (this.isRipe) parts.push(`the ${this.crop} of the farm field is ripe`);
    for (const wreck of this.wrecks.slice(0, 1)) {
      parts.push(
        `near ${this.placeName(wreck.placeId)} there is still a mess left by the bandits`,
      );
    }
    for (const structure of this.structures.slice(-3)) {
      parts.push(
        `there is a new ${structure.kind.replace("_", " ")} at ${this.placeName(structure.placeId)}`,
      );
    }

    return parts.length ? `${parts.join("; ")}.` : null;
  }

  toJSON() {
    const now = this.session.clock.totalMinutes;
    const { tracks } = this;

    return {
      ground: { ...this.ground },
      farm: {
        crop: this.crop,
        stage: this.stage,
        quality: this.farm.quality,
        harvested: [...this.farm.harvested],
      },
      wrecks: this.wrecks.map(({ id, kind, placeId }) => ({
        id,
        kind,
        placeId,
      })),
      structures: this.structures.map(({ id, kind, placeId, label }) => ({
        id,
        kind,
        placeId,
        label,
      })),
      tracks:
        tracks && !tracks.washed
          ? {
              fromPlaceId: tracks.fromPlaceId,
              toPlaceId: tracks.toPlaceId,
              inspected: tracks.inspected,
            }
          : null,
      emptyChests: Object.keys(MAP_OBJECTS).filter(
        (id) =>
          MAP_OBJECTS[id] === "chest" && (this.cooldowns.get(id) ?? 0) > now,
      ),
    };
  }

  toState() {
    return {
      ground: this.ground,
      farm: this.farm,
      lastFarmHour: this.lastFarmHour,
      lastHarvestDay: this.lastHarvestDay,
      harvestFactor: this.harvestFactor,
      wrecks: this.wrecks,
      structures: this.structures,
      nextId: this.nextId,
      tracks: this.tracks,
      cooldowns: [...this.cooldowns],
    };
  }

  restoreState(state) {
    Object.assign(this, { ...state, cooldowns: new Map(state.cooldowns) });
  }
}
