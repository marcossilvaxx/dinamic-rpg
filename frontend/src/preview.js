// Preview page (preview.html): houses and interiors drawn with code next to
// the ones of the tilesets, to compare before using them in the game.

import { LOTS } from "./levels/decor";
import { MAPS } from "./levels/maps";
import { seeded } from "./world/procedural/pixel";
import {
  buildHouse,
  drawHouse,
  houseFor,
  houseSize,
} from "./world/procedural/houses";
import { createIsland, paintIsland } from "./world/island";
import { paintTree } from "./world/island/paint";
import { generateRegions } from "./world/island/regions";
import { paintRegion } from "./world/island/paintRegions";
import * as sprites from "./world/sprites";
import { drawRoom, roomFor } from "./world/procedural/rooms";
import { TileMap } from "./world/TileMap";

const SCALE = 3;
const GRASS = "#74c857";

const figure = (parent, width, height, caption, reference = false) => {
  const element = document.createElement("figure");
  if (reference) element.className = "reference";
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  canvas.style.width = `${width * SCALE}px`;
  canvas.style.height = `${height * SCALE}px`;
  const label = document.createElement("figcaption");
  label.textContent = caption;
  element.append(canvas, label);
  parent.appendChild(element);
  const ctx = canvas.getContext("2d");
  ctx.imageSmoothingEnabled = false;
  return ctx;
};

const grass = (ctx, width, height, seed) => {
  const random = seeded(seed);
  ctx.fillStyle = GRASS;
  ctx.fillRect(0, 0, width, height);
  for (let i = 0; i < (width * height) / 60; i++) {
    ctx.fillStyle = random.chance(0.5) ? "#56b742" : "#8ed66c";
    ctx.fillRect(random.int(0, width), random.int(0, height), 1, 2);
  }
};

const village = new TileMap(MAPS.village);
const interiors = ["west_house", "tavern"].map((id) => [
  id,
  new TileMap(MAPS[id]),
]);

const KINDS = [
  ["bakery", "Padaria"],
  ["smithy", "Ferraria"],
  ["clinic", "Enfermaria"],
  ["fisher", "Casa do pescador"],
  ["farm", "Fazenda"],
  ["school", "Escola"],
  ["tailor", "Alfaiataria"],
  ["home", "Casa"],
];
const ROOMS = [
  ["smithy", "Ferraria"],
  ["clinic", "Enfermaria"],
  ["bakery", "Padaria"],
  ["home", "Casa"],
];

let round = 1;

async function render() {
  await Promise.all([village.ready, ...interiors.map(([, map]) => map.ready)]);
  const houses = document.getElementById("houses");
  const villageRow = document.getElementById("village");
  const rooms = document.getElementById("rooms");
  const regions = document.getElementById("regions");
  regions.replaceChildren();
  houses.replaceChildren();
  villageRow.replaceChildren();
  rooms.replaceChildren();

  // The house of the tileset (west house of the map)
  const reference = figure(
    houses,
    72,
    96,
    "Tileset (todas as casas são iguais)",
    true,
  );
  grass(reference, 72, 96, 1);
  reference.drawImage(village.background.image, 120, 46, 72, 96, 0, 0, 72, 96);
  reference.drawImage(village.foreground.image, 120, 46, 72, 96, 0, 0, 72, 96);

  KINDS.forEach(([kind, name], i) => {
    const spec = houseFor(kind, round * 100 + i);
    const { height } = houseSize(spec);
    const width = spec.width + 24;
    const ctx = figure(houses, width, height + 18, name);
    grass(ctx, width, height + 18, i + 5);
    drawHouse(ctx, spec, 12, 8);
  });

  // Whole islands generated from different seeds (with their buildings)
  for (let i = 0; i < 3; i++) {
    const seed = round * 7919 + i * 104729;
    const layout = createIsland(seed);
    const { background, foreground } = paintIsland(layout);
    const ctx = figure(villageRow, 840, 480, `Ilha da semente ${seed}`);
    ctx.drawImage(background, 0, 0);
    ctx.drawImage(foreground, 0, 0);
    // Houses the village plan could build on the lots
    LOTS.forEach((lot, j) => {
      const spec = {
        ...houseFor(["bakery", "smithy", "clinic", "home"][j], seed + j),
        width: 60,
      };
      buildHouse(spec, {
        x: lot.column * 12 + 6,
        ground: (lot.row + 7) * 12 + 2,
      }).paint(ctx, ctx);
    });
  }

  // The regions reached by boat, generated like the island (the things that
  // change in the game are drawn over them here)
  const names = { forest: "Floresta", mine: "Mina", town: "Pedravento" };
  for (const layout of Object.values(generateRegions(round * 7919))) {
    const { background, foreground } = paintRegion(layout);
    const ctx = figure(
      regions,
      background.width,
      background.height,
      names[layout.id],
    );
    ctx.drawImage(background, 0, 0);
    for (const point of Object.values(layout.points)) {
      const draw = {
        tree: () =>
          paintTree(
            ctx,
            ctx,
            { column: point.x / 12 - 1, row: (point.y - 10) / 12 - 2 },
            seeded(point.x),
          ),
        ore: () => sprites.oreRock(ctx, point.x, point.y - 8),
        crystal: () => sprites.crystal(ctx, point.x, point.y - 8, 0),
        forage: () => sprites.bush(ctx, point.x, point.y + 4, "summer"),
        lamp: () => sprites.lamp(ctx, point.x, point.y, false),
        tent: () => sprites.tent(ctx, point.x, point.y),
        campfire: () => sprites.campfire(ctx, point.x, point.y, 0, true),
        stall: () => sprites.stall(ctx, point.x, point.y, point.x),
        boat: () => sprites.boat(ctx, point.x, point.y, 0),
      }[point.kind];
      draw?.();
    }
    ctx.drawImage(foreground, 0, 0);
  }

  // Interiors of the tilesets, then generated ones
  interiors.forEach(([id, tileMap]) => {
    const ctx = figure(
      rooms,
      tileMap.width,
      tileMap.height,
      `Tileset: ${id === "tavern" ? "taverna" : "casa"}`,
      true,
    );
    ctx.drawImage(tileMap.background.image, 0, 0);
    ctx.drawImage(tileMap.foreground.image, 0, 0);
  });
  ROOMS.forEach(([kind, name], i) => {
    const spec = roomFor(kind, round * 1000 + i);
    const ctx = figure(rooms, spec.columns * 16 + 6, spec.rows * 16 + 3, name);
    ctx.fillStyle = "#1c1822";
    ctx.fillRect(0, 0, spec.columns * 16 + 6, spec.rows * 16 + 3);
    drawRoom(ctx, spec, 3, 0);
  });
}

document.getElementById("reroll").addEventListener("click", () => {
  round++;
  render();
});

render();
