/** Banner of the current fight: who is fighting, both lives and the keys. */
export class FightHud {
  constructor(root = "game-container") {
    this.element = document.createElement("div");
    this.element.className = "fight-hud";
    this.element.innerHTML = `
      <p class="fight-title"></p>
      <div class="fight-bars">
        <div class="fight-bar player"><span></span></div>
        <strong>VS</strong>
        <div class="fight-bar npc"><span></span></div>
      </div>
      <p class="fight-keys">Espaço: atacar · Shift: esquivar · H: curar</p>`;
    document.getElementById(root).appendChild(this.element);
  }

  show(title) {
    this.element.querySelector(".fight-title").textContent = title;
    this.element.style.display = "flex";
  }

  update(playerFraction, npcFraction) {
    this.element.querySelector(".player span").style.width =
      `${Math.max(0, playerFraction) * 100}%`;
    this.element.querySelector(".npc span").style.width =
      `${Math.max(0, npcFraction) * 100}%`;
  }

  hide() {
    this.element.style.display = "none";
  }
}
