// Weather of the village. It changes at most once per game hour, following
// the transitions below (rain usually comes after clouds, storms after rain,
// fog only in the morning...) and the season (snow instead of rain in
// winter, little rain in summer). The frontend draws it and moves the NPCs to
// shelter when it rains or snows.

export const WEATHERS = {
  clear: { label: "céu limpo", prompt: "clear sky, sunny" },
  cloudy: { label: "nublado", prompt: "cloudy, grey sky" },
  rain: { label: "chuva", prompt: "raining" },
  storm: {
    label: "tempestade",
    prompt: "a storm, with heavy rain and thunder",
  },
  fog: { label: "neblina", prompt: "thick fog" },
  snow: { label: "neve", prompt: "snowing, everything is white and cold" },
};

// Chance of going from one weather (key) to the next one, per game hour
const TRANSITIONS = {
  clear: { clear: 0.75, cloudy: 0.2, fog: 0.05 },
  cloudy: { clear: 0.35, cloudy: 0.4, rain: 0.25 },
  rain: { rain: 0.5, cloudy: 0.35, storm: 0.15 },
  storm: { storm: 0.3, rain: 0.7 },
  fog: { fog: 0.4, clear: 0.4, cloudy: 0.2 },
  snow: { snow: 0.6, cloudy: 0.4 },
};

// Messages shown to the player when the weather changes
const CHANGE_MESSAGES = {
  clear: "O céu abriu na vila.",
  cloudy: "O céu ficou nublado.",
  rain: "Começou a chover. Os moradores procuram abrigo.",
  storm: "Uma tempestade chegou à vila!",
  fog: "Uma neblina cobriu a vila.",
  snow: "Começou a nevar! Os moradores procuram abrigo.",
};

export const isShelterWeather = (weather) =>
  weather === "rain" || weather === "storm" || weather === "snow";

/** The transitions of `weather` adjusted to the season. */
function transitionsFor(weather, season) {
  const base = { ...(TRANSITIONS[weather] ?? TRANSITIONS.clear) };

  if (season === "winter") {
    // In winter it snows instead of raining
    if (base.rain) {
      base.snow = (base.snow ?? 0) + base.rain;
      delete base.rain;
    }
    if (weather === "rain" || weather === "storm") return { snow: 1 };
  } else if (weather === "snow") {
    // Snow left from the winter melts
    return { cloudy: 0.7, rain: 0.3 };
  }

  if (season === "summer" && base.rain) {
    base.clear = (base.clear ?? 0) + base.rain * 0.6;
    base.rain *= 0.4;
  }

  return base;
}

/**
 * @param {string} current
 * @param {number} hour Fog only shows up early in the morning.
 * @param {() => number} [random]
 * @param {string} [season]
 * @returns {string} The weather of the next hour.
 */
export function nextWeather(
  current,
  hour,
  random = Math.random,
  season = "spring",
) {
  const options = Object.entries(transitionsFor(current, season))
    // Fog only forms between 4h and 9h
    .filter(([weather]) => weather !== "fog" || (hour >= 4 && hour < 9));
  const total = options.reduce((sum, [, chance]) => sum + chance, 0);
  let roll = random() * total;

  for (const [weather, chance] of options) {
    roll -= chance;
    if (roll < 0) return weather;
  }

  return options.at(-1)[0];
}

export class Weather {
  constructor(current = "clear") {
    this.current = current;
  }

  get prompt() {
    return WEATHERS[this.current].prompt;
  }

  /**
   * Rolls the weather of the next hour.
   * @returns {string|null} A message for the player, if it changed.
   */
  update(hour, random = Math.random, season = "spring") {
    const next = nextWeather(this.current, hour, random, season);

    if (next === this.current) {
      return null;
    }

    this.current = next;
    return CHANGE_MESSAGES[next];
  }
}
