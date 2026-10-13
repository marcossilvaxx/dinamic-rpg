/**
 * Small menu of choices (travel by boat, trade with a merchant...). Options
 * are chosen with the mouse or the number keys; Esc closes it.
 */
export class ChoiceMenu {
  /** @param {{ input: import("../../Input").Input }} options */
  constructor({ input, root = "game-container" }) {
    this.input = input;
    this.options = [];
    this.isOpen = false;

    this.element = document.createElement("div");
    this.element.className = "choice-menu";
    document.getElementById(root)?.appendChild(this.element);

    document.addEventListener("keydown", (event) => {
      if (!this.isOpen) return;

      if (event.key === "Escape") {
        this.close();
        return;
      }

      const option = this.options[Number(event.key) - 1];
      if (option && !option.disabled) {
        event.preventDefault();
        this.choose(option);
      }
    });
  }

  /**
   * @param {string} title
   * @param {{label: string, detail?: string, disabled?: boolean,
   *   run: () => void, keepOpen?: boolean}[]} options
   */
  open(title, options) {
    this.options = options;
    this.isOpen = true;
    this.input.blocked = true;
    this.element.replaceChildren();

    const heading = document.createElement("h3");
    heading.textContent = title;
    this.element.appendChild(heading);

    options.forEach((option, i) => {
      const button = document.createElement("button");
      button.disabled = Boolean(option.disabled);
      const label = document.createElement("span");
      label.textContent = `${i + 1}. ${option.label}`;
      button.appendChild(label);
      if (option.detail) {
        const detail = document.createElement("small");
        detail.textContent = option.detail;
        button.appendChild(detail);
      }
      button.addEventListener("click", () => this.choose(option));
      this.element.appendChild(button);
    });

    const hint = document.createElement("p");
    hint.textContent = "Esc para fechar";
    this.element.appendChild(hint);
    this.element.classList.add("visible");
  }

  choose(option) {
    if (!option.keepOpen) this.close();
    option.run();
  }

  close() {
    this.isOpen = false;
    this.input.blocked = false;
    this.element.classList.remove("visible");
  }
}
