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
export function sanitizeNpcData(content, places) {
  const placeIds = new Set(places.map((place) => place.id));
  const routine = [...new Set(content.routine ?? [])].filter((placeId) =>
    placeIds.has(placeId),
  );

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
    const { name, occupation } = session.cast[id - 1];

    const { content } = await session.llm.complete({
      cachePrefix: session.worldContext,
      system: npcGenerationPrompt({
        context: session.worldContext,
        name,
        occupation,
        sprite,
        language: session.language,
      }),
      messages: [{ role: "user", content: "Create the character." }],
      schema: npcGenerationSchema(session.places.map((place) => place.id)),
    });

    const data = {
      name,
      occupation,
      ...sanitizeNpcData(content, session.places),
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
  async createNpcs({
    quantity,
    language = null,
    places = [],
    onNpcCreated = () => {},
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

    return npcs;
  }
}
