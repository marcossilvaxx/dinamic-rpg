import { randomUUID } from "node:crypto";
import { WebSocketServer } from "ws";
import { config } from "./config.js";
import { connectDatabase } from "./db/index.js";
import { GameSession, describeSavedGame } from "./game/GameSession.js";
import { createLlmClient } from "./llm/client.js";
import * as protocol from "./protocol.js";
import { SessionStore } from "./storage/SessionStore.js";

const database = await connectDatabase();
const llm = createLlmClient();

const wss = new WebSocketServer({ port: config.PORT });

const MIN_WORLD_EVENT_INTERVAL_MS = 30000;
const MAX_PLACES = 20;
const SESSION_ID = /^[0-9a-f-]{36}$/;

// Places come from the client and go to the prompts: keep only short strings
const sanitizePlaces = (places) =>
  (Array.isArray(places) ? places : [])
    .slice(0, MAX_PLACES)
    .filter(
      (place) =>
        /^[a-z_]{1,30}$/.test(place?.id) &&
        typeof place.name === "string" &&
        typeof place.description === "string",
    )
    .map(({ id, name, description, building }) => ({
      id,
      name: name.slice(0, 40),
      description: description.slice(0, 200),
      building: building === true,
    }));

// Empty lots of the map where the village plan may build (see VillageBuilder)
const MAX_LOTS = 8;
const sanitizeLots = (lots) =>
  (Array.isArray(lots) ? lots : [])
    .slice(0, MAX_LOTS)
    .filter(
      (lot) =>
        /^lot_[a-z_]{1,20}$/.test(lot?.id) &&
        typeof lot.description === "string",
    )
    .map(({ id, description }) => ({
      id,
      description: description.slice(0, 200),
    }));

const send = (ws, type, payload = {}) => {
  if (ws.readyState === ws.OPEN) {
    ws.send(JSON.stringify({ type, ...payload }));
  }
};

const sessionOptions = (sessionId) => ({
  id: sessionId,
  llm,
  store: new SessionStore(database, sessionId, {
    ttlSeconds: config.SESSION_TTL_DAYS * 24 * 60 * 60,
  }),
  maxMemoryMessages: config.MAX_MEMORY_MESSAGES,
  maxFacts: config.MAX_NPC_FACTS,
  dialogTemperature: config.DIALOG_TEMPERATURE,
  msPerGameMinute: config.MS_PER_GAME_MINUTE,
  daysPerSeason: config.DAYS_PER_SEASON,
});

// Games being played (or left a moment ago). Games are also saved in Redis,
// so a player can come back after the game left the memory, or after the
// backend restarted.
const sessions = new Map(); // sessionId -> { session, unloadTimer, ws }

const attach = (ws, session) =>
  session.attach((type, payload) => send(ws, type, payload));

const createSession = (ws) => {
  const session = new GameSession(sessionOptions(randomUUID()));
  sessions.set(session.id, { session, unloadTimer: null, ws });
  attach(ws, session);
  return session;
};

/**
 * Reattaches a game left by a previous connection: from the memory or, if
 * it is not there anymore, from Redis.
 */
const resumeSession = async (ws, sessionId) => {
  if (!SESSION_ID.test(sessionId)) {
    return null;
  }

  let entry = sessions.get(sessionId);

  if (entry && (entry.ws || !entry.session.isReady)) {
    return null; // Open in another tab, or still being created
  }

  if (!entry) {
    const session = await GameSession.load(sessionOptions(sessionId));

    if (!session) {
      return null;
    }

    console.log(`[session ${sessionId}] Loaded from Redis`);
    entry = { session, unloadTimer: null, ws: null };
    sessions.set(sessionId, entry);
  }

  clearTimeout(entry.unloadTimer);
  entry.ws = ws;
  attach(ws, entry.session);
  return entry.session;
};

/** Removes the game from memory (`forget` also deletes it from Redis). */
const disposeSession = (sessionId, { forget }) => {
  const entry = sessions.get(sessionId);
  sessions.delete(sessionId);
  entry?.session.dispose({ forget }).catch(console.error);
};

const sendGameState = async (ws, session) => {
  const { agents, clock, world } = session.snapshot();
  send(ws, protocol.VILLAGE_LAYOUT, {
    data: { lots: session.villageLayout() },
  });
  send(ws, protocol.CLOCK, { data: clock });
  send(ws, protocol.WORLD_STATE, { data: world });
  send(ws, protocol.AGENTS_CREATED, { data: agents });
  send(ws, protocol.RELATIONSHIPS, { data: await session.getRelationships() });
  send(ws, protocol.PLAYER_STATE, { data: session.playerStateJSON() });
};

