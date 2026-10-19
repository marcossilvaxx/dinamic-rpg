// Sounds of the game, synthesized with the Web Audio API (no audio files):
// ambience (birds, crickets, rain, thunder), footsteps, the "voice" of the
// characters (short blips, like Animal Crossing) and notification chimes.
//
// Browsers only allow audio after a user gesture, so nothing plays until
// `unlock()` is called from a key press or click. M mutes everything.

const STORAGE_KEY = "dinamic-rpg:muted";
const MASTER_VOLUME = 0.5;
const FOOTSTEP_INTERVAL_MS = 260;

const randomBetween = (min, max) => min + Math.random() * (max - min);

// Footsteps on each ground: filtered noise (and a knock on wood and stone)
const FOOTSTEPS = {
  grass: { duration: 0.06, volume: 0.05, frequency: [500, 800] },
  sand: {
    duration: 0.08,
    volume: 0.035,
    frequency: [1500, 2200],
    filter: "bandpass",
  },
  dirt: { duration: 0.07, volume: 0.05, frequency: [700, 1000] },
  snow: {
    duration: 0.12,
    volume: 0.04,
    frequency: [2500, 3500],
    filter: "highpass",
  },
  stone: {
    duration: 0.03,
    volume: 0.05,
    frequency: [2000, 3000],
    filter: "highpass",
    knock: [500, 700],
  },
  wood: {
    duration: 0.04,
    volume: 0.05,
    frequency: [900, 1200],
    knock: [170, 230],
  },
  cave: {
    duration: 0.04,
    volume: 0.05,
    frequency: [1600, 2400],
    filter: "highpass",
    knock: [300, 420],
    echo: true,
  },
};

