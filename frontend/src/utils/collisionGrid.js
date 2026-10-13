// Tile based collision lookup. Instead of testing a hitbox against every
// collision block of the map, only the tiles covered by the hitbox are checked.
//
// No imports on purpose: this module is shared with the pathfinding worker
// and the node tests.
export class CollisionGrid {
  /**
   * @param {number[][]} rows Rows of tiles, any value different from 0 blocks.
   * @param {number} tileSize Tile size in pixels.
   */
  constructor(rows, tileSize) {
    this.rows = rows.map((row) => row.map((tile) => (tile !== 0 ? 1 : 0)));
    this.tileSize = tileSize;
    this.columns = this.rows[0]?.length ?? 0;
    this.width = this.columns * tileSize;
    this.height = this.rows.length * tileSize;
  }

  static fromJSON({ rows, tileSize }) {
    return new CollisionGrid(rows, tileSize);
  }

  toJSON() {
    return { rows: this.rows, tileSize: this.tileSize };
  }

  /** Marks tiles as blocked (props added over the map). */
  block(tiles) {
    for (const [column, row] of tiles) {
      if (this.rows[row]?.[column] !== undefined) this.rows[row][column] = 1;
    }
  }

  /**
   * Whether a `width` x `height` hitbox at (x, y) overlaps a blocked tile or
   * leaves the map.
   */
  isBlocked(x, y, width, height) {
    if (x < 0 || y < 0 || x + width > this.width || y + height > this.height) {
      return true;
    }

    const startColumn = Math.floor(x / this.tileSize);
    const endColumn = Math.ceil((x + width) / this.tileSize) - 1;
    const startRow = Math.floor(y / this.tileSize);
    const endRow = Math.ceil((y + height) / this.tileSize) - 1;

    for (let row = startRow; row <= endRow; row++) {
      for (let column = startColumn; column <= endColumn; column++) {
        if (this.rows[row][column]) {
          return true;
        }
      }
    }

    return false;
  }
}
