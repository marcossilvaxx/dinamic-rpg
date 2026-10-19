import { sound } from "../../audio/sound";
import {
  FOLLOW_REPATH_DISTANCE,
  FOLLOW_REPATH_MS,
  GUIDE,
  NPC_IDLE_TIME_MS,
  NPC_WANDER_RADIUS,
  ROUTINE_STAY_MS,
  SEEK,
  WORK_HOURS,
} from "../../config/constants";
import { GameObject } from "../../GameObject";
import { chatContainer } from "../../hud/ChatContainer";
import { DOWN } from "../../Input";
import { PLACE_RADIUS, PLACES_BY_ID } from "../../levels/places";
import * as protocol from "../../net/protocol";
import { gameSocket } from "../../net/socket";
import { resources } from "../../Resource";
import { retangularCollision } from "../../utils/collision";
import {
  directionTowards,
  getPositionsAround,
  nextDirection,
} from "../../utils/grid";
import { worldState } from "../../state/worldState";
import { gameClock } from "../../systems/GameClock";
import { scheduleFor } from "../../systems/time";
import { pathfinder } from "../../utils/pathfinding";
import { getMillisecondsToReadText, preRenderText } from "../../utils/text";
import { Vector2 } from "../../utils/Vector2";
import { addCharacterSprites, playMovementAnimation } from "../Character";
import { EmotionIcon } from "../EmotionIcon";
import { SpeechBubble } from "../SpeechBubble";

const randomBetween = ([min, max]) => min + Math.random() * (max - min);

const distance = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// Max width (px) of the speech bubbles of the NPC lines
const LINE_BUBBLE_WIDTH = 60;
// Chat answers shown over the head of the NPC are cut at this length
const CHAT_BUBBLE_MAX_LENGTH = 90;
// The voice of NPCs farther than this from the player isn't heard
const VOICE_DISTANCE = 160;
// Bandits attack the player when this close
const BANDIT_SIGHT = 70;
// Vertical position of the body sprite (see objects/Character)
const BODY_Y = -8;
// How long the NPC works before walking around a bit
const WORK_SPELL_MS = [8000, 20000];

const truncate = (text, max) =>
  text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;

export class Npc extends GameObject {
  constructor(id, x, y, width, height, data) {
    super({
      position: new Vector2(x, y),
      width,
      height,
    });

    this.id = id;
    this.data = data;
    this.facingDirection = DOWN;

    this.isTalking = false; // Chatting with the player
    this.isSleeping = false;
    // Fighting with the player (moved by systems/FightManager.js)
    this.inFight = false;
    this.walkingInFight = false;
    this.combat = null;
    this.knockedOut = 0; // ms lying on the ground
    this.isWorking = false;
    this.workTime = 0; // Animation of the work
    // Going after the player to tell them something: { callout, timeLeft,
    // calledOut }
    this.seeking = null;
    this.npcConversation = null; // Scene of a conversation with another NPC
    this.lineBubble = null;
    // Inside a building: { interiorId, placeId, place } (see world/Interiors.js)
    this.indoor = null;
    this.followTarget = null;
    this.followTimeLeft = null; // null -> follow until stopFollow()
    this.lastFollowedPosition = null;
    this.timeSinceRepath = Infinity;

    this.path = null; // Remaining positions to walk, without the current one
    this.pathRequestId = 0;
    this.isCalculatingPath = false;
    this.idleTime = randomBetween(NPC_IDLE_TIME_MS);
    this.retryTime = 0; // Wait before asking a new path (after a failure)

    // Daily routine: the NPC goes from place to place of the village
    this.setRoutine(data.routine);
    this.routineIndex = Math.floor(Math.random() * this.routine.length);
    this.timeAtPlace = randomBetween(ROUTINE_STAY_MS);

    // Guiding the player: { target, isNpc, timeLeft }
    this.guide = null;

    this.nameTag = preRenderText({
      text: this.data.name,
      fontSize: 40,
      fontFamily: "Arial",
      fontColor: "black",
    });

    this.body = addCharacterSprites(this, resources.images[this.data.sprite]);

    this.hint = new SpeechBubble(0, this.body.position.y - 10, "", {
      persistent: true,
    });
    this.addChild(this.hint);

    this.emotion = new EmotionIcon(12, this.body.position.y - 2);
    this.addChild(this.emotion);

    this.unsubscribeSocket = gameSocket.onAgent(this.id, (message) =>
      this.handleServerMessage(message),
    );
  }

