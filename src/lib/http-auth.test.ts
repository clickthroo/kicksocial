import { test, describe, afterEach } from "node:test";
import assert from "node:assert/strict";
import { checkTriggerAuth } from "./http-auth.ts";

const withSecret = (value: string | undefined) => {
  if (value === undefined) delete process.env.CRON_SECRET;
  else process.env.CRON_SECRET = value;
};

const req = (auth?: string) =>
  new Request("https://example.test/api/cron", {
    headers: auth ? { authorization: auth } : {},
  });

afterEach(() => withSecret(undefined));

describe("trigger endpoint authentication", () => {
  test("refuses when no secret is configured, rather than waving the caller through", () => {
    // The original shape was `if (secret) { ...check... }`, so an unset env var
    // turned the check off and left a public URL that spends Anthropic credits.
    withSecret(undefined);
    const verdict = checkTriggerAuth(req("Bearer anything"));
    assert.equal(verdict.ok, false, "an unset secret must not be a bypass");
    assert.equal(verdict.ok === false && verdict.status, 503);
  });

  test("says why it refused, so a missing secret is diagnosable", () => {
    withSecret(undefined);
    const verdict = checkTriggerAuth(req());
    assert.match(verdict.ok === false ? verdict.error : "", /CRON_SECRET/);
  });

  test("refuses a missing, malformed or wrong token", () => {
    withSecret("s3cret");
    for (const auth of [undefined, "s3cret", "Basic s3cret", "Bearer wrong", "Bearer "]) {
      const verdict = checkTriggerAuth(req(auth));
      assert.equal(verdict.ok, false, `should have refused: ${String(auth)}`);
      assert.equal(verdict.ok === false && verdict.status, 401);
    }
  });

  test("refuses a token that is merely a prefix of the secret", () => {
    withSecret("s3cret");
    assert.equal(checkTriggerAuth(req("Bearer s3c")).ok, false);
  });

  test("allows the matching token", () => {
    withSecret("s3cret");
    assert.equal(checkTriggerAuth(req("Bearer s3cret")).ok, true);
  });
});
