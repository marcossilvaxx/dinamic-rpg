import Animations from "../../Animations";
import { events } from "../../Events";
import { GameObject } from "../../GameObject";
import { DOWN, LEFT, RIGHT, UP } from "../../Input";
import { resources } from "../../Resource";
import { Sprite } from "../../Sprite";
import { retangularCollision } from "../../utils/collision";
import { FrameIndexPattern } from "../../utils/FrameIndexPattern";
import { nextPosition } from "../../utils/nextPosition";
import { Vector2 } from "../../utils/Vector2";
import {
  STAND_DOWN,
  STAND_LEFT,
  STAND_RIGHT,
  STAND_UP,
  WALK_DOWN,
  WALK_LEFT,
  WALK_RIGHT,
  WALK_UP,
} from "./animations";

export class Hero extends GameObject {
  constructor(x, y, width, height) {
    super({
      position: new Vector2(x, y),
      width,
      height,
    });

    const shadowOffset = new Vector2(-8, -20);
    const shadow = new Sprite({
      resource: resources.images.shadow,
      frameSize: new Vector2(32, 32),
      position: shadowOffset,
    });

    this.addChild(shadow);

    this.body = new Sprite({
      resource: resources.images.warriorM,
      frameSize: new Vector2(32, 36),
      hFrames: 3,
      vFrames: 4,
      frame: 1,
      scale: 0.5,
      position: new Vector2(0, -8),
      animations: new Animations({
        walkDown: new FrameIndexPattern(WALK_DOWN),
        walkUp: new FrameIndexPattern(WALK_UP),
        walkLeft: new FrameIndexPattern(WALK_LEFT),
        walkRight: new FrameIndexPattern(WALK_RIGHT),
        standDown: new FrameIndexPattern(STAND_DOWN),
        standUp: new FrameIndexPattern(STAND_UP),
        standLeft: new FrameIndexPattern(STAND_LEFT),
        standRight: new FrameIndexPattern(STAND_RIGHT),
      }),
    });

    this.addChild(this.body);

    this.destinationPosition = this.position.duplicate();
    this.facingDirection = DOWN;
  }

  ready() {
    events.emit("PLAYER_POSITION", {
      position: this.destinationPosition.duplicate(),
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
    const { input, collisionBlocks } = root;

    if (!input.direction) {
      if (this.facingDirection === LEFT) {
        this.body.animations.play("standLeft");
      }
      if (this.facingDirection === RIGHT) {
        this.body.animations.play("standRight");
      }
      if (this.facingDirection === UP) {
        this.body.animations.play("standUp");
      }
      if (this.facingDirection === DOWN) {
        this.body.animations.play("standDown");
      }

      return;
    }

    this.facingDirection = input.direction ?? this.facingDirection;

    const { x: nextX, y: nextY } = nextPosition(
      this.position.x,
      this.position.y,
      input.direction
    );

    if (
      collisionBlocks.some((block) =>
        retangularCollision(block, {
          position: new Vector2(nextX, nextY),
          width: this.width,
          height: this.height,
        })
      )
    ) {
      return;
    }

    events.emit("PLAYER_POSITION", {
      position: this.position.duplicate(),
      width: this.width,
      height: this.height,
      facingDirection: this.facingDirection,
      input,
    });

    if (input.direction === DOWN) {
      this.position.y += 1;
      this.body.animations.play("walkDown");
    }

    if (input.direction === UP) {
      this.position.y -= 1;
      this.body.animations.play("walkUp");
    }

    if (input.direction === LEFT) {
      this.position.x -= 1;
      this.body.animations.play("walkLeft");
    }

    if (input.direction === RIGHT) {
      this.position.x += 1;
      this.body.animations.play("walkRight");
    }
  }

  debug(ctx) {
    ctx.strokeStyle = "blue";
    ctx.lineWidth = 1;
    ctx.strokeRect(this.position.x, this.position.y, this.width, this.height);
  }
}
