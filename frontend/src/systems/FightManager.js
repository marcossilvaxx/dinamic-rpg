import { sound } from "../audio/sound";
import { GameObject } from "../GameObject";
import { FightHud } from "../hud/FightHud";
import * as protocol from "../net/protocol";
import { gameSocket } from "../net/socket";
import { directionTowards } from "../utils/grid";
import { overlayLayer } from "../utils/overlay";
import {
  PLAYER_PROFILE,
  SURRENDER_FRACTION,
  bestHealingItem,
  combatProfile,
  directionFrom,
  distanceBetween,
  inAttackArc,
  playerProfile,
  rollDamage,
} from "./combat";
import { CombatState } from "./CombatState";

const FRAME_MS = 1000 / 60;
// The fight ends if the player runs this far away
const FLEE_DISTANCE = 160;
const DODGE_MS = 160;
const DODGE_DISTANCE = 26;
const DODGE_COOLDOWN_MS = 700;
const DODGE_INVULNERABLE_MS = 350;
const PLAYER_REGEN_PER_SECOND = 8;
const HEAL_COOLDOWN_MS = 1000;
const SLASH_MS = 140;
const FLOATING_TEXT_MS = 800;
const PROJECTILE_HIT_DISTANCE = 9;
const PROJECTILE_MAX_MS = 2500;
// A knocked out NPC lies on the ground for this long, then goes home
const KNOCKED_OUT_MS = 10000;
const HEAL_FRACTION = 0.4;
// Blocked by something on the way for this long: walks around it (A*)
const STUCK_MS = 250;
// Villagers this close see the fight (and judge it)
const WITNESS_DISTANCE = 110;
const WITNESS_CHECK_MS = 500;
const TAUNT_INTERVAL_MS = [3500, 6000];
// The player can't hit the same peaceful NPC again too soon
const ATTACK_REPORT_COOLDOWN_MS = 4000;
// The guard stops the fight when this close to the player
const GUARD_REACH_DISTANCE = 30;
const GUARD_TIMEOUT_MS = 30000;

const DEFAULT_LINES = {
  sparring: {
    lose: "Chega, chega! Você venceu.",
    win: "Ha! Fica para a próxima.",
  },
  duel: {
    lose: "Você venceu... desta vez.",
    win: "Eu disse que era mais forte!",
  },
  fight: { lose: "Ai... chega...", win: "Isso é para você aprender!" },
  bandits: { lose: "Argh!", win: "Passa as moedas!" },
};
const FLINCH_LINE = "Ei! O que é isso?";

const DIRECTION_VECTORS = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
};

const randomBetween = ([min, max]) => min + Math.random() * (max - min);

const centerOf = ({ position, width, height }) => ({
  x: position.x + width / 2,
  y: position.y + height / 2,
});

/**
 * Fights between the player and NPCs, in real time: the hero attacks
 * (Space), dodges (Shift) and heals (H); the opponents approach and attack
 * after a short warning ("!"), or keep their distance and shoot (rangers
 * and mages).
 *
 * Kinds: "sparring" (the loser gives up), "duel" and "fight" (the loser is
 * knocked out) against one villager, and "bandits" against one or more
 * bandits. Hitting a peaceful villager makes it fight back or run away (the
 * server decides) and may bring the guard. Villagers close to a fight are
 * witnesses. See systems/combat.js for the rules and backend game/Combat.js
 * for what the fights change in the village.
 */
export class FightManager extends GameObject {
  constructor({ hero, collision, npcs, onPlayerKnockedOut }) {
    super({});
    this.hero = hero;
    this.collision = collision;
    this.npcs = npcs; // Map id -> Npc
    this.onPlayerKnockedOut = onPlayerKnockedOut;
    this.hud = new FightHud();
    // { kind, opponents: Map(npc -> state), witnesses: Set(id), ... }
    this.fight = null;
    this.projectiles = [];
    this.effects = []; // Slashes and floating numbers
    this.lines = new Map(); // npcId -> { taunts, lose, win } (from the model)
    this.reportedAttacks = new Map(); // npcId -> time
    this.guard = null; // { npc, timeLeft } coming to stop the player
    this.time = 0;
    // Knocked out: no fights until the player wakes up (see recover)
    this.playerDown = false;

    hero.combat = new CombatState(hero, PLAYER_PROFILE);
    this.dodge = null; // { x, y, timeLeft }
    this.dodgeCooldown = 0;
    this.healCooldown = 0;
    this.held = {}; // Keys held in the last frame
    this.inventory = [];

    gameSocket.on(protocol.FIGHT_LINES, ({ agentId, data }) =>
      this.lines.set(agentId, data),
    );
    gameSocket.on(protocol.ITEM_USED, ({ data }) => this.onItemUsed(data));
  }

