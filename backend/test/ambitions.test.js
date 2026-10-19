import assert from "node:assert/strict";
import { test } from "node:test";
import { AMBITION_PROGRESS } from "../game/Ambitions.js";
import { conversation, fakeLlm, recordingSession } from "./helpers.js";

test("villagers get long-term ambitions that move with the story", async () => {
  const llm = fakeLlm({
    npc_conversation: () =>
      conversation({
        ambition: { a: "big", b: "none" },
        ambitionNote: { a: "Combinou com B o preço da farinha", b: "" },
      }),
  });
  const { session, sent } = await recordingSession(llm);
  await session.flush();

  const ambitions = session.ambitions;
  assert.equal(ambitions.ambitions.size, session.cast.length);
  assert.match(ambitions.describeFor(1), /padaria.*step 1 of 3/);
  assert.equal(llm.calls.filter((name) => name === "ambitions").length, 1);

  // A conversation between NPCs moves it
  const scene = await session.social.start(1, 2);
  await session.social.end(scene.conversationId, scene.lines.length);
  assert.equal(ambitions.get(1).progress, AMBITION_PROGRESS.big);
  assert.equal(
    ambitions.get(1).log.at(-1).note,
    "Combinou com B o preço da farinha",
  );
  assert.equal(ambitions.get(2).progress, 0);

  // Steps are news; the last one is the ambition of their life
  await ambitions.advance(1, 100, "Juntou as moedas");
  assert.equal(ambitions.get(1).step, 1);
  assert.ok(sent.some((m) => /deu um passo/.test(m.data?.text)));
  await ambitions.advance(1, 100);
  await ambitions.advance(1, 100);
  assert.ok(sent.some((m) => /ambição da vida/.test(m.data?.text)));
  assert.equal(ambitions.get(1).text, "Ensinar os filhos a pescar");
  assert.equal(ambitions.get(1).achieved.length, 1);

  // The journal only shows people the player met
  assert.equal(ambitions.toJSON().length, 0);
  session.player.met.add(1);
  assert.equal(session.playerStateJSON().ambitions[0].npcId, 1);

  // Saved with the game
  const state = JSON.parse(JSON.stringify(session.toState()));
  ambitions.restoreState(state.ambitions);
  assert.equal(ambitions.get(1).text, "Ensinar os filhos a pescar");
});

test("the player helping in a chat moves the ambition", async () => {
  const llm = fakeLlm({
    chat_summary: () => ({
      fact: "The traveler promised to bring flour.",
      testimony: "",
      ambition: "small",
      ambitionNote: "O viajante prometeu trazer farinha",
    }),
  });
  const { session } = await recordingSession(llm);
  await session.flush();
  await session.chat(1, "Posso ajudar com a padaria?");
  await session.summarizeChat(1);
  assert.equal(session.ambitions.get(1).progress, AMBITION_PROGRESS.small);
  assert.match(session.ambitions.get(1).log[0].note, /farinha/);
});
