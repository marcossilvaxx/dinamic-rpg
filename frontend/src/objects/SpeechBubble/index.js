import { GameObject } from "../../GameObject";
import { getMillisecondsToReadText } from "../../utils/text";
import { overlayLayer } from "../../utils/overlay";
import { Vector2 } from "../../utils/Vector2";

const FONT_SIZE = 4;
const LINE_HEIGHT = 5;

// Border color of the bubble for each emotion of the speaker
const EMOTION_COLORS = {
  neutral: "#000",
  happy: "#2e7d32",
  angry: "#c62828",
  sad: "#1565c0",
  surprised: "#ef6c00",
};

const wrapText = (ctx, text, maxWidth) => {
  const lines = [];
  let current = "";

  text.split(/\s+/).forEach((word) => {
    const candidate = current ? `${current} ${word}` : word;

    if (current && ctx.measureText(candidate).width > maxWidth) {
      lines.push(current);
      current = word;
    } else {
      current = candidate;
    }
  });

  if (current) {
    lines.push(current);
  }

  return lines;
};

export class SpeechBubble extends GameObject {
  /**
   * @param {object} options
   * @param {number} [options.time] Milliseconds before the bubble is
   *   destroyed. Defaults to the time needed to read the text.
   * @param {boolean} [options.persistent] Never destroy the bubble; change
   *   `text` / `visible` to reuse it.
   * @param {number} [options.maxWidth] Wrap the text in lines of this width.
   * @param {string} [options.emotion] Colors the border of the bubble.
   */
  constructor(
    x,
    y,
    text,
    { time, persistent = false, maxWidth = Infinity, emotion = "neutral" } = {},
  ) {
    super({
      position: new Vector2(x, y),
    });

    this.text = text;
    this.time = time;
    this.persistent = persistent;
    this.maxWidth = maxWidth;
    this.borderColor = EMOTION_COLORS[emotion] ?? EMOTION_COLORS.neutral;
    this.visible = true;
    this.wrapped = null; // { text, lines } cache
  }

  ready() {
    if (this.persistent) {
      return;
    }

    setTimeout(
      () => {
        this.destroy();
      },
      this.time ?? getMillisecondsToReadText(this.text),
    );
  }

  getLines(ctx) {
    if (this.wrapped?.text !== this.text) {
      this.wrapped = {
        text: this.text,
        lines: wrapText(ctx, this.text, this.maxWidth),
      };
    }

    return this.wrapped.lines;
  }

  // Drawn over the foreground (see utils/overlay.js)
  drawImage(ctx, x, y) {
    overlayLayer.add((overlayCtx) => this.render(overlayCtx, x, y));
  }

  render(ctx, x, y) {
    if (!this.visible || !this.text) {
      return;
    }

    ctx.font = `${FONT_SIZE}px Arial`;

    /// draw text from top - makes life easier at the moment
    ctx.textBaseline = "top";

    const lines = this.getLines(ctx);

    /// get width of text
    const MIN_WIDTH = 7;
    const rawWidth = Math.max(
      ...lines.map((line) => ctx.measureText(line).width),
    );
    const width = Math.max(rawWidth, MIN_WIDTH); // Defines a min width to the bubble
    const height = FONT_SIZE + (lines.length - 1) * LINE_HEIGHT;

    const padding = { x: 10, y: 4 }; // Internal padding of the text/speech bubble

    const marginBottom = 2;

    // Bubbles with more lines grow upwards
    const newX = Math.min(x, x - width / 2 + padding.x / 3);
    const newY =
      y - (padding.y - marginBottom) - (lines.length - 1) * LINE_HEIGHT;

    /// draw background rect assuming height of font
    const path = new Path2D();
    path.roundRect(newX, newY, width + padding.x, height + padding.y, [2]);
    ctx.fillStyle = "#fff";
    ctx.strokeStyle = this.borderColor;
    ctx.lineWidth = 1;
    ctx.fill(path);
    ctx.stroke(path);

    /// text color
    ctx.fillStyle = "#000";

    /// draw text on top
    lines.forEach((line, index) => {
      ctx.fillText(
        line,
        newX + (rawWidth < MIN_WIDTH ? MIN_WIDTH : padding.x / 2),
        newY + padding.y / 1.5 + index * LINE_HEIGHT,
      );
    });
  }
}