  ready(root) {
    this.root = root;
    this.body.animations.play("standDown");
  }

  destroy() {
    this.unsubscribeSocket();
    super.destroy();
  }

  handleServerMessage({ type, data }) {
    switch (type) {
      case protocol.CHAT_RESPONSE:
        this.say(data.content);
        break;

      case protocol.NPC_ACTION:
        this.say(data.lastWords);
        this.handleAction(data);
        break;

      case protocol.CHAT_DELTA:
        if (chatContainer.agentId === this.id) {
          chatContainer.streamMessage({
            author: this.data.name,
            content: data.content,
          });
        }
        break;

      case protocol.FIGHT_LINES:
        break; // Used by the FightManager

      case protocol.NPC_REACTION:
        this.root?.fights?.onReaction(this, data);
        break;

      case protocol.NPC_FOLLOW:
        this.walkWithPlayer(data);
        break;

      case protocol.NPC_UPDATED:
        this.update(data);
        break;

      // Answered to the journal (see main.js)
      case protocol.NPC_MEMORY_RESULT:
        break;

      case protocol.NPC_TYPING:
        if (chatContainer.agentId === this.id) {
          chatContainer.setTyping(this.data.name);
        }
        break;

      case protocol.NPC_SEEKS_PLAYER:
        this.seekPlayer(data.callout);
        break;

      case protocol.ERROR:
        console.error(data.message);
        if (chatContainer.agentId === this.id) {
          chatContainer.setTyping(null);
          chatContainer.addMessage({
            author: "Sistema",
            content: `${this.data.name} não conseguiu responder. Tente novamente.`,
          });
        }
        break;

      default:
        console.warn("Unhandled type:", type);
        break;
    }
  }

  handleAction(data) {
    const { action, lastWords } = data;
    const delay = getMillisecondsToReadText(lastWords) / 2;

    switch (action) {
      case "endConversation":
        setTimeout(() => this.endChat(), delay);
        break;

      case "followPlayer":
        this.follow(this.root.player);
        setTimeout(() => this.endChat(), delay);
        break;

      case "stopFollowPlayer":
        setTimeout(() => {
          this.endChat();
          this.stopFollow();
        }, delay);
        break;

      case "guidePlayerTo": {
        const place = PLACES_BY_ID[data.placeId];
        if (place) {
          this.guideTo(place);
        }
        setTimeout(() => this.endChat(), delay);
        break;
      }

      case "introducePlayerTo": {
        const target = this.root.npcs.get(data.targetId);
        if (target) {
          target.stayPut(GUIDE.timeoutMs);
          this.guideTo(target);
        }
        setTimeout(() => this.endChat(), delay);
        break;
      }

      case "giveQuest":
        this.emotion.show("question");
        break;

      case "completeQuest":
      case "sellItem":
      case "buyItem":
      case "acceptInvitation":
        this.emotion.show("happy");
        break;

      case "setBond":
        this.emotion.show(
          data.bond === "rival"
            ? "angry"
            : data.bond === "none"
              ? "sad"
              : "happy",
          4000,
        );
        break;

      case "confess":
        this.emotion.show("sad", 6000);
        break;

      case "startSparring":
        setTimeout(() => this.root.fights?.start(this, "sparring"), delay);
        break;

      case "startFight":
        setTimeout(
          () =>
            this.root.fights?.start(
              this,
              data.kind === "duel" ? "duel" : "fight",
              { aggressor: "npc" },
            ),
          delay,
        );
        break;

      case "giveItem":
      case "takeItem":
        break;

      default:
        console.warn("Unhandled action:", action);
        break;
    }
  }

  setRoutine(routine = []) {
    this.routine = routine
      .map((placeId) => PLACES_BY_ID[placeId])
      .filter(Boolean);
  }

