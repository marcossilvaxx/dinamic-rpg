// Long-term ambitions of the villagers ("open a bakery", "make peace with
// the brother"), in 3 steps. Unlike the goals of the day (Goals.js), they
// only move with what happens in the story: conversations between NPCs and
// with the player (the model says when they helped), quests, gifts and the
// goals they achieve. Each step reached is news; the whole ambition changes
// the village (the villager builds something) and a new one begins.

import {
  ambitionsPrompt,
  ambitionsSchema,
  nextAmbitionPrompt,
  nextAmbitionSchema,
} from "../prompts/ambition.js";

const STEP_DONE = 100;
const MAX_LOG = 8;
// How much each thing makes the current step advance
export const AMBITION_PROGRESS = {
  small: 12,
  big: 30,
  quest: 25,
  gift: 10,
  goal: 30,
};

const firstName = (name) => name.trim().split(/\s+/)[0].toLowerCase();

const sanitize = ({ ambition, steps }) => ({
  text: ambition.trim().slice(0, 120),
  steps: steps
    .map((step) => step.trim().slice(0, 120))
    .filter(Boolean)
    .slice(0, 3),
  step: 0,
  progress: 0,
  log: [],
  achieved: [],
});

export class Ambitions {
  /** @param {import("./GameSession.js").GameSession} session */
  constructor(session) {
    this.session = session;
    this.ambitions = new Map(); // npcId -> { text, steps, step, progress, log, achieved }
    this.isCreating = false;
  }

  get(npcId) {
    return this.ambitions.get(npcId) ?? null;
  }

  /** One call to the model for every villager that has no ambition yet. */
  async createAll() {
    const { session } = this;
    const villagers = session.cast
      .map(({ slot }) => session.npcs.get(slot))
      .filter((npc) => npc && !this.ambitions.has(npc.id));

    if (this.isCreating || villagers.length === 0) return;
    this.isCreating = true;

    try {
      const { content } = await session.llm.complete({
        cachePrefix: session.worldContext,
        system: ambitionsPrompt({
          context: session.worldContext,
          villagers: villagers.map((npc) => npc.data),
          language: session.language,
        }),
        messages: [{ role: "user", content: "Create the ambitions." }],
        schema: ambitionsSchema,
      });

      for (const npc of villagers) {
        const entry = content.ambitions.find(
          (item) => firstName(item.name) === firstName(npc.data.name),
        );
        if (entry?.ambition && entry.steps?.length) {
          this.ambitions.set(npc.id, sanitize(entry));
        }
      }
      session.emitPlayerState();
      session.save();
    } finally {
      this.isCreating = false;
    }
  }

  /**
   * Something moved the ambition of the NPC: `amount` of the current step
   * and a note (in the language of the player) for the journal.
   */
  async advance(npcId, amount, note = "") {
    const { session } = this;
    const entry = this.ambitions.get(npcId);
    const npc = session.npcs.get(npcId);

    if (!entry || !npc || !amount || entry.step >= entry.steps.length) return;

    entry.progress = Math.min(STEP_DONE, entry.progress + amount);
    if (note) {
      entry.log = [
        ...entry.log,
        { when: `Dia ${session.clock.day}`, note: note.trim().slice(0, 160) },
      ].slice(-MAX_LOG);
    }

    if (entry.progress < STEP_DONE) {
      session.emitPlayerState();
      return;
    }

    const reached = entry.steps[entry.step];
    entry.step++;
    entry.progress = 0;

    if (entry.step < entry.steps.length) {
      session.addNews(`${npc.data.name} avançou no seu sonho: ${reached}`);
      session.notify(`${npc.data.name} deu um passo no seu sonho!`, "good");
      session.changeMood(npcId, 1);
      session.emitPlayerState();
      await session.rememberAll(
        `[village news] ${npc.data.name} took a step towards their ambition (${entry.text}): ${reached}.`,
      );
      return;
    }

    await this.achieve(npcId);
  }

  async achieve(npcId) {
    const { session } = this;
    const entry = this.ambitions.get(npcId);
    const npc = session.getNpc(npcId);
    const achieved = entry.text;

    entry.achieved = [...entry.achieved, achieved];
    session.changeMood(npcId, 4);
    session.addNews(`${npc.data.name} realizou a ambição da vida: ${achieved}`);
    session.notify(`${npc.data.name} realizou a ambição da vida!`, "good");
    const structure = session.villageMap.addStructureForGoal(npcId, achieved);
    if (structure) {
      session.notify(`Novidade na vila: ${structure.label}`, "good");
    }
    session.emitPlayerState();
    session.emitWorldState();
    await session.rememberAll(
      `[village news] ${npc.data.name} achieved the ambition of their life: ${achieved}. Everybody talks about it.`,
    );

    const { content } = await session.llm.complete({
      cachePrefix: session.worldContext,
      system: nextAmbitionPrompt({
        context: session.worldContext,
        npc: npc.data,
        achieved,
        language: session.language,
      }),
      messages: [{ role: "user", content: "Create the next ambition." }],
      schema: nextAmbitionSchema,
    });
    if (content.ambition && content.steps?.length) {
      this.ambitions.set(npcId, {
        ...sanitize(content),
        achieved: entry.achieved,
      });
      session.emitPlayerState();
    }
  }

  /** The ambition, for the prompts (in English around it). */
  describeFor(npcId) {
    const entry = this.ambitions.get(npcId);
    if (!entry || entry.step >= entry.steps.length) return null;
    return `${entry.text} (now working on step ${entry.step + 1} of ${entry.steps.length}: "${entry.steps[entry.step]}", ${entry.progress}% done)`;
  }

  /** What the journal shows (only of people the player met). */
  toJSON() {
    return [...this.ambitions]
      .filter(([npcId]) => this.session.player.met.has(npcId))
      .map(([npcId, { text, steps, step, progress, log, achieved }]) => ({
        npcId,
        text,
        steps,
        step,
        progress,
        log: log.slice(-3),
        achieved: achieved.length,
      }));
  }

  toState() {
    return { ambitions: [...this.ambitions] };
  }

  restoreState(state) {
    this.ambitions = new Map(state.ambitions);
  }
}
