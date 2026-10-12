// Things the NPCs sell to the player. Prices depend on the reputation of the
// player with the seller.

import { itemKey } from "./PlayerState.js";

export const MAX_WARES = 3;
export const MAX_WARE_PRICE = 50;

/** Price of one unit for a player with `reputation` (-10..10). */
export function priceFor(basePrice, reputation) {
  const factor =
    reputation >= 6
      ? 0.7
      : reputation >= 3
        ? 0.85
        : reputation <= -6
          ? 1.5
          : reputation <= -3
            ? 1.25
            : 1;

  return Math.max(1, Math.round(basePrice * factor));
}

/** Keeps only valid wares ({ item, price }), without repeated items. */
export function sanitizeWares(wares = []) {
  const seen = new Set();

  return wares
    .map(({ item, price }) => ({
      item: String(item ?? "").trim(),
      price: Math.min(Math.max(Math.round(price) || 1, 1), MAX_WARE_PRICE),
    }))
    .filter(({ item }) => {
      const key = itemKey(item);
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, MAX_WARES);
}

export const findWare = (wares = [], item = "") =>
  wares.find((ware) => itemKey(ware.item) === itemKey(item)) ?? null;
