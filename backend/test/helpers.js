// Test doubles shared by the backend tests.
import { GameSession } from "../game/GameSession.js";
import { SessionStore } from "../storage/SessionStore.js";

// Minimal in-memory replacement of the Redis client used by SessionStore
export const fakeDatabase = () => {
  const hashes = new Map();
  const sets = new Map();
  const expirations = new Map();
  return {
    hashes,
    hSet: async (key, field, value) => {
      if (!hashes.has(key)) hashes.set(key, new Map());
      hashes.get(key).set(field, value);
    },
    hGet: async (key, field) => hashes.get(key)?.get(field) ?? null,
    del: async (keys) =>
      keys.forEach((key) => hashes.delete(key) || sets.delete(key)),
    sAdd: async (key, member) => {
      if (!sets.has(key)) sets.set(key, new Set());
      sets.get(key).add(member);
    },
    sMembers: async (key) => [...(sets.get(key) ?? [])],
    expire: async (key, seconds) => expirations.set(key, seconds),
    expirations,
  };
};

export const conversation = (overrides = {}) => ({
  lines: [
    { speaker: "a", text: "Hello there!", emotion: "happy" },
    {
      speaker: "b",
      text: "Did you hear about the dragon?",
      emotion: "neutral",
    },
    { speaker: "a", text: "  ", emotion: "neutral" }, // empty lines are dropped
  ],
  outcome: { action: "walk_together", target: "b", callout: "" },
  memories: { a: "B told me about a dragon.", b: "I told A about the dragon." },
  affinityDelta: 2,
  aboutTraveler: false,
  ...overrides,
});

// Fake LLM answering according to the requested schema
// `toolCalls` maps a schema name to the tool calls returned with it.
export const fakeLlm = (responses = {}, toolCalls = {}) => {
  const calls = [];
  return {
    calls,
    complete: async (options) => {
      const name = options.schema?.name;
      calls.push(name);
      const content =
        responses[name]?.(options) ??
        {
          // One villager per "- Slot N:" line of the prompt
          world: () => ({
            worldHistory: "A small village.",
            villagers: [
              ...options.messages[0].content.matchAll(/- Slot (\d+):/g),
            ].map(([, slot]) => ({
              slot: Number(slot),
              name: `Npc${slot}`,
              occupation: "Farmer",
              title: "Fazendeiro",
            })),
          }),
          character: () => ({
            personality: ["kind"],
            story: "A story.",
            routine: ["dock", "unknown_place", "dock"],
            secret: "Owes money to the tavern.",
            wares: [
              { item: "Pão", price: 4 },
              { item: "pao", price: 9 }, // repeated, dropped
            ],
            work: "cooking",
            likes: ["mel", "flores"],
            dislikes: ["cebola"],
            goal: "Juntar 30 moedas para um telhado novo.",
          }),
          mystery: () => ({
            title: "O sino sumiu",
            intro: "O sino da taverna sumiu.",
            culpritSlot: 2,
            motive: "Wanted the bell.",
            solution: "Npc2 escondeu o sino.",
            alibi: "I was fishing.",
            evidence: {
              item: "Botão de latão",
              description: "Um botão do casaco do Npc2.",
              holderSlot: 3,
            },
            clues: [
              { slot: 1, clue: "I saw Npc2 near the tavern." },
              { slot: 3, clue: "Npc2 was not fishing." },
            ],
          }),
          diary_entry: () => ({ entry: "A summary of old memories." }),
          goal: () => ({ goal: "Ensinar alguém a pescar." }),
          fight_lines: () => ({
            taunts: ["Vem!", "Só isso?", "Agora vai!"],
            lose: "Chega, você venceu.",
            win: "Ha! Eu avisei.",
            memoryWin: "I beat the traveler in a fight.",
            memoryLose: "The traveler beat me in a fight.",
          }),
          visitor: () => ({
            name: "Zoltan",
            occupation: "traveling spice merchant",
            title: "mercador de especiarias",
            personality: ["cheerful"],
            story: "Comes from the south.",
            wares: [{ item: "pimenta", price: 12 }],
            news: "Um mercador de especiarias chegou ao píer!",
          }),
          world_event: () => ({
            headline: "Um mercador chegou!",
            fact: "A merchant arrived at the pier.",
            market: { villager: "", change: "none", reason: "" },
          }),
          npc_conversation: () => conversation(),
          npc_response: () => ({ content: "I'm fine." }),
          chat_summary: () => ({
            fact: "The traveler is looking for a sword.",
            testimony: "",
          }),
          festival: () => ({
            title: "Feira do peixe",
            description: "Todos vendem peixe no jardim.",
            fact: "There is a fish fair in the garden.",
          }),
        }[name]();
      return {
        content,
        toolCalls: toolCalls[name] ?? [],
        assistantMessage: { role: "assistant", content: "x" },
      };
    },
  };
};

export const PLACES = [
  { id: "dock", name: "Píer", description: "A wooden pier." },
  { id: "tavern", name: "Taverna", description: "The tavern." },
];

export const toolCall = (name, args) => ({ id: name, name, arguments: args });

// Session connected to a fake client that records what it receives
export const recordingSession = async (llm, options) => {
  const session = await createSession(llm, options);
  const sent = [];
  session.attach((type, payload) => sent.push({ type, ...payload }));
  return { session, sent };
};

// Moves the game clock of the session to `minutes` (total game minutes)
export const setTime = (session, minutes) => {
  session.clock.now = () => 0;
  session.clock.startedAt = 0;
  session.clock.pausedAt = null;
  session.clock.baseMinutes = minutes;
};

// LLM whose NPC chat answers call these tools, one list per model call (a
// failed action makes the NPC answer again: one more call)
export const toolLlm = (base, toolCallsPerCall) => {
  let calls = 0;
  return {
    ...base,
    complete: async (options) => {
      if (options.schema?.name !== "npc_response") {
        return base.complete(options);
      }
      const toolCalls = toolCallsPerCall[calls++] ?? [];
      return {
        content: { content: "Ok.", reputationChange: 0, reputationReason: "" },
        toolCalls,
        assistantMessage: { role: "assistant", content: "Ok." },
      };
    },
  };
};

export const createSession = async (
  llm = fakeLlm(),
  { quantity = 2, places = PLACES } = {},
) => {
  const session = new GameSession({
    id: "test",
    llm,
    store: new SessionStore(fakeDatabase(), "test"),
    maxMemoryMessages: 40,
    maxFacts: 3,
  });
  await session.createNpcs({ quantity, language: "Portuguese", places });
  return session;
};
