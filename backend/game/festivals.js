// The daily gathering of the village: announced in the morning, everybody
// goes to the place at the end of the afternoon (see the frontend
// systems/time.js) and remembers it afterwards.

export const FESTIVAL_KINDS = [
  "a market fair, with stalls selling food and crafts",
  "a contest (fishing, cooking, strength, archery...)",
  "a dance with music",
  "a village meeting to decide something about a problem of the village",
  "a celebration of good news (a birth, an engagement, a good harvest...)",
  "a farewell or a welcome for someone",
  "a storytelling night around a fire",
  "a shared meal where everybody brings something",
];

export const FESTIVAL_ANNOUNCE_HOUR = 9;
export const FESTIVAL_START_HOUR = 17;
export const FESTIVAL_END_HOUR = 19;
// Places preferred for gatherings, when the map has them
export const GATHERING_PLACES = ["garden", "tavern", "south_road"];
export const SHELTER_PLACE = "tavern";

const pick = (items, random) => items[Math.floor(random() * items.length)];

/**
 * @param {object} options
 * @param {string[]} options.recentKinds Kinds of the previous festivals.
 * @param {{id: string}[]} options.places
 * @param {{slot: number, name: string}[]} options.villagers
 */
export function pickFestivalSetup({
  recentKinds,
  places,
  villagers,
  random = Math.random,
}) {
  const kinds = FESTIVAL_KINDS.filter(
    (kind) => !recentKinds.slice(-4).includes(kind),
  );
  const gathering = GATHERING_PLACES.map((id) =>
    places.find((place) => place.id === id),
  ).find(Boolean);

  return {
    kind: pick(kinds, random),
    place: gathering ?? pick(places, random),
    host: pick(villagers, random),
  };
}

/** @returns {"announced"|"active"|"over"} */
export const festivalStatus = (hour) =>
  hour < FESTIVAL_START_HOUR
    ? "announced"
    : hour < FESTIVAL_END_HOUR
      ? "active"
      : "over";
