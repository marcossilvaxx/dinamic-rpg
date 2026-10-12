// Prompt utilizado para criar um visitante que passa um dia na vila
// (mercador, bardo, peregrino...), com mercadorias raras.

import { SPEECH_STYLE } from "./speechStyle.js";

export const visitorPrompt = ({
  context,
  kind,
  look,
  gender,
  usedNames,
  season,
  language,
}) => `${context}
# Introduction

You are a fictional-adventure writer. Create a VISITOR who arrives at the village today and leaves in the evening: ${kind}.
${SPEECH_STYLE}
# Instructions

- The visitor is ${gender.toLowerCase()} and looks like this: ${look}
- "name": a name VERY different from these names (other first letter and sound): ${usedNames.join(", ")}.
- "occupation": short, in English (e.g. "traveling spice merchant").
- "personality": 3 or 4 traits.
- "story": where they come from (without naming other people or real places), why they are passing by and what they want here today. Concrete, 3 or 4 sentences. They don't know the villagers well.
- "wares": 2 or 3 rare things they sell, not found in the village, with prices in coins (8 to 30). Item names are short, singular and in ${language}.
- "news": one sentence in ${language} announcing their arrival to the player (at most 120 characters).
- It is ${season}.
`;

export const visitorSchema = {
  name: "visitor",
  schema: {
    type: "object",
    properties: {
      name: { type: "string" },
      occupation: { type: "string" },
      personality: { type: "array", items: { type: "string" } },
      story: { type: "string" },
      wares: {
        type: "array",
        items: {
          type: "object",
          properties: {
            item: { type: "string" },
            price: { type: "integer" },
          },
          required: ["item", "price"],
          additionalProperties: false,
        },
      },
      news: { type: "string" },
    },
    required: ["name", "occupation", "personality", "story", "wares", "news"],
    additionalProperties: false,
  },
};
