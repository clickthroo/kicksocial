/**
 * The pipeline: recipe selects verified data -> Claude writes the copy ->
 * a draft lands in the approval queue.
 *
 * Every run is recorded in recipe_runs, including skips. A day with no post
 * should be explainable without digging through logs.
 */
import { engine } from "./engine/client.ts";
import { imagesOf, nextImages } from "./engine/draft-photos.ts";
import { isDuplicateSubject, duplicateSubjectReason } from "./engine/duplicate.ts";
import { generateCopy } from "./copy/generate.ts";
import { SOLD_CTA_POOL } from "./copy/brand-voice.ts";
import { recipeByKey, type Recipe } from "./recipes/index.ts";
import { runGrailSale, GRAIL_SALE_BRIEF, type GrailSaleInput } from "./recipes/grail-sale.ts";
import { runKickioDrop, KICKIO_DROP_BRIEF, type KickioDropInput } from "./recipes/kickio-drop.ts";
import { runWhoAmI, WHO_AM_I_BRIEF, WHO_AM_I_KEY } from "./recipes/who-am-i.ts";
import { runBattle, BATTLE_BRIEF, BATTLE_KEY } from "./recipes/battle.ts";
import {
  runPhotoProd,
  PHOTO_PROD_BRIEF,
  PHOTO_PROD_KEY,
  type PhotoProdInput,
} from "./recipes/photo-prod.ts";
import {
  runClassics,
  CLASSICS_BRIEF,
  CLASSICS_KEY,
  type ClassicInput,
} from "./recipes/classics.ts";
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

/**
 * Make sure the recipe has a row in `recipes` before a draft points at it.
 *
 * `post_drafts.recipe_key` is a FOREIGN KEY onto `recipes.key`. A recipe that
 * exists only in code therefore generates its copy, pays for the Claude call,
 * and then fails on the insert with "violates foreign key constraint
 * post_drafts_recipe_key_fkey" - which says nothing about the actual problem
 * and cost 27 seconds and a generation to find out. PhotoProd did exactly that
 * twice, and Dropzone and Yesterday's Sales were queued to do the same on their
 * first successful run.
 *
 * ON CONFLICT DO NOTHING, never an update. The row is also the admin's: /admin
 * edits `enabled`, `platforms`, `selection` and `prompt_template` through it,
 * and a recipe that reset those every time it ran would quietly undo settings
 * somebody had chosen.
 *
 * `prompt_template` is NOT NULL with no default, so a new row gets a single
 * space. Every creator reads `config?.prompt_template?.trim() || BRIEF`, so a
 * blank one falls through to the brief in code, which is what a recipe nobody
 * has customised should use.
 */
