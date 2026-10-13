import assert from "node:assert/strict";
import { test } from "node:test";
import { GameSession, describeSavedGame } from "../game/GameSession.js";
import { SessionStore } from "../storage/SessionStore.js";
import {
  PLACES,
  fakeDatabase,
  fakeLlm,
  recordingSession,
  setTime,
  toolCall,
  toolLlm,
} from "./helpers.js";

const options = (database, llm = fakeLlm()) => ({
  id: "saved",
  llm,
  store: new SessionStore(database, "saved", { ttlSeconds: 3600 }),
  maxMemoryMessages: 40,
  maxFacts: 5,
});

test("a saved game is loaded with everything in place", async () => {
  const database = fakeDatabase();
  const llm = toolLlm(fakeLlm(), [
    [
      toolCall("giveQuest", {
        title: "Lenha",
        description: "Traga lenha",
        villager: "Npc2",
        hours: 2,
        lastWords: "",
      }),
    ],
  ]);
  const session = new GameSession(options(database, llm));
  await session.createNpcs({
    quantity: 3,
    language: "Portuguese",
    places: PLACES,
  });
  session.attach(() => {});
  setTime(session, 10 * 60);

  await session.chat(1, "Precisa de algo?");
  session.player.changeReputation(2, 5);
  session.bonds.bonds.set(2, "friend");
  session.life.weather.current = "fog";
  session.commerce.stocks.get(1).set("pao", 1);
  session.goals.advance(1, 30);
  session.mystery.addTestimony(1, "Npc1 disse algo.", "Dia 1");
  await session.dispose({ forget: false });

  // Another backend process, after a restart
  const loaded = await GameSession.load(options(database));

  assert.equal(loaded.npcs.size, 3);
  assert.equal(loaded.npcs.get(1).data.name, "Npc1");
  assert.equal(loaded.player.getReputation(2), 5);
  assert.equal(loaded.player.quests[0].title, "Lenha");
  assert.equal(loaded.player.quests[0].targetId, 2);
  assert.equal(loaded.bonds.get(2), "friend");
  assert.equal(loaded.life.weather.current, "fog");
  assert.equal(loaded.commerce.stockOf(1, "Pão"), 1);
  assert.equal(loaded.goals.get(1).progress, 30);
  assert.equal(loaded.mystery.title, "O sino sumiu");
  assert.equal(loaded.mystery.clues.get(1), "I saw Npc2 near the tavern.");
  assert.equal(loaded.mystery.testimonies.length, 1);
  assert.equal(loaded.clock.format(), "10:00", "the clock stopped");
  assert.equal(loaded.isReady, true);
  // NPC memories were already in Redis
  assert.equal((await loaded.store.getMemory(1)).length, 3);

  // The game continues
  loaded.attach(() => {});
  const { content } = await loaded.chat(1, "Oi de novo");
  assert.equal(content, "I'm fine.");
  await loaded.dispose({ forget: false });
});

test("saved games expire and can be deleted", async () => {
  const database = fakeDatabase();
  const session = new GameSession(options(database));
  await session.createNpcs({
    quantity: 2,
    language: "Portuguese",
    places: PLACES,
  });
  await session.flush();

  assert.equal(database.expirations.get("session:saved:state"), 3600);
  assert.equal(database.expirations.get("session:saved:npc:1"), 3600);

  await session.dispose({ forget: true });
  assert.equal(await GameSession.load(options(database)), null);
  assert.equal(database.hashes.size, 0);
});

test("an incomplete game is not saved", async () => {
  const database = fakeDatabase();
  const session = new GameSession(options(database));

  session.save();
  await session.flush();

  assert.equal(await GameSession.load(options(database)), null);
});

test("the main menu describes a saved game", async () => {
  const { session } = await recordingSession(fakeLlm());
  setTime(session, 2 * 24 * 60 + 9 * 60); // Day 3, 09:00

  const saved = describeSavedGame(session.toState());
  assert.equal(saved.day, 3);
  assert.equal(saved.moment, "Dia 3, 09:00");
  assert.equal(saved.villagers, 2);
  assert.equal(saved.season, "Verão");
  assert.deepEqual(saved.buildings, []);

  assert.equal(describeSavedGame(null), null);
  assert.equal(describeSavedGame({ ...session.toState(), version: 0 }), null);
});
