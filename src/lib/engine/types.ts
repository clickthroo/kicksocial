export type Platform = "x" | "instagram" | "tiktok";
export type DraftStatus = "draft" | "approved" | "rejected" | "published";

/**
 * A single checkable assertion made by a post, paired with the value it came
 * from. Every number that appears in copy should have one of these, so the
 * reviewer can verify "up 12%" against the real figure before approving.
 */
export interface Claim {
  /** The claim as a reader would encounter it, e.g. "England shirts up 12%". */
  statement: string;
  /** The underlying value, e.g. 12.4. */
  value: string | number | boolean;
  /** Where it came from, e.g. "price_index_aggregates.pct_change_90d". */
  source: string;
  /** How it was derived, for anything non-obvious. */
  basis?: string;
}

export interface TikTokScript {
  hook: string;
  beats: string[];
  cta: string;
  hashtags?: string[];
}

export interface PlatformCopy {
  /**
   * What the image shows, for screen readers and for the networks' own
   * indexing. One field, because the card is the same picture on every
   * platform - only the copy around it changes.
   */
  alt?: string;
  x?: { text: string; hashtags?: string[] };
  instagram?: { caption: string; hashtags: string[] };
  tiktok?: TikTokScript;
}

export interface PostDraft {
  id: string;
  recipe_key: string;
  status: DraftStatus;
  subject_ref: string;
  headline: string | null;
  copy: PlatformCopy;
  source_data: Record<string, unknown>;
  claims: Claim[];
  image_path: string | null;
  video_path: string | null;
  notes: string | null;
  generation: Record<string, unknown>;
  created_at: string;
  reviewed_at: string | null;
  published_at: string | null;
}

/** What a recipe produces before copy generation: the facts, already verified. */
export interface RecipeCandidate {
  /** Stable identity of the subject, for cooldown/dedupe. */
  subjectRef: string;
  /** Short human label shown in the dashboard. */
  headline: string;
  /** The rows behind this post, surfaced to the reviewer. */
  sourceData: Record<string, unknown>;
  /** Numeric/factual claims this post is allowed to make. */
  claims: Claim[];
  /** Photography to composite into the card, best first. */
  images: string[];
  /**
   * An entry to remove from this recipe's `selection.upNext` once a draft is
   * successfully created.
   *
   * The queue is a running order, not a setting: a stored choice that survives
   * the post it was made for is how a recipe ends up publishing the same
   * subject every week. Consumed by run-recipe after the insert, so a failed
   * generation leaves the queue intact and the entry comes round again.
   */
  consumeFromQueue?: string;
}

export type RecipeResult =
  | { ok: true; candidate: RecipeCandidate }
  | { ok: false; reason: string; diagnostics?: Record<string, unknown> };