  get isFighting() {
    return Boolean(this.fight);
  }

  /** The inventory changed: weapons and armor change the hero. */
  setInventory(inventory = []) {
    this.inventory = inventory;
    const { combat } = this.hero;
    const fraction = combat.fraction;
    combat.profile = playerProfile(inventory);
    combat.maxHp = combat.profile.maxHp;
    combat.hp = Math.round(combat.maxHp * fraction);
  }

  // ---------------------------------------------------------------------------
  // Starting and ending fights

  /**
   * Starts a fight with `npc`. Against bandits, more of them can join.
   * @param {"sparring"|"duel"|"fight"|"bandits"} kind
   * @param {object} [options]
   * @param {"player"|"npc"|null} [options.aggressor]
   */
  start(npc, kind = "sparring", { aggressor = null } = {}) {
    if (npc.knockedOut || npc.inFight || this.playerDown) {
      return;
    }

    if (this.fight) {
      // Only bandits gang up
      if (this.fight.kind === "bandits" && kind === "bandits") {
        this.addOpponent(npc);
      }
      return;
    }

    npc.endChat();
    this.fight = {
      kind,
      aggressor,
      opponents: new Map(),
      witnesses: new Set(),
      timeToWitnessCheck: 0,
      timeToTaunt: randomBetween(TAUNT_INTERVAL_MS),
    };
    this.addOpponent(npc);
    this.hud.show(
      {
        sparring: `Treino com ${npc.data.name}`,
        duel: `Duelo com ${npc.data.name}`,
        fight: `Briga com ${npc.data.name}!`,
        bandits: "Bandidos!",
      }[kind],
    );
  }

  addOpponent(npc) {
    npc.stopFollow();
    npc.cancelPath();
    npc.inFight = true;
    npc.combat = new CombatState(npc, combatProfile(npc.data));
    this.fight.opponents.set(npc, { windup: null, healed: false, stuck: 0 });
  }

  /** Ends the fight against a villager (`winner`: player, npc or none). */
  finish(winner) {
    const { fight } = this;
    const [npc] = fight.opponents.keys();

    this.closeFight();
    this.releaseOpponent(npc);
    gameSocket.send(protocol.FIGHT_END, {
      data: { npcId: npc.id, winner, witnesses: [...fight.witnesses] },
    });

    const lines = {
      ...DEFAULT_LINES[fight.kind],
      ...this.lines.get(npc.id),
    };
    this.lines.delete(npc.id);

    if (winner === "player") npc.sayLine(lines.lose, { emotion: "sad" });
    if (winner === "npc") npc.sayLine(lines.win, { emotion: "happy" });

    if (fight.kind === "sparring" || winner === "none") {
      npc.stayPut(3000);
    } else if (winner === "player") {
      npc.knockOut(KNOCKED_OUT_MS);
      sound.knockOut();
    } else {
      this.playerKnockedOut();
    }
  }

  closeFight() {
    this.fight = null;
    this.projectiles = [];
    this.hud.hide();
    this.hero.body.hurt = false;
    this.hero.body.hidden = false;
  }

  releaseOpponent(npc) {
    npc.inFight = false;
    npc.walkingInFight = false;
    npc.body.hurt = false;
    npc.body.hidden = false;
    npc.combat = null;
    npc.faceTowards(this.hero);
  }

  playerKnockedOut() {
    this.playerDown = true;
    sound.knockOut();
    this.onPlayerKnockedOut?.();
  }

  /** The player woke up after being knocked out. */
  recover() {
    this.playerDown = false;
    this.hero.combat.reset();
  }

  // ---------------------------------------------------------------------------
  // Update

