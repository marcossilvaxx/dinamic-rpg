import { directionFrom } from "./combat";

const INVULNERABLE_MS = 500; // After being hit
const HURT_FLASH_MS = 150;
const KNOCKBACK_MS = 120;
const KNOCKBACK_DISTANCE = 12;

/**
 * Life and hit reactions of a character (the hero or an NPC) in a fight:
 * red flash, knockback and blinking while it can't be hit again.
 */
export class CombatState {
  constructor(character, profile) {
    this.character = character;
    this.profile = profile;
    this.maxHp = profile.maxHp;
    this.hp = profile.maxHp;
    this.cooldown = 0; // Until the next attack (ms)
    this.invulnerable = 0;
    this.hurt = 0;
    this.knockback = null; // { x, y, timeLeft } px per ms
  }

  get fraction() {
    return this.hp / this.maxHp;
  }

  get canBeHit() {
    return this.invulnerable <= 0;
  }

  reset() {
    this.hp = this.maxHp;
    this.cooldown = 0;
    this.invulnerable = 0;
    this.hurt = 0;
    this.knockback = null;
    this.render();
  }

  /** @returns {number} The damage taken (0 if it couldn't be hit). */
  takeHit(damage, attacker) {
    if (!this.canBeHit) {
      return 0;
    }

    this.hp = Math.max(0, this.hp - damage);
    this.invulnerable = INVULNERABLE_MS;
    this.hurt = HURT_FLASH_MS;

    const direction = directionFrom(attacker, this.character);
    this.knockback = {
      x: (direction.x * KNOCKBACK_DISTANCE) / KNOCKBACK_MS,
      y: (direction.y * KNOCKBACK_DISTANCE) / KNOCKBACK_MS,
      timeLeft: KNOCKBACK_MS,
    };

    return damage;
  }

  heal(amount) {
    this.hp = Math.min(this.maxHp, this.hp + amount);
  }

  /** Moves the character by `dx`, `dy` if nothing blocks the way. */
  move(dx, dy, collision) {
    const { character } = this;
    const { width, height, position } = character;
    const x = Math.round(position.x + dx);
    const y = Math.round(position.y + dy);

    if (!collision.isBlocked(x, position.y, width, height)) {
      position.x = x;
    }
    if (!collision.isBlocked(position.x, y, width, height)) {
      position.y = y;
    }
  }

  update(delta, collision) {
    this.cooldown = Math.max(0, this.cooldown - delta);
    this.invulnerable = Math.max(0, this.invulnerable - delta);
    this.hurt = Math.max(0, this.hurt - delta);

    if (this.knockback) {
      const step = Math.min(delta, this.knockback.timeLeft);
      this.move(this.knockback.x * step, this.knockback.y * step, collision);
      this.knockback.timeLeft -= step;
      if (this.knockback.timeLeft <= 0) this.knockback = null;
    }

    this.render();
  }

  render() {
    const { body } = this.character;
    body.hurt = this.hurt > 0;
    // Blinks while invulnerable
    body.hidden =
      this.invulnerable > 0 &&
      !body.hurt &&
      Math.floor(this.invulnerable / 60) % 2 === 0;
  }
}
