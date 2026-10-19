// Prompt utilizado para gerar uma conversa entre dois NPCs que se encontraram
// no mapa. A cena inteira é gerada em uma única chamada ("diretor de cena").

import { SPEECH_STYLE } from "./speechStyle.js";

const describeOpinion = ({ value = 0, met = false } = {}) =>
  `${value} (from -10 to 10)${met ? "" : value ? ", only from what they heard" : ", they never talked with the traveler"}`;

const describeNpc = (npc, facts, isPrivate) => `
Name: ${npc.name}
Gender: ${npc.gender}
Occupation: ${npc.occupation ?? "villager"}
Personality: ${npc.personality.join(", ")}
Mood right now: ${npc.mood ?? "normal"}
Opinion of the traveler: ${describeOpinion(npc.opinionOfTraveler)}${npc.goal ? `\nPersonal goal these days: ${npc.goal}` : ""}${npc.ambition ? `\nBig ambition of their life: ${npc.ambition}` : ""}${npc.family ? `\nFamily: ${npc.family}` : ""}
Story: ${npc.story}${isPrivate && npc.secret ? `\nSecret (may come up only with someone they trust): ${npc.secret}` : ""}
Things ${npc.name} knows or heard recently (may be used as topics or gossip):
${facts.length ? facts.map((fact) => `- ${fact}`).join("\n") : "- Nothing in particular."}`;

const describeRelationship = (a, b, relationship) => {
  if (!relationship.talks) {
    return `${a.name} and ${b.name} have never talked before in this story.`;
  }

  return `${a.name} and ${b.name} have talked ${relationship.talks} time(s). Their affinity is ${relationship.affinity} (from -10, enemies, to 10, close friends). Last time: ${relationship.lastTalkSummary}`;
};

export const npcConversationPrompt = ({
  context,
  a,
  b,
  factsA,
  factsB,
  relationship,
  location = null,
  time = null,
  weather = null,
  festival = null,
  isPrivate = false,
  language,
}) => `${context}
# Introduction

You are a writer directing a short scene of a medieval 2D RPG. Two characters (NPCs) just met while walking around the village and will have a short conversation. The player is NOT part of the conversation, but may be mentioned (they are a traveler that talks to the villagers).
${SPEECH_STYLE}
# Instructions

- Write between 2 and 6 lines alternating between the characters, starting with "a".
- Each line must be short (at most 100 characters), natural and in character. It will be shown in a speech bubble.
- The conversation must be easy to follow: someone who reads only these lines must understand what they are talking about. Each line must answer or react to the previous one.
- Pick ONE concrete topic and stick to it: a piece of news, gossip about someone, work, a problem of the village, something one of them knows or heard recently.
- React based on personality and affinity.
- Only mention people from the villagers list by name.
- Don't repeat the last conversation.
${
  isPrivate
    ? "- They think they are ALONE: nobody is listening. They speak freely and honestly: gossip, complaints, honest opinions about the traveler and other villagers, and maybe a secret if they trust each other. Someone hiding something may let a small detail slip, without a full confession."
    : "- The traveler is standing right next to them and can hear everything: they are polite, avoid secrets and don't gossip about the traveler."
}
- Write the lines in ${language}.
- "emotion" is the emotion of the speaker in that line.
- "outcome" is what happens right after the conversation:
  - "none": each one goes on with their day (most common).
  - "walk_together": one follows the other for a while; "target" is the one being followed.
  - "go_to_player": "target" wants to tell something to the traveler and goes after them; "callout" is what they shout to the traveler (in ${language}).
  - "avoid": "target" walks away from the other (e.g. after an argument).
  Use "target": "none" and "callout": "" when they don't apply.
- "memories" is a short sentence (in English) of what each character will remember from this conversation, written from their own point of view.
- "affinityDelta" is how much their affinity changed with this conversation.
- "aboutTraveler" is true when they talked about the traveler (what the traveler did, said or is like).
- "ambition": for each character, how much this conversation moved their big ambition: "none" (most conversations), "small" (they talked about it, got an idea or encouragement) or "big" (real progress: a decision, a deal, help, making peace). "ambitionNote": one short sentence in ${language} saying what moved (empty when "none").
- LANGUAGE: everything the characters say ("lines" and "callout") is in ${language}, even though the notes below are in English. Only "memories" are in English.

# Characters

## Character "a"
${describeNpc(a, factsA, isPrivate)}

## Character "b"
${describeNpc(b, factsB, isPrivate)}

# Relationship

${describeRelationship(a, b, relationship)}

# Where

${location ? `They met at: ${location.name} (${location.description}).` : "They met while walking around the village."}${time ? ` It is ${time}.` : ""}${weather ? ` Weather: ${weather}.` : ""}${festival ? `\nToday's gathering of the village: ${festival}` : ""}
`;

export const npcConversationSchema = {
  name: "npc_conversation",
  schema: {
    type: "object",
    properties: {
      lines: {
        type: "array",
        items: {
          type: "object",
          properties: {
            speaker: { type: "string", enum: ["a", "b"] },
            text: { type: "string" },
            emotion: {
              type: "string",
              enum: ["neutral", "happy", "angry", "sad", "surprised"],
            },
          },
          required: ["speaker", "text", "emotion"],
          additionalProperties: false,
        },
      },
      outcome: {
        type: "object",
        properties: {
          action: {
            type: "string",
            enum: ["none", "walk_together", "go_to_player", "avoid"],
          },
          target: { type: "string", enum: ["a", "b", "none"] },
          callout: { type: "string" },
        },
        required: ["action", "target", "callout"],
        additionalProperties: false,
      },
      memories: {
        type: "object",
        properties: {
          a: { type: "string" },
          b: { type: "string" },
        },
        required: ["a", "b"],
        additionalProperties: false,
      },
      affinityDelta: { type: "integer", enum: [-2, -1, 0, 1, 2] },
      aboutTraveler: { type: "boolean" },
      ambition: {
        type: "object",
        properties: {
          a: { type: "string", enum: ["none", "small", "big"] },
          b: { type: "string", enum: ["none", "small", "big"] },
        },
        required: ["a", "b"],
        additionalProperties: false,
      },
      ambitionNote: {
        type: "object",
        properties: {
          a: { type: "string" },
          b: { type: "string" },
        },
        required: ["a", "b"],
        additionalProperties: false,
      },
    },
    required: [
      "lines",
      "outcome",
      "memories",
      "affinityDelta",
      "aboutTraveler",
      "ambition",
      "ambitionNote",
    ],
    additionalProperties: false,
  },
};
