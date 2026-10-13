// Websocket message types shared by backend and frontend
// (mirrored in frontend/src/net/protocol.js).
//
// Every message is a JSON object: { type, agentId?, data }

// Client -> server
// data: { quantity, language, places: [{ id, name, description, building? }],
//         lots: [{ id, description }] (empty lots the village plan may use),
//         worldEventIntervalMs?, resumeSessionId? }
export const CREATE_AGENTS = "create_agents";
export const ACCUSE = "accuse"; // data: { npcId } (mystery of the village)
export const CHAT = "chat"; // agentId, data: { message }
export const CHAT_CLOSED = "chat_closed"; // agentId
// agentId, data: { companionId? } (NPC walking with the player). The NPC may
// greet the player first (chat_response)
export const CHAT_OPENED = "chat_opened";
// data: { decision: "expose" | "protect" } (after a confession)
export const MYSTERY_DECISION = "mystery_decision";
// data: { kind: "fishing" | "gathering", result: "miss" | "hit" | "perfect" }
export const ACTIVITY = "activity";
// data: { objectId } (use an object of the map: well, chest, crops..., or
// "rest" in a bed, "tavern_meal" at the counter of the tavern and
// "rebuild:<placeId>" to help rebuilding a burned building; in the regions:
// "travel:<region|village>", "tree_N", "ore_N", "crystal_N", "forage_N",
// "camp_chest" and "trade:<merchant>:<buy|sell>:<index>")
export const INTERACT = "interact";
// data: { tiles: [[index, steps]] } (people walked on these tiles)
export const WEAR = "wear";
// data: { npcId, winner: "player" | "npc" | "none", witnesses: [npcId] }
export const FIGHT_END = "fight_end";
// data: { npcId } (the player hit an NPC out of a fight)
export const PLAYER_ATTACKED = "player_attacked";
// data: { guardId } (the guard reached the player)
export const GUARD_ARRIVED = "guard_arrived";
// data: { banditId } (the player beat a bandit)
export const BANDIT_DEFEATED = "bandit_defeated";
// The bandits knocked out the player
export const KNOCKED_OUT_BY_BANDITS = "knocked_out_by_bandits";
// data: { item } (eat or use something to heal)
export const USE_ITEM = "use_item";
// data: { paused } (the server answers with the clock)
export const SET_PAUSED = "set_paused";
// data: { a, b, placeId?, isPrivate? } (isPrivate: the player isn't seen)
export const NPC_ENCOUNTER = "npc_encounter";
// data: { conversationId, shownLines, interruptedBy?, noticedPlayer? }
export const NPC_CONVERSATION_END = "npc_conversation_end";

// Server -> client
// data: { lots: [{ id, name, kind: "home" | "work" }] } (what was built on
// the empty lots; sent before the NPCs)
export const VILLAGE_LAYOUT = "village_layout";
// data: { agent, created, total } or { agent, visitor: true }
export const AGENT_CREATED = "agent_created";
export const AGENT_LEFT = "agent_left"; // agentId (a visitor left)
// agentId, data: { routine } (moved in with their partner) or { injured }
export const NPC_UPDATED = "npc_updated";
// agentId, data: { callout, durationMs }: walks with the player for a while
export const NPC_FOLLOW = "npc_follow";
// data: { ok, message, item?, quantity? }
export const ACTIVITY_RESULT = "activity_result";
// data: { objectId, ok, message, item?, quantity?, rested? (game minutes),
//         travel? (where the player arrived) }
export const INTERACT_RESULT = "interact_result";
// data: { status }
export const MYSTERY_DECISION_RESULT = "mystery_decision_result";
// agentId, data: { reaction: "fight" | "flee", callout, guardId, guardCallout }
export const NPC_REACTION = "npc_reaction";
// agentId, data: { taunts: [], lose, win } (lines of the NPC in a fight)
export const FIGHT_LINES = "fight_lines";
// data: { ok, item, heal }
export const ITEM_USED = "item_used";
export const AGENTS_CREATED = "agents_created"; // data: [agent]
export const CHAT_RESPONSE = "chat_response"; // agentId, data: { content }
// agentId, data: { content } (the answer so far, while the NPC writes it)
export const CHAT_DELTA = "chat_delta";
// agentId: the NPC is writing a message nobody asked for (a greeting)
export const NPC_TYPING = "npc_typing";
// agentId, data: { callout }: the NPC goes after the player to tell something
export const NPC_SEEKS_PLAYER = "npc_seeks_player";
// data: { weather, season, seasonLabel, raid: { placeId, until, bandits:
//         [{ id, name, sprite, leader }] } | null, map: { ground, farm,
//         wrecks, structures, tracks, emptyChests } (game/VillageMap.js),
//         terrain: { wear: [[index, 0..100]], burned: [{ placeId, progress }] },
//         regions: { location, depleted: ["forest:tree_3"], camp: { bandits,
//         guarded, chestLooted } },
//         festival: { day, title, description, placeId, placeName,
//         startHour, endHour, status } | null }
export const WORLD_STATE = "world_state";
// agentId, data: { action, lastWords, placeId?, targetId? }
export const NPC_ACTION = "npc_action";
export const WORLD_EVENT = "world_event"; // data: { headline }
// Sent first, so the client can resume the session after a reload
export const SESSION = "session"; // data: { sessionId, resumed }
// Reputation, inventory, quests, mystery, news... (journal)
export const PLAYER_STATE = "player_state";
// data: { totalMinutes, msPerGameMinute, paused }
export const CLOCK = "clock";
export const NOTIFICATION = "notification"; // data: { text, kind }
// data: [{ a, b, affinity, couple }] (all pairs that talked)
export const RELATIONSHIPS = "relationships";
// Result of an accusation: data: { correct, status, attemptsLeft, accused }
export const ACCUSATION_RESULT = "accusation_result";
// data: { conversationId, a, b, lines: [{ speakerId, text, emotion }],
//         outcome: { action, targetId, callout } }
export const NPC_DIALOGUE = "npc_dialogue";
export const ERROR = "error"; // agentId?, data: { message, requestType, request }
