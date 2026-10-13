import { NpcAgent } from "../agents/NpcAgent.js";
import { diaryPrompt, diarySchema } from "../prompts/diary.js";
import { worldContext } from "../prompts/worldContext.js";
import * as protocol from "../protocol.js";
import { Activities } from "./Activities.js";
import { Bonds } from "./Bonds.js";
import { Bandits } from "./Bandits.js";
import { Combat } from "./Combat.js";
import { healValue } from "./combatRules.js";
import { Commerce } from "./Commerce.js";
import { FamilyLife } from "./FamilyLife.js";
import { GameClock, MINUTES_PER_DAY } from "./GameClock.js";
import { Goals } from "./Goals.js";
import { Investigation } from "./Investigation.js";
import { clampMood, describeMood, isSleepTime, needsAt } from "./needs.js";
import { NpcSocial } from "./NpcSocial.js";
import { PlayerChat } from "./PlayerChat.js";
import { COINS, PlayerState } from "./PlayerState.js";
import { Quests } from "./Quests.js";
import { Regions } from "./Regions.js";
import { SeekPlanner } from "./Seeking.js";
import { Terrain } from "./Terrain.js";
import { VillageBuilder } from "./VillageBuilder.js";
import { VillageLife } from "./VillageLife.js";
import { VillageMap } from "./VillageMap.js";
import { Visitors } from "./Visitors.js";

// Old facts are written in the diary in batches of this size
const DIARY_BATCH = 5;
const MAX_DIARY_ENTRIES = 6;
// Every 3 game hours moods go back one step towards neutral
const MOOD_DECAY_GAME_MINUTES = 180;
// The session checks the time (weather, gatherings, deadlines...) this often
const TICK_GAME_MINUTES = 5;
// Places that are buildings when the client didn't say (old saved games)
const DEFAULT_BUILDINGS = ["tavern", "west_house", "east_house"];
// Tiles of the village map (worn paths)
const MAX_MAP_TILES = 10000;
// Resting in a bed (see rest)
const WAKE_UP_HOUR = 7;
const NAP_MINUTES = 120;
// Meal sold at the counter of the tavern
const MEAL = "sopa da taverna";
const MEAL_PRICE = 3;
// Version of the saved state (see toState)
const STATE_VERSION = 1;

/**
 * State of one game: the world, its NPCs and the player. It outlives the
 * websocket connection (the player can resume it after a reload) and is
 * saved in Redis, so it also survives a restart of the backend (see `load`).
 *
 * The session holds what everything shares (clock, NPCs, memories, the
 * player) and delegates the rest to its parts:
 * - builder:       creates the village
 * - chat:          chat with the player and the NPC actions
 * - social:        NPC <-> NPC conversations, relationships and gossip
 * - quests:        requests, deadlines and peace requests
 * - investigation: the mysteries
 * - life:          world events, weather, seasons and gatherings
 * - commerce:      wares, stock and prices
 * - bonds:         friendship, romance and rivalry with the player
 * - goals:         personal goals of the villagers
 * - family:        couples, weddings and children
 * - visitors:      visitors that spend a day in the village
 * - activities:    fishing and gathering
 * - villageMap:    farm field, snow and mud, wrecks, buildings, footprints
 *                  and the objects of the map
 * - terrain:       paths worn on the grass and buildings burned by bandits
 * - regions:       forest, mine and town reached by boat
 */
