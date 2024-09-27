/* eslint-disable no-undef */
importScripts("shortestPath.js");

self.onmessage = function (e) {
  const { startPos, endPos, collisionBlocks, width, height } = e.data;

  const path = findShortestPath(
    startPos,
    endPos,
    collisionBlocks,
    width,
    height
  );

  self.postMessage(path);
};
