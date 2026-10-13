// Time of the game world. By default 1 real second = 1 game minute, so a day
// lasts 24 real minutes. The clock pauses while the player is disconnected.

export const MINUTES_PER_DAY = 24 * 60;

export const periodOf = (hour) => {
  if (hour >= 22 || hour < 5) return "night";
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
};

const pad = (value) => String(value).padStart(2, "0");

const formatMinuteOfDay = (minutes) =>
  `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

export class GameClock {
  constructor({
    startMinutes = 8 * 60,
    msPerGameMinute = 1000,
    now = () => Date.now(),
  } = {}) {
    this.msPerGameMinute = msPerGameMinute;
    this.now = now;
    this.baseMinutes = startMinutes;
    this.startedAt = now();
    this.pausedAt = null;
  }

  get totalMinutes() {
    const reference = this.pausedAt ?? this.now();
    return (
      this.baseMinutes + (reference - this.startedAt) / this.msPerGameMinute
    );
  }

  get day() {
    return Math.floor(this.totalMinutes / MINUTES_PER_DAY) + 1;
  }

  get minuteOfDay() {
    return Math.floor(this.totalMinutes) % MINUTES_PER_DAY;
  }

  get hour() {
    return Math.floor(this.minuteOfDay / 60);
  }

  get period() {
    return periodOf(this.hour);
  }

  format() {
    return formatMinuteOfDay(this.minuteOfDay);
  }

  /** "Dia 2, 18:00" for a moment of the game (in total minutes). */
  static formatMoment(totalMinutes) {
    const day = Math.floor(totalMinutes / MINUTES_PER_DAY) + 1;
    return `Dia ${day}, ${formatMinuteOfDay(Math.floor(totalMinutes) % MINUTES_PER_DAY)}`;
  }

  /** Time passes at once (the player slept or rested). */
  advance(minutes) {
    this.baseMinutes += Math.max(0, minutes);
  }

  pause() {
    if (this.pausedAt === null) {
      this.pausedAt = this.now();
    }
  }

  resume() {
    if (this.pausedAt !== null) {
      this.startedAt += this.now() - this.pausedAt;
      this.pausedAt = null;
    }
  }

  get isPaused() {
    return this.pausedAt !== null;
  }

  toJSON() {
    return {
      totalMinutes: this.totalMinutes,
      msPerGameMinute: this.msPerGameMinute,
      paused: this.isPaused,
    };
  }
}
