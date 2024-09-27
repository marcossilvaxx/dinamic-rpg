class Events {
  constructor() {
    this.nextId = 0;
    this.callbacks = [];
  }

  emit(eventName, ...args) {
    this.callbacks.forEach((stored) => {
      if (stored.eventName === eventName) {
        stored.callback(...args);
      }
    });
  }

  on(eventName, caller, callback) {
    this.nextId++;
    this.callbacks.push({
      id: this.nextId,
      eventName,
      caller,
      callback,
    });

    return this.nextId;
  }

  off(id) {
    this.callbacks = this.callbacks.filter((stored) => stored.id !== id);
  }

  unsubscribe(caller) {
    this.callbacks = this.callbacks.filter(
      (stored) => stored.caller !== caller
    );
  }
}

export const events = new Events();
