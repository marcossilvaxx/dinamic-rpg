// What the player can gather beyond the island, from the generated maps of
// the regions (the client tells how many trees, rocks... each one has).
// The villagers ask only for these things in their requests (`giveQuest`
// with item and quantity), and the request is done when the player brings
// them.

import { ISLETS, REGIONS } from "./Regions.js";

// Items of each kind of node (see rollNode in Regions.js) and the tool
const ITEMS = {
  lenha: { kind: "tree", tool: "um machado" },
  cogumelo: { kind: "forage" },
  "frutas silvestres": { kind: "forage" },
  ervas: { kind: "forage" },
  "mel silvestre": { kind: "forage" },
  "minério de ferro": { kind: "ore", tool: "uma picareta" },
  carvão: { kind: "ore", tool: "uma picareta" },
  cristal: { kind: "crystal", tool: "uma picareta" },
};
export const MAX_GATHER_QUANTITY = 5;
const KINDS = ["tree", "ore", "crystal", "forage"];
const PLACES = { ...REGIONS, ...ISLETS };

/** What the client sent: { regionId: { tree: n, ... } }, sanitized. */
export function sanitizeResources(resources) {
  if (!resources || typeof resources !== "object") return null;
  const result = {};
  for (const id of Object.keys(PLACES)) {
    const counts = resources[id];
    if (!counts || typeof counts !== "object") continue;
    result[id] = Object.fromEntries(
      KINDS.map((kind) => [
        kind,
        Math.min(Math.max(Math.round(Number(counts[kind]) || 0), 0), 50),
      ]),
    );
  }
  return result;
}

/**
 * Items that can be gathered now, with where: regions and the islets the
 * player already found.
 * @returns {{item: string, where: {id: string, name: string, count: number}[], tool: string|null}[]}
 */
export function gatherableItems(resources, discovered = []) {
  if (!resources) return [];
  const places = Object.keys(resources).filter(
    (id) => REGIONS[id] || discovered.includes(id),
  );
  return Object.entries(ITEMS)
    .map(([item, { kind, tool }]) => ({
      item,
      tool: tool ?? null,
      where: places
        .filter((id) => resources[id][kind] > 0)
        .map((id) => ({
          id,
          name: PLACES[id].name,
          count: resources[id][kind],
        })),
    }))
    .filter(({ where }) => where.length);
}

/** For the prompts of the villagers. */
export const describeGathering = (items) =>
  items
    .map(
      ({ item, where, tool }) =>
        `- ${item}: ${where.map(({ name, count }) => `${name} (${count} spots)`).join(", ")}${tool ? `; needs ${tool}` : ""}`,
    )
    .join("\n");
