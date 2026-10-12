// NPCs that go after the player because they have something to tell them
// (a clue, a reminder, something they heard...). The reason is used to greet
// the player when they open the chat with that NPC.

// Game minutes between two NPCs going after the player
export const SEEK_COOLDOWN_MINUTES = 20;
// A reason older than this is forgotten (game minutes)
export const SEEK_REASON_TTL_MINUTES = 240;

export class SeekPlanner {
  constructor() {
    this.pending = new Map(); // npcId -> { reason, at }
    this.availableAt = 0;
    // One-time triggers that already happened (e.g. "clue:3")
    this.used = new Set();
  }

  /**
   * @param {number} npcId
   * @param {object} options
   * @param {string} options.reason What the NPC wants to tell (English).
   * @param {number} options.now Game minutes.
   * @param {string} [options.key] Makes the trigger happen only once.
   * @param {boolean} [options.force] Ignore the cooldown (e.g. the NPC
   *   decided it in a conversation the player saw).
   * @returns {boolean} Whether the NPC goes after the player.
   */
  request(npcId, { reason, now, key = null, force = false }) {
    if ((key && this.used.has(key)) || this.pending.has(npcId)) {
      return false;
    }

    if (!force && now < this.availableAt) {
      return false;
    }

    if (key) {
      this.used.add(key);
    }

    this.pending.set(npcId, { reason, at: now });
    this.availableAt = now + SEEK_COOLDOWN_MINUTES;
    return true;
  }

  toState() {
    return {
      pending: [...this.pending],
      availableAt: this.availableAt,
      used: [...this.used],
    };
  }

  restoreState(state) {
    this.pending = new Map(state.pending);
    this.availableAt = state.availableAt;
    this.used = new Set(state.used);
  }

  /** The reason the NPC wanted to talk (removed), if still relevant. */
  take(npcId, now) {
    const pending = this.pending.get(npcId);
    this.pending.delete(npcId);

    return pending && now - pending.at <= SEEK_REASON_TTL_MINUTES
      ? pending.reason
      : null;
  }
}
