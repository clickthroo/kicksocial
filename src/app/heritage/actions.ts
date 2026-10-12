"use server";

import { revalidatePath } from "next/cache";
import { createHeritageDraft, type RunOutcome } from "@/lib/run-recipe.ts";
import {
  heritageShirts,
  DEFAULT_HERITAGE_CONFIG,
  type HeritageShirt,
} from "@/lib/recipes/club-heritage.ts";

export interface HeritagePreview {
  team: string;
  span: string;
  shirts: HeritageShirt[];
}

/**
 * The six the card would draw, before any copy is paid for.
 *
 * One club at a time rather than all of them with the page: the list offers
 * sixty-odd clubs and loading every club's shirts to render it would be sixty
 * queries for a page where fifty-nine of them are never looked at. The same
 * reason /drops looks a listing up on demand rather than previewing the whole
 * catalogue.
 */
export async function previewHeritage(
  team: string,
): Promise<{ ok: true; preview: HeritagePreview } | { ok: false; reason: string }> {
  const name = team.trim();
  if (!name) return { ok: false, reason: "No club chosen." };

  let all: HeritageShirt[];
  try {
    all = await heritageShirts(name);
  } catch (err) {
    return { ok: false, reason: (err as Error).message };
  }

  const need = DEFAULT_HERITAGE_CONFIG.featureCount;
  if (all.length < need) {
    return {
      ok: false,
      reason:
        `${name} has ${all.length} shirt${all.length === 1 ? "" : "s"} the card can use, ` +
        `and it needs ${need}. Each one needs a photograph, a readable season and a ` +
        "live listing behind it, so a club can drop off this list between the page " +
        "loading and you picking it.",
    };
  }

  const featured = all.slice(0, need);
  return {
    ok: true,
    preview: {
      team: name,
      span: `${featured[0]!.season} to ${featured[featured.length - 1]!.season}`,
      shirts: featured,
    },
  };
}

export async function postHeritage(team: string): Promise<RunOutcome> {
  const outcome = await createHeritageDraft({ team });
  revalidatePath("/heritage");
  revalidatePath("/");
  revalidatePath("/runs");
  return outcome;
}
