/**
 * Title screen: continue the saved game or start a new one. Starting a new
 * game when there is a saved one asks first, since the saved one is lost.
 */
export class MainMenu {
  /**
   * @param {object} options
   * @param {() => void} options.onContinue
   * @param {() => void} options.onNewGame
   */
  constructor({ onContinue, onNewGame, root = "game-container" }) {
    this.onContinue = onContinue;
    this.onNewGame = onNewGame;
    this.saved = null;
    this.isOpen = true;

    this.element = document.createElement("div");
    this.element.className = "main-menu";
    document.getElementById(root).appendChild(this.element);

    document.addEventListener("keydown", (event) => {
      if (!this.isOpen) return;

      if (event.key === "Enter") {
        event.preventDefault();
        this.element.querySelector("button:not(:disabled)")?.click();
      } else if (event.key === "Escape" && this.confirming) {
        this.render();
      }
    });

    this.showConnecting();
  }

  heading() {
    const title = document.createElement("h1");
    title.textContent = "Dinamic RPG";
    const subtitle = document.createElement("p");
    subtitle.className = "main-menu-subtitle";
    subtitle.textContent =
      "Uma vila viva, onde cada morador pensa por conta própria";
    return [title, subtitle];
  }

  button(text, onClick, { primary = false, disabled = false } = {}) {
    const button = document.createElement("button");
    button.textContent = text;
    button.disabled = disabled;
    if (primary) button.className = "primary";
    button.addEventListener("click", onClick);
    return button;
  }

  showConnecting() {
    const status = document.createElement("p");
    status.className = "main-menu-info";
    status.textContent = "Conectando ao servidor...";
    this.element.replaceChildren(...this.heading(), status);
  }

  /** @param {object|null} saved What the server says about the saved game. */
  show(saved) {
    this.saved = saved;
    this.isOpen = true;
    this.element.classList.remove("hidden");
    this.render();
  }

  render() {
    const { saved } = this;
    this.confirming = false;
    const options = document.createElement("div");
    options.className = "main-menu-options";

    if (saved) {
      const details = [
        saved.moment,
        saved.season,
        `${saved.villagers} moradores`,
      ].join(" · ");
      options.append(
        this.button("Continuar", () => this.start(this.onContinue), {
          primary: true,
          disabled: saved.inUse,
        }),
        this.info(
          saved.inUse ? "Esta partida está aberta em outra aba." : details,
        ),
      );
      if (saved.buildings?.length) {
        options.append(this.info(saved.buildings.join(", ")));
      }
    }

    options.append(
      this.button(
        "Novo jogo",
        () => (saved ? this.confirmNewGame() : this.start(this.onNewGame)),
        { primary: !saved },
      ),
    );

    const help = document.createElement("p");
    help.className = "main-menu-help";
    help.textContent =
      "Setas: andar · E: conversar · F: usar · J: diário · Espaço: atacar · P: pausar";

    this.element.replaceChildren(...this.heading(), options, help);
  }

  info(text) {
    const paragraph = document.createElement("p");
    paragraph.className = "main-menu-info";
    paragraph.textContent = text;
    return paragraph;
  }

  confirmNewGame() {
    this.confirming = true;
    const options = document.createElement("div");
    options.className = "main-menu-options";
    options.append(
      this.info(
        "Um novo jogo cria outra vila, com outros moradores. A partida salva será apagada.",
      ),
      this.button("Começar um novo jogo", () => this.start(this.onNewGame), {
        primary: true,
      }),
      this.button("Voltar", () => this.render()),
    );
    this.element.replaceChildren(...this.heading(), options);
  }

  start(action) {
    this.hide();
    action();
  }

  hide() {
    this.isOpen = false;
    this.element.classList.add("hidden");
  }
}
