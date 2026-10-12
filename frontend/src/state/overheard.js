// Lines of NPC conversations the player overheard, shown in the journal
// ("Conversas" tab). Kept only in the browser.

const MAX_LINES = 60;

class OverheardStore {
  constructor() {
    this.lines = []; // { author, listener, text, isPrivate, time }
    this.listeners = new Set();
  }

  add(line) {
    this.lines = [...this.lines, line].slice(-MAX_LINES);
    this.listeners.forEach((listener) => listener(this.lines));
  }

  /** @returns {() => void} unsubscribe */
  subscribe(listener) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
}

export const overheard = new OverheardStore();
