// Needs and mood of the NPCs, derived from the time of the day (so they match
// the schedule the frontend uses to move the NPCs: sleep at night, meals at
// the tavern) and from what happens to them (mood).

export const MIN_MOOD = -5;
export const MAX_MOOD = 5;

export const clampMood = (mood) => Math.min(MAX_MOOD, Math.max(MIN_MOOD, mood));

export const isSleepTime = (hour) => hour >= 23 || hour < 6;

/** @returns {{hunger: string, energy: string, asleep: boolean}} */
export function needsAt(hour) {
  const hungry = (hour >= 11 && hour < 13) || (hour >= 18 && hour < 20);

  return {
    hunger: hungry ? "hungry, it's almost meal time" : "not hungry",
    energy: isSleepTime(hour)
      ? "sleepy"
      : hour >= 20 || hour < 7
        ? "tired"
        : "rested",
    asleep: isSleepTime(hour),
  };
}

export function describeMood(mood) {
  if (mood <= -3) return "in a bad mood";
  if (mood < 0) return "a bit down";
  if (mood >= 3) return "in a great mood";
  if (mood > 0) return "in a good mood";
  return "in a normal mood";
}
