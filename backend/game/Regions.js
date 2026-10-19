// Places beyond the island, reached by boat from the pier: a forest (wood,
// mushrooms and the camp of the bandits), a mine (ore and crystals) and a
// market town (tools, seeds and buyers). The maps are generated in the
// frontend (world/island/regions.js); here is what the player gets from
// them and how they change (`levels`).

import { SPRITES, spriteGender } from "../prompts/npcGeneration.js";
import { townsfolkPrompt, townsfolkSchema } from "../prompts/townsfolk.js";
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

// Small islands nobody lives on, found by exploring the open sea (in this
// order). Their maps are generated in the frontend too.
export const ISLETS = {
  islet_1: {
    name: "Ilha das Gaivotas",
    prompt: "a small rocky island full of seagulls, with berries and driftwood",
  },
  islet_2: {
    name: "Rochedo do Farol",
    prompt: "a cliff island with the ruins of an old lighthouse",
  },
  islet_3: {
    name: "Ilha do Naufrágio",
    prompt: "a sandy island where an old ship ran aground long ago",
  },
};
const EXPLORE_MINUTES = 60;
const ISLET_LOOT = [
  "mapa antigo",
  "concha rara",
  "poção",
  "garrafa com bilhete",
];

const TRAVEL_MINUTES = 30;
const DAY = 24 * 60;
// When things grow back (game minutes)
const RESPAWN = { tree: 2 * DAY, ore: DAY, crystal: 3 * DAY, forage: 90 };
const TOOLS = { tree: "machado", ore: "picareta", crystal: "picareta" };
const MAX_NODE = 20; // tree_0 .. tree_19, ore_0...

// How the regions change with what the player does there (levels 0..3 of
// the forest, 0..2 of the mine and the town; the frontend draws them)
const FOREST_GROWTH_DAYS = 2; // Days without cutting for the forest to grow
const MAX_FOREST_GROWTH = 3;
const MINE_GALLERIES = [10, 25]; // Rocks and crystals mined
const TOWN_BUILDINGS = [40, 120]; // Coins earned selling in the town

const levelOf = (value, thresholds) =>
  thresholds.filter((threshold) => value >= threshold).length;

