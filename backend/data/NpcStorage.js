import { database } from "../db/index.js";

class NpcStorage {
  constructor() {
    this.database = database;
  }

  setData(key, data) {
    return this.database.hSet(`npc:${key}`, "data", JSON.stringify(data));
  }

  async getData(key) {
    const data = await this.database.hGet(`npc:${key}`, "data");

    return JSON.parse(data);
  }
}

export const npcStorage = new NpcStorage();
