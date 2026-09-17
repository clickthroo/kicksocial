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
