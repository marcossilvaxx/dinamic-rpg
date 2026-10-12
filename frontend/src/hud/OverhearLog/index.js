const MAX_ENTRIES = 5;
const ENTRY_LIFETIME_MS = 12000;

/**
 * Small log in the corner of the screen with what the player overhears from
 * conversations between NPCs nearby.
 */
class OverhearLog {
  constructor(root = "game-container") {
    this.root = root;
    this.element = null;
  }

  init() {
    this.element = document.createElement("div");
    this.element.className = "overhear-log";
    document.getElementById(this.root).appendChild(this.element);
  }

  add({ author, content }) {
    if (!this.element) {
      this.init();
    }

    const entry = document.createElement("p");
    const authorElement = document.createElement("strong");
    authorElement.textContent = `${author}:`;
    entry.append(authorElement, ` ${content}`);

    this.element.appendChild(entry);

    while (this.element.children.length > MAX_ENTRIES) {
      this.element.firstChild.remove();
    }

    setTimeout(() => {
      entry.classList.add("fading");
      setTimeout(() => entry.remove(), 1000);
    }, ENTRY_LIFETIME_MS);
  }
}

export const overhearLog = new OverhearLog("game-container");
