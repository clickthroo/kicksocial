/**
 * The club list Settings offers for the Club Archive queue.
 *
 * Two things this has to get right, and both were learned the hard way:
 *
 * 1. THE COUNT IS RECOUNTED. `teams.listings_count` reports 65 for England
 *    where 140 active products exist, and 54 for Arsenal against 86. Ordering
 *    a list by it would put the wrong clubs at the top and print a number the
 *    post itself would contradict.
 *
 * 2. THE LIST KNOWS WHAT HAS RUN. A club posted last month must not be offered
 *    again, or an admin picks it, the run refuses it on cooldown, and the week
 *    is silently lost. Recently posted clubs are still returned, marked with
 *    when they ran, so the UI can show them greyed rather than pretending they
 *    do not exist.
 */
import { kickio } from "../kickio/client.ts";
import { engine } from "../engine/client.ts";
import { subjectRefFor } from "./club-archive.ts";

export interface ArchiveTeamOption {
  name: string;
  /** Active products on Kickio, counted here rather than read off teams. */
  shirts: number;
  earliest: number | null;
  latest: number | null;
  /** When this club was last drafted, or null if never. */
  lastPostedAt: string | null;
  /** False when it is inside the cooldown and so cannot be queued. */
  available: boolean;
}

const PAGE = 1000;

/**
 * Every active product's club and season.
 *
 * Paged explicitly: PostgREST caps a response at a server-configured row count
 * (commonly 1,000), so a single `.limit(5000)` silently returns a prefix and
 * every count downstream comes out short. Paging is correct whatever the cap
 * happens to be.
 */
async function allProducts(): Promise<Array<{ team: string | null; season: string | null }>> {
  const rows: Array<{ team: string | null; season: string | null }> = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await kickio()
      .from("products")
      .select("team,season")
      .is("deleted_at", null)
      .eq("status", "active")
      .not("team", "is", null)
      .order("id", { ascending: true })
      .range(from, from + PAGE - 1);

    if (error) throw new Error(`Loading teams failed: ${error.message}`);
    const page = (data ?? []) as Array<{ team: string | null; season: string | null }>;
    rows.push(...page);
    if (page.length < PAGE) return rows;
    // Guard against a server that ignores range and returns everything forever.
    if (rows.length > 50_000) return rows;
  }
}

function year(season: string | null): number | null {
  const match = /^(\d{4})/.exec(season?.trim() ?? "");
  if (!match) return null;
  const value = Number.parseInt(match[1], 10);
  return value >= 1900 && value <= 2100 ? value : null;
}

export async function archiveTeamOptions(
  cooldownDays: number,
  minShirts = 20,
): Promise<ArchiveTeamOption[]> {
  const [products, drafts] = await Promise.all([
    allProducts(),
    engine()
      .from("post_drafts")
      .select("subject_ref,created_at")
      .eq("recipe_key", "club_archive")
      .order("created_at", { ascending: false }),
  ]);

  if (drafts.error) throw new Error(`Loading post history failed: ${drafts.error.message}`);

  // Newest first, so the first hit per subject is the most recent.
  const lastPosted = new Map<string, string>();
  for (const row of (drafts.data ?? []) as Array<{ subject_ref: string; created_at: string }>) {
    if (!lastPosted.has(row.subject_ref)) lastPosted.set(row.subject_ref, row.created_at);
  }

  const byTeam = new Map<string, { shirts: number; years: number[] }>();
  for (const row of products) {
    if (!row.team) continue;
    const entry = byTeam.get(row.team) ?? { shirts: 0, years: [] };
    entry.shirts++;
    const y = year(row.season);
    if (y !== null) entry.years.push(y);
    byTeam.set(row.team, entry);
  }

  const cutoff = Date.now() - cooldownDays * 86_400_000;

  return [...byTeam.entries()]
    .filter(([, entry]) => entry.shirts >= minShirts)
    .map(([name, entry]) => {
      const posted = lastPosted.get(subjectRefFor(name)) ?? null;
      return {
        name,
        shirts: entry.shirts,
        earliest: entry.years.length ? Math.min(...entry.years) : null,
        latest: entry.years.length ? Math.max(...entry.years) : null,
        lastPostedAt: posted,
        available: !posted || new Date(posted).getTime() < cutoff,
      };
    })
    .sort((a, b) => {
      // Available first, then deepest. A greyed club at the top of the list is
      // just an invitation to pick the one thing that will not work.
      if (a.available !== b.available) return a.available ? -1 : 1;
      return b.shirts - a.shirts;
    });
}
