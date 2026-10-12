// The mysteries of the village, one after the other: when one ends, a new
// one shows up a few game hours later. Solving them gives the player a title
// that the villagers know. When the culprit confesses, the player chooses to
// tell the village or to keep the secret (which may leak later).

import { Mystery } from "./Mystery.js";

// Game minutes between the end of a mystery and the next one
export const NEXT_MYSTERY_DELAY_MINUTES = 180;
// A covered-up secret may leak this long after the decision
export const LEAK_DELAY_MINUTES = 12 * 60;
const LEAK_CHANCE = 0.5;
// Villagers that like the player go tell them their clue
const CLUE_SHARING_REPUTATION = 3;
// ...if they didn't talk in the last game minutes
const CLUE_SHARING_QUIET_MINUTES = 60;
const CLUE_CALLOUT = "Ei, viajante! Preciso te contar uma coisa.";

const TITLES = [
  { solved: 3, title: "Detetive da vila" },
  { solved: 2, title: "Investigador" },
  { solved: 1, title: "Curioso da vila" },
];

/** Title of a player that solved `solved` mysteries (null for none). */
export const titleFor = (solved) =>
  TITLES.find((entry) => solved >= entry.solved)?.title ?? null;

export class Investigation {
  /** @param {import("./GameSession.js").GameSession} session */
  constructor(session) {
    this.session = session;
    this.mystery = null;
    this.solved = 0;
    this.past = []; // { title, solved, covered, culprit }
    this.nextMysteryAt = null;
    this.leak = null; // { at, willLeak } of the covered-up mystery
    this.covered = null; // The last mystery the player covered up
    this.isGenerating = false;
  }

  get title() {
    return titleFor(this.solved);
  }

  /** What the villagers know about the player as an investigator. */
  get reputationAsInvestigator() {
    return this.title ? { title: this.title, solved: this.solved } : null;
  }

  /** Creates a new mystery. @returns {Promise<Mystery|null>} */
  async start({ announce = false } = {}) {
    const { session } = this;

    if (this.isGenerating) {
      return null;
    }

    this.isGenerating = true;

    try {
      this.mystery = await Mystery.generate({
        llm: session.llm,
        context: session.worldContext,
        cast: session.cast,
        language: session.language,
        previous: this.past.map((mystery) => mystery.title),
      });
    } catch (error) {
      console.error(`[session ${session.id}] Mystery failed:`, error);
    } finally {
      this.isGenerating = false;
    }

    this.nextMysteryAt = null;

    if (this.mystery) {
      session.addNews(`${this.mystery.title}: ${this.mystery.intro}`);

      if (announce) {
        session.notify(
          `Novo mistério: ${this.mystery.title}. ${this.mystery.intro}`,
          "mystery",
        );
        session.emitPlayerState();
      }
    }

    return this.mystery;
  }

  /** Next mystery, leaks and villagers sharing clues. */
  async update(now) {
    if (this.leak && now >= this.leak.at) {
      const { willLeak } = this.leak;
      this.leak = null;
      if (willLeak) await this.leakSecret();
    }

    if (
      this.nextMysteryAt !== null &&
      now >= this.nextMysteryAt &&
      !this.mystery?.isUnresolved
    ) {
      await this.start({ announce: true });
    }

    this.shareClues(now);
  }

  /** The player accuses an NPC of being the culprit. */
  async accuse(npcId) {
    const { session, mystery } = this;

    if (!mystery) {
      throw new Error("There is no mystery in this village");
    }

    const accused = session.getNpc(npcId);
    const withEvidence =
      mystery.evidenceFound && session.player.hasItem(mystery.evidence.item);
    const result = mystery.accuse(npcId, { withEvidence });

    if (result.correct) {
      await this.close();
    } else {
      session.player.changeReputation(npcId, -3);
      session.changeMood(npcId, -2);
      await session.remember(
        npcId,
        `[about the traveler] The traveler accused me of "${mystery.title}", but it wasn't me.`,
      );

      if (result.status === "failed") {
        await this.close();
      } else if (result.evidenceMismatch) {
        session.notify(
          `A prova não combina com ${accused.data.name}. Você não perdeu tentativas.`,
          "bad",
        );
      } else {
        session.notify(
          `${accused.data.name} não é o culpado. Resta ${result.attemptsLeft} tentativa.`,
          "bad",
        );
      }
    }

    session.emitPlayerState();
    return { ...result, accused: accused.data.name };
  }

