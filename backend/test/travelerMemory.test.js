import assert from "node:assert/strict";
import { test } from "node:test";
import { fakeLlm, recordingSession } from "./helpers.js";

test("the journal shows what an NPC remembers about the player", async () => {
  const llm = fakeLlm();
  const { session } = await recordingSession(llm);

  assert.deepEqual(await session.travelerMemory(1), {
    lines: [],
    feeling: "",
    count: 0,
  });

  await session.remember(1, "[about the traveler] The traveler helped me.");
  await session.remember(1, "[village news] It rained.");
  const memory = await session.travelerMemory(1);
  assert.deepEqual(memory.lines, ["Você me ajudou com a lenha."]);
  assert.equal(memory.count, 1);

  // Cached until the memories change
  const calls = llm.calls.filter((name) => name === "traveler_memory").length;
  await session.travelerMemory(1);
  assert.equal(llm.calls.filter((n) => n === "traveler_memory").length, calls);
  await session.remember(1, "[about the traveler] The traveler gave me bread.");
  await session.travelerMemory(1);
  assert.equal(
    llm.calls.filter((n) => n === "traveler_memory").length,
    calls + 1,
  );
});
