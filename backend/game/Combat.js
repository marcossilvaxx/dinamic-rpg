// Fights between the player and the NPCs. The fight itself happens in the
// frontend (real time); the server knows which fights are going on and
// applies what they change in the village: memories, reputation (of the
// opponent and of who saw it), injuries, fines, news.
//
// Kinds of fight:
// - "sparring": a training fight the NPC agreed to. The loser gives up, no
//   one gets hurt.
// - "duel": a fight both agreed to (e.g. a rival's challenge). The loser is
//   knocked out, but nobody blames anyone.
// - "fight": a real fight, started by the player (hitting someone) or by
//   the NPC (provoked, cornered). The loser is knocked out: a villager wakes
//   up at home and stays hurt for some hours; the player wakes up in the
//   tavern and loses some coins. The witnesses judge who started it, and the
//   guard of the village may come and fine the player.

import { fightPrompt, fightSchema } from "../prompts/fight.js";
import * as protocol from "../protocol.js";
import { isGuard, reactionToAttack } from "./combatRules.js";
import { COINS } from "./PlayerState.js";

// How long a knocked out villager stays hurt (game minutes)
export const INJURY_MINUTES = 8 * 60;
// Part of the coins the player loses when knocked out
const COINS_LOST_FRACTION = 0.3;
const GUARD_FINE = 10;
// NPCs don't train with someone they dislike
const MIN_SPARRING_REPUTATION = 0;
// ...and don't attack someone they like
const MAX_ATTACK_REPUTATION = 4;
const ATTACKED_REPUTATION = -3;
const WITNESS_ASSAULT_REPUTATION = -2;

const TITLES = [
  { defenses: 3, title: "Herói da vila" },
  { defenses: 1, title: "Protetor da vila" },
];

/** Title of a player that defended the village `defenses` times. */
export const defenderTitleFor = (defenses) =>
  TITLES.find((entry) => defenses >= entry.defenses)?.title ?? null;

const CALLOUTS = {
  fightBack: "Você vai se arrepender disso!",
  flee: "Socorro! Fui atacado!",
  guard: "Parem já com isso!",
};

export class Combat {
  /** @param {import("./GameSession.js").GameSession} session */
  constructor(session) {
    this.session = session;
    // Fights going on: npcId -> { kind, aggressor, situation, memories }
    this.fights = new Map();
    // A guard was called after the player hit someone: { guardId, victimId }
    this.guardCall = null;
    this.injuries = new Map(); // npcId -> game minute they heal
    this.record = { wins: 0, losses: 0, defenses: 0 };
  }

  get title() {
    return defenderTitleFor(this.record.defenses);
  }

  isInjured(npcId) {
    return (
      (this.injuries.get(npcId) ?? -Infinity) > this.session.clock.totalMinutes
    );
  }

  /** Registers a fight and asks the model for the lines of the NPC. */
  register(npcId, { kind, aggressor = null, situation }) {
    this.fights.set(npcId, { kind, aggressor, situation, memories: null });
    this.session.runInBackground(this.generateLines(npcId, situation));
  }

  /** Taunts, last words and memories of the NPC (one model call). */
  async generateLines(npcId, situation) {
    const { session } = this;
    const npc = session.npcs.get(npcId);
    if (!npc) return;

    const { content } = await session.llm.complete({
      messages: [
        {
          role: "user",
          content: fightPrompt({
            npc: npc.data,
            situation,
            reputation: session.player.getReputation(npcId),
            language: session.language,
          }),
        },
      ],
      schema: fightSchema,
      temperature: 1,
    });

    const fight = this.fights.get(npcId);
    if (fight) {
      fight.memories = { win: content.memoryWin, lose: content.memoryLose };
    }

    session.emit(protocol.FIGHT_LINES, {
      agentId: npcId,
      data: {
        taunts: content.taunts.slice(0, 3),
        lose: content.lose,
        win: content.win,
      },
    });
  }

  // ---------------------------------------------------------------------------
  // How fights start

  /** `startSparring` tool. @returns {string|null} Why it failed, if it did. */
  startSparring(npcId) {
    const { session } = this;

    if (this.isInjured(npcId)) {
      return "You are hurt and can't fight now. Tell the traveler.";
    }

    if (session.player.getReputation(npcId) < MIN_SPARRING_REPUTATION) {
      return "You don't want to train with someone you dislike. Refuse.";
    }

    this.register(npcId, { kind: "sparring", situation: "sparring" });
    return null;
  }

  /**
   * `startFight` tool: the NPC challenges the player to a duel, or attacks
   * them (provoked, insulted, cornered...).
   * @returns {string|null} Why it failed, if it did.
   */
  startFight(npcId, kind = "fight") {
    const { session } = this;

    if (this.isInjured(npcId)) {
      return "You are hurt and can't fight now.";
    }

    if (
      kind === "fight" &&
      session.player.getReputation(npcId) > MAX_ATTACK_REPUTATION
    ) {
      return "You like the traveler too much to attack them. Just tell them how you feel.";
    }

    if (session.getNpc(npcId).data.visitor) {
      return "You are only visiting the village: you don't want trouble here.";
    }

    this.register(npcId, {
      kind: kind === "duel" ? "duel" : "fight",
      aggressor: "npc",
      situation: kind === "duel" ? "duel" : "provoked",
    });
    return null;
  }