export class GameSession {
  constructor({
    id,
    llm,
    store,
    maxMemoryMessages,
    maxFacts = 20,
    dialogTemperature = 0.7,
    msPerGameMinute = 1000,
    daysPerSeason = 2,
  }) {
    this.id = id;
    this.llm = llm;
    this.store = store;
    this.maxMemoryMessages = maxMemoryMessages;
    this.maxFacts = maxFacts;
    this.dialogTemperature = dialogTemperature;
    this.world = null;
    // Villagers created with the world: { slot (= NPC id), name, occupation }
    this.cast = [];
    this.npcs = new Map();
    // Language of the game (chosen by the frontend)
    this.language = "English";
    // Places of the village map ({ id, name, description }), sent by the client
    this.places = [];
    this.worldEventInterval = 0;
    this.worldEventTimer = null;

    this.clock = new GameClock({ msPerGameMinute });
    this.player = new PlayerState();
    this.seeking = new SeekPlanner();
    this.builder = new VillageBuilder(this);
    this.playerChat = new PlayerChat(this);
    this.social = new NpcSocial(this);
    this.quests = new Quests(this);
    this.investigation = new Investigation(this);
    this.life = new VillageLife(this, { daysPerSeason });
    this.commerce = new Commerce(this);
    this.bonds = new Bonds(this);
    this.goals = new Goals(this);
    this.family = new FamilyLife(this);
    this.visitors = new Visitors(this);
    this.activities = new Activities(this);
    this.combat = new Combat(this);
    this.bandits = new Bandits(this);
    this.villageMap = new VillageMap(this);
    this.terrain = new Terrain(this);
    this.regions = new Regions(this);

    this.paused = false;
    this.moods = new Map(); // npcId -> -5..5
    this.moodTimer = null;
    this.tickTimer = null;
    this.isTicking = false;
    this.lastTickHour = null;
    // Last time (game minutes) the player chatted with each NPC
    this.lastChatAt = new Map();
    // Old facts waiting to be written in the diary, by NPC
    this.diaryQueue = new Map();
    this.backgroundTasks = new Set();

    // Sends a message to the client; replaced by `attach`
    this.emit = () => {};
  }

  get mystery() {
    return this.investigation.mystery;
  }

  get recentEvents() {
    return this.life.recentEvents;
  }

  get season() {
    return this.life.season;
  }

  // ---------------------------------------------------------------------------
  // Connection

  /** Connects the session to a client (`emit(type, payload)`). */
  attach(emit) {
    this.emit = emit;
    this.paused = false;
    this.clock.resume();
    this.startTimers();
  }

  /**
   * The player paused (or unpaused) the game: time stops, and with it the
   * weather, gatherings, deadlines, world events...
   */
  setPaused(paused) {
    if (paused === this.paused) {
      return;
    }

    this.paused = paused;

    if (paused) {
      this.clock.pause();
      this.stopTimers();
      this.save();
    } else {
      this.clock.resume();
      this.startTimers();
    }

    this.emit(protocol.CLOCK, { data: this.clock.toJSON() });
  }

  /** The client disconnected: the world stops until it comes back. */
  detach() {
    this.emit = () => {};
    this.clock.pause();
    this.stopTimers();
    // Conversations being played are lost with the client
    this.social.reset();
    this.save();
  }

  get isReady() {
    return (
      this.cast.length > 0 &&
      this.cast.every((villager) => this.npcs.has(villager.slot))
    );
  }

  /** Everything the client needs to (re)build the game. */
  snapshot() {
    return {
      agents: [...this.npcs.values()].map((npc) => ({
        id: npc.id,
        data: { ...npc.data, injured: this.combat.isInjured(npc.id) },
      })),
      clock: this.clock.toJSON(),
      world: this.life.toJSON(),
    };
  }

  emitPlayerState() {
    this.emit(protocol.PLAYER_STATE, { data: this.playerStateJSON() });
  }

  emitWorldState() {
    this.emit(protocol.WORLD_STATE, { data: this.life.toJSON() });
  }

  notify(text, kind = "info") {
    this.emit(protocol.NOTIFICATION, { data: { text, kind } });
  }

  addNews(text) {
    this.player.addNews(text, `Dia ${this.clock.day}, ${this.clock.format()}`);
  }

  nameOf = (npcId) => this.npcs.get(npcId)?.data.name ?? "?";