// People of the town (created the first time the player goes there)
export const TOWNSFOLK_FIRST_ID = 400;
const TOWNSFOLK = 3;

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
    // People living in the town (NPC ids), created on the first visit
    this.townsfolk = [];
    this.isCreatingTownsfolk = false;
    // What changes the regions (see `levels`)
    this.growth = { forest: 0, forestSince: 1, mined: 0, sold: 0 };
    // Islets found at sea (ids, in the order they were found) and the
    // chests already opened there
    this.discovered = [];
    this.isletChests = [];
  }

  /** The place `id` (region or islet found), or null. */
  placeOf(id) {
    return (
      REGIONS[id] ?? (this.discovered.includes(id) ? ISLETS[id] : null) ?? null
    );
  }

  /** How much each region changed: forest, mine and town. */
  get levels() {
    return {
      forest: this.growth.forest,
      mine: levelOf(this.growth.mined, MINE_GALLERIES),
      town: levelOf(this.growth.sold, TOWN_BUILDINGS),
    };
  }

  /**
   * The forest grows where nobody cuts it: every few days without felling
   * trees, new ones are big enough to be cut. Returns whether it changed.
   */
  async update(day) {
    const { growth } = this;
    if (
      growth.forest >= MAX_FOREST_GROWTH ||
      day - growth.forestSince < FOREST_GROWTH_DAYS
    ) {
      return false;
    }

    growth.forest++;
    growth.forestSince = day;
    this.session.addNews(
      "A Floresta Sombria cresceu: há árvores novas para cortar perto da trilha",
    );
    await this.session.rememberAll(
      "[village news] Nobody has cut trees in the forest for days: it is growing thicker, with new trees near the trail.",
    );
    return true;
  }

  /** A level of the mine or the town went up: everybody hears about it. */
  async levelUp(region, before) {
    const { session } = this;
    const level = this.levels[region];
    if (level <= before) return;

    const news = {
      mine: [
        "Os mineiros abriram uma galeria nova na Mina do Penhasco, com mais minério",
        "[village news] So much ore was taken from the mine that a new gallery was opened in it, with more ore and crystals.",
      ],
      town: [
        "Pedravento está crescendo com o comércio: construíram um prédio novo na cidade",
        "[village news] The trade of the traveler made the town of Pedravento richer: a new building was built there.",
      ],
    }[region];
    session.notify(`${news[0]}!`, "good");
    session.addNews(news[0]);
    session.emitWorldState();
    await session.rememberAll(news[1]);
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
    return id === VILLAGE
      ? "a vila"
      : (REGIONS[id]?.name ?? ISLETS[id]?.name ?? id);
  }

  // ---------------------------------------------------------------------------

  /** The player takes the boat (from the pier or back to it). */
  async travel(destination) {
    const { session } = this;

    if (destination === "explore") return this.explore();
    if (destination !== VILLAGE && !this.placeOf(destination)) {
      throw new Error(`Unknown region: ${destination}`);
    }

    const problem = session.mapEvents?.travelProblem(
      destination,
      this.location,
    );
    if (problem) return { ok: false, travelBlocked: true, message: problem };

    this.location = destination;
    session.clock.advance(TRAVEL_MINUTES);
    session.emit(protocol.CLOCK, { data: session.clock.toJSON() });
    session.emitWorldState();

    // The people of the town are created while the player gets there
    if (destination === "town" && this.townsfolk.length === 0) {
      session.runInBackground(this.createTownsfolk());
    }

    return {
      ok: true,
      travel: destination,
      message:
        destination === VILLAGE
          ? "Você voltou de barco para a vila."
          : `Depois de meia hora de barco, você chegou: ${this.placeOf(destination).name}.`,
    };
  }

  /** The player sails into the open sea and finds the next islet. */
  async explore() {
    const { session } = this;
    const next = Object.keys(ISLETS).find(
      (id) => !this.discovered.includes(id),
    );

    if (!next) {
      return {
        ok: false,
        travelBlocked: true,
        message:
          "Você já conhece todas as ilhas por aqui. Escolha um destino no mapa.",
      };
    }
    const problem = session.mapEvents?.travelProblem(next, this.location);
    if (problem) return { ok: false, travelBlocked: true, message: problem };

    this.discovered.push(next);
    this.location = next;
    session.clock.advance(EXPLORE_MINUTES);
    session.emit(protocol.CLOCK, { data: session.clock.toJSON() });
    session.emitWorldState();

    const { name } = ISLETS[next];
    session.addNews(`O viajante descobriu uma ilha desconhecida: ${name}`);
    session.runInBackground(
      session.rememberAll(
        `[village news] The traveler sailed into the open sea and found an island nobody knew: ${name} (${ISLETS[next].prompt}).`,
      ),
    );
    session.save();
    return {
      ok: true,
      travel: next,
      discovered: next,
      message: `Depois de uma hora no mar aberto, você avistou terra: ${name}! Ela foi marcada no mapa náutico.`,
    };
  }

  /** The chest of an islet: something the sea brought, once. */
  openIsletChest() {
    const { session } = this;
    const id = this.location;

    if (!ISLETS[id]) throw new Error("Not on an islet");
    if (this.isletChests.includes(id)) {
      return { ok: false, message: "O baú está vazio." };
    }

    this.isletChests.push(id);
    const coins = randomInt(15, 35);
    const item =
      ISLET_LOOT[Object.keys(ISLETS).indexOf(id) % ISLET_LOOT.length];
    session.player.addItem(COINS, coins);
    session.player.addItem(item, 1);
    session.emitPlayerState();
    session.emitWorldState();
    return {
      ok: true,
      item,
      quantity: 1,
      message: `No baú meio enterrado havia ${coins} moedas e ${item}!`,
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
    const mineBefore = this.levels.mine;
    if (kind === "tree") this.growth.forestSince = session.clock.day;
    if (kind === "ore" || kind === "crystal") this.growth.mined++;
    session.runInBackground(this.levelUp("mine", mineBefore));
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
  // People of the town

  async createTownsfolk(random = Math.random) {
    const { session } = this;

    if (this.isCreatingTownsfolk || this.townsfolk.length) return;
    this.isCreatingTownsfolk = true;

    try {
      const sprites = Object.keys(SPRITES)
        .sort(() => random() - 0.5)
        .slice(0, TOWNSFOLK);
      const { content } = await session.llm.complete({
        cachePrefix: session.worldContext,
        system: townsfolkPrompt({
          context: session.worldContext,
          people: sprites.map((sprite) => ({
            gender: spriteGender(sprite),
            look: SPRITES[sprite],
          })),
          usedNames: [...session.npcs.values()].map((npc) => npc.data.name),
          language: session.language,
        }),
        messages: [{ role: "user", content: "Create the people of the town." }],
        schema: townsfolkSchema,
        temperature: 1,
      });

      const people = content.people.slice(0, TOWNSFOLK);
      for (const [i, person] of people.entries()) {
        const id = TOWNSFOLK_FIRST_ID + i;
        const data = {
          name: person.name.trim(),
          occupation: person.occupation.trim(),
          title: person.title?.trim() || undefined,
          personality: person.personality,
          story: person.story.trim(),
          secret: person.secret.trim(),
          likes: person.likes.slice(0, 3),
          dislikes: person.dislikes.slice(0, 3),
          routine: [],
          wares: [],
          work: "none",
          goal: "",
          region: "town",
          gender: spriteGender(sprites[i]),
          sprite: sprites[i],
        };
        await session.addNpc(id, data);
        this.townsfolk.push(id);
        session.emit(protocol.AGENT_CREATED, {
          data: { agent: { id, data }, townsfolk: true },
        });
      }
      session.save();
    } finally {
      this.isCreatingTownsfolk = false;
    }
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
    const townBefore = this.levels.town;
    this.growth.sold += owned * price;
    session.runInBackground(this.levelUp("town", townBefore));
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
      levels: this.levels,
      discovered: this.discovered,
      isletChests: this.isletChests,
    };
  }

  toState() {
    return {
      location: this.location,
      depleted: [...this.depleted],
      camp: this.camp,
      townsfolk: this.townsfolk,
      growth: this.growth,
      discovered: this.discovered,
      isletChests: this.isletChests,
    };
  }

  restoreState(state) {
    this.location = state.location;
    this.depleted = new Map(state.depleted);
    this.camp = state.camp;
    this.townsfolk = state.townsfolk ?? [];
    this.discovered = state.discovered ?? [];
    this.isletChests = state.isletChests ?? [];
    this.growth = {
      ...this.growth,
      forestSince: this.session.clock.day,
      ...state.growth,
    };
  }
}
