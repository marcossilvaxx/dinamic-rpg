// Bandit raids: every few days a group of bandits comes into the village.
// The villagers hide (see the frontend systems/time.js) and the player can
// fight them. Defeating all of them makes the player the protector of the
// village; if nobody stops them, they rob a seller and leave.

export const RAID_EVERY_DAYS = 3;
export const RAID_HOUR = 15;
// How long the bandits stay if nobody stops them (game minutes)
export const RAID_MINUTES = 2 * 60;
// Bandit ids start here (villagers are 1..N, visitors from 100)
export const BANDIT_FIRST_ID = 200;
const RAID_PLACES = ["east_meadow", "south_road", "north_meadow"];
const BANDIT_SPRITES = ["ninjaM", "warriorM", "rangerM", "ninjaF"];
const VICTORY_REPUTATION = 2;
// Chance of the bandits setting the victim's home on fire
const FIRE_CHANCE = 0.5;
// What the bandits may leave behind
const LOOT = ["adaga", "moedas", "moedas", "escudo de couro"];

export class Bandits {
  /** @param {import("./GameSession.js").GameSession} session */
  constructor(session) {
    this.session = session;
    // { placeId, bandits: [{ id, name, sprite }], until, remaining: [ids] }
    this.raid = null;
    this.lastRaidDay = 0;
  }

  get isActive() {
    return Boolean(this.raid);
  }

  async update(day, hour, now) {
    if (this.raid && now >= this.raid.until) {
      await this.end(false);
      return;
    }

    if (
      !this.raid &&
      day % RAID_EVERY_DAYS === 0 &&
      day > this.lastRaidDay &&
      hour >= RAID_HOUR &&
      hour < RAID_HOUR + 2
    ) {
      this.start(day);
    }
  }

  start(day, random = Math.random) {
    const { session } = this;
    const placeIds = new Set(session.places.map((place) => place.id));
    const placeId =
      RAID_PLACES.find((id) => placeIds.has(id)) ??
      session.places[0]?.id ??
      null;
    const count = Math.min(2 + Math.floor(day / 6), 4);
    const bandits = Array.from({ length: count }, (_, i) => ({
      id: BANDIT_FIRST_ID + i,
      name: i === 0 ? "Chefe dos bandidos" : "Bandido",
      sprite: BANDIT_SPRITES[Math.floor(random() * BANDIT_SPRITES.length)],
      leader: i === 0,
    }));

    this.lastRaidDay = day;
    this.raid = {
      placeId,
      bandits,
      until: session.clock.totalMinutes + RAID_MINUTES,
      remaining: bandits.map((bandit) => bandit.id),
    };

    const place =
      session.places.find((candidate) => candidate.id === placeId)?.name ??
      "a vila";
    session.notify(
      `Bandidos vindos da Floresta Sombria estão atacando a vila (${place})! Os moradores se escondem.`,
      "bad",
    );
    session.addNews(`${count} bandidos invadiram a vila pelo ${place}`);
    session.emitWorldState();
    session.runInBackground(
      session.rememberAll(
        `[village news] ${count} bandits are attacking the village near ${place}! Everybody is hiding.`,
      ),
    );
  }

  /**
   * The player beat a bandit.
   * @returns {{item: string|null, quantity: number}} What it left behind.
   */
  async defeat(banditId, random = Math.random) {
    const { session, raid } = this;

    if (!raid?.remaining.includes(banditId)) {
      throw new Error(`Bandit ${banditId} is not in the village`);
    }

    raid.remaining = raid.remaining.filter((id) => id !== banditId);
    const item = LOOT[Math.floor(random() * LOOT.length)];
    const quantity = item === "moedas" ? 5 + Math.floor(random() * 10) : 1;
    session.player.addItem(item, quantity);
    session.notify(`O bandido deixou cair: ${quantity} ${item}`, "item");

    if (raid.remaining.length === 0) {
      await this.end(true);
    }

    session.emitPlayerState();
    return { item, quantity };
  }

  /** The bandits beat the player: they take some coins. */
  playerKnockedOut() {
    const lost = this.session.combat.robPlayer();
    this.session.notify(
      `Os bandidos te derrubaram${lost ? ` e levaram ${lost} moedas` : ""}`,
      "bad",
    );
    this.session.emitPlayerState();
  }

  /** The raid is over: beaten by the player, or the bandits left. */
  async end(defeated, random = Math.random) {
    const { session } = this;
    const placeId = this.raid?.placeId ?? null;
    this.raid = null;

    if (defeated) {
      const { combat } = session;
      const previousTitle = combat.title;
      combat.record.defenses++;

      for (const villager of session.cast) {
        session.player.changeReputation(villager.slot, VICTORY_REPUTATION);
      }

      session.notify(
        `Você expulsou os bandidos! A vila inteira agradece (+${VICTORY_REPUTATION})`,
        "good",
      );
      session.addNews("O viajante expulsou os bandidos da vila");

      if (combat.title !== previousTitle) {
        session.notify(`Agora a vila te chama de "${combat.title}"`, "good");
      }

      await session.rememberAll(
        "[village news] The traveler fought the bandits alone and drove them out of the village. We are safe thanks to them.",
      );
    } else {
      const sellers = [...session.npcs.values()].filter(
        (npc) => session.isVillager(npc.id) && npc.data.wares?.length,
      );
      const victim = sellers[Math.floor(Math.random() * sellers.length)];

      if (victim) {
        for (const ware of victim.data.wares) {
          session.commerce.changeStock(victim.id, ware.item, -99);
        }
      }

      // They leave a mess behind (the player can help to repair it)
      session.villageMap.addWrecks(placeId, victim?.id ?? null);

      // ... and sometimes set the victim's home on fire
      const home = victim?.data.routine?.[0];
      if (home && session.isBuilding(home) && random() < FIRE_CHANCE) {
        session.terrain.burn(home);
      }

      session.npcs.forEach((_, id) => session.changeMood(id, -1));
      const text = victim
        ? `Os bandidos foram embora levando as mercadorias de ${victim.data.name}`
        : "Os bandidos foram embora";
      session.notify(text, "bad");
      session.addNews(text);
      await session.rememberAll(
        `[village news] The bandits left the village${victim ? ` after robbing ${victim.data.name}` : ""}. Nobody stopped them.`,
      );
    }

    session.emitWorldState();
    session.emitPlayerState();
  }

  /** For the world state (frontend) and the prompts. */
  toJSON() {
    const { raid } = this;

    return raid
      ? {
          placeId: raid.placeId,
          until: raid.until,
          bandits: raid.bandits.filter((bandit) =>
            raid.remaining.includes(bandit.id),
          ),
        }
      : null;
  }

  describe() {
    return this.raid
      ? "Bandits are attacking the village right now! You are scared and hiding."
      : null;
  }

  toState() {
    return { raid: this.raid, lastRaidDay: this.lastRaidDay };
  }

  restoreState(state) {
    this.raid = state.raid;
    this.lastRaidDay = state.lastRaidDay;
  }
}
