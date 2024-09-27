// Prompt utilizado para a geração dinâmica de NPCs
//
// Obs: As variáveis devem ser substituídas por valores literais

`
# Introduction

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
