/**
 * The set list Settings offers for the Featured Set queue.
 *
 * Counted the same way the recipe counts, so the list an admin picks from is
 * exactly the list the recipe will accept. A picker that offers a set the run
 * then refuses just loses a week quietly.
 */
import { kickio } from "../kickio/client.ts";
import { engine } from "../engine/client.ts";
import { seasonYear } from "./club-archive.ts";
import {
  parseRule,
  expandRule,
  slotKey,
  scopeLine,
  subjectRefFor,
  DEFAULT_FEATURED_SET_CONFIG,
} from "./featured-set.ts";

export interface SetOption {
  slug: string;
  name: string;
  scope: string;
  slots: number;
  covered: number;
  buyable: number;
  lastPostedAt: string | null;
  available: boolean;
}

export async function featuredSetOptions(
  cooldownDays = DEFAULT_FEATURED_SET_CONFIG.cooldownDays,
  seasonTo = DEFAULT_FEATURED_SET_CONFIG.seasonTo,
): Promise<SetOption[]> {
  const { data: setData, error: setError } = await kickio()
    .from("collection_sets")
    .select("id,slug,name,rule")
    .eq("visibility", "public")
    .not("rule", "is", null)
    .limit(100);
  if (setError) throw new Error(`Loading sets failed: ${setError.message}`);

  const sets = ((setData ?? []) as Array<{
    slug: string | null;
    name: string | null;
    rule: Record<string, unknown> | null;
  }>)
    .map((set) => ({ set, rule: parseRule(set.rule) }))
    .filter((e) => e.rule !== null && e.set.slug && e.set.name);

  if (sets.length === 0) return [];

  const teams = [...new Set(sets.flatMap((e) => e.rule!.teams))];
  const [productResult, drafts] = await Promise.all([
    kickio()
      .from("products")
      .select("id,team,season,shirt_type")
      .is("deleted_at", null)
      .eq("status", "active")
      .in("team", teams)
      .limit(5000),
    engine()
      .from("post_drafts")
      .select("subject_ref,created_at")
      .eq("recipe_key", "featured_set")
      .order("created_at", { ascending: false }),
  ]);

  if (productResult.error) throw new Error(`Loading shirts failed: ${productResult.error.message}`);
  if (drafts.error) throw new Error(`Loading post history failed: ${drafts.error.message}`);

  const products = (productResult.data ?? []) as Array<{
    id: string;
    team: string | null;
    season: string | null;
    shirt_type: string | null;
  }>;

  const buyableIds = new Set<string>();
  if (products.length > 0) {
    const { data: listingData, error: listingError } = await kickio()
      .from("listings")
      .select("product_id")
      .in("product_id", products.map((p) => p.id))
      .eq("status", "active")
      .is("deleted_at", null)
      .gt("stock_quantity", 0)
      .is("removed_at", null)
      .eq("consecutive_gone_count", 0)
      .limit(20_000);
    if (listingError) throw new Error(`Loading listings failed: ${listingError.message}`);
    for (const row of (listingData ?? []) as Array<{ product_id: string | null }>) {
      if (row.product_id) buyableIds.add(row.product_id);
    }
  }

  const held = new Map<string, { any: boolean; buyable: boolean }>();
  for (const product of products) {
    const year = seasonYear(product.season);
    if (year === null || !product.team || !product.shirt_type) continue;
    const key = slotKey(product.team, product.shirt_type, year);
    const entry = held.get(key) ?? { any: false, buyable: false };
    entry.any = true;
    if (buyableIds.has(product.id)) entry.buyable = true;
    held.set(key, entry);
  }

  const lastPosted = new Map<string, string>();
  for (const row of (drafts.data ?? []) as Array<{ subject_ref: string; created_at: string }>) {
    if (!lastPosted.has(row.subject_ref)) lastPosted.set(row.subject_ref, row.created_at);
  }

  const cutoff = Date.now() - cooldownDays * 86_400_000;

  return sets
    .map(({ set, rule }) => {
      const slots = expandRule(rule!, seasonTo);
      let covered = 0;
      let buyable = 0;
      for (const slot of slots) {
        const entry = held.get(slotKey(slot.team, slot.shirtType, slot.year));
        if (!entry?.any) continue;
        covered++;
        if (entry.buyable) buyable++;
      }
      const posted = lastPosted.get(subjectRefFor(set.slug!)) ?? null;
      return {
        slug: set.slug!,
        name: set.name!,
        scope: scopeLine(rule!, seasonTo),
        slots: slots.length,
        covered,
        buyable,
        lastPostedAt: posted,
        available: !posted || new Date(posted).getTime() < cutoff,
      };
    })
    .sort((a, b) => {
      if (a.available !== b.available) return a.available ? -1 : 1;
      return b.buyable - a.buyable;
    });
}