  step(delta, root) {
    const { hero } = this;
    this.time += delta;

    this.updateHeroActions(root.input.keys, root);
    this.updateDodge(delta);
    this.healCooldown = Math.max(0, this.healCooldown - delta);
    hero.combat.update(delta, this.collision);

    if (this.fight) {
      this.updateFight(delta);
    } else {
      // Life comes back out of the fights
      hero.combat.heal((PLAYER_REGEN_PER_SECOND * delta) / 1000);
    }

    this.updateGuard(delta);
    this.updateProjectiles(delta);
    this.effects = this.effects.filter((effect) => {
      effect.timeLeft -= delta;
      return effect.timeLeft > 0;
    });
  }

  updateFight(delta) {
    const { fight, hero } = this;

    for (const [npc, state] of fight.opponents) {
      if (!this.fight) return; // Ended by the previous opponent
      this.updateOpponent(npc, state, delta);
    }

    if (!this.fight) return;

    const [first] = fight.opponents.keys();
    this.hud.update(hero.combat.fraction, first?.combat.fraction ?? 0);
    this.updateWitnesses(delta);
    this.updateTaunts(delta);

    // The player ran away
    const closest = Math.min(
      ...[...fight.opponents.keys()].map((npc) => distanceBetween(hero, npc)),
    );
    if (closest > FLEE_DISTANCE) {
      if (fight.kind === "bandits") {
        fight.opponents.forEach((_, npc) => this.releaseOpponent(npc));
        this.closeFight();
      } else {
        this.finish("none");
      }
    }
  }

  /** Villagers close to the fight see it. */
  updateWitnesses(delta) {
    const { fight, hero } = this;
    fight.timeToWitnessCheck -= delta;

    if (fight.timeToWitnessCheck > 0 || fight.kind === "bandits") return;

    fight.timeToWitnessCheck = WITNESS_CHECK_MS;

    for (const npc of this.npcs.values()) {
      if (
        fight.opponents.has(npc) ||
        npc.data.bandit ||
        npc.isSleeping ||
        npc.knockedOut ||
        fight.witnesses.has(npc.id) ||
        distanceBetween(npc, hero) > WITNESS_DISTANCE
      ) {
        continue;
      }

      fight.witnesses.add(npc.id);
      npc.emotion.show("surprised", 2000);
      npc.faceTowards(hero);
    }
  }

  /** Opponents shout the lines written by the model. */
  updateTaunts(delta) {
    const { fight } = this;
    fight.timeToTaunt -= delta;

    if (fight.timeToTaunt > 0) return;

    fight.timeToTaunt = randomBetween(TAUNT_INTERVAL_MS);
    const [npc] = fight.opponents.keys();
    const taunts = this.lines.get(npc?.id)?.taunts;

    if (taunts?.length) {
      npc.sayLine(taunts[Math.floor(Math.random() * taunts.length)], {
        emotion: "angry",
        time: 2200,
      });
    }
  }

  updateOpponent(npc, state, delta) {
    const { hero, fight } = this;
    const { combat } = npc;
    const { profile } = combat;

    combat.update(delta, this.collision);

    // How the fight ends
    const limit = fight.kind === "sparring" ? SURRENDER_FRACTION : 0;
    if (combat.fraction <= limit) {
      if (fight.kind === "bandits") this.defeatBandit(npc);
      else this.finish("player");
      return;
    }
    if (hero.combat.fraction <= limit) {
      if (fight.kind === "bandits") {
        fight.opponents.forEach((_, opponent) =>
          this.releaseOpponent(opponent),
        );
        this.closeFight();
        gameSocket.send(protocol.KNOCKED_OUT_BY_BANDITS);
        this.playerKnockedOut();
      } else {
        this.finish("npc");
      }
      return;
    }

    // Healers heal themselves once
    if (profile.heal && !state.healed && combat.fraction < HEAL_FRACTION) {
      state.healed = true;
      combat.heal(profile.heal);
      npc.emotion.show("happy", 1500);
      this.addText(npc, `+${profile.heal}`, "#81c784");
    }

    npc.faceTowards(hero);

    if (state.windup) {
      this.updateWindup(npc, state, delta);
      return;
    }

    const distance = distanceBetween(hero, npc);
    const speed = (profile.speed * delta) / FRAME_MS;
    const toHero = directionFrom(npc, hero);
    const tooClose = profile.projectile && distance < profile.keepDistance - 10;
    const tooFar = distance > profile.range - 4;
    const moving = tooClose || tooFar;

    if (!tooFar && npc.path) {
      npc.cancelPath(); // Close enough: no need to keep walking around
    }

    if (tooFar && (npc.path || npc.isCalculatingPath)) {
      // Walking around an obstacle
      npc.walk();
    } else if (moving) {
      const sign = tooClose ? -1 : 1;
      const { x, y } = npc.position;
      combat.move(
        sign * toHero.x * speed,
        sign * toHero.y * speed,
        this.collision,
      );
      const didNotMove = x === npc.position.x && y === npc.position.y;
      state.stuck = didNotMove ? state.stuck + delta : 0;

      if (state.stuck >= STUCK_MS && tooFar) {
        state.stuck = 0;
        npc.moveTo(hero.position.duplicate());
      }
    }

    if (
      (!moving || profile.projectile) &&
      combat.cooldown <= 0 &&
      distance <= profile.range + 4
    ) {
      // Warns before attacking, so the player can dodge
      state.windup = { timeLeft: profile.windupMs };
      npc.emotion.show("surprised", profile.windupMs);
    }

    npc.walkingInFight = moving;
  }

