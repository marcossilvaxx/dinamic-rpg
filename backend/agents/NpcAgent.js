import {
  chatSummaryPrompt,
  chatSummarySchema,
} from "../prompts/chatSummary.js";
import { npcDialogPrompt, npcDialogSchema } from "../prompts/npcDialog.js";
import { buildNpcTools, NPC_TOOL_RESULTS } from "./npcTools.js";

/**
 * Keeps only the last `max` messages, never starting in the middle of a turn
 * (an assistant tool call must stay together with its tool results).
 */
export function trimMemory(messages, max) {
  if (messages.length <= max) {
    return messages;
  }

  const recent = messages.slice(messages.length - max);
  const firstUserMessage = recent.findIndex((m) => m.role === "user");

  return firstUserMessage === -1 ? [] : recent.slice(firstUserMessage);
}

// Every tool call needs a matching tool message, otherwise the next request
// with this memory is rejected by the API.
const toolMessagesFor = (toolCalls, findAction) =>
  toolCalls.map((toolCall) => ({
    role: "tool",
    tool_call_id: toolCall.id,
    content: findAction(toolCall)?.result ?? "Unknown function.",
  }));

export class NpcAgent {
  constructor({
    id,
    data,
    llm,
    store,
    getWorldContext,
    getKnowledge = async () => ({ acquaintances: [], facts: [] }),
    // Places of the map and every villager (the same for all NPCs, used by
    // the tools): { places, everyone }
    getVillage = () => ({ places: [], everyone: [] }),
    // Time, needs, mood, opinion of the player, requests... (see npcDialog)
    getSituation = () => undefined,
    // Validates and applies the tool calls; returns each action with
    // { ok, result } (result is the tool message the model receives)
    resolveActions = async (actions) =>
      actions.map((action) => ({
        ...action,
        ok: action.action in NPC_TOOL_RESULTS,
        result: NPC_TOOL_RESULTS[action.action] ?? "Unknown function.",
      })),
    // Stores a fact the NPC remembers
    remember = (fact) => this.store.addFact(this.id, fact, maxFacts),
    // Mystery title and language for the chat summary (testimonies)
    getSummaryContext = () => ({ mysteryTitle: null, language: "English" }),
    maxMemoryMessages,
    maxFacts = 20,
    temperature = 0.7,
  }) {
    this.id = id;
    this.data = data;
    this.llm = llm;
    this.store = store;
    this.getWorldContext = getWorldContext;
    this.getKnowledge = getKnowledge;
    this.getVillage = getVillage;
    this.getSituation = getSituation;
    this.resolveActions = resolveActions;
    this.remember = remember;
    this.getSummaryContext = getSummaryContext;
    this.maxMemoryMessages = maxMemoryMessages;
    this.maxFacts = maxFacts;
    this.temperature = temperature;
    // Lines of the current chat with the player, summarized when it closes
    this.transcript = [];
    // Name of the NPC this one was talking with when the player interrupted
    this.interruptedConversationWith = null;
    // Chats are processed one at a time so concurrent messages don't
    // overwrite each other's memory.
    this.queue = Promise.resolve();
  }

  /**
   * @returns {Promise<{content: string|null, actions: {action: string, lastWords: string}[]}>}
   */
  /**
   * @param {string} message
   * @param {object} [options]
   * @param {(content: string) => void} [options.onDelta] Receives the answer
   *   while the model writes it.
   */
  chat(message, { onDelta } = {}) {
    return this.enqueue(() => this.processChat(message, { onDelta }));
  }

  /**
   * The NPC speaks first when the player opens the chat. `note` tells the
   * model why (it is stored in the memory as a narrator message).
   */
  greet(note, { onDelta } = {}) {
    return this.enqueue(() =>
      this.processChat(note, { isGreeting: true, onDelta }),
    );
  }

  /**
   * Summarizes the chat that just ended into a fact the NPC remembers (and
   * may tell other NPCs) and into what the NPC claimed about the mystery.
   * @returns {Promise<{fact: string|null, testimony: string|null}>}
   */
  summarizeChat() {
    return this.enqueue(() => this.processSummary());
  }

