// Relationship of the player with each villager beyond the reputation:
// friendship, best friends, romance or rivalry. Also gifts (each villager
// loves and hates some things), inviting someone to the gathering of the day
// and friends that walk with the player helping in the investigation.

import * as protocol from "../protocol.js";
import { itemKey } from "./PlayerState.js";

export const BONDS = {
  friend: { label: "Amigo(a)", minReputation: 4 },
  best_friend: { label: "Melhor amigo(a)", minReputation: 7 },
  romance: { label: "Namorando", minReputation: 6 },
  rival: { label: "Rival", maxReputation: -4 },
};

// A bond ends when the reputation falls this far below its minimum
const BOND_DECAY_MARGIN = 3;
const GIFT_LOVED_BONUS = 2;
const GIFT_HATED_PENALTY = -1;
// Companions on the gathering of the day
const FESTIVAL_INVITE_REPUTATION = 3;
const FESTIVAL_DATE_BONUS = 1;

const matches = (item, list = []) => {
  const key = itemKey(item);
  return list.some((entry) => {
    const other = itemKey(entry);
    return other && (key.includes(other) || other.includes(key));
  });
};

/** Whether `reputation` is enough for `bond`. */
export function canHaveBond(bond, reputation) {
  const rule = BONDS[bond];
  if (!rule) return false;
  if (rule.minReputation !== undefined) return reputation >= rule.minReputation;
  return reputation <= rule.maxReputation;
}

export class Bonds {
  /** @param {import("./GameSession.js").GameSession} session */
  constructor(session) {
    this.session = session;
    this.bonds = new Map(); // npcId -> bond
    // Villagers that accepted to go to today's gathering: npcId -> day
    this.dates = new Map();
    this.datesStarted = new Set(); // "npcId:day" already called
  }

  get(npcId) {
    return this.bonds.get(npcId) ?? null;
  }

  get romanceId() {
    return [...this.bonds].find(([, bond]) => bond === "romance")?.[0] ?? null;
  }

  /** `setBond` tool. @returns {string|null} Why it failed, if it did. */
  async set(npcId, bond) {
    const { session } = this;
    const npc = session.getNpc(npcId);
    const reputation = session.player.getReputation(npcId);
    const previous = this.get(npcId);

    if (bond === "none") {
      if (!previous) return "There is nothing to end.";
      this.bonds.delete(npcId);
      if (previous === "romance") session.player.changeReputation(npcId, -2);
      session.notify(
        previous === "romance"
          ? `Você e ${npc.data.name} terminaram`
          : `${npc.data.name} não é mais ${BONDS[previous].label.toLowerCase()}`,
        "bad",
      );
      await session.remember(
        npcId,
        `[about the traveler] I'm not ${previous.replace("_", " ")} with the traveler anymore.`,
      );
      session.emitPlayerState();
      return null;
    }

    if (!BONDS[bond]) {
      return "Unknown relationship.";
    }

    if (!canHaveBond(bond, reputation)) {
      return `Your opinion of the traveler (${reputation}) doesn't allow that yet. Don't do it.`;
    }

    if (bond === "romance" && this.romanceId && this.romanceId !== npcId) {
      return `The traveler is already in a relationship with ${session.nameOf(this.romanceId)}. Say how you feel about that.`;
    }

    if (npc.data.visitor && bond !== "friend") {
      return "You are only visiting the village today.";
    }

    this.bonds.set(npcId, bond);

    const texts = {
      friend: [`${npc.data.name} agora é seu amigo(a)!`, "good"],
      best_friend: [`${npc.data.name} agora é seu melhor amigo(a)!`, "good"],
      romance: [`Você e ${npc.data.name} estão namorando! ♥`, "good"],
      rival: [`${npc.data.name} agora é seu rival`, "bad"],
    };
    session.notify(...texts[bond]);

    if (bond === "romance" || bond === "rival") {
      session.addNews(
        bond === "romance"
          ? `O viajante e ${npc.data.name} estão namorando`
          : `${npc.data.name} declarou o viajante seu rival`,
      );
      await session.rememberAll(
        `[village news] ${npc.data.name} and the traveler ${bond === "romance" ? "are in a romantic relationship" : "are rivals now"}.`,
      );
    } else {
      await session.remember(
        npcId,
        `[about the traveler] The traveler and I are ${bond.replace("_", " ")}s now.`,
      );
    }

    session.emitPlayerState();
    return null;
  }

  /**
   * The player gave `item` to the NPC as a gift (`takeItem` with gift).
   * @returns {string} What the NPC thinks of it (for the model).
   */
  async gift(npcId, item) {
    const { session } = this;
    const npc = session.getNpc(npcId);

    if (matches(item, npc.data.likes)) {
      session.player.changeReputation(npcId, GIFT_LOVED_BONUS);
      session.changeMood(npcId, 2);
      session.notify(
        `${npc.data.name} adorou o presente! (+${GIFT_LOVED_BONUS})`,
        "good",
      );
      await session.remember(
        npcId,
        `[about the traveler] The traveler gave me ${item}, one of my favorite things.`,
      );
      return "It is one of your favorite things: you love it! Show it.";
    }

    if (matches(item, npc.data.dislikes)) {
      session.player.changeReputation(npcId, GIFT_HATED_PENALTY);
      session.notify(
        `${npc.data.name} não gostou do presente (${GIFT_HATED_PENALTY})`,
        "bad",
      );
      return "You dislike this. Be honest about it (politely or not, as you are).";
    }

    await session.remember(
      npcId,
      `[about the traveler] The traveler gave me ${item}.`,
    );
    return "A nice gift. Thank them.";
  }