  updateWindup(npc, state, delta) {
    const { hero } = this;
    const { combat } = npc;
    const { profile } = combat;

    state.windup.timeLeft -= delta;
    npc.walkingInFight = false;

    if (state.windup.timeLeft > 0) return;

    state.windup = null;
    combat.cooldown = profile.cooldownMs;
    const facing = directionTowards(npc.position, hero.position);

    if (profile.projectile) {
      this.shoot(npc, profile);
      return;
    }

    sound.swing();
    this.addSlash(npc, facing);

    if (inAttackArc(npc, facing, hero, profile.range + 6)) {
      this.hitHero(rollDamage(profile.damage), npc);
    }
  }

  defeatBandit(npc) {
    const { fight } = this;
    fight.opponents.delete(npc);
    this.releaseOpponent(npc);
    // Stays on the ground until the server takes it away
    npc.data.defeated = true;
    npc.knockOut(Infinity);
    npc.sayLine(DEFAULT_LINES.bandits.lose, { emotion: "sad" });
    sound.knockOut();
    gameSocket.send(protocol.BANDIT_DEFEATED, { data: { banditId: npc.id } });

    if (fight.opponents.size === 0) {
      this.closeFight();
    }
  }

  // ---------------------------------------------------------------------------
  // The hero

  updateHeroActions(keys, root) {
    const pressed = (key) => Boolean(keys[key]) && !this.held[key];

    if (this.playerDown) return;

    if (pressed(" ") && !root.chatOpen?.()) this.heroAttack();
    if (pressed("shift")) this.heroDodge();
    if (pressed("h")) this.heroHeal();

    this.held = { " ": keys[" "], shift: keys.shift, h: keys.h };
  }

  heroAttack() {
    const { hero, fight } = this;

    if (hero.combat.cooldown > 0 || this.dodge) return;

    hero.combat.cooldown = hero.combat.profile.cooldownMs;
    sound.swing();
    this.addSlash(hero, hero.facingDirection);

    const targets = [...this.npcs.values()].filter(
      (npc) =>
        !npc.knockedOut &&
        inAttackArc(hero, hero.facingDirection, npc, hero.combat.profile.range),
    );

    for (const npc of targets) {
      if (fight?.opponents.has(npc)) {
        this.hitNpc(npc);
      } else if (npc.data.bandit) {
        this.start(npc, "bandits");
        if (this.fight?.opponents.has(npc)) this.hitNpc(npc);
      } else if (!npc.inFight) {
        this.attackPeaceful(npc);
      }
    }
  }

  /** Hitting someone out of a fight: they complain, and the server decides. */
  attackPeaceful(npc) {
    const last = this.reportedAttacks.get(npc.id) ?? -Infinity;

    npc.faceTowards(this.hero);
    npc.emotion.show("angry", 2000);
    npc.sayLine(FLINCH_LINE, { emotion: "angry" });

    if (this.time - last < ATTACK_REPORT_COOLDOWN_MS || this.fight) return;

    this.reportedAttacks.set(npc.id, this.time);
    gameSocket.send(protocol.PLAYER_ATTACKED, { data: { npcId: npc.id } });
  }

