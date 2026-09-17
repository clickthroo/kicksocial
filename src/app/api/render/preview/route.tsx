import { ImageResponse } from "next/og";
import { templateFor, FORMATS, type FormatKey } from "@/lib/render/templates.tsx";
import { SAMPLE_DRAFTS } from "@/lib/render/sample.ts";
import { asCardStyle } from "@/lib/render/styles.ts";
import { loadBrand } from "@/lib/brand/settings.ts";

export const dynamic = "force-dynamic";

/**
 * Renders a template against sample data - no database needed. Use it to iterate
 * on a template's design: /api/render/preview?template=trend_chart&format=x
 */
export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const template = params.get("template") ?? "grail_card";
  const format: FormatKey = params.get("format") === "x" ? "x" : "ig";
  const style = params.has("style") ? asCardStyle(params.get("style")) : undefined;

  const draft = SAMPLE_DRAFTS[template];
  if (!draft) {
    return new Response(`Unknown template. Try: ${Object.keys(SAMPLE_DRAFTS).join(", ")}`, {
      status: 404,
    });
  }

  const brand = await loadBrand();
  return new ImageResponse(templateFor(draft, format, { style, brand }), FORMATS[format]);
}
