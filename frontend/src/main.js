import { sound } from "./audio/sound";
import { GameLoop } from "./GameLoop";
import { GameObject } from "./GameObject";
import { Input } from "./Input";
import { resources } from "./Resource";
import {
  NPC_CONVERSATION_LANGUAGE,
  NUMBER_OF_NPCS,
  SCALE,
  WORLD_EVENT_INTERVAL_MS,
} from "./config/constants";
import { chatContainer } from "./hud/ChatContainer";
import { clockHud } from "./hud/ClockHud";
import { Journal } from "./hud/Journal";
import { ActivityHud } from "./hud/Activity";
import { Minimap } from "./hud/Minimap";
import { PauseScreen } from "./hud/PauseScreen";
import { placeBanner } from "./hud/PlaceBanner";
import { notifications } from "./hud/Notifications";
import { overhearLog } from "./hud/OverhearLog";
import { statusBanner } from "./hud/StatusBanner";
import { mapCollisions } from "./levels/map";
import { PLACES, PLACES_BY_ID } from "./levels/places";
import * as protocol from "./net/protocol";
import { gameSocket } from "./net/socket";
import { Camera } from "./objects/Camera";
import { Hero } from "./objects/Hero";
import { Map } from "./objects/Map";
import { Npc } from "./objects/Npc";
import "./styles/style.css";
import { playerState } from "./state/playerState";
import { worldState } from "./state/worldState";
import { gameClock } from "./systems/GameClock";
import { FightManager } from "./systems/FightManager";
import { NpcDirector } from "./systems/NpcDirector";
import { lightingAt, scheduleFor } from "./systems/time";
import { WeatherEffects } from "./systems/WeatherEffects";
import { Vector2 } from "./utils/Vector2";
import { parse2D } from "./utils/grid";
import { overlayLayer } from "./utils/overlay";
import { pathfinder } from "./utils/pathfinding";

const canvas = document.querySelector("#game-canvas");

const ctx = canvas.getContext("2d");
const mainScene = new GameObject({
  position: new Vector2(0, 0),
});

const map1 = new Map({
  resource: resources.images.map,
  foregroundResource: resources.images.foreground,
  width: 70 * 12, // 12 is the tile size
  height: 40 * 12,
  collisionGrid: parse2D(mapCollisions, 70), // 70 -> Map width
  tileSize: 12,
});

const camera = new Camera({
  mapWidth: map1.width,
  mapHeight: map1.height,
});

const heroInitialPosition = new Vector2(424, 225);

const hero = new Hero(heroInitialPosition.x, heroInitialPosition.y, 16, 12); // 16 -> Object "hitbox" size w and h

mainScene.addChild(map1);
mainScene.addChild(camera);
mainScene.addChild(hero);

mainScene.input = new Input();
mainScene.player = hero;
mainScene.collision = map1.collision;
mainScene.overhearLog = overhearLog;
mainScene.debugMode = false;

pathfinder.init(map1.collision);

// Blocking overlay, only for connection errors. Loading progress is shown in
// the status banner while the player can already walk around.
const overlay = document.createElement("div");
overlay.className = "loading";
document.body.appendChild(overlay);

let isLoaded = false;

const setStatus = (text, { retry = false } = {}) => {
  overlay.replaceChildren();
  overlay.style.display = text ? "flex" : "none";

  if (!text) {
    return;
  }

  const paragraph = document.createElement("p");
  paragraph.textContent = text;
  overlay.appendChild(paragraph);

  if (retry) {
    const button = document.createElement("button");
    button.textContent = "Tentar novamente";
    button.addEventListener("click", () => window.location.reload());
    overlay.appendChild(button);
  }
};

const npcs = new globalThis.Map();
mainScene.npcs = npcs;

// NPCs make each other talk when they meet
mainScene.addChild(new NpcDirector({ npcs, player: hero, overhearLog }));

