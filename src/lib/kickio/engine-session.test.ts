import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readClaims, assertUsableRole, engineCredentials, resetEngineSession } from "./engine-session.ts";

const ALLOWED = new Set(["anon", "kickio_content_reader"]);

/** Build an unsigned JWT-shaped string. Only the payload is read here. */
function tokenWith(payload: Record<string, unknown>): string {
  const b = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b({ alg: "ES256", typ: "JWT" })}.${b(payload)}.signature-not-checked-here`;
}

describe("reading what Kickio actually issued", () => {
  test("pulls the claims out of a real-shaped token", () => {
    const claims = readClaims(tokenWith({ role: "kickio_content_reader", sub: "abc" }));
    assert.equal(claims?.role, "kickio_content_reader");
    assert.equal(claims?.sub, "abc");
  });

  test("a non-token is null rather than a throw", () => {
    assert.equal(readClaims("not-a-jwt"), null);
    assert.equal(readClaims(""), null);
    assert.equal(readClaims("a.b"), null);
  });

  test("an undecodable payload is null, not a crash", () => {
    assert.equal(readClaims("header.!!!not-base64-json!!!.sig"), null);
  });
});

describe("refusing a token that can write", () => {
  test("accepts the role the hook is supposed to set", () => {
    const role = assertUsableRole(tokenWith({ role: "kickio_content_reader" }), ALLOWED);
    assert.equal(role, "kickio_content_reader");
  });

  /**
   * The whole point of this check. If the hook is off, or on but pointed at a
   * different account, Supabase issues a perfectly valid token claiming
   * `authenticated` - which on Kickio holds INSERT, UPDATE and DELETE on
   * sales_history, collections and collector_profile, restrained only by row
   * policies. Connecting as it would silently end the promise that this engine
   * cannot write to Kickio, and everything would appear to work.
   */
  test("refuses `authenticated`, which on Kickio can write", () => {
    assert.throws(
      () => assertUsableRole(tokenWith({ role: "authenticated" }), ALLOWED),
      /not read-only on Kickio/,
    );
  });

  test("the refusal names the hook, because that is what is wrong", () => {
    assert.throws(
      () => assertUsableRole(tokenWith({ role: "authenticated" }), ALLOWED),
      /Custom Access Token hook/,
    );
  });

  test("refuses service_role outright", () => {
    assert.throws(
      () => assertUsableRole(tokenWith({ role: "service_role" }), ALLOWED),
      /not read-only on Kickio/,
    );
  });

  test("a token with no role at all is refused, not defaulted", () => {
    assert.throws(() => assertUsableRole(tokenWith({ sub: "abc" }), ALLOWED), /no role claim/);
  });

  test("a non-string role is not smuggled through", () => {
    assert.throws(() => assertUsableRole(tokenWith({ role: 42 }), ALLOWED), /no role claim/);
  });
});

describe("configuration", () => {
  test("no credentials means no sign-in is attempted", () => {
    const email = process.env.KICKIO_ENGINE_EMAIL;
    const password = process.env.KICKIO_ENGINE_PASSWORD;
    delete process.env.KICKIO_ENGINE_EMAIL;
    delete process.env.KICKIO_ENGINE_PASSWORD;
    resetEngineSession();
    try {
      assert.equal(engineCredentials(), null);
    } finally {
      if (email !== undefined) process.env.KICKIO_ENGINE_EMAIL = email;
      if (password !== undefined) process.env.KICKIO_ENGINE_PASSWORD = password;
      resetEngineSession();
    }
  });

  test("a blank email is not credentials", () => {
    const email = process.env.KICKIO_ENGINE_EMAIL;
    process.env.KICKIO_ENGINE_EMAIL = "   ";
    process.env.KICKIO_ENGINE_PASSWORD = "x";
    resetEngineSession();
    try {
      assert.equal(engineCredentials(), null);
    } finally {
      if (email === undefined) delete process.env.KICKIO_ENGINE_EMAIL;
      else process.env.KICKIO_ENGINE_EMAIL = email;
      delete process.env.KICKIO_ENGINE_PASSWORD;
      resetEngineSession();
    }
  });
});
