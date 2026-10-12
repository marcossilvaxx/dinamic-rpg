import assert from "node:assert/strict";
import { test } from "node:test";
import { castProblems, fixCast } from "../game/cast.js";
import { createSession, fakeLlm } from "./helpers.js";

const villager = (slot, name) => ({ slot, name, occupation: "Farmer" });

test("accepts names with different initials, one per slot", () => {
  assert.deepEqual(
    castProblems([villager(1, "Aldric"), villager(2, "Mira")], 2),
    [],
  );
});

test("reports missing slots and names with the same initial", () => {
  const problems = castProblems(
    [villager(1, "Edric Vale"), villager(3, "Elric Wren")],
    3,
  );

  assert.equal(problems.length, 2);
  assert.match(problems[0], /Slot 2/);
  assert.match(problems[1], /Edric Vale, Elric Wren/);
});

test("fixCast fills missing slots and replaces repeated names", () => {
  const cast = fixCast(
    [villager(1, "Edric"), villager(2, "edric"), villager(2, "Other")],
    3,
  );

  assert.deepEqual(
    cast.map((v) => v.slot),
    [1, 2, 3],
  );
  assert.equal(cast[0].name, "Edric");
  assert.notEqual(cast[1].name.toLowerCase(), "edric");
  assert.equal(new Set(cast.map((v) => v.name[0])).size, 3);
});

test("the world is generated again when names are too similar", async () => {
  let attempts = 0;
  const llm = fakeLlm({
    world: () => {
      attempts++;
      const names = attempts === 1 ? ["Edric", "Elric"] : ["Edric", "Mira"];
      return {
        worldHistory: "History.",
        villagers: names.map((name, i) => villager(i + 1, name)),
      };
    },
  });

  const session = await createSession(llm);

  assert.equal(attempts, 2);
  assert.deepEqual(
    [...session.npcs.values()].map((npc) => npc.data.name),
    ["Edric", "Mira"],
  );
  assert.match(session.worldContext, /- Mira, Farmer/);
  assert.match(session.worldContext, /ONLY named people/);
});

test("names are fixed when the model keeps repeating them", async () => {
  const llm = fakeLlm({
    world: () => ({
      worldHistory: "History.",
      villagers: [villager(1, "Edric"), villager(2, "Edric")],
    }),
  });

  const session = await createSession(llm);
  const names = [...session.npcs.values()].map((npc) => npc.data.name);

  assert.equal(names[0], "Edric");
  assert.notEqual(names[1], "Edric");
});
