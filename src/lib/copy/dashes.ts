/**
 * The house style bans em dashes. The brief says so, but a model's punctuation
 * is a preference and not a guarantee, so generated copy is normalised on the
 * way out of the generator rather than trusted to have complied.
 *
 * This is the same shape as the read-only routing in `lib/kickio/client.ts`:
 * one chokepoint that cannot be bypassed by a new call site, rather than a rule
 * every caller has to remember.
 *
 * The character has to appear here in order to be matched, which is the one
 * place in the codebase it legitimately does (alongside `kickio/values.ts`,
 * where it is a placeholder value in Kickio's own data).
 */
const EM_DASH = "\u2014";
const AROUND = new RegExp(`[ \\t]*${EM_DASH}[ \\t]*`, "g");

/**
 * What replaces it depends on what is already there:
 *
 *   "a shirt \u2014 and a story"  -> "a shirt, and a story"
 *   "Sold: a shirt \u2014 £95"    -> "Sold: a shirt, £95"
 *   "Sold, \u2014 £95"            -> "Sold, £95"  (never ", , ")
 *   "\u2014 it starts a line"     -> "it starts a line"
 *
 * A comma is the safest general substitute: it is never ungrammatical where an
 * em dash was an aside, and at worst it reads as a comma splice where the dash
 * joined two full clauses. The brief is what stops those from being written in
 * the first place; this is the net underneath it.
 */
export function stripEmDashes(text: string): string {
  return text.replace(AROUND, (_match, offset: number, whole: string) => {
    const before = whole.slice(0, offset);
    if (before.trim() === "" || /\n[ \t]*$/.test(before)) return "";
    const upto = before.trimEnd();
    // An opening bracket wants nothing after it; a mark that already closed the
    // clause wants the space back but not a second comma.
    if (/[([]$/.test(upto)) return "";
    return /[,;:.!?]$/.test(upto) ? " " : ", ";
  });
}

export interface Stripped<T> {
  value: T;
  /** How many em dashes the model wrote in spite of the brief. */
  replaced: number;
}

/** Applies `stripEmDashes` to every string in a parsed copy object. */
export function stripEmDashesDeep<T>(value: T): Stripped<T> {
  let replaced = 0;
  const walk = (node: unknown): unknown => {
    if (typeof node === "string") {
      replaced += (node.match(new RegExp(EM_DASH, "g")) ?? []).length;
      return stripEmDashes(node);
    }
    if (Array.isArray(node)) return node.map(walk);
    if (node && typeof node === "object") {
      return Object.fromEntries(Object.entries(node).map(([k, v]) => [k, walk(v)]));
    }
    return node;
  };
  return { value: walk(value) as T, replaced };
}