// What the NPC said in the chat and the actions it took
const sendAnswer = (ws, agentId, { content, actions }) => {
  if (content) {
    send(ws, protocol.CHAT_RESPONSE, { agentId, data: { content } });
  }

  actions.forEach((action) =>
    send(ws, protocol.NPC_ACTION, { agentId, data: action }),
  );
};

// The answer of the NPC while it is written
const streamTo = (ws, agentId) => (content) =>
  send(ws, protocol.CHAT_DELTA, { agentId, data: { content } });

/** The player started a new game: the old saved game is deleted. */
const forgetSavedGame = async (sessionId) => {
  if (typeof sessionId !== "string" || !SESSION_ID.test(sessionId)) return;

  const entry = sessions.get(sessionId);
  if (entry?.ws) return; // Open in another tab

  if (entry) {
    disposeSession(sessionId, { forget: true });
  } else {
    await new SessionStore(database, sessionId).clear();
  }
  console.log(`[session ${sessionId}] Deleted (new game)`);
};

const handlers = {
  // Main menu: what the saved game is (or that there is none)
  async [protocol.SESSION_INFO](ws, connection, { data }) {
    const sessionId = data?.sessionId;
    let info = { exists: false };

    if (typeof sessionId === "string" && SESSION_ID.test(sessionId)) {
      const entry = sessions.get(sessionId);
      const state = entry?.session.isReady
        ? entry.session.toState()
        : await new SessionStore(database, sessionId).getState();
      const saved = describeSavedGame(state, {
        daysPerSeason: config.DAYS_PER_SEASON,
      });

      if (saved) {
        info = { exists: true, inUse: Boolean(entry?.ws), ...saved };
      }
    }

    send(ws, protocol.SAVED_GAME, { data: info });
  },

  async [protocol.CREATE_AGENTS](ws, connection, { data }) {
    if (connection.session) {
      throw new Error("The game was already created");
    }

    await forgetSavedGame(data?.forgetSessionId);

    const resumed =
      typeof data?.resumeSessionId === "string"
        ? await resumeSession(ws, data.resumeSessionId)
        : null;

    if (resumed) {
      connection.session = resumed;
      console.log(`[session ${resumed.id}] Resumed`);
      send(ws, protocol.SESSION, {
        data: { sessionId: resumed.id, resumed: true },
      });
      await sendGameState(ws, resumed);
      return;
    }

    const session = createSession(ws);
    connection.session = session;
    send(ws, protocol.SESSION, {
      data: { sessionId: session.id, resumed: false },
    });
    send(ws, protocol.CLOCK, { data: session.clock.toJSON() });

    const quantity = Math.min(
      Math.max(Number(data?.quantity) || 1, 1),
      config.MAX_NPCS,
    );

    console.log(`[session ${session.id}] Creating ${quantity} agents`);

    // Free text from the client: keep it short since it goes to the prompt
    const language =
      typeof data?.language === "string" ? data.language.slice(0, 40) : null;

    const agents = await session.createNpcs({
      quantity,
      language,
      places: sanitizePlaces(data?.places),
      lots: sanitizeLots(data?.lots),
      onVillagePlanned: () =>
        send(ws, protocol.VILLAGE_LAYOUT, {
          data: { lots: session.villageLayout() },
        }),
      onNpcCreated: (agent, created, total) =>
        send(ws, protocol.AGENT_CREATED, { data: { agent, created, total } }),
    });

    send(ws, protocol.AGENTS_CREATED, { data: agents });
    send(ws, protocol.PLAYER_STATE, { data: session.playerStateJSON() });
    session.emitWorldState();

    if (session.mystery) {
      session.notify(
        `${session.mystery.title}: ${session.mystery.intro}`,
        "mystery",
      );
    }

    if (config.WORLD_EVENT_INTERVAL_MS > 0) {
      session.startWorldEvents(
        Math.max(
          Number(data?.worldEventIntervalMs) || config.WORLD_EVENT_INTERVAL_MS,
          MIN_WORLD_EVENT_INTERVAL_MS,
        ),
      );
    }
  },

  async [protocol.CHAT](ws, { session }, { agentId, data }) {
    if (typeof data?.message !== "string" || !data.message.trim()) {
      throw new Error("Empty message");
    }

    sendAnswer(
      ws,
      agentId,
      await session.chat(agentId, data.message, {
        onDelta: streamTo(ws, agentId),
      }),
    );
  },

  async [protocol.CHAT_OPENED](ws, { session }, { agentId, data }) {
    const greeting = await session.greet(agentId, {
      companionId: Number(data?.companionId) || null,
      onTyping: () => send(ws, protocol.NPC_TYPING, { agentId }),
      onDelta: streamTo(ws, agentId),
    });

    if (greeting) {
      sendAnswer(ws, agentId, greeting);
    }
  },

  async [protocol.CHAT_CLOSED](ws, { session }, { agentId }) {
    const fact = await session.summarizeChat(agentId);

    if (fact) {
      console.log(`[session ${session.id}] NPC ${agentId} remembers: ${fact}`);
    }
  },

  async [protocol.NPC_ENCOUNTER](ws, { session }, { data }) {
    const conversation = await session.startNpcConversation(
      data.a,
      data.b,
      typeof data.placeId === "string" ? data.placeId : null,
      data.isPrivate === true,
    );

    send(ws, protocol.NPC_DIALOGUE, { data: conversation });
  },

  async [protocol.NPC_CONVERSATION_END](ws, { session }, { data }) {
    await session.endNpcConversation(
      data.conversationId,
      data.shownLines,
      data.interruptedBy ?? null,
      data.noticedPlayer === true,
    );
  },

  async [protocol.ACCUSE](ws, { session }, { data }) {
    const result = await session.accuse(Number(data?.npcId));
    send(ws, protocol.ACCUSATION_RESULT, { data: result });
  },

  async [protocol.MYSTERY_DECISION](ws, { session }, { data }) {
    const result = await session.decideMystery(data?.decision);
    send(ws, protocol.MYSTERY_DECISION_RESULT, { data: result });
  },

  async [protocol.FIGHT_END](ws, { session }, { data }) {
    await session.endFight(Number(data?.npcId), data?.winner, {
      witnesses: Array.isArray(data?.witnesses)
        ? data.witnesses.map(Number)
        : [],
    });
  },

  async [protocol.PLAYER_ATTACKED](ws, { session }, { data }) {
    const npcId = Number(data?.npcId);
    const reaction = await session.playerAttacked(npcId);
    send(ws, protocol.NPC_REACTION, { agentId: npcId, data: reaction });
  },

  async [protocol.GUARD_ARRIVED](ws, { session }, { data }) {
    await session.guardArrived(Number(data?.guardId));
  },

  async [protocol.BANDIT_DEFEATED](ws, { session }, { data }) {
    await session.banditDefeated(Number(data?.banditId));
  },

  async [protocol.KNOCKED_OUT_BY_BANDITS](ws, { session }) {
    session.knockedOutByBandits();
  },

  async [protocol.USE_ITEM](ws, { session }, { data }) {
    send(ws, protocol.ITEM_USED, {
      data: session.useItem(String(data?.item ?? "")),
    });
  },

  async [protocol.SET_PAUSED](ws, { session }, { data }) {
    session.setPaused(data?.paused === true);
  },

  async [protocol.INTERACT](ws, { session }, { data }) {
    const objectId = String(data?.objectId ?? "").slice(0, 40);
    const result = await session.interact(objectId);
    send(ws, protocol.INTERACT_RESULT, { data: { objectId, ...result } });
  },

  async [protocol.WEAR](ws, { session }, { data }) {
    session.addWear(data?.tiles);
  },

  async [protocol.ACTIVITY](ws, { session }, { data }) {
    const result = session.doActivity(data?.kind, data?.result);
    send(ws, protocol.ACTIVITY_RESULT, { data: result });
  },
};

