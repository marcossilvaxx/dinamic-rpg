import { sound } from "./audio/sound";
import { GameLoop } from "./GameLoop";
import { GameObject } from "./GameObject";
import { Input } from "./Input";
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
import { MainMenu } from "./hud/MainMenu";
import { PauseScreen } from "./hud/PauseScreen";
import { placeBanner } from "./hud/PlaceBanner";
import { notifications } from "./hud/Notifications";
import { overhearLog } from "./hud/OverhearLog";
import { statusBanner } from "./hud/StatusBanner";
import {
  REGIONS_BY_ID,
  VILLAGE_HEIGHT,
  VILLAGE_WIDTH,
  interiorPoint,
  worldCollisionRows,
} from "./levels/world";
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
import { CollisionGrid } from "./utils/collisionGrid";
import { overlayLayer } from "./utils/overlay";
import { pathfinder } from "./utils/pathfinding";
import { ChoiceMenu } from "./hud/ChoiceMenu";
import { Interiors } from "./world/Interiors";
import { Regions } from "./world/Regions";
import { Village } from "./world/Village";
import { applyVillageLayout } from "./world/VillageLayout";
import { createIsland, paintIsland } from "./world/island";
import { roofContexts } from "./world/island/paint";
import { occupationLabel } from "./utils/occupation";
import {
  adoptIslandSeed,
  islandSeed,
  startNewIsland,
  takeNewGameRequest,
} from "./world/island/seed";
import { LOTS } from "./levels/decor";

const canvas = document.querySelector("#game-canvas");

const ctx = canvas.getContext("2d");
const mainScene = new GameObject({
  position: new Vector2(0, 0),
});

// The island is generated from a seed (kept with the saved game): its layout
// fills the places, props and collisions, then it is drawn
const seed = islandSeed();
const island = createIsland(seed);
const islandImages = paintIsland(island);
const villageImage = { image: islandImages.background, isLoaded: true };
const map1 = new Map({
  resource: villageImage,
  foregroundResource: { image: islandImages.foreground, isLoaded: true },
  width: VILLAGE_WIDTH,
  height: VILLAGE_HEIGHT,
});
map1.roofs = islandImages.roofs;

// One collision grid for the village and the interiors (see levels/world.js)
const collision = new CollisionGrid(worldCollisionRows(), 12);

const camera = new Camera({
  mapWidth: map1.width,
  mapHeight: map1.height,
});

const heroInitialPosition = new Vector2(
  PLACES_BY_ID.garden.x,
  PLACES_BY_ID.garden.y,
);

const hero = new Hero(heroInitialPosition.x, heroInitialPosition.y, 16, 12); // 16 -> Object "hitbox" size w and h

mainScene.addChild(map1);
mainScene.addChild(camera);
mainScene.addChild(hero);

mainScene.input = new Input();
mainScene.player = hero;
mainScene.collision = collision;
mainScene.resolveFollowTarget = (npc) => interiors.resolveFollowTarget(npc);
mainScene.overhearLog = overhearLog;
mainScene.debugMode = false;

// Lamps, the windmill, the well... can't be walked through
Village.blockProps(collision);
pathfinder.init(collision);

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

// Inside the buildings (F at the door)
const interiors = new Interiors({
  scene: mainScene,
  hero,
  npcs,
  camera,
  collision,
  input: mainScene.input,
  screen: { width: canvas.width, height: canvas.height },
});

// Menu of choices (travel by boat, trade with the merchants)
const menu = new ChoiceMenu({ input: mainScene.input });

// Forest, mine and town, reached by boat from the pier
const regions = new Regions({
  scene: mainScene,
  hero,
  npcs,
  camera,
  menu,
  screen: { width: canvas.width, height: canvas.height },
});

// The living map: seasons, snow and mud, lights, animals, props and the
// objects the player uses with F
const village = new Village({
  scene: mainScene,
  map: map1,
  hero,
  npcs,
  collision,
  interiors,
  regions,
  screen: { width: canvas.width, height: canvas.height },
});

// NPCs make each other talk when they meet
mainScene.addChild(new NpcDirector({ npcs, player: hero, overhearLog }));

