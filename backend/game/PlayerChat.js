// The chat of the player with an NPC: greetings, messages (streamed as the
// NPC "types"), the actions (tools) the NPC takes and the summary when the
// chat ends.

import { NPC_TOOL_RESULTS } from "../agents/npcTools.js";
import { COINS, MAX_ITEMS_PER_GIFT } from "./PlayerState.js";

const MAX_COINS_PER_GIFT = 20;

const signed = (value) => `${value > 0 ? "+" : ""}${value}`;

export class PlayerChat {
  /** @param {import("./GameSession.js").GameSession} session */
  constructor(session) {
    this.session = session;
    // Friend walking with the player during the chat with an NPC:
    // chatNpcId -> companionId
    this.companions = new Map();
  }

  /**
   * The player opened the chat: the NPC speaks first when it has a reason
   * (it went after the player, or there is something pending between them).
   *
   * @param {object} [options]
   * @param {number|null} [options.companionId] NPC walking with the player.
   * @param {() => void} [options.onTyping]
   * @param {(content: string) => void} [options.onDelta] Partial answer.
   * @returns {Promise<{content: string|null, actions: object[]}|null>} null
   *   when the NPC waits for the player to talk.
   */
  async greet(
    npcId,
    { companionId = null, onTyping = () => {}, onDelta } = {},
  ) {
    const { session } = this;
    const npc = session.getNpc(npcId);

    this.setCompanion(npcId, companionId);

    const reason = session.seeking.take(npcId, session.clock.totalMinutes);
    const hasTalked = (await session.store.getMemory(npcId)).length > 0;
    const hasQuests = session.player.questsInvolving(npcId).length > 0;

    if (!reason && !hasTalked && !hasQuests) {
      return null;
    }

    onTyping();
    session.player.met.add(npcId);
    session.lastChatAt.set(npcId, session.clock.totalMinutes);

    const note = `[Narrator: the traveler walks up to talk to you${hasTalked ? " again" : ""}. Speak first, in ${session.language}, in 1 or 2 sentences: greet them${
      reason
        ? ` and tell them why you went looking for them: ${reason}`
        : ", mentioning naturally what you talked about last time or what is pending between you (requests, deals)"
    }.]`;

    const { content, actions } = await npc.greet(note, { onDelta });
    session.emitPlayerState();

    return { content, actions };
  }

  /** Who walks with the player while chatting with `npcId`. */
  setCompanion(npcId, companionId) {
    const { session } = this;

    if (companionId && companionId !== npcId && session.npcs.has(companionId)) {
      this.companions.set(npcId, companionId);
    } else {
      this.companions.delete(npcId);
    }
  }

  /** The companion of the player, for the dialog prompt of `npcId`. */
  describeCompanion(npcId) {
    const { session } = this;
    const companionId = this.companions.get(npcId);

    if (!companionId) return null;

    const companion = session.getNpc(companionId);
    const bond = session.bonds.get(companionId);
    const clue = session.mystery?.isOpen
      ? session.mystery.clues.get(companionId)
      : null;

    return `${companion.data.name} is walking with the traveler${bond ? ` (${bond.replace("_", " ")} of the traveler)` : ""} and stands by them. Because of that you are a bit more open and honest with the traveler.${clue && bond ? ` ${companion.data.name} reminds you of what they know about "${session.mystery.title}": ${clue}` : ""}`;
  }

  /**
   * Chats with an NPC. The reputation of the player with the NPC changes with
   * what they say, and the NPC remembers why (and may gossip about it).
   */
  async chat(npcId, message, { onDelta } = {}) {
    const { session } = this;
    const npc = session.getNpc(npcId);
    session.player.met.add(npcId);
    session.lastChatAt.set(npcId, session.clock.totalMinutes);

    const { content, actions, reputationChange, reputationReason } =
      await npc.chat(message, { onDelta });

    if (reputationChange) {
      session.player.changeReputation(npcId, reputationChange);
      session.changeMood(npcId, Math.sign(reputationChange));
      session.notify(
        `${npc.data.name} ${reputationChange > 0 ? "gostou" : "não gostou"} disso (${signed(reputationChange)})`,
        reputationChange > 0 ? "good" : "bad",
      );

      if (reputationReason) {
        await session.remember(
          npcId,
          `[about the traveler] ${reputationReason}`,
        );
      }
    }

    session.bonds.decay();
    session.emitPlayerState();

    return { content, actions };
  }

