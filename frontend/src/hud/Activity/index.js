import { sound } from "../../audio/sound";
import * as protocol from "../../net/protocol";
import { gameSocket } from "../../net/socket";
import {
  ACTIVITIES,
  NEEDLE_SPEED,
  ZONE_WIDTH,
  activityAt,
  timingResult,
} from "../../systems/activity";

const RESULT_MS = 1800;

/**
 * "F - Pescar" near the pier (or "F - Colher" in the fields) and the timing
 * minigame: press F when the needle is in the green zone.
 */
export class ActivityHud {
  /** @param {{ input: import("../../Input").Input }} options */
  constructor({ input, root = "game-container" }) {
    this.input = input;
    this.root = root;
    this.kind = null; // Activity available where the player is
    this.game = null; // { kind, position, direction, zoneStart, state }
    this.lastTime = 0;

    this.prompt = document.createElement("div");
    this.prompt.className = "activity-prompt";
    this.overlay = document.createElement("div");
    this.overlay.className = "activity-game";
    this.overlay.innerHTML = `
      <p class="activity-title"></p>
      <div class="activity-bar">
        <span class="activity-zone"><span class="activity-perfect"></span></span>
        <span class="activity-needle"></span>
      </div>
      <p class="activity-hint">Aperte F na hora certa</p>`;
    const container = document.getElementById(root);
    container.append(this.prompt, this.overlay);

    document.addEventListener("keydown", (event) => {
      if (["TEXTAREA", "INPUT", "SELECT"].includes(event.target.tagName)) {
        return;
      }

      if (event.code === "KeyF" && !event.repeat) {
        if (this.game?.state === "playing") this.stop();
        else if (!this.game && this.kind && !this.input.blocked) this.start();
      } else if (event.key === "Escape" && this.game) {
        this.close();
      }
    });

    gameSocket.on(protocol.ACTIVITY_RESULT, ({ data }) =>
      this.showResult(data),
    );
  }

  /**
   * @param {{x: number, y: number}} position Of the player.
   * @param {boolean} hidden Chat or journal open.
   */
  update(position, hidden) {
    this.kind = hidden ? null : activityAt(position);

    const showPrompt = Boolean(this.kind) && !this.game;
    this.prompt.style.display = showPrompt ? "block" : "none";
    if (showPrompt) {
      this.prompt.textContent = `F - ${ACTIVITIES[this.kind].label}`;
    }
  }

  start() {
    const { kind } = this;
    this.game = {
      kind,
      position: 0,
      direction: 1,
      zoneStart: 0.15 + Math.random() * (0.85 - ZONE_WIDTH - 0.15),
      state: "playing",
    };
    this.input.blocked = true;
    this.overlay.querySelector(".activity-title").textContent =
      ACTIVITIES[kind].verb;
    this.overlay.querySelector(".activity-hint").textContent =
      "Aperte F na hora certa";
    const zone = this.overlay.querySelector(".activity-zone");
    zone.style.left = `${this.game.zoneStart * 100}%`;
    zone.style.width = `${ZONE_WIDTH * 100}%`;
    this.overlay.style.display = "flex";
    this.lastTime = performance.now();
    requestAnimationFrame(this.animate);
  }

  animate = (time) => {
    const { game } = this;

    if (game?.state !== "playing") return;

    const delta = time - this.lastTime;
    this.lastTime = time;
    game.position += game.direction * NEEDLE_SPEED * delta;

    if (game.position >= 1 || game.position <= 0) {
      game.direction *= -1;
      game.position = Math.min(1, Math.max(0, game.position));
    }

    this.overlay.querySelector(".activity-needle").style.left =
      `${game.position * 100}%`;
    requestAnimationFrame(this.animate);
  };

  stop() {
    const { game } = this;
    game.state = "waiting";
    const result = timingResult(game.position, game.zoneStart);

    this.overlay.querySelector(".activity-hint").textContent =
      result === "perfect"
        ? "Perfeito!"
        : result === "hit"
          ? "Boa!"
          : "Errou...";
    sound.tone({
      frequency: result === "miss" ? 220 : 660,
      duration: 0.15,
      type: "triangle",
      volume: 0.08,
    });

    const sent = gameSocket.send(protocol.ACTIVITY, {
      data: { kind: game.kind, result },
    });

    if (!sent) {
      this.close();
    }
  }

  showResult({ message, item }) {
    if (!this.game) return;

    this.overlay.querySelector(".activity-hint").textContent = message;
    if (item) sound.chime("item");
    setTimeout(() => this.close(), RESULT_MS);
  }

  close() {
    this.game = null;
    this.overlay.style.display = "none";
    this.input.blocked = false;
  }
}
