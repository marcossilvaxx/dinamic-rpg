import { GameObject } from "../../GameObject";
import { getMillisecondsToReadText } from "../../utils/text";
import { Vector2 } from "../../utils/Vector2";

export class SpeechBubble extends GameObject {
  constructor(x, y, text, time) {
    super({
      position: new Vector2(x, y),
    });

    this.text = text;
    this.time = time;
  }

  ready() {
    const millisecondsToRead = getMillisecondsToReadText(this.text);
    setTimeout(
      () => {
        this.destroy();
      },
      this.time ? this.time : millisecondsToRead
    );
  }

  drawImage(ctx, x, y) {
    /// set font
    const font = "4px Arial";
    ctx.font = font;

    /// draw text from top - makes life easier at the moment
    ctx.textBaseline = "top";

    /// color for background
    ctx.fillStyle = "#fff";

    /// get width of text
    const MIN_WIDTH = 7;
    const rawWidth = ctx.measureText(this.text).width;
    const width = Math.max(rawWidth, MIN_WIDTH); // Defines a min width to the bubble
    const height = parseInt(font, 10);

    const padding = { x: 10, y: 4 }; // Internal padding of the text/speech bubble

    const marginBottom = 2;

    const newX = Math.min(x, x - width / 2 + padding.x / 3);
    const newY = y - (padding.y - marginBottom);

    /// draw background rect assuming height of font
    const path = new Path2D();
    path.roundRect(newX, newY, width + padding.x, height + padding.y, [2]);
    ctx.lineWidth = 1;
    ctx.fill(path);
    ctx.stroke(path);
    // ctx.strokeRect(newX, newY, width + padding.x, height + padding.y);

    /// text color
    ctx.fillStyle = "#000";

    /// draw text on top
    ctx.fillText(
      this.text,
      newX + (rawWidth < MIN_WIDTH ? MIN_WIDTH : padding.x / 2),
      newY + padding.y / 1.5
    );
  }
}
