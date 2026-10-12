import assert from "node:assert/strict";
import { test } from "node:test";
import { PlayerState } from "../game/PlayerState.js";

test("reputation is clamped between -10 and 10", () => {
  const player = new PlayerState();

  assert.equal(player.changeReputation(1, 8), 8);
  assert.equal(player.changeReputation(1, 8), 10);
  assert.equal(player.changeReputation(2, -15), -10);
  assert.equal(player.getReputation(3), 0);
});

test("items with the same name ignore case and accents", () => {
  const player = new PlayerState({ startingItems: { moedas: 10 } });

  player.addItem("Pão", 2);
  player.addItem("pao", 1);

  assert.ok(player.hasItem("PÃO", 3));
  assert.equal(player.removeItem("pão", 4), false);
  assert.equal(player.removeItem("pão", 3), true);
  assert.deepEqual(player.items, [{ name: "moedas", quantity: 10 }]);
});

test("each villager has one active request, completed by giver or target", () => {
  const player = new PlayerState();
  const quest = player.addQuest({
    giverId: 1,
    targetId: 2,
    title: "Recado",
    description: "Leve o recado ao Npc2",
  });

  assert.equal(
    player.addQuest({ giverId: 1, title: "Outro", description: "" }),
    null,
  );
  assert.equal(player.completeQuest(quest.id, 3), null, "not involved");
  assert.equal(player.completeQuest(quest.id, 2).status, "completed");
  assert.equal(player.completeQuest(quest.id, 2), null, "already done");
  assert.ok(player.addQuest({ giverId: 1, title: "Outro", description: "" }));
});
