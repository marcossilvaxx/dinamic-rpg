// Pure rules of the fights (no state): how brave an NPC is, how it reacts
// when the player hits it, and who is the guard of the village.

const BRAVE_TRAITS =
  /brave|bold|proud|hot-?tempered|aggressive|fierce|stubborn|protective|confident|corajos|orgulh|esquentad|agressiv|teimos|protetor/i;
const TIMID_TRAITS =
  /shy|timid|gentle|peaceful|cautious|wary|fearful|calm|kind|t[ií]mid|gentil|pac[ií]fic|cautelos|medros|calm|bondos/i;
const TOUGH_OCCUPATION =
  /guard|soldier|warrior|watch|smith|hunter|knight|captain|guarda|soldad|ferreir|caçador|cacador|vigia/i;
const GUARD_OCCUPATION =
  /guard|watch|sentinel|captain|constable|guarda|vigia|sentinela|capitão|capitao/i;

const CLASS_COURAGE = {
  warrior: 2,
  ninja: 2,
  ranger: 1,
  mage: 0,
  healer: -1,
  townfolk: 0,
};

const spriteClass = (sprite = "") => sprite.replace(/[MF]$/, "");

/**
 * How brave the NPC is (around -3..6): its class, occupation and
 * personality.
 */
export function courageOf(data) {
  const traits = (data.personality ?? []).join(" ");

  return (
    (CLASS_COURAGE[spriteClass(data.sprite)] ?? 0) +
    (TOUGH_OCCUPATION.test(data.occupation ?? "") ? 2 : 0) +
    (BRAVE_TRAITS.test(traits) ? 1 : 0) -
    (TIMID_TRAITS.test(traits) ? 1 : 0)
  );
}

/**
 * The player hit the NPC out of a fight: does it fight back or run away?
 *
 * @param {object} data The NPC.
 * @param {object} context
 * @param {number} context.reputation Of the player with the NPC.
 * @param {string|null} context.bond Of the player with the NPC.
 * @param {boolean} context.injured
 * @returns {"fight"|"flee"}
 */
export function reactionToAttack(data, { reputation, bond, injured }) {
  if (injured) return "flee";

  const anger =
    courageOf(data) +
    (bond === "rival" ? 2 : 0) +
    (reputation <= -4 ? 1 : 0) -
    (bond === "romance" || bond === "best_friend" ? 1 : 0);

  return anger >= 2 ? "fight" : "flee";
}

// Life restored by eating or using things (the player presses H)
const HEALING = [
  [/po[cç][aã]o|elixir|t[oô]nico|potion/i, 60],
  [/rem[eé]dio|unguento|bandagem|medicine/i, 45],
  [/erva|herb|mel/i, 25],
  [/[aá]gua|water/i, 8],
  [
    /p[aã]o|peixe|carne|fruta|queijo|ma[cç][aã]|cogumelo|castanha|sopa|bread|fish/i,
    12,
  ],
];

/** Life an item restores (0 if it doesn't heal). */
export function healValue(item = "") {
  return HEALING.find(([pattern]) => pattern.test(item))?.[1] ?? 0;
}

/** Whether the occupation of the NPC makes it the guard of the village. */
export const isGuard = (data) => GUARD_OCCUPATION.test(data.occupation ?? "");
