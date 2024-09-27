import { conversationHistory } from "./index.js";
import { chatMemory } from "./data/ChatMemory.js";
import { apiHandler } from "./api/index.js";
import { npcStorage } from "./data/NpcStorage.js";
import { masterStorage } from "./data/MasterStorage.js";

const ALLOWED_FUNCTIONS = [
  {
    type: "function",
    function: {
      name: "endConversation",
      description:
        "End the conversation with the player when you have no more to say or when the player says goodbye, farewell, bye bye, see you later, and so on to you.",
      parameters: {
        type: "object",
        properties: {
          lastWords: {
            type: "string",
            description:
              "The last words that you want to say before leaving the conversation. You can provide an empty string if you don't want to say anything.",
          },
        },
        required: ["lastWords"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "followPlayer",
      description:
        "Follow the player when the player asks you to follow him or when you want to do it.",
      parameters: {
        type: "object",
        properties: {
          lastWords: {
            type: "string",
            description:
              "The last words that you want to say before following the player. You can provide an empty string if you don't want to say anything.",
          },
        },
        required: ["lastWords"],
      },
    },
  },
  {
    type: "function",
    function: {
      name: "stopFollowPlayer",
      description:
        "Stop following the player when the player asks you to stop or when you want to do it.",
      parameters: {
        type: "object",
        properties: {
          lastWords: {
            type: "string",
            description:
              "The last words that you want to say before stop following the player. You can provide an empty string if you don't want to say anything.",
          },
        },
        required: ["lastWords"],
      },
    },
  },
];

const functionsResponses = {
  endConversation: "Conversation ended.",
  followPlayer: "You are now following the player.",
  stopFollowPlayer: "You stopped following the player.",
};

class ServerAgent {
  constructor(id) {
    this.id = id;
  }

  async initialSetup({ worldHistory }) {
    try {
      const prompt = `# Introduction

      You are a super creative fictional-adventure writter. I want you to create an character living in a simulated 2 dimensional universe. It's a medieval world, with houses, trees and water.

      # World History

      This is the world history:

      ${worldHistory}
      
      # Character Information
      
      Firstly, you need to create a name, a gender and a personality for your character. Secondly, you need to create a story for your character and its origins, based on the world history. Thirdly, you need to choose the character sprite based on the sprite description. Remember: Choose the sprite with the description that makes more sense related to their story, gender and personality. Try to give the more random responses that you can. BE CREATIVE!

      You shouldn't repeat informations.

      These are the sprites and their descriptions:

      warriorM: "A battle-hardened male warrior clad in heavy armor. His broad shoulders carry a massive sword, and his stern gaze reflects years of combat experience. He is ready to defend the kingdom at any cost.",

      warriorF: "A fierce female warrior donning intricately crafted armor. With a strong build and a large shield, she stands as a beacon of courage, wielding her sword with unmatched precision in defense of her people.",

      mageM: "A wise male mage draped in robes adorned with ancient runes. His piercing eyes glow with arcane power as he raises his staff, channeling mystical energy to cast powerful spells from afar.",

      mageF: "A graceful female mage with flowing robes and an aura of mystery. Her hands crackle with magical energy as she prepares to unleash a spell, her wisdom and power transcending the physical realm.",

      ninjaM: "A swift and stealthy male ninja clad in dark, sleek armor. His movements are silent as the night, with blades at the ready, poised to strike from the shadows with lethal precision.",

      ninjaF: "A nimble and deadly female ninja dressed in lightweight, dark attire. Her agility and cunning make her a master of stealth, moving through the shadows unseen, with shurikens and daggers always within reach.",

      townfolkM: "A humble male townsperson dressed in simple clothing. With a weathered face and calloused hands, he spends his days working the land or managing a shop, contributing to the lifeblood of the village.",

      townfolkF: "A hardworking female townsperson dressed in modest attire. Her kind eyes reflect her dedication to the community, whether she's tending to the market, the fields, or her family.",

      healerM: "A gentle male healer wearing robes of pure white, carrying a staff adorned with healing crystals. His presence brings comfort and serenity, always ready to tend to the wounded and sick with restorative magic.",

      healerF: "A compassionate female healer clothed in white robes, with a soft glow surrounding her. Her healing touch and soothing voice bring peace to those in pain, as she uses her magic to mend wounds and lift spirits.",

      rangerM: "A rugged male ranger equipped with a longbow and leather armor, skilled in tracking and survival. His sharp eyes scan the horizon as he moves swiftly through the forests, protecting the wilderness and his people.",

      rangerF: "A skilled female ranger with a sharp gaze and unmatched marksmanship. Wearing lightweight leather armor, she navigates the wilderness with ease, her bow always at the ready to defend the realm from unseen threats."

      # Responses
      
      You must supply your responses in the form of valid JSON objects.  The following is an example of a valid response:
      
      {
        name: "Joseph",
        gender: "Male" | "Female" | "Unknown",
        personality: ["peaceful", "garrulous", "wary", "envious"],
        story: "Joseph born in this city and lost his parents when he was 5 years old. After that he grew up in the forests and learned how to survive by himself. One day he met a beautiful lady that gave him a mysterious necklace. He never found out the importance and the value of that necklace.",
        sprite: "rangerM"
      }

      The JSON response indicating the character information is:
      `;

      const completion = await apiHandler.callChatCompletion(
        prompt,
        0,
        conversationHistory
      );

      console.log("completion", completion);

      npcStorage.setData(this.id, completion);

      return completion;
    } catch (error) {
      console.error("Error processing response:", error);
    }
  }

  async chat(message) {
    try {
      const memory = (await chatMemory.get(this.id)) || [];

      const data = (await npcStorage.getData(this.id)) || {};

      const worldHistory = ((await masterStorage.getWorld()) || {})
        .worldHistory;

      const prompt = `# Introduction

      You are acting as an NPC living in a simulated 2 dimensional universe. You will need to chat with the Player. DON'T LET THE PLAYER KNOW THAT YOU ARE AN NPC. You need to act as it is the real life.

      # Background

      Your name is: ${data.name}.

      Your gender is: ${data.gender}.

      Your are: ${data.personality.join(", ")}.

      This is your story: ${data.story}

      This is the history of your world:

      ${worldHistory}

      # Responses
      
      When the player talks to you, you must supply your response in the form of valid JSON objects. When choosing what to say, please consider your personality, your story and the history of your world. You must respond using the same language the player used when speaking to you. The following is an example of a valid response:
      
      {
        response: {
          content: "Hi, how are you? What's your name?",
        }
      }

      # Let's start

      ${
        memory.length === 0
          ? "This is the first time the player talk to you."
          : "You and the player have talked before. Use the content from recent conversations in the current conversation if necessary."
      }
      
      This is what the player says: ${message}

      The JSON response indicating what you want to say is:
      `;

      const completion = await apiHandler.callChatCompletion(
        prompt,
        0,
        memory,
        ALLOWED_FUNCTIONS,
        functionsResponses
      );

      chatMemory.set(this.id, memory);
      return completion;
    } catch (error) {
      console.error("Error processing response:", error);
    }
  }
}

export default ServerAgent;
