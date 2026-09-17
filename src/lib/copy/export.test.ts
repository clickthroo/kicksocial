import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { exportText, tags, xLength } from "./export.ts";
import { ctaForDay, CTA_POOL, SOLD_CTA_POOL } from "./brand-voice.ts";
import type { PlatformCopy } from "../engine/types.ts";

const copy: PlatformCopy = {
  x: { text: "Sold for £192. More on kickio.com.", hashtags: ["nufc", "footballshirt"] },
  instagram: { caption: "Navy, not the stripes.\n\nMore on kickio.com.", hashtags: ["nufc", "90sfootball"] },
  tiktok: {
    hook: "Sold: the navy Newcastle away.",
    beats: ["1996-97 away shirt", "Shearer 9, printed"],
    cta: "More on kickio.com.",
    hashtags: ["nufc", "retrokit"],
  },
};

describe("hashtags", () => {
  test("adds the # the model is told to leave off", () => {
    assert.equal(tags(["nufc", "90sfootball"]), "#nufc #90sfootball");
  });

  test("does not double up when one slips through with a #", () => {
    assert.equal(tags(["#nufc"]), "#nufc");
  });

  test("handles a platform that has none", () => {
    assert.equal(tags(undefined), "");
  });
});

describe("what gets pasted into each network", () => {
  test("X carries its hashtags inline, because they count against the limit", () => {
    assert.equal(
      exportText(copy, "x"),
      "Sold for £192. More on kickio.com. #nufc #footballshirt",
    );
  });

  test("the X counter includes the hashtags", () => {
    // Counting only the body would show a post as comfortably inside 280 when
    // the thing actually posted is over it.
    assert.equal(xLength(copy), exportText(copy, "x").length);
    assert.ok(xLength(copy) > (copy.x?.text.length ?? 0));
  });

  test("Instagram puts them in their own block after the caption", () => {
    assert.match(exportText(copy, "instagram"), /kickio\.com\.\n\n#nufc #90sfootball$/);
  });

  test("TikTok appends them after the CTA", () => {
    assert.match(exportText(copy, "tiktok"), /More on kickio\.com\.\n#nufc #retrokit$/);
  });

  test("a platform with no copy yields nothing rather than throwing", () => {
    assert.equal(exportText({}, "x"), "");
    assert.equal(exportText({}, "instagram"), "");
    assert.equal(exportText({}, "tiktok"), "");
  });
});

describe("CTAs", () => {
  test("every CTA names the domain, not just the brand", () => {
    // "Kickio" alone does not tell a reader where to go.
    for (const cta of [...CTA_POOL, ...SOLD_CTA_POOL]) {
      assert.match(cta, /kickio\.com/, cta);
    }
  });

  test("no sold CTA invites anyone to buy the thing that has gone", () => {
    for (const cta of SOLD_CTA_POOL) {
      assert.doesNotMatch(cta, /full listing|live now|it's on kickio/i, cta);
    }
  });

  test("rotates by day, and the two pools rotate independently", () => {
    const day = new Date("2026-09-17T12:00:00Z");
    const next = new Date("2026-09-18T12:00:00Z");
    assert.notEqual(ctaForDay(day), ctaForDay(next));
    assert.ok(SOLD_CTA_POOL.includes(ctaForDay(day, SOLD_CTA_POOL)));
  });
});
