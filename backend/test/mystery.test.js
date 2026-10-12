import assert from "node:assert/strict";
import { test } from "node:test";
import { Mystery } from "../game/Mystery.js";
import { fakeLlm } from "./helpers.js";

const cast = [1, 2, 3].map((slot) => ({
  slot,
  name: `Npc${slot}`,
  occupation: "Farmer",
}));

test("generates a mystery with a clue for every villager but the culprit", async () => {
  const mystery = await Mystery.generate({
    llm: fakeLlm(),
    context: "Context.",
    cast,
    language: "Portuguese",
  });

  assert.equal(mystery.culpritId, 2);
  assert.deepEqual([...mystery.clues.keys()], [1, 3]);
  assert.match(mystery.describeFor(2), /SECRET/);
  assert.match(mystery.describeFor(1), /saw Npc2/);
  assert.equal(mystery.gossipFor(2), null);
  assert.match(mystery.gossipFor(3), /\[mystery/);
});

test("no mystery with less than 3 villagers", async () => {
  const mystery = await Mystery.generate({
    llm: fakeLlm(),
    context: "Context.",
    cast: cast.slice(0, 2),
    language: "Portuguese",
  });

  assert.equal(mystery, null);
});

test("an invalid culprit is replaced and missing clues get a default", async () => {
  const llm = fakeLlm({
    mystery: () => ({
      title: "T",
      intro: "I",
      culpritSlot: 99,
      motive: "M",
      solution: "S",
      alibi: "A",
      clues: [],
    }),
  });

  const mystery = await Mystery.generate({
    llm,
    context: "Context.",
    cast,
    language: "Portuguese",
  });

  assert.ok([1, 2, 3].includes(mystery.culpritId));
  assert.equal(mystery.clues.size, 2);
});

test("two wrong accusations fail the mystery", async () => {
  const mystery = await Mystery.generate({
    llm: fakeLlm(),
    context: "Context.",
    cast,
    language: "Portuguese",
  });

  assert.deepEqual(mystery.accuse(1), {
    correct: false,
    status: "open",
    attemptsLeft: 1,
    evidenceMismatch: false,
  });
  assert.equal(mystery.accuse(3).status, "failed");
  assert.throws(() => mystery.accuse(2), /closed/);
  assert.equal(mystery.toJSON({ nameOf: (id) => `Npc${id}` }).culprit, "Npc2");
});
