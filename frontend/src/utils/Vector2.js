export class Vector2 {
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
