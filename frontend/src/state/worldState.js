// Weather and gathering of the day, sent by the server (`world_state`).

class WorldStateStore {
  constructor() {
    this.state = { weather: "clear", festival: null };
    this.listeners = new Set();
  }

  get weather() {
    return this.state.weather;
  }

  get festival() {
    return this.state.festival;
  }

  set(state) {
    this.state = { ...this.state, ...state };
    this.listeners.forEach((listener) => listener(this.state));
  }

  /** @returns {() => void} unsubscribe */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const worldState = new WorldStateStore();
