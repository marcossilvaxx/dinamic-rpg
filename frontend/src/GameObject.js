/* eslint-disable no-unused-vars */
import { events } from "./Events";
import { sortByDepth } from "./utils/grid";
import { Vector2 } from "./utils/Vector2";

export class GameObject {
  constructor({ position, width, height }) {
    this.position = position ?? new Vector2(0, 0);
    this.width = width ?? 0;
    this.height = height ?? 0;
    this.children = [];
    this.parent = null;
    this.debugMode = false;
    this.hasReadyBeenCalled = false;
  }

  stepEntry(delta, root) {
    this.children.forEach((child) => child.stepEntry(delta, root));

    if (!this.hasReadyBeenCalled) {
      this.hasReadyBeenCalled = true;
      this.ready(root);
    }

    this.step(delta, root);
  }

  ready(root) {}

  step(_delta, root) {}

  draw(ctx, x, y) {
    const drawPosX = x + this.position.x;
    const drawPosY = y + this.position.y;

    this.drawImage(ctx, drawPosX, drawPosY);

    sortByDepth(this.children);

    this.children.forEach((child) => child.draw(ctx, drawPosX, drawPosY));
  }

  drawImage(ctx, drawPosX, drawPosY) {}

  destroy() {
    this.children.forEach((child) => child.destroy());

    this.parent.removeChild(this);
  }

  addChild(gameObject) {
    gameObject.parent = this;
    this.children.push(gameObject);
  }

  removeChild(gameObject) {
    events.unsubscribe(gameObject);
    this.children = this.children.filter((g) => gameObject !== g);
  }
}
