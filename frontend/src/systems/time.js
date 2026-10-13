// Pure rules of the game time (mirrors backend/game/needs.js and
// backend/game/GameClock.js). No imports on purpose: tested with node.

export const MINUTES_PER_DAY = 24 * 60;

export const isSleepTime = (hour) => hour >= 23 || hour < 6;
export const isMealTime = (hour) =>
  (hour >= 12 && hour < 13) || (hour >= 19 && hour < 20);

export const formatTime = (minuteOfDay) => {
  const pad = (value) => String(value).padStart(2, "0");
  return `${pad(Math.floor(minuteOfDay / 60))}:${pad(Math.floor(minuteOfDay % 60))}`;
};

export const isShelterWeather = (weather) =>
  weather === "rain" || weather === "storm" || weather === "snow";

/** Whether the gathering of the village (`festival`) is happening. */
export const isFestivalTime = (festival, day, hour) =>
  Boolean(festival) &&
  festival.day === day &&
  hour >= festival.startHour &&
  hour < festival.endHour;

/**
 * Where an NPC should be at a given hour.
 *
 * @param {number} hour
 * @param {object} npc
 * @param {number} npc.id
 * @param {string[]} npc.routine Place ids; the first one is home/work.
 * @param {boolean} hasTavern Whether the map has a tavern.
 * @param {object} [world]
 * @param {string} [world.weather] Rain sends everybody to shelter.
 * @param {object|null} [world.festival] Gathering of the day (world_state).
 * @param {number} [world.day] Current day of the game.
 * @param {object|null} [world.raid] Bandits attacking (world_state).
 * @returns {{placeId: string|null, sleeping: boolean, reason: string|null}}
 *   `placeId` null means "follow the daily routine"; `reason` is sleep,
 *   raid, festival, shelter, meal or evening.
 */
export function scheduleFor(
  hour,
  { id, routine },
  hasTavern = true,
  { weather = "clear", festival = null, day = null, raid = null } = {},
) {
  const home = routine[0] ?? null;
  const tavernOr = (fallback) => (hasTavern ? "tavern" : fallback);

  if (isSleepTime(hour)) {
    return { placeId: home, sleeping: Boolean(home), reason: "sleep" };
  }

  // Bandits in the village: everybody hides
  if (raid) {
    return {
      placeId: id % 2 === 1 ? tavernOr(home) : home,
      sleeping: false,
      reason: "raid",
    };
  }

  if (isFestivalTime(festival, day, hour)) {
    return { placeId: festival.placeId, sleeping: false, reason: "festival" };
  }

  // In the rain (or snow) half of the village waits in the tavern, the
  // others go home
  if (isShelterWeather(weather)) {
    return {
      placeId: id % 2 === 1 ? tavernOr(home) : home,
      sleeping: false,
      reason: "shelter",
    };
  }

  if (isMealTime(hour) && hasTavern) {
    return { placeId: "tavern", sleeping: false, reason: "meal" };
  }

  // Evenings: half of the village goes to the tavern, the others go home
  if (hour >= 20) {
    return {
      placeId: id % 2 === 1 ? tavernOr(home) : home,
      sleeping: false,
      reason: "evening",
    };
  }

  return { placeId: null, sleeping: false, reason: null };
}

const mix = (from, to, t) => from + (to - from) * t;

// Color and opacity of the darkness over the map, per hour
const LIGHT_KEYS = [
  { hour: 0, color: [10, 15, 50], alpha: 0.62 },
  { hour: 5, color: [10, 15, 50], alpha: 0.6 },
  { hour: 7, color: [255, 170, 90], alpha: 0.12 },
  { hour: 9, color: [0, 0, 0], alpha: 0 },
  { hour: 17, color: [0, 0, 0], alpha: 0 },
  { hour: 19, color: [255, 120, 60], alpha: 0.18 },
  { hour: 21, color: [10, 15, 50], alpha: 0.55 },
  { hour: 24, color: [10, 15, 50], alpha: 0.62 },
];

/** @returns {{color: number[], alpha: number}} */
export function lightingAt(minuteOfDay) {
  const hour = (minuteOfDay % MINUTES_PER_DAY) / 60;
  const next = LIGHT_KEYS.findIndex((key) => key.hour > hour);
  const to = LIGHT_KEYS[Math.max(next, 1)];
  const from = LIGHT_KEYS[Math.max(next, 1) - 1];
  const t = (hour - from.hour) / (to.hour - from.hour);

  return {
    color: from.color.map((value, i) => Math.round(mix(value, to.color[i], t))),
    alpha: mix(from.alpha, to.alpha, t),
  };
}
