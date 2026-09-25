/**
 * The pipeline: recipe selects verified data -> Claude writes the copy ->
 * a draft lands in the approval queue.
 *
 * Every run is recorded in recipe_runs, including skips. A day with no post
 * should be explainable without digging through logs.
 */
import { engine } from "./engine/client.ts";
import { isDuplicateSubject, duplicateSubjectReason } from "./engine/duplicate.ts";
import { generateCopy } from "./copy/generate.ts";
import { SOLD_CTA_POOL } from "./copy/brand-voice.ts";
import { recipeByKey, type Recipe } from "./recipes/index.ts";
import { runGrailSale, GRAIL_SALE_BRIEF, type GrailSaleInput } from "./recipes/grail-sale.ts";
import { runKickioDrop, KICKIO_DROP_BRIEF, type KickioDropInput } from "./recipes/kickio-drop.ts";
import {
  runPriceHistory,
  PRICE_HISTORY_BRIEF,
  PRICE_HISTORY_KEY,
} from "./recipes/price-history.ts";
import { asCardStyle, DEFAULT_CARD_STYLE, type CardStyle } from "./render/styles.ts";
import type { PlatformCopy, PostDraft } from "./engine/types.ts";

export interface RunOutcome {
  recipeKey: string;
  status: "created" | "skipped" | "failed";
  draftId?: string;
  headline?: string;
  reason?: string;
}

/** Drop platform variants the recipe doesn't publish to. */
function forPlatforms(copy: PlatformCopy, platforms: Recipe["platforms"]): PlatformCopy {
  // Alt text describes the card, not a platform, so it survives whichever
  // variants this recipe publishes. Rebuilding the object without it was how
  // the first version lost it.
  const out: PlatformCopy = { alt: copy.alt };
  if (platforms.includes("x")) out.x = copy.x;
  if (platforms.includes("instagram")) out.instagram = copy.instagram;
  if (platforms.includes("tiktok")) out.tiktok = copy.tiktok;
  return out;
}

