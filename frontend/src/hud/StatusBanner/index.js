/**
 * Non-blocking message at the top of the screen (loading progress, news of
 * the village...).
 */
class StatusBanner {
  constructor(root = "game-container") {
    this.root = root;
    this.element = null;
    this.timeout = null;
  }

  /**
   * @param {string} text
   * @param {object} [options]
   * @param {number} [options.duration] Hide after this time (ms).
   * @param {boolean} [options.highlight] Highlighted style (news).
   */
  show(text, { duration, highlight = false } = {}) {
    if (!this.element) {
      this.element = document.createElement("div");
      this.element.className = "status-banner";
      document.getElementById(this.root).appendChild(this.element);
    }

    clearTimeout(this.timeout);
    this.element.textContent = text;
    this.element.classList.toggle("highlight", highlight);
    this.element.style.display = "block";

    if (duration) {
      this.timeout = setTimeout(() => this.hide(), duration);
    }
  }

  hide() {
    clearTimeout(this.timeout);

    if (this.element) {
      this.element.style.display = "none";
    }
  }
}

export const statusBanner = new StatusBanner("game-container");
