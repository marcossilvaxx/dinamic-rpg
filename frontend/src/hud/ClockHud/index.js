import { sound } from "../../audio/sound";
import { worldState } from "../../state/worldState";
import { gameClock } from "../../systems/GameClock";

const WEATHER_ICONS = {
  clear: "☀",
  cloudy: "☁",
  rain: "☂",
  storm: "⚡",
  fog: "≋",
  snow: "❄",
};

/**
 * Season, day, time and weather of the game in the top right corner, with
 * the keys.
 */
class ClockHud {
  constructor(root = "game-container") {
    this.root = root;
    this.element = null;
    this.text = "";
  }

  update() {
    if (!this.element) {
      this.element = document.createElement("div");
      this.element.className = "clock-hud";
      document.getElementById(this.root).appendChild(this.element);
    }

    const weather = WEATHER_ICONS[worldState.weather] ?? "";
    const season = worldState.state.seasonLabel ?? "";
    const text = `${season ? `${season} · ` : ""}${gameClock.format()} ${weather} · J Diário · N Mapa · M Som · P Pausar · Espaço Atacar${sound.muted ? " (mudo)" : ""}`;

    // Only touches the DOM when something changes
    if (text !== this.text) {
      this.text = text;
      this.element.textContent = text;
    }
  }
}

export const clockHud = new ClockHud("game-container");