export async function runRecipe(
  key: string,
  trigger: "cron" | "manual" = "cron",
): Promise<RunOutcome> {
  const startedAt = Date.now();
  const recipe = recipeByKey(key);
  if (!recipe) return { recipeKey: key, status: "failed", reason: `Unknown recipe '${key}'` };

  const record = async (
    status: string,
    extra: Record<string, unknown> = {},
  ): Promise<void> => {
    await engine()
      .from("recipe_runs")
      .insert({
        recipe_key: key,
        trigger,
        status,
        duration_ms: Date.now() - startedAt,
        ...extra,
      });
  };

  // Config (thresholds, brief, enabled, platforms) lives in the recipes table so
  // it can be tuned without a redeploy. Fall back to the code defaults if the row
  // is missing, so a recipe never silently stops working.
  const { data: configRow } = await engine()
    .from("recipes")
    .select("enabled,selection,prompt_template,platforms")
    .eq("key", key)
    .maybeSingle();

  const config = configRow as {
    enabled: boolean;
    selection: Record<string, unknown>;
    prompt_template: string | null;
    platforms: string[] | null;
  } | null;

  if (config && !config.enabled) {
    await record("skipped", { skipped_reason: "Recipe is disabled" });
    return { recipeKey: key, status: "skipped", reason: "Recipe is disabled" };
  }

  const platforms = (config?.platforms as Recipe["platforms"] | undefined) ?? recipe.platforms;
  const brief = config?.prompt_template?.trim() || recipe.brief;

  let result;
  try {
    result = await recipe.run(config?.selection);
  } catch (err) {
    const reason = `Recipe threw: ${(err as Error).message}`;
    await record("failed", { skipped_reason: reason });
    return { recipeKey: key, status: "failed", reason };
  }

  if (!result.ok) {
    await record("skipped", {
      skipped_reason: result.reason,
      diagnostics: result.diagnostics ?? {},
    });
    return { recipeKey: key, status: "skipped", reason: result.reason };
  }

  const { candidate } = result;

  let generated;
  try {
    generated = await generateCopy(brief, candidate);
  } catch (err) {
    const reason = `Copy generation failed: ${(err as Error).message}`;
    await record("failed", { skipped_reason: reason, diagnostics: { subject: candidate.subjectRef } });
    return { recipeKey: key, status: "failed", reason };
  }

  const { data, error } = await engine()
    .from("post_drafts")
    .insert({
      recipe_key: key,
      status: "draft",
      subject_ref: candidate.subjectRef,
      headline: candidate.headline,
      copy: forPlatforms(generated.copy, platforms),
      source_data: { ...candidate.sourceData, images: candidate.images },
      claims: candidate.claims,
      generation: {
        model: "claude-opus-5",
        usage: generated.usage,
        visual_template: recipe.visualTemplate,
        // The recipe's default look, where its template reads one. Stored on
        // the draft rather than resolved at render time, so a card keeps the
        // style it was approved under even if the default changes later.
        style: asCardStyle(config?.selection?.style),
      },
    })
    .select("id")
    .single();

  if (error) {
    // The database refusing a second live post about the same subject is the
    // cooldown working, not a fault - see engine/duplicate.ts.
    if (isDuplicateSubject(error)) {
      const reason = duplicateSubjectReason(candidate.subjectRef);
      await record("skipped", { skipped_reason: reason, diagnostics: { subject: candidate.subjectRef } });
      return { recipeKey: key, status: "skipped", reason };
    }
    const reason = `Saving draft failed: ${error.message}`;
    await record("failed", { skipped_reason: reason });
    return { recipeKey: key, status: "failed", reason };
  }

  const draftId = (data as { id: string }).id;
  await record("created", { draft_id: draftId });

  // Only after the draft exists. A queue entry consumed before the post it was
  // for would be lost to a generation failure.
  if (candidate.consumeFromQueue) {
    await consumeQueueEntry(key, config?.selection ?? {}, candidate.consumeFromQueue);
  }

  return {
    recipeKey: key,
    status: "created",
    draftId,
    headline: candidate.headline,
  };
}

/**
 * Drop one entry from a recipe's `selection.upNext`.
 *
 * Re-reads the row rather than writing back the copy loaded at the start of the
 * run: a run can take a minute, and an admin editing the queue meanwhile should
 * not have their change reverted by a stale write.
 */
async function consumeQueueEntry(
  key: string,
  fallback: Record<string, unknown>,
  entry: string,
): Promise<void> {
  const { data, error } = await engine()
    .from("recipes")
    .select("selection")
    .eq("key", key)
    .maybeSingle();
  if (error) return;

  const selection = ((data as { selection: Record<string, unknown> } | null)?.selection ??
    fallback) as Record<string, unknown>;
  const queue = Array.isArray(selection.upNext) ? (selection.upNext as unknown[]) : [];
  const next = queue.filter((q) => typeof q === "string" && q !== entry);
  if (next.length === queue.length) return;

  await engine()
    .from("recipes")
    .update({ selection: { ...selection, upNext: next }, updated_at: new Date().toISOString() })
    .eq("key", key);
}

/**
 * Grail Sale: admin-initiated rather than scheduled, so it does not go through
 * runRecipe - there is nothing for cron to select and the input comes from a
 * form. It still records a run, because "why is there no draft?" is the same
 * question whether a person or a schedule asked for one.
 */
