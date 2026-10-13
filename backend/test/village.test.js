import assert from "node:assert/strict";
import { test } from "node:test";
import { buildNpcTools } from "../agents/npcTools.js";
import { npcDialogPrompt } from "../prompts/npcDialog.js";
import { npcConversationPrompt } from "../prompts/npcConversation.js";
import { worldContext } from "../prompts/worldContext.js";
import { GameSession } from "../game/GameSession.js";
import { SessionStore } from "../storage/SessionStore.js";
import { PLACES, createSession, fakeDatabase, fakeLlm } from "./helpers.js";

const toolCall = (name, args) => ({ id: name, name, arguments: args });

test("NPC routines only keep known places, without repetition", async () => {
  const session = await createSession();

  assert.deepEqual(session.npcs.get(1).data.routine, ["dock"]);
  assert.equal(session.npcs.get(1).data.occupation, "Farmer");
});

test("guide and introduce tools are offered only when possible", () => {
  const names = (tools) => tools.map((tool) => tool.function.name);

  assert.deepEqual(names(buildNpcTools()), [
    "endConversation",
    "followPlayer",
    "stopFollowPlayer",
    "giveQuest",
    "completeQuest",
    "giveItem",
    "takeItem",
    "sellItem",
    "buyItem",
    "setBond",
    "acceptInvitation",
    "startSparring",
    "startFight",
    "confess",
  ]);

  const tools = buildNpcTools({
    places: PLACES,
    villagers: [{ name: "Ana", occupation: "Baker" }],
  });
  const guide = tools.find((tool) => tool.function.name === "guidePlayerTo");
  const introduce = tools.find(
    (tool) => tool.function.name === "introducePlayerTo",
  );

  assert.deepEqual(guide.function.parameters.properties.placeId.enum, [
    "dock",
    "tavern",
  ]);
  assert.deepEqual(introduce.function.parameters.properties.villager.enum, [
    "Ana",
  ]);
});

test("chat resolves guide and introduce actions", async () => {
  const tools = [
    toolCall("guidePlayerTo", { placeId: "tavern", lastWords: "Vem!" }),
    toolCall("guidePlayerTo", { placeId: "castle", lastWords: "?" }),
    toolCall("introducePlayerTo", { villager: "Npc2", lastWords: "Ok" }),
    toolCall("introducePlayerTo", { villager: "Nobody", lastWords: "?" }),
  ];
  // The fake model calls the tools again in the follow-up answer (after the
  // failures): they are not done twice
  const llm = fakeLlm({ npc_response: () => null }, { npc_response: tools });
  const session = await createSession(llm);

  const { actions } = await session.chat(1, "Me leva na taverna e na Npc2?");

  assert.deepEqual(actions, [
    { action: "guidePlayerTo", lastWords: "Vem!", placeId: "tavern" },
    {
      action: "introducePlayerTo",
      lastWords: "Ok",
      villager: "Npc2",
      targetId: 2,
    },
  ]);
  assert.deepEqual(await session.store.getFacts(2), [
    "[meeting the traveler] Npc1 brought the traveler to meet me.",
  ]);
});

test("a world event becomes news for every NPC", async () => {
  const session = await createSession(fakeLlm(), { quantity: 3 });

  const event = await session.generateWorldEvent();

  assert.equal(event.headline, "Um mercador chegou!");
  for (const npcId of [1, 2, 3]) {
    assert.deepEqual(await session.store.getFacts(npcId), [
      "[village news] A merchant arrived at the pier.",
    ]);
  }
  assert.equal(session.recentEvents.length, 1);
  assert.equal(session.recentEvents[0].fact, "A merchant arrived at the pier.");
  assert.ok(
    PLACES.some((place) => place.id === session.recentEvents[0].placeId),
  );
});

test("world events start and stop with the session", async () => {
  const session = await createSession();

  session.startWorldEvents(60000, () => {});
  assert.ok(session.worldEventTimer);

  await session.dispose();
  assert.equal(session.worldEventTimer, null);
});

test("dialog prompts start with the same world context (prompt cache)", () => {
  const npc = {
    name: "Ana",
    gender: "Female",
    occupation: "Baker",
    personality: ["kind"],
    story: "A story.",
    routine: ["tavern"],
  };
  const context = worldContext({
    worldHistory: "History.",
    places: PLACES,
    villagers: [{ name: "Ana", occupation: "Baker" }],
  });

  const dialog = npcDialogPrompt({
    context,
    npc,
    places: PLACES,
    hasTalkedBefore: false,
  });
  const conversation = npcConversationPrompt({
    context,
    a: npc,
    b: { ...npc, name: "Bia" },
    factsA: [],
    factsB: [],
    relationship: { talks: 0 },
    language: "Portuguese",
  });

  assert.ok(dialog.startsWith(context));
  assert.ok(conversation.startsWith(context));
  assert.match(dialog, /usually spend your day at: Taverna/);
});

test("the village plan builds on the empty lots and gives homes", async () => {
  const llm = fakeLlm({
    village_plan: () => ({
      buildings: [
        {
          lot: "lot_north",
          kind: "work",
          name: "Ferraria",
          description: "A smithy.",
          owners: [1, 99],
        },
        {
          lot: "lot_nowhere",
          kind: "home",
          name: "X",
          description: "",
          owners: [2],
        },
        {
          lot: "lot_east",
          kind: "home",
          name: "Casa",
          description: "A house.",
          owners: [1, 2],
        },
      ],
    }),
  });
  const session = new GameSession({
    id: "plan",
    llm,
    store: new SessionStore(fakeDatabase(), "plan"),
    maxMemoryMessages: 40,
  });
  const layouts = [];
  await session.createNpcs({
    quantity: 2,
    language: "Portuguese",
    places: PLACES,
    lots: [
      { id: "lot_north", description: "north meadow" },
      { id: "lot_east", description: "by the sea" },
    ],
    onVillagePlanned: (built) => layouts.push(built),
  });

  assert.deepEqual(session.villageLayout(), [
    { id: "lot_north", name: "Ferraria", kind: "work" },
    { id: "lot_east", name: "Casa", kind: "home" },
  ]);
  assert.equal(layouts.length, 1);
  assert.equal(session.getNpc(1).data.routine[0], "lot_north", "works there");
  assert.equal(session.getNpc(2).data.routine[0], "lot_east", "lives there");
  assert.ok(session.isBuilding("lot_east"));
  assert.match(session.worldContext, /Ferraria/);
});
