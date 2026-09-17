import { engine } from "../engine/client.ts";

/**
 * What the engine has already posted about, at three granularities.
 *
 * Deduplicating on the listing id is not enough. 52 products in the candidate
 * pool carry more than one listing, so the same shirt can return under a
 * different id; and 29 team/season/type combinations span several products
 * (Chelsea 2020-21 Home has four), which read as the same shirt to a follower
 * even though the database considers them distinct.
 */
export interface SelectionHistory {
  /** Product-level keys that must not be featured again. Hard exclusion. */
  subjects: Set<string>;
  /** team|season|shirt_type seen recently. Soft - avoided if possible. */
  combos: Set<string>;
  /** Teams seen recently. Soft - avoided if possible. */
  teams: Set<string>;
}

export interface HistoryWindows {
  /** How long a featured subject stays blocked. */
  subjectDays: number;
  /** How long before the same shirt (team+season+type) may recur. */
  comboDays: number;
  /** How long before the same club may recur. */
  teamDays: number;
}

export const DEFAULT_HISTORY_WINDOWS: HistoryWindows = {
  // 354 distinct products at one post a day is roughly a year of material, so
  // there is no reason to repeat inside one.
  subjectDays: 365,
  comboDays: 120,
  teamDays: 14,
};

export function comboKey(
  team: string | null | undefined,
  season: string | null | undefined,
  shirtType: string | null | undefined,
): string | null {
  if (!team || !season) return null;
  return [team, season, shirtType ?? ""].join("|").toLowerCase();
}

/**
 * A REJECTED draft blocks its subject permanently, rather than releasing it.
 *
 * Rejecting means "not this one" - so freeing the subject, as an earlier
 * version did, hands the same shirt straight back on the next run, since it is
 * still the highest-scoring candidate. The reviewer would have to reject it
 * every day forever.
 */
export async function selectionHistory(
  recipeKey: string,
  windows: HistoryWindows = DEFAULT_HISTORY_WINDOWS,
  now = new Date(),
): Promise<SelectionHistory> {
  const oldest = Math.max(windows.subjectDays, windows.comboDays, windows.teamDays);
  const since = new Date(now.getTime() - oldest * 86_400_000).toISOString();

  const { data, error } = await engine()
    .from("post_drafts")
    .select("subject_ref,status,created_at,source_data")
    .eq("recipe_key", recipeKey)
    .gte("created_at", since);

  if (error) throw new Error(`Loading selection history failed: ${error.message}`);

  const rows = (data ?? []) as Array<{
    subject_ref: string;
    status: string;
    created_at: string;
    source_data: Record<string, unknown> | null;
  }>;

  const subjects = new Set<string>();
  const combos = new Set<string>();
  const teams = new Set<string>();

  for (const row of rows) {
    const ageDays = (now.getTime() - new Date(row.created_at).getTime()) / 86_400_000;

    // Rejections never expire; everything else expires on its window.
    if (row.status === "rejected" || ageDays <= windows.subjectDays) {
      subjects.add(row.subject_ref);
    }

    const team = typeof row.source_data?.team === "string" ? row.source_data.team : null;
    const season = typeof row.source_data?.season === "string" ? row.source_data.season : null;
    const shirtType =
      typeof row.source_data?.shirt_type === "string" ? row.source_data.shirt_type : null;

    if (ageDays <= windows.comboDays) {
      const key = comboKey(team, season, shirtType);
      if (key) combos.add(key);
    }
    if (ageDays <= windows.teamDays && team) {
      teams.add(team.toLowerCase());
    }
  }

  return { subjects, combos, teams };
}

export interface VarietyCandidate {
  subjectRef: string;
  team: string | null;
  season: string | null;
  shirtType: string | null;
}

/**
 * Apply history to a ranked candidate list.
 *
 * Subject exclusion is HARD - a repeat is a defect. Combo and team avoidance
 * are SOFT: they reorder rather than remove, so a thin day still produces a
 * post instead of nothing. Candidates arrive best-first and relative order is
 * preserved within each tier.
 */
export function applyHistory<T extends VarietyCandidate>(
  ranked: T[],
  history: SelectionHistory,
): { eligible: T[]; blockedAsRepeat: number } {
  const unseen = ranked.filter((c) => !history.subjects.has(c.subjectRef));
  const blockedAsRepeat = ranked.length - unseen.length;

  const tier = (c: T): number => {
    const combo = comboKey(c.team, c.season, c.shirtType);
    const comboSeen = combo !== null && history.combos.has(combo);
    const teamSeen = c.team !== null && history.teams.has(c.team.toLowerCase());
    if (!comboSeen && !teamSeen) return 0;
    if (!comboSeen) return 1; // same club, different shirt - mildly repetitive
    return 2; // effectively the same shirt again
  };

  const eligible = unseen
    .map((candidate, index) => ({ candidate, index, tier: tier(candidate) }))
    .sort((a, b) => a.tier - b.tier || a.index - b.index)
    .map((entry) => entry.candidate);

  return { eligible, blockedAsRepeat };
}