  /** New data from the server (e.g. moved in with their partner). */
  update(data) {
    Object.assign(this.data, data);

    if (data.routine) {
      this.setRoutine(data.routine);
    }
  }

  /** Walks with the player for a while (e.g. to the gathering together). */
  walkWithPlayer({ callout, durationMs }) {
    if (!this.root || this.isTalking) {
      return;
    }

    this.guide = null;
    this.seeking = null;
    this.followFor(this.root.player, durationMs);

    if (callout) {
      this.sayLine(callout, { emotion: "happy" });
      this.root.overhearLog?.add({ author: this.data.name, content: callout });
    }
  }

  /** The NPC walking with the player (a friend helping), if any. */
  companionOfPlayer() {
    const { player, npcs } = this.root;

    return (
      [...npcs.values()].find(
        (npc) => npc !== this && npc.followTarget === player && !npc.seeking,
      ) ?? null
    );
  }

  /** An answer in the chat with the player (also shown over the head). */
  say(content) {
    if (chatContainer.agentId !== this.id) {
      return;
    }

    chatContainer.setTyping(null);
    chatContainer.addMessage({ author: this.data.name, content });

    if (content) {
      this.sayLine(truncate(content, CHAT_BUBBLE_MAX_LENGTH));
    }
  }

  follow(target) {
    this.followTarget = target;
    this.followTimeLeft = null;
    this.lastFollowedPosition = null;
    this.timeSinceRepath = Infinity;
    this.cancelPath();
  }

  followFor(target, milliseconds) {
    this.follow(target);
    this.followTimeLeft = milliseconds;
  }

  stopFollow() {
    this.followTarget = null;
    this.followTimeLeft = null;
    this.cancelPath();
  }

  isAvailableForConversation() {
    return (
      !this.data.bandit &&
      !this.inFight &&
      !this.knockedOut &&
      !this.isTalking &&
      !this.isSleeping &&
      !this.npcConversation &&
      !this.followTarget &&
      !this.guide &&
      !this.seeking
    );
  }

  get isSeekingPlayer() {
    return Boolean(this.seeking);
  }

  /**
   * Where the NPC should be now (sleep, gatherings, rain, meals...), see
   * systems/time.js.
   */
  get schedule() {
    return scheduleFor(
      gameClock.hour,
      { id: this.id, routine: this.routine.map((place) => place.id) },
      Boolean(PLACES_BY_ID.tavern),
      {
        weather: worldState.weather,
        festival: worldState.festival,
        day: gameClock.day,
        raid: worldState.state.raid,
      },
    );
  }

  /** The NPC goes after the player to tell them something. */
  seekPlayer(callout) {
    if (this.isTalking || !this.root) {
      return; // Already talking with the player (or not in the map yet)
    }

    this.guide = null;
    this.seeking = { callout, timeLeft: SEEK.timeoutMs, calledOut: false };
    this.follow(this.root.player);
  }

  stopSeeking() {
    if (this.seeking && this.followTarget === this.root?.player) {
      this.stopFollow();
    }
    this.seeking = null;
  }

  updateSeeking(delta, { player }) {
    const seeking = this.seeking;
    seeking.timeLeft -= delta;

    if (seeking.timeLeft <= 0) {
      this.stopSeeking();
      return;
    }

    if (
      !seeking.calledOut &&
      distance(this.position, player.position) <= SEEK.callDistance
    ) {
      seeking.calledOut = true;
      seeking.timeLeft = SEEK.waitMs;
      this.stopFollow();
      this.faceTowards(player);
      this.sayLine(seeking.callout, { emotion: "surprised" });
      this.root.overhearLog?.add({
        author: this.data.name,
        content: seeking.callout,
      });
    }

    if (seeking.calledOut) {
      this.faceTowards(player);
    }
  }

  /** Knocked out in a fight: lies on the ground for a while. */
  knockOut(milliseconds) {
    this.knockedOut = milliseconds;
    this.body.lying = true;
    this.cancelPath();
    this.stopFollow();
    this.guide = null;
    this.seeking = null;
  }

