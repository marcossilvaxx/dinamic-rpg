// The mystery of the village: one villager is the culprit, another one the
// victim, the others know clues and one of them keeps a piece of evidence.
// The player solves it by accusing someone from the journal, or by making the
// culprit confess; after a confession the player decides whether to tell the
// village or to keep the secret.

import { mysteryPrompt, mysterySchema } from "../prompts/mystery.js";
import { itemKey } from "./PlayerState.js";

export const MIN_VILLAGERS_FOR_MYSTERY = 3;
export const MAX_ACCUSATIONS = 2;
// What the player heard from each villager (shown in the journal)
const MAX_TESTIMONIES_PER_NPC = 2;

const randomOf = (items) => items[Math.floor(Math.random() * items.length)];

export class Mystery {
  constructor({
    title,
    intro,
    culpritId,
    victimId = null,
    motive,
    solution,
    alibi,
    clues,
    evidence = null,
  }) {
    this.title = title;
    this.intro = intro;
    this.culpritId = culpritId;
    this.victimId = victimId;
    this.motive = motive;
    this.solution = solution;
    this.alibi = alibi;
    this.clues = clues; // Map npcId -> clue
    // { item, description, holderId } kept by a villager until given away
    this.evidence = evidence;
    this.evidenceFound = false;
    this.testimonies = []; // { npcId, text, time }
    // open -> confessed (the player decides) -> solved | covered; or failed
    this.status = "open";
    this.confessed = false;
    this.leaked = false; // The village found out the player covered it
    this.attempts = 0;
  }

  /**
   * @param {object} options
   * @param {string[]} [options.previous] Titles of the previous mysteries.
   */
  static async generate({ llm, context, cast, language, previous = [] }) {
    if (cast.length < MIN_VILLAGERS_FOR_MYSTERY) {
      return null;
    }

    const { content } = await llm.complete({
      cachePrefix: context,
      system: mysteryPrompt({ context, villagers: cast, language, previous }),
      messages: [{ role: "user", content: "Create the mystery." }],
      schema: mysterySchema,
      temperature: 1,
    });

    const slots = cast.map((villager) => villager.slot);
    const culpritId = slots.includes(content.culpritSlot)
      ? content.culpritSlot
      : randomOf(slots);
    const others = slots.filter((slot) => slot !== culpritId);
    const victimId = others.includes(content.victimSlot)
      ? content.victimSlot
      : null;

    const clues = new Map();
    for (const slot of others) {
      const clue = content.clues.find((candidate) => candidate.slot === slot);
      clues.set(
        slot,
        clue?.clue ?? "You didn't notice anything unusual about it.",
      );
    }

    const evidence = content.evidence?.item?.trim()
      ? {
          item: content.evidence.item.trim(),
          description: content.evidence.description.trim(),
          holderId: others.includes(content.evidence.holderSlot)
            ? content.evidence.holderSlot
            : randomOf(others),
        }
      : null;

    return new Mystery({ ...content, culpritId, victimId, clues, evidence });
  }

  get isOpen() {
    return this.status === "open";
  }

  /** Not solved yet: open, or confessed and waiting for the decision. */
  get isUnresolved() {
    return this.status === "open" || this.status === "confessed";
  }

  /**
   * @param {number} npcId
   * @param {object} [options]
   * @param {boolean} [options.withEvidence] The player carries the evidence:
   *   a wrong accusation doesn't cost an attempt, since the evidence clearly
   *   doesn't match the accused.
   * @returns {{correct: boolean, status: string, attemptsLeft: number,
   *   evidenceMismatch: boolean}}
   */
  accuse(npcId, { withEvidence = false } = {}) {
    if (!this.isUnresolved) {
      throw new Error("The mystery is already closed");
    }

    const correct = npcId === this.culpritId;
    const evidenceMismatch = !correct && withEvidence;

    if (!evidenceMismatch) {
      this.attempts++;
    }

    if (correct) {
      this.status = "solved";
    } else if (this.attempts >= MAX_ACCUSATIONS) {
      this.status = "failed";
    }

    return {
      correct,
      status: this.status,
      attemptsLeft: MAX_ACCUSATIONS - this.attempts,
      evidenceMismatch,
    };
  }

  /**
   * The culprit confessed to the player, who now decides what to do.
   * @returns {boolean} Whether the confession is valid.
   */
  confess(npcId) {
    if (!this.isOpen || npcId !== this.culpritId) {
      return false;
    }

    this.status = "confessed";
    this.confessed = true;
    return true;
  }

  /** The player decided: "expose" (tell everyone) or "protect". */
  decide(decision) {
    if (this.status !== "confessed") {
      throw new Error("There is no confession to decide about");
    }

    this.status = decision === "protect" ? "covered" : "solved";
  }

