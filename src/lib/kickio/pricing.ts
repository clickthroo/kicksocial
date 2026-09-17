import { kickio } from "./client.ts";

/**
 * Buyer-facing pricing, matching what kickio.com actually shows.
 *
 * A listing's `price_cents` is the seller's asking price. The site adds a buyer
 * protection fee on top, so quoting `price_cents` in a post understates what a
 * reader sees when they click through - a £332.99 listing displays as £346.99.
 *
 * The fee parameters live in Kickio's `marketplace_settings` and are read at
 * run time rather than hard-coded, so a change on their side flows through
 * instead of silently making every post wrong.
 */
export interface BuyerFeeSettings {
  enabled: boolean;
  percentBps: number;
  fixedCents: number;
  rounding: string;
}

export const DEFAULT_BUYER_FEE: BuyerFeeSettings = {
  enabled: true,
  percentBps: 400,
  fixedCents: 40,
  rounding: "up_50_or_99",
};

/**
 * Round up to the next amount ending in .50 or .99, which is the site's
 * `up_50_or_99` rule. An amount already ending in .50 or .99 is left alone.
 */
export function roundUpTo50Or99(cents: number): number {
  const whole = Math.ceil(cents);
  const withinPound = whole % 100;
  if (withinPound === 50 || withinPound === 99) return whole;
  const base = whole - withinPound;
  if (withinPound < 50) return base + 50;
  return base + 99;
}

/** The price a buyer sees on kickio.com for a given asking price. */
export function buyerPriceCents(
  askingCents: number,
  fee: BuyerFeeSettings = DEFAULT_BUYER_FEE,
): number {
  if (!fee.enabled) return askingCents;
  const gross = askingCents * (1 + fee.percentBps / 10_000) + fee.fixedCents;
  if (fee.rounding === "up_50_or_99") return roundUpTo50Or99(gross);
  return Math.ceil(gross);
}

/**
 * Format for copy. Whole amounts drop the decimals (£945, not £945.00); amounts
 * with pence keep them, because rounding £346.99 to "£347" overstates the price
 * on a page that says otherwise.
 */
export function formatPrice(cents: number, currency = "GBP"): string {
  const hasPence = cents % 100 !== 0;
  return (cents / 100).toLocaleString("en-GB", {
    style: "currency",
    currency,
    minimumFractionDigits: hasPence ? 2 : 0,
    maximumFractionDigits: hasPence ? 2 : 0,
  });
}

let cached: BuyerFeeSettings | null = null;

export async function buyerFeeSettings(): Promise<BuyerFeeSettings> {
  if (cached) return cached;

  const { data, error } = await kickio()
    .from("marketplace_settings")
    .select("bpf_enabled,bpf_percent_bps,bpf_fixed_gbp_cents,bpf_rounding")
    .limit(1)
    .maybeSingle();

  // Fall back to the documented defaults rather than failing a whole run; the
  // values are stable and a wrong-but-close price beats no post at all.
  if (error || !data) return DEFAULT_BUYER_FEE;

  const row = data as {
    bpf_enabled: boolean | null;
    bpf_percent_bps: number | null;
    bpf_fixed_gbp_cents: number | null;
    bpf_rounding: string | null;
  };

  cached = {
    enabled: row.bpf_enabled ?? DEFAULT_BUYER_FEE.enabled,
    percentBps: row.bpf_percent_bps ?? DEFAULT_BUYER_FEE.percentBps,
    fixedCents: row.bpf_fixed_gbp_cents ?? DEFAULT_BUYER_FEE.fixedCents,
    rounding: row.bpf_rounding ?? DEFAULT_BUYER_FEE.rounding,
  };
  return cached;
}

/** Test seam. */
export function resetBuyerFeeCache(): void {
  cached = null;
}
