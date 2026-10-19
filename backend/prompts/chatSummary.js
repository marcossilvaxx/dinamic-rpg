// Prompt utilizado para resumir uma conversa entre jogador e NPC em um fato
// curto, que o NPC poderá comentar com outros NPCs (fofoca).

export const chatSummaryPrompt = ({
  npc,
  transcript,
  mysteryTitle = null,
  language = "English",
  ambition = null,
}) => `
You are ${npc.name}, a character of a medieval village. You just talked with a traveler (the player). This is the conversation:

${transcript}

Summarize in ONE short sentence, in English and from your point of view, the most interesting thing you learned or that happened in this conversation (something you could tell other villagers). If nothing relevant happened, return an empty string in "fact".

${
  mysteryTitle
    ? `"testimony": if in this conversation you told the traveler something about "${mysteryTitle}" (what you saw, heard, know, or where you were), write it as one short sentence in ${language}, in the third person, starting with your name (e.g. "${npc.name} disse que..."). Write exactly what you claimed, even if it is a lie. Otherwise return an empty string.`
    : `"testimony": always an empty string.`
}

${
  ambition
    ? `"ambition": the big ambition of your life is ${ambition}. Did the traveler help it in this conversation? "none" (most chats), "small" (encouragement, an idea, useful information) or "big" (real help: a promise kept, a deal, something that changes your plans). "ambitionNote": one short sentence in ${language} saying how the traveler helped (empty when "none").`
    : `"ambition": always "none"; "ambitionNote": always an empty string.`
}
`;

export const chatSummarySchema = {
  name: "chat_summary",
  schema: {
    type: "object",
    properties: {
      fact: { type: "string" },
      testimony: { type: "string" },
      ambition: { type: "string", enum: ["none", "small", "big"] },
      ambitionNote: { type: "string" },
    },
    required: ["fact", "testimony", "ambition", "ambitionNote"],
    additionalProperties: false,
  },
};