  /** Hit by the player, the NPC runs away scared. */
  runAwayFrom(other) {
    this.stopFollow();
    this.guide = null;
    this.walkAwayFrom(other);
    this.emotion.show("surprised", 3000);
    this.idleTime = 6000;
  }

  /** The place the NPC is going to or staying at (inside a building, a spot of it). */
  get routinePlace() {
    return this.indoor?.place ?? this.outdoorPlace;
  }

  /**
   * Whether the NPC is in Pedravento now: people of the town (unless
   * visiting the village) and villagers that went there for the day.
   */
  get isInTown() {
    return this.data.away
      ? this.data.away === "town"
      : this.data.region === "town";
  }

  /** The place of the village the NPC is going to or staying at. */
  get outdoorPlace() {
    // In the town they walk around the square (the places are of the village)
    if (this.isInTown) return null;

    // Bandits stay where they attacked
    if (this.data.bandit) {
      return this.routine[0] ?? null;
    }

    // Hurt villagers stay at home
    if (this.data.injured && this.routine[0]) {
      return this.routine[0];
    }

    const scheduled = PLACES_BY_ID[this.schedule.placeId];

    if (scheduled) {
      return scheduled;
    }

    return this.routine.length
      ? this.routine[this.routineIndex % this.routine.length]
      : null;
  }

  isAt(place) {
    return distance(this.position, place) <= PLACE_RADIUS + 6;
  }

  /** A random free position at most `radius` away from `center`. */
  randomFreeSpot(center, radius) {
    for (let attempt = 0; attempt < 10; attempt++) {
      const x = Math.round(center.x + randomBetween([-1, 1]) * radius);
      const y = Math.round(center.y + randomBetween([-1, 1]) * radius);

      if (!this.root.collision.isBlocked(x, y, this.width, this.height)) {
        return new Vector2(x, y);
      }
    }

    return null;
  }

  /** Stops walking around for a while (e.g. to be introduced). */
  stayPut(milliseconds) {
    if (this.isTalking || this.npcConversation) {
      return;
    }

    this.cancelPath();
    this.retryTime = milliseconds;
  }

  /**
   * Walks with the player to `target` (a place or another NPC), waiting for
   * the player when they fall behind.
   */
  guideTo(target) {
    this.stopFollow();
    this.cancelPath();
    this.guide = {
      target,
      isNpc: target instanceof Npc,
      timeLeft: GUIDE.timeoutMs,
    };
  }

  joinConversation(scene, partner) {
    this.npcConversation = scene;
    this.cancelPath();
    this.faceTowards(partner);
  }

  leaveConversation(scene) {
    if (this.npcConversation === scene) {
      this.npcConversation = null;
      this.idleTime = randomBetween(NPC_IDLE_TIME_MS);
    }
  }

  faceTowards(other) {
    this.facingDirection = directionTowards(this.position, other.position);
  }

  /** Shows a line said by the NPC in a speech bubble over its head. */
  sayLine(text, { emotion, time } = {}) {
    this.lineBubble?.destroy();
    this.emotion.show(emotion, time);

    const player = this.root?.player;
    if (player) {
      const volume =
        1 - distance(this.position, player.position) / VOICE_DISTANCE;
      sound.speak(this.id, text, volume);
    }

    this.lineBubble = new SpeechBubble(0, this.hint.position.y, text, {
      emotion,
      time,
      maxWidth: LINE_BUBBLE_WIDTH,
    });

    this.addChild(this.lineBubble);
  }

  /** Walks to a free spot in the opposite direction of `other`. */
  walkAwayFrom(other) {
    const dx = this.position.x - other.position.x;
    const dy = this.position.y - other.position.y;
    const length = Math.hypot(dx, dy) || 1;

    for (const scale of [1, 0.66, 0.33]) {
      const destination = new Vector2(
        Math.round(this.position.x + (dx / length) * NPC_WANDER_RADIUS * scale),
        Math.round(this.position.y + (dy / length) * NPC_WANDER_RADIUS * scale),
      );

      if (
        !this.root.collision.isBlocked(
          destination.x,
          destination.y,
          this.width,
          this.height,
        )
      ) {
        this.moveTo(destination);
        return;
      }
    }
  }

