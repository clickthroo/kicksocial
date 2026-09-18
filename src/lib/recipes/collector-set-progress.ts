/**
 * Collector Set Progress - "@dave is 47 of 121 through the Full Everton
 * Collection."
 *
 * The other collector angle: not the whole collection, but how far one person
 * has got through one of Kickio's named lists. It needs someone to be deep into
 * a specific list, so it will stay quiet for longer after launch than
 * Collector Spotlight does - and when it fires it is the better post, because
 * a progress bar someone is visibly winning invites everyone else to compare.
 *
 * THE DENOMINATOR IS KICKIO'S, NOT OURS
 *
 * Set size comes from expanding the set's own `rule` (Featured Set does the
 * same and reproduces Kickio's published totals exactly), or from counting
 * slots for the one set that has them. Either way the number on the card is the
 * number the collector sees on the site - a post that disagrees with the page
 * it links to is worse than no post.
 *
 * PRIVACY AND CONSENT are handled in collector-access.ts, shared with
 * Collector Spotlight so the rules cannot drift between the two. Money is never
 * read: `paid_cents` is not selected and not granted.
 */
import { kickio } from "../kickio/client.ts";
import type { Claim, RecipeResult } from "../engine/types.ts";
import { imageUrls } from "./grail-of-the-day.ts";
import { seasonYear } from "./club-archive.ts";
import { parseRule, expandRule, slotKey, scopeLine, type SetRule } from "./featured-set.ts";
import {
  DEFAULT_COLLECTOR_COOLDOWN_DAYS,
  loadCollectors,
  postable,
  subjectRefFor,
  type CollectorOption,
} from "./collector-access.ts";

export const COLLECTOR_SET_PROGRESS_KEY = "collector_set_progress";

interface SetRow {
  id: string;
  slug: string | null;
  name: string | null;
  rule: Record<string, unknown> | null;
}

interface ProductRow {
  id: string;
  name: string | null;
  team: string | null;
  season: string | null;
  shirt_type: string | null;
  primary_image_url: string | null;
}

export interface CollectorSetProgressConfig {
  /** Below this the progress bar is not a story. */
  minFilled: number;
  /** A percentage is meaningless on a three-slot set. */
  minSlots: number;
  /** Below this the post reads as "someone owns almost none of this". */
  minPercent: number;
  minPhotos: number;
  gridSize: number;
  seasonTo: number;
  cooldownDays: number;
  upNext?: string[];
  /**
   * Extra accounts an admin never wants featured. House accounts are excluded
   * regardless - see HOUSE_ACCOUNTS in collector-access.ts.
   */
  excludeUserIds?: string[];
}

export const DEFAULT_COLLECTOR_SET_PROGRESS_CONFIG: CollectorSetProgressConfig = {
  minFilled: 8,
  minSlots: 12,
  minPercent: 20,
  minPhotos: 6,
  gridSize: 9,
  seasonTo: new Date().getUTCFullYear(),
  cooldownDays: DEFAULT_COLLECTOR_COOLDOWN_DAYS,
  upNext: [],
  excludeUserIds: [],
};

export interface Progress {
  slug: string;
  name: string;
  scope: string;
  slots: number;
  filled: number;
  percent: number;
  photos: string[];
  featured: Array<{ name: string | null; season: string | null; team: string | null }>;
  /** Seasons the set asks for that they do not own, oldest first. */
  missing: string[];
}

/** Integer percent, floored - 99% must never round to "complete". */
export function percentOf(filled: number, slots: number): number {
  if (slots <= 0) return 0;
  return Math.floor((filled / slots) * 100);
}