  /**
   * The player hit an NPC out of a fight. It fights back or runs away (and
   * the guard of the village may come).
   * @returns {Promise<{reaction: "fight"|"flee", callout: string,
   *   guardId: number|null, guardCallout: string|null}>}
   */
  async playerAttacked(npcId) {
    const { session } = this;
    const npc = session.getNpc(npcId);

    if (this.fights.has(npcId)) {
      return {
        reaction: "fight",
        callout: "",
        guardId: null,
        guardCallout: null,
      };
    }

    const reaction = reactionToAttack(npc.data, {
      reputation: session.player.getReputation(npcId),
      bond: session.bonds.get(npcId),
      injured: this.isInjured(npcId),
    });

    session.player.changeReputation(npcId, ATTACKED_REPUTATION);
    session.changeMood(npcId, -2);
    session.notify(
      `Você atacou ${npc.data.name} (${ATTACKED_REPUTATION})`,
      "bad",
    );
    await session.remember(
      npcId,
      "[about the traveler] The traveler hit me for no reason!",
    );

    if (reaction === "fight") {
      this.register(npcId, {
        kind: "fight",
        aggressor: "player",
        situation: "attacked",
      });
    }

    const guard = this.findGuard(npcId);
    this.guardCall = guard ? { guardId: guard.id, victimId: npcId } : null;
    session.emitPlayerState();

    return {
      reaction,
      callout: reaction === "fight" ? CALLOUTS.fightBack : CALLOUTS.flee,
      guardId: guard?.id ?? null,
      guardCallout: guard ? CALLOUTS.guard : null,
    };
  }

  /** The guard of the village (not hurt, not the victim), if there is one. */
  findGuard(exceptId) {
    const { session } = this;

    return (
      [...session.npcs.values()].find(
        (npc) =>
          npc.id !== exceptId &&
          session.isVillager(npc.id) &&
          isGuard(npc.data) &&
          !this.isInjured(npc.id),
      ) ?? null
    );
  }

  /** The guard reached the player: a fine (and the fight is over). */
  async guardArrived(guardId) {
    const { session } = this;
    const call = this.guardCall;

    if (!call || call.guardId !== guardId) {
      throw new Error("The guard was not called");
    }

    this.guardCall = null;
    const guard = session.getNpc(guardId);
    const victim = session.nameOf(call.victimId);
    const coins =
      session.player.items.find((item) => item.name === COINS)?.quantity ?? 0;
    const fine = Math.min(coins, GUARD_FINE);

    if (fine) session.player.removeItem(COINS, fine);
    session.player.changeReputation(guardId, -1);
    session.notify(
      `${guard.data.name} separou a briga${fine ? ` e te multou em ${fine} moedas` : ""} (-1)`,
      "bad",
    );
    session.addNews(
      `${guard.data.name} teve que separar o viajante e ${victim}`,
    );
    await session.remember(
      guardId,
      `[about the traveler] I had to stop the traveler, who attacked ${victim}. I fined them ${fine} coins.`,
    );
    session.emitPlayerState();
  }

  // ---------------------------------------------------------------------------
  // How fights end

  /**
   * The frontend reports how the fight ended.
   * @param {number} npcId
   * @param {"player"|"npc"|"none"} winner "none": stopped (the player ran
   *   away or the guard came).
   * @param {object} [options]
   * @param {number[]} [options.witnesses] NPCs that saw the fight.
   */
  async end(npcId, winner, { witnesses = [] } = {}) {
    const { session } = this;
    const fight = this.fights.get(npcId);

    if (!fight) {
      throw new Error(`There is no fight with NPC ${npcId}`);
    }

    if (!["player", "npc", "none"].includes(winner)) {
      throw new Error(`Invalid winner: ${winner}`);
    }

    this.fights.delete(npcId);
    const npc = session.getNpc(npcId);
    const name = npc.data.name;
    const seenBy = [...new Set(witnesses)].filter(
      (id) => id !== npcId && session.npcs.has(id),
    );

    if (winner === "player") this.record.wins++;
    if (winner === "npc") this.record.losses++;

    if (fight.kind === "sparring") {
      await this.endSparring(npcId, name, winner, fight);
    } else {
      if (winner === "player") await this.knockOutNpc(npcId, name, fight);
      if (winner === "npc") await this.knockOutPlayer(npcId, fight);
      await this.judge(npc, fight, winner, seenBy);
    }

    session.emitPlayerState();
  }

