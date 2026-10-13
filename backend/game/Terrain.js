// The land changing with the life of the village: paths worn on the grass
// where people walk a lot (they grow back with time) and buildings set on
// fire by the bandits, rebuilt by the villagers (faster with the player's
// help).

// Wear of a grass tile: 0..100, shown from VISIBLE_WEAR
const MAX_WEAR = 100;
const VISIBLE_WEAR = 15;
// Every day the grass grows back a little
const DAILY_REGROWTH = 0.8;
const MAX_WEAR_ENTRIES = 400;
const MAX_WEAR_PER_REPORT = 20;
// Rebuilding a burned building: per day by the villagers, and with the help
// of the player (who brings wood)
const DAILY_REBUILD = 50;
const HELP_REBUILD = 25;
const HELP_WOOD = 2;
const HELP_REPUTATION = 2;
const WOOD = "lenha";

export class Terrain {
  /** @param {import("./GameSession.js").GameSession} session */
  constructor(session) {
    this.session = session;
    this.wear = new Map(); // tile index -> 0..100
    // Buildings on fire / being rebuilt: placeId -> { progress, since }
    this.burned = new Map();
    this.lastDay = null;
  }

  /**
   * People walked on these tiles of the village (reported by the client).
   * @param {[number, number][]} entries [tile index, steps]
   * @param {number} tiles Number of tiles of the village map.
   */
  addWear(entries, tiles) {
    if (!Array.isArray(entries)) return;

    for (const entry of entries.slice(0, MAX_WEAR_ENTRIES)) {
      const [index, steps] = Array.isArray(entry) ? entry.map(Number) : [];
      if (!Number.isInteger(index) || index < 0 || index >= tiles) continue;
      if (!(steps > 0)) continue;

      const amount = Math.min(steps, MAX_WEAR_PER_REPORT);
      this.wear.set(
        index,
        Math.min(MAX_WEAR, (this.wear.get(index) ?? 0) + amount),
      );
    }
  }

  /** Runs with the session tick (once per day for the slow changes). */
  async update(day) {
    if (this.lastDay === null) {
      this.lastDay = day;
      return false;
    }

    if (day === this.lastDay) return false;

    const days = day - this.lastDay;
    this.lastDay = day;

    for (const [index, wear] of this.wear) {
      const next = wear * DAILY_REGROWTH ** days;
      if (next < 5) this.wear.delete(index);
      else this.wear.set(index, next);
    }

    for (const [placeId, fire] of this.burned) {
      await this.rebuild(placeId, fire, DAILY_REBUILD * days);
    }

    return true;
  }

  isBurned(placeId) {
    return this.burned.has(placeId);
  }

  /** The bandits set a building on fire. */
  burn(placeId) {
    const { session } = this;
    if (!placeId || this.burned.has(placeId)) return;

    this.burned.set(placeId, {
      progress: 0,
      since: session.clock.totalMinutes,
    });

    const place = session.life.placeName(placeId);
    session.notify(`Os bandidos incendiaram: ${place}!`, "bad");
    session.addNews(`Os bandidos incendiaram ${place}`);
    session.runInBackground(
      session.rememberAll(
        `[village news] The bandits set ${place} on fire. It must be rebuilt; nobody can go in until then.`,
      ),
    );
  }

  async rebuild(placeId, fire, amount) {
    const { session } = this;
    fire.progress = Math.min(100, fire.progress + amount);

    if (fire.progress < 100) return;

    this.burned.delete(placeId);
    const place = session.life.placeName(placeId);
    session.notify(`${place} foi reconstruída!`, "good");
    session.addNews(`Os moradores terminaram de reconstruir ${place}`);
    await session.rememberAll(
      `[village news] ${place} was rebuilt after the fire.`,
    );
  }

  /** The player helps to rebuild (F at the door, with wood). */
  async help(placeId) {
    const { session } = this;
    const fire = this.burned.get(placeId);

    if (!fire)
      return { ok: false, message: "Não há nada para reconstruir aqui." };

    if (!session.player.removeItem(WOOD, HELP_WOOD)) {
      return {
        ok: false,
        message: `Para ajudar na reconstrução, traga ${HELP_WOOD} ${WOOD}.`,
      };
    }

    const residents = [...session.npcs.values()].filter(
      (npc) => session.isVillager(npc.id) && npc.data.routine?.[0] === placeId,
    );
    for (const npc of residents) {
      session.player.changeReputation(npc.id, HELP_REPUTATION);
      session.runInBackground(
        session.remember(
          npc.id,
          "[village life] The traveler brought wood and helped to rebuild my home after the fire.",
        ),
      );
    }

    await this.rebuild(placeId, fire, HELP_REBUILD);
    session.emitWorldState();
    session.emitPlayerState();

    const thanks = residents.length
      ? ` ${residents.map((npc) => npc.data.name).join(" e ")} agradece (+${HELP_REPUTATION}).`
      : "";
    return {
      ok: true,
      message: this.burned.has(placeId)
        ? `Você ajudou na reconstrução (${this.burned.get(placeId).progress}%).${thanks}`
        : `Você ajudou a terminar a reconstrução!${thanks}`,
    };
  }

  describe() {
    if (this.burned.size === 0) return null;

    return [...this.burned.keys()]
      .map(
        (placeId) =>
          `${this.session.life.placeName(placeId)} burned down in a bandit attack and is being rebuilt`,
      )
      .join("; ");
  }

  toJSON() {
    return {
      wear: [...this.wear]
        .filter(([, wear]) => wear >= VISIBLE_WEAR)
        .map(([index, wear]) => [index, Math.round(wear)]),
      burned: [...this.burned].map(([placeId, { progress }]) => ({
        placeId,
        progress,
      })),
    };
  }

  toState() {
    return {
      wear: [...this.wear],
      burned: [...this.burned],
      lastDay: this.lastDay,
    };
  }

  restoreState(state) {
    this.wear = new Map(state.wear);
    this.burned = new Map(state.burned);
    this.lastDay = state.lastDay;
  }
}
