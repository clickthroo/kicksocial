import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { mediaIdFrom, postIdFrom, postUrl, tooLongForX, isConfigured } from "./x.ts";
import { PLATFORM_LIMITS } from "../copy/limits.ts";

describe("reading the media id back", () => {
  // This is the one shape in the integration that could not be confirmed
  // against the live API, so it accepts every documented spelling rather than
  // betting on one and finding out in production.
  test("the v2 shape, wrapped in data", () => {
    assert.equal(mediaIdFrom({ data: { id: "1874" } }), "1874");
  });

  test("the older media_id_string, unwrapped", () => {
    assert.equal(mediaIdFrom({ media_id_string: "1874" }), "1874");
  });

  test("media_id_string inside data", () => {
    assert.equal(mediaIdFrom({ data: { media_id_string: "1874" } }), "1874");
  });

  test("a media_key when that is all there is", () => {
    assert.equal(mediaIdFrom({ data: { media_key: "3_1874" } }), "3_1874");
  });

  test("the string form wins over the numeric one", () => {
    // A JavaScript number cannot hold a snowflake id precisely, so the numeric
    // field is a last resort and must never be preferred.
    const body = { data: { media_id_string: "1874919191919191919", media_id: 1874919191919191919 } };
    assert.equal(mediaIdFrom(body), "1874919191919191919");
  });

  test("a numeric media_id is still better than failing", () => {
    assert.equal(mediaIdFrom({ media_id: 1874 }), "1874");
  });

  test("an unrecognised body yields null rather than a guess", () => {
    // The caller turns this into an error carrying the real response, which is
    // the only way anyone finds out which field X actually used.
    assert.equal(mediaIdFrom({ data: {} }), null);
    assert.equal(mediaIdFrom({ errors: [{ message: "nope" }] }), null);
    assert.equal(mediaIdFrom(null), null);
    assert.equal(mediaIdFrom("1874"), null);
  });

  test("an empty string is not an id", () => {
    assert.equal(mediaIdFrom({ data: { id: "" } }), null);
  });
});

describe("reading the post id back", () => {
  test("the v2 shape", () => {
    assert.equal(postIdFrom({ data: { id: "99", text: "hello" } }), "99");
  });

  test("the older id_str", () => {
    assert.equal(postIdFrom({ id_str: "99" }), "99");
  });

  test("an error body is not an id", () => {
    assert.equal(postIdFrom({ title: "Unauthorized", status: 401 }), null);
  });
});

describe("the link to the post", () => {
  test("uses the handle when it is set", () => {
    assert.equal(postUrl("99", "kickiodotcom"), "https://x.com/kickiodotcom/status/99");
  });

  test("falls back to /i/ rather than producing a broken link", () => {
    // X redirects /i/status/<id> to the real post, so an unset handle costs a
    // tidy URL and nothing else.
    assert.equal(postUrl("99", null), "https://x.com/i/status/99");
  });
});

describe("refusing before spending", () => {
  test("a normal post is fine", () => {
    assert.equal(tooLongForX("Sold for £192. More on kickio.com. #nufc"), false);
  });

  test("exactly the limit is still fine", () => {
    assert.equal(tooLongForX("a".repeat(PLATFORM_LIMITS.x.chars)), false);
  });

  test("one over is refused", () => {
    // X charges for the attempt, not the success, so this is caught here
    // rather than paid for and rejected.
    assert.equal(tooLongForX("a".repeat(PLATFORM_LIMITS.x.chars + 1)), true);
  });
});

describe("inert without credentials", () => {
  test("no environment, no posting", () => {
    // The whole integration is gated on this: the button does not render and
    // the action refuses. A deployment that has not been given keys must have
    // no path to an API call at all.
    const saved = {
      id: process.env.X_CLIENT_ID,
      secret: process.env.X_CLIENT_SECRET,
      token: process.env.X_REFRESH_TOKEN,
    };
    delete process.env.X_CLIENT_ID;
    delete process.env.X_CLIENT_SECRET;
    delete process.env.X_REFRESH_TOKEN;
    try {
      assert.equal(isConfigured(), false);

      // Two out of three is still not configured: a half-set environment is a
      // misconfiguration, and guessing at it would fail at the API instead.
      process.env.X_CLIENT_ID = "id";
      process.env.X_CLIENT_SECRET = "secret";
      assert.equal(isConfigured(), false);

      process.env.X_REFRESH_TOKEN = "token";
      assert.equal(isConfigured(), true);
    } finally {
      if (saved.id === undefined) delete process.env.X_CLIENT_ID;
      else process.env.X_CLIENT_ID = saved.id;
      if (saved.secret === undefined) delete process.env.X_CLIENT_SECRET;
      else process.env.X_CLIENT_SECRET = saved.secret;
      if (saved.token === undefined) delete process.env.X_REFRESH_TOKEN;
      else process.env.X_REFRESH_TOKEN = saved.token;
    }
  });
});
