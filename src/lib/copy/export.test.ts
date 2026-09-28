import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { bodyBudget, exportText, overBy, tags, xLength } from "./export.ts";
import { PLATFORM_LIMITS } from "./limits.ts";
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

  test("TikTok pastes the caption, not the video script", () => {
    // The script's beats are on-screen text. Pasting them as the caption is
    // what this used to do, and it read as a list of six-word fragments.
    const withCaption: PlatformCopy = {
      ...copy,
      tiktok: { ...copy.tiktok!, caption: "The navy one nobody remembers. More on kickio.com." },
    };
    const out = exportText(withCaption, "tiktok");
    assert.match(out, /^The navy one nobody remembers\. More on kickio\.com\.\n\n#nufc #retrokit$/);
    assert.ok(!out.includes("1996-97 away shirt"), "a beat leaked into the caption");
  });

  test("a draft written before captions existed still pastes something", () => {
    // Old rows have no caption. Falling back to the script is what their
    // reviewer is used to seeing, and it beats an empty clipboard.
    const out = exportText(copy, "tiktok");
    assert.match(out, /^Sold: the navy Newcastle away\./);
    assert.match(out, /#nufc #retrokit$/);
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

describe("the body's budget once the tags are allowed for", () => {
  test("the tags and their separator both come out of the limit", () => {
    // A caption written to the limit and then given its tags is a caption over
    // the limit. The block is "#nufc #retrokit" (15) plus a blank line (2).
    assert.equal(
      bodyBudget("tiktok", ["nufc", "retrokit"]),
      PLATFORM_LIMITS.tiktok.chars - 17,
    );
  });

  test("X pays one character for the separator, not two", () => {
    assert.equal(bodyBudget("x", ["nufc"]), PLATFORM_LIMITS.x.chars - 5 - 1);
  });

  test("no tags costs nothing, including no separator", () => {
    assert.equal(bodyBudget("instagram", []), PLATFORM_LIMITS.instagram.chars);
    assert.equal(bodyBudget("instagram", undefined), PLATFORM_LIMITS.instagram.chars);
  });

  test("a full TikTok set still leaves the target comfortably payable", () => {
    // Five tags is the point of the count: the budget it leaves has to be
    // bigger than what the writing is being asked for, or the two rules fight.
    const five = ["nufc", "shearer", "90sfootball", "awaykit", "footballshirt"];
    assert.ok(bodyBudget("tiktok", five) > PLATFORM_LIMITS.tiktok.target);
  });
});

describe("over the ceiling", () => {
  test("a post that fits reports nothing over", () => {
    assert.equal(overBy(copy, "tiktok"), 0);
    assert.equal(overBy(copy, "instagram"), 0);
    assert.equal(overBy(copy, "x"), 0);
  });

  test("a caption that overruns reports by how much, counting its tags", () => {
    const fat: PlatformCopy = {
      tiktok: {
        caption: "a".repeat(PLATFORM_LIMITS.tiktok.chars),
        hook: "",
        beats: [],
        cta: "",
        hashtags: ["nufc"],
      },
    };
    // The caption alone is exactly at the ceiling, so everything the tags add
    // is overrun: "#nufc" (5) plus the blank line (2).
    assert.equal(overBy(fat, "tiktok"), 7);
  });
});