export async function createGrailSaleDraft(input: GrailSaleInput): Promise<RunOutcome> {
  const key = "grail_sale";
  const startedAt = Date.now();

  const record = async (status: string, extra: Record<string, unknown> = {}): Promise<void> => {
    await engine()
      .from("recipe_runs")
      .insert({ recipe_key: key, trigger: "manual", status, duration_ms: Date.now() - startedAt, ...extra });
  };

  const { data: configRow } = await engine()
    .from("recipes")
    .select("enabled,prompt_template,platforms,selection")
    .eq("key", key)
    .maybeSingle();
  const config = configRow as {
    enabled: boolean;
    prompt_template: string | null;
    platforms: string[] | null;
    selection: Record<string, unknown> | null;
  } | null;

  if (config && !config.enabled) {
    await record("skipped", { skipped_reason: "Recipe is disabled" });
    return { recipeKey: key, status: "skipped", reason: "Recipe is disabled" };
  }

  const result = await runGrailSale(input);
  if (!result.ok) {
    // A bad link or a missing photo is the admin's to fix, so it comes straight
    // back to the form as well as going into the run log.
    await record("skipped", { skipped_reason: result.reason, diagnostics: result.diagnostics ?? {} });
    return { recipeKey: key, status: "skipped", reason: result.reason };
  }

  const { candidate } = result;
  const platforms = (config?.platforms as Recipe["platforms"] | undefined) ?? [
    "x",
    "instagram",
    "tiktok",
  ];

  let generated;
  try {
    generated = await generateCopy(
      config?.prompt_template?.trim() || GRAIL_SALE_BRIEF,
      candidate,
      // The shirt has gone: "live now on kickio.com" would be an invitation to
      // buy something that is no longer there.
      { ctaPool: SOLD_CTA_POOL },
    );
  } catch (err) {
    const reason = `Copy generation failed: ${(err as Error).message}`;
    await record("failed", { skipped_reason: reason, diagnostics: { subject: candidate.subjectRef } });
    return { recipeKey: key, status: "failed", reason };
  }

  const { data, error } = await engine()
    .from("post_drafts")
    .insert({
      recipe_key: key,
      status: "draft",
      subject_ref: candidate.subjectRef,
      headline: candidate.headline,
      copy: forPlatforms(generated.copy, platforms),
      source_data: { ...candidate.sourceData, images: candidate.images },
      claims: candidate.claims,
      generation: {
        model: "claude-opus-5",
        usage: generated.usage,
        visual_template: "grail_sale_card",
        // The recipe's default; a reviewer can change it on the card.
        style: asCardStyle((config?.selection as Record<string, unknown>)?.style),
      },
    })
    .select("id")
    .single();

  if (error) {
    // The database refusing a second live post about the same subject is the
    // cooldown working, not a fault - see engine/duplicate.ts.
    if (isDuplicateSubject(error)) {
      const reason = duplicateSubjectReason(candidate.subjectRef);
      await record("skipped", { skipped_reason: reason, diagnostics: { subject: candidate.subjectRef } });
      return { recipeKey: key, status: "skipped", reason };
    }
    const reason = `Saving draft failed: ${error.message}`;
    await record("failed", { skipped_reason: reason });
    return { recipeKey: key, status: "failed", reason };
  }

  const draftId = (data as { id: string }).id;
  await record("created", { draft_id: draftId });
  return { recipeKey: key, status: "created", draftId, headline: candidate.headline };
}

/** Drafts awaiting review, newest first. */
export async function pendingDrafts(): Promise<PostDraft[]> {
  const { data, error } = await engine()
    .from("post_drafts")
    .select("*")
    .eq("status", "draft")
    .order("created_at", { ascending: false });

  if (error) throw new Error(`Loading queue failed: ${error.message}`);
  return (data ?? []) as PostDraft[];
}

/**
 * Restyle an existing draft. Only the style key is touched - the copy, claims
 * and photography are untouched, so changing a look can never change a fact.
 */