// Journal of the player (J key)
const journal = new Journal({
  getNpcs: () =>
    [...npcs.values()].map(({ id, data }) => ({
      id,
      name: data.name,
      occupation: data.occupation,
      visitor: Boolean(data.visitor),
    })),
  onAccuse: (npcId) => gameSocket.send(protocol.ACCUSE, { data: { npcId } }),
  onDecide: (decision) =>
    gameSocket.send(protocol.MYSTERY_DECISION, { data: { decision } }),
  input: mainScene.input,
});

const weatherEffects = new WeatherEffects({
  width: canvas.width,
  height: canvas.height,
});

const minimap = new Minimap({
  mapWidth: map1.width,
  mapHeight: map1.height,
  getPlayer: () => hero.position,
  getNpcs: () => [...npcs.values()],
});

// Pause (P): the scene stops here and the time of the village stops in the
// server (weather, gatherings, deadlines...)
let isPaused = false;

const setPaused = (paused) => {
  if (paused === isPaused || !isLoaded) {
    return;
  }

  isPaused = paused;
  mainScene.input.paused = paused;
  sound.setPaused(paused);

  if (paused) {
    gameClock.pause();
    pauseScreen.show();
    // Typing in the chat would continue behind the pause screen
    document.activeElement?.blur();
  } else {
    gameClock.resume();
    pauseScreen.hide();
  }

  gameSocket.send(protocol.SET_PAUSED, { data: { paused } });
};

const pauseScreen = new PauseScreen({ onResume: () => setPaused(false) });

// Audio can only start after a user gesture. M mutes, N shows/hides the map.
const isTyping = (event) =>
  ["TEXTAREA", "INPUT", "SELECT"].includes(event.target.tagName);

document.addEventListener("keydown", (event) => {
  sound.unlock();

  if (isTyping(event) || event.repeat) {
    return;
  }

  const key = event.key.toLowerCase();

  if (key === "m") {
    notifications.push(sound.toggleMute() ? "Som desligado" : "Som ligado");
  } else if (key === "n") {
    minimap.toggle();
  } else if (key === "p") {
    setPaused(!isPaused);
  }
});
document.addEventListener("pointerdown", () => sound.unlock());

// The session id is kept so a reload resumes the same game
const SESSION_STORAGE_KEY = "dinamic-rpg:session";

const storage = {
  get: () => {
    try {
      return localStorage.getItem(SESSION_STORAGE_KEY);
    } catch {
      return null;
    }
  },
  set: (sessionId) => {
    try {
      localStorage.setItem(SESSION_STORAGE_KEY, sessionId);
    } catch {
      // The game works without it, it just can't be resumed
    }
  },
};

let isResumed = false;

const NPC_SPAWN = new Vector2(424, 355);

// A free position close to `center`, so NPCs don't start stacked
const npcSpawnPosition = (center = NPC_SPAWN) => {
  for (let attempt = 0; attempt < 20; attempt++) {
    const x = Math.round(center.x + (Math.random() - 0.5) * 8 * 12);
    const y = Math.round(center.y + (Math.random() - 0.5) * 6 * 12);

    if (!map1.collision.isBlocked(x, y, 16, 12)) {
      return new Vector2(x, y);
    }
  }

  return new Vector2(center.x, center.y);
};

// Fishing and gathering (F near the pier and the fields)
const activityHud = new ActivityHud({ input: mainScene.input });

// Knocked out in a fight: the screen goes dark and the hero wakes up in the
// tavern (the server takes some coins)
const knockOutScreen = document.createElement("div");
knockOutScreen.className = "knockout-screen";
knockOutScreen.textContent = "Você desmaiou...";
document.getElementById("game-container").appendChild(knockOutScreen);

const wakeUpInTavern = () => {
  knockOutScreen.classList.add("visible");
  mainScene.input.blocked = true;

  setTimeout(() => {
    const tavern = PLACES_BY_ID.tavern ?? heroInitialPosition;
    const spot = npcSpawnPosition(tavern);
    hero.position.x = spot.x;
    hero.position.y = spot.y;
    fights.recover();
    hero.emitPosition();
    knockOutScreen.classList.remove("visible");
    mainScene.input.blocked = false;
  }, 2500);
};

