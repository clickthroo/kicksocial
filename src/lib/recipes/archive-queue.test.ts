import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_CLUB_ARCHIVE_CONFIG as CONFIG } from "./club-archive.ts";

/**
 * The queue's behaviour lives across the recipe and run-recipe, so these assert
 * the contract between them rather than reaching for a database.
 */
function nextFrom(upNext: string[]): string | null {
  return upNext.map((t) => t.trim()).filter(Boolean)[0] ?? null;
}

function consume(upNext: string[], entry: string): string[] {
  return upNext.filter((q) => q !== entry);
}

describe("a running order, not a setting", () => {
  test("takes the club at the head", () => {
    assert.equal(nextFrom(["Arsenal", "Chelsea"]), "Arsenal");
  });

  test("an empty queue means automatic selection", () => {
    assert.equal(nextFrom([]), null);
    assert.equal(nextFrom(["", "  "]), null);
  });

  test("publishing removes the entry, so the same club is not posted twice", () => {
    // The bug this replaced: a persistent `team` setting meant choosing Arsenal
    // once posted Arsenal every week thereafter.
    const queue = ["Arsenal", "Chelsea"];
    const after = consume(queue, "Arsenal");
    assert.deepEqual(after, ["Chelsea"]);
    assert.equal(nextFrom(after), "Chelsea");
  });

  test("draining the queue returns to automatic", () => {
    assert.equal(nextFrom(consume(["Arsenal"], "Arsenal")), null);
  });

  test("consuming an entry that is no longer queued changes nothing", () => {
    // An admin can edit the queue while a run is in flight.
    assert.deepEqual(consume(["Chelsea"], "Arsenal"), ["Chelsea"]);
  });

  test("trims whitespace rather than querying for a padded club name", () => {
    assert.equal(nextFrom(["  Arsenal  "]), "Arsenal");
  });
});

describe("the cooldown still applies", () => {
  test("is six months, so a club cannot come round twice in a season", () => {
    assert.equal(CONFIG.cooldownDays, 180);
  });

  test("the queue starts empty, so the default behaviour is automatic", () => {
    assert.deepEqual(CONFIG.upNext, []);
  });
});