  /** Whether `item`, given by `npcId`, is the evidence of the mystery. */
  isEvidence(npcId, item) {
    if (!this.evidence || this.evidenceFound || !this.isOpen) {
      return false;
    }

    const given = itemKey(item);
    const evidence = itemKey(this.evidence.item);

    return (
      npcId === this.evidence.holderId &&
      Boolean(given) &&
      (given.includes(evidence) || evidence.includes(given))
    );
  }

  addTestimony(npcId, text, time) {
    const own = this.testimonies.filter((t) => t.npcId === npcId);

    if (own.length >= MAX_TESTIMONIES_PER_NPC) {
      this.testimonies.splice(this.testimonies.indexOf(own[0]), 1);
    }

    this.testimonies.push({ npcId, text, time });
  }

  describeEvidenceFor(npcId) {
    const { evidence } = this;

    if (!evidence || npcId !== evidence.holderId) {
      return "";
    }

    return this.evidenceFound
      ? `\nYou already gave the "${evidence.item}" you found to the traveler.`
      : `\nYou found this and keep it with you: "${evidence.item}" (${evidence.description}). Give it to the traveler with giveItem (item "${evidence.item}", quantity 1) when they ask about the mystery and you trust them (opinion 2 or more), or when they help you. Otherwise keep it to yourself.`;
  }

  /** What the NPC knows about the mystery (for its dialog prompt). */
  describeFor(npcId) {
    const isCulprit = npcId === this.culpritId;

    if (this.status === "confessed") {
      return isCulprit
        ? `You confessed to the traveler that you are responsible for "${this.title}" (${this.solution}). Only the traveler knows. They are deciding whether to tell the village: beg them to keep your secret.`
        : `About "${this.title}": ${this.clues.get(npcId) ?? "you don't know anything about it."}`;
    }

    if (this.status === "covered") {
      if (isCulprit) {
        return `The traveler found out you were responsible for "${this.title}" and kept your secret. You are very grateful and owe them a lot.`;
      }
      return this.leaked
        ? `Everybody found out that the traveler knew the truth about "${this.title}" and covered for ${this.culpritName ?? "the culprit"}: ${this.solution}`
        : `The mystery "${this.title}" was never solved.`;
    }

    if (!this.isOpen) {
      return `The mystery "${this.title}" is over. What really happened: ${this.solution}`;
    }

    if (isCulprit) {
      const evidence = this.evidence
        ? `\nThere is a piece of evidence against you: "${this.evidence.item}". If the traveler carries it (see what the traveler carries) and shows it to you or confronts you with it, you can't deny it anymore.`
        : "";

      return `SECRET: you are responsible for "${this.title}". What you did: ${this.solution} Your motive: ${this.motive}
Never confess easily and never confess for money. When asked, tell your alibi: ${this.alibi}${evidence}
Only if the traveler confronts you with clear evidence (the object above, or several things others saw that contradict your alibi), get nervous and confess: call the function confess.`;
    }

    return `About "${this.title}": ${this.clues.get(npcId)}
Share it when the traveler asks about it or about strange things in the village (more easily if you like them).${this.describeEvidenceFor(npcId)}`;
  }

  /** Clue the NPC may gossip about with other NPCs (never the culprit's). */
  gossipFor(npcId) {
    return this.isUnresolved &&
      npcId !== this.culpritId &&
      this.clues.has(npcId)
      ? `[mystery: ${this.title}] ${this.clues.get(npcId)}`
      : null;
  }

  /**
   * Hint for the culprit when they think nobody else is listening: they may
   * slip up in a conversation the player overhears.
   */
  slipFor(npcId) {
    return this.isUnresolved && npcId === this.culpritId
      ? `[secret] ${this.solution} They are nervous someone finds out.`
      : null;
  }

  toJSON({ nameOf }) {
    const knowsCulprit = this.status !== "open";

    return {
      title: this.title,
      intro: this.intro,
      status: this.status,
      confessed: this.confessed,
      leaked: this.leaked,
      attemptsLeft: MAX_ACCUSATIONS - this.attempts,
      evidence:
        this.evidenceFound && this.evidence
          ? { item: this.evidence.item, description: this.evidence.description }
          : null,
      testimonies: this.testimonies.map(({ npcId, text, time }) => ({
        npcId,
        // 0: something the player found by themselves (footprints)
        name: npcId === 0 ? "Pegadas" : nameOf(npcId),
        text,
        time,
      })),
      ...(knowsCulprit
        ? {
            culprit: nameOf(this.culpritId),
            victim: this.victimId ? nameOf(this.victimId) : null,
            solution: this.solution,
          }
        : {}),
    };
  }

  toState() {
    return { ...this, clues: [...this.clues] };
  }

  static fromState(state) {
    const mystery = new Mystery({ ...state, clues: new Map(state.clues) });
    Object.assign(mystery, { ...state, clues: mystery.clues });
    return mystery;
  }
}
