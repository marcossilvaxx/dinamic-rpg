// Gossip about the player: when two NPCs talk about the traveler, the opinion
// of each one moves towards the opinion of the other, so villagers that never
// met the player can already like or distrust them.

const MAX_HEARSAY_CHANGE = 2;

/**
 * How much the listener's opinion of the traveler changes after hearing the
 * speaker talk about them.
 *
 * @param {number} speaker Opinion of the speaker (-10..10).
 * @param {number} listener Opinion of the listener (-10..10).
 * @returns {number} Between -2 and 2.
 */
export function hearsayChange(speaker, listener) {
  const change = Math.trunc((speaker - listener) / 3);
  return Math.max(-MAX_HEARSAY_CHANGE, Math.min(MAX_HEARSAY_CHANGE, change));
}
