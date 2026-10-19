// Tools (functions) the NPC can call while chatting with the player.
// The frontend reacts to them through the `npc_action` message.

const lastWordsProperty = (description) => ({
  type: "string",
  description,
});

const tool = (name, description, properties) => ({
  type: "function",
  function: {
    name,
    description,
    parameters: {
      type: "object",
      properties,
      required: Object.keys(properties),
    },
  },
});

/**
 * @param {object} village
 * @param {{id: string, name: string}[]} village.places Places the NPC can
 *   guide the player to.
 * @param {{name: string}[]} village.villagers Other NPCs the NPC can
 *   introduce the player to.
 */
export function buildNpcTools({
  places = [],
  villagers = [],
  items = [],
} = {}) {
  const tools = [
    tool(
      "endConversation",
      "End the conversation with the player when you have no more to say or when the player says goodbye, farewell, bye bye, see you later, and so on to you.",
      {
        lastWords: lastWordsProperty(
          "The last words that you want to say before leaving the conversation. You can provide an empty string if you don't want to say anything.",
        ),
      },
    ),
    tool(
      "followPlayer",
      "Follow the player when the player asks you to follow him or when you want to do it.",
      {
        lastWords: lastWordsProperty(
          "The last words that you want to say before following the player. You can provide an empty string if you don't want to say anything.",
        ),
      },
    ),
    tool(
      "stopFollowPlayer",
      "Stop following the player when the player asks you to stop or when you want to do it.",
      {
        lastWords: lastWordsProperty(
          "The last words that you want to say before stop following the player. You can provide an empty string if you don't want to say anything.",
        ),
      },
    ),
  ];

  if (places.length) {
    tools.push(
      tool(
        "guidePlayerTo",
        "Walk with the player to a place of the village, when the player asks you to take them there (or asks where it is and you want to show it).",
        {
          placeId: {
            type: "string",
            enum: places.map((place) => place.id),
            description: "The id of the place.",
          },
          lastWords: lastWordsProperty(
            "What you say before starting to walk, e.g. 'Follow me, it's this way.'",
          ),
        },
      ),
    );
  }

  if (villagers.length) {
    tools.push(
      tool(
        "introducePlayerTo",
        "Take the player to meet another villager (not yourself), when the player asks to meet or find them.",
        {
          villager: {
            type: "string",
            enum: villagers.map((villager) => villager.name),
            description: "The name of the villager.",
          },
          lastWords: lastWordsProperty(
            "What you say before taking the player to the villager.",
          ),
        },
      ),
    );
  }

  tools.push(
    tool(
      "giveQuest",
      "Ask the traveler for help with a concrete problem of yours (deliver something or a message, find something out, bring you something...). Use it only when it comes up naturally in the conversation, never more than one request at a time.",
      {
        title: {
          type: "string",
          description: "Short title of the request, in the player's language.",
        },
        description: {
          type: "string",
          description:
            "What exactly the traveler must do, in the player's language.",
        },
        villager: {
          type: "string",
          enum: ["", ...villagers.map((villager) => villager.name)],
          description:
            "The other villager involved in the request (who receives the message or item, who knows the answer...), or an empty string.",
        },
        hours: {
          type: "integer",
          description:
            "Deadline in game hours (1 to 12) when it is urgent, e.g. 'before nightfall'; 0 when there is no hurry. Say the deadline when asking.",
        },
        item: {
          type: "string",
          enum: ["", ...items],
          description:
            "When the request is to BRING something gathered beyond the island (forest, mine, islands), which thing; otherwise an empty string. Only these exist.",
        },
        quantity: {
          type: "integer",
          description:
            "How many of `item` (1 to 5), or 0 when there is no item. Say where it can be found when asking.",
        },
        lastWords: lastWordsProperty("What you say when asking for help."),
      },
    ),
    tool(
      "completeQuest",
      "Mark a request as done, when the traveler did what was asked (delivered the message to you, brought you what you asked, found out what you wanted to know...).",
      {
        questId: {
          type: "integer",
          description: "The id of the request.",
        },
        lastWords: lastWordsProperty(
          "What you say, e.g. thanking the traveler.",
        ),
      },
    ),
    tool(
      "giveItem",
      "Give an item to the traveler (something you made, sold, owe or want to give as a reward). Coins are 'moedas'.",
      {
        item: {
          type: "string",
          description: "Name of the item, singular, in the player's language.",
        },
        quantity: { type: "integer", description: "How many (1 to 5)." },
        lastWords: lastWordsProperty("What you say when giving it."),
      },
    ),
    tool(
      "takeItem",
      "Take an item the traveler is carrying, when they give it to you, pay you (coins are 'moedas') or bring what you asked for. Only items the traveler really has.",
      {
        item: {
          type: "string",
          description: "Name of the item, as in the traveler's inventory.",
        },
        quantity: { type: "integer", description: "How many." },
        accept: {
          type: "boolean",
          description:
            "true to really take it; false when you refuse an offer (bribe, payment, gift): then nothing changes hands.",
        },
        gift: {
          type: "boolean",
          description: "true when the traveler is giving it to you as a gift.",
        },
        lastWords: lastWordsProperty("What you say when taking it."),
      },
    ),
    tool(
      "sellItem",
      "Sell to the traveler one of the things you sell, when they want to buy it. The coins are charged automatically with your price.",
      {
        item: {
          type: "string",
          description: "Name of the item, exactly as in your list.",
        },
        quantity: { type: "integer", description: "How many (1 to 5)." },
        lastWords: lastWordsProperty("What you say when selling it."),
      },
    ),
    tool(
      "buyItem",
      "Buy something the traveler is carrying and offers to sell you (fish, herbs, flowers, things they found...). You pay with coins.",
      {
        item: {
          type: "string",
          description: "Name of the item, as in the traveler's inventory.",
        },
        quantity: { type: "integer", description: "How many (1 to 5)." },
        price: {
          type: "integer",
          description: "How many coins you pay for EACH one (1 to 15).",
        },
        lastWords: lastWordsProperty("What you say when buying it."),
      },
    ),
    tool(
      "setBond",
      "Change your relationship with the traveler when it clearly changed in the conversation: you became friends, best friends, you accept their romantic feelings (or declare yours), you became rivals, or you end it ('none').",
      {
        bond: {
          type: "string",
          enum: ["friend", "best_friend", "romance", "rival", "none"],
          description: "The new relationship.",
        },
        lastWords: lastWordsProperty("What you say."),
      },
    ),
    tool(
      "acceptInvitation",
      "Accept the traveler's invitation to go together to today's gathering of the village. Only if you want to go with them.",
      {
        lastWords: lastWordsProperty("What you say when accepting."),
      },
    ),
    tool(
      "startSparring",
      "Start a friendly training fight with the traveler, when they ask to train or spar (or you challenge them for fun). Nobody gets hurt: whoever is losing gives up.",
      {
        lastWords: lastWordsProperty(
          "What you say before starting, e.g. 'Let's see what you've got!'",
        ),
      },
    ),
    tool(
      "startFight",
      "Start a real fight with the traveler: challenge them to a duel (e.g. you are rivals and want to settle who is stronger), or attack them when they seriously provoked or threatened you, or when you are cornered. It is serious: the loser is knocked out and everybody who sees it will talk.",
      {
        kind: {
          type: "string",
          enum: ["duel", "fight"],
          description: "duel: both agree to fight; fight: you attack them.",
        },
        lastWords: lastWordsProperty("What you shout before fighting."),
      },
    ),
    tool(
      "confess",
      "Confess that you are responsible for the mystery of the village. Only when you really did it and the traveler confronted you with clear evidence.",
      {
        lastWords: lastWordsProperty("Your confession: what you did and why."),
      },
    ),
  );

  return tools;
}

// Result reported back to the model for each tool call.
export const NPC_TOOL_RESULTS = {
  endConversation: "Conversation ended.",
  followPlayer: "You are now following the player.",
  stopFollowPlayer: "You stopped following the player.",
  guidePlayerTo: "You are now walking with the player to the place.",
  introducePlayerTo: "You are now taking the player to meet the villager.",
  giveQuest: "The traveler now knows about your request.",
  completeQuest: "The request is done.",
  giveItem: "The item is now with the traveler.",
  takeItem: "You now have the item.",
  refuseItem: "You refused it: nothing changed hands.",
  sellItem: "The traveler paid and has the item now.",
  confess:
    "You confessed to the traveler. Only they know; they will decide whether to tell the village.",
  buyItem: "You bought it.",
  setBond: "Your relationship with the traveler changed.",
  startSparring: "The training fight starts now.",
  startFight: "The fight starts now.",
  acceptInvitation:
    "You will meet the traveler at the gathering and go together.",
};
