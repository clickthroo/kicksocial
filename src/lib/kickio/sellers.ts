import { kickio } from "./client.ts";

export interface SellerOption {
  id: string;
  label: string;
}

/**
 * Sellers that can be marked as appearing on kickio.com.
 *
 * There is no column on a listing or product saying whether it is live on the
 * site - it is a property of who is selling it. So the admin screen picks from
 * the real seller accounts rather than hard-coding UUIDs.
 */
export async function listSellers(): Promise<SellerOption[]> {
  const { data, error } = await kickio()
    .from("profiles")
    .select("id,username,display_name")
    .is("deleted_at", null);

  if (error) throw new Error(`Loading sellers failed: ${error.message}`);

  return ((data ?? []) as Array<{ id: string; username: string | null; display_name: string | null }>)
    .map((p) => ({
      id: p.id,
      label: p.display_name || p.username || p.id.slice(0, 8),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

export interface TeamOption {
  name: string;
  /** Kickio's own count. Indicative only - see club-archive.ts. */
  listings: number;
}

/**
 * Clubs with enough presence to be worth offering in Settings.
 *
 * Ordered by `teams.listings_count`, which is the cheap shortlist and NOT the
 * number the post prints: it reports 65 for England where 140 active products
 * exist. The recipe recounts whichever club is chosen, and refuses it if the
 * real figures do not hold up - so a thin choice here fails loudly rather than
 * producing a thin post.
 */
export async function listArchiveTeams(limit = 40): Promise<TeamOption[]> {
  const { data, error } = await kickio()
    .from("teams")
    .select("name,listings_count")
    .is("deleted_at", null)
    .gt("listings_count", 0)
    .order("listings_count", { ascending: false })
    .limit(limit);

  if (error) throw new Error(`Loading teams failed: ${error.message}`);

  return ((data ?? []) as Array<{ name: string | null; listings_count: number | null }>)
    .filter((t): t is { name: string; listings_count: number | null } => !!t.name)
    .map((t) => ({ name: t.name, listings: t.listings_count ?? 0 }));
}