  /** `acceptInvitation` tool. @returns {string|null} Why it failed. */
  async acceptInvitation(npcId) {
    const { session } = this;
    const festival = session.life.festival;
    const day = session.clock.day;

    if (!festival || festival.day !== day || festival.status === "over") {
      return "There is no gathering in the village today anymore. Tell the traveler.";
    }

    if (session.player.getReputation(npcId) < FESTIVAL_INVITE_REPUTATION) {
      return "You don't like the traveler enough to go with them. Refuse.";
    }

    const otherDate = [...this.dates].find(
      ([otherId, date]) => date === day && otherId !== npcId,
    );
    if (otherDate && this.get(npcId) === "romance") {
      // Jealousy: the partner doesn't like it
      session.player.changeReputation(npcId, -1);
    }

    this.dates.set(npcId, day);
    session.notify(
      `${session.nameOf(npcId)} vai com você a: ${festival.title} (${festival.startHour}h)`,
      "festival",
    );
    await session.remember(
      npcId,
      `[about the traveler] The traveler invited me to go to "${festival.title}" together today.`,
    );
    session.emitPlayerState();
    return null;
  }

  /** At the start of the gathering the dates meet the player. */
  async update(day) {
    const { session } = this;
    const festival = session.life.festival;

    if (festival?.day !== day) return;

    for (const [npcId, date] of this.dates) {
      const key = `${npcId}:${day}`;
      if (date !== day || !session.npcs.has(npcId)) continue;

      if (festival.status === "active" && !this.datesStarted.has(key)) {
        this.datesStarted.add(key);
        session.emit(protocol.NPC_FOLLOW, {
          agentId: npcId,
          data: {
            callout: `Vamos juntos para ${festival.title}?`,
            durationMs:
              (festival.endHour - festival.startHour) *
              60 *
              session.clock.msPerGameMinute,
          },
        });
      }

      if (festival.status === "over" && this.datesStarted.has(key)) {
        this.dates.delete(npcId);
        session.player.changeReputation(npcId, FESTIVAL_DATE_BONUS);
        session.notify(
          `${session.nameOf(npcId)} gostou de ir à festa com você (+${FESTIVAL_DATE_BONUS})`,
          "good",
        );
        await session.remember(
          npcId,
          `[about the traveler] I went to "${festival.title}" with the traveler. It was nice.`,
        );
      }
    }
  }

  /** Bonds fade when the reputation falls too much. */
  decay() {
    const { session } = this;

    for (const [npcId, bond] of this.bonds) {
      const rule = BONDS[bond];
      const reputation = session.player.getReputation(npcId);
      const lost =
        rule.minReputation !== undefined
          ? reputation < rule.minReputation - BOND_DECAY_MARGIN
          : reputation > rule.maxReputation + BOND_DECAY_MARGIN;

      if (lost) {
        this.bonds.delete(npcId);
        session.notify(
          bond === "romance"
            ? `${session.nameOf(npcId)} terminou com você`
            : `Você e ${session.nameOf(npcId)} se afastaram`,
          "bad",
        );
      }
    }
  }

  /** The relationship with the traveler, for the dialog prompt. */
  describeFor(npcId) {
    const bond = this.get(npcId);
    const romanceId = this.romanceId;
    const lines = [];

    if (bond === "friend") lines.push("You and the traveler are friends.");
    if (bond === "best_friend")
      lines.push(
        "The traveler is your best friend: you trust them completely.",
      );
    if (bond === "romance")
      lines.push(
        "You and the traveler are in a romantic relationship: be affectionate.",
      );
    if (bond === "rival")
      lines.push(
        "The traveler is your rival: you compete with them and tease them.",
      );
    if (romanceId && romanceId !== npcId)
      lines.push(`The traveler is dating ${this.session.nameOf(romanceId)}.`);
    if (this.dates.get(npcId) === this.session.clock.day)
      lines.push("You agreed to go to today's gathering with the traveler.");

    return lines.join(" ");
  }

  toJSON() {
    return [...this.bonds].map(([npcId, bond]) => ({
      npcId,
      bond,
      label: BONDS[bond].label,
      date: this.dates.get(npcId) === this.session.clock.day,
    }));
  }

  toState() {
    return {
      bonds: [...this.bonds],
      dates: [...this.dates],
      datesStarted: [...this.datesStarted],
    };
  }

  restoreState(state) {
    this.bonds = new Map(state.bonds);
    this.dates = new Map(state.dates);
    this.datesStarted = new Set(state.datesStarted);
  }
}
