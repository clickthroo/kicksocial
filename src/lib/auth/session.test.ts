import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  signSession,
  readSession,
  shouldRenew,
  sessionSecret,
  SESSION_LIFE_MS,
} from "./session.ts";

const SECRET = "a".repeat(48);
const OTHER = "b".repeat(48);
const NOW = Date.parse("2026-09-27T09:00:00Z");

describe("the session cookie", () => {
  test("round-trips the email", async () => {
    const token = await signSession("david@kickio.com", SECRET, NOW);
    const session = await readSession(token, SECRET, NOW);
    assert.equal(session?.email, "david@kickio.com");
    assert.equal(session?.expiresAt, NOW + SESSION_LIFE_MS);
  });

  test("a cookie signed with another secret is refused", async () => {
    const token = await signSession("david@kickio.com", OTHER, NOW);
    assert.equal(await readSession(token, SECRET, NOW), null);
  });

  test("editing the payload invalidates the signature", async () => {
    // The whole point: the email is readable, and it is not changeable.
    const token = await signSession("david@kickio.com", SECRET, NOW);
    const [version, payload, signature] = token.split(".");
    const forged = Buffer.from(
      JSON.stringify({ e: "someone@else.com", x: NOW + SESSION_LIFE_MS }),
    )
      .toString("base64url");
    assert.notEqual(forged, payload);
    assert.equal(await readSession(`${version}.${forged}.${signature}`, SECRET, NOW), null);
  });

  test("an expired cookie is refused even though it is properly signed", async () => {
    const token = await signSession("david@kickio.com", SECRET, NOW);
    assert.equal(await readSession(token, SECRET, NOW + SESSION_LIFE_MS + 1), null);
  });

  test("junk is refused rather than thrown at", async () => {
    for (const bad of [undefined, null, "", "nonsense", "v1.only-two", "v2.a.b", "v1..", "v1.!!!.!!!"]) {
      assert.equal(await readSession(bad, SECRET, NOW), null, String(bad));
    }
  });

  test("a session is renewed in its second half, not its first", () => {
    const fresh = { email: "d@k.com", expiresAt: NOW + SESSION_LIFE_MS };
    assert.equal(shouldRenew(fresh, NOW), false);
    assert.equal(shouldRenew(fresh, NOW + SESSION_LIFE_MS / 2 + 1), true);
  });
});

describe("the signing secret", () => {
  const swap = (value: string | undefined) => {
    const before = process.env.SESSION_SECRET;
    if (value === undefined) delete process.env.SESSION_SECRET;
    else process.env.SESSION_SECRET = value;
    return () => {
      if (before === undefined) delete process.env.SESSION_SECRET;
      else process.env.SESSION_SECRET = before;
    };
  };

  test("a missing secret throws rather than defaulting to a known one", () => {
    const restore = swap(undefined);
    try {
      assert.throws(() => sessionSecret(), /SESSION_SECRET must be set/);
    } finally {
      restore();
    }
  });

  test("a short secret is refused", () => {
    const restore = swap("too-short");
    try {
      assert.throws(() => sessionSecret(), /at least 32/);
    } finally {
      restore();
    }
  });
});