  cancelPath() {
    this.pathRequestId++;
    this.isCalculatingPath = false;
    this.path = null;
  }

  moveTo(destination) {
    const requestId = ++this.pathRequestId;
    this.isCalculatingPath = true;

    pathfinder
      .find(this.position, destination, this.width, this.height)
      .then((path) => {
        if (requestId !== this.pathRequestId) {
          return; // A newer request replaced this one
        }

        this.isCalculatingPath = false;
        this.path = path?.length > 1 ? path.slice(1) : null;

        if (!path) {
          this.retryTime = 1000; // Unreachable: try something else later
        }
      });
  }

  step(delta, root) {
    this.debugMode = root.debugMode;

    if (this.inFight || this.knockedOut) {
      this.updateFightState(delta);
      return;
    }

    if (this.data.bandit) {
      this.updateBandit(delta, root);
      return;
    }

    this.updatePlayerInteraction(root);

    if (this.isTalking || this.npcConversation) {
      this.isWorking = false;
      this.updateIcon();
      playMovementAnimation(this.body, this.facingDirection, false);
      return;
    }

    this.updateSleep();
    this.updateIcon();

    if (this.isSleeping) {
      playMovementAnimation(this.body, DOWN, false);
      return;
    }

    if (this.retryTime > 0) {
      this.retryTime -= delta;
    }

    if (this.seeking) {
      this.updateSeeking(delta, root);
    }

    if (this.seeking?.calledOut) {
      // Waits for the player to come and talk
      playMovementAnimation(this.body, this.facingDirection, false);
      return;
    } else if (this.guide) {
      if (!this.updateGuide(delta, root)) {
        playMovementAnimation(this.body, this.facingDirection, false);
        return;
      }
    } else if (this.followTarget) {
      if (this.followTimeLeft !== null) {
        this.followTimeLeft -= delta;

        if (this.followTimeLeft <= 0) {
          this.stopFollow(); // Back to the routine in the next frame
        }
      }

      if (this.followTarget) {
        this.updateFollow(delta, root);
      }
    } else {
      this.updateRoutine(delta);
      this.updateWork(delta);

      if (!this.isWorking) {
        this.updateWander(delta);
      }
    }

    this.walk();
  }

  /** Bandits roam where they attacked and go after the player. */
  updateBandit(delta, root) {
    const { player, fights } = root;
    this.hint.visible = false;
    this.emotion.setPersistent("angry");

    const distanceToPlayer = distance(this.position, player.position);
    const fightKind = fights?.fight?.kind;

    if (
      distanceToPlayer <= BANDIT_SIGHT &&
      (!fightKind || fightKind === "bandits")
    ) {
      fights.start(this, "bandits");
      return;
    }

    if (this.retryTime > 0) this.retryTime -= delta;
    this.updateWander(delta);
    this.walk();
  }

  /** In a fight (moved by the FightManager) or lying knocked out. */
  updateFightState(delta) {
    this.hint.visible = false;

    if (this.knockedOut) {
      this.knockedOut = Math.max(0, this.knockedOut - delta);
      this.emotion.setPersistent("dizzy");

      if (!this.knockedOut) {
        this.body.lying = false;
        this.idleTime = 0;
      }
      return;
    }

    this.emotion.setPersistent(null);
    playMovementAnimation(this.body, this.facingDirection, this.walkingInFight);
  }

  /**
   * At their workplace (the first place of the routine), during work hours,
   * the NPC stays working instead of walking around.
   */
  updateWork(delta) {
    const workplace = this.routine[0];
    const hour = gameClock.hour;
    const canWork =
      !this.data.injured &&
      this.data.work &&
      this.data.work !== "none" &&
      workplace &&
      this.schedule.reason === null &&
      hour >= WORK_HOURS[0] &&
      hour < WORK_HOURS[1] &&
      this.outdoorPlace === workplace;

    // Working at the door, or inside the building
    const atWork =
      canWork &&
      this.isAt(this.routinePlace) &&
      !this.path &&
      !this.isCalculatingPath;

    // Works for a while, then walks around the workplace and works again
    if (atWork && !this.isWorking && this.idleTime > 0) {
      this.isWorking = true;
      this.idleTime = randomBetween(WORK_SPELL_MS);
    }

    if (!atWork) {
      this.isWorking = false;
    }

    if (this.isWorking) {
      this.workTime += delta;
      this.idleTime -= delta;
      this.isWorking = this.idleTime > 0;
    }
  }

