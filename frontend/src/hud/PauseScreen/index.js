/** Screen shown while the game is paused, with a button to continue. */
export class PauseScreen {
  /** @param {{ onResume: () => void }} options */
  constructor({ onResume, root = "game-container" }) {
    this.element = document.createElement("div");
    this.element.className = "pause-screen";

    const title = document.createElement("p");
    title.className = "pause-title";
    title.textContent = "Jogo pausado";

    const hint = document.createElement("p");
    hint.textContent = "O tempo da vila está parado. Aperte P para continuar.";

    const button = document.createElement("button");
    button.textContent = "Continuar";
    button.addEventListener("click", () => onResume());

    this.element.append(title, hint, button);
    document.getElementById(root).appendChild(this.element);
  }

  show() {
    this.element.style.display = "flex";
  }

  hide() {
    this.element.style.display = "none";
  }
}
