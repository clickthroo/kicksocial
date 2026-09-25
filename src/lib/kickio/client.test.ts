import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { kickio, resetKickioClient, __testing } from "./client.ts";

const { claimedRole, PUBLIC_ONLY } = __testing;

/** Build an unsigned JWT with the given role claim, as Supabase issues them. */
function jwtWithRole(role: string): string {
  const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  return `${b64({ alg: "HS256", typ: "JWT" })}.${b64({ iss: "supabase", role })}.sig`;
}

describe("role detection", () => {
  test("reads the role from a JWT", () => {
    assert.equal(claimedRole(jwtWithRole("service_role")), "service_role");
    assert.equal(claimedRole(jwtWithRole("anon")), "anon");
    assert.equal(claimedRole(jwtWithRole("kickio_content_reader")), "kickio_content_reader");
  });

  test("treats a modern secret key as service_role", () => {
    assert.equal(claimedRole("sb_secret_abc123"), "service_role");
  });

  test("treats a publishable key as anon", () => {
    assert.equal(claimedRole("sb_publishable_abc123"), "anon");
  });

  test("returns null for a malformed key rather than throwing", () => {
    assert.equal(claimedRole("not-a-jwt"), null);
    assert.equal(claimedRole("a.b.c"), null);
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
    assert.throws(() => kickio(), /refusing to connect/i);
    restore();
  });

  test("refuses any role not on the allowlist, not just service_role", () => {
    for (const role of ["postgres", "authenticated", "supabase_admin", "rds_superuser"]) {
      restore();
      process.env.KICKIO_SUPABASE_URL = "https://example.supabase.co";
      process.env.KICKIO_SUPABASE_PUBLISHABLE_KEY = jwtWithRole(role);
      assert.throws(() => kickio(), /refusing to connect/i, `${role} must be refused`);
    }
    restore();
  });

  test("accepts the scoped read-only role", () => {
    restore();
    process.env.KICKIO_SUPABASE_URL = "https://example.supabase.co";
    process.env.KICKIO_SUPABASE_PUBLISHABLE_KEY = jwtWithRole("kickio_content_reader");
    assert.doesNotThrow(() => kickio());
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

describe("which credential each table is read with", () => {
  /**
   * The bug this encodes. `listings` has an RLS policy that reaches into
   * `orders`, and Postgres checks SELECT on every table a policy touches
   * before running any of it. The scoped role was granted ten tables and
   * `orders` is not among them, so as `kickio_content_reader` the table is not
   * empty - every read is "permission denied for table orders". `anon` has the
   * default grant, so the policy evaluates, returns nothing, and the public
   * marketplace rows come back.
   */
  test("listings is read as anon, because the scoped role cannot read it at all", () => {
    assert.ok(PUBLIC_ONLY.has("listings"));
  });

  /**
   * The mirror-image mistake, and the more dangerous one: routing a table anon
   * CANNOT read through the anon client does not fail loudly, it reads zero
   * rows. Sold This Week spent a fortnight posting nothing for exactly that
   * reason. None of these may ever be added to the set.
   */
  test("nothing only the scoped role can see is routed to anon", () => {
    for (const table of [
      "sales_history",
      "collections",
      "collector_profile",
      "collection_highlights",
    ] as const) {
      assert.equal(PUBLIC_ONLY.has(table), false, `${table} would read as empty via anon`);
    }
  });
});
