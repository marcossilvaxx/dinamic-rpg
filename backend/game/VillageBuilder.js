// Creates a new village: the world history with the cast (name and
// occupation of each villager), the details of each NPC and the first
// mystery.

import {
  SPRITES,
  WORK_KINDS,
  npcGenerationPrompt,
  npcGenerationSchema,
  spriteGender,
} from "../prompts/npcGeneration.js";
import {
  worldHistoryPrompt,
  worldHistorySchema,
} from "../prompts/worldHistoryGeneration.js";
import {
  DECOR,
  FURNITURE,
  ROOFS,
  SIGNS,
  TRADES,
  WALLS,
  villagePlanPrompt,
  villagePlanSchema,
} from "../prompts/villagePlan.js";
import { castProblems, fixCast } from "./cast.js";
import { sanitizeWares } from "./shop.js";

const MAX_WORLD_ATTEMPTS = 2;
const MAX_LIKES = 3;

export const shuffle = (array) => {
  const result = [...array];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
};

const cleanList = (items, max) =>
  (Array.isArray(items) ? items : [])
    .map((item) => String(item).trim())
    .filter(Boolean)
    .slice(0, max);

/**
 * Keeps only places of the map in the routine (at least one), and the other
 * generated fields valid.
 */
export function sanitizeNpcData(content, places, home = null) {
  const placeIds = new Set(places.map((place) => place.id));
  let routine = [...new Set(content.routine ?? [])].filter((placeId) =>
    placeIds.has(placeId),
  );

  // Their building (planned for them) always comes first
  if (home && placeIds.has(home.id)) {
    routine = [home.id, ...routine.filter((placeId) => placeId !== home.id)];
  }

  if (routine.length === 0 && places.length > 0) {
    routine.push(places[Math.floor(Math.random() * places.length)].id);
  }

  return {
    ...content,
    routine,
    secret: content.secret?.trim() ?? "",
    wares: sanitizeWares(content.wares),
    work: WORK_KINDS.includes(content.work) ? content.work : "none",
    likes: cleanList(content.likes, MAX_LIKES),
    dislikes: cleanList(content.dislikes, MAX_LIKES),
    goal: content.goal?.trim() ?? "",
  };
}

const MAX_FURNITURE = 12;

/** Keeps only what the frontend knows how to draw (see villagePlan.js). */
export function sanitizeLook(look = {}) {
  const pick = (value, options, fallback) =>
    options.includes(value) ? value : fallback;

  return {
    size: pick(look.size, ["small", "medium", "large"], "medium"),
    roofStyle: pick(look.roofStyle, ["gable", "ridge"], "gable"),
    roof: pick(look.roof, ROOFS, "red"),
    wall: pick(look.wall, WALLS, "plaster"),
    timber: look.timber === true,
    windows: Math.min(3, Math.max(1, Math.round(Number(look.windows)) || 2)),
    chimney: look.chimney !== false,
    sign: pick(look.sign, SIGNS, "none"),
    decor: [
      ...new Set((look.decor ?? []).filter((item) => DECOR.includes(item))),
    ].slice(0, 3),
  };
}

export class VillageBuilder {
  /** @param {import("./GameSession.js").GameSession} session */
  constructor(session) {
    this.session = session;
  }

  /**
   * Creates the world history together with the cast, one villager per
   * sprite. Asks again when the names are too similar, and fixes them as a
   * last resort.
   */
  async createWorld(sprites) {
    const { session } = this;
    console.log(`[session ${session.id}] Creating world history...`);

    const slots = sprites.map((sprite, index) => ({
      slot: index + 1,
      gender: spriteGender(sprite),
      look: SPRITES[sprite],
    }));
    let problems = [];
    let world = null;

    for (let attempt = 1; attempt <= MAX_WORLD_ATTEMPTS; attempt++) {
      const { content } = await session.llm.complete({
        messages: [
          {
            role: "user",
            content: worldHistoryPrompt({
              places: session.places,
              slots,
              problems,
              language: session.language,
            }),
          },
        ],
        schema: worldHistorySchema,
      });

      world = content;
      problems = castProblems(world.villagers, sprites.length);

      if (problems.length === 0) {
        break;
      }

      console.warn(
        `[session ${session.id}] Cast problems (attempt ${attempt}):`,
        problems,
      );
    }

    session.world = { worldHistory: world.worldHistory };
    session.cast = fixCast(world.villagers, sprites.length);
    await session.store.setWorld({ ...session.world, villagers: session.cast });

    return session.world;
  }

