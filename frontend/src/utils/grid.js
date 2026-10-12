import { DOWN, LEFT, RIGHT, UP } from "../Input";
import { Vector2 } from "./Vector2";

export const gridCells = (n) => {
  return n * 12;
};

export const parse2D = (collisionArray, mapWidth) => {
  const rows = [];

  for (let i = 0; i < collisionArray.length; i += mapWidth) {
    rows.push(collisionArray.slice(i, i + mapWidth));
  }

  return rows;
};

export const sortByDepth = (objects) => {
  objects.sort((a, b) => a.position.y - b.position.y);
};

export function getBackPosition(
  currentFacingDirection,
  position,
  width,
  height,
) {
  return {
    DOWN: new Vector2(position.x, position.y - height),
    UP: new Vector2(position.x, position.y + height),
    LEFT: new Vector2(position.x + width, position.y),
    RIGHT: new Vector2(position.x - width, position.y),
  }[currentFacingDirection];
}

/**
 * Positions around a target, starting from behind it, that a follower can
 * walk to.
 */
export function getPositionsAround(target) {
  const opposite = { DOWN: UP, UP: DOWN, LEFT: RIGHT, RIGHT: LEFT };
  const directions = [
    target.facingDirection,
    LEFT,
    RIGHT,
    opposite[target.facingDirection],
  ];

  return [...new Set(directions)].map((direction) =>
    getBackPosition(direction, target.position, target.width, target.height),
  );
}

export function nextDirection(x, y, newX, newY) {
  if (newX > x) {
    return RIGHT;
  }
  if (newX < x) {
    return LEFT;
  }
  if (newY > y) {
    return DOWN;
  }
  if (newY < y) {
    return UP;
  }
  return false;
}

// Direction an object at `from` must face to look at `to` (dominant axis).
export function directionTowards(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;

  if (Math.abs(dx) > Math.abs(dy)) {
    return dx > 0 ? RIGHT : LEFT;
  }

  return dy > 0 ? DOWN : UP;
}