  /**
   * The NPC confessed in the chat (`confess` tool): only the player knows,
   * and decides what to do in the journal.
   * @returns {Promise<string|null>} Why the confession failed, if it did.
   */
  async confess(npcId) {
    const { session } = this;

    if (!this.mystery?.confess(npcId)) {
      return "You have nothing to confess. Don't use this function again.";
    }

    session.notify(
      `${session.nameOf(npcId)} confessou só para você! Decida no diário (J): contar à vila ou guardar o segredo.`,
      "mystery",
    );
    session.emitPlayerState();
    return null;
  }

  /** The player decided what to do with a confession. */
  async decide(decision) {
    const { session, mystery } = this;

    if (!["expose", "protect"].includes(decision)) {
      throw new Error(`Unknown decision: ${decision}`);
    }

    mystery.decide(decision);

    if (decision === "expose") {
      await this.close();
    } else {
      await this.cover();
    }

    session.emitPlayerState();
    return { status: mystery.status };
  }

  /** The player keeps the culprit's secret: a grateful ally, a risky lie. */
  async cover() {
    const { session, mystery } = this;
    const culprit = session.nameOf(mystery.culpritId);

    session.player.changeReputation(mystery.culpritId, 4);
    session.changeMood(mystery.culpritId, 2);
    session.player.addItem("moedas", 10);
    await session.remember(
      mystery.culpritId,
      `[about the traveler] The traveler found out I was responsible for "${mystery.title}" and kept my secret. I owe them a lot.`,
    );
    session.notify(
      `Você guardou o segredo de ${culprit}. Em troca, ganhou 10 moedas e uma aliada(o). Mas segredos podem vazar...`,
      "mystery",
    );

    this.past.push({
      title: mystery.title,
      solved: false,
      covered: true,
      culprit,
    });
    this.covered = mystery;
    this.leak = {
      at: session.clock.totalMinutes + LEAK_DELAY_MINUTES,
      willLeak: Math.random() < LEAK_CHANCE,
    };
    this.nextMysteryAt =
      session.clock.totalMinutes + NEXT_MYSTERY_DELAY_MINUTES;
  }

  /** The village found out the player covered for the culprit. */
  async leakSecret() {
    const { session, covered: mystery } = this;

    if (!mystery || mystery.status !== "covered") return;

    const culprit = session.nameOf(mystery.culpritId);
    mystery.leaked = true;
    mystery.culpritName = culprit;

    for (const npcId of session.npcs.keys()) {
      if (npcId === mystery.culpritId || !session.isVillager(npcId)) continue;
      session.player.changeReputation(
        npcId,
        npcId === mystery.victimId ? -3 : -1,
      );
    }

    session.notify(
      `A verdade vazou: todos sabem que você acobertou ${culprit} em "${mystery.title}"`,
      "bad",
    );
    session.addNews(
      `Descobriram que o viajante acobertou ${culprit}: ${mystery.solution}`,
    );
    await session.rememberAll(
      `[village news] The traveler knew that ${culprit} did "${mystery.title}" and kept it secret: ${mystery.solution}`,
    );
    session.emitPlayerState();
  }

