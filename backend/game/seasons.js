// Seasons of the year. Each one lasts a few game days and changes the
// weather (snow in winter, little rain in summer), the prices of food, what
// the player finds when fishing or gathering and the gatherings of the
// village.

import { itemKey } from "./PlayerState.js";

export const SEASONS = ["spring", "summer", "autumn", "winter"];

export const SEASON_INFO = {
  spring: {
    label: "Primavera",
    prompt: "spring: flowers, planting and newborn animals",
    festival: "a spring planting festival with flowers",
  },
  summer: {
    label: "Verão",
    prompt: "summer: long hot days, little rain, good fishing",
    festival: "a midsummer bonfire night",
  },
  autumn: {
    label: "Outono",
    prompt: "autumn: harvest time, falling leaves, mushrooms in the fields",
    festival: "a harvest festival",
  },
  winter: {
    label: "Inverno",
    prompt:
      "winter: cold, snow, short days; food is scarce and people stay indoors",
    festival: "a winter night of lanterns and warm soup",
  },
};

/** Season of a game day (1-based), with `daysPerSeason` days each. */
export function seasonOf(day, daysPerSeason = 2) {
  const index = Math.floor((day - 1) / daysPerSeason) % SEASONS.length;
  return SEASONS[index];
}

/** Whether `day` is the first day of its season. */
export const isFirstDayOfSeason = (day, daysPerSeason = 2) =>
  (day - 1) % daysPerSeason === 0;

// Words that make an item "food" (its price changes with the season)
const FOOD_WORDS = [
  "pao",
  "paes",
  "peixe",
  "carne",
  "grao",
  "graos",
  "farinha",
  "trigo",
  "cevada",
  "fruta",
  "maca",
  "queijo",
  "leite",
  "ovo",
  "mel",
  "sopa",
  "batata",
  "abobora",
  "milho",
  "repolho",
  "cenoura",
  "cogumelo",
  "legume",
  "verdura",
  "semente",
  "bread",
  "fish",
  "meat",
  "grain",
  "flour",
  "cheese",
  "egg",
  "honey",
];

export const isFood = (item) => {
  const words = itemKey(item).split(/\s+/);
  return words.some(
    (word) =>
      FOOD_WORDS.includes(word) || FOOD_WORDS.includes(word.replace(/s$/, "")),
  );
};

/** Factor applied to the price of `item` in `season`. */
export function seasonalPriceFactor(item, season) {
  if (!isFood(item)) return 1;
  if (season === "winter") return 1.3;
  if (season === "autumn") return 0.85;
  return 1;
}
