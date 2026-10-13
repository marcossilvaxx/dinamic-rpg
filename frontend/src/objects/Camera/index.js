import { SCALE } from "../../config/constants";
import { events } from "../../Events";
import { GameObject } from "../../GameObject";
import { Vector2 } from "../../utils/Vector2";

export class Camera extends GameObject {
  constructor({ mapWidth, mapHeight }) {
    super({});

    this.mapWidth = mapWidth;
    this.mapHeight = mapHeight;
    // Area the camera shows (the village, or the interior the player is in)
    this.bounds = { x: 0, y: 0, width: mapWidth, height: mapHeight };
  }

  setBounds(bounds) {
    this.bounds = bounds;
  }

  // Keeps the view inside the bounds (centered when they are smaller)
  clamp(position, start, size, viewSize) {
    const max = -start * SCALE;
    const min = -(start + size) * SCALE + viewSize;

    return min > max ? (min + max) / 2 : Math.min(max, Math.max(position, min));
  }

  ready() {
    events.on("PLAYER_POSITION", this, (heroData) => {
      const { position: heroPosition } = heroData;

      const canvas = document.querySelector("#game-canvas");

      const personWidthHalf = (heroData.width / 2) * SCALE;
      const personHeightHalf = heroData.height * SCALE;
      const canvasWidth = canvas.width; //840;
      const canvasHeight = canvas.height; //480;
      const halfWidth = -personWidthHalf + canvasWidth / 2;
      const halfHeight = -personHeightHalf + canvasHeight / 2;

      const newPosition = new Vector2(
        -heroPosition.x * SCALE + halfWidth,
        -heroPosition.y * SCALE + halfHeight
      );

      const { x, y, width, height } = this.bounds;

      this.position = new Vector2(
        this.clamp(newPosition.x, x, width, canvasWidth),
        this.clamp(newPosition.y, y, height, canvasHeight)
      );
    });
  }
}
