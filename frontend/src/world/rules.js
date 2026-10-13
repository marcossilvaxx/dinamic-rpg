// Pure rules of the living map (lights, smoke, wind, animals...), tested with
// node. `hour` may have a fraction (14.5 = 14:30). No browser imports.

const isRaining = (weather) => weather === "rain" || weather === "storm";

/** Whether the windows of a building are lit. */
export function windowsLit(placeId, hour) {
  if (placeId === "tavern") return hour >= 17 || hour < 1;
  return (hour >= 17.5 && hour < 23) || (hour >= 5 && hour < 7);
}

/** Whether the street lamps are on (it is dark enough). */
export const lampsLit = (darkness) => darkness > 0.12;

/** The campfire of the garden burns in the evening (not in the rain). */
export const campfireLit = (hour, weather) =>
  hour >= 19 && hour < 23 && !isRaining(weather);

/**
 * Smoke particles per second of a chimney: people cook at meal times, warm
 * the house in the cold and sleep at night.
 */
export function smokeRate(placeId, hour, season) {
  if (hour >= 23 || hour < 5) return placeId === "tavern" ? 0.4 : 0;

  const cooking =
    (hour >= 6 && hour < 8) ||
    (hour >= 11 && hour < 13) ||
    (hour >= 18 && hour < 21);
  const cold = season === "winter" ? 1.5 : season === "autumn" ? 0.6 : 0;
  const base = placeId === "tavern" ? 1.2 : 0.3;

  return base + (cooking ? 1.5 : 0) + cold;
}

/** Speed of the sails of the windmill (radians per ms), by the wind. */
export function windmillSpeed(weather) {
  return (
    {
      clear: 0.0006,
      cloudy: 0.0009,
      rain: 0.0012,
      storm: 0.0026,
      fog: 0.0003,
      snow: 0.0008,
    }[weather] ?? 0.0006
  );
}

/** Horizontal wind (map pixels per ms) for smoke, leaves and snow. */
export const windOf = (weather) =>
  ({ storm: 0.02, rain: 0.008, cloudy: 0.005 })[weather] ?? 0.003;

export const isDaytime = (hour) => hour >= 6 && hour < 19;

export const fireflyTime = (season, hour, weather) =>
  (season === "summer" || season === "spring") &&
  (hour >= 20 || hour < 4) &&
  !isRaining(weather) &&
  weather !== "snow";

export const butterflyTime = (season, hour, weather) =>
  (season === "spring" || season === "summer") &&
  hour >= 8 &&
  hour < 18 &&
  weather !== "rain" &&
  weather !== "storm";

/** Birds land on the ground during the day, when it isn't raining. */
export const birdsLand = (hour, weather) =>
  isDaytime(hour) && !isRaining(weather) && weather !== "snow";

/** Chickens sleep at night and shelter from the rain. */
export const chickensRest = (hour, weather) =>
  hour >= 20 || hour < 6 || isRaining(weather);

/** The decoration of the gathering is up on its day until it ends. */
export const festivalDecorUp = (festival, day) =>
  Boolean(festival) && festival.day === day && festival.status !== "over";

/** The bushes give fruits again some game minutes after gathering. */
export const BUSH_REGROW_MINUTES = 15;

/**
 * What a crop looks like at each stage (0 seeds .. 4 ripe).
 * @returns {{height: number, leaf: string, fruit: string|null}}
 */
export function cropLook(crop, stage) {
  const fruits = { cenoura: "#f08a2c", trigo: "#e8c45a", abóbora: "#e8762c" };
  const ripe = stage >= 4;

  if (crop === "trigo") {
    return {
      height: [1, 2, 4, 6, 8][stage] ?? 1,
      leaf: ripe ? "#e8c45a" : stage >= 3 ? "#a8c45a" : "#5cae4f",
      fruit: ripe ? fruits.trigo : null,
    };
  }

  return {
    height: [1, 2, 3, 4, 4][stage] ?? 1,
    leaf: "#4fa85a",
    fruit: ripe ? (fruits[crop] ?? "#e05a3a") : null,
  };
}

/**
 * Whether the player can go into a building. The tavern closes only late at
 * night and the store opens during the day; a home needs someone awake to
 * open the door, unless the player is a close friend of who lives there.
 *
 * @returns {{open: boolean, reason: "closed"|"nobody"|"sleeping"|null}}
 */
export function buildingAccess(
  placeId,
  hour,
  { awakeInside, asleepInside, friend },
) {
  if (placeId === "tavern") {
    return hour >= 2 && hour < 6
      ? { open: false, reason: "closed" }
      : { open: true, reason: null };
  }

  if (placeId === "east_house" && hour >= 7 && hour < 20) {
    return { open: true, reason: null };
  }

  if (friend || (awakeInside > 0 && hour >= 7 && hour < 22)) {
    return { open: true, reason: null };
  }

  return {
    open: false,
    reason: asleepInside > 0 || awakeInside > 0 ? "sleeping" : "nobody",
  };
}

/** Light inside the buildings: dim during the day, dark at night. */
export const interiorDarkness = (darknessOutside) => ({
  color: [24, 14, 30],
  alpha: 0.12 + darknessOutside * 0.55,
});
