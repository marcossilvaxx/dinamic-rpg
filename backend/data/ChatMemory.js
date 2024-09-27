import { database } from "../db/index.js";

class ChatMemory {
  constructor() {
    this.database = database;
  }

  set(key, messages) {
    return this.database.hSet(`npc:${key}`, "memory", JSON.stringify(messages));
  }

  async get(key) {
    const messages = await this.database.hGet(`npc:${key}`, "memory");

    return JSON.parse(messages);
  }
}

export const chatMemory = new ChatMemory();
