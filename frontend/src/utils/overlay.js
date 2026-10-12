// Things drawn over the foreground of the map (speech bubbles and emotion
// icons), so trees and roofs don't hide them: during the scene draw they are
// queued, and main.js draws the queue after the foreground.

const queue = [];

export const overlayLayer = {
  /** @param {(ctx: CanvasRenderingContext2D) => void} draw */
  add(draw) {
    queue.push(draw);
  },

  draw(ctx) {
    queue.splice(0).forEach((draw) => draw(ctx));
  },
};
