// Rules of the fights between the player and the NPCs. No browser imports on
// purpose: tested with node.

export const PLAYER_PROFILE = {
  maxHp: 100,
  damage: 10,
  range: 22, // px from the center of the attacker
  cooldownMs: 400,
  speed: 1,
};

// Combat profile of each class of sprite (see backend prompts/npcGeneration)
const CLASS_PROFILES = {
  warrior: {
    maxHp: 120,
    damage: 13,
    range: 22,
    cooldownMs: 1200,
    windupMs: 450,
    speed: 0.8,
  },
  ninja: {
    maxHp: 80,
    damage: 9,
    range: 20,
    cooldownMs: 750,
    windupMs: 300,
    speed: 1.3,
    dodgeChance: 0.25,
  },
  ranger: {
    maxHp: 85,
    damage: 9,
    range: 90,
    cooldownMs: 1500,
    windupMs: 400,
    speed: 1,
    projectile: { speed: 2.2, color: "#8d6e63" },
    keepDistance: 55,
  },
  mage: {
    maxHp: 75,
    damage: 12,
    range: 100,
    cooldownMs: 1900,
    windupMs: 600,
    speed: 0.9,
    projectile: { speed: 1.4, color: "#7e57c2" },
    keepDistance: 65,
  },
  healer: {
    maxHp: 90,
    damage: 7,
    range: 20,
    cooldownMs: 1100,
    windupMs: 400,
    speed: 0.9,
    heal: 30,
  },
  townfolk: {
    maxHp: 70,
    damage: 7,
    range: 20,
    cooldownMs: 1300,
    windupMs: 450,
    speed: 0.9,
  },
};

// Occupations that make someone tougher (guards, smiths...) or weaker
const TOUGH_WORDS =
  /guard|soldier|warrior|watch|smith|hunter|knight|captain|guarda|soldad|ferreir|caçador|cacador/i;
const FRAIL_WORDS =
  /scholar|scribe|keeper|merchant|baker|weaver|estudios|escriba|comerciante|padeir|tecel/i;

/** "warriorM" -> "warrior" */
export const spriteClass = (sprite = "") =>
  sprite.replace(/[MF]$/, "") in CLASS_PROFILES
    ? sprite.replace(/[MF]$/, "")
    : "townfolk";

/**
 * Combat profile of an NPC, from its sprite and occupation.
 * @param {{sprite?: string, occupation?: string}} data
 */
export function combatProfile({
  sprite,
  occupation = "",
  bandit = false,
} = {}) {
  const profile = { dodgeChance: 0, ...CLASS_PROFILES[spriteClass(sprite)] };

  // Bandits come in groups: each one is a bit weaker
  if (bandit) {
    profile.maxHp = Math.round(profile.maxHp * 0.75);
    profile.damage = Math.round(profile.damage * 0.8);
    return profile;
  }

  if (TOUGH_WORDS.test(occupation)) {
    profile.maxHp += 20;
    profile.damage += 2;
  } else if (FRAIL_WORDS.test(occupation)) {
    profile.maxHp -= 10;
  }

  return profile;
}

const center = ({ position, width = 16, height = 12 }) => ({
  x: position.x + width / 2,
  y: position.y + height / 2,
});

const DIRECTION_VECTORS = {
  UP: { x: 0, y: -1 },
  DOWN: { x: 0, y: 1 },
  LEFT: { x: -1, y: 0 },
  RIGHT: { x: 1, y: 0 },
};

export const distanceBetween = (a, b) => {
  const ca = center(a);
  const cb = center(b);
  return Math.hypot(ca.x - cb.x, ca.y - cb.y);
};

/**
 * Whether a melee attack of `attacker`, facing `direction`, reaches
 * `target`: close enough and in front of the attacker (a 90° cone).
 */
export function inAttackArc(attacker, direction, target, range) {
  const from = center(attacker);
  const to = center(target);
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const distance = Math.hypot(dx, dy);

  if (distance > range) return false;
  if (distance < 4) return true; // Overlapping

  const facing = DIRECTION_VECTORS[direction] ?? DIRECTION_VECTORS.DOWN;
  return (dx * facing.x + dy * facing.y) / distance >= Math.SQRT1_2;
}

/** Unit vector from `from` to `to` (for knockback and projectiles). */
export function directionFrom(from, to) {
  const a = center(from);
  const b = center(to);
  const length = Math.hypot(b.x - a.x, b.y - a.y) || 1;
  return { x: (b.x - a.x) / length, y: (b.y - a.y) / length };
}

/** Damage of a hit, a bit random (±20%). */
export const rollDamage = (damage, random = Math.random) =>
  Math.max(1, Math.round(damage * (0.8 + random() * 0.4)));

/** The NPC gives up below this fraction of its life in a training fight. */
export const SURRENDER_FRACTION = 0.2;

// Weapons and armor in the inventory make the player stronger
const WEAPONS = [
  [/espada|sword|machado|axe|martelo|hammer/i, 6],
  [/lan[cç]a|spear|arco|bow|cajado|staff/i, 5],
  [/adaga|faca|dagger|knife|clava|porrete|club/i, 3],
];
const ARMORS = [
  [/armadura|cota|armor|mail/i, 30],
  [/escudo|shield/i, 20],
  [/elmo|capacete|helmet|couro|leather/i, 12],
];

const best = (table, inventory) =>
  inventory.reduce(
    (found, { name }) => {
      const bonus = table.find(([pattern]) => pattern.test(name))?.[1] ?? 0;
      return bonus > found.bonus ? { item: name, bonus } : found;
    },
    { item: null, bonus: 0 },
  );

/**
 * The best weapon (more damage) and armor (more life) the player carries.
 * @param {{name: string}[]} inventory
 */
export function equipmentOf(inventory = []) {
  return { weapon: best(WEAPONS, inventory), armor: best(ARMORS, inventory) };
}

/** Profile of the player with their equipment. */
export function playerProfile(inventory = []) {
  const { weapon, armor } = equipmentOf(inventory);
  return {
    ...PLAYER_PROFILE,
    damage: PLAYER_PROFILE.damage + weapon.bonus,
    maxHp: PLAYER_PROFILE.maxHp + armor.bonus,
  };
}

// Life restored by eating or using things (mirrors backend combatRules.js)
const HEALING = [
  [/po[cç][aã]o|elixir|t[oô]nico|potion/i, 60],
  [/rem[eé]dio|unguento|bandagem|medicine/i, 45],
  [/erva|herb|mel/i, 25],
  [
    /p[aã]o|peixe|carne|fruta|queijo|ma[cç][aã]|cogumelo|castanha|sopa|bread|fish/i,
    12,
  ],
];

export const healValue = (item = "") =>
  HEALING.find(([pattern]) => pattern.test(item))?.[1] ?? 0;

/** The item that heals the most from the inventory (null if none). */
export function bestHealingItem(inventory = []) {
  return (
    inventory
      .filter(({ name }) => healValue(name) > 0)
      .sort((a, b) => healValue(b.name) - healValue(a.name))[0]?.name ?? null
  );
}
