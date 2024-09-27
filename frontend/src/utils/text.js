import { WORDS_PER_SECOND } from "../config/constants";

export const preRenderText = ({ text, fontSize, fontFamily, fontColor }) => {
  const textCanvas = document.createElement("canvas");
  textCanvas.width = 70 * 12;
  textCanvas.height = 40 * 12;
  const textContext = textCanvas.getContext("2d");
  textContext.imageSmoothingEnabled = false;
  textContext.textBaseline = "top";
  textContext.fillStyle = fontColor;
  textContext.font = `${fontSize}px ${fontFamily}`;
  textContext.fillText(text, 0, 0);

  return {
    drawImage: (ctx, x, y) => {
      ctx.drawImage(textCanvas, x, y, 100, 50);
    },
  };
};

export const getMillisecondsToReadText = (text) => {
  const splittedText = text.split(" ");

  const secondsToRead = splittedText.length / (WORDS_PER_SECOND - 2.3); // Removes an offset

  const millisecondsToRead = secondsToRead * 1000;

  return millisecondsToRead;
};
