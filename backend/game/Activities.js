// Things the player can do by themselves: fishing at the pier and gathering
// in the fields (a timing minigame in the frontend). What they find depends
// on the season and on how well they did; the items can be sold to the
// villagers or given as gifts.

export const ACTIVITIES = {
  fishing: { places: ["dock"], label: "Pescar" },
  gathering: {
    places: ["north_meadow", "east_meadow", "garden"],
    label: "Colher",
  },
};

// Game minutes before the player can do the same activity again
export const ACTIVITY_COOLDOWN_MINUTES = 15;

// What can be found: [item, weight, rare]
const LOOT = {
  fishing: {
    spring: [
      ["peixe", 6],
      ["truta", 3, true],
      ["bota velha", 1],
    ],
    summer: [
      ["peixe", 6],
      ["peixe grande", 3, true],
      ["concha", 2],
    ],
    autumn: [
      ["peixe", 6],
      ["enguia", 2, true],
      ["bota velha", 2],
    ],
    winter: [
      ["peixe", 4],
      ["bacalhau", 2, true],
      ["bota velha", 3],
    ],
  },
  gathering: {
    spring: [
      ["flores", 6],
      ["ervas", 4],
      ["mel silvestre", 1, true],
    ],
    summer: [
      ["frutas silvestres", 6],
      ["ervas", 4],
      ["flores", 2],
    ],
    autumn: [
      ["cogumelo", 6],
      ["castanhas", 4],
      ["trufa", 1, true],
    ],
    winter: [
      ["lenha", 6],
      ["pinhas", 3],
      ["erva de inverno", 1, true],
    ],
  },
};

const pickWeighted = (entries, random) => {
  const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
  let roll = random() * total;

  for (const entry of entries) {
    roll -= entry[1];
    if (roll < 0) return entry;
  }

  return entries.at(-1);
};

/**
 * What the player finds.
 * @param {"miss"|"hit"|"perfect"} result Of the minigame.
 * @returns {{item: string, quantity: number, rare: boolean}|null}
 */
export function rollLoot(kind, season, result, random = Math.random) {
  if (result === "miss") return null;

  const table = LOOT[kind]?.[season];
  if (!table) return null;

  // A perfect timing triples the chance of the rare things
  const entries =
    result === "perfect"
      ? table.map(([item, weight, rare]) => [
          item,
          rare ? weight * 3 : weight,
          rare,
        ])
      : table;
  const [item, , rare = false] = pickWeighted(entries, random);

  return { item, quantity: result === "perfect" && !rare ? 2 : 1, rare };
}

export class Activities {
  /** @param {import("./GameSession.js").GameSession} session */
  constructor(session) {
    this.session = session;
    this.lastDone = new Map(); // kind -> game minute
  }

  /**
   * @param {string} kind fishing | gathering
   * @param {string} result miss | hit | perfect
   * @returns {{ok: boolean, message: string, item?: string, quantity?: number}}
   */
  perform(kind, result) {
    const { session } = this;

    if (!ACTIVITIES[kind] || !["miss", "hit", "perfect"].includes(result)) {
      throw new Error("Invalid activity");
    }

    const now = session.clock.totalMinutes;
    const last = this.lastDone.get(kind) ?? -Infinity;

    if (now - last < ACTIVITY_COOLDOWN_MINUTES) {
      return {
        ok: false,
        message:
          kind === "fishing"
            ? "Os peixes se assustaram. Espere um pouco."
            : "Você já colheu tudo por aqui. Espere um pouco.",
      };
    }

    if (kind === "gathering" && session.clock.period === "night") {
      return { ok: false, message: "Está escuro demais para colher agora." };
    }

    this.lastDone.set(kind, now);
    const loot = rollLoot(kind, session.season, result);

    if (!loot) {
      return {
        ok: true,
        message: kind === "fishing" ? "O peixe escapou!" : "Não achou nada.",
      };
    }

    session.player.addItem(loot.item, loot.quantity);
    session.emitPlayerState();

    return {
      ok: true,
      item: loot.item,
      quantity: loot.quantity,
      message: `${loot.rare ? "Raro! " : ""}Você conseguiu ${loot.quantity} ${loot.item}.`,
    };
  }

  toState() {
    return { lastDone: [...this.lastDone] };
  }

  restoreState(state) {
    this.lastDone = new Map(state.lastDone);
  }
}
