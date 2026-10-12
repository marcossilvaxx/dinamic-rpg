// Contexto do mundo que abre TODOS os prompts gerados depois da criação do
// mundo. Por ser idêntico em todas as chamadas da partida, a OpenAI reaproveita
// esse prefixo (prompt caching) e cobra os tokens dele com ~90% de desconto.
// Por isso ele deve vir sempre no início e não pode conter nada que varie de
// uma chamada para outra.

export const describePlaces = (places) =>
  places.length
    ? places
        .map(
          ({ id, name, description }) =>
            `- ${name} (id: ${id}): ${description}`,
        )
        .join("\n")
    : "- (no specific places)";

export const describeVillagers = (villagers) =>
  villagers
    .map(({ name, occupation }) => `- ${name}, ${occupation}`)
    .join("\n");

// Without this rule the model invents relatives, merchants, missing people...
// that the player can't find in the game.
export const ONLY_KNOWN_PEOPLE = `These are the ONLY named people in this story. Never invent or mention any other person by name (relatives, friends, merchants, visitors, missing people, nobles...). When you need to mention someone else, describe them without a name: "a traveling merchant", "my late father", "a fisherman from the next village".`;

export const worldContext = ({
  worldHistory,
  places,
  villagers,
}) => `# World History

${worldHistory}

# Places of the village

These are the places that exist in the village map:

${describePlaces(places)}

# Villagers

These are all the people who live in the village:

${describeVillagers(villagers)}

${ONLY_KNOWN_PEOPLE}
`;
