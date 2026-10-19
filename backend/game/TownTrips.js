// People travel between the island and the town of Pedravento: some days a
// villager takes the boat in the morning to spend the day in the town, or
// someone of the town comes to visit the village. They talk with the people
// there (with the player around the client shows it; otherwise it happens
// here, without the player) and bring the news back in the evening, so
// gossip and relationships cross the sea.

import * as protocol from "../protocol.js";

const TRIP_CHANCE = 0.55; // Per day
const LEAVE_HOURS = [8, 10];
const BACK_HOUR = 17;

export class TownTrips {
  /** @param {import("./GameSession.js").GameSession} session */
  constructor(session, random = Math.random) {
    this.session = session;
    this.random = random;
    this.trip = null; // { npcId, to, day, memory, partnerId }
    this.lastTripDay = 0;
    this.nextIsVisit = false; // Alternates: a villager goes, someone comes
  }

  /** Where `npcId` is today because of a trip ("town" / "village"), or null. */
  awayOf(npcId) {
    return this.trip?.npcId === npcId ? this.trip.to : null;
  }

  async update(day, hour) {
    if (this.trip && (hour >= BACK_HOUR || day > this.trip.day)) {
      await this.comeBack();
      return true;
    }

    const [from, to] = LEAVE_HOURS;
    if (
      this.trip ||
      day <= this.lastTripDay ||
      hour < from ||
      hour > to ||
      !this.session.regions.townsfolk.length
    ) {
      return false;
    }

    this.lastTripDay = day;
    if (this.random() >= TRIP_CHANCE) return false;

    const started = this.nextIsVisit
      ? await this.visit(day)
      : await this.goToTown(day);
    this.nextIsVisit = !this.nextIsVisit;
    return started;
  }

  /** A villager free today goes to spend the day in the town. */
  async goToTown(day) {
    const { session } = this;
    const busy = new Set([
      ...session.playerChat.companions.keys(),
      ...(session.playerChat.chattingWith
        ? [session.playerChat.chattingWith]
        : []),
    ]);
    const candidates = session.cast
      .map(({ slot }) => session.npcs.get(slot))
      .filter(
        (npc) =>
          npc &&
          !busy.has(npc.id) &&
          !npc.data.injured &&
          !session.social.busyNpcs.has(npc.id),
      );
    if (!candidates.length) return false;

    const npc = candidates[Math.floor(this.random() * candidates.length)];
    this.start({ npc, to: "town", day });
    session.notify(
      `${npc.data.name} pegou o barco para passar o dia em Pedravento.`,
    );
    await this.talkThere(npc, session.regions.townsfolk);
    return true;
  }

  /** Someone of the town comes to the village for the day. */
  async visit(day) {
    const { session } = this;
    const people = session.regions.townsfolk
      .map((id) => session.npcs.get(id))
      .filter((npc) => npc && !session.social.busyNpcs.has(npc.id));
    if (!people.length) return false;

    const npc = people[Math.floor(this.random() * people.length)];
    this.start({ npc, to: "village", day });
    session.notify(
      `${npc.data.name}, de Pedravento, chegou de barco para visitar a vila.`,
    );
    session.addNews(
      `${npc.data.name}, de Pedravento, veio passar o dia na vila`,
    );
    const villagers = session.cast.map(({ slot }) => slot);
    await this.talkThere(npc, villagers);
    return true;
  }

  start({ npc, to, day }) {
    this.trip = { npcId: npc.id, to, day, memory: null, partnerId: null };
    npc.data.away = to; // Saved with the NPC (the client places it there)
    this.session.emit(protocol.NPC_UPDATED, {
      agentId: npc.id,
      data: { away: to },
    });
  }

  /**
   * Without the player where the traveler went, they meet someone there
   * (one conversation, as if the player wasn't around).
   */
  async talkThere(npc, people) {
    const { session } = this;
    const where = this.trip.to === "town" ? "town" : "village";
    const playerThere =
      where === "town"
        ? session.regions.location === "town"
        : session.regions.location === "village";
    const others = people.filter(
      (id) =>
        id !== npc.id &&
        session.npcs.has(id) &&
        !session.social.busyNpcs.has(id),
    );
    if (playerThere || !others.length) return;

    const partnerId = others[Math.floor(this.random() * others.length)];
    try {
      const scene = await session.social.start(npc.id, partnerId, null, true);
      const { memories } = session.social.conversations.get(
        scene.conversationId,
      );
      await session.social.end(scene.conversationId, scene.lines.length);
      this.trip.partnerId = partnerId;
      this.trip.memory = memories?.a ?? null;
    } catch (error) {
      console.error(`[session ${session.id}] Trip conversation failed:`, error);
    }
  }

  /** The traveler goes home; what they heard there spreads. */
  async comeBack() {
    const { session } = this;
    const { npcId, to, memory, partnerId } = this.trip;
    const npc = session.npcs.get(npcId);
    this.trip = null;
    if (!npc) return;
    delete npc.data.away;

    session.emit(protocol.NPC_UPDATED, {
      agentId: npcId,
      data: { away: null },
    });

    if (to === "town") {
      session.addNews(`${npc.data.name} voltou de Pedravento com novidades`);
      const partner = partnerId ? session.nameOf(partnerId) : null;
      await session.rememberAll(
        `[village news] ${npc.data.name} spent the day in the town of Pedravento${partner ? ` and talked with ${partner}` : ""}.${memory ? ` What ${npc.data.name} tells about it: "${memory}"` : ""}`,
      );
    } else {
      await session.remember(
        npcId,
        `[my day] I spent the day visiting the island village and went back home to Pedravento by boat.`,
      );
    }
  }

  /** For the prompts of the traveler. */
  describeFor(npcId) {
    if (this.trip?.npcId !== npcId) return null;
    return this.trip.to === "town"
      ? "Today you took the boat to spend the day in the town of Pedravento; you go back to the village in the evening."
      : "Today you came by boat from Pedravento to visit the island village; you go back home in the evening.";
  }

  toState() {
    return {
      trip: this.trip,
      lastTripDay: this.lastTripDay,
      nextIsVisit: this.nextIsVisit,
    };
  }

  restoreState(state) {
    Object.assign(this, state);
  }
}
