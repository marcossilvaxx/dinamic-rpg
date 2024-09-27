import Animations from "../../Animations";
import { events } from "../../Events";
import { GameObject } from "../../GameObject";
import { chatContainer } from "../../hud/ChatContainer";
import { DOWN, LEFT, RIGHT, UP } from "../../Input";
import { mainScene } from "../../main";
import { resources } from "../../Resource";
import { Sprite } from "../../Sprite";
import { retangularCollision } from "../../utils/collision";
import { FrameIndexPattern } from "../../utils/FrameIndexPattern";
import { getBackPosition, nextDirection } from "../../utils/grid";
import { findShortestPath } from "../../utils/grid";
import { getMillisecondsToReadText, preRenderText } from "../../utils/text";
import { Vector2 } from "../../utils/Vector2";
import {
  STAND_DOWN,
  STAND_LEFT,
  STAND_RIGHT,
  STAND_UP,
  WALK_DOWN,
  WALK_LEFT,
  WALK_RIGHT,
  WALK_UP,
} from "../Hero/animations";
import { SpeechBubble } from "../SpeechBubble";
import env from "../../config/env.json";

export class Npc extends GameObject {
  constructor(id, x, y, width, height, data) {
    super({
      position: new Vector2(x, y),
      width,
      height,
    });

    this.id = id;
    this.data = data;
    this.pathToFollow = null;
    this.targetToFollow = null;
    this.targetPosition = null;
    this.facingDirection = DOWN;
    this.state = null;
    this.worker = null;

    this.nameTag = preRenderText({
      text: this.data.name,
      fontSize: 40,
      fontFamily: "Arial",
      fontColor: "black",
    });

    const shadowOffset = new Vector2(-8, -20);
    const shadow = new Sprite({
      resource: resources.images.shadow,
      frameSize: new Vector2(32, 32),
      position: shadowOffset,
    });

    this.addChild(shadow);

    this.body = new Sprite({
      resource: resources.images[this.data.sprite],
      frameSize: new Vector2(32, 36),
      hFrames: 3,
      vFrames: 4,
      frame: 1,
      scale: 0.5,
      position: new Vector2(0, -8),
      animations: new Animations({
        walkDown: new FrameIndexPattern(WALK_DOWN),
        walkUp: new FrameIndexPattern(WALK_UP),
        walkLeft: new FrameIndexPattern(WALK_LEFT),
        walkRight: new FrameIndexPattern(WALK_RIGHT),
        standDown: new FrameIndexPattern(STAND_DOWN),
        standUp: new FrameIndexPattern(STAND_UP),
        standLeft: new FrameIndexPattern(STAND_LEFT),
        standRight: new FrameIndexPattern(STAND_RIGHT),
      }),
    });

    this.addChild(this.body);

    this.initialSetup();
  }

  initialSetup() {
    this.socket = new WebSocket(env.WEBSOCKET_SERVER_URL);

    this.socket.addEventListener("message", (event) => {
      const { type, message, data } = JSON.parse(event.data);

      switch (type) {
        case "error":
          console.error(message);
          break;

        case "chat_response":
          chatContainer.addMessage({
            author: this.data.name,
            content: data.response.content,
          });
          break;

        case "end_chat":
          chatContainer.addMessage({
            author: this.data.name,
            content: data.lastWords,
          });

          setTimeout(() => {
            this.state = null;
            this.closeChat();
          }, getMillisecondsToReadText(data.lastWords) / 2);
          break;

        case "follow_player":
          chatContainer.addMessage({
            author: this.data.name,
            content: data.lastWords,
          });
          this.follow("PLAYER");

          setTimeout(() => {
            this.state = null;
            this.closeChat();
          }, getMillisecondsToReadText(data.lastWords) / 2);
          break;

        case "stop_follow_player":
          chatContainer.addMessage({
            author: this.data.name,
            content: data.lastWords,
          });

          setTimeout(() => {
            this.state = null;
            this.closeChat();
            this.stopFollow();
          }, getMillisecondsToReadText(data.lastWords) / 2);
          break;

        default:
          console.warn("Unhandled type:", type);
          break;
      }
    });
  }

  ready() {
    this.body.animations.play("standDown");

    this.worker = new Worker("./src/utils/pathfindingWorker.js");

    this.worker.onmessage = ({ data }) => {
      this.pathToFollow = data;
      this.state = null;
    };
  }

