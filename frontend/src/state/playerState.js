// Latest state of the player sent by the server (`player_state`): reputation,
// inventory, requests, mystery, news...

class PlayerStateStore {
  constructor() {
    this.state = {
      reputation: [],
      inventory: [],
      quests: [],
      met: [],
      news: [],
      mystery: null,
    };
    this.listeners = new Set();
  }

  set(state) {
    this.state = state;
    this.listeners.forEach((listener) => listener(state));
  }

  /** @returns {() => void} unsubscribe */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  reputationOf(npcId) {
    return (
      this.state.reputation.find((entry) => entry.npcId === npcId)?.value ?? 0
    );
  }
}

export const playerState = new PlayerStateStore();