  /** Icon always shown over the head: sleeping, wants to talk or working. */
  updateIcon() {
    // Small "busy" movement while working
    this.body.position.y =
      BODY_Y +
      (this.isWorking ? Math.round(Math.sin(this.workTime / 150)) * 0.5 : 0);

    this.emotion.setPersistent(
      this.isSleeping
        ? "sleeping"
        : this.seeking
          ? "attention"
          : this.data.injured
            ? "injured"
            : this.isWorking
              ? this.data.work
              : null,
    );
  }

  /** @returns {boolean} Whether the NPC should keep walking. */
  updateGuide(delta, { player }) {
    const guide = this.guide;
    guide.timeLeft -= delta;

    if (guide.timeLeft <= 0) {
      this.guide = null;
      return true;
    }

    // Wait for the player
    if (distance(this.position, player.position) > GUIDE.waitDistance) {
      this.faceTowards(player);
      return false;
    }

    const { target, isNpc } = guide;
    const arrived = isNpc
      ? distance(this.position, target.position) <= GUIDE.arriveDistance
      : this.isAt(target);

    if (arrived) {
      this.guide = null;
      this.cancelPath();
      this.faceTowards(player);
      this.idleTime = 3000;

      if (isNpc) {
        this.sayLine(`Este é ${target.data.name}!`);
        target.faceTowards(player);
        target.stayPut(5000);
      } else {
        this.sayLine(`Chegamos: ${target.name}!`);
      }
      return false;
    }

    if (this.path || this.isCalculatingPath || this.retryTime > 0) {
      return true;
    }

    const destination = isNpc
      ? getPositionsAround(target).find(
          (position) =>
            !this.root.collision.isBlocked(
              position.x,
              position.y,
              this.width,
              this.height,
            ),
        )
      : this.randomFreeSpot(target, PLACE_RADIUS / 2);

    if (destination) {
      this.moveTo(destination);
    }

    return true;
  }

  /** At night the NPC sleeps once it gets home. */
  updateSleep() {
    const { sleeping } = this.schedule;
    const isFree = !this.guide && !this.followTarget;

    this.isSleeping =
      sleeping &&
      isFree &&
      Boolean(this.routinePlace) &&
      this.isAt(this.routinePlace);

    if (this.isSleeping) {
      this.cancelPath();
      this.isWorking = false;
      this.seeking = null;
    }
  }

  /** Moves on to the next place of the routine after some time in a place. */
  updateRoutine(delta) {
    const place = this.routinePlace;

    // Sleep, meals and evenings override the routine (see systems/time.js)
    if (!place || this.schedule.placeId || !this.isAt(place)) {
      return;
    }

    this.timeAtPlace -= delta;

    if (this.timeAtPlace <= 0) {
      this.routineIndex++;
      this.timeAtPlace = randomBetween(ROUTINE_STAY_MS);
    }
  }

  updatePlayerInteraction({ player, input }) {
    const isNearPlayer = retangularCollision(player, this);

    this.hint.visible = isNearPlayer;

    // Lines of NPC conversations go above the interaction hint
    if (this.lineBubble) {
      this.lineBubble.position.y =
        this.hint.position.y - (isNearPlayer ? 9 : 0);
    }

    if (!isNearPlayer) {
      if (this.isTalking) {
        this.endChat(); // The player walked away
      }
      return;
    }

    if (this.isTalking) {
      this.hint.text = "Q - Sair";

      if (input.keys.q) {
        this.endChat();
      }
      return;
    }

    this.hint.text = "E - Interagir";

    if (input.keys.e && !chatContainer.isOpen) {
      this.npcConversation?.interrupt(this);
      this.startChat(player);
    }
  }