  playerStateJSON() {
    const shops = [...this.npcs.values()]
      .filter((npc) => npc.data.wares?.length)
      .map((npc) => ({
        npcId: npc.id,
        wares: this.commerce.waresFor(npc.id),
      }));

    return {
      ...this.player.toJSON({
        nameOf: this.nameOf,
        formatTime: GameClock.formatMoment,
      }),
      ...this.investigation.toJSON({ nameOf: this.nameOf }),
      shops,
      bonds: this.bonds.toJSON(),
      goals: this.goals.toJSON(),
      couples: this.family.toJSON(),
      combat: this.combat.toJSON(),
      season: this.life.toJSON().seasonLabel,
    };
  }

  // ---------------------------------------------------------------------------
  // Village and NPCs

  /** Start of the prompts shared by every call of the session (cached). */
  get worldContext() {
    return worldContext({
      worldHistory: this.world.worldHistory,
      places: this.places,
      villagers: this.cast,
    });
  }

  /** Villagers ({ name, occupation }), except `npcId` (slot = NPC id). */
  getVillagers(npcId) {
    return this.cast
      .filter((villager) => villager.slot !== npcId)
      .map(({ name, occupation }) => ({ name, occupation }));
  }

  /** Whether the NPC lives in the village (not a visitor). */
  isVillager(npcId) {
    return this.cast.some((villager) => villager.slot === npcId);
  }

  /** Another NPC by name (the NPC `exceptId` doesn't count). */
  findVillager(name, exceptId = null) {
    return [...this.npcs.values()].find(
      (npc) => npc.id !== exceptId && npc.data.name === name,
    );
  }

  /** Creates (and saves) the village: see VillageBuilder.createNpcs. */
  createNpcs(options) {
    return this.builder.createNpcs(options);
  }

  /** Adds an NPC to the game (a villager or a visitor). */
  async addNpc(id, data, { isRestoring = false } = {}) {
    this.npcs.set(
      id,
      new NpcAgent({
        id,
        data,
        llm: this.llm,
        store: this.store,
        getWorldContext: () => this.worldContext,
        getKnowledge: () => this.getKnowledge(id),
        getVillage: () => ({
          places: this.places,
          everyone: this.getVillagers(null),
        }),
        getSituation: () => this.getSituation(id),
        resolveActions: (actions) =>
          this.playerChat.resolveActions(id, actions),
        remember: (fact) => this.remember(id, fact),
        getSummaryContext: () => ({
          mysteryTitle: this.mystery?.isOpen ? this.mystery.title : null,
          language: this.language,
        }),
        maxMemoryMessages: this.maxMemoryMessages,
        maxFacts: this.maxFacts,
        temperature: this.dialogTemperature,
      }),
    );

    if (!isRestoring) {
      await this.store.setNpc(id, data);
      this.moods.set(id, 0);
      this.commerce.initStock(id);
      this.goals.init(id, data.goal);
    }
  }

  /** A visitor left the village. */
  removeNpc(id) {
    this.npcs.delete(id);
    this.moods.delete(id);
  }

  getNpc(npcId) {
    const npc = this.npcs.get(npcId);

    if (!npc) {
      throw new Error(`NPC ${npcId} not found`);
    }

    return npc;
  }

  changeMood(npcId, delta) {
    if (this.moods.has(npcId) && delta) {
      this.moods.set(npcId, clampMood(this.moods.get(npcId) + delta));
    }
  }

