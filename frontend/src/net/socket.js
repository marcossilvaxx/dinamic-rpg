import env from "../config/env.json";

/**
 * The single websocket connection of the game. Messages are dispatched by
 * type (`on`) and, when they belong to an NPC, by agent id (`onAgent`).
 */
class GameSocket {
  constructor() {
    this.socket = null;
    this.listeners = new Map();
  }

  connect(url = env.WEBSOCKET_SERVER_URL) {
    this.socket = new WebSocket(url);

    this.socket.addEventListener("open", () => this.dispatch("open", {}));
    this.socket.addEventListener("close", () => this.dispatch("close", {}));
    this.socket.addEventListener("message", (event) => {
      let message;

      try {
        message = JSON.parse(event.data);
      } catch {
        console.error("Invalid message from server:", event.data);
        return;
      }

      this.dispatch(message.type, message);

      if (message.agentId != null) {
        this.dispatch(`agent:${message.agentId}`, message);
      }
    });
  }

  dispatch(key, message) {
    this.listeners.get(key)?.forEach((listener) => listener(message));
  }

  /** @returns {() => void} unsubscribe */
  on(key, listener) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key).add(listener);

    return () => this.listeners.get(key).delete(listener);
  }

  onAgent(agentId, listener) {
    return this.on(`agent:${agentId}`, listener);
  }

  send(type, payload = {}) {
    if (this.socket?.readyState !== WebSocket.OPEN) {
      console.warn(`Socket not open, dropping "${type}" message`);
      return false;
    }

    this.socket.send(JSON.stringify({ type, ...payload }));
    return true;
  }
}

export const gameSocket = new GameSocket();
