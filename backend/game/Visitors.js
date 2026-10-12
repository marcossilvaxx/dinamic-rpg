// Visitors that spend a day in the village (a merchant with rare goods, a
// bard, a pilgrim...): they arrive in the morning by the pier and leave in
// the evening. They are not part of the cast (the cached world context
// doesn't change), so they don't take part in the mysteries.

import { SPRITES, spriteGender } from "../prompts/npcGeneration.js";
import { visitorPrompt, visitorSchema } from "../prompts/visitor.js";
import * as protocol from "../protocol.js";
import { SEASON_INFO } from "./seasons.js";
import { sanitizeWares } from "./shop.js";

export const VISITOR_ARRIVAL_HOUR = 10;
export const VISITOR_DEPARTURE_HOUR = 20;
// A visitor comes every this many days
export const VISITOR_EVERY_DAYS = 2;
// Visitor ids start here (villagers are 1..N)
export const VISITOR_FIRST_ID = 100;
const VISITOR_ROUTINE = ["dock", "tavern", "garden", "south_road"];

const KINDS = [
  "a traveling merchant with rare goods",
  "a wandering bard who sings news from other lands",
  "a pilgrim resting on the way to a distant shrine",
  "an herbalist looking for rare plants",
  "a retired explorer selling curiosities",
];

export class Visitors {
  /** @param {import("./GameSession.js").GameSession} session */
  constructor(session) {
    this.session = session;
    this.nextId = VISITOR_FIRST_ID;
    this.current = null; // { id, day }
    this.lastVisitDay = 0;
    this.isGenerating = false;
  }

  isVisitor(npcId) {
    return npcId >= VISITOR_FIRST_ID;
  }

  async update(day, hour) {
    const { current } = this;

    if (current && (hour >= VISITOR_DEPARTURE_HOUR || day !== current.day)) {
      this.depart();
      return;
    }

    if (
      !current &&
      day % VISITOR_EVERY_DAYS === 0 &&
      day > this.lastVisitDay &&
      hour >= VISITOR_ARRIVAL_HOUR &&
      hour < VISITOR_DEPARTURE_HOUR - 2
    ) {
      await this.arrive(day);
    }
  }

  async arrive(day) {
    const { session } = this;

    if (this.isGenerating) return;

    this.isGenerating = true;
    this.lastVisitDay = day;

    try {
      const sprite =
        Object.keys(SPRITES)[
          Math.floor(Math.random() * Object.keys(SPRITES).length)
        ];
      const kind = KINDS[Math.floor(Math.random() * KINDS.length)];

      const { content } = await session.llm.complete({
        cachePrefix: session.worldContext,
        system: visitorPrompt({
          context: session.worldContext,
          kind,
          look: SPRITES[sprite],
          gender: spriteGender(sprite),
          usedNames: session.cast.map((villager) => villager.name),
          season: SEASON_INFO[session.season].prompt,
          language: session.language,
        }),
        messages: [{ role: "user", content: "Create the visitor." }],
        schema: visitorSchema,
        temperature: 1,
      });

      const placeIds = new Set(session.places.map((place) => place.id));
      const routine = VISITOR_ROUTINE.filter((id) => placeIds.has(id));
      const id = this.nextId++;
      const data = {
        name: content.name.trim(),
        occupation: content.occupation.trim(),
        personality: content.personality,
        story: content.story,
        routine,
        wares: sanitizeWares(content.wares),
        work: "trading",
        likes: [],
        dislikes: [],
        secret: "",
        goal: "",
        visitor: true,
        gender: spriteGender(sprite),
        sprite,
      };

      await session.addNpc(id, data);
      this.current = { id, day };

      session.emit(protocol.AGENT_CREATED, {
        data: { agent: { id, data }, visitor: true },
      });
      session.notify(
        `${content.news.trim()} (fica até as ${VISITOR_DEPARTURE_HOUR}h)`,
        "news",
      );
      session.addNews(content.news.trim());
      await session.rememberAll(
        `[village news] A visitor arrived today and leaves in the evening: ${data.name}, ${data.occupation}. ${data.story}`,
      );
      session.emitPlayerState();
    } finally {
      this.isGenerating = false;
    }
  }

  depart() {
    const { session, current } = this;
    this.current = null;

    if (!current || !session.npcs.has(current.id)) return;

    const name = session.nameOf(current.id);
    session.removeNpc(current.id);
    session.emit(protocol.AGENT_LEFT, { agentId: current.id });
    session.notify(`${name} foi embora da vila.`, "news");
    session.emitPlayerState();
  }

  /** Who is visiting, for the prompts of the villagers. */
  describe() {
    const { session, current } = this;
    const npc = current && session.npcs.get(current.id);

    return npc
      ? `${npc.data.name} (${npc.data.occupation}) is visiting the village today and leaves in the evening.`
      : null;
  }

  toState() {
    return {
      nextId: this.nextId,
      current: this.current,
      lastVisitDay: this.lastVisitDay,
    };
  }

  restoreState(state) {
    this.nextId = state.nextId;
    this.current = state.current;
    this.lastVisitDay = state.lastVisitDay;
  }
}
