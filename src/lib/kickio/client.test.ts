import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { kickio, resetKickioClient, __testing } from "./client.ts";

const { claimsServiceRole } = __testing;

/** Build an unsigned JWT with the given role claim, as Supabase issues them. */
function jwtWithRole(role: string): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ iss: "supabase", role })}.sig`;
}

describe("service-role detection", () => {
  test("flags a legacy service_role JWT", () => {
    assert.equal(claimsServiceRole(jwtWithRole("service_role")), true);
  });

  test("flags a modern secret key", () => {
    assert.equal(claimsServiceRole("sb_secret_abc123"), true);
  });

  test("allows an anon JWT", () => {
    assert.equal(claimsServiceRole(jwtWithRole("anon")), false);
  });

  test("allows a publishable key", () => {
    assert.equal(claimsServiceRole("sb_publishable_abc123"), false);
  });

  test("does not throw on a malformed key", () => {
    assert.equal(claimsServiceRole("not-a-jwt"), false);
    assert.equal(claimsServiceRole("a.b.c"), false);
  });
});

describe("kickio() construction", () => {
  const env = { ...process.env };
  const restore = () => {
    process.env = { ...env };
    resetKickioClient();
  };

  test("refuses a service-role key rather than connecting", () => {
    restore();
    process.env.KICKIO_SUPABASE_URL = "https://example.supabase.co";
    process.env.KICKIO_SUPABASE_PUBLISHABLE_KEY = jwtWithRole("service_role");
    assert.throws(() => kickio(), /service-role key/i);
    restore();
  });

  test("requires both url and key", () => {
    restore();
    delete process.env.KICKIO_SUPABASE_URL;
    delete process.env.KICKIO_SUPABASE_PUBLISHABLE_KEY;
    assert.throws(() => kickio(), /must be set/i);
    restore();
  });

  test("exposes select but no write methods", () => {
    restore();
    process.env.KICKIO_SUPABASE_URL = "https://example.supabase.co";
    process.env.KICKIO_SUPABASE_PUBLISHABLE_KEY = jwtWithRole("anon");

    const table = kickio().from("listings") as unknown as Record<string, unknown>;
    assert.equal(typeof table.select, "function");
    for (const method of ["insert", "update", "delete", "upsert", "rpc"]) {
      assert.equal(table[method], undefined, `${method} must not be reachable`);
    }
    restore();
  });
});