export async function setDraftStyle(id: string, style: CardStyle): Promise<void> {
  const { data, error } = await engine()
    .from("post_drafts")
    .select("generation")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Loading draft failed: ${error.message}`);
  if (!data) throw new Error("Draft not found");

  const generation = (data as { generation: Record<string, unknown> }).generation ?? {};
  const { error: updateError } = await engine()
    .from("post_drafts")
    .update({ generation: { ...generation, style } })
    .eq("id", id);
  if (updateError) throw new Error(`Saving the style failed: ${updateError.message}`);
}

export async function setDraftStatus(
  id: string,
  status: "approved" | "rejected",
  notes?: string,
): Promise<void> {
  const patch: Record<string, unknown> = { status, reviewed_at: new Date().toISOString() };
  if (notes !== undefined) patch.notes = notes;

  const { error } = await engine().from("post_drafts").update(patch).eq("id", id);
  if (error) throw new Error(`Updating draft failed: ${error.message}`);
}

/**
 * Kickio Drops: admin-initiated, like Grail Sale, and for the same reason -
 * there is nothing for cron to select and the input comes from a form.
 *
 * Shares the shape rather than the code path: a Drop links to a live product
 * and a Sale does not, so they use different CTA pools, different briefs and
 * different cards.
 */
export async function createKickioDropDraft(input: KickioDropInput): Promise<RunOutcome> {
  const key = "kickio_drop";
  const startedAt = Date.now();

  const record = async (status: string, extra: Record<string, unknown> = {}): Promise<void> => {
    await engine()
      .from("recipe_runs")
      .insert({ recipe_key: key, trigger: "manual", status, duration_ms: Date.now() - startedAt, ...extra });
  };

  const { data: configRow } = await engine()
    .from("recipes")
    .select("enabled,prompt_template,platforms,selection")
    .eq("key", key)
    .maybeSingle();
  const config = configRow as {
    enabled: boolean;
    prompt_template: string | null;
    platforms: string[] | null;
    selection: Record<string, unknown> | null;
  } | null;

  if (config && !config.enabled) {
    await record("skipped", { skipped_reason: "Recipe is disabled" });
    return { recipeKey: key, status: "skipped", reason: "Recipe is disabled" };
  }

  const result = await runKickioDrop(input);
  if (!result.ok) {
    // A dead listing or a bad link is the admin's to fix, so it comes straight
    // back to the form as well as going into the run log.
    await record("skipped", { skipped_reason: result.reason, diagnostics: result.diagnostics ?? {} });
    return { recipeKey: key, status: "skipped", reason: result.reason };
  }

  const { candidate } = result;
  const platforms = (config?.platforms as Recipe["platforms"] | undefined) ?? [
    "x",
    "instagram",
    "tiktok",
  ];

  let generated;
  try {
    generated = await generateCopy(config?.prompt_template?.trim() || KICKIO_DROP_BRIEF, candidate);
  } catch (err) {
    const reason = `Copy generation failed: ${(err as Error).message}`;
    await record("failed", { skipped_reason: reason, diagnostics: { subject: candidate.subjectRef } });
    return { recipeKey: key, status: "failed", reason };
  }

  const { data, error } = await engine()
    .from("post_drafts")
    .insert({
      recipe_key: key,
      status: "draft",
      subject_ref: candidate.subjectRef,
      headline: candidate.headline,
      copy: forPlatforms(generated.copy, platforms),
      source_data: { ...candidate.sourceData, images: candidate.images },
      claims: candidate.claims,
      generation: {
        model: "claude-opus-5",
        usage: generated.usage,
        visual_template: "drop_card",
        style: asCardStyle((config?.selection as Record<string, unknown>)?.style),
      },
    })
    .select("id")
    .single();

  if (error) {
    // The database refusing a second live post about the same subject is the
    // cooldown working, not a fault - see engine/duplicate.ts.
    if (isDuplicateSubject(error)) {
      const reason = duplicateSubjectReason(candidate.subjectRef);
      await record("skipped", { skipped_reason: reason, diagnostics: { subject: candidate.subjectRef } });
      return { recipeKey: key, status: "skipped", reason };
    }
    const reason = `Saving draft failed: ${error.message}`;
    await record("failed", { skipped_reason: reason });
    return { recipeKey: key, status: "failed", reason };
  }

  const draftId = (data as { id: string }).id;
  await record("created", { draft_id: draftId });
  return { recipeKey: key, status: "created", draftId, headline: candidate.headline };
}

/**
 * Price History: admin-chosen, like Grail Sale and Kickio Drops, but for a
 * different reason.
 *
 * The other two take input a person has to supply - a link, a price. This one
 * takes a shirt off a list the engine has already worked out, so the person is
 * choosing rather than typing. What cannot be automated is the judgement: a
 * shirt with six sales is a shirt this post CAN be made about, not one it
 * should be.
 */
export async function createPriceHistoryDraft(productId: string): Promise<RunOutcome> {
  const key = PRICE_HISTORY_KEY;
  const startedAt = Date.now();

  const record = async (status: string, extra: Record<string, unknown> = {}): Promise<void> => {
    await engine()
      .from("recipe_runs")
      .insert({ recipe_key: key, trigger: "manual", status, duration_ms: Date.now() - startedAt, ...extra });
  };

  const { data: configRow } = await engine()
    .from("recipes")
    .select("enabled,prompt_template,platforms,selection")
    .eq("key", key)
    .maybeSingle();
  const config = configRow as {
    enabled: boolean;
    prompt_template: string | null;
    platforms: string[] | null;
    selection: Record<string, unknown> | null;
  } | null;

  if (config && !config.enabled) {
    await record("skipped", { skipped_reason: "Recipe is disabled" });
    return { recipeKey: key, status: "skipped", reason: "Recipe is disabled" };
  }

  const result = await runPriceHistory(productId);
  if (!result.ok) {
    // Comes straight back to the picker as well as into the run log: the usual
    // reason is that a sale landed between the page loading and the click, and
    // the person looking at the list should be told that rather than left
    // wondering where their post went.
    await record("skipped", { skipped_reason: result.reason, diagnostics: result.diagnostics ?? {} });
    return { recipeKey: key, status: "skipped", reason: result.reason };
  }

  const { candidate } = result;
  const platforms = (config?.platforms as Recipe["platforms"] | undefined) ?? ["x", "instagram"];

  let generated;
  try {
    generated = await generateCopy(config?.prompt_template?.trim() || PRICE_HISTORY_BRIEF, candidate);
  } catch (err) {
    const reason = `Copy generation failed: ${(err as Error).message}`;
    await record("failed", { skipped_reason: reason, diagnostics: { subject: candidate.subjectRef } });
    return { recipeKey: key, status: "failed", reason };
  }

  const { data, error } = await engine()
    .from("post_drafts")
    .insert({
      recipe_key: key,
      status: "draft",
      subject_ref: candidate.subjectRef,
      headline: candidate.headline,
      copy: forPlatforms(generated.copy, platforms),
      source_data: { ...candidate.sourceData, images: candidate.images },
      claims: candidate.claims,
      generation: {
        model: "claude-opus-5",
        usage: generated.usage,
        visual_template: "price_history_card",
        // The mockup this card was built from is a cream page with dark green
        // type, which is `paper`. A reviewer can still change it.
        style: asCardStyle((config?.selection as Record<string, unknown>)?.style ?? "paper"),
      },
    })
    .select("id")
    .single();

  if (error) {
    if (isDuplicateSubject(error)) {
      const reason = duplicateSubjectReason(candidate.subjectRef);
      await record("skipped", { skipped_reason: reason, diagnostics: { subject: candidate.subjectRef } });
      return { recipeKey: key, status: "skipped", reason };
    }
    const reason = `Saving draft failed: ${error.message}`;
    await record("failed", { skipped_reason: reason });
    return { recipeKey: key, status: "failed", reason };
  }

  const draftId = (data as { id: string }).id;
  await record("created", { draft_id: draftId });
  return { recipeKey: key, status: "created", draftId, headline: candidate.headline };
}
