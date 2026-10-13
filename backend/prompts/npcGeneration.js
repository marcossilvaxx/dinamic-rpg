// Prompt utilizado para a geração dinâmica de NPCs.
//
// Cada NPC recebe um sprite sorteado previamente (ver GameSession), o que
// permite gerar todos os NPCs em paralelo sem que fiquem repetidos.

export const SPRITES = {
  warriorM:
    "A battle-hardened male warrior clad in heavy armor. His broad shoulders carry a massive sword, and his stern gaze reflects years of combat experience. He is ready to defend the kingdom at any cost.",
  warriorF:
    "A fierce female warrior donning intricately crafted armor. With a strong build and a large shield, she stands as a beacon of courage, wielding her sword with unmatched precision in defense of her people.",
  mageM:
    "A wise male mage draped in robes adorned with ancient runes. His piercing eyes glow with arcane power as he raises his staff, channeling mystical energy to cast powerful spells from afar.",
  mageF:
    "A graceful female mage with flowing robes and an aura of mystery. Her hands crackle with magical energy as she prepares to unleash a spell, her wisdom and power transcending the physical realm.",
  ninjaM:
    "A swift and stealthy male ninja clad in dark, sleek armor. His movements are silent as the night, with blades at the ready, poised to strike from the shadows with lethal precision.",
  ninjaF:
    "A nimble and deadly female ninja dressed in lightweight, dark attire. Her agility and cunning make her a master of stealth, moving through the shadows unseen, with shurikens and daggers always within reach.",
  townfolkM:
    "A humble male townsperson dressed in simple clothing. With a weathered face and calloused hands, he spends his days working the land or managing a shop, contributing to the lifeblood of the village.",
  townfolkF:
    "A hardworking female townsperson dressed in modest attire. Her kind eyes reflect her dedication to the community, whether she's tending to the market, the fields, or her family.",
  healerM:
    "A gentle male healer wearing robes of pure white, carrying a staff adorned with healing crystals. His presence brings comfort and serenity, always ready to tend to the wounded and sick with restorative magic.",
  healerF:
    "A compassionate female healer clothed in white robes, with a soft glow surrounding her. Her healing touch and soothing voice bring peace to those in pain, as she uses her magic to mend wounds and lift spirits.",
  rangerM:
    "A rugged male ranger equipped with a longbow and leather armor, skilled in tracking and survival. His sharp eyes scan the horizon as he moves swiftly through the forests, protecting the wilderness and his people.",
  rangerF:
    "A skilled female ranger with a sharp gaze and unmatched marksmanship. Wearing lightweight leather armor, she navigates the wilderness with ease, her bow always at the ready to defend the realm from unseen threats.",
};

// What the NPC is doing while working (an icon over their head in the game)
export const WORK_KINDS = [
  "smithing",
  "fishing",
  "farming",
  "cooking",
  "trading",
  "healing",
  "crafting",
  "guarding",
  "hunting",
  "studying",
  "none",
];

export const spriteGender = (sprite) =>
  sprite.endsWith("F") ? "Female" : "Male";

export const npcGenerationPrompt = ({
  context,
  name,
  occupation,
  sprite,
  language = "English",
  home = null,
}) => `${context}
# Introduction

You are a fictional-adventure writer. I want you to create the details of one of the villagers above, in a simulated 2 dimensional medieval world.

# Character Information

The character is ${name}, ${occupation}. ${name} is ${spriteGender(sprite).toLowerCase()} and looks like this:

${SPRITES[sprite]}

Firstly, create a personality for ${name}. Secondly, create a story for ${name} and their origins, based on the world history. Be creative, but keep the character grounded and concrete: where they live and work in the village, what they do every day, which of the other villagers they know and what they want or worry about right now. Only mention people from the villagers list by name.

Thirdly, choose ${name}'s daily routine: 2 or 3 places of the village (by id) where they spend the day, coherent with their occupation and story. The first one is where they work or live.${home ? ` ${name} ${home.kind === "home" ? "lives" : "works"} at ${home.name} (id: ${home.id}): it MUST be the first place of the routine, and the story should mention it.` : ""}

Fourthly, give ${name} a secret: something small and concrete they hide from the others and would lie about (a debt, a broken promise, a hidden habit, a crush, a mistake at work...). It must NOT be a crime that hurts the village.

Fifthly, list what ${name} sells or trades because of their work ("wares"): 0 to 3 concrete items with the price in coins (1 to 20). Item names are short, singular and in ${language} (e.g. "pão", "peixe seco", "corda"). Use an empty list if their work doesn't sell anything.

Then choose "work": the activity ${name} is doing while working (one of the options; "none" if nothing fits).

Then list 2 things ${name} loves to receive as a gift ("likes") and 1 thing they dislike ("dislikes"): short, concrete item names in ${language} (e.g. "flores", "peixe", "mel").

Finally, give ${name} a personal goal for the next days ("goal"): something concrete and achievable in the village that they work towards (e.g. "save 30 coins to fix the roof of the tavern", "win the fishing contest", "make peace with their brother"). One short sentence in ${language} (it is shown to the player).

You shouldn't repeat informations.

# Responses

You must supply your responses in the form of valid JSON objects. The following is an example of a valid response:

{
  "personality": ["peaceful", "garrulous", "wary", "envious"],
  "story": "Joseph was born in the village and lost his parents when he was 5 years old. He grew up fishing at the pier and now sells fish at the tavern every morning. He is saving money to buy a bigger boat.",
  "routine": ["dock", "tavern"],
  "secret": "Joseph owes 15 coins to the tavern and tells everyone he already paid.",
  "wares": [{ "item": "peixe", "price": 3 }],
  "work": "fishing",
  "likes": ["mel", "anzol"],
  "dislikes": ["cebola"],
  "goal": "Juntar 40 moedas para comprar um barco maior."
}
`;

export const npcGenerationSchema = (placeIds) => ({
  name: "character",
  schema: {
    type: "object",
    properties: {
      personality: { type: "array", items: { type: "string" } },
      story: { type: "string" },
      routine: {
        type: "array",
        items: placeIds.length
          ? { type: "string", enum: placeIds }
          : { type: "string" },
      },
      secret: { type: "string" },
      wares: {
        type: "array",
        items: {
          type: "object",
          properties: {
            item: { type: "string" },
            price: { type: "integer" },
          },
          required: ["item", "price"],
          additionalProperties: false,
        },
      },
      work: { type: "string", enum: WORK_KINDS },
      likes: { type: "array", items: { type: "string" } },
      dislikes: { type: "array", items: { type: "string" } },
      goal: { type: "string" },
    },
    required: [
      "personality",
      "story",
      "routine",
      "secret",
      "wares",
      "work",
      "likes",
      "dislikes",
      "goal",
    ],
    additionalProperties: false,
  },
});
