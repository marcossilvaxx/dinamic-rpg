// Life between the NPCs: conversations when they meet (and what the player
// overhears), relationships (friends, enemies, making peace) and the gossip
// about the player.

import * as protocol from "../protocol.js";
import { hearsayChange } from "./hearsay.js";
import { describeMood } from "./needs.js";
import { clampAffinity, generateNpcConversation } from "./NpcConversation.js";
import { AMBITION_PROGRESS } from "./Ambitions.js";

// Affinity from which two NPCs are friends / enemies (visible in the game)
export const FRIENDS_AFFINITY = 5;
export const ENEMIES_AFFINITY = -5;
// Affinity of two NPCs that just made peace
const PEACE_AFFINITY = 1;

const CALLOUTS = {
  curious: "Ei, você é o viajante de quem todos falam?",
  confront: "Ei, você! Precisamos conversar.",
};

export const relationshipStatus = (affinity) =>
  affinity >= FRIENDS_AFFINITY
    ? "friends"
    : affinity <= ENEMIES_AFFINITY
      ? "enemies"
      : "neutral";

const signed = (value) => `${value > 0 ? "+" : ""}${value}`;

export class NpcSocial {
  /** @param {import("./GameSession.js").GameSession} session */
  constructor(session) {
    this.session = session;
    // Conversations generated and not ended yet, by id
    this.conversations = new Map();
    this.nextConversationId = 1;
    // NPCs that are in a conversation (being generated or played)
    this.busyNpcs = new Set();
  }

  /** The client left: conversations being played are lost. */
  reset() {
    this.conversations.clear();
    this.busyNpcs.clear();
  }

  async getRelationships() {
    const { session } = this;
    const ids = [...session.npcs.keys()];
    const pairs = [];

    for (let i = 0; i < ids.length; i++) {
      for (let j = i + 1; j < ids.length; j++) {
        const relationship = await session.store.getRelationship(
          ids[i],
          ids[j],
        );
        if (relationship.talks > 0 || relationship.couple) {
          pairs.push({
            a: ids[i],
            b: ids[j],
            affinity: relationship.affinity,
            couple: relationship.couple?.status ?? null,
          });
        }
      }
    }

    return pairs;
  }

  /** How an NPC is described in a conversation scene. */
  async describe(npc) {
    const { session } = this;

    return {
      ...npc.data,
      mood: describeMood(session.moods.get(npc.id) ?? 0),
      opinionOfTraveler: {
        value: session.player.getReputation(npc.id),
        met: session.player.met.has(npc.id),
      },
      goal: session.goals.describeFor(npc.id),
      ambition: session.ambitions.describeFor(npc.id),
      family: await session.family.describeFor(npc.id, { thirdPerson: true }),
    };
  }

  /**
   * Generates the conversation of two NPCs that met in the map. Its effects
   * on memory are only applied when the frontend reports how much of it was
   * shown (`end`), since the player can interrupt it.
   *
   * @param {boolean} isPrivate Nobody is around: the NPCs speak freely (and
   *   the player may be eavesdropping from a distance).
   */
  async start(aId, bId, placeId = null, isPrivate = false) {
    const { session } = this;
    const a = session.getNpc(aId);
    const b = session.getNpc(bId);

    if (aId === bId || this.busyNpcs.has(aId) || this.busyNpcs.has(bId)) {
      throw new Error(`NPCs ${aId} and ${bId} can't talk now`);
    }

    this.busyNpcs.add(aId);
    this.busyNpcs.add(bId);

    try {
      const [factsA, factsB, relationship] = await Promise.all([
        session.store.getFacts(aId),
        session.store.getFacts(bId),
        session.store.getRelationship(aId, bId),
      ]);
      const { mystery } = session;
      // NPCs also gossip about the clues of the mystery, and the culprit may
      // slip up when they think they are alone
      const withMystery = (facts, npcId) =>
        [
          ...facts,
          mystery?.gossipFor(npcId),
          isPrivate ? mystery?.slipFor(npcId) : null,
        ].filter(Boolean);
      const { weather, festival, season } = session.life.describe();

      const scene = await generateNpcConversation({
        llm: session.llm,
        a: await this.describe(a),
        b: await this.describe(b),
        factsA: withMystery(factsA, aId),
        factsB: withMystery(factsB, bId),
        relationship: {
          ...relationship,
          lastTalkSummary: relationship.lastTalk[aId] ?? "",
        },
        context: session.worldContext,
        location: session.places.find((place) => place.id === placeId) ?? null,
        time: `${session.clock.format()} (${session.clock.period})`,
        weather: `${weather}; ${season}`,
        festival,
        isPrivate,
        language: session.language,
        temperature: session.dialogTemperature,
      });

      const conversationId = this.nextConversationId++;
      this.conversations.set(conversationId, { a: aId, b: bId, ...scene });

      const idOf = (speaker) => (speaker === "a" ? aId : bId);

      return {
        conversationId,
        a: aId,
        b: bId,
        isPrivate,
        lines: scene.lines.map(({ speaker, text, emotion }) => ({
          speakerId: idOf(speaker),
          text,
          emotion,
        })),
        outcome: {
          action: scene.outcome.action,
          targetId: scene.outcome.target ? idOf(scene.outcome.target) : null,
          callout: scene.outcome.callout,
        },
      };
    } catch (error) {
      this.busyNpcs.delete(aId);
      this.busyNpcs.delete(bId);
      throw error;
    }
  }

