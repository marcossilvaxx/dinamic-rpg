import { GameLoop } from "./GameLoop";
import { GameObject } from "./GameObject";
import { Input } from "./Input";
import { resources } from "./Resource";
import { NUMBER_OF_NPCS, SCALE } from "./config/constants";
import { mapCollisions } from "./levels/map";
import { Camera } from "./objects/Camera";
import { Hero } from "./objects/Hero";
import { Map } from "./objects/Map";
import { Npc } from "./objects/Npc";
import "./styles/style.css";
import { Vector2 } from "./utils/Vector2";
import { parse2D } from "./utils/grid";
import { preRenderText } from "./utils/text";
import env from "./config/env.json";

const canvas = document.querySelector("#game-canvas");

const ctx = canvas.getContext("2d");
export const mainScene = new GameObject({
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

let npcs = [];

const wss = new WebSocket(env.WEBSOCKET_SERVER_URL);

wss.addEventListener("open", () => {
  wss.send(
    JSON.stringify({
      type: "create_agents",
      data: { quantity: NUMBER_OF_NPCS },
    })
  );
});

wss.addEventListener("message", (event) => {
  const { type, message, data } = JSON.parse(event.data);

  switch (type) {
    case "error":
      console.error(message);
      break;

    case "agents_created":
      npcs = data.map((npcData) => {
        const initialPosition = new Vector2(424, 355);
        const npc = new Npc(
          npcData.id,
          initialPosition.x,
          initialPosition.y,
          16,
          12,
          npcData.data
        );

        mainScene.addChild(npc);

        return npc;
      });
      break;

    default:
      console.warn("Unhandled type:", type);
      break;
  }
});

mainScene.input = new Input();
mainScene.player = hero;
mainScene.collisionBlocks = map1.collisionBlocks;
mainScene.debugMode = false;

const loadingRequirements = () => [npcs.length >= NUMBER_OF_NPCS];

const loading = document.createElement("div");
loading.className = "loading";
loading.innerHTML = "<p>Loading...</p>";

const update = (delta) => {
  mainScene.stepEntry(delta, mainScene);
};

const draw = () => {
  // Clear anything stale
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  ctx.imageSmoothingEnabled = false;

  ctx.save();

  ctx.translate(camera.position.x, camera.position.y);
  ctx.scale(SCALE, SCALE);

  if (loadingRequirements().every((requirement) => requirement)) {
    mainScene.draw(ctx, 0, 0);
    map1.foreground.draw(ctx, 0, 0);

    if (document.body.lastChild === loading) {
      document.body.lastChild.remove();
    }
  } else {
    if (document.body.lastChild !== loading) {
      document.body.appendChild(loading);
    }
  }

  ctx.restore();
};

const gameLoop = new GameLoop(update, draw);

gameLoop.start();