  async endSparring(npcId, name, winner, fight) {
    const { session } = this;

    if (winner === "none") {
      session.notify(`Você abandonou o treino com ${name}`, "bad");
      await session.remember(
        npcId,
        "[about the traveler] The traveler walked away in the middle of our training.",
      );
      return;
    }

    // Training together brings people closer
    session.player.changeReputation(npcId, 1);
    session.changeMood(npcId, 1);
    session.notify(
      winner === "player"
        ? `Você venceu o treino com ${name}! (+1)`
        : `${name} venceu o treino. Fica para a próxima! (+1)`,
      winner === "player" ? "good" : "info",
    );
    await session.remember(
      npcId,
      `[about the traveler] ${this.memoryOf(fight, winner) ?? `I trained fighting with the traveler and ${winner === "player" ? "they beat me" : "I won"}.`}`,
    );
  }

  memoryOf(fight, winner) {
    if (!fight.memories || winner === "none") return null;
    return winner === "player" ? fight.memories.lose : fight.memories.win;
  }

  async knockOutNpc(npcId, name, fight) {
    const { session } = this;
    const healsAt = session.clock.totalMinutes + INJURY_MINUTES;

    this.injuries.set(npcId, healsAt);
    session.changeMood(npcId, -3);
    session.emit(protocol.NPC_UPDATED, {
      agentId: npcId,
      data: { injured: true },
    });
    session.notify(`${name} desmaiou e vai passar o dia machucado`, "bad");
    await session.remember(
      npcId,
      `[about the traveler] ${this.memoryOf(fight, "player") ?? "The traveler beat me in a fight and I was knocked out."} I'm hurt.`,
    );
  }

  async knockOutPlayer(npcId, fight) {
    const { session } = this;
    const lost = this.robPlayer();

    session.notify(
      `Você desmaiou e acordou na taverna${lost ? `, sem ${lost} moedas` : ""}`,
      "bad",
    );
    await session.remember(
      npcId,
      `[about the traveler] ${this.memoryOf(fight, "npc") ?? "I knocked out the traveler in a fight."}`,
    );
  }

  /** The player lost a fight: they lose part of their coins. */
  robPlayer() {
    const { session } = this;
    const coins =
      session.player.items.find((item) => item.name === COINS)?.quantity ?? 0;
    const lost = Math.floor(coins * COINS_LOST_FRACTION);

    if (lost > 0) {
      session.player.removeItem(COINS, lost);
    }

    return lost;
  }

  /** What the witnesses think of the fight, and the news about it. */
  async judge(npc, fight, winner, witnesses) {
    const { session } = this;
    const name = npc.data.name;
    const result =
      winner === "player"
        ? `${name} desmaiou`
        : winner === "npc"
          ? "o viajante desmaiou"
          : "ninguém venceu";

    if (fight.kind === "duel") {
      session.addNews(`O viajante e ${name} duelaram: ${result}`);
      for (const id of witnesses) {
        if (winner === "player") session.player.changeReputation(id, 1);
        await session.remember(
          id,
          `[seen] The traveler and ${name} fought a duel: ${winner === "player" ? "the traveler won" : winner === "npc" ? `${name} won` : "it was stopped"}.`,
        );
      }
      return;
    }

    const playerStarted = fight.aggressor === "player";

    if (witnesses.length) {
      session.addNews(
        playerStarted
          ? `O viajante atacou ${name} na frente de todos: ${result}`
          : `${name} atacou o viajante: ${result}`,
      );
    }

    for (const id of witnesses) {
      if (playerStarted) {
        session.player.changeReputation(id, WITNESS_ASSAULT_REPUTATION);
      } else if (winner === "player") {
        session.player.changeReputation(id, 1);
      }

      await session.remember(
        id,
        playerStarted
          ? `[seen] The traveler attacked ${name} for no reason.`
          : `[seen] ${name} attacked the traveler, who defended themselves.`,
      );
    }

    if (playerStarted && witnesses.length) {
      session.notify(
        `${witnesses.length} pessoa(s) viram você atacar ${name} (${WITNESS_ASSAULT_REPUTATION} com cada)`,
        "bad",
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Time

  /** Hurt villagers heal after some hours. */
  update(now) {
    for (const [npcId, healsAt] of this.injuries) {
      if (healsAt <= now) {
        this.injuries.delete(npcId);
        this.session.emit(protocol.NPC_UPDATED, {
          agentId: npcId,
          data: { injured: false },
        });
      }
    }
  }

  /** For the dialog prompt of the NPC. */
  describeFor(npcId) {
    return this.isInjured(npcId)
      ? "You are hurt from a fight: you are in pain, can't work and can't fight today."
      : null;
  }

  toJSON() {
    return { ...this.record, title: this.title };
  }

  toState() {
    return { injuries: [...this.injuries], record: this.record };
  }

  restoreState(state) {
    this.injuries = new Map(state.injuries);
    this.record = { defenses: 0, ...state.record };
  }
}
