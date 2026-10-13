// Prompt utilizado para decidir o que é construído nos terrenos vazios da
// vila (casas e lugares de trabalho) e quem mora ou trabalha em cada um.

export const villagePlanPrompt = ({
  worldHistory,
  villagers,
  places,
  lots,
  language,
}) => `
You are designing the village of a 2D medieval RPG. This is its story:

${worldHistory}

# Villagers

${villagers.map(({ slot, name, occupation }) => `- Slot ${slot}: ${name}, ${occupation}`).join("\n")}

# Buildings that already exist

${places
  .filter((place) => place.building)
  .map(({ name, description }) => `- ${name}: ${description}`)
  .join("\n")}

# Empty lots

${lots.map(({ id, description }) => `- ${id}: ${description}`).join("\n")}

# Task

Decide what is built on the empty lots, so the village fits its story and its people. Build on at least 2 lots (you may use all of them). Each building is either:
- "home": where one or more villagers live (a family, a couple, someone who needs a house of their own);
- "work": where someone works, following their occupation (a smithy, a bakery, a clinic, a carpenter's workshop, a chapel, a school...).

For each building give:
- "lot": the id of the lot;
- "kind": "home" or "work";
- "name": a short name shown to the player, in ${language} (e.g. "Ferraria de Bruno", "Casa dos Valdez", "Padaria");
- "description": one short sentence in English describing the building for the story;
- "owners": the slots of the villagers who live or work there (1 to 3; a villager may appear in only one building).
`;

export const villagePlanSchema = {
  name: "village_plan",
  schema: {
    type: "object",
    properties: {
      buildings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            lot: { type: "string" },
            kind: { type: "string", enum: ["home", "work"] },
            name: { type: "string" },
            description: { type: "string" },
            owners: { type: "array", items: { type: "integer" } },
          },
          required: ["lot", "kind", "name", "description", "owners"],
          additionalProperties: false,
        },
      },
    },
    required: ["buildings"],
    additionalProperties: false,
  },
};
