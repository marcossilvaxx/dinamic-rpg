class ChatContainer {
  constructor(root = "game-container") {
    this.root = root;
    this.element = null;
    this.messagesContainer = null;
    this.input = null;
    this.onSubmit = null;
    this.agentId = null;
    this.typingElement = null;
    // Message of the NPC being written (streamed): { author, element }
    this.streaming = null;
  }

  get isOpen() {
    return this.agentId !== null;
  }

  createMessage(author, content) {
    // Built with textContent so player/LLM text is never parsed as HTML.
    const messageElement = document.createElement("p");
    messageElement.className = "message-text";

    const authorElement = document.createElement("strong");
    authorElement.textContent = `${author}:`;

    messageElement.append(authorElement, ` ${content}`);
    this.messagesContainer.insertBefore(messageElement, this.typingElement);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;

    return messageElement;
  }

  addMessage({ author, content }) {
    if (!content) {
      return;
    }

    // The final text replaces the message that was being streamed
    if (this.streaming?.author === author) {
      this.streaming.element.lastChild.textContent = ` ${content}`;
      this.streaming.element.classList.remove("streaming");
      this.streaming = null;
      return;
    }

    this.createMessage(author, content);
  }

  /** Shows the answer of the NPC while it is written. */
  streamMessage({ author, content }) {
    if (!this.messagesContainer || !content) {
      return;
    }

    this.setTyping(null);

    if (this.streaming?.author !== author) {
      const element = this.createMessage(author, content);
      element.classList.add("streaming");
      this.streaming = { author, element };
      return;
    }

    this.streaming.element.lastChild.textContent = ` ${content}`;
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  /** Shows "<name> está digitando..." (null hides it). */
  setTyping(name) {
    if (!this.messagesContainer) {
      return;
    }

    if (!name) {
      this.typingElement?.remove();
      this.typingElement = null;
      return;
    }

    if (!this.typingElement) {
      this.typingElement = document.createElement("p");
      this.typingElement.className = "message-text typing";
    }

    this.typingElement.textContent = `${name} está digitando...`;
    this.messagesContainer.appendChild(this.typingElement);
    this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
  }

  handleSubmit() {
    const value = this.input.value.trim();
    this.input.value = "";

    if (!value) {
      return;
    }

    this.addMessage({ author: "Player", content: value });
    this.onSubmit?.(value);
  }

  init() {
    this.element = document.createElement("div");
    this.element.className = "chat-container";

    this.messagesContainer = document.createElement("div");
    this.messagesContainer.className = "messages-container";

    const form = document.createElement("form");
    form.id = "chat-input";

    this.input = document.createElement("textarea");
    this.input.id = "user-input";

    const button = document.createElement("button");
    button.type = "submit";
    button.textContent = "Send";

    form.append(this.input, button);
    this.element.append(this.messagesContainer, form);
    document.getElementById(this.root).appendChild(this.element);

    // Keys typed in the chat must not move the hero
    this.input.addEventListener("keydown", (event) => {
      event.stopPropagation();

      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        this.handleSubmit();
      }

      // Leave the input so Q (close chat) and movement keys work again
      if (event.key === "Escape") {
        this.input.blur();
      }
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      this.handleSubmit();
    });
  }

  show({ agentId, onSubmit }) {
    if (!this.element) {
      this.init();
    }

    this.agentId = agentId;
    this.onSubmit = onSubmit;
    this.typingElement = null;
    this.streaming = null;
    this.messagesContainer.replaceChildren();
    this.element.style.display = "flex";
    this.input.focus();
  }

  hide() {
    this.agentId = null;
    this.onSubmit = null;
    this.streaming = null;
    this.setTyping(null);

    if (this.element) {
      this.element.style.display = "none";
      this.messagesContainer.replaceChildren();
    }
  }
}

export const chatContainer = new ChatContainer("game-container");