export function measure(
  set: SetRow,
  rule: SetRule,
  owned: ProductRow[],
  config: CollectorSetProgressConfig,
): Progress | null {
  if (!set.slug || !set.name) return null;

  const slots = expandRule(rule, config.seasonTo);
  const wanted = new Set(slots.map((s) => slotKey(s.team, s.shirtType, s.year)));

  const matched = new Map<string, ProductRow>();
  for (const product of owned) {
    const year = seasonYear(product.season);
    if (year === null || !product.team || !product.shirt_type) continue;
    const key = slotKey(product.team, product.shirt_type, year);
    if (!wanted.has(key) || matched.has(key)) continue;
    matched.set(key, product);
  }

  const inOrder = slots
    .map((s) => ({ slot: s, product: matched.get(slotKey(s.team, s.shirtType, s.year)) }))
    .sort((a, b) => a.slot.year - b.slot.year);

  const seen = new Set<string>();
  const photos: string[] = [];
  const featured: Progress["featured"] = [];
  for (const { product } of inOrder) {
    if (!product) continue;
    const url = imageUrls([product.primary_image_url])[0];
    if (!url || seen.has(url)) continue;
    seen.add(url);
    photos.push(url);
    featured.push({ name: product.name, season: product.season, team: product.team });
    if (photos.length >= config.gridSize) break;
  }

  const missing = inOrder
    .filter((entry) => !entry.product)
    .map((entry) => `${entry.slot.year} ${entry.slot.shirtType}`);

  return {
    slug: set.slug,
    name: set.name,
    scope: scopeLine(rule, config.seasonTo),
    slots: slots.length,
    filled: matched.size,
    percent: percentOf(matched.size, slots.length),
    photos,
    featured,
    missing,
  };
}

export interface ProgressVerdict {
  ok: boolean;
  reason?: string;
}

export function qualifies(
  progress: Progress,
  config: CollectorSetProgressConfig,
): ProgressVerdict {
  if (progress.slots < config.minSlots) {
    return { ok: false, reason: `${progress.name} has only ${progress.slots} slots` };
  }
  if (progress.filled < config.minFilled) {
    return {
      ok: false,
      reason: `${progress.filled} of ${progress.slots} in ${progress.name} (need ${config.minFilled})`,
    };
  }
  if (progress.percent < config.minPercent) {
    return {
      ok: false,
      reason: `${progress.percent}% of ${progress.name} (need ${config.minPercent}%)`,
    };
  }
  if (progress.photos.length < config.minPhotos) {
    return {
      ok: false,
      reason: `only ${progress.photos.length} renderable photos (need ${config.minPhotos})`,
    };
  }
  return { ok: true };
}

export async function runCollectorSetProgress(
  config: CollectorSetProgressConfig = DEFAULT_COLLECTOR_SET_PROGRESS_CONFIG,
): Promise<RecipeResult> {
  const queue = (config.upNext ?? []).map((s) => s.trim()).filter(Boolean);
  const queued = queue[0] ?? null;

  const { options: listed, access } = await loadCollectors(
    config.cooldownDays,
    config.excludeUserIds ?? [],
  );
  // Blocked accounts are dropped here rather than relying on `available`: a
  // queued pick bypasses `available` deliberately, and queueing Kickio's own
  // account must still be impossible.
  const options = postable(listed);
  if (!access.ok) {
    return { ok: false, reason: access.reason, diagnostics: { blind: access.blind } };
  }

  const candidates = queued
    ? options.filter((c) => c.userId === queued)
    : options.filter((c) => c.available);

  if (candidates.length === 0) {
    return {
      ok: false,
      reason: queued
        ? `Queued collector ${queued} is not eligible: opted out, or inside the ${config.cooldownDays}-day cooldown`
        : "No collector is off cooldown and consenting right now",
      diagnostics: { queued, queue, eligible: options.length },
    };
  }

  const { data: setData, error: setError } = await kickio()
    .from("collection_sets")
    .select("id,slug,name,rule")
    .eq("visibility", "public")
    .not("rule", "is", null)
    .limit(100);

  if (setError) return { ok: false, reason: `Kickio query failed: ${setError.message}` };

  const sets = ((setData ?? []) as unknown as SetRow[])
    .map((set) => ({ set, rule: parseRule(set.rule) }))
    .filter((entry): entry is { set: SetRow; rule: SetRule } => entry.rule !== null);

  if (sets.length === 0) {
    return { ok: false, reason: "No public set has a rule this engine can read" };
  }

  const shortlist = candidates.slice(0, 5);
  const shirts = await ownedShirts(shortlist);

  const rejected: Array<{ key: string; reason: string }> = [];
  let winner: { collector: CollectorOption; progress: Progress } | null = null;

  for (const collector of shortlist) {
    const owned = shirts.get(collector.userId) ?? [];
    for (const { set, rule } of sets) {
      const progress = measure(set, rule, owned, config);
      if (!progress) continue;
      const verdict = qualifies(progress, config);
      if (!verdict.ok) {
        rejected.push({ key: `${collector.name} / ${set.slug}`, reason: verdict.reason! });
        continue;
      }
      // Furthest through wins: the fuller the bar, the better the post.
      if (!winner || progress.percent > winner.progress.percent) {
        winner = { collector, progress };
      }
    }
  }

  if (!winner) {
    return {
      ok: false,
      reason: queued
        ? `${shortlist[0]?.name ?? queued} is not far enough through any set yet`
        : "No consenting collector is far enough through a set to post",
      diagnostics: {
        queued,
        queue,
        collectors: shortlist.length,
        sets: sets.length,
        rejected: rejected.slice(0, 10),
      },
    };
  }

  const { collector, progress } = winner;

  const claims: Claim[] = [
    {
      statement: `${collector.name} has ${progress.filled} of the ${progress.slots} shirts in ${progress.name}`,
      value: progress.filled,
      source: "collections joined to products, matched against the set's rule by team, type and season",
      basis:
        `The set is defined by a rule (${progress.scope}); the denominator is the seasons ` +
        "it asks for. Hidden shirts are excluded.",
    },
    {
      statement: `That is ${progress.percent}% of the set`,
      value: progress.percent,
      source: "filled / slots, floored to a whole percent",
      basis: "Floored, so a nearly-complete set never rounds up to complete",
    },
    {
      statement: `${progress.slots - progress.filled} still to find`,
      value: progress.slots - progress.filled,
      source: "slots the set asks for with no matching shirt in their collection",
    },
  ];

  return {
    ok: true,
    candidate: {
      subjectRef: subjectRefFor(collector.userId, "progress", `:${progress.slug}`),
      headline: `${collector.name}: ${progress.filled} of ${progress.slots} in ${progress.name}`,
      sourceData: {
        subject: `${collector.name} on ${progress.name}`,
        collector: collector.name,
        collector_title: collector.title,
        collection: progress.name,
        collection_slug: progress.slug,
        scope: progress.scope,
        slots: progress.slots,
        filled: progress.filled,
        percent: progress.percent,
        featured: progress.featured,
        hunting: progress.missing.slice(0, 6),
        collector_handle: collector.name,
        collector_flags: "collection_public and featured_consent both true",
        scope_note:
          "A real person's progress, published under Kickio's opt-out setting. Never " +
          "state or imply what the collection is worth or what any shirt cost.",
      },
      claims,
      images: progress.photos.slice(0, config.gridSize),
      ...(queued ? { consumeFromQueue: queued } : {}),
    },
  };
}

