import {
  npcConversationPrompt,
  npcConversationSchema,
} from "../prompts/npcConversation.js";

export const MAX_CONVERSATION_LINES = 8;
export const MAX_LINE_LENGTH = 160;
export const MIN_AFFINITY = -10;
export const MAX_AFFINITY = 10;

export const clampAffinity = (value) =>
  Math.min(MAX_AFFINITY, Math.max(MIN_AFFINITY, value));

/**
 * Generates a whole conversation between two NPCs with a single LLM call.
 *
 * @returns {Promise<{
 *   lines: {speaker: "a"|"b", text: string, emotion: string}[],
 *   outcome: {action: string, target: "a"|"b"|null, callout: string},
 *   memories: {a: string, b: string},
 *   affinityDelta: number,
 *   aboutTraveler: boolean,
 * }>}
 */
export async function generateNpcConversation({
  llm,
  a,
  b,
  factsA,
  factsB,
  relationship,
  context,
  location = null,
  time = null,
  weather = null,
  festival = null,
  isPrivate = false,
  language,
  temperature = 0.7,
}) {
  const { content } = await llm.complete({
    temperature,
    cachePrefix: context,
    system: npcConversationPrompt({
      context,
      a,
      b,
      factsA,
      factsB,
      relationship,
      location,
      time,
      weather,
      festival,
      isPrivate,
      language,
    }),
    messages: [{ role: "user", content: "Write the scene." }],
    schema: npcConversationSchema,
  });

  const lines = content.lines
    .map((line) => ({
      ...line,
      text: line.text.trim().slice(0, MAX_LINE_LENGTH),
    }))
    .filter((line) => line.text)
    .slice(0, MAX_CONVERSATION_LINES);

  if (lines.length === 0) {
    throw new Error("The model generated an empty NPC conversation");
  }

  const { action, target, callout } = content.outcome;
  const hasTarget = target === "a" || target === "b";

  return {
    lines,
    outcome:
      action !== "none" && hasTarget
        ? { action, target, callout: callout.trim() }
        : { action: "none", target: null, callout: "" },
    memories: content.memories,
    affinityDelta: content.affinityDelta,
    aboutTraveler: Boolean(content.aboutTraveler),
    ambition: content.ambition ?? { a: "none", b: "none" },
    ambitionNote: content.ambitionNote ?? { a: "", b: "" },
  };
}
