import { overheard } from "../../state/overheard";
import { playerState } from "../../state/playerState";
import { bestHealingItem, equipmentOf, healValue } from "../../systems/combat";

const TABS = [
  { id: "quests", label: "Pedidos" },
  { id: "mystery", label: "Mistério" },
  { id: "people", label: "Pessoas" },
  { id: "inventory", label: "Inventário" },
  { id: "conversations", label: "Conversas" },
  { id: "news", label: "Notícias" },
];

const QUEST_STATUS = { active: 0, failed: 1, completed: 2 };

const element = (tag, { className, text } = {}, children = []) => {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  node.append(...children);
  return node;
};

const reputationLabel = (value) => {
  if (value <= -6) return "Desconfia de você";
  if (value <= -3) return "Não gosta muito de você";
  if (value >= 6) return "Confia em você";
  if (value >= 3) return "Gosta de você";
  return "Neutro";
};

/**
 * Journal of the player (J key): requests, mystery, people, inventory and
 * news of the village.
 */
export class Journal {
  /**
   * @param {object} options
   * @param {() => {id: number, name: string, occupation: string}[]} options.getNpcs
   * @param {(npcId: number) => void} options.onAccuse
   * @param {import("../../Input").Input} options.input
   */
  constructor({
    getNpcs,
    onAccuse,
    onDecide,
    onAskMemory = () => {},
    input,
    root = "game-container",
  }) {
    this.getNpcs = getNpcs;
    this.onAskMemory = onAskMemory;
    // What each NPC said they remember about the player: npcId -> answer
    // (null while waiting)
    this.memories = new Map();
    this.onAccuse = onAccuse;
    this.onDecide = onDecide;
    this.pendingDecision = null;
    this.input = input;
    this.root = root;
    this.tab = "quests";
    this.element = null;
    this.content = null;
    this.pendingAccusation = null;

    playerState.subscribe(() => this.isOpen && this.render());
    overheard.subscribe(
      () => this.isOpen && this.tab === "conversations" && this.render(),
    );

    document.addEventListener("keydown", (event) => {
      if (["TEXTAREA", "INPUT", "SELECT"].includes(event.target.tagName)) {
        return;
      }

      if (event.key.toLowerCase() === "j") {
        this.toggle();
      } else if (event.key === "Escape" && this.isOpen) {
        this.close();
      }
    });
  }

  get isOpen() {
    return this.element?.style.display === "flex";
  }

  init() {
    this.element = element("div", { className: "journal" });
    const tabs = element("nav", { className: "journal-tabs" });

    TABS.forEach(({ id, label }) => {
      const button = element("button", { text: label });
      button.dataset.tab = id;
      button.addEventListener("click", () => {
        this.tab = id;
        this.render();
      });
      tabs.appendChild(button);
    });

    const close = element("button", {
      className: "journal-close",
      text: "Fechar (J)",
    });
    close.addEventListener("click", () => this.close());
    tabs.appendChild(close);

    this.content = element("section", { className: "journal-content" });
    this.element.append(tabs, this.content);
    document.getElementById(this.root).appendChild(this.element);
  }

  toggle() {
    if (this.isOpen) {
      this.close();
    } else {
      this.open();
    }
  }

  open() {
    if (!this.element) {
      this.init();
    }

    this.element.style.display = "flex";
    this.input.blocked = true;
    this.render();
  }

  close() {
    if (this.element) {
      this.element.style.display = "none";
    }
    this.input.blocked = false;
    this.pendingAccusation = null;
    // Asked again next time (they may remember more by then)
    for (const [npcId, memory] of this.memories) {
      if (memory) this.memories.delete(npcId);
    }
  }

  render() {
    this.element.querySelectorAll("[data-tab]").forEach((button) => {
      button.classList.toggle("active", button.dataset.tab === this.tab);
    });

    const renderers = {
      quests: () => this.renderQuests(),
      mystery: () => this.renderMystery(),
      people: () => this.renderPeople(),
      inventory: () => this.renderInventory(),
      conversations: () => this.renderConversations(),
      news: () => this.renderNews(),
    };

    this.content.replaceChildren(...renderers[this.tab]());
  }