  /** Ends the current mystery (solved or not) and schedules the next one. */
  async close() {
    const { session, mystery } = this;
    const culprit = session.nameOf(mystery.culpritId);
    const solved = mystery.status === "solved";

    if (solved) {
      const previousTitle = this.title;
      this.solved++;

      session.npcs.forEach((_, id) => session.player.changeReputation(id, 1));
      session.changeMood(mystery.culpritId, -3);
      session.notify(
        mystery.confessed
          ? `Você contou à vila: ${culprit} confessou "${mystery.title}"`
          : `Você resolveu o mistério: ${mystery.title}!`,
        "good",
      );
      session.addNews(`Mistério resolvido: ${mystery.solution}`);

      if (this.title !== previousTitle) {
        session.notify(`Agora a vila te chama de "${this.title}"`, "good");
        session.addNews(`O viajante agora é conhecido como "${this.title}"`);
      }

      if (mystery.confessed) {
        await session.remember(
          mystery.culpritId,
          `[about the traveler] I confessed to the traveler about "${mystery.title}" and they told the whole village.`,
        );
      }

      await session.rememberAll(
        `[village news] The traveler found out the truth about "${mystery.title}": ${culprit} did it.${mystery.confessed ? " They confessed." : ""}`,
      );
    } else {
      session.notify(`O mistério ficou sem solução: ${mystery.title}`, "bad");
      session.addNews(`A verdade apareceu: ${mystery.solution}`);
      await session.rememberAll(
        `[village news] The truth about "${mystery.title}" came out: ${mystery.solution}`,
      );
    }

    this.past.push({ title: mystery.title, solved, covered: false, culprit });
    this.nextMysteryAt =
      session.clock.totalMinutes + NEXT_MYSTERY_DELAY_MINUTES;
  }

  /**
   * Called when an NPC gives an item to the player: the evidence of the
   * mystery keeps its exact name, so the culprit recognizes it.
   */
  onItemGiven(npcId, action) {
    if (!this.mystery?.isEvidence(npcId, action.item)) {
      return;
    }

    action.item = this.mystery.evidence.item;
    this.mystery.evidenceFound = true;
    this.session.notify(
      `Você conseguiu uma prova: ${action.item}. Veja no diário (J).`,
      "mystery",
    );
  }

  addTestimony(npcId, text) {
    if (this.mystery?.isOpen && text) {
      this.mystery.addTestimony(
        npcId,
        text,
        `Dia ${this.session.clock.day}, ${this.session.clock.format()}`,
      );
    }
  }

  /** Villagers that like the player go tell them what they know. */
  shareClues(now) {
    const { session, mystery } = this;

    if (!mystery?.isOpen) {
      return;
    }

    for (const npcId of session.npcs.keys()) {
      const lastChat = session.lastChatAt.get(npcId) ?? -Infinity;

      if (
        !mystery.clues.has(npcId) ||
        session.player.getReputation(npcId) < CLUE_SHARING_REPUTATION ||
        now - lastChat < CLUE_SHARING_QUIET_MINUTES
      ) {
        continue;
      }

      const shared = session.seekPlayer(npcId, {
        reason: `you like the traveler and want to tell them what you know about "${mystery.title}": ${mystery.clues.get(npcId)}`,
        callout: CLUE_CALLOUT,
        key: `clue:${mystery.title}:${npcId}`,
      });

      if (shared) {
        return;
      }
    }
  }

  toJSON({ nameOf }) {
    return {
      mystery: this.mystery?.toJSON({ nameOf }) ?? null,
      title: this.title,
      solvedMysteries: this.solved,
      pastMysteries: this.past,
    };
  }

  toState() {
    return {
      mystery: this.mystery?.toState() ?? null,
      solved: this.solved,
      past: this.past,
      nextMysteryAt: this.nextMysteryAt,
      leak: this.leak,
      covered: this.covered?.toState() ?? null,
    };
  }

  restoreState(state) {
    this.mystery = state.mystery ? Mystery.fromState(state.mystery) : null;
    this.solved = state.solved;
    this.past = state.past;
    this.nextMysteryAt = state.nextMysteryAt;
    this.leak = state.leak;
    this.covered =
      state.covered && state.covered.title === this.mystery?.title
        ? this.mystery
        : state.covered
          ? Mystery.fromState(state.covered)
          : null;
  }
}
