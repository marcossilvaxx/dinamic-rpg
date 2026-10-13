// Draws a map exported from Tiled (src/levels/maps.js) tile by tile into two
// canvases: the background (under the characters) and the foreground (over
// them). They work as the image resources of the Map object, and tiles can
// be changed while the game runs (`setTile`).

const FLIPPED_HORIZONTALLY = 0x80000000;
const FLIPPED_VERTICALLY = 0x40000000;
const FLIPPED_DIAGONALLY = 0x20000000;
const GID_MASK = 0x1fffffff;

// Tileset images, shared by the maps that use them
const images = new Map();

const loadImage = (src) => {
  if (!images.has(src)) {
    const image = new Image();
    image.src = src;
    images.set(
      src,
      new Promise((resolve, reject) => {
        image.onload = () => resolve(image);
        image.onerror = reject;
      }),
    );
  }
  return images.get(src);
};

export class TileMap {
  /** @param {object} map One of MAPS (src/levels/maps.js). */
  constructor(map) {
    this.map = map;
    this.width = map.width * map.tileWidth;
    this.height = map.height * map.tileHeight;
    this.layers = map.layers.map((layer) => ({
      ...layer,
      data: [...layer.data],
    }));
    this.tilesets = [];
    // Image resources for the Map object ({ image, isLoaded })
    this.background = { image: this.createCanvas(), isLoaded: false };
    this.foreground = { image: this.createCanvas(), isLoaded: false };

    this.ready = Promise.all(
      map.tilesets.map(async (tileset) => ({
        ...tileset,
        image: await loadImage(tileset.image),
      })),
    ).then((tilesets) => {
      this.tilesets = tilesets;
      this.render();
      this.background.isLoaded = true;
      this.foreground.isLoaded = true;
    });
  }

  createCanvas() {
    const canvas = document.createElement("canvas");
    canvas.width = this.width;
    canvas.height = this.height;
    return canvas;
  }

  render() {
    for (const target of [this.background, this.foreground]) {
      target.image.getContext("2d").clearRect(0, 0, this.width, this.height);
    }

    for (let i = 0; i < this.map.width * this.map.height; i++) {
      this.renderCell(i % this.map.width, Math.floor(i / this.map.width));
    }
  }

  /** Redraws one cell (all its layers). */
  renderCell(column, row) {
    const { tileWidth, tileHeight, width } = this.map;
    const x = column * tileWidth;
    const y = row * tileHeight;
    const index = row * width + column;

    for (const target of [this.background, this.foreground]) {
      target.image.getContext("2d").clearRect(x, y, tileWidth, tileHeight);
    }

    for (const layer of this.layers) {
      const gid = layer.data[index];
      if (!gid) continue;
      const target = layer.foreground ? this.foreground : this.background;
      this.drawTile(target.image.getContext("2d"), gid, x, y);
    }
  }

  drawTile(ctx, rawGid, x, y) {
    const gid = rawGid & GID_MASK;
    const tileset = this.tilesets.findLast((t) => t.firstgid <= gid);

    if (!tileset || gid >= tileset.firstgid + tileset.count) return;

    const tile = gid - tileset.firstgid;
    const { tileWidth: w, tileHeight: h, columns } = tileset;
    const sx = (tile % columns) * w;
    const sy = Math.floor(tile / columns) * h;
    // Tiles taller than the grid (like Tiled) grow upwards
    const dy = y + this.map.tileHeight - h;

    const flipX = (rawGid & FLIPPED_HORIZONTALLY) !== 0;
    const flipY = (rawGid & FLIPPED_VERTICALLY) !== 0;
    const flipD = (rawGid & FLIPPED_DIAGONALLY) !== 0;

    if (!flipX && !flipY && !flipD) {
      ctx.drawImage(tileset.image, sx, sy, w, h, x, dy, w, h);
      return;
    }

    ctx.save();
    ctx.translate(x + w / 2, dy + h / 2);
    if (flipD) {
      ctx.rotate(Math.PI / 2);
      ctx.scale(1, -1);
    }
    ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    ctx.drawImage(tileset.image, sx, sy, w, h, -w / 2, -h / 2, w, h);
    ctx.restore();
  }

  /** Changes a tile of a layer (gid 0 erases it). */
  setTile(layerName, column, row, gid) {
    const layer = this.layers.find((candidate) => candidate.name === layerName);
    if (!layer) throw new Error(`Unknown layer: ${layerName}`);

    layer.data[row * this.map.width + column] = gid;
    if (this.tilesets.length) this.renderCell(column, row);
  }
}
