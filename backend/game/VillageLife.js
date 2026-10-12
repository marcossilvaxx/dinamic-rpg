// Things that happen in the village by themselves, with the passing of time:
// world events (news), the weather, the seasons and the daily gathering
// (festival, which can be a wedding).

import { festivalPrompt, festivalSchema } from "../prompts/festival.js";
import { worldEventPrompt, worldEventSchema } from "../prompts/worldEvent.js";
import {
  FESTIVAL_ANNOUNCE_HOUR,
  FESTIVAL_END_HOUR,
  FESTIVAL_START_HOUR,
  SHELTER_PLACE,
  festivalStatus,
  pickFestivalSetup,
} from "./festivals.js";
import { SEASON_INFO, isFirstDayOfSeason, seasonOf } from "./seasons.js";
import { Weather, isShelterWeather } from "./Weather.js";
import { EVENT_MOOD, pickEventSetup } from "./worldEvents.js";

const MAX_RECENT_EVENTS = 12;
// Place used when the client sent no places
const VILLAGE = { id: "village", name: "the village", description: "" };

export class VillageLife {
  /**
   * @param {import("./GameSession.js").GameSession} session
   * @param {object} [options]
   * @param {number} [options.daysPerSeason]
   */
  constructor(session, { daysPerSeason = 2 } = {}) {
    this.session = session;
    this.daysPerSeason = daysPerSeason;
    // World events: { kind, placeId, involved: [name], fact }
    this.recentEvents = [];
    this.isGeneratingEvent = false;
    this.weather = new Weather();
    // { day, kind, title, description, fact, placeId, status, wedding? }
    this.festival = null;
    this.festivalKinds = [];
    this.festivalTitles = [];
    this.isGeneratingFestival = false;
    // Couple whose wedding is the next gathering: [a, b]
    this.wedding = null;
    this.lastSeason = null;
  }

  get season() {
    return seasonOf(this.session.clock.day, this.daysPerSeason);
  }

  get places() {
    return this.session.places.length ? this.session.places : [VILLAGE];
  }

  placeName(placeId) {
    return this.places.find((place) => place.id === placeId)?.name ?? placeId;
  }

  /** Season, weather and gathering, for the prompts. */
  describe() {
    const { festival } = this;

    return {
      season: SEASON_INFO[this.season].prompt,
      weather: this.weather.prompt,
      festival:
        festival && festival.status !== "over"
          ? `${festival.status === "active" ? "Happening now" : `Today from ${FESTIVAL_START_HOUR}:00 to ${FESTIVAL_END_HOUR}:00`} at ${this.placeName(festival.placeId)}: ${festival.fact}`
          : null,
    };
  }

  toJSON() {
    const { festival } = this;

    return {
      weather: this.weather.current,
      raid: this.session.bandits?.toJSON() ?? null,
      season: this.season,
      seasonLabel: SEASON_INFO[this.season].label,
      festival: festival && {
        day: festival.day,
        title: festival.title,
        description: festival.description,
        placeId: festival.placeId,
        placeName: this.placeName(festival.placeId),
        startHour: FESTIVAL_START_HOUR,
        endHour: FESTIVAL_END_HOUR,
        status: festival.status,
      },
    };
  }

  // ---------------------------------------------------------------------------
  // Seasons and weather

  /** Announces a new season. */
  updateSeason() {
    const { session } = this;
    const season = this.season;

    if (this.lastSeason === null) {
      this.lastSeason = season;
      return;
    }

    if (season !== this.lastSeason) {
      this.lastSeason = season;
      const { label } = SEASON_INFO[season];
      session.notify(`Começou a estação: ${label}`, "weather");
      session.addNews(`Começou a estação: ${label}`);
      session.emitWorldState();
      session.runInBackground(
        session.rememberAll(
          `[village news] A new season started: ${SEASON_INFO[season].prompt}.`,
        ),
      );
    }
  }

  /** Rolls the weather of the new game hour. */
  updateWeather(hour, random = Math.random) {
    const message = this.weather.update(hour, random, this.season);

    if (message) {
      this.session.notify(message, "weather");
      this.session.emitWorldState();
    }
  }

  // ---------------------------------------------------------------------------
  // Festival

  /** The next gathering is the wedding of `a` and `b`. */
  planWedding(a, b) {
    this.wedding = [a, b];
  }

  async updateFestival(day, hour) {
    const { session } = this;

    if (
      this.festival?.day !== day &&
      hour >= FESTIVAL_ANNOUNCE_HOUR &&
      hour < FESTIVAL_START_HOUR
    ) {
      await this.announceFestival(day);
      return;
    }

    const festival = this.festival;

    if (festival?.day !== day) {
      return;
    }

    const status = festivalStatus(hour);

    if (status === festival.status) {
      return;
    }

    festival.status = status;

    if (status === "active") {
      // Nobody gathers outside in the rain
      if (
        isShelterWeather(this.weather.current) &&
        festival.placeId !== SHELTER_PLACE &&
        session.places.some((place) => place.id === SHELTER_PLACE)
      ) {
        festival.placeId = SHELTER_PLACE;
        session.notify(
          `Por causa do tempo, ${festival.title} vai ser em: ${this.placeName(SHELTER_PLACE)}`,
          "festival",
        );
      }

      session.notify(
        `Começou: ${festival.title} (${this.placeName(festival.placeId)})`,
        "festival",
      );
    } else if (status === "over") {
      session.npcs.forEach((_, npcId) => session.changeMood(npcId, 1));
      await session.rememberAll(`[village news] Today: ${festival.fact}`);

      if (festival.wedding) {
        await session.family.marry(...festival.wedding);
      }
    }

    session.emitWorldState();
  }