  renderQuests() {
    const { quests } = playerState.state;

    if (quests.length === 0) {
      return [
        element("p", {
          className: "empty",
          text: "Nenhum pedido ainda. Converse com os moradores: alguns podem precisar de ajuda.",
        }),
      ];
    }

    const prefix = { active: "", completed: "✓ ", failed: "✗ " };

    return [...quests]
      .sort((a, b) => QUEST_STATUS[a.status] - QUEST_STATUS[b.status])
      .map((quest) =>
        element("article", { className: `entry ${quest.status}` }, [
          element("h3", { text: `${prefix[quest.status]}${quest.title}` }),
          element("p", {
            className: "meta",
            text: `Pedido de ${quest.giver}${quest.target ? ` · envolve ${quest.target}` : ""}`,
          }),
          ...(quest.deadlineLabel
            ? [
                element("p", {
                  className: `meta deadline ${quest.status}`,
                  text:
                    quest.status === "failed"
                      ? `Prazo perdido (${quest.deadlineLabel})`
                      : `Prazo: ${quest.deadlineLabel}`,
                }),
              ]
            : []),
          element("p", { text: quest.description }),
          ...(quest.item && quest.status === "active"
            ? [
                element("p", {
                  className: "meta gather",
                  text: `Levar: ${quest.quantity} ${quest.item} (você tem ${Math.min(
                    quest.quantity,
                    (playerState.state.inventory ?? []).find(
                      (entry) =>
                        entry.name.toLowerCase() === quest.item.toLowerCase(),
                    )?.quantity ?? 0,
                  )})`,
                }),
              ]
            : []),
        ]),
      );
  }

  /** Title of the player and the mysteries solved before. */
  renderInvestigator() {
    const {
      title,
      solvedMysteries = 0,
      pastMysteries = [],
    } = playerState.state;
    const nodes = [];

    if (title) {
      nodes.push(
        element("p", {
          className: "title-badge",
          text: `Seu título na vila: ${title} (${solvedMysteries} mistério(s) resolvido(s))`,
        }),
      );
    }

    if (pastMysteries.length) {
      nodes.push(
        element("h4", { text: "Casos anteriores" }),
        element(
          "ul",
          { className: "past-mysteries" },
          pastMysteries.map(({ title: caseTitle, solved, covered, culprit }) =>
            element("li", {
              text: `${solved ? "✓" : covered ? "🤐" : "✗"} ${caseTitle} (culpado: ${culprit}${covered ? ", segredo guardado" : ""})`,
            }),
          ),
        ),
      );
    }

    return nodes;
  }

  /** The culprit confessed only to the player: tell the village or not. */
  renderConfession(mystery) {
    const decisions = [
      {
        id: "expose",
        label: "Contar à vila",
        hint: "Justiça é feita e a vila confia mais em você. Conta para o seu título.",
      },
      {
        id: "protect",
        label: "Guardar o segredo",
        hint: `${mystery.culprit} fica te devendo um favor${mystery.victim ? `, mas ${mystery.victim} nunca saberá a verdade` : ""}. Se o segredo vazar, a vila não vai gostar.`,
      },
    ];

    return [
      element("p", {
        className: "meta confessed",
        text: `${mystery.culprit} confessou só para você: ${mystery.solution}`,
      }),
      element("h4", { text: "O que você vai fazer?" }),
      ...decisions.map(({ id, label, hint }) => {
        const button = element("button", {
          className: "decision",
          text: this.pendingDecision === id ? `Confirmar: ${label}` : label,
        });
        button.addEventListener("click", () => {
          // Two clicks: the decision can't be undone
          if (this.pendingDecision !== id) {
            this.pendingDecision = id;
            this.render();
            return;
          }

          this.pendingDecision = null;
          button.disabled = true;
          this.onDecide(id);
        });

        return element("article", { className: "entry decision-option" }, [
          button,
          element("p", { className: "meta", text: hint }),
        ]);
      }),
    ];
  }