  /**
   * Validates and applies the tools called by an NPC in the chat.
   * @returns {Promise<object[]>} Each action with `ok` and `result` (the
   *   message the model receives).
   */
  async resolveActions(npcId, actions) {
    const resolved = [];

    for (const action of actions) {
      const failure = await this.applyAction(npcId, action);

      resolved.push({
        ...action,
        ok: !failure,
        // Some actions write a more specific result (e.g. the price paid)
        result: failure ?? action.result ?? NPC_TOOL_RESULTS[action.action],
      });
    }

    return resolved;
  }

  /** @returns {Promise<string|null>} Why the action failed, if it did. */
  async applyAction(npcId, action) {
    const { session } = this;
    const npc = session.getNpc(npcId);

    switch (action.action) {
      case "endConversation":
      case "followPlayer":
      case "stopFollowPlayer":
        return null;

      case "guidePlayerTo":
        return session.places.some((place) => place.id === action.placeId)
          ? null
          : "That place doesn't exist.";

      case "introducePlayerTo": {
        const target = session.findVillager(action.villager, npcId);

        if (!target) {
          return "That villager doesn't exist.";
        }

        action.targetId = target.id;
        session.player.met.add(target.id);
        await session.remember(
          target.id,
          `[meeting the traveler] ${npc.data.name} brought the traveler to meet me.`,
        );
        return null;
      }

      case "giveQuest":
        return session.quests.give(npcId, action);

      case "completeQuest":
        return session.quests.complete(npcId, action.questId);

      case "giveItem": {
        const isCoins = action.item?.trim().toLowerCase() === COINS;
        const quantity = Math.min(
          Math.max(Math.round(action.quantity) || 1, 1),
          isCoins ? MAX_COINS_PER_GIFT : MAX_ITEMS_PER_GIFT,
        );

        if (!action.item?.trim()) {
          return "No item given.";
        }

        session.investigation.onItemGiven(npcId, action);
        session.player.addItem(action.item, quantity);
        action.quantity = quantity;
        session.notify(`Você recebeu ${quantity} ${action.item}`, "item");
        session.emitPlayerState();
        return null;
      }

      case "takeItem": {
        const quantity = Math.max(Math.round(action.quantity) || 1, 1);

        if (action.accept === false) {
          action.result = NPC_TOOL_RESULTS.refuseItem;
          return null;
        }

        if (!action.item || !session.player.removeItem(action.item, quantity)) {
          return "The traveler doesn't have that. Tell them.";
        }

        action.quantity = quantity;
        session.notify(`Você entregou ${quantity} ${action.item}`, "item");

        if (action.gift) {
          action.result = `You have it now. ${await session.bonds.gift(npcId, action.item)}`;
        }

        session.emitPlayerState();
        return null;
      }

      case "sellItem":
        return session.commerce.sell(npcId, action);

      case "buyItem":
        return session.commerce.buy(npcId, action);

      case "confess":
        return session.investigation.confess(npcId);

      case "setBond":
        return session.bonds.set(npcId, action.bond);

      case "acceptInvitation":
        return session.bonds.acceptInvitation(npcId);

      case "startSparring":
        return session.combat.startSparring(npcId);

      case "startFight":
        return session.combat.startFight(npcId, action.kind);

      default:
        return "Unknown function.";
    }
  }

  /**
   * The chat ended: the NPC remembers it and, during a mystery, what it
   * claimed goes to the journal of the player.
   * @returns {Promise<string|null>} The fact the NPC remembers.
   */
  async summarize(npcId) {
    const { session } = this;
    this.companions.delete(npcId);

    const { fact, testimony } = await session.getNpc(npcId).summarizeChat();

    if (testimony) {
      session.investigation.addTestimony(npcId, testimony);
      session.emitPlayerState();
    }

    return fact;
  }
}