// Journal of the player (J key)
const journal = new Journal({
  getNpcs: () =>
    [...npcs.values()].map(({ id, data }) => ({
      id,
      name: data.name,
      occupation: occupationLabel(data),
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
  getPlayer: () =>
    regions.isAway ? PLACES_BY_ID.dock : interiors.mapPosition(hero),
  getNpcs: () => [...npcs.values()],
  positionOf: (npc) => interiors.mapPosition(npc),
  mapImage: villageImage,
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

// Back to the main menu: the server keeps the game saved, the page starts
// again on the menu
const pauseScreen = new PauseScreen({
  onResume: () => setPaused(false),
  onMainMenu: () => window.location.reload(),
});

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

const NPC_SPAWN = new Vector2(
  PLACES_BY_ID.south_road.x,
  PLACES_BY_ID.south_road.y,
);

// A free position close to `center`, so NPCs don't start stacked
const npcSpawnPosition = (center = NPC_SPAWN) => {
  for (let attempt = 0; attempt < 20; attempt++) {
    const x = Math.round(center.x + (Math.random() - 0.5) * 8 * 12);
    const y = Math.round(center.y + (Math.random() - 0.5) * 6 * 12);

    if (!collision.isBlocked(x, y, 16, 12)) {
      return new Vector2(x, y);
    }
  }

  return new Vector2(center.x, center.y);
};

// Fishing and gathering (F near the pier and the fields)
const activityHud = new ActivityHud({
  input: mainScene.input,
  getInteraction: (position) => village.interactionAt(position),
});

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
    // Wherever it happened (a building, the forest...), back to the village
    if (interiors.isInside) interiors.exit();
    if (regions.isAway) regions.leave({ toPier: false });
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
  collision,
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

  // People of the town live there (they don't come to the island)
  if (data.region === "town") {
    const square = interiorPoint(REGIONS_BY_ID.town, "square");
    const position = npcSpawnPosition(new Vector2(square.x, square.y));
    const person = new Npc(id, position.x, position.y, 16, 12, data);
    mainScene.addChild(person);
    npcs.set(id, person);
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

// Title screen: the game starts (or is resumed) once the player chooses
const startGame = ({ resume }) => {
  const savedId = storage.get();
  mainScene.input.blocked = false;
  statusBanner.show(resume ? "Retomando a partida..." : "Gerando o mundo...");
  gameSocket.send(protocol.CREATE_AGENTS, {
    data: {
      quantity: NUMBER_OF_NPCS,
      language: NPC_CONVERSATION_LANGUAGE,
      places: PLACES.map(({ id, name, description, building }) => ({
        id,
        name,
        description,
        building: Boolean(building),
      })),
      lots: LOTS.map(({ id, description }) => ({ id, description })),
      worldEventIntervalMs: WORLD_EVENT_INTERVAL_MS,
      resumeSessionId: resume ? savedId : null,
      islandSeed: seed,
      forgetSessionId: resume ? null : savedId,
    },
  });
};

const mainMenu = new MainMenu({
  onContinue: () => startGame({ resume: true }),
  // A new island is built after a reload (see world/island/seed.js)
  onNewGame: () => startNewIsland(),
});
mainScene.input.blocked = true;
const newGameRequested = takeNewGameRequest();

// Is there a saved game to continue?
gameSocket.on("open", () => {
  if (newGameRequested) {
    mainMenu.hide();
    startGame({ resume: false });
    return;
  }

  const savedId = storage.get();
  if (savedId) {
    gameSocket.send(protocol.SESSION_INFO, { data: { sessionId: savedId } });
  } else {
    mainMenu.show(null);
  }
});

gameSocket.on(protocol.SAVED_GAME, ({ data }) => {
  // The saved game is on another island (e.g. continued in other browser)
  if (data.exists && adoptIslandSeed(data.islandSeed)) return;
  mainMenu.show(data.exists ? data : null);
});

gameSocket.on(protocol.SESSION, ({ data }) => {
  storage.set(data.sessionId);
  isResumed = data.resumed;

  if (isResumed) {
    statusBanner.show("Partida retomada!", { duration: 3000 });
  }
});

// What the village plan built on the empty lots (before the NPCs arrive)
gameSocket.on(protocol.VILLAGE_LAYOUT, ({ data }) => {
  applyVillageLayout(data.lots, {
    background: islandImages.background.getContext("2d"),
    foreground: islandImages.foreground.getContext("2d"),
    roofs: roofContexts(islandImages.roofs),
    collision,
    interiors,
    village,
  });
  if (data.lots.length && !isResumed) {
    statusBanner.show(
      `A vila tem: ${data.lots.map((lot) => lot.name).join(", ")}`,
      { duration: 4000 },
    );
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
    if (npc.data.bandit && !npc.data.camp && !bandits.has(id)) {
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
  mainMenu.hide();
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

  if (data.townsfolk) {
    notifications.push(`${data.agent.data.name} mora em Pedravento.`);
  } else if (!data.visitor) {
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
  interiors.step(delta, { fighting: fights.isFighting });
  regions.step(delta);
  village.step(delta);
  weatherEffects.step(delta);
  sound.updateAmbience(delta, {
    hour: gameClock.hour,
    weather: worldState.weather,
  });
  minimap.update(delta, chatContainer.isOpen || journal.isOpen);
  placeBanner.update(hero.position);
  activityHud.update(
    hero.position,
    chatContainer.isOpen ||
      journal.isOpen ||
      fights.isFighting ||
      menu.isOpen ||
      mainMenu.isOpen,
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
  interiors.drawForeground(ctx);
  regions.drawForeground(ctx);
  if (!interiors.isInside && !regions.isAway) village.drawTop(ctx); // Snow, smoke...

  overlayLayer.draw(ctx); // Speech bubbles and icons, over the trees

  ctx.restore();

  // Day and night, with the lights of the village (or of the room)
  if (interiors.isInside) {
    interiors.drawLighting(ctx, village.darkness, village.time);
  } else if (regions.isAway) {
    regions.drawLighting(ctx, lightingAt(gameClock.minuteOfDay));
    if (!regions.current.dark) weatherEffects.draw(ctx);
  } else {
    village.drawLighting(ctx, camera);
    weatherEffects.draw(ctx);
  }

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
    village,
    interiors,
    regions,
    island,
    places: PLACES_BY_ID,
  };
}

gameLoop.start();