  renderMystery() {
    const { mystery } = playerState.state;

    if (!mystery) {
      return [
        element("p", {
          className: "empty",
          text: "Nenhum mistério nesta vila.",
        }),
        ...this.renderInvestigator(),
      ];
    }

    const nodes = [
      element("h3", { text: mystery.title }),
      element("p", { text: mystery.intro }),
    ];

    if (mystery.status === "confessed") {
      return [...nodes, ...this.renderConfession(mystery)];
    }

    if (mystery.status !== "open") {
      const outcome = {
        solved: `Resolvido! O culpado era ${mystery.culprit}${mystery.confessed ? ", que confessou" : ""}.`,
        failed: `Sem solução. O culpado era ${mystery.culprit}.`,
        covered: mystery.leaked
          ? `Você guardou o segredo de ${mystery.culprit}, mas a verdade vazou.`
          : `Você guardou o segredo de ${mystery.culprit}. Só vocês dois sabem.`,
      }[mystery.status];

      nodes.push(
        element("p", {
          className: `meta ${mystery.status}`,
          text: outcome,
        }),
        element("p", { text: mystery.solution }),
        element("p", {
          className: "meta",
          text: "Um novo mistério deve aparecer em algumas horas.",
        }),
        ...this.renderInvestigator(),
      );
      return nodes;
    }

    nodes.push(
      element("p", {
        className: "meta",
        text: `Converse com os moradores para descobrir quem foi. Tentativas de acusação: ${mystery.attemptsLeft}.`,
      }),
    );

    if (mystery.evidence) {
      nodes.push(
        element("h4", { text: "Prova" }),
        element("article", { className: "entry evidence" }, [
          element("p", { text: `🔎 ${mystery.evidence.item}` }),
          element("p", {
            className: "meta",
            text: `${mystery.evidence.description} Mostre a prova ao culpado: ele não vai conseguir negar.`,
          }),
        ]),
      );
    }

    nodes.push(element("h4", { text: "Depoimentos" }));
    nodes.push(
      ...(mystery.testimonies?.length
        ? mystery.testimonies.map(({ text, time }) =>
            element("article", { className: "entry testimony" }, [
              element("p", { text }),
              element("p", { className: "meta", text: time }),
            ]),
          )
        : [
            element("p", {
              className: "empty",
              text: "Ninguém falou nada sobre o caso ainda. Compare o que cada um diz: alguém pode estar mentindo.",
            }),
          ]),
    );

    const select = element("select");
    // Visitors are not part of the mysteries of the village
    this.getNpcs()
      .filter(({ visitor }) => !visitor)
      .forEach(({ id, name }) => {
        const option = element("option", { text: name });
        option.value = id;
        select.appendChild(option);
      });

    const button = element("button", {
      text: this.pendingAccusation ? "Confirmar acusação" : "Acusar",
    });
    if (this.pendingAccusation) {
      select.value = this.pendingAccusation;
    }
    select.addEventListener("change", () => {
      this.pendingAccusation = null;
      button.textContent = "Acusar";
    });
    button.addEventListener("click", () => {
      const npcId = Number(select.value);

      // Two clicks: an accusation can't be undone
      if (this.pendingAccusation !== npcId) {
        this.pendingAccusation = npcId;
        button.textContent = "Confirmar acusação";
        return;
      }

      this.pendingAccusation = null;
      button.disabled = true;
      this.onAccuse(npcId);
    });

    nodes.push(
      element("h4", { text: "Acusar" }),
      element("div", { className: "accuse" }, [select, button]),
      ...this.renderInvestigator(),
    );
    return nodes;
  }

