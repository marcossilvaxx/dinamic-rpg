class ChatContainer {
  constructor(root = "game-container") {
    this.root = root;
    this.rootElement = null;
    this.element = null;
    this.messagesContainer = null;
    this.messages = [];
    this.onSubmit = null;
  }

  addMessage(message) {
    const messageElement = `<p class="message-text"><strong>${message.author}:</strong> ${message.content}</p>`;
    this.messages.push(messageElement);

    this.messagesContainer.innerHTML = this.messages.join("\n");
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  handleEnterPress(event) {
    if (event.key === "Enter") {
      event.preventDefault();
      const value = event.target.value;
      this.handleSubmit(value);
    }
  }

  handleSubmit(value) {
    this.addMessage({ author: "Player", content: value });
    document.getElementById("user-input").value = "";

    if (this.onSubmit) {
      this.onSubmit(value);
    }
  }

  init() {
    if (this.element) {
      return;
    }

    this.rootElement = document.getElementById(this.root);

    this.element = document.createElement("div");
    this.messagesContainer = document.createElement("div");

    this.element.className = "chat-container";
    this.messagesContainer.className = "messages-container";

    this.rootElement.appendChild(this.element);
    this.element.appendChild(this.messagesContainer);

    this.element.insertAdjacentHTML(
      "beforeend",
      `
      <form id="chat-input">
        <textarea id="user-input"></textarea>
        <button type="submit">Send</button>
      </form>
    `
    );

    document
      .getElementById("user-input")
      .addEventListener("keydown", (event) => {
        event.stopPropagation();

        this.handleEnterPress(event);
      }); // lembrar de remover o event listener depois

    document
      .getElementById("chat-input")
      .addEventListener("submit", (event) => {
        event.stopPropagation();
        event.preventDefault();

        const value = event.target[0].value;

        this.handleSubmit(value);
      });
  }

  show({ onSubmit }) {
    this.onSubmit = onSubmit;

    if (this.element) {
      this.element.style.display = "flex";
    } else {
      this.init();
    }

    this.messages = [];
    this.messagesContainer.innerHTML = "";
  }

  hide() {
    if (this.element) {
      this.element.style.display = "none";

      this.messages = [];
      this.messagesContainer.innerHTML = "";
    }
  }
}

export const chatContainer = new ChatContainer("game-container");
