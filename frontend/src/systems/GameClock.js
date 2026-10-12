import { MINUTES_PER_DAY, formatTime } from "./time";

/**
 * Local copy of the server clock (synced by the `clock` message), advanced
 * with the real time so the lighting changes smoothly.
 */
class GameClock {
  constructor() {
    this.baseMinutes = 8 * 60;
    this.msPerGameMinute = 1000;
    this.syncedAt = performance.now();
    this.paused = false;
  }

  sync({ totalMinutes, msPerGameMinute, paused = false }) {
    this.baseMinutes = totalMinutes;
    this.msPerGameMinute = msPerGameMinute;
    this.syncedAt = performance.now();
    this.paused = paused;
  }

  /** Stops the local clock right away (the server confirms with `sync`). */
  pause() {
    if (!this.paused) {
      this.baseMinutes = this.totalMinutes;
      this.paused = true;
    }
  }

  resume() {
    if (this.paused) {
      this.syncedAt = performance.now();
      this.paused = false;
    }
  }

  get totalMinutes() {
    if (this.paused) {
      return this.baseMinutes;
    }

    return (
      this.baseMinutes +
      (performance.now() - this.syncedAt) / this.msPerGameMinute
    );
  }

  get minuteOfDay() {
    return this.totalMinutes % MINUTES_PER_DAY;
  }

  get hour() {
    return Math.floor(this.minuteOfDay / 60);
  }

  get day() {
    return Math.floor(this.totalMinutes / MINUTES_PER_DAY) + 1;
  }

  format() {
    return `Dia ${this.day} — ${formatTime(this.minuteOfDay)}`;
  }
}

export const gameClock = new GameClock();
