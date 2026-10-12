// Pure rules to decide which NPCs start a conversation. No imports on purpose
// so it can be tested with node.

export const pairKey = (a, b) => (a < b ? `${a}:${b}` : `${b}:${a}`);

// Same thresholds as backend/game/GameSession.js
export const FRIENDS_AFFINITY = 5;
export const ENEMIES_AFFINITY = -5;

/**
 * Chance of two NPCs reacting when they meet: friends talk twice as often and
 * enemies always react (they avoid each other).
 */
export const encounterChance = (affinity = 0, chance) => {
  if (affinity <= ENEMIES_AFFINITY) return 1;
  if (affinity >= FRIENDS_AFFINITY) return Math.min(1, chance * 2);
  return chance;
};

/**
 * @param {{id: number, x: number, y: number}[]} candidates NPCs available to
 *   talk.
 * @param {number} now Current game time (ms).
 * @param {object} options
 * @param {number} options.distance Max distance between NPCs.
 * @param {number} options.chance Chance of starting when close enough.
 * @param {(a: number, b: number) => number} [options.chanceOf] Chance for a
 *   specific pair (defaults to `chance`).
 * @param {Map<number, number>} options.cooldowns NPC id -> time it can talk.
 * @param {Map<string, number>} options.pairCooldowns pairKey -> time the
 *   pair can talk again.
 * @param {() => number} [options.random]
 * @returns {[number, number] | null} The ids of the NPCs that will talk.
 */
export function selectEncounter(
  candidates,
  now,
  {
    distance,
    chance,
    chanceOf = () => chance,
    cooldowns,
    pairCooldowns,
    random = Math.random,
  },
) {
  const ready = candidates.filter((npc) => (cooldowns.get(npc.id) ?? 0) <= now);

  for (let i = 0; i < ready.length; i++) {
    for (let j = i + 1; j < ready.length; j++) {
      const a = ready[i];
      const b = ready[j];

      if ((pairCooldowns.get(pairKey(a.id, b.id)) ?? 0) > now) continue;
      if (Math.hypot(a.x - b.x, a.y - b.y) > distance) continue;

      if (random() < chanceOf(a.id, b.id)) {
        return [a.id, b.id];
      }
    }
  }

  return null;
}

// How long (ms) a line stays on screen
export const lineDuration = (text) => {
  const words = text.trim().split(/\s+/).length;
  return Math.min(Math.max(1200 + words * 400, 2000), 7000);
};
