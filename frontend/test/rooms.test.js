import assert from "node:assert/strict";
import { test } from "node:test";
import { seeded } from "../src/world/procedural/pixel.js";
import {
  FURNITURE,
  ROOM_PRESETS,
  arrangeRoom,
} from "../src/world/procedural/rooms.js";

test("furniture leaves a way (2 tiles wide) from the door to every piece", () => {
  for (const [trade, furniture] of Object.entries(ROOM_PRESETS)) {
    for (let seed = 1; seed <= 40; seed++) {
      const columns = 10 + (seed % 3);
      const rows = 7 + (seed % 2);
      const { placed, blocked, door, reachable } = arrangeRoom(
        columns,
        rows,
        furniture,
        seeded(seed),
      );

      assert.ok(reachable.has(`${door},${rows - 1}`), `${trade} door`);
      assert.equal(blocked[rows - 1][door], false);
      assert.equal(blocked[rows - 2][door], false, `${trade} entrance`);

      for (const { name, column, row } of placed) {
        if (FURNITURE[name].walkable) continue;
        const [w, h] = FURNITURE[name].size;
        let touches = false;
        for (let c = column - 2; c <= column + w && !touches; c++) {
          for (let r = row - 1; r <= row + h && !touches; r++) {
            const inside =
              c + 1 >= column && c < column + w && r >= row && r < row + h;
            touches = !inside && reachable.has(`${c},${r}`);
          }
        }
        assert.ok(touches, `${trade} seed ${seed}: ${name} can't be reached`);
      }

      // Most of the furniture fits
      assert.ok(
        placed.length >= furniture.length * 0.6,
        `${trade} seed ${seed}: ${placed.length}`,
      );
    }
  }
});

test("unknown furniture (from the model) is ignored", () => {
  const { placed } = arrangeRoom(10, 7, ["bed", "throne", "table"], seeded(3));
  assert.deepEqual(placed.map(({ name }) => name).sort(), ["bed", "table"]);
});
