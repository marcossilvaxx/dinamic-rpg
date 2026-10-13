/**
 * Screen shown while the game is paused, with buttons to continue and to go
 * back to the main menu (the game stays saved).
 */
export class PauseScreen {
  /** @param {{ onResume: () => void, onMainMenu: () => void }} options */
  constructor({ onResume, onMainMenu, root = "game-container" }) {
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

    const menu = document.createElement("button");
    menu.className = "secondary";
    menu.textContent = "Menu principal";
    menu.addEventListener("click", () => onMainMenu());

    const buttons = document.createElement("div");
    buttons.className = "pause-buttons";
    buttons.append(button, menu);

    this.element.append(title, hint, buttons);
    document.getElementById(root).appendChild(this.element);
  }

  show() {
    this.element.style.display = "flex";
  }

  hide() {
    this.element.style.display = "none";
  }
}
