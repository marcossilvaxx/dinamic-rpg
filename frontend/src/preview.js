// Preview page (preview.html): houses and interiors drawn with code next to
// the ones of the tilesets, to compare before using them in the game.

import { LOTS } from "./levels/decor";
import { MAPS } from "./levels/maps";
import { seeded } from "./world/procedural/pixel";
import { drawHouse, houseFor, houseSize } from "./world/procedural/houses";
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

  // Generated houses on the lots of the real village map
  const area = { x: 180, y: 0, width: 600, height: 300 };
  const map = figure(
    villageRow,
    area.width,
    area.height,
    "Vila com casas geradas nos terrenos",
  );
  map.drawImage(
    village.background.image,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    area.width,
    area.height,
  );
  const lotKinds = ["bakery", "smithy", "clinic", "home"];
  LOTS.forEach((lot, i) => {
    const spec = { ...houseFor(lotKinds[i], round * 50 + i), width: 60 };
    const { height } = houseSize(spec);
    const x = lot.column * 12 + 6 - area.x;
    const y = (lot.row + 8) * 12 - height - area.y;
    drawHouse(map, spec, x, y);
  });
  map.drawImage(
    village.foreground.image,
    area.x,
    area.y,
    area.width,
    area.height,
    0,
    0,
    area.width,
    area.height,
  );

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
