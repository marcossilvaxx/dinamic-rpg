import { GameObject } from "../../GameObject";
import { Sprite } from "../../Sprite";
import { Vector2 } from "../../utils/Vector2";
import { CollisionBlock } from "../CollisionBlock";

export class Map extends GameObject {
  constructor({
    resource,
    foregroundResource,
    width,
    height,
    collisionGrid,
    tileSize,
  }) {
    super({});

    this.resource = resource;
    this.foregroundResource = foregroundResource;
    this.width = width;
    this.height = height;
    this.collisionGrid = collisionGrid;
    this.tileSize = tileSize;
    this.collisionBlocks = [];

    this.foregroundSprite = new Sprite({
      resource: this.foregroundResource,
      frameSize: new Vector2(this.width, this.height),
    });

    const sprite = new Sprite({
      resource,
      frameSize: new Vector2(this.width, this.height),
    });

    this.addChild(sprite);

    if (this.collisionGrid) {
      this.generateCollisionBlocks();
    }
  }

  get foreground() {
    return this.foregroundSprite;
  }

  generateCollisionBlocks() {
    this.collisionGrid.forEach((row, y) => {
      row.forEach((symbol, x) => {
        if (symbol !== 0) {
          const block = new CollisionBlock({
            position: new Vector2(x * this.tileSize, y * this.tileSize),
            width: this.tileSize,
            height: this.tileSize,
          });
          this.addChild(block);
          this.collisionBlocks.push(block);
        }
      });
    });
  }
}
