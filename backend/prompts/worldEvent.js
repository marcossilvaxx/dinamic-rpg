// Prompt utilizado para gerar eventos periódicos do mundo ("chegou um
// mercador", "a ponte quebrou"...), que todos os NPCs passam a saber.

import { SPEECH_STYLE } from "./speechStyle.js";

export const worldEventPrompt = ({
  context,
  kind,
  place,
  involved,
  recentEvents,
  weather = null,
  season = null,
  sellers = [],
  language,
}) => `${context}
# Introduction

You are the narrator of a medieval village life simulation. Create a NEW small event that just happened in the village and that everybody will talk about today.
${SPEECH_STYLE}
# Instructions

- The event must be about: ${kind}.
- It happens at: ${place.name} (${place.description}).
- It involves: ${involved.map(({ name, occupation }) => `${name} (${occupation})`).join(" and ")}.
${
  weather
    ? `- The weather right now: ${weather}. The event must make sense with it.
`
    : ""
}${season ? `- Season: ${season}.\n` : ""}- Keep it concrete, believable and small-scale, with a specific detail (what, how many, how much...).
- It must be clearly different from the recent events below: different subject, different details.
- Only mention people from the villagers list by name.
- "headline" is a short news line for the player (at most 120 characters) in ${language}.
- "fact" is one clear sentence in English describing what happened, so the villagers can talk about it.
- "market": if the event clearly makes one of these sellers raise or lower their prices today, set "villager" to their name, "change" to "up" or "down" and "reason" to a few words in ${language}. Otherwise use "villager": "", "change": "none", "reason": "". Sellers: ${sellers.length ? sellers.join(", ") : "none"}.

# Recent events (don't repeat them)

${recentEvents.length ? recentEvents.map((event) => `- ${event}`).join("\n") : "- None yet."}
`;

export const worldEventSchema = {
  name: "world_event",
  schema: {
    type: "object",
    properties: {
      headline: { type: "string" },
      fact: { type: "string" },
      market: {
        type: "object",
        properties: {
          villager: { type: "string" },
          change: { type: "string", enum: ["up", "down", "none"] },
          reason: { type: "string" },
        },
        required: ["villager", "change", "reason"],
        additionalProperties: false,
      },
    },
    required: ["headline", "fact", "market"],
    additionalProperties: false,
  },
};