  async createNpc(id, sprite) {
    const { session } = this;
    const { name, occupation, title } = session.cast[id - 1];
    const home =
      session.places.find((place) => place.owners?.includes(id)) ?? null;

    const { content } = await session.llm.complete({
      cachePrefix: session.worldContext,
      system: npcGenerationPrompt({
        context: session.worldContext,
        name,
        occupation,
        sprite,
        language: session.language,
        home,
      }),
      messages: [{ role: "user", content: "Create the character." }],
      schema: npcGenerationSchema(session.places.map((place) => place.id)),
    });

    const data = {
      name,
      occupation,
      ...(title && { title }),
      ...sanitizeNpcData(content, session.places, home),
      gender: spriteGender(sprite),
      sprite,
    };

    await session.addNpc(id, data);

    return { id, data };
  }

  /**
   * Creates the world (with the cast), the details of all NPCs in parallel
   * and the mystery of the village. Each NPC gets a distinct sprite (while
   * there are sprites available) to keep characters varied.
   */
  /**
   * The model decides what is built on the empty lots of the map and who
   * lives or works there. Built lots become places (with a building).
   * @returns {object[]} The built lots (places).
   */
  async planVillage(lots) {
    const { session } = this;

    if (lots.length === 0) return [];

    let buildings = [];
    try {
      const { content } = await session.llm.complete({
        messages: [
          {
            role: "user",
            content: villagePlanPrompt({
              worldHistory: session.world.worldHistory,
              villagers: session.cast,
              places: session.places,
              lots,
              language: session.language,
            }),
          },
        ],
        schema: villagePlanSchema,
      });
      buildings = content.buildings;
    } catch (error) {
      console.error(`[session ${session.id}] Village plan failed:`, error);
    }

    const slots = new Set(session.cast.map((villager) => villager.slot));
    const used = new Set();
    const built = [];

    for (const building of buildings) {
      const lot = lots.find((candidate) => candidate.id === building.lot);
      if (!lot || built.some((place) => place.id === lot.id)) continue;

      const owners = [...new Set(building.owners)]
        .filter((slot) => slots.has(slot) && !used.has(slot))
        .slice(0, 3);
      owners.forEach((slot) => used.add(slot));

      built.push({
        id: lot.id,
        name: building.name.trim().slice(0, 40) || lot.id,
        description: `${building.description.trim().slice(0, 160)} (${lot.description})`,
        building: true,
        lot: true,
        kind: building.kind === "work" ? "work" : "home",
        trade: TRADES.includes(building.trade) ? building.trade : "home",
        look: sanitizeLook(building.look),
        furniture: (building.furniture ?? [])
          .filter((piece) => FURNITURE.includes(piece))
          .slice(0, MAX_FURNITURE),
        owners,
      });
    }

    session.places = [...session.places, ...built];
    console.log(
      `[session ${session.id}] Village plan: ${built.map((place) => place.name).join(", ") || "nothing built"}`,
    );
    return built;
  }

  async createNpcs({
    quantity,
    language = null,
    places = [],
    lots = [],
    onNpcCreated = () => {},
    onVillagePlanned = () => {},
  }) {
    const { session } = this;

    if (language) {
      session.language = language;
    }

    session.places = places;

    // Shuffle once so sprites are unique when quantity <= number of sprites.
    const deck = shuffle(Object.keys(SPRITES));
    const sprites = Array.from(
      { length: quantity },
      (_, i) => deck[i % deck.length],
    );

    await this.createWorld(sprites);
    onVillagePlanned(await this.planVillage(lots));

    let created = 0;

    const npcs = await Promise.all(
      sprites.map(async (sprite, index) => {
        const npc = await this.createNpc(index + 1, sprite);

        created++;
        console.log(`[session ${session.id}] Agent ${npc.id} created`);
        onNpcCreated(npc, created, quantity);

        return npc;
      }),
    );

    await session.investigation.start();
    session.save();
    // The ambitions of the villagers (one call, in the background)
    session.runInBackground(session.ambitions.createAll());

    return npcs;
  }
}