async function ownedShirts(collectors: CollectorOption[]): Promise<Map<string, ProductRow[]>> {
  const out = new Map<string, ProductRow[]>();
  if (collectors.length === 0) return out;

  const { data: owned, error: ownedError } = await kickio()
    .from("collections")
    .select("user_id,product_id,hidden")
    .in(
      "user_id",
      collectors.map((c) => c.userId),
    )
    .eq("hidden", false)
    .limit(20_000);

  if (ownedError) throw new Error(`Loading collections failed: ${ownedError.message}`);
  const rows = (owned ?? []) as Array<{ user_id: string; product_id: string | null }>;
  const productIds = [...new Set(rows.map((r) => r.product_id).filter((id): id is string => !!id))];
  if (productIds.length === 0) return out;

  const { data: productData, error: productError } = await kickio()
    .from("products")
    .select("id,name,team,season,shirt_type,primary_image_url")
    .in("id", productIds)
    .is("deleted_at", null)
    .limit(20_000);

  if (productError) throw new Error(`Loading shirts failed: ${productError.message}`);
  const byId = new Map(((productData ?? []) as unknown as ProductRow[]).map((p) => [p.id, p]));

  for (const row of rows) {
    if (!row.product_id) continue;
    const product = byId.get(row.product_id);
    if (!product) continue;
    const list = out.get(row.user_id) ?? [];
    list.push(product);
    out.set(row.user_id, list);
  }
  return out;
}

export const COLLECTOR_SET_PROGRESS_BRIEF = `**Collector Set Progress** - one collector, one of Kickio's lists, and how far through it they are.

The hook is the chase. Lead with the fraction, then name two or three shirts
they have from \`featured\` and one or two from \`hunting\` they still need - the
missing ones are what make other collectors reply.

Four hard rules:
- NEVER state or imply what the collection is worth, what any shirt cost, or
  what they paid.
- Use the name in the facts exactly as given. Never guess a real name, a
  location, an age, a gender or a pronoun - write about the collection, or use
  "they".
- \`percent\` is floored. Do not round it up, and never call a set complete
  unless \`filled\` equals \`slots\`.
- \`scope\` says what the set covers. Do not imply it is a club's whole history.`;
