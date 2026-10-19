// Prompts utilizados para criar as ambições de longo prazo dos moradores
// (com etapas), que avançam com as conversas e as ações de cada um.

const AMBITION_RULES = (
  language,
) => `- An ambition is a big, personal dream for the whole story (weeks), concrete and coherent with the story of the villager: "open a bakery of their own", "make peace with their brother", "become the guard of the village", "build a boat and see other islands".
- Split it in exactly 3 steps, in order, each one concrete and visible in the village (e.g. "save coins for the oven", "convince Ysra to sell flour cheaper", "open the doors of the bakery").
- Only mention people from the villagers list by name.
- Write "ambition" and "steps" in ${language} (they are shown to the player). Short: at most 80 characters each.`;

const ambitionItem = {
  type: "object",
  properties: {
    name: { type: "string" },
    ambition: { type: "string" },
    steps: { type: "array", items: { type: "string" } },
  },
  required: ["name", "ambition", "steps"],
  additionalProperties: false,
};

export const ambitionsPrompt = ({ context, villagers, language }) => `${context}
# Introduction

You are a fictional-adventure writer. Give each villager below a long-term AMBITION.

${AMBITION_RULES(language)}
- Each villager has a different kind of ambition (not everybody wants to open a shop). Some ambitions involve other villagers (to reconcile, to marry, to beat a rival).

# Villagers

${villagers.map(({ name, occupation, story }) => `- ${name} (${occupation}): ${story}`).join("\n")}
`;

export const ambitionsSchema = {
  name: "ambitions",
  schema: {
    type: "object",
    properties: {
      ambitions: { type: "array", items: ambitionItem },
    },
    required: ["ambitions"],
    additionalProperties: false,
  },
};

export const nextAmbitionPrompt = ({
  context,
  npc,
  achieved,
  language,
}) => `${context}
# Introduction

${npc.name} (${npc.occupation}) just achieved their long-term ambition: "${achieved}". This is ${npc.name}'s story: ${npc.story}

Create ${npc.name}'s NEXT ambition, building on what they achieved (a new chapter of their life).

${AMBITION_RULES(language)}
- "name" is ${npc.name}.
`;

export const nextAmbitionSchema = { name: "ambition", schema: ambitionItem };
