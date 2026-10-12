// Personal goals of the villagers ("save coins for a boat", "win the
// contest"...). Each one advances a little every day, more when the player
// helps the villager, and becomes news when it is achieved; then the villager
// gets a new goal.

import { goalPrompt, goalSchema } from "../prompts/goal.js";

export const GOAL_DAILY_PROGRESS = [5, 15];
export const GOAL_UPDATE_HOUR = 7;
const GOAL_DONE = 100;

const clampProgress = (value) => Math.min(GOAL_DONE, Math.max(0, value));

export class Goals {
  /** @param {import("./GameSession.js").GameSession} session */
  constructor(session) {
    this.session = session;
    this.goals = new Map(); // npcId -> { goal, progress, achieved: [] }
    this.lastUpdateDay = 1;
  }

  init(npcId, goal) {
    if (goal) {
      this.goals.set(npcId, { goal, progress: 0, achieved: [] });
    }
  }

  get(npcId) {
    return this.goals.get(npcId) ?? null;
  }

  /** Changes the progress of the NPC's goal; achieving it is news. */
  advance(npcId, delta) {
    const entry = this.goals.get(npcId);

    if (!entry || !delta) return;

    entry.progress = clampProgress(entry.progress + delta);

    if (entry.progress >= GOAL_DONE) {
      this.session.runInBackground(this.achieve(npcId));
    }
  }

  async achieve(npcId) {
    const { session } = this;
    const entry = this.goals.get(npcId);
    const npc = session.npcs.get(npcId);

    if (!entry || !npc || entry.progress < GOAL_DONE) return;

    const achieved = entry.goal;
    entry.achieved.push(achieved);
    entry.progress = 0;
    entry.goal = "";

    session.changeMood(npcId, 3);
    session.addNews(`${npc.data.name} realizou um sonho: ${achieved}`);
    session.notify(`${npc.data.name} realizou um sonho!`, "good");
    session.emitPlayerState();
    await session.rememberAll(
      `[village news] ${npc.data.name} achieved their goal: ${achieved}`,
    );

    const { content } = await session.llm.complete({
      cachePrefix: session.worldContext,
      system: goalPrompt({
        context: session.worldContext,
        npc: npc.data,
        achieved,
        language: session.language,
      }),
      messages: [{ role: "user", content: "Create the next goal." }],
      schema: goalSchema,
    });

    entry.goal = content.goal.trim();
  }

  /** Every morning each goal advances a little. */
  update(day, hour, random = Math.random) {
    if (hour < GOAL_UPDATE_HOUR || day <= this.lastUpdateDay) return;

    this.lastUpdateDay = day;
    const [min, max] = GOAL_DAILY_PROGRESS;

    for (const npcId of this.goals.keys()) {
      const mood = this.session.moods.get(npcId) ?? 0;
      this.advance(
        npcId,
        Math.round(min + random() * (max - min)) + Math.sign(mood) * 2,
      );
    }
  }

  /** The goal, for the prompts. */
  describeFor(npcId) {
    const entry = this.goals.get(npcId);

    if (!entry?.goal) return null;

    return `${entry.goal} (progress: ${entry.progress}%)`;
  }

  toJSON() {
    return [...this.goals]
      .filter(([, entry]) => entry.goal)
      .map(([npcId, { goal, progress, achieved }]) => ({
        npcId,
        goal,
        progress,
        achieved: achieved.length,
      }));
  }

  toState() {
    return { goals: [...this.goals], lastUpdateDay: this.lastUpdateDay };
  }

  restoreState(state) {
    this.goals = new Map(state.goals);
    this.lastUpdateDay = state.lastUpdateDay;
  }
}
