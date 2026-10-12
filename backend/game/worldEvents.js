// Chooses what the next world event is about. Picking the kind, the place and
// who is involved in code (instead of leaving it to the model) avoids the
// same kind of news over and over.

const KINDS = {
  visitor: "a visitor or a merchant arriving with something unusual",
  damage: "something breaking or getting damaged",
  celebration: "a small celebration or a friendly bet",
  animals: "animals (born, escaped, sick, a wild animal seen nearby)",
  trade: "trade: prices going up or down, a shortage or a good deal",
  loss: "a minor theft or something going missing",
  discovery: "someone finding or discovering something",
  sickness: "someone getting sick or hurt (nothing serious)",
  work: "work news: harvest, fishing, building or repairs",
  argument: "an argument or disagreement between villagers",
  goodNews: "good news about a villager (an achievement, a gift, a new skill)",
};

// The weather and the daily gatherings have their own systems (Weather.js and
// festivals.js), so they are not world events.
export const EVENT_KINDS = Object.values(KINDS);

// How the event changes the mood of the villagers involved
export const EVENT_MOOD = {
  [KINDS.damage]: -1,
  [KINDS.celebration]: 1,
  [KINDS.loss]: -1,
  [KINDS.discovery]: 1,
  [KINDS.sickness]: -1,
  [KINDS.argument]: -1,
  [KINDS.goodNews]: 2,
};

const pick = (items, random) => items[Math.floor(random() * items.length)];

/**
 * @param {object} options
 * @param {{kind: string, placeId: string, involved: string[]}[]} options.history
 *   Previous events, oldest first.
 * @param {{id: string}[]} options.places
 * @param {{name: string}[]} options.villagers
 * @param {() => number} [options.random]
 */
export function pickEventSetup({
  history,
  places,
  villagers,
  random = Math.random,
}) {
  const recentKinds = history.slice(-6).map((event) => event.kind);
  const kind = pick(
    EVENT_KINDS.filter((candidate) => !recentKinds.includes(candidate)),
    random,
  );

  const recentPlaces = history.slice(-3).map((event) => event.placeId);
  const freshPlaces = places.filter(
    (place) => !recentPlaces.includes(place.id),
  );
  const place = pick(freshPlaces.length ? freshPlaces : places, random);

  // Villagers involved less recently come first
  const lastInvolved = (villager) =>
    history.findLastIndex((event) => event.involved.includes(villager.name));
  const candidates = [...villagers].sort(
    (a, b) => lastInvolved(a) - lastInvolved(b) || random() - 0.5,
  );
  const involved = candidates.slice(
    0,
    villagers.length > 1 && random() < 0.4 ? 2 : 1,
  );

  return { kind, place, involved };
}
