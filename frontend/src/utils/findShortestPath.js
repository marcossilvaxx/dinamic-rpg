// A* pathfinding on a pixel grid (4 directions, 1px per step).
//
// No imports on purpose: this module runs inside the pathfinding worker and
// in the node tests.

class MinHeap {
  constructor() {
    this.items = [];
  }

  get size() {
    return this.items.length;
  }

  push(item) {
    const items = this.items;
    items.push(item);
    let i = items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (items[parent].f <= items[i].f) break;
      [items[parent], items[i]] = [items[i], items[parent]];
      i = parent;
    }
  }

  pop() {
    const items = this.items;
    const top = items[0];
    const last = items.pop();
    if (items.length > 0) {
      items[0] = last;
      let i = 0;
      for (;;) {
        const left = 2 * i + 1;
        const right = left + 1;
        let smallest = i;
        if (left < items.length && items[left].f < items[smallest].f) {
          smallest = left;
        }
        if (right < items.length && items[right].f < items[smallest].f) {
          smallest = right;
        }
        if (smallest === i) break;
        [items[smallest], items[i]] = [items[i], items[smallest]];
        i = smallest;
      }
    }
    return top;
  }
}

const DIRECTIONS = [
  [0, 1],
  [0, -1],
  [1, 0],
  [-1, 0],
];

// Coordinates are integers inside the map, so a number key is enough.
const key = (x, y) => y * 65536 + x;

/**
 * @param {{x: number, y: number}} start
 * @param {{x: number, y: number}} target
 * @param {(x: number, y: number) => boolean} isBlocked Whether the follower
 *   hitbox fits at the given position.
 * @param {number} [maxNodes] Search budget; gives up (returns null) after
 *   expanding this many nodes so unreachable targets don't hang the worker.
 * @returns {{x: number, y: number}[] | null} Path including start and target.
 */
export function findShortestPath(start, target, isBlocked, maxNodes = 200000) {
  const startX = Math.round(start.x);
  const startY = Math.round(start.y);
  const targetX = Math.round(target.x);
  const targetY = Math.round(target.y);

  if (isBlocked(targetX, targetY)) {
    return null;
  }

  const heuristic = (x, y) => Math.abs(x - targetX) + Math.abs(y - targetY);

  const cost = new Map([[key(startX, startY), 0]]);
  const parent = new Map();
  const open = new MinHeap();
  open.push({ x: startX, y: startY, g: 0, f: heuristic(startX, startY) });

  let expanded = 0;

  while (open.size > 0) {
    const current = open.pop();
    const currentKey = key(current.x, current.y);

    // Skip stale heap entries
    if (current.g > cost.get(currentKey)) continue;

    if (current.x === targetX && current.y === targetY) {
      const path = [{ x: current.x, y: current.y }];
      let node = parent.get(currentKey);
      while (node) {
        path.push(node);
        node = parent.get(key(node.x, node.y));
      }
      return path.reverse();
    }

    if (++expanded > maxNodes) {
      return null;
    }

    for (const [dx, dy] of DIRECTIONS) {
      const x = current.x + dx;
      const y = current.y + dy;
      const neighborKey = key(x, y);
      const g = current.g + 1;

      if (cost.has(neighborKey) && cost.get(neighborKey) <= g) continue;
      if (isBlocked(x, y)) continue;

      cost.set(neighborKey, g);
      parent.set(neighborKey, { x: current.x, y: current.y });
      open.push({ x, y, g, f: g + heuristic(x, y) });
    }
  }

  return null;
}