wss.on("connection", (ws) => {
  // The session is created (or resumed) by the first message
  const connection = { session: null };

  ws.on("error", console.error);

  ws.on("message", async (raw) => {
    let message;

    try {
      message = JSON.parse(raw);
    } catch {
      send(ws, protocol.ERROR, { data: { message: "Invalid JSON message" } });
      return;
    }

    const handler = handlers[message.type];

    if (!handler) {
      send(ws, protocol.ERROR, {
        data: { message: `Unknown message type: ${message.type}` },
      });
      return;
    }

    try {
      const beforeTheGame = [protocol.CREATE_AGENTS, protocol.SESSION_INFO];
      if (!connection.session && !beforeTheGame.includes(message.type)) {
        throw new Error("The game was not created yet");
      }

      await handler(ws, connection, message);
    } catch (error) {
      console.error(
        `[session ${connection.session?.id}] Error on ${message.type}:`,
        error,
      );
      send(ws, protocol.ERROR, {
        agentId: message.agentId,
        data: {
          message: error.message,
          requestType: message.type,
          request: message.data,
        },
      });
    }
  });

  ws.on("close", () => {
    const { session } = connection;

    if (!session) {
      return;
    }

    console.log(`[session ${session.id}] Disconnected`);
    session.detach();

    const entry = sessions.get(session.id);

    // A game that wasn't fully created can't be resumed
    if (!entry || !session.isReady) {
      disposeSession(session.id, { forget: true });
      return;
    }

    // The game stays saved in Redis; after a while it leaves the memory
    entry.ws = null;
    entry.unloadTimer = setTimeout(
      () => disposeSession(session.id, { forget: false }),
      Math.max(config.SESSION_GRACE_MS, 0),
    );
  });
});

console.log(`Websocket server listening on ws://localhost:${config.PORT}`);
