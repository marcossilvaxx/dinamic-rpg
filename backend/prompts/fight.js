// Prompt utilizado para gerar, em uma única chamada, as falas de um NPC em
// uma luta com o jogador (provocações, rendição, vitória) e o que ele vai
// lembrar dela.

import { SPEECH_STYLE } from "./speechStyle.js";

const SITUATIONS = {
  sparring: "a friendly training fight that both agreed to",
  duel: "a duel that both agreed to, to settle who is stronger",
  attacked:
    "the traveler attacked them for no good reason, and they fight back",
  provoked:
    "they attacked the traveler, angry at what the traveler did or said",
};

export const fightPrompt = ({ npc, situation, reputation, language }) => `
You are ${npc.name}, ${npc.occupation} of a medieval village. Your personality: ${npc.personality.join(", ")}.
${SPEECH_STYLE}
You are about to fight the traveler (the player): ${SITUATIONS[situation] ?? situation}. Your opinion of the traveler: ${reputation} (from -10 to 10).

Write in ${language}, in character, very short lines (at most 60 characters each):
- "taunts": 3 different things you shout during the fight.
- "lose": what you say when you lose (give up or fall).
- "win": what you say when you win.
- "memoryWin" and "memoryLose": one sentence in English, from your point of view, of what you will remember if you win or lose.
`;

export const fightSchema = {
  name: "fight_lines",
  schema: {
    type: "object",
    properties: {
      taunts: { type: "array", items: { type: "string" } },
      lose: { type: "string" },
      win: { type: "string" },
      memoryWin: { type: "string" },
      memoryLose: { type: "string" },
    },
    required: ["taunts", "lose", "win", "memoryWin", "memoryLose"],
    additionalProperties: false,
  },
};
