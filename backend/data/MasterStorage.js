import { database } from "../db/index.js";

class MasterStorage {
  constructor() {
    this.database = database;
  }

  setWorld(data) {
    return this.database.hSet("master", "world", JSON.stringify(data));
  }

  async getWorld() {
    const data = await this.database.hGet("master", "world");

    return JSON.parse(data);
  }
}

export const masterStorage = new MasterStorage();
