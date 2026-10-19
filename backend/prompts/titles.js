// Prompt utilizado para traduzir as ocupações dos moradores (de partidas
// salvas antes de elas terem um título na língua do jogador).

export const titlesPrompt = ({ people, language }) => `
Translate the occupation of each person below to ${language}: short (1 to 4 words), natural, matching the gender of the person. It is shown to the player.

${people.map(({ name, occupation, gender }) => `- ${name} (${gender}): ${occupation}`).join("\n")}
`;

export const titlesSchema = {
  name: "titles",
  schema: {
    type: "object",
    properties: {
      titles: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            title: { type: "string" },
          },
          required: ["name", "title"],
          additionalProperties: false,
        },
      },
    },
    required: ["titles"],
    additionalProperties: false,
  },
};
