// Requests (quests) of the villagers to the player: created by the NPCs in
// the chat (`giveQuest`), with optional deadlines, and the peace requests
// that show up when two villagers become enemies.

import { GameClock } from "./GameClock.js";
import { AMBITION_PROGRESS } from "./Ambitions.js";
import { MAX_GATHER_QUANTITY } from "./Gathering.js";

const MAX_QUEST_HOURS = 12;
// The giver goes after the player this long before a deadline
const QUEST_REMINDER_MINUTES = 60;
export const ENEMIES_AFFINITY = -5;
// Progress of the giver's goal when the player helps them
const GOAL_PROGRESS_FOR_HELP = 25;

const CALLOUTS = {
  reminder: "Viajante! Não se esqueça do meu pedido!",
  peace: "Viajante, pode me ajudar com uma coisa difícil?",
};

export class Quests {
  /** @param {import("./GameSession.js").GameSession} session */
  constructor(session) {
    this.session = session;
  }

  /** `giveQuest` tool. @returns {string|null} Why it failed, if it did. */
  give(npcId, action) {
    const { session } = this;
    const npc = session.getNpc(npcId);

    if (npc.data.visitor) {
      return "You are only visiting the village today: don't ask the traveler for requests.";
    }

    const target = action.villager
      ? session.findVillager(action.villager, npcId)
      : null;
    const hours = Math.min(
      Math.max(Math.round(action.hours) || 0, 0),
      MAX_QUEST_HOURS,
    );
    // Something to gather beyond the island (only what exists there now)
    const gatherable = session.gatherableItems().map(({ item }) => item);
    const item = gatherable.includes(action.item) ? action.item : null;
    const quantity = item
      ? Math.min(
          Math.max(Math.round(action.quantity) || 1, 1),
          MAX_GATHER_QUANTITY,
        )
      : 0;
    const quest = session.player.addQuest({
      giverId: npcId,
      targetId: target?.id ?? null,
      title: action.title || "Pedido",
      description: action.description || "",
      deadline: hours ? session.clock.totalMinutes + hours * 60 : null,
      item,
      quantity,
    });

    if (!quest) {
      return "You already asked the traveler for something. Wait until it is done.";
    }

    action.questId = quest.id;
    action.hours = hours;
    session.notify(
      `Novo pedido de ${npc.data.name}: ${quest.title}${hours ? ` (prazo: ${GameClock.formatMoment(quest.deadline)})` : ""}`,
      "quest",
    );
    session.emitPlayerState();
    return null;
  }

  /** @returns {Promise<string|null>} Why it failed, if it did. */
  async complete(npcId, questId) {
    const { session } = this;

    // Bringing things: the player must have them (they are handed over)
    const asked = session.player.quests.find(
      (candidate) => candidate.id === questId && candidate.status === "active",
    );
    if (asked?.item) {
      const owned = session.player.quantityOf(asked.item);
      if (owned < asked.quantity) {
        return `The traveler doesn't have ${asked.quantity} ${asked.item} yet (they have ${owned}). The request is not done: tell them.`;
      }
    }

    const quest = session.player.completeQuest(questId, npcId);

    if (!quest) {
      return `There is no active request #${questId} involving you.`;
    }
    if (quest.item) {
      session.player.removeItem(quest.item, quest.quantity);
    }

    const giver = session.nameOf(quest.giverId);
    session.player.changeReputation(quest.giverId, 2);
    session.changeMood(quest.giverId, 1);
    session.goals.advance(quest.giverId, GOAL_PROGRESS_FOR_HELP);
    session.runInBackground(
      session.ambitions.advance(
        quest.giverId,
        AMBITION_PROGRESS.quest,
        `O viajante ajudou: ${quest.title}`,
      ),
    );
    await session.remember(
      quest.giverId,
      `[about the traveler] The traveler helped me: ${quest.title}.`,
    );
    session.notify(`Pedido concluído: ${quest.title}`, "quest");

    if (quest.kind === "peace") {
      await session.social.makePeace(quest.giverId, quest.targetId);
    } else {
      await this.annoyEnemiesOf(quest.giverId, giver);
    }

    session.emitPlayerState();
    return null;
  }

  /** Helping someone annoys their enemies. */
  async annoyEnemiesOf(giverId, giver) {
    const { session } = this;

    for (const otherId of session.npcs.keys()) {
      if (otherId === giverId) continue;

      const { affinity } = await session.store.getRelationship(
        giverId,
        otherId,
      );

      if (affinity <= ENEMIES_AFFINITY) {
        session.player.changeReputation(otherId, -1);
        await session.remember(
          otherId,
          `[about the traveler] The traveler helped ${giver}, who I can't stand.`,
        );
        session.notify(
          `${session.nameOf(otherId)} não gostou de você ajudar ${giver} (-1)`,
          "bad",
        );
      }
    }
  }

  /**
   * Two villagers became enemies: one of them asks the player to help them
   * make peace (the other one completes it when convinced).
   */
  createPeaceRequest(aId, bId) {
    const { session } = this;
    const [giverId, targetId] =
      session.player.getReputation(aId) >= session.player.getReputation(bId)
        ? [aId, bId]
        : [bId, aId];
    const giver = session.nameOf(giverId);
    const target = session.nameOf(targetId);

    for (const [from, to, fromName, toName] of [
      [giverId, targetId, giver, target],
      [targetId, giverId, target, giver],
    ]) {
      const quest = session.player.addQuest({
        giverId: from,
        targetId: to,
        title: `Fazer as pazes entre ${fromName} e ${toName}`,
        description: `${fromName} brigou com ${toName} e quer fazer as pazes. Converse com ${toName} e convença-o a perdoar.`,
        kind: "peace",
      });

      if (quest) {
        session.notify(`Novo pedido de ${fromName}: ${quest.title}`, "quest");
        session.seekPlayer(from, {
          reason: `you had a falling out with ${toName} and regret it. You want the traveler to talk to ${toName} and help you make peace (request #${quest.id}).`,
          callout: CALLOUTS.peace,
          key: `peace:${quest.id}`,
          force: true,
        });
        session.emitPlayerState();
        return quest;
      }
    }

    return null;
  }

  /** Deadlines: the giver reminds the player, and is upset when they fail. */
  async update(now) {
    const { session } = this;

    for (const quest of session.player.questsDueSoon(
      now,
      QUEST_REMINDER_MINUTES,
    )) {
      quest.reminded = true;
      session.seekPlayer(quest.giverId, {
        reason: `the deadline of your request "${quest.title}" (${GameClock.formatMoment(quest.deadline)}) is close and you want to remind the traveler.`,
        callout: CALLOUTS.reminder,
        key: `reminder:${quest.id}`,
      });
    }

    const expired = session.player.expireQuests(now);

    for (const quest of expired) {
      const giver = session.nameOf(quest.giverId);
      session.player.changeReputation(quest.giverId, -2);
      session.changeMood(quest.giverId, -1);
      session.goals.advance(quest.giverId, -10);
      await session.remember(
        quest.giverId,
        `[about the traveler] The traveler didn't do what I asked in time: ${quest.title}.`,
      );
      session.notify(
        `Pedido não cumprido: ${quest.title}. ${giver} ficou decepcionado (-2)`,
        "bad",
      );
    }

    if (expired.length) {
      session.emitPlayerState();
    }
  }
}
