import { NPC_CHAT } from "../config/constants";
import { GameObject } from "../GameObject";
import { PLACE_RADIUS, PLACES_BY_ID, nearestPlace } from "../levels/places";
import * as protocol from "../net/protocol";
import { gameSocket } from "../net/socket";
import { overheard } from "../state/overheard";
import { worldState } from "../state/worldState";
import {
  ENEMIES_AFFINITY,
  FRIENDS_AFFINITY,
  encounterChance,
  lineDuration,
  pairKey,
  selectEncounter,
} from "./encounters";
import { gameClock } from "./GameClock";
import { isFestivalTime } from "./time";

const randomBetween = ([min, max]) => min + Math.random() * (max - min);

/**
 * A conversation between two NPCs: waits for the server to generate it, plays
 * its lines in speech bubbles and applies its outcome.
 */
class NpcScene {
  constructor({ a, b, director, isPrivate }) {
    this.a = a;
    this.b = b;
    this.director = director;
    // Nobody seemed to be around: they speak freely, and stop if they see
    // the player
    this.isPrivate = isPrivate;
    this.heardLines = 0; // Lines the player was close enough to hear
    this.state = "WAITING"; // WAITING -> PLAYING -> DONE
    this.waitingTime = 0;
    this.conversationId = null;
    this.lines = [];
    this.outcome = null;
    this.shownLines = 0;
    this.timeToNextLine = 0;
  }

  involves(npc) {
    return npc === this.a || npc === this.b;
  }

  npcById(id) {
    return id === this.a.id ? this.a : this.b;
  }

  other(npc) {
    return npc === this.a ? this.b : this.a;
  }

  play({ conversationId, lines, outcome }) {
    this.state = "PLAYING";
    this.conversationId = conversationId;
    this.lines = lines;
    this.outcome = outcome;
  }

  step(delta) {
    if (this.state === "WAITING") {
      this.waitingTime += delta;

      if (this.waitingTime > NPC_CHAT.responseTimeoutMs) {
        this.release();
      }
      return;
    }

    if (this.state !== "PLAYING") {
      return;
    }

    if (this.isPrivate && this.director.canPlayerBeSeen(this.a, this.b)) {
      this.noticePlayer();
      return;
    }

    this.timeToNextLine -= delta;

    if (this.timeToNextLine > 0) {
      return;
    }

    if (this.shownLines < this.lines.length) {
      this.showLine(this.lines[this.shownLines]);
    } else {
      this.complete();
    }
  }

  showLine({ speakerId, text, emotion }) {
    const speaker = this.npcById(speakerId);
    const listener = this.other(speaker);
    const duration = lineDuration(text);

    speaker.faceTowards(listener);
    listener.faceTowards(speaker);
    speaker.sayLine(text, { emotion, time: duration });

    if (this.director.canPlayerHear(speaker)) {
      this.heardLines++;
      this.director.overhearLog.add({
        author: speaker.data.name,
        content: this.isPrivate ? `${text} (em segredo)` : text,
      });
      overheard.add({
        author: speaker.data.name,
        listener: listener.data.name,
        text,
        isPrivate: this.isPrivate,
        time: gameClock.format(),
      });
    }

    this.shownLines++;
    this.timeToNextLine = duration + NPC_CHAT.lineGapMs;
  }

  complete() {
    this.end();
    this.applyOutcome();
  }

  /** The NPCs saw the player listening: they stop and change the subject. */
  noticePlayer() {
    const { player } = this.director;
    const speaker = this.shownLines % 2 === 0 ? this.a : this.b;

    [this.a, this.b].forEach((npc) => {
      npc.faceTowards(player);
      npc.emotion.show("surprised", 2500);
    });
    // Only a problem if the player was listening (not just passing by)
    const wasListening = this.heardLines > 0;
    speaker.sayLine(
      wasListening
        ? "Ah... viajante! Há quanto tempo você está aí?"
        : "Olá, viajante!",
      { emotion: "surprised" },
    );

    this.end(null, { noticedPlayer: wasListening });
  }