  enqueue(task) {
    const result = this.queue.then(task);
    this.queue = result.catch(() => {});
    return result;
  }

  async processSummary() {
    const transcript = this.transcript;
    this.transcript = [];

    if (!transcript.some((line) => line.startsWith("Traveler:"))) {
      return { fact: null, testimony: null };
    }

    const { content } = await this.llm.complete({
      messages: [
        {
          role: "user",
          content: chatSummaryPrompt({
            npc: this.data,
            transcript: transcript.join("\n"),
            ...this.getSummaryContext(),
          }),
        },
      ],
      schema: chatSummarySchema,
    });

    const fact = content.fact.trim() || null;
    const testimony = content.testimony?.trim() || null;

    if (fact) {
      await this.remember(`[talking with the traveler] ${fact}`);
    }

    return { fact, testimony };
  }

  async processChat(message, { isGreeting = false, onDelta } = {}) {
    const memory = await this.store.getMemory(this.id);
    const knowledge = await this.getKnowledge();
    const interruptedConversationWith = this.interruptedConversationWith;
    this.interruptedConversationWith = null;

    const userMessage = { role: "user", content: message };

    const { places, everyone } = this.getVillage();
    const context = this.getWorldContext();

    const request = {
      cachePrefix: context,
      cacheSystem: true,
      system: npcDialogPrompt({
        context,
        npc: this.data,
        places,
        hasTalkedBefore: memory.length > 0,
        knowledge,
        situation: await this.getSituation(),
        interruptedConversationWith,
      }),
      // Same tools for every NPC (tools go before the messages, so they are
      // part of the cached prefix)
      tools: buildNpcTools({ places, villagers: everyone }),
      schema: npcDialogSchema,
      temperature: this.temperature,
    };

    const response = await this.llm.complete({
      ...request,
      messages: [...memory, userMessage],
      onContent: onDelta,
    });

    const actions = await this.resolveActions(
      response.toolCalls.map(
        ({ id, name, arguments: { lastWords = "", ...args } }) => ({
          toolCallId: id,
          action: name,
          lastWords,
          ...args,
        }),
      ),
    );

    let messages = [
      ...memory,
      userMessage,
      response.assistantMessage,
      ...toolMessagesFor(response.toolCalls, (toolCall) =>
        actions.find((action) => action.toolCallId === toolCall.id),
      ),
    ];
    let content = response.content;

    // When an action fails (e.g. the traveler can't pay), the model gets the
    // reason and answers again, without calling functions this time, so the
    // NPC doesn't stay silent (nor tries something else on its own).
    if (actions.some((action) => !action.ok)) {
      const followUp = await this.llm.complete({
        ...request,
        messages,
        toolChoice: "none",
        onContent: onDelta,
      });

      messages = [
        ...messages,
        followUp.assistantMessage,
        ...toolMessagesFor(followUp.toolCalls, () => ({
          result: "Not done: just answer the traveler.",
        })),
      ];
      content ??= followUp.content;
    }

    await this.store.setMemory(
      this.id,
      trimMemory(messages, this.maxMemoryMessages),
    );

    const result = {
      content: content?.content ?? null,
      // A greeting is not something the player said
      reputationChange: isGreeting ? 0 : (content?.reputationChange ?? 0),
      reputationReason: isGreeting ? "" : (content?.reputationReason ?? ""),
      actions: actions
        .filter((action) => action.ok)
        // The model sometimes repeats its answer in the function call
        .map(({ toolCallId, ok, result, ...action }) =>
          action.lastWords.trim() === content?.content?.trim()
            ? { ...action, lastWords: "" }
            : action,
        ),
    };

    if (!isGreeting) {
      this.transcript.push(`Traveler: ${message}`);
    }
    [result.content, ...result.actions.map((a) => a.lastWords)]
      .filter(Boolean)
      .forEach((line) => this.transcript.push(`${this.data.name}: ${line}`));

    return result;
  }
}