  renderPeople() {
    const {
      met,
      shops = [],
      title,
      bonds = [],
      goals = [],
      ambitions = [],
      couples = [],
    } = playerState.state;

    const people = this.getNpcs().map(({ id, name, occupation, visitor }) => {
      const value = playerState.reputationOf(id);
      const known = met.includes(id);
      // Never talked, but heard about the player from others
      const heard = !known && value !== 0;
      const bar = element("div", { className: "reputation-bar" }, [
        element("span"),
      ]);
      // -10..10 -> 0..100%
      bar.firstChild.style.width = `${(value + 10) * 5}%`;
      bar.firstChild.classList.toggle("negative", value < 0);

      const wares = shops.find((shop) => shop.npcId === id)?.wares ?? [];
      const bond = bonds.find((entry) => entry.npcId === id);
      const goal = goals.find((entry) => entry.npcId === id);
      const ambition = ambitions.find((entry) => entry.npcId === id);
      const trend = { up: " ↑", down: " ↓" };

      return element("article", { className: "entry" }, [
        element("h3", {}, [
          name,
          ...(visitor
            ? [
                element("span", {
                  className: "badge visitor",
                  text: "visitante",
                }),
              ]
            : []),
          ...(bond
            ? [
                element("span", {
                  className: `badge bond ${bond.bond}`,
                  text: `${bond.bond === "romance" ? "♥ " : ""}${bond.label}${bond.date ? " · vai à festa com você" : ""}`,
                }),
              ]
            : []),
        ]),
        element("p", {
          className: "meta",
          text: known
            ? occupation
            : "Você ainda não conversou com essa pessoa.",
        }),
        ...(known || heard
          ? [
              bar,
              element("p", {
                className: "meta",
                text: heard
                  ? `Ouviu falar de você: ${reputationLabel(value).toLowerCase()}`
                  : reputationLabel(value),
              }),
            ]
          : []),
        ...(known && wares.length
          ? [
              element("p", {
                className: "meta wares",
                text: `Vende: ${wares
                  .map(({ item, price, stock, trend: priceTrend }) =>
                    stock === 0
                      ? `${item} (esgotado)`
                      : `${item} (${price} moedas${trend[priceTrend] ?? ""}${stock !== undefined ? `, ${stock} restantes` : ""})`,
                  )
                  .join(", ")}`,
              }),
            ]
          : []),
        // The villager talks about their dreams with people they like
        ...(known && goal && value >= 3
          ? [
              element("p", {
                className: "meta goal",
                text: `Sonho: ${goal.goal} (${goal.progress}%)`,
              }),
            ]
          : []),
        ...(known && ambition ? [this.renderAmbition(ambition)] : []),
        ...(known ? this.renderMemory(id) : []),
      ]);
    });

    const family = couples.length
      ? [
          element("h4", { text: "Casais da vila" }),
          element(
            "ul",
            { className: "past-mysteries" },
            couples.map(({ names, status, child }) =>
              element("li", {
                text: `♥ ${names.join(" e ")}: ${{ dating: "namorando", engaged: "noivos", married: "casados" }[status]}${child ? " (com um bebê)" : ""}`,
              }),
            ),
          ),
        ]
      : [];

    return [
      ...[title, playerState.state.combat?.title].filter(Boolean).map((name) =>
        element("p", {
          className: "title-badge",
          text: `A vila te chama de: ${name}`,
        }),
      ),
      ...people,
      ...family,
    ];
  }

  /** The ambition of a villager, its steps and what moved it lately. */
  renderAmbition({ text, steps, step, progress, log, achieved }) {
    return element("div", { className: "ambition" }, [
      element("p", {
        className: "meta ambition-title",
        text: `Ambição: ${text}${achieved ? ` (já realizou ${achieved})` : ""}`,
      }),
      element(
        "ol",
        { className: "ambition-steps" },
        steps.map((label, i) =>
          element("li", {
            className: i < step ? "done" : i === step ? "current" : "",
            text: `${i < step ? "✓" : i === step ? "→" : "·"} ${label}${i === step ? ` (${progress}%)` : ""}`,
          }),
        ),
      ),
      ...log
        .slice()
        .reverse()
        .map(({ when, note }) =>
          element("p", {
            className: "meta ambition-log",
            text: `${when}: ${note}`,
          }),
        ),
    ]);
  }

