import { existsSync, readFileSync } from "node:fs";

// Configuration is read from backend/env.json (see env.example.json) and can be
// overridden by environment variables with the same name.
const envFile = new URL("./env.json", import.meta.url);
const fileEnv = existsSync(envFile)
  ? JSON.parse(readFileSync(envFile, "utf-8"))
  : {};

const get = (key, fallback) => process.env[key] ?? fileEnv[key] ?? fallback;

const toBoolean = (value) => value === true || value === "true";

export const config = {
  OPENAI_API_KEY: get("OPENAI_API_KEY"),
  OPENAI_PROJECT_ID: get("OPENAI_PROJECT_ID"),
  // GPT-6 Luna: OpenAI's cheapest current general model ($0.10 / $0.50 per
  // 1M tokens). In Chat Completions it only calls tools with reasoning effort
  // "none", which is also the fastest/cheapest setting for game dialogue.
  MODEL: get("MODEL", "gpt-6-luna"),
  // Set to "" for models without reasoning (e.g. gpt-4o-mini).
  REASONING_EFFORT: get("REASONING_EFFORT", "none"),
  REDIS_HOST: get("REDIS_HOST", "localhost"),
  REDIS_PORT: Number(get("REDIS_PORT", 6379)),
  // Deletes everything in Redis when the backend starts (saved games too)
  RESET_DB_ON_START: toBoolean(get("RESET_DB_ON_START", false)),
  PORT: Number(get("PORT", 8080)),
  // Max number of chat messages (player + NPC + tool) kept in each NPC memory.
  MAX_MEMORY_MESSAGES: Number(get("MAX_MEMORY_MESSAGES", 40)),
  // Lower temperature for dialogues keeps NPCs coherent; world and character
  // generation keep the default (1) to stay varied.
  DIALOG_TEMPERATURE: Number(get("DIALOG_TEMPERATURE", 0.7)),
  // Explicit prompt cache breakpoints (GPT-5.6+ models, like gpt-6-luna).
  // Set to false for older models (e.g. gpt-4o-mini), that cache by themselves.
  PROMPT_CACHE: toBoolean(get("PROMPT_CACHE", true)),
  // Logs the tokens (and cached tokens) of every LLM call
  LOG_LLM_USAGE: toBoolean(get("LOG_LLM_USAGE", true)),
  // Interval between world events (ms). 0 disables them.
  WORLD_EVENT_INTERVAL_MS: Number(get("WORLD_EVENT_INTERVAL_MS", 300000)),
  // How long a game stays in memory after the player disconnects (after that
  // it is only in Redis, and is loaded again when the player comes back).
  SESSION_GRACE_MS: Number(get("SESSION_GRACE_MS", 30 * 60 * 1000)),
  // Saved games not played for this many days are deleted by Redis
  // (0 keeps them forever).
  SESSION_TTL_DAYS: Number(get("SESSION_TTL_DAYS", 7)),
  // How many game days each season lasts
  DAYS_PER_SEASON: Number(get("DAYS_PER_SEASON", 2)),
  // Speed of the game clock: 1000 -> 1 real second is 1 game minute (a day
  // lasts 24 real minutes).
  MS_PER_GAME_MINUTE: Number(get("MS_PER_GAME_MINUTE", 1000)),
  MAX_NPCS: Number(get("MAX_NPCS", 12)),
  // Max number of facts (things heard/learned) remembered by each NPC.
  MAX_NPC_FACTS: Number(get("MAX_NPC_FACTS", 20)),
};
