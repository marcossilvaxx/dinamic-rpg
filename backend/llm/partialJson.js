// Reads a string field from a JSON object that is still being streamed, e.g.
// '{"content":"Hello, trav' -> "Hello, trav". Used to show the answer of an
// NPC while the model writes it (structured outputs come as JSON).

const ESCAPES = {
  '"': '"',
  "\\": "\\",
  "/": "/",
  b: "\b",
  f: "\f",
  n: "\n",
  r: "\r",
  t: "\t",
};

/**
 * @param {string} json Partial JSON text.
 * @param {string} field Name of a string field at any level.
 * @returns {string|null} The (partial) value, or null if it didn't start.
 */
export function partialStringField(json, field) {
  const match = new RegExp(`"${field}"\\s*:\\s*"`).exec(json);

  if (!match) {
    return null;
  }

  let value = "";
  let i = match.index + match[0].length;

  while (i < json.length) {
    const char = json[i];

    if (char === '"') {
      return value; // End of the string
    }

    if (char !== "\\") {
      value += char;
      i++;
      continue;
    }

    const next = json[i + 1];

    if (next === undefined) {
      break; // The escape is not complete yet
    }

    if (next === "u") {
      const hex = json.slice(i + 2, i + 6);
      if (hex.length < 4) break;
      value += String.fromCharCode(parseInt(hex, 16));
      i += 6;
      continue;
    }

    value += ESCAPES[next] ?? next;
    i += 2;
  }

  return value;
}

/**
 * Parses the first JSON object of `text`, tolerating what models sometimes
 * do in long answers: a second object after the first one, or raw line
 * breaks inside strings.
 * @returns {object|null}
 */
export function parseJsonLoose(text) {
  try {
    return JSON.parse(text);
  } catch {
    // Try the first complete object below
  }

  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  let json = "";

  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      // Raw control characters are not valid inside JSON strings
      json +=
        char < " "
          ? `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`
          : char;
      continue;
    }

    json += char;
    if (char === '"') inString = true;
    else if (char === "{") depth++;
    else if (char === "}" && --depth === 0) {
      try {
        return JSON.parse(json);
      } catch {
        return null;
      }
    }
  }

  return null;
}