  /** The player started talking with `npc` in the middle of the scene. */
  interrupt(npc) {
    this.end(npc.id);
  }

  end(interruptedBy = null, { noticedPlayer = false } = {}) {
    if (this.state === "PLAYING") {
      gameSocket.send(protocol.NPC_CONVERSATION_END, {
        data: {
          conversationId: this.conversationId,
          shownLines: this.shownLines,
          interruptedBy,
          noticedPlayer,
        },
      });
    }

    this.release();
  }

  release() {
    this.state = "DONE";
    this.a.leaveConversation(this);
    this.b.leaveConversation(this);
    this.director.finishScene(this);
  }

  applyOutcome() {
    const { action, targetId, callout } = this.outcome ?? {};

    if (!targetId) {
      return;
    }

    const target = this.npcById(targetId);
    const other = this.other(target);

    switch (action) {
      case "walk_together":
        other.followFor(target, NPC_CHAT.walkTogetherMs);
        break;

      case "go_to_player":
        target.followFor(this.director.player, NPC_CHAT.goToPlayerMs);
        if (callout) {
          target.sayLine(callout, { emotion: "surprised" });
          this.director.overhearLog.add({
            author: target.data.name,
            content: callout,
          });
        }
        break;

      case "avoid":
        target.walkAwayFrom(other);
        break;

      default:
        break;
    }
  }
}

/**
 * Makes NPCs that meet in the map talk to each other (see
 * docs/npc-interactions.md).
 */
export class NpcDirector extends GameObject {
  constructor({ npcs, player, overhearLog }) {
    super({});

    this.npcs = npcs; // Map id -> Npc
    this.player = player;
    this.overhearLog = overhearLog;
    this.time = 0;
    this.timeSinceCheck = 0;
    this.cooldowns = new Map();
    this.pairCooldowns = new Map();
    this.scenes = new Set();
    this.affinities = new Map(); // pairKey -> affinity (from the server)

    this.unsubscribe = [
      gameSocket.on(protocol.NPC_DIALOGUE, ({ data }) => this.onDialogue(data)),
      gameSocket.on(protocol.ERROR, ({ data }) => this.onError(data)),
      gameSocket.on(protocol.RELATIONSHIPS, ({ data }) =>
        data.forEach(({ a, b, affinity }) =>
          this.affinities.set(pairKey(a, b), affinity),
        ),
      ),
    ];
  }

  destroy() {
    this.unsubscribe.forEach((unsubscribe) => unsubscribe());
    super.destroy();
  }

  step(delta) {
    this.time += delta;

    this.scenes.forEach((scene) => scene.step(delta));

    this.timeSinceCheck += delta;

    if (
      this.timeSinceCheck < NPC_CHAT.checkIntervalMs ||
      this.scenes.size >= NPC_CHAT.maxConversations
    ) {
      return;
    }

    this.timeSinceCheck = 0;

    const candidates = [...this.npcs.values()]
      .filter((npc) => npc.isAvailableForConversation())
      .map((npc) => {
        // NPCs start together, so they wait a bit before the first talk
        if (!this.cooldowns.has(npc.id)) {
          this.cooldowns.set(
            npc.id,
            this.time + randomBetween(NPC_CHAT.firstCooldownMs),
          );
        }

        return { id: npc.id, x: npc.position.x, y: npc.position.y };
      });

    const encounter = selectEncounter(candidates, this.time, {
      distance: NPC_CHAT.distance,
      chance: NPC_CHAT.chance,
      chanceOf: (a, b) =>
        encounterChance(this.affinities.get(pairKey(a, b)), NPC_CHAT.chance) *
        (this.isAtFestival(this.npcs.get(a)) &&
        this.isAtFestival(this.npcs.get(b))
          ? NPC_CHAT.festivalChanceFactor
          : 1),
      cooldowns: this.cooldowns,
      pairCooldowns: this.pairCooldowns,
    });

    if (!encounter) {
      return;
    }

    const [a, b] = encounter.map((id) => this.npcs.get(id));
    const affinity = this.affinities.get(pairKey(a.id, b.id)) ?? 0;

    if (affinity <= ENEMIES_AFFINITY) {
      this.avoid(a, b);
    } else {
      this.startScene(a, b);
    }
  }

