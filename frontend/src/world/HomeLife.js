// The inside of the buildings shows the life of who lives or works there
// (see backend GameSession.homesJSON): the room gets messy when they are
// sad, the gifts of the player are kept on a shelf and, at work, the orders
// of the day pile up.

import { GameObject } from "../GameObject";
import { INTERIORS_BY_PLACE } from "../levels/world";
import { playerState } from "../state/playerState";
import { Vector2 } from "../utils/Vector2";
import { seeded, seedOf } from "./procedural/pixel";
import * as sprites from "./sprites";

const FEET = 11;
const MAX_MESS = 7;
const MAX_PARCELS = 6;

class HomeProp extends GameObject {
  constructor(x, y, draw) {
    super({ position: new Vector2(x, y - FEET) });
    this.anchor = { x, y };
    this.drawProp = draw;
  }

  drawImage(ctx) {
    this.drawProp(ctx, this.anchor.x, this.anchor.y);
  }
}

/** Free cells of the floor of a room, away from the door (pixels). */
export function floorCells(interior) {
  const { map } = interior;
  const entrance = map.points.entrance ?? { x: -100, y: -100 };
  const cells = [];
  for (let r = 2; r < map.height; r++) {
    for (let c = 0; c < map.width; c++) {
      if (map.collisions[r * map.width + c]) continue;
      const x = c * map.tileWidth + map.tileWidth / 2;
      const y = (r + 1) * map.tileHeight - 2;
      if (Math.hypot(x - entrance.x, y - entrance.y) < 40) continue;
      const nextToWall =
        r === 2 ||
        Boolean(map.collisions[r * map.width + c - 1]) ||
        Boolean(map.collisions[r * map.width + c + 1]);
      cells.push({ x, y, nextToWall });
    }
  }
  return cells;
}

export class HomeLife {
  /** @param {{ scene: import("../GameObject").GameObject }} options */
  constructor({ scene }) {
    this.scene = scene;
    this.drawn = new Map(); // placeId -> { key, props }
  }

  step() {
    for (const home of playerState.state?.homes ?? []) {
      const interior = INTERIORS_BY_PLACE[home.placeId];
      if (!interior) continue;
      const key = JSON.stringify([
        Math.round(home.mess * MAX_MESS),
        home.gifts,
        Math.min(home.orders, MAX_PARCELS),
      ]);
      if (this.drawn.get(home.placeId)?.key === key) continue;
      this.drawn.get(home.placeId)?.props.forEach((prop) => prop.destroy());
      this.drawn.set(home.placeId, { key, props: this.build(interior, home) });
    }
  }

  build(interior, { placeId, mess, gifts, orders }) {
    const props = [];
    const { x: ox, y: oy } = interior.origin;
    const add = (x, y, draw) => {
      const prop = new HomeProp(ox + x, oy + y, draw);
      props.push(prop);
      this.scene.addChild(prop);
    };
    const random = seeded(seedOf(placeId));
    const cells = floorCells(interior).sort(() => random() - 0.5);

    // Mess on the floor
    const messy = Math.round(mess * MAX_MESS);
    cells.slice(0, messy).forEach(({ x, y }, i) => {
      const kind = Math.abs(i + seedOf(placeId)) % 4;
      const dx = random.int(-3, 3);
      add(x + dx, y, (ctx, px, py) => sprites.clutter(ctx, px, py, kind));
    });

    // Gifts of the player on a shelf of the back wall
    if (gifts.length) {
      const width = 10 + gifts.length * 9;
      const left = Math.round(interior.width * 0.22);
      const top = 22;
      add(left, top, (ctx, px, py) => {
        sprites.wallShelf(ctx, px, py, width);
        gifts.forEach((item, i) =>
          sprites.giftIcon(ctx, px + 9 + i * 9, py, item),
        );
      });
    }

    // Orders of the day: parcels by the walls and notes on a board
    const parcels = Math.min(orders, MAX_PARCELS);
    if (parcels) {
      cells
        .filter((cell) => cell.nextToWall)
        .slice(messy % 2, (messy % 2) + parcels)
        .forEach(({ x, y }, i) =>
          add(x, y, (ctx, px, py) => sprites.parcel(ctx, px, py, i)),
        );
      add(Math.round(interior.width * 0.7), 12, (ctx, px, py) =>
        sprites.noteBoard(ctx, px, py, Math.min(orders, 6)),
      );
    }
    return props;
  }
}
