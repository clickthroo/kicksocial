import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { MAX_EDGE, MAX_UPLOAD_BYTES, PHOTO_BUCKET, photoPath } from "./photo-store.ts";

describe("where an uploaded photograph is filed", () => {
  const when = new Date("2026-03-09T12:00:00Z");

  test("the recipe, the month, then something random", () => {
    const path = photoPath("kickio-classics", when, "11111111-2222-3333-4444-555555555555");
    assert.equal(path, "kickio-classics/2026-03/11111111-2222-3333-4444-555555555555.jpg");
  });

  test("the name is random, because the bucket is public", () => {
    // A public object named after the draft is a public object anyone can
    // find. Two uploads a millisecond apart must not share a path either.
    assert.notEqual(photoPath("a"), photoPath("a"));
  });

  test("a prefix cannot escape its folder", () => {
    // The prefix reaches here from a form field. A "../" in it would write
    // somewhere else in the bucket.
    const path = photoPath("../../etc/passwd", when, "id");
    assert.ok(!path.includes(".."), path);
    assert.ok(!path.includes("//"), path);
    assert.equal(path.split("/").length, 3);
  });

  test("an empty prefix still produces a usable path", () => {
    assert.ok(photoPath("", when, "id").startsWith("photo/"));
    assert.ok(photoPath("!!!", when, "id").startsWith("photo/"));
  });

  test("it always ends .jpg, because everything is re-encoded", () => {
    // The whole pipeline reads the format off the extension: `looksLikeImage`
    // decides whether the picker accepts it and `isRenderable` decides whether
    // the card can draw it. A stored object with no extension would pass
    // neither, however good the image inside it was.
    assert.ok(photoPath("kickio-classics", when, "id").endsWith(".jpg"));
  });

  test("the month is UTC, so a late upload does not file itself in two places", () => {
    const lateNight = new Date("2026-03-31T23:30:00Z");
    assert.ok(photoPath("x", lateNight, "id").includes("/2026-03/"));
  });
});

describe("the limits on an upload", () => {
  test("the bucket is the engine's own, and named for what it holds", () => {
    // Said in a test because the one thing that must never happen here is this
    // landing in Kickio's project, which is read-only from this codebase.
    assert.equal(PHOTO_BUCKET, "post-photos");
  });

  test("the stored edge is big enough for any card and no bigger", () => {
    assert.ok(MAX_EDGE >= 1350);
    assert.ok(MAX_EDGE <= 4000);
  });

  test("the upload ceiling clears a phone photograph comfortably", () => {
    // A 24-megapixel HEIC is around 5MB and the JPEG the browser sends is
    // smaller again, so this only ever catches something that has gone wrong.
    assert.ok(MAX_UPLOAD_BYTES >= 10 * 1024 * 1024);
  });
});
