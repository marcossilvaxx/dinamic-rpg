import { sound } from "../../audio/sound";
import { events } from "../../Events";
import { GameObject } from "../../GameObject";
import { DOWN } from "../../Input";
import { resources } from "../../Resource";
import { nextPosition } from "../../utils/nextPosition";
import { Vector2 } from "../../utils/Vector2";
import { addCharacterSprites, playMovementAnimation } from "../Character";

export class Hero extends GameObject {
  constructor(x, y, width, height) {
    super({
      position: new Vector2(x, y),
      width,
      height,
    });

    this.body = addCharacterSprites(this, resources.images.warriorM);
    this.facingDirection = DOWN;
  }

  ready() {
    this.emitPosition();
  }

  emitPosition() {
    events.emit("PLAYER_POSITION", {
      position: this.position.duplicate(),
      width: this.width,
      height: this.height,
      facingDirection: this.facingDirection,
    });
  }

  drawImage(ctx) {
    if (this.debugMode) {
      this.debug(ctx);
    }
  }

  step(delta, root) {
    this.debugMode = root.debugMode;
    this.tryMove(root);
  }

  tryMove(root) {
    const { input, collision } = root;

    if (!input.direction) {
      playMovementAnimation(this.body, this.facingDirection, false);
      return;
    }

    this.facingDirection = input.direction;
    playMovementAnimation(this.body, this.facingDirection, true);

    const { x: nextX, y: nextY } = nextPosition(
      this.position.x,
      this.position.y,
      input.direction,
    );

    if (collision.isBlocked(nextX, nextY, this.width, this.height)) {
      return;
    }

    this.position.x = nextX;
    this.position.y = nextY;
    sound.footstep();

    this.emitPosition();
  }

  debug(ctx) {
    ctx.strokeStyle = "blue";
    ctx.lineWidth = 1;
    ctx.strokeRect(this.position.x, this.position.y, this.width, this.height);
  }
}