async function ensureRecipeRow(
  key: string,
  name: string,
  cadence: string,
  visualTemplate: string,
): Promise<void> {
  const { error } = await engine()
    .from("recipes")
    .upsert(
      { key, name, cadence, prompt_template: " ", visual_template: visualTemplate },
      { onConflict: "key", ignoreDuplicates: true },
    );
  // Not fatal on its own: if the row cannot be written the insert below fails
  // anyway, and it fails with its own message rather than this one.
  if (error) console.warn(`Could not ensure the recipes row for ${key}: ${error.message}`);
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

  // A null config is not a disabled recipe, it is a recipe with no row - and
  // `post_drafts.recipe_key` is a foreign key onto that row, so the insert
  // below would fail after the copy had already been written and paid for.
  // The cron path has the registry to hand, so it fills the row from that.
  if (!config) await ensureRecipeRow(key, recipe.name, recipe.cadence, recipe.visualTemplate);

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

  // A null config is not a disabled recipe, it is a recipe with no row -
  // and `post_drafts.recipe_key` is a foreign key onto that row, so the
  // insert below would fail after the copy had already been paid for.
  if (!config) await ensureRecipeRow(key, "Grail Sale", "on_demand", "grail_sale_card");

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

/**
 * Swap a photograph on a draft that has already been written.
 *
 * Every post type draws its pictures from Kickio's catalogue, and most of the
 * time that is right. Sometimes it is not: the only shot of a 1986 shirt is a
 * crooked phone photo on a carpet, a grid tile is a cutout with the sleeve
 * missing, a shirt has no photograph at all. Until now the only remedy was to
 * reject the draft and hope the next run picked a different listing, which for
 * a shirt with one photograph it never would.
 *
 * It lives here rather than on the five builder forms because the builders do
 * not cover the field. Most drafts are written by cron - price trends, most
 * wanted, legend shelf, sold this week - and have no form at all. The queue is
 * the one place every post type passes through, and it is also the place where
 * the problem becomes visible, because the rendered card is right there.
 *
 * The images are re-read here rather than taken from the caller, so a stale
 * browser tab cannot post back a list that undoes something else's change.
 * `index` out of range is refused rather than appended: a replace that quietly
 * becomes an add is how a six-tile grid ends up with seven.
 */
export async function setDraftPhoto(
  id: string,
  url: string,
  index: number | "append",
): Promise<string[]> {
  const { data, error } = await engine()
    .from("post_drafts")
    .select("source_data")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(`Loading draft failed: ${error.message}`);
  if (!data) throw new Error("Draft not found");

  const sourceData = ((data as { source_data: Record<string, unknown> }).source_data ??
    {}) as Record<string, unknown>;
  const next = nextImages(imagesOf(sourceData), url, index);

  const { error: updateError } = await engine()
    .from("post_drafts")
    .update({ source_data: { ...sourceData, images: next } })
    .eq("id", id);
  if (updateError) throw new Error(`Saving the photo failed: ${updateError.message}`);

  return next;
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

  // A null config is not a disabled recipe, it is a recipe with no row -
  // and `post_drafts.recipe_key` is a foreign key onto that row, so the
  // insert below would fail after the copy had already been paid for.
  if (!config) await ensureRecipeRow(key, "Kickio Drops", "on_demand", "drop_card");

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

  // A null config is not a disabled recipe, it is a recipe with no row -
  // and `post_drafts.recipe_key` is a foreign key onto that row, so the
  // insert below would fail after the copy had already been paid for.
  if (!config) await ensureRecipeRow(key, "Price History", "on_demand", "price_history_card");

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

/**
 * Who Am I?: admin-chosen from the list of careers the shelf can currently
 * carry. Same shape as Price History - the engine says who is possible, a
 * person decides who is interesting.
 */
export async function createWhoAmIDraft(playerKey: string): Promise<RunOutcome> {
  const key = WHO_AM_I_KEY;
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

  // A null config is not a disabled recipe, it is a recipe with no row -
  // and `post_drafts.recipe_key` is a foreign key onto that row, so the
  // insert below would fail after the copy had already been paid for.
  if (!config) await ensureRecipeRow(key, "Who Am I?", "on_demand", "who_am_i_card");

  if (config && !config.enabled) {
    await record("skipped", { skipped_reason: "Recipe is disabled" });
    return { recipeKey: key, status: "skipped", reason: "Recipe is disabled" };
  }

  const result = await runWhoAmI(playerKey);
  if (!result.ok) {
    await record("skipped", { skipped_reason: result.reason, diagnostics: result.diagnostics ?? {} });
    return { recipeKey: key, status: "skipped", reason: result.reason };
  }

  const { candidate } = result;
  const platforms = (config?.platforms as Recipe["platforms"] | undefined) ?? ["x", "instagram"];

  let generated;
  try {
    generated = await generateCopy(config?.prompt_template?.trim() || WHO_AM_I_BRIEF, candidate);
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
        visual_template: "who_am_i_card",
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


/**
 * Battle of the Shirts, from two product ids an admin chose.
 *
 * Same shape as the other on-demand creators. The one difference worth noting
 * is the platform default: this post is a question, and a question works
 * everywhere, so it goes to all three rather than the two the chart-shaped
 * posts started on.
 */
export async function createBattleDraft(leftId: string, rightId: string): Promise<RunOutcome> {
  const key = BATTLE_KEY;
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

  // A null config is not a disabled recipe, it is a recipe with no row -
  // and `post_drafts.recipe_key` is a foreign key onto that row, so the
  // insert below would fail after the copy had already been paid for.
  if (!config) await ensureRecipeRow(key, "Battle of the Shirts", "on_demand", "battle_card");

  if (config && !config.enabled) {
    await record("skipped", { skipped_reason: "Recipe is disabled" });
    return { recipeKey: key, status: "skipped", reason: "Recipe is disabled" };
  }

  const result = await runBattle(leftId, rightId);
  if (!result.ok) {
    // Straight back to the picker as well as into the run log. Every refusal
    // this recipe makes names the shirt at fault, so the person can swap that
    // one rather than start again.
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
    generated = await generateCopy(config?.prompt_template?.trim() || BATTLE_BRIEF, candidate);
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
        visual_template: "battle_card",
        style: asCardStyle((config?.selection as Record<string, unknown>)?.style ?? "spotlight"),
      },
    })
    .select("id")
    .single();

  if (error) {
    if (isDuplicateSubject(error)) {
      // The subject key is the two ids sorted, so this fires on a rematch in
      // either order - which is the point: the same two shirts again is the
      // same post again.
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
 * Kickio Classics, from a shirt an admin chose and a photograph they supplied.
 *
 * The photograph is an input rather than something the engine finds, and the
 * reason is in classics.ts: archive match photography is licensed, and
 * publishing it to sell a shirt without that licence is infringement. The
 * admin brings the image and the credit; the engine does the rest.
 */
export async function createClassicDraft(input: ClassicInput): Promise<RunOutcome> {
  const key = CLASSICS_KEY;
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

  // A null config is not a disabled recipe, it is a recipe with no row -
  // and `post_drafts.recipe_key` is a foreign key onto that row, so the
  // insert below would fail after the copy had already been paid for.
  if (!config) await ensureRecipeRow(key, "Kickio Classics", "on_demand", "classic_card");

  if (config && !config.enabled) {
    await record("skipped", { skipped_reason: "Recipe is disabled" });
    return { recipeKey: key, status: "skipped", reason: "Recipe is disabled" };
  }

  const result = await runClassics(input);
  if (!result.ok) {
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
    generated = await generateCopy(config?.prompt_template?.trim() || CLASSICS_BRIEF, candidate);
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
        visual_template: "classic_card",
        style: asCardStyle((config?.selection as Record<string, unknown>)?.style ?? "spotlight"),
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


/**
 * PhotoProd: the Classics card with no shelf in front of it.
 *
 * Shares `classic_card` with Kickio Classics on purpose - it is the same post
 * shape, and a second template that drew the same thing would drift from it.
 * What differs is the selection (a pasted link rather than a filtered list) and
 * the label on the card, which comes off `source_data.card_label`.
 */
export async function createPhotoProdDraft(input: PhotoProdInput): Promise<RunOutcome> {
  const key = PHOTO_PROD_KEY;
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

  // A null config is not a disabled recipe, it is a recipe with no row -
  // and `post_drafts.recipe_key` is a foreign key onto that row, so the
  // insert below would fail after the copy had already been paid for.
  if (!config) await ensureRecipeRow(key, "PhotoProd", "on_demand", "classic_card");

  if (config && !config.enabled) {
    await record("skipped", { skipped_reason: "Recipe is disabled" });
    return { recipeKey: key, status: "skipped", reason: "Recipe is disabled" };
  }

  const result = await runPhotoProd(input);
  if (!result.ok) {
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
    generated = await generateCopy(config?.prompt_template?.trim() || PHOTO_PROD_BRIEF, candidate);
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
        visual_template: "classic_card",
        style: asCardStyle((config?.selection as Record<string, unknown>)?.style ?? "spotlight"),
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
