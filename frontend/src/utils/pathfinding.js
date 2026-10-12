// Single pathfinding worker shared by every NPC. Requests are identified by id
// and resolved as promises.
class Pathfinder {
  constructor() {
    this.worker = null;
    this.nextId = 0;
    this.pending = new Map();
  }

  init(collisionGrid) {
    this.worker = new Worker(
      new URL("./pathfindingWorker.js", import.meta.url),
      { type: "module" },
    );

    this.worker.onmessage = ({ data }) => {
      this.pending.get(data.id)?.(data.path);
      this.pending.delete(data.id);
    };

    this.worker.postMessage({ type: "init", grid: collisionGrid.toJSON() });
  }

  /**
   * @returns {Promise<{x: number, y: number}[] | null>}
   */
  find(start, end, width, height) {
    const id = ++this.nextId;

    return new Promise((resolve) => {
      this.pending.set(id, resolve);
      this.worker.postMessage({
        id,
        start: { x: start.x, y: start.y },
        end: { x: end.x, y: end.y },
        width,
        height,
      });
    });
  }
}

export const pathfinder = new Pathfinder();
