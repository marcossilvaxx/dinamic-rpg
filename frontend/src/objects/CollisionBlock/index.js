import { GameObject } from "../../GameObject";

export class CollisionBlock extends GameObject {
  constructor({ position, width, height }) {
    super({});
    this.position = position;
    this.width = width;
    this.height = height;
  }

  getVertices() {
    return [
      { x: this.position.x, y: this.position.y },
      { x: this.position.x + this.width, y: this.position.y },
      { x: this.position.x + this.width, y: this.position.y + this.height },
      { x: this.position.x, y: this.position.y + this.height },
    ];
  }

  drawImage(ctx) {
    if (this.debugMode) {
      ctx.fillStyle = "rgba(255, 0, 0, 0.5)";
      ctx.fillRect(this.position.x, this.position.y, this.width, this.height);
    }
  }

  step(_delta, root) {
    this.debugMode = root.debugMode;
  }
}