  /** The server decided how the NPC reacts to being hit. */
  onReaction(npc, { reaction, callout, guardId, guardCallout }) {
    if (callout) {
      npc.sayLine(callout, {
        emotion: reaction === "fight" ? "angry" : "surprised",
      });
    }

    if (reaction === "fight") {
      this.start(npc, "fight", { aggressor: "player" });
    } else {
      npc.runAwayFrom(this.hero);
    }

    const guard = this.npcs.get(guardId);
    if (guard && !guard.knockedOut) {
      this.guard = { npc: guard, timeLeft: GUARD_TIMEOUT_MS };
      guard.walkWithPlayer({
        callout: guardCallout,
        durationMs: GUARD_TIMEOUT_MS,
      });
    }
  }

  /** The guard comes to stop the fight. */
  updateGuard(delta) {
    const { guard } = this;
    if (!guard) return;

    guard.timeLeft -= delta;

    if (guard.timeLeft <= 0) {
      this.guard = null;
      return;
    }

    if (distanceBetween(guard.npc, this.hero) <= GUARD_REACH_DISTANCE) {
      this.guard = null;
      guard.npc.stopFollow();
      guard.npc.faceTowards(this.hero);
      guard.npc.emotion.show("angry", 3000);
      gameSocket.send(protocol.GUARD_ARRIVED, {
        data: { guardId: guard.npc.id },
      });

      if (this.fight && this.fight.kind === "fight") {
        this.finish("none");
      }
    }
  }

  hitNpc(npc) {
    const { combat } = npc;

    if (Math.random() < combat.profile.dodgeChance) {
      this.addText(npc, "esquivou", "#90caf9");
      sound.dodge();
      return;
    }

    const damage = combat.takeHit(
      rollDamage(this.hero.combat.profile.damage),
      this.hero,
    );

    if (damage) {
      sound.hit();
      this.addText(npc, `-${damage}`, "#ffeb3b");
      // A hit interrupts the attack being prepared
      const state = this.fight?.opponents.get(npc);
      if (state) state.windup = null;
    }
  }

  heroDodge() {
    const { hero } = this;

    if (this.dodgeCooldown > 0 || this.dodge) return;

    // A quick step back
    const facing =
      DIRECTION_VECTORS[hero.facingDirection] ?? DIRECTION_VECTORS.DOWN;
    this.dodge = {
      x: (-facing.x * DODGE_DISTANCE) / DODGE_MS,
      y: (-facing.y * DODGE_DISTANCE) / DODGE_MS,
      timeLeft: DODGE_MS,
    };
    this.dodgeCooldown = DODGE_COOLDOWN_MS;
    hero.combat.invulnerable = Math.max(
      hero.combat.invulnerable,
      DODGE_INVULNERABLE_MS,
    );
    sound.dodge();
  }

  updateDodge(delta) {
    this.dodgeCooldown = Math.max(0, this.dodgeCooldown - delta);

    if (!this.dodge) return;

    const step = Math.min(delta, this.dodge.timeLeft);
    this.hero.combat.move(
      this.dodge.x * step,
      this.dodge.y * step,
      this.collision,
    );
    this.dodge.timeLeft -= step;

    if (this.dodge.timeLeft <= 0) {
      this.dodge = null;
      this.hero.emitPosition();
    }
  }

  /** H: eats or uses the item that heals the most. */
  heroHeal() {
    const { combat } = this.hero;

    if (this.healCooldown > 0 || combat.hp >= combat.maxHp) return;

    const item = bestHealingItem(this.inventory);

    if (!item) {
      this.addText(this.hero, "nada para curar", "#bdbdbd");
      return;
    }

    this.healCooldown = HEAL_COOLDOWN_MS;
    gameSocket.send(protocol.USE_ITEM, { data: { item } });
  }

  onItemUsed({ ok, item, heal }) {
    if (!ok) return;

    this.hero.combat.heal(heal);
    this.addText(this.hero, `+${heal} (${item})`, "#81c784");
    sound.chime("good");
  }

  hitHero(damage, attacker) {
    const taken = this.hero.combat.takeHit(damage, attacker);

    if (taken) {
      sound.hit();
      this.addText(this.hero, `-${taken}`, "#ef5350");
      this.hero.emitPosition();
    }
  }

