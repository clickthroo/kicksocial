/**
 * A draft's card as a PNG, in one place.
 *
 * The render route serves this to the browser; the X publisher needs the same
 * bytes to upload. Shared rather than written twice, because the two would
 * drift and the thing that went out would stop being the thing that was
 * previewed - which is the one guarantee the review queue exists to give.
 */
import { ImageResponse } from "next/og";
import { templateFor, FORMATS, type FormatKey } from "./templates.tsx";
import { withRenderablePhotos } from "./photos.ts";
import { loadBrand } from "../brand/settings.ts";
import type { CardStyle } from "./styles.ts";
import type { PostDraft } from "../engine/types.ts";

export async function renderDraft(
  draft: PostDraft,
  format: FormatKey,
  style?: CardStyle,
  headers?: Record<string, string>,
): Promise<ImageResponse> {
  const brand = await loadBrand();
  // WebP is converted here rather than refused at selection time. Satori draws
  // it as an empty frame with no error, and refusing it removed nearly a third
  // of Kickio's live listings from every photo-led recipe.
  const withPhotos: PostDraft = {
    ...draft,
    source_data: await withRenderablePhotos(draft.source_data ?? {}),
  };
  return new ImageResponse(templateFor(withPhotos, format, { style, brand }), {
    ...FORMATS[format],
    ...(headers ? { headers } : {}),
  });
}

/** The same card as bytes, for anything that has to upload it rather than serve it. */
export async function renderDraftPng(draft: PostDraft, format: FormatKey): Promise<Blob> {
  const response = await renderDraft(draft, format);
  return response.blob();
}
