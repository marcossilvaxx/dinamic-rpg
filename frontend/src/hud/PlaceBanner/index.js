import { PLACE_RADIUS, nearestPlace } from "../../levels/places";

const VISIBLE_MS = 2500;

/**
 * Name of the place the player just walked into, shown for a moment at the
 * top of the screen (like the area titles of classic RPGs).
 */
class PlaceBanner {
  constructor(root = "game-container") {
    this.root = root;
    this.element = null;
    this.placeId = undefined;
    this.timeout = null;
  }

  /** @param {{x: number, y: number}} position Of the player. */
  update(position) {
    const place = nearestPlace(position, PLACE_RADIUS + 10);

    if ((place?.id ?? null) === this.placeId) {
      return;
    }

    // Nothing is shown when the game starts, only when the player moves
    const isFirstUpdate = this.placeId === undefined;
    this.placeId = place?.id ?? null;

    if (place && !isFirstUpdate) {
      this.show(place.name);
    }
  }

  show(text) {
    if (!this.element) {
      this.element = document.createElement("div");
      this.element.className = "place-banner";
      document.getElementById(this.root).appendChild(this.element);
    }

    clearTimeout(this.timeout);
    this.element.textContent = text;
    this.element.classList.add("visible");
    this.timeout = setTimeout(
      () => this.element.classList.remove("visible"),
      VISIBLE_MS,
    );
  }
}

export const placeBanner = new PlaceBanner("game-container");