  /**
   * Applies a conversation to the NPCs memories, moods and relationship.
   *
   * @param {number} conversationId
   * @param {number} shownLines How many lines were shown before it ended.
   * @param {number|null} interruptedBy NPC the player started talking to, if
   *   the player interrupted the conversation.
   * @param {boolean} noticedPlayer The NPCs caught the player eavesdropping.
   */
  async end(
    conversationId,
    shownLines,
    interruptedBy = null,
    noticedPlayer = false,
  ) {
    const { session } = this;
    const conversation = this.conversations.get(conversationId);

    if (!conversation) {
      return;
    }

    this.conversations.delete(conversationId);

    const {
      a: aId,
      b: bId,
      lines,
      memories,
      affinityDelta,
      outcome,
      aboutTraveler,
      ambition = { a: "none", b: "none" },
      ambitionNote = { a: "", b: "" },
    } = conversation;
    this.busyNpcs.delete(aId);
    this.busyNpcs.delete(bId);

    const shown = Math.min(Math.max(Number(shownLines) || 0, 0), lines.length);

    // A visitor may have left in the meantime
    if (shown === 0 || !session.npcs.has(aId) || !session.npcs.has(bId)) {
      return;
    }

    const a = session.getNpc(aId);
    const b = session.getNpc(bId);
    const relationship = await session.store.getRelationship(aId, bId);
    const statusBefore = relationshipStatus(relationship.affinity);
    relationship.talks++;

    if (shown === lines.length && !noticedPlayer) {
      relationship.affinity = clampAffinity(
        relationship.affinity + affinityDelta,
      );
      relationship.lastTalk = { [aId]: memories.a, [bId]: memories.b };
      session.changeMood(aId, Math.sign(affinityDelta));
      session.changeMood(bId, Math.sign(affinityDelta));

      await Promise.all([
        session.remember(aId, `[talking with ${b.data.name}] ${memories.a}`),
        session.remember(bId, `[talking with ${a.data.name}] ${memories.b}`),
      ]);

      if (aboutTraveler) {
        await this.spreadOpinion(a, b);
      }

      // Their big ambitions may move with what they talked about
      for (const [speaker, npcId] of [
        ["a", aId],
        ["b", bId],
      ]) {
        const amount = AMBITION_PROGRESS[ambition[speaker]];
        if (amount) {
          await session.ambitions.advance(
            npcId,
            amount,
            ambitionNote[speaker] || "",
          );
        }
      }

      // The client already makes the NPC go after the player; the server
      // keeps the reason for the greeting
      if (outcome.action === "go_to_player" && outcome.target) {
        const targetId = outcome.target === "a" ? aId : bId;
        session.seekPlayer(targetId, {
          reason: memories[outcome.target],
          force: true,
        });
      }
    } else {
      const excerpt = lines
        .slice(0, shown)
        .map(
          ({ speaker, text }) =>
            `${(speaker === "a" ? a : b).data.name}: "${text}"`,
        )
        .join(" ");
      const summary = `(interrupted by the traveler) ${excerpt}`;

      relationship.lastTalk = { [aId]: summary, [bId]: summary };

      await Promise.all([
        session.remember(aId, `[talking with ${b.data.name}] ${summary}`),
        session.remember(bId, `[talking with ${a.data.name}] ${summary}`),
      ]);
    }

    if (noticedPlayer) {
      await this.caughtEavesdropping(a, b);
    }

    await session.store.setRelationship(aId, bId, relationship);
    session.emit(protocol.RELATIONSHIPS, {
      data: [
        {
          a: aId,
          b: bId,
          affinity: relationship.affinity,
          couple: relationship.couple?.status ?? null,
        },
      ],
    });

    const statusAfter = relationshipStatus(relationship.affinity);
    if (statusAfter !== statusBefore) {
      await this.announceRelationship(a, b, statusAfter, statusBefore);
    }

    if (interruptedBy === aId || interruptedBy === bId) {
      session.getNpc(interruptedBy).interruptedConversationWith = (
        interruptedBy === aId ? b : a
      ).data.name;
    }
  }