const readMuted = () => {
  try {
    return localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
};

class Sound {
  constructor() {
    this.context = null;
    this.master = null;
    this.noiseBuffer = null;
    this.rainGain = null;
    this.muted = readMuted();
    this.lastFootstep = 0;
    this.timeToBird = 2000;
    this.timeToCricket = 1000;
    this.timeToWave = 1500;
    this.timeToDrip = 2000;
    this.timeToOwl = 8000;
    // Ground under the player (see audio/surroundings.js)
    this.ground = "grass";
  }

  get isReady() {
    return Boolean(this.context) && !this.muted;
  }

  /** Creates the audio context (must be called from a user gesture). */
  unlock() {
    if (this.context) {
      if (this.context.state === "suspended") this.context.resume();
      return;
    }

    const AudioContext =
      globalThis.AudioContext ?? globalThis.webkitAudioContext;

    if (!AudioContext) {
      return;
    }

    this.context = new AudioContext();
    this.master = this.context.createGain();
    this.master.gain.value = this.muted ? 0 : MASTER_VOLUME;
    this.master.connect(this.context.destination);

    // Two seconds of white noise, reused by rain, steps and thunder
    const length = this.context.sampleRate * 2;
    this.noiseBuffer = this.context.createBuffer(
      1,
      length,
      this.context.sampleRate,
    );
    const data = this.noiseBuffer.getChannelData(0);
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;

    this.startRain();
  }

  /** Silences everything while the game is paused. */
  setPaused(paused) {
    if (!this.context) return;

    if (paused) this.context.suspend();
    else this.context.resume();
  }

  /** @returns {boolean} Whether the sound is muted now. */
  toggleMute() {
    this.muted = !this.muted;

    try {
      localStorage.setItem(STORAGE_KEY, String(this.muted));
    } catch {
      // Only this session remembers it
    }

    if (this.master) {
      this.master.gain.setTargetAtTime(
        this.muted ? 0 : MASTER_VOLUME,
        this.context.currentTime,
        0.05,
      );
    }

    return this.muted;
  }

  tone({
    frequency,
    duration = 0.1,
    type = "sine",
    volume = 0.1,
    slideTo = null,
    delay = 0,
  }) {
    if (!this.isReady) return;

    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (slideTo) {
      oscillator.frequency.exponentialRampToValueAtTime(
        slideTo,
        start + duration,
      );
    }

    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    oscillator.connect(gain).connect(this.master);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.05);
  }

  noise({
    duration = 0.1,
    volume = 0.1,
    frequency = 1000,
    filter = "lowpass",
    delay = 0,
  }) {
    if (!this.isReady) return;

    const start = this.context.currentTime + delay;
    const source = this.context.createBufferSource();
    const biquad = this.context.createBiquadFilter();
    const gain = this.context.createGain();

    source.buffer = this.noiseBuffer;
    biquad.type = filter;
    biquad.frequency.value = frequency;
    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);

    source.connect(biquad).connect(gain).connect(this.master);
    source.start(start, Math.random());
    source.stop(start + duration + 0.05);
  }

  startRain() {
    const source = this.context.createBufferSource();
    const biquad = this.context.createBiquadFilter();
    this.rainGain = this.context.createGain();

    source.buffer = this.noiseBuffer;
    source.loop = true;
    biquad.type = "bandpass";
    biquad.frequency.value = 1400;
    biquad.Q.value = 0.6;
    this.rainGain.gain.value = 0;

    source.connect(biquad).connect(this.rainGain).connect(this.master);
    source.start();
  }

  /** A step on the ground the player is on (`this.ground`). */
  footstep() {
    const now = performance.now();

    if (now - this.lastFootstep < FOOTSTEP_INTERVAL_MS) return;

    this.lastFootstep = now;
    const step = FOOTSTEPS[this.ground] ?? FOOTSTEPS.grass;
    this.noise({
      duration: step.duration,
      volume: step.volume,
      frequency: randomBetween(...step.frequency),
      filter: step.filter ?? "lowpass",
    });
    if (step.knock) {
      this.tone({
        frequency: randomBetween(...step.knock),
        duration: 0.05,
        type: "triangle",
        volume: 0.025,
      });
    }
    if (step.echo) {
      this.noise({
        duration: step.duration,
        volume: step.volume * 0.35,
        frequency: randomBetween(...step.frequency),
        filter: step.filter ?? "lowpass",
        delay: 0.11,
      });
    }
  }

  /**
   * The "voice" of a character saying `text`: one blip per syllable-ish,
   * with a pitch of its own (`seed`).
   * @param {number} volume 0..1 (lower when far from the player).
   */
  speak(seed, text, volume = 1) {
    if (!this.isReady || volume <= 0.05 || !text) return;

    const words = text.trim().split(/\s+/).length;
    const blips = Math.min(words * 2, 14);
    const base = 220 + ((seed * 53) % 260);

    for (let i = 0; i < blips; i++) {
      this.tone({
        frequency: base * randomBetween(0.9, 1.25),
        duration: 0.05,
        type: "square",
        volume: 0.03 * volume,
        delay: i * 0.07,
      });
    }
  }

  /** Short chime for a notification (`kind` as in hud/Notifications). */
  chime(kind) {
    const melodies = {
      good: [660, 880],
      quest: [523, 659, 784],
      item: [784, 1047],
      bad: [440, 330],
      mystery: [392, 466, 587],
      festival: [523, 784, 659, 1047],
    };
    const notes = melodies[kind];

    notes?.forEach((frequency, i) =>
      this.tone({
        frequency,
        duration: 0.18,
        type: "triangle",
        volume: 0.06,
        delay: i * 0.1,
      }),
    );
  }

  /** Sounds of the map: animals and things the player uses. */
  cluck() {
    [0, 0.12, 0.2].forEach((delay) =>
      this.tone({
        frequency: randomBetween(700, 900),
        slideTo: 500,
        duration: 0.07,
        type: "square",
        volume: 0.025,
        delay,
      }),
    );
  }

  meow() {
    this.tone({
      frequency: 600,
      slideTo: 900,
      duration: 0.18,
      type: "triangle",
      volume: 0.05,
    });
    this.tone({
      frequency: 900,
      slideTo: 500,
      duration: 0.25,
      type: "triangle",
      volume: 0.05,
      delay: 0.17,
    });
  }

  flap() {
    for (let i = 0; i < 5; i++) {
      this.noise({
        duration: 0.05,
        volume: 0.05,
        frequency: 1200,
        filter: "bandpass",
        delay: i * 0.07,
      });
    }
  }

  splash() {
    this.noise({ duration: 0.3, volume: 0.08, frequency: 1500 });
  }

  knock() {
    [0, 0.18, 0.36].forEach((delay) =>
      this.noise({ duration: 0.06, volume: 0.25, frequency: 300, delay }),
    );
  }

  chop() {
    this.noise({
      duration: 0.08,
      volume: 0.25,
      frequency: 700,
      filter: "bandpass",
    });
    this.tone({ frequency: 180, duration: 0.08, type: "square", volume: 0.04 });
  }

  door() {
    this.noise({ duration: 0.12, volume: 0.15, frequency: 400 });
    this.tone({
      frequency: 220,
      slideTo: 140,
      duration: 0.25,
      type: "triangle",
      volume: 0.04,
      delay: 0.05,
    });
  }

  creak() {
    this.tone({
      frequency: 160,
      slideTo: 260,
      duration: 0.35,
      type: "sawtooth",
      volume: 0.03,
    });
  }

  water() {
    for (let i = 0; i < 4; i++) {
      this.tone({
        frequency: randomBetween(500, 1100),
        slideTo: randomBetween(900, 1500),
        duration: 0.06,
        volume: 0.04,
        delay: i * 0.08,
      });
    }
  }

  /** Sounds of the fights. */
  swing() {
    this.noise({
      duration: 0.09,
      volume: 0.08,
      frequency: 2500,
      filter: "highpass",
    });
  }

  hit() {
    this.noise({ duration: 0.12, volume: 0.25, frequency: 600 });
    this.tone({
      frequency: 140,
      slideTo: 70,
      duration: 0.15,
      type: "square",
      volume: 0.06,
    });
  }

  dodge() {
    this.noise({
      duration: 0.15,
      volume: 0.05,
      frequency: 1800,
      filter: "bandpass",
    });
  }

  knockOut() {
    this.tone({
      frequency: 300,
      slideTo: 60,
      duration: 0.6,
      type: "sawtooth",
      volume: 0.07,
    });
  }

  thunder(delay = 0) {
    this.noise({ duration: 2.2, volume: 0.6, frequency: 180, delay });
    this.noise({ duration: 0.4, volume: 0.3, frequency: 900, delay });
  }

  /**
   * Ambience of the place: birds during the day (more in the forest),
   * crickets and owls at night, waves near the sea, drops of water in the
   * mine and the rain (muffled indoors, none in the mine).
   * @param {number} delta ms since the last frame.
   * @param {object} state
   * @param {number} state.hour
   * @param {string} state.weather
   * @param {string} [state.place] village, interior, forest, mine or town.
   * @param {boolean} [state.nearSea]
   */
  updateAmbience(delta, { hour, weather, place = "village", nearSea = false }) {
    if (!this.context) return;

    const raining = weather === "rain" || weather === "storm";
    const outside = place !== "interior" && place !== "mine";
    const rain = weather === "storm" ? 0.35 : raining ? 0.2 : 0;
    this.rainGain.gain.setTargetAtTime(
      place === "mine" ? 0 : place === "interior" ? rain * 0.35 : rain,
      this.context.currentTime,
      1.5,
    );

    const isNight = hour >= 20 || hour < 5;
    this.timeToBird -= delta;
    this.timeToCricket -= delta;
    this.timeToWave -= delta;
    this.timeToDrip -= delta;
    this.timeToOwl -= delta;

    if (outside && !isNight && !raining && this.timeToBird <= 0) {
      this.timeToBird =
        place === "forest"
          ? randomBetween(700, 2500)
          : randomBetween(1500, 6000);
      const frequency = randomBetween(2200, 3200);
      const notes = Math.floor(randomBetween(1, 4));
      for (let i = 0; i < notes; i++) {
        this.tone({
          frequency,
          slideTo: frequency * randomBetween(1.1, 1.4),
          duration: 0.09,
          volume: 0.015,
          delay: i * 0.13,
        });
      }
    }

    if (
      place !== "mine" &&
      isNight &&
      weather !== "storm" &&
      this.timeToCricket <= 0
    ) {
      this.timeToCricket = randomBetween(500, 1500);
      for (let i = 0; i < 3; i++) {
        this.tone({
          frequency: 4300,
          duration: 0.03,
          volume: place === "interior" ? 0.003 : 0.008,
          delay: i * 0.045,
        });
      }
    }

    // An owl in the forest at night
    if (place === "forest" && isNight && this.timeToOwl <= 0) {
      this.timeToOwl = randomBetween(9000, 20000);
      for (const [i, frequency] of [420, 380, 380].entries()) {
        this.tone({
          frequency,
          slideTo: frequency * 0.85,
          duration: i === 0 ? 0.25 : 0.35,
          volume: 0.03,
          delay: i * 0.45,
        });
      }
    }

    // Waves breaking on the coast
    if (outside && nearSea && this.timeToWave <= 0) {
      this.timeToWave = randomBetween(2800, 5500);
      this.noise({
        duration: 1.8,
        volume: weather === "storm" ? 0.09 : 0.045,
        frequency: 450,
      });
      this.noise({
        duration: 1.1,
        volume: 0.02,
        frequency: 2400,
        filter: "bandpass",
        delay: 0.35,
      });
    }

    // Drops of water in the cave, with an echo
    if (place === "mine" && this.timeToDrip <= 0) {
      this.timeToDrip = randomBetween(1200, 4200);
      const frequency = randomBetween(1400, 2200);
      for (const [i, volume] of [0.035, 0.012].entries()) {
        this.tone({
          frequency,
          slideTo: frequency * 0.55,
          duration: 0.08,
          volume,
          delay: i * 0.18,
        });
      }
    }
  }
}

export const sound = new Sound();
