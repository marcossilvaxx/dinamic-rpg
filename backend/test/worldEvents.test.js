import assert from "node:assert/strict";
import { test } from "node:test";
import { EVENT_KINDS, pickEventSetup } from "../game/worldEvents.js";

const places = ["a", "b", "c", "d"].map((id) => ({ id }));
const villagers = ["Ana", "Bia", "Caio"].map((name) => ({ name }));

test("avoids the recent kinds, places and villagers", () => {
  const history = [
    { kind: EVENT_KINDS[0], placeId: "a", involved: ["Ana"] },
    { kind: EVENT_KINDS[1], placeId: "b", involved: ["Bia"] },
  ];

  for (let i = 0; i < 50; i++) {
    const { kind, place, involved } = pickEventSetup({
      history,
      places,
      villagers,
    });

    assert.ok(!history.some((event) => event.kind === kind));
    assert.ok(!["a", "b"].includes(place.id));
    assert.equal(involved[0].name, "Caio");
  }
});

test("a sequence of events doesn't repeat kinds in a row", () => {
  const history = [];

  for (let i = 0; i < 30; i++) {
    const { kind, place, involved } = pickEventSetup({
      history,
      places,
      villagers,
    });
    assert.ok(!history.slice(-6).some((event) => event.kind === kind));
    history.push({
      kind,
      placeId: place.id,
      involved: involved.map((v) => v.name),
    });
  }
});
