// The seed of the island is kept with the saved game (in the browser, like
// the session id): continuing a game draws the same island again. A new game
// gets a new seed and starts after a reload, so everything is built for it.

const SEED_KEY = "dinamic-rpg:seed";
const NEW_GAME_KEY = "dinamic-rpg:new-game";
const SESSION_KEY = "dinamic-rpg:session";
// Games saved before the islands were generated
const OLD_GAMES_SEED = 1;

const read = (key) => {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
};

const write = (key, value) => {
  try {
    if (value === null) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // Without storage every game is new
  }
};

const randomSeed = () => Math.floor(Math.random() * 2147483646) + 1;

/** The seed of the island of this game. */
export function islandSeed() {
  const saved = Number(read(SEED_KEY));
  if (saved > 0) return saved;

  const seed = read(SESSION_KEY) ? OLD_GAMES_SEED : randomSeed();
  write(SEED_KEY, String(seed));
  return seed;
}

/**
 * The saved game has another island (it is kept on the server): draws it
 * after a reload. Returns false when it is already the island of the page.
 */
export function adoptIslandSeed(seed) {
  if (!(seed > 0) || Number(read(SEED_KEY)) === seed) return false;
  write(SEED_KEY, String(seed));
  window.location.reload();
  return true;
}

/** A new game: another island, built after a reload. */
export function startNewIsland() {
  write(SEED_KEY, String(randomSeed()));
  write(NEW_GAME_KEY, "1");
  window.location.reload();
}

/** Whether this page was loaded to start a new game (only once). */
export function takeNewGameRequest() {
  const requested = read(NEW_GAME_KEY) === "1";
  write(NEW_GAME_KEY, null);
  return requested;
}
