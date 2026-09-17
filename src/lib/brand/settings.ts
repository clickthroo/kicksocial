/**
 * Branding for the generated cards: the logo and the colours.
 *
 * Lives in the engine's own database so it can be changed without a redeploy,
 * exactly like recipe configuration. Kickio is never written to.
 *
 * The logo is stored as a data URI rather than a link. Satori needs the bytes
 * at render time, so a URL would mean a network round trip on every card - and
 * a different answer in dev, in preview and in production if the file moved.
 */
import { engine } from "../engine/client.ts";
import { isHexColour, normaliseHex } from "./colour.ts";

export interface Brand {
  /** The logo, inlined. Null falls back to the text wordmark. */
  markDataUri: string | null;
  markFilename: string | null;
  markUpdatedAt: string | null;
  /** Carries the SOLD badge, "SOLD FOR" and kickio.com on the cards. */
  accent: string;
  accentDeep: string;
  /** Chart direction. Checked as a pair when saved. */
  rising: string;
  falling: string;
}

/**
 * What the cards look like before anyone touches Settings. Also the fallback
 * when the row cannot be read: a card rendered in default branding is a much
 * smaller problem than a card that fails to render.
 */
export const DEFAULT_BRAND: Brand = {
  markDataUri: null,
  markFilename: null,
  markUpdatedAt: null,
  accent: "#35d07f",
  accentDeep: "#12a862",
  rising: "#2bd14a",
  falling: "#9085e9",
};

interface BrandRow {
  mark_data_uri: string | null;
  mark_filename: string | null;
  mark_updated_at: string | null;
  accent: string;
  accent_deep: string;
  rising: string;
  falling: string;
}

const COLUMNS = "mark_data_uri,mark_filename,mark_updated_at,accent,accent_deep,rising,falling";

/** A stored colour that is not a hex is not a colour; fall back rather than emit it. */
function colour(value: unknown, fallback: string): string {
  return typeof value === "string" && isHexColour(value) ? normaliseHex(value) : fallback;
}

export async function loadBrand(): Promise<Brand> {
  try {
    const { data, error } = await engine()
      .from("brand_settings")
      .select(COLUMNS)
      .maybeSingle();
    if (error || !data) return DEFAULT_BRAND;

    const row = data as unknown as BrandRow;
    return {
      markDataUri: row.mark_data_uri,
      markFilename: row.mark_filename,
      markUpdatedAt: row.mark_updated_at,
      accent: colour(row.accent, DEFAULT_BRAND.accent),
      accentDeep: colour(row.accent_deep, DEFAULT_BRAND.accentDeep),
      rising: colour(row.rising, DEFAULT_BRAND.rising),
      falling: colour(row.falling, DEFAULT_BRAND.falling),
    };
  } catch {
    // Branding is decoration. It must never be the reason a card 500s.
    return DEFAULT_BRAND;
  }
}

export interface BrandColours {
  accent: string;
  accentDeep: string;
  rising: string;
  falling: string;
}

export async function saveBrandColours(colours: BrandColours): Promise<void> {
  for (const [name, value] of Object.entries(colours)) {
    if (!isHexColour(value)) throw new Error(`${name} is not a hex colour: "${value}"`);
  }

  const { error } = await engine()
    .from("brand_settings")
    .update({
      accent: normaliseHex(colours.accent),
      accent_deep: normaliseHex(colours.accentDeep),
      rising: normaliseHex(colours.rising),
      falling: normaliseHex(colours.falling),
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);

  if (error) throw new Error(`Saving brand colours failed: ${error.message}`);
}

export async function saveBrandMark(dataUri: string | null, filename: string | null): Promise<void> {
  const { error } = await engine()
    .from("brand_settings")
    .update({
      mark_data_uri: dataUri,
      mark_filename: filename,
      mark_updated_at: dataUri ? new Date().toISOString() : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", true);

  if (error) throw new Error(`Saving the logo failed: ${error.message}`);
}
