// Persists the data of one game session in Redis. Every key is namespaced by
// the session id so multiple players don't overwrite each other's world.
//
//   session:{sid}:state          -> hash { data } (the saved game)
//   session:{sid}:world          -> hash { data }
//   session:{sid}:npc:{npcId}    -> hash { data, memory, facts, diary }
//   session:{sid}:rel:{a}:{b}    -> hash { data } (relationship, a < b)
//   session:{sid}:keys           -> set of all the keys above
//
// Saved games expire after `ttlSeconds` without being played (0 = never).
export class SessionStore {
  constructor(database, sessionId, { ttlSeconds = 0 } = {}) {
    this.database = database;
    this.prefix = `session:${sessionId}`;
    this.ttlSeconds = ttlSeconds;
    // Keys already registered in the keys set (avoids repeated writes)
    this.registered = new Set();
    this.closed = false;
  }

  keysKey() {
    return `${this.prefix}:keys`;
  }

  stateKey() {
    return `${this.prefix}:state`;
  }

  worldKey() {
    return `${this.prefix}:world`;
  }

  npcKey(npcId) {
    return `${this.prefix}:npc:${npcId}`;
  }

  relationshipKey(a, b) {
    const [first, second] = [a, b].sort((x, y) => x - y);
    return `${this.prefix}:rel:${first}:${second}`;
  }

  async setField(key, field, value) {
    // Ignore late writes (e.g. NPC generation finishing after disconnect).
    if (this.closed) {
      return;
    }

    if (!this.registered.has(key)) {
      this.registered.add(key);
      await this.database.sAdd(this.keysKey(), key);
    }

    await this.database.hSet(key, field, JSON.stringify(value));
  }

  async getField(key, field) {
    const value = await this.database.hGet(key, field);

    return value ? JSON.parse(value) : null;
  }

  async keys() {
    return this.database.sMembers(this.keysKey());
  }

  /** Saves the game and renews the expiration of all its keys. */
  async setState(state) {
    await this.setField(this.stateKey(), "data", state);

    if (this.ttlSeconds > 0 && !this.closed) {
      const keys = [...(await this.keys()), this.keysKey()];
      await Promise.all(
        keys.map((key) => this.database.expire(key, this.ttlSeconds)),
      );
    }
  }

  getState() {
    return this.getField(this.stateKey(), "data");
  }

  setWorld(world) {
    return this.setField(this.worldKey(), "data", world);
  }

  getWorld() {
    return this.getField(this.worldKey(), "data");
  }

  setNpc(npcId, data) {
    return this.setField(this.npcKey(npcId), "data", data);
  }

  getNpc(npcId) {
    return this.getField(this.npcKey(npcId), "data");
  }

  setMemory(npcId, messages) {
    return this.setField(this.npcKey(npcId), "memory", messages);
  }

  async getMemory(npcId) {
    return (await this.getField(this.npcKey(npcId), "memory")) ?? [];
  }

  async getFacts(npcId) {
    return (await this.getField(this.npcKey(npcId), "facts")) ?? [];
  }

  /**
   * Appends a fact, keeping only the `max` most recent ones.
   * @returns {Promise<string[]>} The facts that were dropped (oldest first).
   */
  async addFact(npcId, fact, max) {
    const facts = await this.getFacts(npcId);
    facts.push(fact);
    await this.setField(this.npcKey(npcId), "facts", facts.slice(-max));
    return facts.slice(0, Math.max(facts.length - max, 0));
  }

  async getDiary(npcId) {
    return (await this.getField(this.npcKey(npcId), "diary")) ?? [];
  }

  setDiary(npcId, entries) {
    return this.setField(this.npcKey(npcId), "diary", entries);
  }

  async getRelationship(a, b) {
    return (
      (await this.getField(this.relationshipKey(a, b), "data")) ?? {
        affinity: 0,
        talks: 0,
        // What each NPC remembers from the last talk: { [npcId]: string }
        lastTalk: {},
        // Dating, engaged or married: { status, since, child? }
        couple: null,
      }
    );
  }

  setRelationship(a, b, relationship) {
    return this.setField(this.relationshipKey(a, b), "data", relationship);
  }

  /** Deletes the whole game. */
  async clear() {
    this.closed = true;
    const keys = await this.keys();
    await this.database.del([...keys, this.keysKey()]);
    this.registered.clear();
  }
}