  /** "What do you know about me?": asks the server, shows the answer. */
  renderMemory(npcId) {
    if (!this.memories.has(npcId)) {
      const button = element("button", {
        className: "memory-button",
        text: "O que sabe sobre você?",
      });
      button.addEventListener("click", () => {
        this.memories.set(npcId, null);
        this.onAskMemory(npcId);
        this.render();
      });
      return [button];
    }

    const memory = this.memories.get(npcId);
    if (!memory) {
      return [element("p", { className: "meta memory", text: "Lembrando..." })];
    }
    if (!memory.lines.length) {
      return [
        element("p", {
          className: "meta memory",
          text: "Ainda não lembra de nada em especial sobre você.",
        }),
      ];
    }
    return [
      element("div", { className: "memory" }, [
        ...memory.lines.map((line) => element("p", { text: `“${line}”` })),
        element("p", { className: "meta", text: memory.feeling }),
      ]),
    ];
  }

  /** The answer of the server to "what do you know about me?". */
  showMemory(npcId, memory) {
    this.memories.set(npcId, memory);
    if (this.isOpen && this.tab === "people") this.render();
  }

  renderConversations() {
    if (overheard.lines.length === 0) {
      return [
        element("p", {
          className: "empty",
          text: "Você ainda não ouviu nenhuma conversa. Chegue perto de moradores conversando; de um pouco mais longe, sem ser visto, eles falam o que pensam de verdade.",
        }),
      ];
    }

    return [...overheard.lines]
      .reverse()
      .map(({ author, listener, text, isPrivate, time }) =>
        element(
          "article",
          { className: `entry overheard${isPrivate ? " private" : ""}` },
          [
            element("p", { text: `${author}: ${text}` }),
            element("p", {
              className: "meta",
              text: `${time} · falando com ${listener}${isPrivate ? " · em segredo" : ""}`,
            }),
          ],
        ),
      );
  }

  renderInventory() {
    const { inventory } = playerState.state;

    if (inventory.length === 0) {
      return [
        element("p", { className: "empty", text: "Você não carrega nada." }),
      ];
    }

    const { weapon, armor } = equipmentOf(inventory);
    const healing = bestHealingItem(inventory);
    const { combat } = playerState.state;

    return [
      element(
        "ul",
        { className: "inventory" },
        inventory.map(({ name, quantity }) =>
          element("li", {
            text: `${quantity} × ${name}${healValue(name) ? ` (cura ${healValue(name)})` : ""}`,
          }),
        ),
      ),
      element("h4", { text: "Para lutar" }),
      element("p", {
        className: "meta",
        text: weapon.item
          ? `Arma: ${weapon.item} (+${weapon.bonus} de dano)`
          : "Arma: nenhuma (compre uma do ferreiro ou de um mercador)",
      }),
      element("p", {
        className: "meta",
        text: armor.item
          ? `Proteção: ${armor.item} (+${armor.bonus} de vida)`
          : "Proteção: nenhuma",
      }),
      element("p", {
        className: "meta",
        text: healing
          ? `H cura com: ${healing} (+${healValue(healing)})`
          : "Nada para curar: ervas, remédios e comida servem.",
      }),
      ...(combat
        ? [
            element("p", {
              className: "meta",
              text: `Lutas: ${combat.wins} vitória(s), ${combat.losses} derrota(s), ${combat.defenses} defesa(s) da vila`,
            }),
          ]
        : []),
    ];
  }

  renderNews() {
    const { news } = playerState.state;

    if (news.length === 0) {
      return [
        element("p", { className: "empty", text: "Nenhuma notícia ainda." }),
      ];
    }

    return [...news]
      .reverse()
      .map(({ text, time }) =>
        element("article", { className: "entry" }, [
          element("p", { className: "meta", text: time }),
          element("p", { text }),
        ]),
      );
  }
}