// Fights between the player and the NPCs (Space attacks, Shift dodges)
const fights = new FightManager({
  hero,
  collision: map1.collision,
  npcs,
  onPlayerKnockedOut: wakeUpInTavern,
});
// Weapons and armor of the inventory
playerState.subscribe((state) => fights.setInventory(state.inventory));
mainScene.addChild(fights);
mainScene.fights = fights;
mainScene.chatOpen = () => chatContainer.isOpen;

const addNpc = ({ id, data }) => {
  if (npcs.has(id)) {
    return;
  }

  // Visitors arrive by boat, at the pier
  if (data.visitor && !isResumed) {
    const dock = PLACES_BY_ID.dock ?? NPC_SPAWN;
    const position = npcSpawnPosition(dock);
    const visitor = new Npc(id, position.x, position.y, 16, 12, data);
    mainScene.addChild(visitor);
    npcs.set(id, visitor);
    return;
  }

  // A resumed game puts NPCs where they should be at this time of the day
  const { placeId } = scheduleFor(
    gameClock.hour,
    { id, routine: data.routine ?? [] },
    Boolean(PLACES_BY_ID.tavern),
    {
      weather: worldState.weather,
      festival: worldState.festival,
      day: gameClock.day,
      raid: worldState.state.raid,
    },
  );
  const place = PLACES_BY_ID[placeId ?? data.routine?.[0]];
  const initialPosition = npcSpawnPosition(
    isResumed && place ? place : NPC_SPAWN,
  );
  const npc = new Npc(id, initialPosition.x, initialPosition.y, 16, 12, data);

  mainScene.addChild(npc);
  npcs.set(id, npc);
};

setStatus(null);
statusBanner.show("Conectando...");

gameSocket.on("open", () => {
  statusBanner.show("Gerando o mundo...");
  gameSocket.send(protocol.CREATE_AGENTS, {
    data: {
      quantity: NUMBER_OF_NPCS,
      language: NPC_CONVERSATION_LANGUAGE,
      places: PLACES.map(({ id, name, description }) => ({
        id,
        name,
        description,
      })),
      worldEventIntervalMs: WORLD_EVENT_INTERVAL_MS,
      resumeSessionId: storage.get(),
    },
  });
});

gameSocket.on(protocol.SESSION, ({ data }) => {
  storage.set(data.sessionId);
  isResumed = data.resumed;

  if (isResumed) {
    statusBanner.show("Partida retomada!", { duration: 3000 });
  }
});

gameSocket.on(protocol.CLOCK, ({ data }) => gameClock.sync(data));

gameSocket.on(protocol.PLAYER_STATE, ({ data }) => playerState.set(data));

gameSocket.on(protocol.WORLD_STATE, ({ data }) => {
  worldState.set(data);
  weatherEffects.setWeather(data.weather);
  weatherEffects.setSeason(data.season);
  updateBandits(data.raid);
});

// Bandits of a raid come and go with the world state
const updateBandits = (raid) => {
  const bandits = new globalThis.Map(
    (raid?.bandits ?? []).map((bandit) => [bandit.id, bandit]),
  );

  // The ones that left (or were beaten) disappear
  for (const [id, npc] of npcs) {
    if (npc.data.bandit && !bandits.has(id)) {
      const remove = () => {
        npcs.delete(id);
        npc.destroy();
      };
      // A beaten bandit lies on the ground a bit first
      if (npc.knockedOut) setTimeout(remove, 3000);
      else remove();
    }
  }

  const place = PLACES_BY_ID[raid?.placeId] ?? NPC_SPAWN;

  for (const bandit of bandits.values()) {
    if (npcs.has(bandit.id)) continue;

    const position = npcSpawnPosition(place);
    const npc = new Npc(bandit.id, position.x, position.y, 16, 12, {
      name: bandit.name,
      sprite: bandit.sprite,
      occupation: bandit.leader ? "bandit leader" : "bandit",
      personality: ["aggressive"],
      routine: raid.placeId ? [raid.placeId] : [],
      bandit: true,
    });
    mainScene.addChild(npc);
    npcs.set(bandit.id, npc);
  }
};