  /** Two NPCs noticed the player listening to their private talk. */
  async caughtEavesdropping(a, b) {
    const { session } = this;

    for (const [npc, other] of [
      [a, b],
      [b, a],
    ]) {
      session.player.changeReputation(npc.id, -1);
      await session.remember(
        npc.id,
        `[about the traveler] I caught the traveler eavesdropping on my private talk with ${other.data.name}.`,
      );
    }

    session.notify(
      `${a.data.name} e ${b.data.name} perceberam que você estava escutando (-1)`,
      "bad",
    );
    session.emitPlayerState();
  }

  /**
   * Gossip about the player: when two NPCs talk about the traveler, each
   * one's opinion moves towards the other's.
   */
  async spreadOpinion(a, b) {
    const { session } = this;
    const changes = [
      [a, b],
      [b, a],
    ]
      .filter(([speaker]) => session.player.knows(speaker.id))
      .map(([speaker, listener]) => ({
        speaker,
        listener,
        change: hearsayChange(
          session.player.getReputation(speaker.id),
          session.player.getReputation(listener.id),
        ),
      }))
      .filter(({ change }) => change !== 0);

    for (const { speaker, listener, change } of changes) {
      const hadMet = session.player.met.has(listener.id);
      const opinion = session.player.changeReputation(listener.id, change);

      await session.remember(
        listener.id,
        `[about the traveler] ${speaker.data.name} told me ${change > 0 ? "good" : "bad"} things about the traveler.`,
      );
      session.notify(
        `Boatos: ${listener.data.name} ouviu ${speaker.data.name} falar ${change > 0 ? "bem" : "mal"} de você (${signed(change)})`,
        change > 0 ? "good" : "bad",
      );

      // Villagers that never met the player get curious (or upset)
      if (!hadMet && (opinion >= 2 || opinion <= -3)) {
        const isGood = opinion > 0;
        session.seekPlayer(listener.id, {
          reason: isGood
            ? `you heard good things about the traveler from ${speaker.data.name} and wanted to meet them.`
            : `you heard bad things about the traveler from ${speaker.data.name} and want to ask them about it.`,
          callout: isGood ? CALLOUTS.curious : CALLOUTS.confront,
          key: `hearsay:${listener.id}:${isGood ? "good" : "bad"}`,
        });
      }
    }

    if (changes.length) {
      session.emitPlayerState();
    }
  }

  /** The player convinced two enemies to make peace (peace request). */
  async makePeace(aId, bId) {
    const { session } = this;
    const relationship = await session.store.getRelationship(aId, bId);
    const before = relationshipStatus(relationship.affinity);

    relationship.affinity = Math.max(relationship.affinity, PEACE_AFFINITY);
    relationship.lastTalk = {
      [aId]: `The traveler helped us make peace.`,
      [bId]: `The traveler helped us make peace.`,
    };
    await session.store.setRelationship(aId, bId, relationship);

    session.player.changeReputation(bId, 2);
    session.changeMood(aId, 2);
    session.changeMood(bId, 2);
    session.emit(protocol.RELATIONSHIPS, {
      data: [{ a: aId, b: bId, affinity: relationship.affinity }],
    });

    const [a, b] = [session.getNpc(aId), session.getNpc(bId)];
    session.addNews(
      `${a.data.name} e ${b.data.name} fizeram as pazes graças ao viajante`,
    );
    session.notify(
      `${a.data.name} e ${b.data.name} fizeram as pazes graças a você!`,
      "good",
    );

    if (before === "enemies") {
      await session.rememberAll(
        `[village news] ${a.data.name} and ${b.data.name} made peace, thanks to the traveler.`,
      );
    }
  }

  /** Friendships and fights become news of the village. */
  async announceRelationship(a, b, status, previous) {
    const { session } = this;
    const names = `${a.data.name} e ${b.data.name}`;
    const [text, fact] =
      status === "friends"
        ? [
            `${names} agora são grandes amigos`,
            `${a.data.name} and ${b.data.name} became good friends.`,
          ]
        : status === "enemies"
          ? [
              `${names} brigaram e não se falam mais`,
              `${a.data.name} and ${b.data.name} had a falling out.`,
            ]
          : previous === "enemies"
            ? [
                `${names} fizeram as pazes`,
                `${a.data.name} and ${b.data.name} made peace.`,
              ]
            : [
                `${names} se afastaram`,
                `${a.data.name} and ${b.data.name} are not so close anymore.`,
              ];

    session.addNews(text);
    session.notify(text, "news");
    session.emitPlayerState();
    await session.rememberAll(`[village news] ${fact}`);

    // Enemies: one of them asks the player to help them make peace
    if (
      status === "enemies" &&
      session.isVillager(a.id) &&
      session.isVillager(b.id)
    ) {
      session.quests.createPeaceRequest(a.id, b.id);
    }
  }

  toState() {
    return { nextConversationId: this.nextConversationId };
  }

  restoreState(state) {
    this.nextConversationId = state.nextConversationId;
  }
}
