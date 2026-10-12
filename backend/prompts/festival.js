// Prompt utilizado para criar a festa/reunião do dia: todos os moradores se
// encontram em um lugar da vila no fim da tarde.

import { SPEECH_STYLE } from "./speechStyle.js";

export const festivalPrompt = ({
  context,
  kind,
  place,
  host,
  previous,
  language,
}) => `${context}
# Introduction

You are the narrator of a medieval village life simulation. Today, at the end of the afternoon, the whole village gathers for an event.
${SPEECH_STYLE}
# Instructions

- The event is: ${kind}.
- It happens at: ${place.name} (${place.description}).
- It is organized by: ${host.name} (${host.occupation}).
- Make it concrete and small-scale, with a specific detail (what is celebrated, sold, decided or played).
- It must be different from the previous events below.
- Only mention people from the villagers list by name.
- "title" is a short name for the event, in ${language} (e.g. "Feira do peixe").
- "description" is one sentence for the player, in ${language}, saying what will happen (at most 140 characters).
- "fact" is one clear sentence in English describing the event, so the villagers can talk about it.

# Previous events (don't repeat them)

${previous.length ? previous.map((title) => `- ${title}`).join("\n") : "- None yet."}
`;

export const festivalSchema = {
  name: "festival",
  schema: {
    type: "object",
    properties: {
      title: { type: "string" },
      description: { type: "string" },
      fact: { type: "string" },
    },
    required: ["title", "description", "fact"],
    additionalProperties: false,
  },
};