  /** The current situation of the NPC, for its dialog prompt. */
  async getSituation(npcId) {
    const { weather, festival, season } = this.life.describe();

    return {
      time: this.clock.format(),
      period: this.clock.period,
      season,
      needs: needsAt(this.clock.hour),
      mood: describeMood(this.moods.get(npcId) ?? 0),
      weather,
      festival,
      reputation: this.player.getReputation(npcId),
      hasMet: this.player.met.has(npcId),
      investigator: this.investigation.reputationAsInvestigator,
      defender: this.combat.title,
      raid: this.bandits.describe(),
      surroundings:
        [this.villageMap.describe(), this.terrain.describe()]
          .filter(Boolean)
          .join(" ") || null,
      bond: this.bonds.describeFor(npcId),
      companion: this.playerChat.describeCompanion(npcId),
      goal: this.goals.describeFor(npcId),
      injury: this.combat.describeFor(npcId),
      family: await this.family.describeFor(npcId),
      visitor: this.getNpc(npcId).data.visitor
        ? null
        : this.visitors.describe(),
      inventory: this.player.items,
      quests: this.player.questsInvolving(npcId).map((quest) => ({
        ...quest,
        isGiver: quest.giverId === npcId,
        giverName: this.nameOf(quest.giverId),
        targetName: quest.targetId ? this.nameOf(quest.targetId) : null,
        deadlineLabel:
          quest.deadline === null
            ? null
            : GameClock.formatMoment(quest.deadline),
      })),
      mystery: this.mystery?.describeFor(npcId) ?? null,
      wares: this.commerce.waresFor(npcId),
    };
  }

  /**
   * What an NPC knows: facts it heard, its diary and the NPCs it has talked
   * with.
   */
  async getKnowledge(npcId) {
    const [facts, diary] = await Promise.all([
      this.store.getFacts(npcId),
      this.store.getDiary(npcId),
    ]);
    const acquaintances = [];

    for (const [otherId, other] of this.npcs) {
      if (otherId === npcId) continue;

      const relationship = await this.store.getRelationship(npcId, otherId);

      if (relationship.talks > 0) {
        acquaintances.push({
          name: other.data.name,
          affinity: relationship.affinity,
          lastTalkSummary: relationship.lastTalk[npcId] ?? "",
        });
      }
    }

    return { facts, diary, acquaintances };
  }

  // ---------------------------------------------------------------------------
  // Memory

  /**
   * Stores a fact the NPC remembers. Old facts that don't fit anymore are
   * written in its diary (in the background), instead of being forgotten.
   */
  async remember(npcId, fact) {
    const dropped = await this.store.addFact(npcId, fact, this.maxFacts);

    if (dropped.length === 0) {
      return;
    }

    const queue = [...(this.diaryQueue.get(npcId) ?? []), ...dropped];
    this.diaryQueue.set(npcId, queue);

    if (queue.length >= DIARY_BATCH) {
      this.diaryQueue.set(npcId, []);
      this.runInBackground(this.writeDiary(npcId, queue));
    }
  }

  /** Every villager remembers `fact` (village news). */
  rememberAll(fact) {
    return Promise.all(
      [...this.npcs.keys()].map((npcId) => this.remember(npcId, fact)),
    );
  }

  runInBackground(promise) {
    const task = promise
      .catch((error) => console.error(`[session ${this.id}]`, error))
      .finally(() => this.backgroundTasks.delete(task));
    this.backgroundTasks.add(task);
  }

  /** Waits for the background tasks (diary entries, goals...). */
  async flush() {
    await Promise.all(this.backgroundTasks);
  }

  async writeDiary(npcId, memories) {
    const npc = this.npcs.get(npcId);
    if (!npc) return;

    const diary = await this.store.getDiary(npcId);
    // When the diary is full, its oldest entry is merged into the new one
    const previousEntry =
      diary.length >= MAX_DIARY_ENTRIES ? diary.shift() : null;

    const { content } = await this.llm.complete({
      messages: [
        {
          role: "user",
          content: diaryPrompt({ npc: npc.data, memories, previousEntry }),
        },
      ],
      schema: diarySchema,
    });

    await this.store.setDiary(npcId, [...diary, content.entry.trim()]);
  }

  // ---------------------------------------------------------------------------
  // NPCs going after the player

