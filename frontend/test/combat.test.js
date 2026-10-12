import assert from "node:assert/strict";
import { test } from "node:test";
import {
  combatProfile,
  inAttackArc,
  rollDamage,
  spriteClass,
} from "../src/systems/combat.js";

test("the combat profile comes from the sprite and the occupation", () => {
  assert.equal(spriteClass("warriorF"), "warrior");
  assert.equal(spriteClass("unknown"), "townfolk");

  const guard = combatProfile({
    sprite: "warriorM",
    occupation: "Village guard",
  });
  const warrior = combatProfile({ sprite: "warriorM", occupation: "Farmer" });
  assert.equal(guard.maxHp, warrior.maxHp + 20);
  assert.ok(combatProfile({ sprite: "mageF" }).projectile);
  assert.equal(combatProfile({ sprite: "ninjaM" }).dodgeChance, 0.25);
  assert.equal(combatProfile({ sprite: "townfolkM" }).dodgeChance, 0);
});

const at = (x, y) => ({ position: { x, y }, width: 16, height: 12 });

test("melee attacks hit what is in front and close", () => {
  const hero = at(100, 100);
  assert.ok(inAttackArc(hero, "RIGHT", at(118, 100), 22));
  assert.ok(!inAttackArc(hero, "LEFT", at(118, 100), 22), "behind");
  assert.ok(!inAttackArc(hero, "RIGHT", at(140, 100), 22), "too far");
  assert.ok(inAttackArc(hero, "DOWN", at(104, 116), 22), "a bit to the side");
  assert.ok(inAttackArc(hero, "UP", at(101, 101), 22), "overlapping");
});

test("damage varies a little", () => {
  assert.equal(
    rollDamage(10, () => 0),
    8,
  );
  assert.equal(
    rollDamage(10, () => 0.999),
    12,
  );
  assert.equal(
    rollDamage(1, () => 0),
    1,
  );
});

test("weapons and armor make the player stronger", async () => {
  const { equipmentOf, playerProfile, bestHealingItem } =
    await import("../src/systems/combat.js");
  const inventory = [
    { name: "moedas", quantity: 3 },
    { name: "adaga", quantity: 1 },
    { name: "Espada curta", quantity: 1 },
    { name: "escudo de couro", quantity: 1 },
    { name: "pão", quantity: 2 },
    { name: "ervas", quantity: 1 },
  ];

  assert.deepEqual(equipmentOf(inventory).weapon, {
    item: "Espada curta",
    bonus: 6,
  });
  assert.equal(equipmentOf(inventory).armor.bonus, 20);
  assert.equal(playerProfile(inventory).damage, 16);
  assert.equal(playerProfile(inventory).maxHp, 120);
  assert.equal(playerProfile([]).damage, 10);
  assert.equal(bestHealingItem(inventory), "ervas");
  assert.equal(bestHealingItem([{ name: "moedas" }]), null);
});

test("bandits are a bit weaker, since they come in groups", () => {
  const bandit = combatProfile({ sprite: "warriorM", bandit: true });
  const warrior = combatProfile({ sprite: "warriorM" });
  assert.ok(bandit.maxHp < warrior.maxHp);
  assert.ok(bandit.damage < warrior.damage);
});