  shoot(npc, profile) {
    const from = centerOf(npc);
    const direction = directionFrom(npc, this.hero);

    this.projectiles.push({
      x: from.x,
      y: from.y,
      vx: (direction.x * profile.projectile.speed) / FRAME_MS,
      vy: (direction.y * profile.projectile.speed) / FRAME_MS,
      color: profile.projectile.color,
      damage: rollDamage(profile.damage),
      attacker: npc,
      timeLeft: PROJECTILE_MAX_MS,
    });
    sound.swing();
  }

  updateProjectiles(delta) {
    const hero = centerOf(this.hero);

    this.projectiles = this.projectiles.filter((projectile) => {
      projectile.x += projectile.vx * delta;
      projectile.y += projectile.vy * delta;
      projectile.timeLeft -= delta;

      if (
        Math.hypot(projectile.x - hero.x, projectile.y - hero.y) <=
        PROJECTILE_HIT_DISTANCE
      ) {
        this.hitHero(projectile.damage, projectile.attacker);
        return false;
      }

      return (
        projectile.timeLeft > 0 &&
        !this.collision.isBlocked(projectile.x - 1, projectile.y - 1, 2, 2)
      );
    });
  }

  // ---------------------------------------------------------------------------
  // Effects (drawn over the trees)

  addSlash(character, direction) {
    this.effects.push({
      kind: "slash",
      character,
      direction,
      timeLeft: SLASH_MS,
    });
  }

  addText(character, text, color) {
    const { x, y } = centerOf(character);
    this.effects.push({
      kind: "text",
      x: x + (Math.random() - 0.5) * 6,
      y: y - 14,
      text,
      color,
      timeLeft: FLOATING_TEXT_MS,
    });
  }

  drawImage() {
    overlayLayer.add((ctx) => this.drawEffects(ctx));
  }

  drawEffects(ctx) {
    this.projectiles.forEach(({ x, y, color }) => {
      ctx.beginPath();
      ctx.arc(x, y, 2.5, 0, Math.PI * 2);
      ctx.fillStyle = color;
      ctx.fill();
      ctx.strokeStyle = "#fff";
      ctx.lineWidth = 0.5;
      ctx.stroke();
    });

    for (const effect of this.effects) {
      if (effect.kind === "slash") {
        this.drawSlash(ctx, effect);
      } else {
        const progress = 1 - effect.timeLeft / FLOATING_TEXT_MS;
        ctx.globalAlpha = 1 - progress * 0.7;
        ctx.font = "bold 6px Arial";
        ctx.textAlign = "center";
        ctx.lineWidth = 2;
        ctx.strokeStyle = "#000";
        ctx.strokeText(effect.text, effect.x, effect.y - progress * 10);
        ctx.fillStyle = effect.color;
        ctx.fillText(effect.text, effect.x, effect.y - progress * 10);
        ctx.textAlign = "start";
        ctx.globalAlpha = 1;
      }
    }

    // Life bars over the fighters
    if (this.fight) {
      this.drawLifeBar(ctx, this.hero, this.hero.combat.fraction, "#66bb6a");
      this.fight.opponents.forEach((_, npc) =>
        this.drawLifeBar(ctx, npc, npc.combat.fraction, "#ef5350"),
      );
    }
  }

  drawSlash(ctx, { character, direction, timeLeft }) {
    const { x, y } = centerOf(character);
    const facing = DIRECTION_VECTORS[direction] ?? DIRECTION_VECTORS.DOWN;
    const angle = Math.atan2(facing.y, facing.x);
    const progress = 1 - timeLeft / SLASH_MS;

    ctx.beginPath();
    ctx.arc(x, y - 4, 14, angle - 0.9 + progress * 0.4, angle + 0.9 * progress);
    ctx.strokeStyle = `rgba(255, 255, 255, ${1 - progress})`;
    ctx.lineWidth = 2.5;
    ctx.stroke();
  }

  drawLifeBar(ctx, character, fraction, color) {
    const x = character.position.x;
    const y = character.position.y - 17; // Just above the name

    ctx.fillStyle = "rgba(0, 0, 0, 0.6)";
    ctx.fillRect(x - 1, y - 1, 18, 4);
    ctx.fillStyle = color;
    ctx.fillRect(x, y, 16 * Math.max(0, fraction), 2);
  }
}
