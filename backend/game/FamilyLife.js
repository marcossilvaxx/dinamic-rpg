// Family life of the villagers over the days: close friends start dating,
// get engaged, marry (the wedding is the gathering of the day), move in
// together and have children. Couples whose affinity falls apart break up.

import * as protocol from "../protocol.js";

export const FAMILY_UPDATE_HOUR = 7;
const DATING_AFFINITY = 8;
const DATING_MIN_TALKS = 4;
const ENGAGED_AFFINITY = 9;
const BREAKUP_AFFINITY = 3;
const DATING_CHANCE = 0.5;
const BIRTH_CHANCE = 0.4;
const DAYS_BEFORE_ENGAGEMENT = 1;
const DAYS_BEFORE_CHILD = 2;

export class FamilyLife {
  /** @param {import("./GameSession.js").GameSession} session */
  constructor(session) {
    this.session = session;
    this.lastUpdateDay = 1;
    // Couples of the village, for the journal: "a:b" -> { a, b, ...couple }
    this.couples = new Map();
  }

  /** Pairs of villagers (from the cast) with their relationship. */
  async pairs() {
    const { session } = this;
    const ids = session.cast.map((villager) => villager.slot);
    const pairs = [];

    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        pairs.push({
          a: ids[i],
          b: ids[j],
          relationship: await session.store.getRelationship(ids[i], ids[j]),
        });
      }
    }

    return pairs;
  }

  /** The partner of a villager (dating, engaged or married), if any. */
  async partnerOf(npcId) {
    for (const { a, b, relationship } of await this.pairs()) {
      if (relationship.couple && (a === npcId || b === npcId)) {
        return { partnerId: a === npcId ? b : a, couple: relationship.couple };
      }
    }
    return null;
  }

  async update(day, hour, random = Math.random) {
    if (hour < FAMILY_UPDATE_HOUR || day <= this.lastUpdateDay) return;

    this.lastUpdateDay = day;
    const pairs = await this.pairs();
    const taken = new Set(
      pairs
        .filter(({ relationship }) => relationship.couple)
        .flatMap(({ a, b }) => [a, b]),
    );
    // The villager dating the player doesn't date others
    const romanceId = this.session.bonds.romanceId;
    if (romanceId) taken.add(romanceId);

    for (const { a, b, relationship } of pairs) {
      const { couple } = relationship;

      if (!couple) {
        if (
          !taken.has(a) &&
          !taken.has(b) &&
          relationship.affinity >= DATING_AFFINITY &&
          relationship.talks >= DATING_MIN_TALKS &&
          random() < DATING_CHANCE
        ) {
          taken.add(a);
          taken.add(b);
          await this.change(a, b, relationship, {
            status: "dating",
            since: day,
          });
        }
      } else if (
        couple.status !== "married" &&
        relationship.affinity < BREAKUP_AFFINITY
      ) {
        await this.change(a, b, relationship, null);
      } else if (
        couple.status === "dating" &&
        day - couple.since >= DAYS_BEFORE_ENGAGEMENT &&
        relationship.affinity >= ENGAGED_AFFINITY
      ) {
        await this.change(a, b, relationship, {
          status: "engaged",
          since: day,
        });
        this.session.life.planWedding(a, b);
      } else if (
        couple.status === "married" &&
        !couple.child &&
        day - couple.since >= DAYS_BEFORE_CHILD &&
        random() < BIRTH_CHANCE
      ) {
        await this.change(a, b, relationship, { ...couple, child: day });
      }
    }
  }

  /** Changes the couple status of a pair, announcing it to the village. */
  async change(a, b, relationship, couple) {
    const { session } = this;
    const previous = relationship.couple;
    relationship.couple = couple;
    await session.store.setRelationship(a, b, relationship);

    if (couple) {
      this.couples.set(`${a}:${b}`, { a, b, ...couple });
    } else {
      this.couples.delete(`${a}:${b}`);
    }

    const names = `${session.nameOf(a)} e ${session.nameOf(b)}`;
    const [text, fact] = !couple
      ? [
          `${names} terminaram o namoro`,
          `${session.nameOf(a)} and ${session.nameOf(b)} broke up.`,
        ]
      : couple.child && !previous?.child
        ? [
            `${names} tiveram um bebê!`,
            `${session.nameOf(a)} and ${session.nameOf(b)} had a baby.`,
          ]
        : {
            dating: [
              `${names} estão namorando`,
              `${session.nameOf(a)} and ${session.nameOf(b)} are dating.`,
            ],
            engaged: [
              `${names} ficaram noivos! O casamento vai ser a próxima festa da vila.`,
              `${session.nameOf(a)} and ${session.nameOf(b)} are engaged; the wedding is the next gathering of the village.`,
            ],
            married: [
              `${names} se casaram!`,
              `${session.nameOf(a)} and ${session.nameOf(b)} got married.`,
            ],
          }[couple.status];

    session.addNews(text);
    session.notify(text, "news");
    session.emitPlayerState();
    await session.rememberAll(`[village news] ${fact}`);
  }

  /** The wedding (gathering of the day) ended: they marry and move in. */
  async marry(a, b) {
    const { session } = this;
    const relationship = await session.store.getRelationship(a, b);

    await this.change(a, b, relationship, {
      status: "married",
      since: session.clock.day,
    });

    // One of them moves to the other's home (the first place of the routine)
    const [stay, move] = [session.getNpc(a), session.getNpc(b)];
    const home = stay.data.routine[0];

    if (home && move.data.routine[0] !== home) {
      move.data.routine = [
        home,
        ...move.data.routine.filter((p) => p !== home),
      ];
      await session.store.setNpc(move.id, move.data);
      session.emit(protocol.NPC_UPDATED, {
        agentId: move.id,
        data: { routine: move.data.routine },
      });
      session.addNews(
        `${move.data.name} se mudou para a casa de ${stay.data.name}`,
      );
    }
  }

  /**
   * Couple status of the NPC, for the prompts ("You are dating X", or "Ana
   * is dating X" with `thirdPerson`).
   */
  async describeFor(npcId, { thirdPerson = false } = {}) {
    const partner = await this.partnerOf(npcId);

    if (!partner) return null;

    const name = this.session.nameOf(partner.partnerId);
    const who = thirdPerson ? `${this.session.nameOf(npcId)} is` : "You are";
    const { status, child } = partner.couple;
    const text = {
      dating: `${who} dating ${name}.`,
      engaged: `${who} engaged to ${name}; the wedding is soon.`,
      married: `${who} married to ${name}.`,
    }[status];

    return child ? `${text} They have a baby together.` : text;
  }

  toJSON() {
    const { nameOf } = this.session;

    return [...this.couples.values()].map(({ a, b, status, child }) => ({
      names: [nameOf(a), nameOf(b)],
      status,
      child: Boolean(child),
    }));
  }

  toState() {
    return { lastUpdateDay: this.lastUpdateDay, couples: [...this.couples] };
  }

  restoreState(state) {
    this.lastUpdateDay = state.lastUpdateDay;
    this.couples = new Map(state.couples);
  }
}
