// The occupation of an NPC as the player reads it. The model writes it in
// English (the rules of the game read it) and, since the cast has a "title",
// also in the language of the player. Games saved before that only have the
// English one: common words are translated here.

const WORDS = {
  apothecary: "boticário",
  apprentice: "aprendiz",
  baker: "padeiro",
  bandit: "bandido",
  barkeep: "taberneiro",
  bartender: "taberneiro",
  beekeeper: "apicultor",
  blacksmith: "ferreiro",
  bookkeeper: "contador",
  brewer: "cervejeiro",
  butcher: "açougueiro",
  captain: "capitão",
  carpenter: "carpinteiro",
  cook: "cozinheiro",
  cooper: "tanoeiro",
  elder: "ancião",
  farmer: "fazendeiro",
  ferryman: "barqueiro",
  fisher: "pescador",
  fisherman: "pescador",
  fisherwoman: "pescadora",
  fishmonger: "peixeiro",
  forager: "coletor",
  gardener: "jardineiro",
  guard: "guarda",
  healer: "curandeiro",
  herbalist: "herbalista",
  hunter: "caçador",
  innkeeper: "estalajadeiro",
  leader: "líder",
  librarian: "bibliotecário",
  mason: "pedreiro",
  master: "mestre",
  mayor: "prefeito",
  merchant: "mercador",
  midwife: "parteira",
  miller: "moleiro",
  miner: "minerador",
  monk: "monge",
  nun: "freira",
  physician: "médico",
  potter: "oleiro",
  priest: "sacerdote",
  priestess: "sacerdotisa",
  ranger: "patrulheiro",
  scholar: "estudioso",
  scribe: "escriba",
  seamstress: "costureira",
  shepherd: "pastor",
  shopkeeper: "lojista",
  smith: "ferreiro",
  soldier: "soldado",
  storyteller: "contador de histórias",
  tailor: "alfaiate",
  tanner: "curtidor",
  teacher: "professor",
  trader: "comerciante",
  villager: "morador",
  weaver: "tecelão",
  woodcutter: "lenhador",
  keeper: "guardião",
};

// Words that describe the main one ("village guard" -> "guarda da vila")
const MODIFIERS = {
  village: "da vila",
  town: "da cidade",
  harbor: "do porto",
  tavern: "da taverna",
  spice: "de especiarias",
  herb: "de ervas",
  fish: "de peixe",
  wandering: "andarilho",
  traveling: "viajante",
  head: "chefe",
  old: "velho",
};
const PHRASES = {
  "tavern keeper": "taberneiro",
  "inn keeper": "estalajadeiro",
  "shop keeper": "lojista",
  "village elder": "ancião da vila",
  "bandit leader": "líder dos bandidos",
};
const IGNORED = new Set(["the", "of", "and", "a"]);

const capitalize = (text) => text.charAt(0).toUpperCase() + text.slice(1);

/**
 * @param {{occupation?: string, title?: string}} data
 * @returns {string}
 */
export function occupationLabel({ occupation = "", title } = {}) {
  if (title) return capitalize(title);
  const words = (occupation.toLowerCase().match(/[a-z]+/g) ?? []).filter(
    (word) => !IGNORED.has(word),
  );
  if (PHRASES[words.join(" ")]) return capitalize(PHRASES[words.join(" ")]);
  // Only when every word is known (otherwise the English one says more)
  const main = words.filter((word) => WORDS[word]);
  if (!main.length || words.some((w) => !WORDS[w] && !MODIFIERS[w])) {
    return occupation;
  }
  const modifiers = words
    .filter((word) => !WORDS[word])
    .map((w) => MODIFIERS[w]);
  return capitalize(
    [...main.map((word) => WORDS[word]), ...modifiers].join(" "),
  );
}