  updateFollow(delta, { collision, resolveFollowTarget }) {
    this.timeSinceRepath += delta;

    // The player may be inside a building: the NPC goes to its door first
    const target = resolveFollowTarget?.(this) ?? this.followTarget;
    const last = this.lastFollowedPosition;
    const targetMoved =
      !last ||
      Math.abs(target.position.x - last.x) +
        Math.abs(target.position.y - last.y) >=
        FOLLOW_REPATH_DISTANCE;

    if (
      !targetMoved ||
      this.isCalculatingPath ||
      this.retryTime > 0 ||
      this.timeSinceRepath < FOLLOW_REPATH_MS
    ) {
      return;
    }

    const destination = getPositionsAround(target).find(
      (position) =>
        !collision.isBlocked(position.x, position.y, this.width, this.height),
    );

    if (!destination) {
      return;
    }

    this.timeSinceRepath = 0;
    this.lastFollowedPosition = target.position.duplicate();

    if (!destination.equals(this.position)) {
      this.moveTo(destination);
    }
  }

  updateWander(delta) {
    if (this.path || this.isCalculatingPath || this.retryTime > 0) {
      return;
    }

    const place = this.routinePlace;
    const isGoingToPlace = place && !this.isAt(place);

    // Pauses between walks, except when going to the next place
    if (!isGoingToPlace) {
      this.idleTime -= delta;

      if (this.idleTime > 0) {
        return;
      }

      this.idleTime = randomBetween(NPC_IDLE_TIME_MS);
    }

    // Walks around its current place (or around itself, without routine)
    const destination = place
      ? this.randomFreeSpot(place, PLACE_RADIUS)
      : this.randomFreeSpot(this.position, NPC_WANDER_RADIUS);

    if (destination) {
      this.moveTo(destination);
    }
  }

  walk() {
    // Stand still while a new path is being calculated so the NPC doesn't
    // drift away from the position the path starts at.
    if (!this.path || this.isCalculatingPath) {
      playMovementAnimation(this.body, this.facingDirection, false);
      return;
    }

    const next = this.path.shift();

    this.facingDirection =
      nextDirection(this.position.x, this.position.y, next.x, next.y) ||
      this.facingDirection;
    playMovementAnimation(this.body, this.facingDirection, true);

    this.position.x = next.x;
    this.position.y = next.y;

    if (this.path.length === 0) {
      this.path = null;
    }
  }

  drawImage(ctx, x, y) {
    if (this.debugMode) {
      this.debug(ctx);
    }

    if (this.nameTag) {
      const width = ctx.measureText(this.data.name).width;
      this.nameTag.drawImage(
        ctx,
        this.width * 2 > width
          ? x + (this.width * 2 - width) / 4
          : x - (width - this.width * 2) / 4,
        y - this.height,
      );
    }
  }

  debug(ctx) {
    ctx.strokeStyle = "blue";
    ctx.lineWidth = 1;
    ctx.strokeRect(this.position.x, this.position.y, this.width, this.height);
  }

  startChat(player) {
    this.isTalking = true;
    this.isWorking = false;
    this.stopSeeking();
    this.cancelPath();
    this.faceTowards(player);

    chatContainer.show({
      agentId: this.id,
      onSubmit: (message) => {
        const sent = gameSocket.send(protocol.CHAT, {
          agentId: this.id,
          data: { message },
        });

        if (sent) {
          chatContainer.setTyping(this.data.name);
        } else {
          chatContainer.addMessage({
            author: "Sistema",
            content: "Sem conexão com o servidor.",
          });
        }
      },
    });

    // The NPC may speak first (greeting, or what it wanted to tell). A friend
    // walking with the player helps to get the NPC to talk.
    gameSocket.send(protocol.CHAT_OPENED, {
      agentId: this.id,
      data: { companionId: this.companionOfPlayer()?.id ?? null },
    });
  }

  endChat() {
    if (!this.isTalking) {
      return;
    }

    this.isTalking = false;

    if (chatContainer.agentId === this.id) {
      chatContainer.hide();
    }

    // The server summarizes the chat into something the NPC may tell others
    gameSocket.send(protocol.CHAT_CLOSED, { agentId: this.id });
  }
}
