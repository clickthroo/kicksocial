/**
 * Mint the Kickio read-only credential.
 *
 * The engine authenticates to Kickio with whatever JWT is in
 * KICKIO_SUPABASE_PUBLISHABLE_KEY. An `anon` key reads zero rows from
 * `sales_history` (it has an INSERT policy and no SELECT policy), which is why
 * Value Pick and Collection Index report themselves blocked. This prints a
 * token claiming the `kickio_content_reader` role, which the policy applied in
 * docs/kickio-read-only-role.sql does grant.
 *
 * WHY THIS IS A FILE AND NOT A ONE-LINER
 *
 * A shell one-liner puts the JWT secret on the command line, where it lands in
 * shell history, and the quoting differs between bash and PowerShell. This
 * prompts for the secret instead: it is never stored, never written to disk,
 * and never passed as an argument.
 *
 * Do not paste the secret into jwt.io or any other website. It signs every
 * token Kickio trusts, including live user sessions.
 *
 *   node scripts/mint-reader-token.js
 *
 * Then set the printed token as KICKIO_SUPABASE_PUBLISHABLE_KEY on the content
 * engine (server-side only - never NEXT_PUBLIC_) and redeploy.
 *
 * Verification steps are in docs/unblocking-sold-this-week.md. Run them before
 * trusting the token: it should read a sale, and it should be refused when it
 * tries to write one.
 */
const crypto = require("node:crypto");
const readline = require("node:readline");

/** Kickio's Supabase project ref. Cosmetic - Supabase does not verify it. */
const PROJECT_REF = "rlveellvebfzgyobceru";

/**
 * The role the token claims. This is the only claim that actually decides what
 * the token can read, so it is also the only one worth checking twice. It must
 * match the role created by docs/kickio-read-only-role.sql, and it must be on
 * the allowlist in src/lib/kickio/client.ts - the engine refuses to connect as
 * anything else.
 */
const ROLE = "kickio_content_reader";

/**
 * 90 days, and the short life is the point.
 *
 * Kickio moved to asymmetric JWT signing keys (ECC P-256) on 2026-09-16. With
 * asymmetric signing Supabase holds the private key, so this token cannot be
 * signed with the CURRENT key at all - it is signed with the Legacy HS256
 * shared secret, which the dashboard now lists under "Previously used keys"
 * with the note "Revoke once all tokens have expired".
 *
 * So this token depends on a key Kickio has already decided to retire. A
 * one-year token would mean asking them to leave that key unrevoked for a
 * year, which quietly undoes the migration they just completed. 90 days keeps
 * the engine working while keeping the deadline visible: when it expires,
 * either re-mint or - better - replace this route with one that works against
 * the current key.
 *
 * To cut access off immediately at any point, drop the role instead (the
 * rollback block in docs/kickio-read-only-role.sql). That is the real kill
 * switch; revoking a single JWT is not possible.
 */
const LIFETIME_SECONDS = 90 * 24 * 60 * 60;

function base64url(value) {
  return Buffer.from(JSON.stringify(value)).toString("base64url");
}

function mint(secret) {
  const now = Math.floor(Date.now() / 1000);
  const body =
    base64url({ alg: "HS256", typ: "JWT" }) +
    "." +
    base64url({
      iss: "supabase",
      ref: PROJECT_REF,
      role: ROLE,
      iat: now,
      exp: now + LIFETIME_SECONDS,
    });
  const signature = crypto.createHmac("sha256", secret).update(body).digest("base64url");
  return `${body}.${signature}`;
}

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });

console.log(
  "\nSupabase dashboard -> Kickio project -> Project Settings -> JWT Keys ->\n" +
    "the LEGACY JWT SECRET tab (not the JWT Signing Keys tab).\n" +
    "\n" +
    "It must be the legacy HS256 shared secret. The current signing key is\n" +
    "ECC (P-256), whose private half Supabase never reveals - nothing can be\n" +
    "signed with it here. The Key ID shown beside a key is a public label, not\n" +
    "a secret, and signing with it produces a token that is rejected.\n",
);

rl.question("Paste the JWT secret and press Enter:\n> ", (answer) => {
  rl.close();
  const secret = answer.trim();

  if (!secret) {
    console.error("\nNo secret given - nothing minted.");
    process.exit(1);
  }

  // A pasted anon/publishable KEY is not the SECRET, and signing with it
  // produces a token Kickio will reject with a confusing "invalid signature"
  // rather than anything that names the real mistake.
  if (secret.startsWith("sb_") || secret.split(".").length === 3) {
    console.error(
      "\nThat looks like an API key, not the JWT secret. The secret is a single\n" +
        "opaque string under the Legacy JWT Secret tab - not the anon key, and\n" +
        "not an sb_ key.",
    );
    process.exit(1);
  }

  // The Key ID sits right beside the secret in the dashboard and is the easier
  // of the two to copy. Signing with it produces a perfectly well-formed token
  // that Kickio rejects as an invalid signature - a failure that names the
  // wrong problem, at the point furthest from the mistake.
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(secret)) {
    console.error(
      "\nThat is a Key ID, not a secret - it is the public label shown beside a\n" +
        "key under JWT Signing Keys. The legacy secret is a longer string with no\n" +
        "dashes, on the Legacy JWT Secret tab.",
    );
    process.exit(1);
  }

  const token = mint(secret);
  const expires = new Date((Math.floor(Date.now() / 1000) + LIFETIME_SECONDS) * 1000);

  console.log(`\nRole:    ${ROLE}`);
  console.log(`Expires: ${expires.toISOString().slice(0, 10)}\n`);
  console.log("Set this as KICKIO_SUPABASE_PUBLISHABLE_KEY (server-side only):\n");
  console.log(token);
  console.log("\nVerify it before deploying - see docs/unblocking-sold-this-week.md.\n");
});
