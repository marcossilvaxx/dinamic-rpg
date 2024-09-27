import { DOWN, LEFT, RIGHT, UP } from "../Input";
import { retangularCollision } from "./collision";
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
  height
) {
  return {
    DOWN: new Vector2(position.x, position.y - height),
    UP: new Vector2(position.x, position.y + height),
    LEFT: new Vector2(position.x + width, position.y),
    RIGHT: new Vector2(position.x - width, position.y),
  }[currentFacingDirection];
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

function getNeighbors(node, collisionBlocks, followerWidth, followerHeight) {
  const directions = [
    { x: -1, y: 0 },
    { x: 1, y: 0 },
    { x: 0, y: -1 },
    { x: 0, y: 1 },
  ];

  let neighbors = [];
  for (let direction of directions) {
    let newX = node.x + direction.x;
    let newY = node.y + direction.y;
    if (
      !collisionBlocks.some((block) =>
        retangularCollision(block, {
          position: new Vector2(newX, newY),
          width: followerWidth,
          height: followerHeight,
        })
      )
    ) {
      neighbors.push({ x: newX, y: newY });
    }
  }
  return neighbors;
}

// A* Pathfinding algorithm
export function aStar(
  start,
  goal,
  collisionBlocks,
  followerWidth,
  followerHeight
) {
  if (
    collisionBlocks.some((block) =>
      retangularCollision(block, {
        position: new Vector2(goal.x, goal.y),
        width: followerWidth,
        height: followerHeight,
      })
    )
  ) {
    return null;
  }

  function heuristic(a, b) {
    return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
  }

  let openSet = [];
  let closedSet = [];
  let startNode = { ...start, g: 0, f: heuristic(start, goal), cameFrom: null };
  openSet.push(startNode);

  while (openSet.length > 0) {
    let current = openSet.reduce(
      (prev, node) => (node.f < prev.f ? node : prev),
      openSet[0]
    );
    if (current.x === goal.x && current.y === goal.y) {
      let path = [];
      while (current) {
        path.push(current);
        current = current.cameFrom;
      }
      return path.reverse();
    }

    openSet = openSet.filter((node) => node !== current);
    closedSet.push(current);

    let neighbors = getNeighbors(
      current,
      collisionBlocks,
      followerWidth,
      followerHeight
    );
    for (let neighbor of neighbors) {
      if (
        closedSet.some((node) => node.x === neighbor.x && node.y === neighbor.y)
      )
        continue;

      let tentativeG = current.g + 1;
      let existingNode = openSet.find(
        (node) => node.x === neighbor.x && node.y === neighbor.y
      );

      if (!existingNode || tentativeG < existingNode.g) {
        neighbor.g = tentativeG;
        neighbor.f = neighbor.g + heuristic(neighbor, goal);
        neighbor.cameFrom = current;

        if (!existingNode) openSet.push(neighbor);
      }
    }
  }

  return [];
}

const manhattanDistance = (p1, p2) =>
  Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y);

const manhattanNeighbours = [
  new Vector2(0, 1),
  new Vector2(0, -1),
  new Vector2(1, 0),
  new Vector2(-1, 0),
];

export function findShortestPath(
  start,
  target,
  boundaries,
  followerWidth,
  followerHeight
) {
  const heuristic = manhattanDistance;

  if (
    boundaries.some((block) =>
      retangularCollision(block, {
        position: new Vector2(target.x, target.y),
        width: followerWidth,
        height: followerHeight,
      })
    )
  ) {
    return null;
  }

  start = new Vector2(start.x, start.y);
  target = new Vector2(target.x, target.y);

  // Create a map to keep track of the cost of reaching each point
  const costMap = new Map();
  costMap.set(start.toString(), 0);

  // Create a map to keep track of the parent node for each point
  const parentMap = new Map();
  parentMap.set(start.toString(), start);

  // Create a priority queue to store candidate points
  const queue = [start];

  // Loop until we find the target or the queue is empty
  while (queue.length > 0) {
    // Get the point with the lowest estimated total cost
    const current = queue.shift();

    // If we've reached the target, reconstruct the path and return it
    if (current.equals(target)) {
      const path = [];
      let node = current;
      while (node && !node.equals(start)) {
        path.unshift(node);
        node = parentMap.get(node.toString());
      }
      path.unshift(start);
      return path;
    }

    // Check each adjacent point and add it to the queue if it's not blocked
    for (const direction of manhattanNeighbours) {
      const neighbor = current.add(direction);
      if (
        !boundaries.some((block) =>
          retangularCollision(block, {
            position: new Vector2(neighbor.x, neighbor.y),
            width: followerWidth,
            height: followerHeight,
          })
        ) &&
        (!costMap.has(neighbor.toString()) ||
          costMap.get(current.toString()) + 1 <
            costMap.get(neighbor.toString()))
      ) {
        costMap.set(neighbor.toString(), costMap.get(current.toString()) + 1);
        parentMap.set(neighbor.toString(), current);
        const costEstimate =
          costMap.get(neighbor.toString()) + heuristic(neighbor, target);
        let i = 0;
        while (
          i < queue.length &&
          costEstimate >
            costMap.get(queue[i].toString()) + heuristic(queue[i], target)
        ) {
          i++;
        }
        queue.splice(i, 0, neighbor);
      }
    }
  }

  // If we didn't find a path, return null
  return null;
}
