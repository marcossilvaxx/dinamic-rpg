// Prompt utilizado para decidir o que é construído nos terrenos vazios da
// vila (casas e lugares de trabalho), quem mora ou trabalha em cada um, como
// cada prédio é por fora e que móveis tem por dentro. O frontend desenha os
// prédios e os interiores a partir disso (src/world/procedural).

// Options the frontend knows how to draw (mirrored in world/procedural)
export const TRADES = [
  "home",
  "bakery",
  "smithy",
  "clinic",
  "fisher",
  "farm",
  "school",
  "tailor",
  "shop",
  "tavern",
];
export const ROOFS = ["red", "slate", "green", "brown", "thatch", "teal"];
export const WALLS = ["plaster", "wood", "stone", "brick"];
export const SIGNS = [
  "none",
  "bread",
  "anvil",
  "cross",
  "fish",
  "wheat",
  "book",
  "potion",
  "mug",
  "needle",
];
export const DECOR = [
  "flowers",
  "barrels",
  "crates",
  "anvil",
  "hay",
  "net",
  "woodpile",
  "herbs",
  "bench",
  "lantern",
];
export const FURNITURE = [
  "bed",
  "cot",
  "table",
  "stool",
  "shelf",
  "bottles",
  "stove",
  "fireplace",
  "forge",
  "anvil",
  "workbench",
  "counter",
  "barrel",
  "crate",
  "sacks",
  "plant",
  "chest",
  "cauldron",
  "herbs",
  "oven",
  "desk",
  "rug",
];

export const villagePlanPrompt = ({
  worldHistory,
  villagers,
  places,
  lots,
  language,
}) => `
You are designing the village of a 2D medieval RPG. This is its story:

${worldHistory}

# Villagers

${villagers.map(({ slot, name, occupation }) => `- Slot ${slot}: ${name}, ${occupation}`).join("\n")}

# Buildings that already exist

${places
  .filter((place) => place.building)
  .map(({ name, description }) => `- ${name}: ${description}`)
  .join("\n")}

# Empty lots

${lots.map(({ id, description }) => `- ${id}: ${description}`).join("\n")}

# Task

Decide what is built on the empty lots, so the village fits its story and its people. Build on at least 2 lots (you may use all of them). Each building is either:
- "home": where one or more villagers live (a family, a couple, someone who needs a house of their own);
- "work": where someone works, following their occupation (a smithy, a bakery, a clinic, a carpenter's workshop, a chapel, a school...).

For each building give:
- "lot": the id of the lot;
- "kind": "home" or "work";
- "trade": what the building is (${TRADES.join(", ")}); "home" for a plain house;
- "name": a short name shown to the player, in ${language} (e.g. "Ferraria de Bruno", "Casa dos Valdez", "Padaria");
- "description": one short sentence in English describing the building for the story;
- "owners": the slots of the villagers who live or work there (1 to 3; a villager may appear in only one building);
- "look": how it looks from outside, fitting its trade, its owners and the story (make the buildings different from each other): "size" (small, medium or large), "roofStyle" (gable: pointed facade; ridge: long roof), "roof" color, "wall" material, "timber" (wooden beams on plaster walls), "windows" (1 to 3), "chimney", "sign" (the picture on the sign of a workplace, "none" for homes) and "decor" (1 to 3 things by the door);
- "furniture": 7 to 11 pieces for the inside, fitting who lives or works there (repeat a piece to have more of it, e.g. two "stool"). A home needs a "bed".
`;

export const villagePlanSchema = {
  name: "village_plan",
  schema: {
    type: "object",
    properties: {
      buildings: {
        type: "array",
        items: {
          type: "object",
          properties: {
            lot: { type: "string" },
            kind: { type: "string", enum: ["home", "work"] },
            name: { type: "string" },
            description: { type: "string" },
            owners: { type: "array", items: { type: "integer" } },
            trade: { type: "string", enum: TRADES },
            look: {
              type: "object",
              properties: {
                size: { type: "string", enum: ["small", "medium", "large"] },
                roofStyle: { type: "string", enum: ["gable", "ridge"] },
                roof: { type: "string", enum: ROOFS },
                wall: { type: "string", enum: WALLS },
                timber: { type: "boolean" },
                windows: { type: "integer" },
                chimney: { type: "boolean" },
                sign: { type: "string", enum: SIGNS },
                decor: {
                  type: "array",
                  items: { type: "string", enum: DECOR },
                },
              },
              required: [
                "size",
                "roofStyle",
                "roof",
                "wall",
                "timber",
                "windows",
                "chimney",
                "sign",
                "decor",
              ],
              additionalProperties: false,
            },
            furniture: {
              type: "array",
              items: { type: "string", enum: FURNITURE },
            },
          },
          required: [
            "lot",
            "kind",
            "trade",
            "name",
            "description",
            "owners",
            "look",
            "furniture",
          ],
          additionalProperties: false,
        },
      },
    },
    required: ["buildings"],
    additionalProperties: false,
  },
};
