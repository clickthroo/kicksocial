import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { nextStatus, platformsOf } from "./publish.ts";
import type { Platform, PlatformCopy } from "./engine/types.ts";

const none = new Set<Platform>();
const set = (...p: Platform[]) => new Set<Platform>(p);

describe("which platforms a draft owes", () => {
  test("counts only the ones it actually carries copy for", () => {
    const copy: PlatformCopy = {
      x: { text: "hello" },
      instagram: { caption: "hi", hashtags: [] },
    };
    assert.deepEqual(platformsOf({ copy }), ["x", "instagram"]);
  });

  test("ignores a platform key present but empty", () => {
    // forPlatforms() drops variants a recipe does not publish to, which can
    // leave the key behind as undefined. Counting it would make the draft
    // impossible to complete.
    const copy = { x: { text: "hello" }, tiktok: undefined } as PlatformCopy;
    assert.deepEqual(platformsOf({ copy }), ["x"]);
  });
});

describe("status follows the log, rather than being tracked beside it", () => {
  test("stays approved until every platform is confirmed", () => {
    assert.equal(nextStatus("approved", ["x", "instagram"], set("x")), null);
  });

  test("becomes published once the last one is confirmed", () => {
    assert.equal(nextStatus("approved", ["x", "instagram"], set("x", "instagram")), "published");
  });

  test("returns to approved when a mark is undone", () => {
    assert.equal(nextStatus("published", ["x", "instagram"], set("x")), "approved");
  });

  test("never publishes a draft with no platforms", () => {
    // Completeness over an empty list is vacuously true, which would log a post
    // that was never written.
    assert.equal(nextStatus("approved", [], none), null);
  });

  test("leaves a rejected draft alone", () => {
    // A stray log row must not drag something the reviewer turned down back
    // into the flow.
    assert.equal(nextStatus("rejected", ["x"], set("x")), null);
  });

  test("leaves an unreviewed draft alone", () => {
    assert.equal(nextStatus("draft", ["x"], set("x")), null);
  });

  test("is idempotent - re-confirming changes nothing", () => {
    assert.equal(nextStatus("published", ["x"], set("x")), null);
  });
});
