// Prompt utilizado para a geração da história do mundo do jogo e do elenco de
// moradores (nome e ocupação de cada NPC). Gerar o elenco junto com a história
// garante nomes bem diferentes entre si e uma história que só cita pessoas que
// existem no jogo.

import { describePlaces } from "./worldContext.js";

export const worldHistoryPrompt = ({ places = [], slots, problems = [] }) => `
# Introduction

You are a fictional-adventure writer.
I want you to create the history of a medieval village and the people living there.

Focus on a grounded, believable village with concrete details: its name, the places in it, who runs them, what people do for a living, recent events and the current problems of the village (a bad harvest, a dispute, bandits on the road...). Magic and legends may exist, but the village life must be concrete and easy to understand.

The village map has exactly these places. Use them in the history with these roles (you may give them proper names, like the name of the tavern), and don't create other buildings inside the village:

${describePlaces(places)}

# Villagers

Create exactly ${slots.length} villagers, one for each slot below, matching the gender and the look of the slot. Give each one a name and an occupation that fits their look and the village.

${slots.map(({ slot, gender, look }) => `- Slot ${slot}: ${gender}. ${look}`).join("\n")}

Names must be VERY different from each other, so the player never mixes them up:
- Each first name starts with a DIFFERENT letter.
- Use different lengths, sounds and endings (avoid pairs like "Edric/Elric", "Branna/Brenna", "Tovin/Torin").
- No shared surnames, unless they are family on purpose.
- Occupations must be different from each other too.

# The history

- The villagers above must be part of the history.
- They are the ONLY people that may be named in the history. Any other person (rulers, ancestors, merchants, missing people...) must be mentioned without a name.
- The text shouldn't have more than 700 words.
${problems.length ? `\n# Fix these problems of your previous attempt\n\n${problems.map((problem) => `- ${problem}`).join("\n")}\n` : ""}
# Responses

You must supply your response in the form of a valid JSON object with the history ("worldHistory") and the villagers ("villagers", with the slot number of each one).
`;

export const worldHistorySchema = {
  name: "world",
  schema: {
    type: "object",
    properties: {
      worldHistory: { type: "string" },
      villagers: {
        type: "array",
        items: {
          type: "object",
          properties: {
            slot: { type: "integer" },
            name: { type: "string" },
            occupation: { type: "string" },
          },
          required: ["slot", "name", "occupation"],
          additionalProperties: false,
        },
      },
    },
    required: ["worldHistory", "villagers"],
    additionalProperties: false,
  },
};
