import Animations from "../../Animations";
import { DOWN, LEFT, RIGHT, UP } from "../../Input";
import { resources } from "../../Resource";
import { Sprite } from "../../Sprite";
import { FrameIndexPattern } from "../../utils/FrameIndexPattern";
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
} from "../Hero/animations";

// Adds the shadow and the animated body shared by every character (hero and
// NPCs) to `character` and returns the body sprite.
export function addCharacterSprites(character, resource) {
  const shadowOffset = new Vector2(-8, -20);
  const shadow = new Sprite({
    resource: resources.images.shadow,
    frameSize: new Vector2(32, 32),
    position: shadowOffset,
  });

  character.addChild(shadow);

  const body = new Sprite({
    resource,
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

  character.addChild(body);
  addCombatPoses(body);

  return body;
}

/**
 * Lets the body be drawn hurt (`body.hurt`: red flash), hidden (`hidden`:
 * blinking while invulnerable) or lying on the ground (`lying`: knocked out),
 * without animations for them in the sprite sheets.
 */
function addCombatPoses(body) {
  const draw = body.drawImage.bind(body);

  body.drawImage = (ctx, x, y) => {
    if (body.hidden) {
      return;
    }

    if (!body.hurt && !body.lying) {
      draw(ctx, x, y);
      return;
    }

    ctx.save();

    if (body.hurt) {
      ctx.filter = "sepia(1) saturate(8) hue-rotate(-50deg) brightness(1.1)";
    }

    if (body.lying) {
      // Rotated around the feet, lying to the side
      const width = body.frameSize.x * body.scale;
      const height = body.frameSize.y * body.scale;
      ctx.translate(x + width / 2, y + height);
      ctx.rotate(Math.PI / 2);
      draw(ctx, -width / 2, -height);
    } else {
      draw(ctx, x, y);
    }

    ctx.restore();
  };
}

const STAND = {
  [DOWN]: "standDown",
  [UP]: "standUp",
  [LEFT]: "standLeft",
  [RIGHT]: "standRight",
};

const WALK = {
  [DOWN]: "walkDown",
  [UP]: "walkUp",
  [LEFT]: "walkLeft",
  [RIGHT]: "walkRight",
};

// Plays the stand/walk animation of a character body facing `direction`.
export function playMovementAnimation(body, direction, isMoving) {
  const animation = (isMoving ? WALK : STAND)[direction];

  if (animation) {
    body.animations.play(animation);
  }
}