gameSocket.on(protocol.NOTIFICATION, ({ data }) => {
  notifications.push(data.text, data.kind);
  sound.chime(data.kind);
});

gameSocket.on("close", () => {
  statusBanner.hide();
  setStatus(
    isLoaded
      ? "Conexão com o servidor perdida."
      : "Não foi possível conectar ao servidor.",
    { retry: true },
  );
});

gameSocket.on(protocol.AGENT_CREATED, ({ data }) => {
  addNpc(data.agent);

  if (!data.visitor) {
    statusBanner.show(
      `${data.agent.data.name} chegou à vila (${data.created}/${data.total})`,
    );
  }
});

// A visitor left the village
gameSocket.on(protocol.AGENT_LEFT, ({ agentId }) => {
  const npc = npcs.get(agentId);

  if (!npc) return;

  npc.endChat();
  npc.npcConversation?.interrupt(npc);
  npcs.delete(agentId);
  npc.destroy();
});

gameSocket.on(protocol.AGENTS_CREATED, ({ data }) => {
  data.forEach(addNpc);
  isLoaded = true;

  if (!isResumed) {
    statusBanner.show(
      "Todos os moradores chegaram! Aperte J para abrir o diário.",
      {
        duration: 5000,
      },
    );
  }
});

gameSocket.on(protocol.WORLD_EVENT, ({ data }) => {
  notifications.push(`Notícia na vila: ${data.headline}`, "news");
});

gameSocket.on(protocol.ERROR, ({ data }) => {
  if (data?.requestType !== protocol.CREATE_AGENTS) {
    return; // Handled by the NPCs and the NpcDirector
  }

  console.error(data.message);
  statusBanner.hide();
  setStatus("Erro ao gerar o mundo.", { retry: true });
});

gameSocket.connect();

// The game runs while the world is generated: NPCs show up as they're created
const update = (delta) => {
  // Paused: the scene is still drawn, but nothing moves
  if (isPaused) {
    return;
  }

  mainScene.stepEntry(delta, mainScene);
  weatherEffects.step(delta);
  sound.updateAmbience(delta, {
    hour: gameClock.hour,
    weather: worldState.weather,
  });
  minimap.update(delta, chatContainer.isOpen || journal.isOpen);
  placeBanner.update(hero.position);
  activityHud.update(
    hero.position,
    chatContainer.isOpen || journal.isOpen || fights.isFighting,
  );
};

const draw = () => {
  // Clear anything stale
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.imageSmoothingEnabled = false;

  ctx.save();

  ctx.translate(camera.position.x, camera.position.y);
  ctx.scale(SCALE, SCALE);

  mainScene.draw(ctx, 0, 0);
  map1.foreground.draw(ctx, 0, 0);
  overlayLayer.draw(ctx); // Speech bubbles and icons, over the trees

  ctx.restore();

  // Day and night
  const { color, alpha } = lightingAt(gameClock.minuteOfDay);
  if (alpha > 0) {
    ctx.fillStyle = `rgba(${color.join(", ")}, ${alpha})`;
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }

  weatherEffects.draw(ctx);

  clockHud.update();
};

const gameLoop = new GameLoop(update, draw);

// Handle for debugging in the browser console (only in development)
if (import.meta.env.DEV) {
  globalThis.game = {
    mainScene,
    npcs,
    worldState,
    weatherEffects,
    gameClock,
    playerState,
    fights,
    gameSocket,
    updateBandits,
  };
}

gameLoop.start();
