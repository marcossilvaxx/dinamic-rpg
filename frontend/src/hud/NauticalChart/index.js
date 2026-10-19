// The nautical chart (from the travel menu): the island, the places reached
// by boat and the islets found at sea, drawn from their generated maps on
// an old paper. Islets not found yet are question marks in the fog.

const WIDTH = 420;
const HEIGHT = 270;
const PAPER = "#ead9b0";
const INK = "#5a4026";
const SEA = "rgba(90, 140, 160, 0.18)";

// Where each place is on the chart (center) and its size (px per tile)
const LAYOUT = {
  village: { x: 210, y: 140, scale: 1.5 },
  forest: { x: 88, y: 58, scale: 1.1 },
  mine: { x: 340, y: 62, scale: 0 },
  town: { x: 330, y: 212, scale: 1 },
  islet_1: { x: 62, y: 200, scale: 1.1 },
  islet_2: { x: 220, y: 30, scale: 1.1 },
  islet_3: { x: 380, y: 140, scale: 1.1 },
};

export class NauticalChart {
  /** @param {{ input: import("../../Input").Input }} options */
  constructor({ input, root = "game-container" }) {
    this.input = input;
    this.isOpen = false;

    this.element = document.createElement("div");
    this.element.className = "nautical-chart";
    const title = document.createElement("h3");
    title.textContent = "Mapa náutico";
    this.canvas = document.createElement("canvas");
    this.canvas.width = WIDTH;
    this.canvas.height = HEIGHT;
    const hint = document.createElement("p");
    hint.textContent =
      "Explore o mar aberto para achar novas ilhas. Esc para fechar";
    this.element.append(title, this.canvas, hint);
    this.element.addEventListener("click", () => this.close());
    document.getElementById(root)?.appendChild(this.element);

    document.addEventListener("keydown", (event) => {
      if (this.isOpen && event.key === "Escape") this.close();
    });
  }

  /**
   * @param {object} chart
   * @param {object} chart.island Layout of the island.
   * @param {{id: string, name: string, layout: object, islet?: boolean}[]} chart.regions
   * @param {string[]} chart.discovered Islets found.
   * @param {string} chart.here Where the player is ("village" or a region).
   */
  open(chart) {
    this.draw(chart);
    this.isOpen = true;
    this.input.blocked = true;
    this.element.classList.add("visible");
  }

  close() {
    this.isOpen = false;
    this.input.blocked = false;
    this.element.classList.remove("visible");
  }

  draw({ island, regions, discovered, here }) {
    const ctx = this.canvas.getContext("2d");
    ctx.imageSmoothingEnabled = false;

    // Old paper with the sea in waves
    ctx.fillStyle = PAPER;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = SEA;
    ctx.fillRect(8, 8, WIDTH - 16, HEIGHT - 16);
    ctx.strokeStyle = "rgba(90, 64, 38, 0.25)";
    for (let y = 20; y < HEIGHT - 10; y += 18) {
      for (let x = 16 + ((y / 18) % 2) * 14; x < WIDTH - 20; x += 28) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.quadraticCurveTo(x + 4, y - 3, x + 8, y);
        ctx.stroke();
      }
    }
    ctx.strokeStyle = INK;
    ctx.lineWidth = 2;
    ctx.strokeRect(5, 5, WIDTH - 10, HEIGHT - 10);
    ctx.lineWidth = 1;

    const places = [
      { id: "village", name: "Sua vila", layout: island, known: true },
      ...regions.map((region) => ({
        id: region.id,
        name: region.name,
        layout: region.layout,
        known: !region.islet || discovered.includes(region.id),
      })),
    ];

    // Routes of the boat from the pier
    ctx.setLineDash([3, 4]);
    ctx.strokeStyle = "rgba(90, 64, 38, 0.6)";
    for (const place of places) {
      if (place.id === "village" || !place.known) continue;
      const from = LAYOUT.village;
      const to = LAYOUT[place.id];
      ctx.beginPath();
      ctx.moveTo(from.x, from.y);
      ctx.lineTo(to.x, to.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);

    for (const place of places) {
      const spot = LAYOUT[place.id];
      if (!spot) continue;
      if (!place.known) {
        this.drawUnknown(ctx, spot);
        continue;
      }
      if (place.id === "mine") this.drawCliffs(ctx, spot);
      else this.drawLand(ctx, place.layout, spot);
      this.label(ctx, place.name, spot, place.id === here);
    }

    this.drawCompass(ctx, WIDTH - 40, HEIGHT - 44);
  }

  /** The land of a generated map, seen from above. */
  drawLand(ctx, layout, { x, y, scale }) {
    const columns = layout.columns ?? 70;
    const rows = layout.rows ?? 40;
    const left = Math.round(x - (columns * scale) / 2);
    const top = Math.round(y - (rows * scale) / 2);
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < columns; c++) {
        const i = r * columns + c;
        if (!layout.land[i]) continue;
        ctx.fillStyle = layout.roads?.has(i)
          ? "#b08a58"
          : layout.edge?.[i]
            ? "#c9a46a"
            : "#9fb86f";
        ctx.fillRect(
          left + Math.floor(c * scale),
          top + Math.floor(r * scale),
          Math.ceil(scale),
          Math.ceil(scale),
        );
      }
    }
  }

  drawCliffs(ctx, { x, y }) {
    for (const [dx, h] of [
      [-16, 16],
      [0, 24],
      [16, 14],
    ]) {
      ctx.fillStyle = "#8d8478";
      ctx.beginPath();
      ctx.moveTo(x + dx - 12, y + 10);
      ctx.lineTo(x + dx, y + 10 - h);
      ctx.lineTo(x + dx + 12, y + 10);
      ctx.fill();
      ctx.strokeStyle = INK;
      ctx.stroke();
    }
  }

  drawUnknown(ctx, { x, y }) {
    const gradient = ctx.createRadialGradient(x, y, 2, x, y, 28);
    gradient.addColorStop(0, "rgba(255, 255, 255, 0.75)");
    gradient.addColorStop(1, "rgba(255, 255, 255, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(x - 30, y - 30, 60, 60);
    ctx.fillStyle = INK;
    ctx.font = "bold 18px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText("?", x, y + 6);
  }

  label(ctx, text, { x, y, scale }, here) {
    ctx.font = "11px Georgia, serif";
    ctx.textAlign = "center";
    const below = y + (scale ? 20 * scale : 18) + 4;
    ctx.fillStyle = here ? "#8a2b2b" : INK;
    ctx.fillText(
      here ? `${text} (você)` : text,
      x,
      Math.min(HEIGHT - 12, below),
    );
  }

  drawCompass(ctx, x, y) {
    ctx.strokeStyle = INK;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.arc(x, y, 14, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y - 20);
    ctx.lineTo(x + 4, y);
    ctx.lineTo(x, y + 20);
    ctx.lineTo(x - 4, y);
    ctx.fill();
    ctx.font = "bold 10px Georgia, serif";
    ctx.textAlign = "center";
    ctx.fillText("N", x, y - 23);
  }
}
