// Validation of the villagers (cast) created together with the world history.

const firstName = (name) => name.trim().split(/\s+/)[0].toLowerCase();
const initial = (name) => firstName(name).normalize("NFD")[0];

// Used only when the model keeps repeating names: one per initial letter
const FALLBACK_NAMES = [
  "Aldous",
  "Brigid",
  "Cormac",
  "Delphine",
  "Eamon",
  "Fiora",
  "Gideon",
  "Hilde",
  "Isolde",
  "Jareth",
  "Kestrel",
  "Lorcan",
  "Maelis",
  "Niall",
  "Odessa",
  "Percival",
  "Quill",
  "Rowena",
  "Severin",
  "Thea",
  "Ulric",
  "Vesna",
  "Wystan",
  "Yara",
  "Zoltan",
];

/**
 * @param {{slot: number, name: string, occupation: string, title?: string}[]} villagers
 * @param {number} quantity Expected number of villagers (slots 1..quantity).
 * @returns {string[]} Problems to fix, empty when the cast is valid.
 */
export function castProblems(villagers, quantity) {
  const problems = [];

  for (let slot = 1; slot <= quantity; slot++) {
    const count = villagers.filter((villager) => villager.slot === slot).length;
    if (count !== 1) {
      problems.push(`Slot ${slot} must have exactly one villager.`);
    }
  }

  const byInitial = new Map();
  villagers.forEach(({ name }) => {
    const key = initial(name);
    byInitial.set(key, [...(byInitial.get(key) ?? []), name]);
  });

  byInitial.forEach((names, letter) => {
    // With more villagers than letters some repetition is unavoidable
    if (names.length > 1 && quantity <= 20) {
      problems.push(
        `${names.join(", ")} start with the same letter "${letter.toUpperCase()}". Each first name must start with a different letter.`,
      );
    }
  });

  return problems;
}

/**
 * Returns one villager per slot with unique first names, replacing missing
 * villagers and repeated names by fallback ones.
 */
export function fixCast(villagers, quantity) {
  const used = new Set();
  const usedInitials = new Set();
  const cast = [];

  for (let slot = 1; slot <= quantity; slot++) {
    const villager = villagers.find((v) => v.slot === slot) ?? {
      slot,
      name: "",
      occupation: "Villager",
    };
    let name = villager.name.trim();

    if (!name || used.has(firstName(name))) {
      name =
        FALLBACK_NAMES.find(
          (fallback) =>
            !used.has(firstName(fallback)) &&
            !usedInitials.has(initial(fallback)),
        ) ??
        FALLBACK_NAMES.find((fallback) => !used.has(firstName(fallback))) ??
        `Villager ${slot}`;
    }

    used.add(firstName(name));
    usedInitials.add(initial(name));
    cast.push({
      slot,
      name,
      occupation: villager.occupation.trim(),
      // The occupation in the language of the player (games saved before it
      // existed don't have it)
      ...(villager.title?.trim() && { title: villager.title.trim() }),
    });
  }

  return cast;
}
