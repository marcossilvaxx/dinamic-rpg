import { GameObject } from "../../GameObject";
import { Vector2 } from "../../utils/Vector2";
import { overlayLayer } from "../../utils/overlay";

const ICONS = {
  happy: { text: "♥", color: "#e53935" },
  angry: { text: "!!", color: "#c62828" },
  sad: { text: "…", color: "#1565c0" },
  surprised: { text: "!", color: "#ef6c00" },
  question: { text: "?", color: "#6a1b9a" },
  sleeping: { text: "Zz", color: "#37474f" },
  // Knocked out in a fight, and hurt afterwards
  dizzy: { text: "✶", color: "#f9a825" },
  injured: { text: "✚", color: "#b71c1c" },
  // The NPC wants to talk to the player
  attention: { text: "!", color: "#fff", background: "#e53935" },
  // What the NPC is doing at work (`work` of the NPC data)
  smithing: { text: "⚒", color: "#5d4037" },
  fishing: { text: "≈", color: "#0277bd" },
  farming: { text: "♣", color: "#2e7d32" },
  cooking: { text: "♨", color: "#d84315" },
  trading: { text: "$", color: "#f9a825" },
  healing: { text: "+", color: "#c62828" },
  crafting: { text: "✂", color: "#6d4c41" },
  guarding: { text: "⚔", color: "#455a64" },
  hunting: { text: "➶", color: "#558b2f" },
  studying: { text: "✎", color: "#4527a0" },
};

/** Small icon over the head of a character (emotion, sleeping...). */
export class EmotionIcon extends GameObject {
  constructor(x, y) {
    super({ position: new Vector2(x, y) });
    this.kind = null;
    this.timeLeft = 0;
    this.persistentKind = null; // Shown when no temporary icon is active
  }

  /** Shows `kind` for `milliseconds` (neutral or unknown kinds are ignored). */
  show(kind, milliseconds = 2500) {
    if (!ICONS[kind]) {
      return;
    }

    this.kind = kind;
    this.timeLeft = milliseconds;
  }

  /** Icon always shown while set (e.g. "sleeping"); null removes it. */
  setPersistent(kind) {
    this.persistentKind = ICONS[kind] ? kind : null;
  }

  step(delta) {
    if (this.timeLeft > 0) {
      this.timeLeft -= delta;
      if (this.timeLeft <= 0) {
        this.kind = null;
      }
    }
  }

  // Drawn over the foreground (see utils/overlay.js)
  drawImage(ctx, x, y) {
    overlayLayer.add((overlayCtx) => this.render(overlayCtx, x, y));
  }

  render(ctx, x, y) {
    const icon = ICONS[this.kind ?? this.persistentKind];

    if (!icon) {
      return;
    }

    ctx.beginPath();
    ctx.arc(x, y, 3.5, 0, Math.PI * 2);
    ctx.fillStyle = icon.background ?? "#fff";
    ctx.strokeStyle = icon.background ?? icon.color;
    ctx.lineWidth = 0.5;
    ctx.fill();
    ctx.stroke();

    ctx.font = "bold 4px Arial";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = icon.color;
    ctx.fillText(icon.text, x, y + 0.3);
    ctx.textAlign = "start";
  }
}
