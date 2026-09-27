/**
 * Where to send someone after they sign in.
 *
 * The destination arrives in a query string, so it is attacker-controlled: a
 * link to /login?next=https://example.com would turn our own login into a
 * redirector that lends this domain's credibility to somebody else's page.
 * Only a path on this site is allowed, and "//host" is a path-looking URL that
 * browsers treat as another origin, so it is refused too.
 */
export function safeNext(next: unknown): string {
  if (typeof next !== "string") return "/";
  if (!next.startsWith("/") || next.startsWith("//")) return "/";
  // A backslash is normalised to a slash by some browsers, so "/\\evil.com"
  // is the same trick wearing a different hat.
  if (next.includes("\\")) return "/";
  return next;
}