  /** What today's gathering is about (a wedding, the season, or random). */
  festivalSetup(day) {
    const { session } = this;
    const setup = pickFestivalSetup({
      recentKinds: this.festivalKinds,
      places: this.places,
      villagers: session.cast,
    });

    if (this.wedding && this.wedding.every((id) => session.npcs.has(id))) {
      const [a, b] = this.wedding;
      return {
        ...setup,
        kind: `the wedding of ${session.nameOf(a)} and ${session.nameOf(b)}`,
        host:
          session.cast.find((villager) => villager.slot === a) ?? setup.host,
        wedding: this.wedding,
      };
    }

    if (isFirstDayOfSeason(day, this.daysPerSeason)) {
      return { ...setup, kind: SEASON_INFO[this.season].festival };
    }

    return setup;
  }

  async announceFestival(day) {
    const { session } = this;

    if (this.isGeneratingFestival || session.npcs.size === 0) {
      return;
    }

    this.isGeneratingFestival = true;

    try {
      const { kind, place, host, wedding = null } = this.festivalSetup(day);

      const { content } = await session.llm.complete({
        cachePrefix: session.worldContext,
        system: festivalPrompt({
          context: session.worldContext,
          kind,
          place,
          host,
          previous: this.festivalTitles,
          language: session.language,
        }),
        messages: [{ role: "user", content: "Create today's event." }],
        schema: festivalSchema,
        temperature: 1,
      });

      if (wedding) {
        this.wedding = null;
      }

      this.festivalKinds.push(kind);
      this.festivalTitles.push(content.title.trim());
      this.festival = {
        day,
        kind,
        title: content.title.trim(),
        description: content.description.trim(),
        fact: content.fact.trim(),
        placeId: place.id,
        status: "announced",
        wedding,
      };

      const announcement = `${this.festival.title}: ${this.festival.description} (hoje, ${FESTIVAL_START_HOUR}h, ${this.placeName(place.id)})`;
      session.addNews(announcement);
      session.notify(announcement, "festival");
      session.emitPlayerState();
      session.emitWorldState();
      await session.rememberAll(
        `[village news] Today at ${FESTIVAL_START_HOUR}:00, at ${place.name}: ${this.festival.fact}`,
      );
    } finally {
      this.isGeneratingFestival = false;
    }
  }

  // ---------------------------------------------------------------------------
  // World events

  async generateWorldEvent() {
    const { session } = this;

    if (this.isGeneratingEvent || !session.world || session.npcs.size === 0) {
      return null;
    }

    this.isGeneratingEvent = true;

    try {
      const { kind, place, involved } = pickEventSetup({
        history: this.recentEvents,
        places: this.places,
        villagers: session.getVillagers(null),
      });

      const { content } = await session.llm.complete({
        cachePrefix: session.worldContext,
        system: worldEventPrompt({
          context: session.worldContext,
          kind,
          place,
          involved,
          recentEvents: this.recentEvents.map((event) => event.fact),
          weather: this.weather.prompt,
          season: SEASON_INFO[this.season].prompt,
          sellers: [...session.npcs.values()]
            .filter((npc) => npc.data.wares?.length)
            .map((npc) => npc.data.name),
          language: session.language,
        }),
        messages: [{ role: "user", content: "Create the event." }],
        schema: worldEventSchema,
        temperature: 1,
      });

      this.recentEvents = [
        ...this.recentEvents,
        {
          kind,
          placeId: place.id,
          involved: involved.map((villager) => villager.name),
          fact: content.fact,
        },
      ].slice(-MAX_RECENT_EVENTS);

      session.addNews(content.headline);
      involved.forEach(({ name }) => {
        const villager = session.cast.find((v) => v.name === name);
        if (villager) session.changeMood(villager.slot, EVENT_MOOD[kind] ?? 0);
      });

      if (content.market && content.market.change !== "none") {
        session.commerce.applyMarketEvent(content.market);
      }

      await session.rememberAll(`[village news] ${content.fact}`);

      console.log(`[session ${session.id}] World event: ${content.fact}`);

      return content;
    } finally {
      this.isGeneratingEvent = false;
    }
  }

  toState() {
    return {
      recentEvents: this.recentEvents,
      weather: this.weather.current,
      festival: this.festival,
      festivalKinds: this.festivalKinds,
      festivalTitles: this.festivalTitles,
      wedding: this.wedding,
      lastSeason: this.lastSeason,
    };
  }

  restoreState(state) {
    this.recentEvents = state.recentEvents;
    this.weather.current = state.weather;
    this.festival = state.festival;
    this.festivalKinds = state.festivalKinds;
    this.festivalTitles = state.festivalTitles;
    this.wedding = state.wedding;
    this.lastSeason = state.lastSeason;
  }
}
