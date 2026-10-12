// Prompt utilizado para criar uma nova meta pessoal para um NPC que acabou
// de realizar a anterior.

export const goalPrompt = ({ context, npc, achieved, language }) => `${context}
# Introduction

${npc.name} (${npc.occupation}) just achieved a personal goal: "${achieved}".

This is ${npc.name}'s story: ${npc.story}

Create ${npc.name}'s NEXT personal goal for the coming days: something concrete and achievable in the village, coherent with their story and different from the previous one (e.g. "save 30 coins to fix the roof", "teach the fishing knots to someone", "win the next contest of the village"). One short sentence in ${language} (it is shown to the player). Only mention people from the villagers list by name.
`;

export const goalSchema = {
  name: "goal",
  schema: {
    type: "object",
    properties: {
      goal: { type: "string" },
    },
    required: ["goal"],
    additionalProperties: false,
  },
};
