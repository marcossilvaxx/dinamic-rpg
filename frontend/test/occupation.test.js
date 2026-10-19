import assert from "node:assert/strict";
import { test } from "node:test";
import { occupationLabel } from "../src/utils/occupation.js";

test("the title in the language of the player comes first", () => {
  assert.equal(
    occupationLabel({ occupation: "Blacksmith", title: "ferreira" }),
    "Ferreira",
  );
});

test("old games without a title get common occupations translated", () => {
  assert.equal(
    occupationLabel({ occupation: "Village guard" }),
    "Guarda da vila",
  );
  assert.equal(occupationLabel({ occupation: "Tavern keeper" }), "Taberneiro");
  assert.equal(
    occupationLabel({ occupation: "traveling spice merchant" }),
    "Mercador viajante de especiarias",
  );
  // Unknown words: the English one says more than a half translation
  assert.equal(
    occupationLabel({ occupation: "Scholar of stars" }),
    "Scholar of stars",
  );
});
