import { Vector2 } from "./Vector2";

export const isSpaceFree = (walls, x, y) => {
  const posOffset = new Vector2(x + 14, y + 10);

  let isWallPresent = false;

  walls.forEach((wall) => {
    if (
      wall.x <= posOffset.x &&
      posOffset.x <= wall.x + 16 + 8 && // largura do sprite do bloco (16) + metade da largura do sprite do hero (8)
      wall.y <= posOffset.y &&
      posOffset.y <= wall.y + 16
    ) {
      isWallPresent = true;
      return !isWallPresent;
    }
  });

  return !isWallPresent;
};

export const retangularCollision = (rect1, rect2) => {
  return (
    rect1.position.x < rect2.position.x + rect2.width &&
    rect1.position.x + rect1.width > rect2.position.x &&
    rect1.position.y < rect2.position.y + rect2.height &&
    rect1.position.y + rect1.height > rect2.position.y
  );
};
