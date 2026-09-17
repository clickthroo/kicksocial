import { ImageResponse } from "next/og";
import { engine } from "@/lib/engine/client.ts";
import { templateFor, FORMATS, type FormatKey } from "@/lib/render/templates.tsx";
import { asCardStyle } from "@/lib/render/styles.ts";
import type { PostDraft } from "@/lib/engine/types.ts";

export const dynamic = "force-dynamic";

/**
 * Renders a draft's visual as a PNG. `?format=ig` (1080x1350) or `x` (1200x675).
 * The dashboard previews this; approving and downloading gives the asset to post.
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;
  const query = new URL(request.url).searchParams;
  const format: FormatKey = query.get("format") === "x" ? "x" : "ig";
  // `?style=` previews a look without committing it to the draft, so the picker
  // can show every option before anyone saves one.
  const style = query.has("style") ? asCardStyle(query.get("style")) : undefined;

  const { data, error } = await engine().from("post_drafts").select("*").eq("id", id).maybeSingle();

  if (error) return new Response(`Lookup failed: ${error.message}`, { status: 500 });
  if (!data) return new Response("Draft not found", { status: 404 });

  return new ImageResponse(templateFor(data as PostDraft, format, style), {
    ...FORMATS[format],
    headers: { "cache-control": "public, max-age=60" },
  });
}
