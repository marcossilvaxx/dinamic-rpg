// Stack of short notifications in the top right corner (new requests, items,
// reputation, news...).

const DURATIONS = { news: 9000, mystery: 14000 };
const DEFAULT_DURATION = 5000;
const MAX_VISIBLE = 4;

class Notifications {
  constructor(root = "game-container") {
    this.root = root;
    this.element = null;
  }

  /**
   * @param {string} text
   * @param {string} [kind] info | good | bad | quest | item | news | mystery
   */
  push(text, kind = "info") {
    if (!this.element) {
      this.element = document.createElement("div");
      this.element.className = "notifications";
      document.getElementById(this.root).appendChild(this.element);
    }

    const toast = document.createElement("p");
    toast.className = `notification ${kind}`;
    toast.textContent = text;
    this.element.appendChild(toast);

    while (this.element.children.length > MAX_VISIBLE) {
      this.element.firstChild.remove();
    }

    setTimeout(() => {
      toast.classList.add("fading");
      setTimeout(() => toast.remove(), 600);
    }, DURATIONS[kind] ?? DEFAULT_DURATION);
  }
}

export const notifications = new Notifications("game-container");