  /** Enemies don't talk: one of them walks away, both visibly angry. */
  avoid(a, b) {
    a.emotion.show("angry", 3000);
    b.emotion.show("angry", 3000);
    a.faceTowards(b);
    b.walkAwayFrom(a);
    this.setCooldowns(a, b, 1);
  }

  setCooldowns(a, b, pairCooldownFactor) {
    this.cooldowns.set(a.id, this.time + NPC_CHAT.cooldownMs);
    this.cooldowns.set(b.id, this.time + NPC_CHAT.cooldownMs);
    this.pairCooldowns.set(
      pairKey(a.id, b.id),
      this.time + NPC_CHAT.pairCooldownMs * pairCooldownFactor,
    );
  }

  startScene(a, b) {
    const place = nearestPlace(
      {
        x: (a.position.x + b.position.x) / 2,
        y: (a.position.y + b.position.y) / 2,
      },
      PLACE_RADIUS * 2,
    );

    // Close enough to hear but not to be seen: the player is eavesdropping
    const isPrivate = !this.canPlayerBeSeen(a, b);

    const sent = gameSocket.send(protocol.NPC_ENCOUNTER, {
      data: { a: a.id, b: b.id, placeId: place?.id ?? null, isPrivate },
    });

    if (!sent) {
      return;
    }

    const scene = new NpcScene({ a, b, director: this, isPrivate });
    this.scenes.add(scene);
    a.joinConversation(scene, b);
    b.joinConversation(scene, a);
  }

  finishScene(scene) {
    this.scenes.delete(scene);

    const { a, b } = scene;
    const affinity = this.affinities.get(pairKey(a.id, b.id)) ?? 0;
    // Friends meet again sooner
    this.setCooldowns(a, b, affinity >= FRIENDS_AFFINITY ? 0.5 : 1);
  }

  findWaitingScene(aId, bId) {
    return [...this.scenes].find(
      (scene) =>
        scene.state === "WAITING" && scene.a.id === aId && scene.b.id === bId,
    );
  }

  onDialogue(data) {
    const scene = this.findWaitingScene(data.a, data.b);

    if (!scene) {
      // The scene was interrupted or timed out: let the server forget it
      gameSocket.send(protocol.NPC_CONVERSATION_END, {
        data: { conversationId: data.conversationId, shownLines: 0 },
      });
      return;
    }

    scene.play(data);
  }

  onError(data) {
    if (data?.requestType !== protocol.NPC_ENCOUNTER) {
      return;
    }

    console.error("NPC conversation failed:", data.message);
    this.findWaitingScene(data.request?.a, data.request?.b)?.release();
  }

  /** Whether a gathering is happening and the NPC is there. */
  isAtFestival(npc) {
    const { festival } = worldState;
    const place = PLACES_BY_ID[festival?.placeId];

    return (
      Boolean(place) &&
      isFestivalTime(festival, gameClock.day, gameClock.hour) &&
      npc.isAt(place)
    );
  }

  /** Whether one of the NPCs is close enough to see the player. */
  canPlayerBeSeen(...npcs) {
    return npcs.some(
      (npc) =>
        Math.hypot(
          npc.position.x - this.player.position.x,
          npc.position.y - this.player.position.y,
        ) <= NPC_CHAT.seenDistance,
    );
  }

  canPlayerHear(npc) {
    return (
      Math.hypot(
        npc.position.x - this.player.position.x,
        npc.position.y - this.player.position.y,
      ) <= NPC_CHAT.overhearDistance
    );
  }
}
