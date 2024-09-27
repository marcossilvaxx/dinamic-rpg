import { SCALE } from "../../config/constants";
import { events } from "../../Events";
import { GameObject } from "../../GameObject";
import { Vector2 } from "../../utils/Vector2";

export class Camera extends GameObject {
  constructor({ mapWidth, mapHeight }) {
    super({});

    this.mapWidth = mapWidth;
    this.mapHeight = mapHeight;
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

      this.position = new Vector2(
        Math.min(0, Math.max(newPosition.x, canvasWidth * -(SCALE - 1))),
        Math.min(0, Math.max(newPosition.y, canvasHeight * -(SCALE - 1)))
      );
    });
  }
}
