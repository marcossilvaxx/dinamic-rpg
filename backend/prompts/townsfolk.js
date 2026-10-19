// Prompt utilizado para criar os moradores da vila vizinha (Vila de
// Pedravento), que o jogador encontra quando viaja de barco até lá.

import { SPEECH_STYLE } from "./speechStyle.js";

export const townsfolkPrompt = ({
  context,
  people,
  usedNames,
  language,
}) => `${context}
# Introduction

You are a fictional-adventure writer. Create ${people.length} people who live in Vila de Pedravento, a bigger market town across the sea from the island village above. The traveler (the player) can visit the town by boat and talk with them.
${SPEECH_STYLE}
# The people

${people.map(({ gender, look }, i) => `${i + 1}. ${gender.toLowerCase()}, looks like this: ${look}`).join("\n")}

# Instructions

For each person, in the same order:
- "name": a name VERY different from each other and from these names (other first letter and sound): ${usedNames.join(", ")}.
- "occupation": short, in English, fitting a market town (e.g. "harbor master", "town guard", "innkeeper", "scholar", "fish seller").
- "title": the same occupation in ${language}, short and matching the gender of the person (shown to the player).
- "personality": 3 or 4 traits.
- "story": who they are in the town, what they do every day, what they know or think about the island village and its people (by what they heard: trade, rumors, the bandits of the forest), and what they want right now. Concrete, 3 or 4 sentences.
- "secret": something small and concrete they hide.
- "likes": 2 things they love to receive as a gift; "dislikes": 1 thing. Short item names in ${language}.
`;

export const townsfolkSchema = {
  name: "townsfolk",
  schema: {
    type: "object",
    properties: {
      people: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            occupation: { type: "string" },
            title: { type: "string" },
            personality: { type: "array", items: { type: "string" } },
            story: { type: "string" },
            secret: { type: "string" },
            likes: { type: "array", items: { type: "string" } },
            dislikes: { type: "array", items: { type: "string" } },
          },
          required: [
            "name",
            "occupation",
            "title",
            "personality",
            "story",
            "secret",
            "likes",
            "dislikes",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["people"],
    additionalProperties: false,
  },
};
