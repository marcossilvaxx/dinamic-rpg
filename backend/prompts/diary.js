// Prompt utilizado para condensar memórias antigas de um NPC em uma entrada
// de diário (memória de longo prazo), em vez de simplesmente esquecê-las.

export const diaryPrompt = ({ npc, memories, previousEntry }) => `
You are ${npc.name}, ${npc.occupation} of a medieval village. These are some of your older memories:

${memories.map((memory) => `- ${memory}`).join("\n")}
${previousEntry ? `\nThis is an older diary entry of yours, merge it too:\n- ${previousEntry}\n` : ""}
Write ONE diary entry in English, from your point of view, with at most 3 short sentences. Keep the concrete facts that matter (who, what, where) and drop the unimportant details.
`;

export const diarySchema = {
  name: "diary_entry",
  schema: {
    type: "object",
    properties: {
      entry: { type: "string" },
    },
    required: ["entry"],
    additionalProperties: false,
  },
};
