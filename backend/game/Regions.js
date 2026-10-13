// Places beyond the island, reached by boat from the pier: a forest (wood,
// mushrooms and the camp of the bandits), a mine (ore and crystals) and a
// market town (tools, seeds and buyers). The maps are in the frontend
// (tiled/regions/*.tmx); here are what the player gets from them.

import * as protocol from "../protocol.js";
import { COINS, itemKey } from "./PlayerState.js";

export const REGIONS = {
  forest: {
    name: "Floresta Sombria",
    prompt:
      "a dark forest on the coast in front of the island: wood, wild mushrooms and berries; the bandits that attack the village hide in a camp there",
  },
  mine: {
    name: "Mina do Penhasco",
    prompt:
      "an old mine in the cliffs of a nearby island: iron ore, coal and rare crystals (a pickaxe is needed)",
  },
  town: {
    name: "Vila de Pedravento",
    prompt:
      "a bigger market town across the sea: tools, seeds and merchants that buy ore, wood and crystals",
  },
};
export const VILLAGE = "village";

const TRAVEL_MINUTES = 30;
const DAY = 24 * 60;
// When things grow back (game minutes)
const RESPAWN = { tree: 2 * DAY, ore: DAY, crystal: 3 * DAY, forage: 90 };
const TOOLS = { tree: "machado", ore: "picareta", crystal: "picareta" };
const MAX_NODE = 20; // tree_0 .. tree_19, ore_0...

// Bandits guarding the camp (ids after the raids, see Bandits.js)
export const CAMP_FIRST_ID = 300;
const CAMP_RESPAWN = 3 * DAY;

// Merchants of the town: what they sell and what they buy (price per unit)
export const MERCHANTS = {
  merchant_tools: {
    name: "Ferreira Odete",
    sells: [
      ["machado", 8],
      ["picareta", 10],
      ["espada", 25],
      ["escudo de couro", 15],
    ],
    buys: [],
  },
  merchant_buyer: {
    name: "Comprador Tobias",
    sells: [],
    buys: [
      ["minério de ferro", 4],
      ["carvão", 2],
      ["cristal", 15],
      ["lenha", 1],
      ["cogumelo", 2],
    ],
  },
  merchant_seeds: {
    name: "Dona Fia",
    sells: [
      ["poção", 12],
      ["pão", 3],
      ["mel silvestre", 6],
    ],
    buys: [
      ["frutas silvestres", 2],
      ["flores", 1],
    ],
  },
};

const randomInt = (min, max, random = Math.random) =>
  min + Math.floor(random() * (max - min + 1));

/** What the player gets from a node of a region. */
export function rollNode(kind, random = Math.random) {
  if (kind === "tree") return [["lenha", randomInt(2, 3, random)]];
  if (kind === "crystal") return [["cristal", 1]];
  if (kind === "ore") {
    return random() < 0.35
      ? [["carvão", randomInt(1, 2, random)]]
      : [["minério de ferro", randomInt(1, 2, random)]];
  }
  if (kind === "forage") {
    const table = [
      ["cogumelo", 2],
      ["frutas silvestres", 2],
      ["ervas", 1],
      ["mel silvestre", 1],
    ];
    const [item, quantity] = table[Math.floor(random() * table.length)];
    return [[item, quantity]];
  }
  return [];
}

export class Regions {
  /** @param {import("./GameSession.js").GameSession} session */
  constructor(session) {
    this.session = session;
    this.location = VILLAGE;
    // "forest:tree_3" -> game minute when it grows back
    this.depleted = new Map();
    // Camp of the bandits in the forest
    this.camp = { clearedAt: null, defeated: [], chestLooted: false };
  }

  get now() {
    return this.session.clock.totalMinutes;
  }

  get campGuarded() {
    const { clearedAt } = this.camp;
    return clearedAt === null || this.now - clearedAt >= CAMP_RESPAWN;
  }

  get campBandits() {
    if (!this.campGuarded) return [];
    const count = this.session.clock.day > 6 ? 3 : 2;
    return Array.from({ length: count }, (_, i) => CAMP_FIRST_ID + i).filter(
      (id) => !this.camp.defeated.includes(id),
    );
  }

  regionName(id) {
    return id === VILLAGE ? "a vila" : (REGIONS[id]?.name ?? id);
  }

  // ---------------------------------------------------------------------------

  /** The player takes the boat (from the pier or back to it). */
  async travel(destination) {
    const { session } = this;

    if (destination !== VILLAGE && !REGIONS[destination]) {
      throw new Error(`Unknown region: ${destination}`);
    }

    this.location = destination;
    session.clock.advance(TRAVEL_MINUTES);
    session.emit(protocol.CLOCK, { data: session.clock.toJSON() });
    session.emitWorldState();

    return {
      ok: true,
      travel: destination,
      message:
        destination === VILLAGE
          ? "Você voltou de barco para a vila."
          : `Depois de meia hora de barco, você chegou: ${REGIONS[destination].name}.`,
    };
  }

  /** Bandits knocked the player out: they wake up in the village. */
  backHome() {
    this.location = VILLAGE;
  }