  /**
   * The NPC goes after the player to tell them something (`reason`, used in
   * the greeting when the player opens the chat).
   *
   * @param {object} options See SeekPlanner.request. `callout` is what the
   *   NPC shouts; without it the client already knows (NPC conversations).
   * @returns {boolean} Whether the NPC goes.
   */
  seekPlayer(npcId, { reason, callout = null, key = null, force = false }) {
    if (!this.npcs.has(npcId) || isSleepTime(this.clock.hour)) {
      return false;
    }

    const accepted = this.seeking.request(npcId, {
      reason,
      key,
      force,
      now: this.clock.totalMinutes,
    });

    if (accepted && callout) {
      this.emit(protocol.NPC_SEEKS_PLAYER, {
        agentId: npcId,
        data: { callout },
      });
    }

    return accepted;
  }

  // ---------------------------------------------------------------------------
  // Actions of the player (used by index.js)

  greet(npcId, options) {
    return this.playerChat.greet(npcId, options);
  }

  chat(npcId, message, options) {
    return this.playerChat.chat(npcId, message, options);
  }

  summarizeChat(npcId) {
    return this.playerChat.summarize(npcId);
  }

  accuse(npcId) {
    return this.investigation.accuse(npcId);
  }

  decideMystery(decision) {
    return this.investigation.decide(decision);
  }

  endFight(npcId, winner, options) {
    return this.combat.end(npcId, winner, options);
  }

  playerAttacked(npcId) {
    return this.combat.playerAttacked(npcId);
  }

  guardArrived(guardId) {
    return this.combat.guardArrived(guardId);
  }

  banditDefeated(banditId) {
    return this.regions.isCampBandit(banditId)
      ? this.regions.campBanditDefeated(banditId)
      : this.bandits.defeat(banditId);
  }

  knockedOutByBandits() {
    // The player wakes up in the village
    this.regions.backHome();
    return this.bandits.playerKnockedOut();
  }

  /**
   * The player eats or uses something to heal (H key).
   * @returns {{ok: boolean, item: string, heal: number}}
   */
  useItem(item) {
    const heal = healValue(item);

    if (!heal || !this.player.removeItem(item, 1)) {
      return { ok: false, item, heal: 0 };
    }

    this.emitPlayerState();
    return { ok: true, item, heal };
  }

  /** The player uses an object of the map (F): well, chest, crops... */
  async interact(objectId) {
    if (objectId === "rest") return this.rest();
    if (objectId === "tavern_meal") return this.buyMeal();
    if (objectId.startsWith("rebuild:")) {
      return this.terrain.help(objectId.slice("rebuild:".length));
    }
    if (objectId.startsWith("travel:")) {
      return this.regions.travel(objectId.slice("travel:".length));
    }
    if (objectId === "camp_chest") return this.regions.openCampChest();
    if (objectId.startsWith("trade:")) {
      const [, merchant, mode, index] = objectId.split(":");
      return this.regions.trade(merchant, mode, Number(index));
    }
    const node = objectId.match(/^(tree|ore|crystal|forage)_\d+$/);
    if (node) return this.regions.gather(node[1], objectId);
    return this.villageMap.interact(objectId);
  }

  /** People walked on these tiles (paths worn on the grass). */
  addWear(entries) {
    this.terrain.addWear(entries, MAX_MAP_TILES);
  }

  /** What the village plan built on the empty lots (for the client). */
  villageLayout() {
    return this.places
      .filter((place) => place.lot)
      .map(({ id, name, kind }) => ({ id, name, kind }));
  }

  /** Whether a place is a building (with an inside). */
  isBuilding(placeId) {
    const place = this.places.find((candidate) => candidate.id === placeId);
    return place?.building ?? DEFAULT_BUILDINGS.includes(placeId);
  }

  /**
   * The player rests in a bed: at night they sleep until the morning,
   * during the day they nap for two hours.
   */
  async rest() {
    const { hour, minuteOfDay } = this.clock;
    const isNight = hour >= 20 || hour < 6;
    const minutes = isNight
      ? (WAKE_UP_HOUR * 60 - minuteOfDay + MINUTES_PER_DAY) % MINUTES_PER_DAY
      : NAP_MINUTES;

    this.clock.advance(minutes);
    this.emit(protocol.CLOCK, { data: this.clock.toJSON() });
    await this.tick();
    this.emitWorldState();

    return {
      ok: true,
      rested: minutes,
      message: isNight
        ? `Você dormiu até as ${WAKE_UP_HOUR}h e acordou descansado.`
        : "Você tirou um cochilo de duas horas.",
    };
  }