  follow(target = "PLAYER") {
    this.state = "FOLLOWING";

    this.pathToFollow = null;

    this.targetToFollow = events.on(`${target}_POSITION`, this, (pos) => {
      const destinationPosition = getBackPosition(
        pos.facingDirection,
        pos.position,
        pos.width,
        pos.height
      );

      this.pathToFollow = findShortestPath(
        this.position,
        destinationPosition,
        mainScene.collisionBlocks.map((block) => ({
          position: {
            x: block.position.x,
            y: block.position.y,
          },
          width: block.width,
          height: block.height,
        })),
        this.width,
        this.height
      );

      this.targetPosition = new Vector2(
        destinationPosition.x,
        destinationPosition.y
      );
    });
  }

  stopFollow() {
    events.off(this.targetToFollow);
    this.targetToFollow = null;
  }

  moveTo(pos) {
    this.state = "CALCULATING_PATH";

    this.worker.postMessage({
      startPos: this.position,
      endPos: pos,
      collisionBlocks: mainScene.collisionBlocks.map((block) => ({
        position: {
          x: block.position.x,
          y: block.position.y,
        },
        width: block.width,
        height: block.height,
      })),
      width: this.width,
      height: this.height,
    });
  }

  speak(text) {
    const newSpeech = new SpeechBubble(0, this.body.position.y - 10, text, 1);

    this.addChild(newSpeech);
  }

  step(delta, root) {
    this.debugMode = root.debugMode;
    const { collisionBlocks, player, input } = root;

    if (this.targetToFollow) {
      if (this.targetPosition && this.position.equals(this.targetPosition)) {
        this.state = "WAITING";
      } else {
        this.state = "FOLLOWING";
      }
    }

    this.checkCollision(player, () => {
      if (input.keys.e) {
        if (this.state === "TALKING") {
          return;
        }
        this.state = "TALKING";
        this.initChat();
        // this.pathToFollow = null;
      } else if (input.keys.q) {
        this.state = null;
        this.closeChat();
      } else {
        if (this.state === "TALKING") {
          this.speak("Q - Sair");
          return;
        }
        if (this.state === "COLLIDING") {
          this.speak("E - Interagir");
          return;
        }
        if (["WAITING", "FOLLOWING"].includes(this.state)) {
          this.speak("E - Interagir");
        }
        this.state = "COLLIDING";
      }
    });

    if (["CALCULATING_PATH", "TALKING", "WAITING"].includes(this.state)) {
      if (this.facingDirection === LEFT) {
        this.body.animations.play("standLeft");
      }
      if (this.facingDirection === RIGHT) {
        this.body.animations.play("standRight");
      }
      if (this.facingDirection === UP) {
        this.body.animations.play("standUp");
      }
      if (this.facingDirection === DOWN) {
        this.body.animations.play("standDown");
      }

      return;
    }

    if (this.pathToFollow && this.pathToFollow.length > 1) {
      const direction = nextDirection(
        this.position.x,
        this.position.y,
        this.pathToFollow[1].x,
        this.pathToFollow[1].y
      );

      if (direction) {
        this.facingDirection = direction;
      }

      if (direction === DOWN) {
        this.body.animations.play("walkDown");
      }

      if (direction === UP) {
        this.body.animations.play("walkUp");
      }

      if (direction === LEFT) {
        this.body.animations.play("walkLeft");
      }

      if (direction === RIGHT) {
        this.body.animations.play("walkRight");
      }

      this.position.x = this.pathToFollow[1].x;
      this.position.y = this.pathToFollow[1].y;

      this.pathToFollow = this.pathToFollow.slice(1, this.pathToFollow.length);
    } else {
      if (this.targetToFollow) {
        return;
      }

      const randomPosition = new Vector2(
        Math.floor(Math.random() * 70 * 12),
        Math.floor(Math.random() * 40 * 12)
      );

      if (
        !collisionBlocks.some((block) =>
          retangularCollision(block, {
            position: new Vector2(randomPosition.x, randomPosition.y),
            width: this.width,
            height: this.height,
          })
        )
      ) {
        this.moveTo(new Vector2(randomPosition.x, randomPosition.y));
      }
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
        y - this.height
      );
    }
  }

  debug(ctx) {
    ctx.strokeStyle = "blue";
    ctx.lineWidth = 1;
    ctx.strokeRect(this.position.x, this.position.y, this.width, this.height);
  }

  checkCollision(object, callback) {
    if (
      retangularCollision(
        {
          position: object.position,
          width: object.width,
          height: object.height,
        },
        {
          position: this.position,
          width: this.width,
          height: this.height,
        }
      )
    ) {
      callback();
    }
  }

  initChat() {
    chatContainer.show({
      agentId: this.id,
      onSubmit: (value) => {
        this.socket.send(
          JSON.stringify({
            type: "chat",
            agentId: this.id,
            data: { message: value },
          })
        );
      },
    });
  }

  closeChat() {
    chatContainer.hide();
  }
}