  /**
   * Uses a node of the region where the player is (tree, ore, crystal or
   * forage bush).
   */
  gather(kind, name) {
    const { session } = this;
    const index = Number(name.split("_")[1]);

    if (
      this.location === VILLAGE ||
      !Number.isInteger(index) ||
      index >= MAX_NODE
    ) {
      throw new Error("Invalid node");
    }

    const key = `${this.location}:${name}`;

    if ((this.depleted.get(key) ?? 0) > this.now) {
      return {
        ok: false,
        message: {
          tree: "Só sobrou o toco. A árvore vai crescer de novo.",
          ore: "Essa pedra já foi minerada.",
          crystal: "O cristal já foi tirado daqui.",
          forage: "Você já colheu tudo deste arbusto.",
        }[kind],
      };
    }

    const tool = TOOLS[kind];
    if (tool && !session.player.hasItem(tool)) {
      return {
        ok: false,
        message: `Você precisa de ${tool === "machado" ? "um machado" : "uma picareta"} (a Ferreira Odete vende na Vila de Pedravento).`,
      };
    }

    if (kind === "tree" && session.clock.period === "night") {
      return { ok: false, message: "Está escuro demais para cortar árvores." };
    }

    this.depleted.set(key, this.now + RESPAWN[kind]);
    const loot = rollNode(kind);
    loot.forEach(([item, quantity]) => session.player.addItem(item, quantity));
    session.emitPlayerState();
    session.emitWorldState();

    const got = loot
      .map(([item, quantity]) => `${quantity} ${item}`)
      .join(", ");
    return {
      ok: true,
      item: loot[0]?.[0],
      quantity: loot[0]?.[1],
      message: {
        tree: `Você derrubou a árvore e conseguiu ${got}.`,
        ore: `Você minerou ${got}.`,
        crystal: `Raro! Você tirou ${got}.`,
        forage: `Você colheu ${got}.`,
      }[kind],
    };
  }

  // ---------------------------------------------------------------------------
  // Camp of the bandits

  isCampBandit(id) {
    return id >= CAMP_FIRST_ID && id < CAMP_FIRST_ID + 10;
  }

  async campBanditDefeated(id) {
    const { session } = this;

    if (!this.campBandits.includes(id)) {
      throw new Error(`Bandit ${id} is not in the camp`);
    }

    this.camp.defeated.push(id);

    if (this.campBandits.length === 0) {
      this.camp = { clearedAt: this.now, defeated: [], chestLooted: false };
      // Without their camp, the bandits skip their next raid
      const { bandits } = session;
      bandits.lastRaidDay = Math.max(
        bandits.lastRaidDay,
        session.clock.day + 3 - ((session.clock.day + 3) % 3),
      );

      for (const villager of session.cast) {
        session.player.changeReputation(villager.slot, 1);
      }
      session.notify(
        "Você expulsou os bandidos do acampamento! O próximo ataque à vila foi adiado (+1 com todos).",
        "good",
      );
      session.addNews(
        "O viajante desmontou o acampamento dos bandidos na floresta",
      );
      session.emitPlayerState();
      await session.rememberAll(
        "[village news] The traveler went to the forest and drove the bandits out of their camp. They won't attack the village for a while.",
      );
    }

    session.emitWorldState();
  }

  openCampChest() {
    const { session } = this;

    if (this.location !== "forest") throw new Error("Not in the forest");

    if (this.campGuarded) {
      return {
        ok: false,
        message: "Os bandidos guardam o baú. Derrote-os primeiro.",
      };
    }
    if (this.camp.chestLooted) {
      return { ok: false, message: "O baú dos bandidos está vazio." };
    }

    this.camp.chestLooted = true;
    const coins = randomInt(20, 40);
    const item = ["poção", "espada", "escudo de couro", "mapa antigo"][
      randomInt(0, 3)
    ];
    session.player.addItem(COINS, coins);
    session.player.addItem(item, 1);
    session.emitPlayerState();
    session.emitWorldState();
    return {
      ok: true,
      item,
      quantity: 1,
      message: `O baú dos bandidos tinha ${coins} moedas e ${item}!`,
    };
  }

  // ---------------------------------------------------------------------------
  // Merchants of the town

  trade(merchantId, mode, index) {
    const { session } = this;
    const merchant = MERCHANTS[merchantId];

    if (this.location !== "town" || !merchant) throw new Error("No merchant");

    const offer = (mode === "buy" ? merchant.sells : merchant.buys)[index];
    if (!offer) throw new Error("Invalid offer");

    const [item, price] = offer;

    if (mode === "buy") {
      if (!session.player.removeItem(COINS, price)) {
        return { ok: false, message: `${item} custa ${price} moedas.` };
      }
      session.player.addItem(item, 1);
      session.emitPlayerState();
      return {
        ok: true,
        item,
        quantity: 1,
        message: `Você comprou ${item} de ${merchant.name} por ${price} moedas.`,
      };
    }

    // Sells all the units of the item
    const owned =
      session.player.items.find(
        (candidate) => itemKey(candidate.name) === itemKey(item),
      )?.quantity ?? 0;

    if (!owned) return { ok: false, message: `Você não tem ${item}.` };

    session.player.removeItem(item, owned);
    session.player.addItem(COINS, owned * price);
    session.emitPlayerState();
    return {
      ok: true,
      message: `Você vendeu ${owned} ${item} para ${merchant.name} por ${owned * price} moedas.`,
    };
  }

  // ---------------------------------------------------------------------------

  toJSON() {
    const now = this.now;

    return {
      location: this.location,
      depleted: [...this.depleted]
        .filter(([, until]) => until > now)
        .map(([key]) => key),
      camp: {
        bandits: this.campBandits,
        guarded: this.campGuarded,
        chestLooted: this.camp.chestLooted,
      },
    };
  }

  toState() {
    return {
      location: this.location,
      depleted: [...this.depleted],
      camp: this.camp,
    };
  }

  restoreState(state) {
    this.location = state.location;
    this.depleted = new Map(state.depleted);
    this.camp = state.camp;
  }
}