  /** A hot meal at the counter of the tavern. */
  buyMeal() {
    if (!this.player.removeItem(COINS, MEAL_PRICE)) {
      return {
        ok: false,
        message: `A refeição custa ${MEAL_PRICE} moedas e você não tem o bastante.`,
      };
    }

    this.player.addItem(MEAL, 1);
    this.emitPlayerState();
    return {
      ok: true,
      item: MEAL,
      quantity: 1,
      message: `Você pagou ${MEAL_PRICE} moedas por uma ${MEAL}.`,
    };
  }

  doActivity(kind, result) {
    return this.activities.perform(kind, result);
  }

  getRelationships() {
    return this.social.getRelationships();
  }

  startNpcConversation(aId, bId, placeId, isPrivate) {
    return this.social.start(aId, bId, placeId, isPrivate);
  }

  endNpcConversation(conversationId, shownLines, interruptedBy, noticedPlayer) {
    return this.social.end(
      conversationId,
      shownLines,
      interruptedBy,
      noticedPlayer,
    );
  }

  generateWorldEvent() {
    return this.life.generateWorldEvent();
  }

  // ---------------------------------------------------------------------------
  // Time

  /**
   * Checks what changes with the time of the game. Runs every few game
   * minutes while the player is connected.
   */
  async tick() {
    if (this.isTicking || !this.isReady || this.paused) {
      return;
    }

    this.isTicking = true;

    try {
      const now = this.clock.totalMinutes;
      const { day, hour } = this.clock;
      const hourIndex = Math.floor(now / 60);

      // The weather changes (at most) once per game hour
      if (this.lastTickHour !== null && hourIndex !== this.lastTickHour) {
        this.life.updateWeather(hour);
      }
      this.lastTickHour = hourIndex;

      this.life.updateSeason();
      await this.family.update(day, hour);
      await this.life.updateFestival(day, hour);
      await this.bonds.update(day);
      await this.quests.update(now);
      await this.investigation.update(now);
      await this.commerce.update(day, hour);
      this.goals.update(day, hour);
      await this.visitors.update(day, hour);
      this.combat.update(now);
      await this.bandits.update(day, hour, now);
      const mapChanged = await this.villageMap.update(now, day, hour);
      const terrainChanged = await this.terrain.update(day);
      if (mapChanged || terrainChanged) {
        this.emitWorldState();
      }
      this.save();
    } finally {
      this.isTicking = false;
    }
  }

  startTimers() {
    this.stopTimers();

    const { msPerGameMinute } = this.clock;

    this.moodTimer = setInterval(() => {
      for (const [npcId, mood] of this.moods) {
        this.moods.set(npcId, mood - Math.sign(mood));
      }
    }, MOOD_DECAY_GAME_MINUTES * msPerGameMinute);

    this.tickTimer = setInterval(() => {
      this.tick().catch((error) =>
        console.error(`[session ${this.id}] Tick failed:`, error),
      );
    }, TICK_GAME_MINUTES * msPerGameMinute);

    // Timers don't keep the process alive (the websocket server does)
    this.moodTimer.unref?.();
    this.tickTimer.unref?.();

    if (this.worldEventInterval) {
      this.worldEventTimer = setInterval(() => {
        this.generateWorldEvent()
          .then((event) => {
            if (event) {
              this.emit(protocol.WORLD_EVENT, {
                data: { headline: event.headline },
              });
              this.emitPlayerState();
            }
          })
          .catch((error) =>
            console.error(`[session ${this.id}] World event failed:`, error),
          );
      }, this.worldEventInterval);
      this.worldEventTimer.unref?.();
    }
  }

