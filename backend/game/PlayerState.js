// Everything about the player (the traveler): reputation with each NPC,
// inventory, requests (quests), who they met and the news they saw. It is
// sent to the frontend journal as `player_state`.

export const MIN_REPUTATION = -10;
export const MAX_REPUTATION = 10;
export const MAX_ITEMS_PER_GIFT = 5;
export const MAX_NEWS = 30;
export const COINS = "moedas";

const clampReputation = (value) =>
  Math.min(MAX_REPUTATION, Math.max(MIN_REPUTATION, value));

// "Pão ", "pao" and "PÃO" are the same item
export const itemKey = (name) =>
  name.trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export class PlayerState {
  constructor({ startingItems = { [COINS]: 10 } } = {}) {
    this.reputation = new Map(); // npcId -> -10..10
    this.inventory = new Map(); // itemKey -> { name, quantity }
    this.quests = [];
    this.nextQuestId = 1;
    this.met = new Set();
    this.news = []; // { text, time }

    Object.entries(startingItems).forEach(([name, quantity]) =>
      this.addItem(name, quantity),
    );
  }

  getReputation(npcId) {
    return this.reputation.get(npcId) ?? 0;
  }

  /** @returns {number} The new reputation. */
  changeReputation(npcId, delta) {
    const value = clampReputation(this.getReputation(npcId) + delta);
    this.reputation.set(npcId, value);
    return value;
  }

  /** The player met the NPC or the NPC has an opinion of them. */
  knows(npcId) {
    return this.met.has(npcId) || this.getReputation(npcId) !== 0;
  }

  get averageReputation() {
    const values = [...this.reputation.values()];
    return values.length
      ? values.reduce((sum, value) => sum + value, 0) / values.length
      : 0;
  }

  addItem(name, quantity = 1) {
    const key = itemKey(name);
    if (!key || quantity <= 0) return;

    const item = this.inventory.get(key) ?? { name: name.trim(), quantity: 0 };
    item.quantity += quantity;
    this.inventory.set(key, item);
  }

  quantityOf(name) {
    return this.inventory.get(itemKey(name))?.quantity ?? 0;
  }

  hasItem(name, quantity = 1) {
    return (this.inventory.get(itemKey(name))?.quantity ?? 0) >= quantity;
  }

  /** @returns {boolean} Whether the player had the item. */
  removeItem(name, quantity = 1) {
    const key = itemKey(name);
    if (!this.hasItem(name, quantity)) return false;

    const item = this.inventory.get(key);
    item.quantity -= quantity;
    if (item.quantity === 0) this.inventory.delete(key);
    return true;
  }

  get items() {
    return [...this.inventory.values()].map(({ name, quantity }) => ({
      name,
      quantity,
    }));
  }

  activeQuestFrom(giverId) {
    return this.quests.find(
      (quest) => quest.giverId === giverId && quest.status === "active",
    );
  }

  /** Active quests where the NPC is the giver or the villager involved. */
  questsInvolving(npcId) {
    return this.quests.filter(
      (quest) =>
        quest.status === "active" &&
        (quest.giverId === npcId || quest.targetId === npcId),
    );
  }

  /**
   * @param {object} quest
   * @param {number|null} [quest.deadline] Game minute (clock total minutes)
   *   until which the quest can be done; null when there is no hurry.
   * @param {string} [quest.kind] "request", or "peace" (make two enemies
   *   make peace).
   * @returns {object|null} The quest, or null if the giver has one active.
   */
  addQuest({
    giverId,
    targetId = null,
    title,
    description,
    deadline = null,
    kind = "request",
    item = null,
    quantity = 0,
  }) {
    if (this.activeQuestFrom(giverId)) {
      return null;
    }

    const quest = {
      id: this.nextQuestId++,
      giverId,
      targetId,
      title: title.trim(),
      description: description.trim(),
      deadline,
      kind,
      // Something to bring (gathered beyond the island), or null
      item,
      quantity: item ? quantity : 0,
      status: "active", // active | completed | failed
      reminded: false, // The giver already reminded the player of the deadline
    };
    this.quests.push(quest);
    return quest;
  }

  /**
   * Completes a quest of which `npcId` is the giver or the villager involved.
   * @returns {object|null} The completed quest.
   */
  completeQuest(questId, npcId) {
    const quest = this.questsInvolving(npcId).find(
      (candidate) => candidate.id === Number(questId),
    );

    if (!quest) {
      return null;
    }

    quest.status = "completed";
    return quest;
  }

  /** Active quests whose deadline passed; they become failed. */
  expireQuests(now) {
    const expired = this.quests.filter(
      (quest) =>
        quest.status === "active" &&
        quest.deadline !== null &&
        quest.deadline <= now,
    );
    expired.forEach((quest) => (quest.status = "failed"));
    return expired;
  }

  /** Active quests ending in less than `minutes` not reminded yet. */
  questsDueSoon(now, minutes) {
    return this.quests.filter(
      (quest) =>
        quest.status === "active" &&
        quest.deadline !== null &&
        !quest.reminded &&
        quest.deadline - now <= minutes,
    );
  }

  addNews(text, time) {
    this.news = [...this.news, { text, time }].slice(-MAX_NEWS);
  }

  /**
   * @param {object} options
   * @param {(npcId: number) => string} options.nameOf
   * @param {(totalMinutes: number) => string} [options.formatTime] Formats
   *   the deadline of the quests.
   */
  /** Everything, to save the game (see GameSession.toState). */
  toState() {
    return {
      reputation: [...this.reputation],
      inventory: [...this.inventory],
      quests: this.quests,
      nextQuestId: this.nextQuestId,
      met: [...this.met],
      news: this.news,
    };
  }

  restoreState(state) {
    this.reputation = new Map(state.reputation);
    this.inventory = new Map(state.inventory);
    this.quests = state.quests;
    this.nextQuestId = state.nextQuestId;
    this.met = new Set(state.met);
    this.news = state.news;
  }

  toJSON({ nameOf, formatTime = String }) {
    return {
      reputation: [...this.reputation].map(([npcId, value]) => ({
        npcId,
        name: nameOf(npcId),
        value,
      })),
      inventory: this.items,
      quests: this.quests.map((quest) => ({
        ...quest,
        giver: nameOf(quest.giverId),
        target: quest.targetId ? nameOf(quest.targetId) : null,
        deadlineLabel:
          quest.deadline === null ? null : formatTime(quest.deadline),
      })),
      met: [...this.met],
      news: this.news,
    };
  }
}
