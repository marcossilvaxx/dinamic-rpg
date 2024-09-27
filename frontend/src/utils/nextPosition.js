import { DOWN, LEFT, RIGHT, UP } from "../Input";

export const nextPosition = (initialX, initialY, direction) => {
  let x = initialX;
  let y = initialY;

  if (direction === LEFT) {
    x--;
  } else if (direction === RIGHT) {
    x++;
  } else if (direction === UP) {
    y--;
  } else if (direction === DOWN) {
    y++;
  }

  return { x, y };
};
