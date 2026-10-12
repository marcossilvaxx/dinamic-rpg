// Prompt utilizado para criar o mistério da vila: algo aconteceu, um dos
// moradores é o responsável e cada um dos outros sabe uma pista.

import { SPEECH_STYLE } from "./speechStyle.js";

export const mysteryPrompt = ({
  context,
  villagers,
  language,
  previous = [],
}) => `${context}
# Introduction

You are designing a small mystery for the player (a traveler visiting the village) to solve by talking to the villagers.
${SPEECH_STYLE}
# Instructions

- Something small and concrete happened in the village recently: a theft, something broken on purpose, a missing object or animal, a prank that went wrong... Nobody was seriously hurt.
- Exactly ONE of the villagers is responsible ("culpritSlot"), with a believable motive.
- Another villager was harmed by it ("victimSlot"): the owner of what was stolen or broken, the one who was fooled...
- Every OTHER villager knows ONE different clue (something they saw, heard or noticed). Each clue alone is not enough, but together they clearly point to the culprit. At least one clue must contradict the culprit's alibi.
- The culprit has an alibi: a lie they tell to hide what they did.
- There is ONE piece of physical evidence ("evidence"): a small object left behind or found (a torn note, a button, a footprint cast, a tool...) that proves who did it. One villager who is NOT the culprit found it and keeps it ("holderSlot"). "item" is its short name and "description" says what it is and why it points to the culprit, both in ${language}.
- "title" and "intro" are in ${language}: "intro" is how the player first hears about it (at most 200 characters), without revealing the culprit.
- "solution" (what really happened, shown to the player at the end) is in ${language}.
- "motive", "alibi" and the clues are in English.
- Only mention people from the villagers list by name.
${previous.length ? `- It must be completely different from the previous mysteries of this village (other culprit when possible, other kind of event):\n${previous.map((title) => `  - ${title}`).join("\n")}\n` : ""}
# Villagers (slot numbers)

${villagers.map(({ slot, name, occupation }) => `- Slot ${slot}: ${name}, ${occupation}`).join("\n")}
`;

export const mysterySchema = {
  name: "mystery",
  schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      intro: { type: "string" },
      culpritSlot: { type: "integer" },
      victimSlot: { type: "integer" },
      motive: { type: "string" },
      solution: { type: "string" },
      alibi: { type: "string" },
      evidence: {
        type: "object",
        properties: {
          item: { type: "string" },
          description: { type: "string" },
          holderSlot: { type: "integer" },
        },
        required: ["item", "description", "holderSlot"],
        additionalProperties: false,
      },
      clues: {
        type: "array",
        items: {
          type: "object",
          properties: {
            slot: { type: "integer" },
            clue: { type: "string" },
          },
          required: ["slot", "clue"],
          additionalProperties: false,
        },
      },
    },
    required: [
      "title",
      "intro",
      "culpritSlot",
      "victimSlot",
      "motive",
      "solution",
      "alibi",
      "evidence",
      "clues",
    ],
    additionalProperties: false,
  },
};
