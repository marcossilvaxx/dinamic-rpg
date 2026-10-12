import { CollisionGrid } from "./collisionGrid.js";
import { findShortestPath } from "./findShortestPath.js";

let grid = null;

self.onmessage = ({ data }) => {
  if (data.type === "init") {
    grid = CollisionGrid.fromJSON(data.grid);
    return;
  }

  const { id, start, end, width, height } = data;

  const path = grid
    ? findShortestPath(start, end, (x, y) =>
        grid.isBlocked(x, y, width, height),
      )
    : null;

  self.postMessage({ id, path });
};
