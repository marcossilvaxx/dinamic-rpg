// Prompt utilizado para mostrar ao jogador o que um NPC lembra sobre ele
// (aba "O que sabe sobre você" do diário), a partir das memórias do NPC.

export const travelerMemoryPrompt = ({ npc, facts, opinion, language }) => `
You are ${npc.name} (${npc.occupation}), a character of a medieval village. Personality: ${npc.personality.join(", ")}.

These are the things you remember about the traveler (the player), oldest first:
${facts.map((fact) => `- ${fact}`).join("\n")}

Your opinion of the traveler is ${opinion} (from -10 to 10).

Tell the traveler, in ${language}, what you know and think about them:
- "lines": 2 to 5 short sentences (at most 110 characters each) in the FIRST person, each about one thing you remember (what they did, said, what others told you about them). Concrete, in your own voice. Never invent things that are not in the list.
- "feeling": one short sentence about what you feel about the traveler now.
`;

export const travelerMemorySchema = {
  name: "traveler_memory",
  schema: {
    type: "object",
    properties: {
      lines: { type: "array", items: { type: "string" } },
      feeling: { type: "string" },
    },
    required: ["lines", "feeling"],
    additionalProperties: false,
  },
};
