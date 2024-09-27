/* eslint-disable no-unused-vars */
class Vector2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }

  duplicate() {
    return new Vector2(this.x, this.y);
  }

  add(other) {
    return new Vector2(this.x + other.x, this.y + other.y);
  }

  equals(other) {
    return this.x === other.x && this.y === other.y;
  }

  toString() {
    return `${this.x},${this.y}`;
  }
}

const retangularCollision = (rect1, rect2) => {
  return (
    rect1.position.x < rect2.position.x + rect2.width &&
    rect1.position.x + rect1.width > rect2.position.x &&
    rect1.position.y < rect2.position.y + rect2.height &&
    rect1.position.y + rect1.height > rect2.position.y
  );
};

const manhattanDistance = (p1, p2) =>
  Math.abs(p1.x - p2.x) + Math.abs(p1.y - p2.y);

const manhattanNeighbours = [
  new Vector2(0, 1),
  new Vector2(0, -1),
  new Vector2(1, 0),
  new Vector2(-1, 0),
];

/**
 *
 * @param start Starting location
 * @param target Target location
 * @param boundaries Set of boundaries, (string vec2 objects)
 * @returns The shortest manhattan path, null if it does not exist
 */
function findShortestPath(
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