  stopTimers() {
    clearInterval(this.moodTimer);
    clearInterval(this.tickTimer);
    clearInterval(this.worldEventTimer);
    this.moodTimer = null;
    this.tickTimer = null;
    this.worldEventTimer = null;
  }

  /** Generates a world event every `intervalMs` (0 disables them). */
  startWorldEvents(intervalMs) {
    this.worldEventInterval = intervalMs;
    this.startTimers();
  }

  // ---------------------------------------------------------------------------
  // Saving and loading

  /** Everything needed to continue the game later (memories are in Redis). */
  toState() {
    return {
      version: STATE_VERSION,
      world: this.world,
      cast: this.cast,
      places: this.places,
      language: this.language,
      worldEventInterval: this.worldEventInterval,
      totalMinutes: this.clock.totalMinutes,
      npcs: [...this.npcs.values()].map(({ id, data }) => ({ id, data })),
      moods: [...this.moods],
      lastChatAt: [...this.lastChatAt],
      diaryQueue: [...this.diaryQueue],
      lastTickHour: this.lastTickHour,
      player: this.player.toState(),
      seeking: this.seeking.toState(),
      social: this.social.toState(),
      investigation: this.investigation.toState(),
      life: this.life.toState(),
      commerce: this.commerce.toState(),
      bonds: this.bonds.toState(),
      goals: this.goals.toState(),
      family: this.family.toState(),
      visitors: this.visitors.toState(),
      activities: this.activities.toState(),
      combat: this.combat.toState(),
      bandits: this.bandits.toState(),
      villageMap: this.villageMap.toState(),
      terrain: this.terrain.toState(),
      regions: this.regions.toState(),
    };
  }

  /** Saves the game in the background (only a complete village). */
  save() {
    if (this.isReady) {
      this.runInBackground(this.store.setState(this.toState()));
    }
  }

  /**
   * Loads a saved game (e.g. after the backend restarted).
   * @returns {Promise<GameSession|null>} null when there is no saved game.
   */
  static async load(options) {
    const state = await options.store.getState();

    if (!state || state.version !== STATE_VERSION) {
      return null;
    }

    const session = new GameSession(options);
    await session.restoreState(state);
    return session;
  }

  async restoreState(state) {
    Object.assign(this, {
      world: state.world,
      cast: state.cast,
      places: state.places,
      language: state.language,
      worldEventInterval: state.worldEventInterval,
      moods: new Map(state.moods),
      lastChatAt: new Map(state.lastChatAt),
      diaryQueue: new Map(state.diaryQueue),
      lastTickHour: state.lastTickHour,
    });

    // The clock continues where it stopped (paused until the player is back)
    this.clock = new GameClock({
      startMinutes: state.totalMinutes,
      msPerGameMinute: this.clock.msPerGameMinute,
    });
    this.clock.pause();

    for (const { id, data } of state.npcs) {
      await this.addNpc(id, data, { isRestoring: true });
    }

    this.player.restoreState(state.player);
    this.seeking.restoreState(state.seeking);
    this.social.restoreState(state.social);
    this.investigation.restoreState(state.investigation);
    this.life.restoreState(state.life);
    this.commerce.restoreState(state.commerce);
    this.bonds.restoreState(state.bonds);
    this.goals.restoreState(state.goals);
    this.family.restoreState(state.family);
    this.visitors.restoreState(state.visitors);
    this.activities.restoreState(state.activities);
    if (state.combat) this.combat.restoreState(state.combat);
    if (state.bandits) this.bandits.restoreState(state.bandits);
    if (state.villageMap) this.villageMap.restoreState(state.villageMap);
    if (state.terrain) this.terrain.restoreState(state.terrain);
    if (state.regions) this.regions.restoreState(state.regions);
  }

  /** Stops the session; `forget` also deletes it from Redis. */
  async dispose({ forget = true } = {}) {
    this.detach();
    await this.flush();

    if (forget) {
      await this.store.clear();
    }
  }
}
