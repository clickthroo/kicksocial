import { storePhoto, MAX_UPLOAD_BYTES } from "@/lib/engine/photo-store.ts";

export const dynamic = "force-dynamic";
// Re-encoding a 24-megapixel photograph is not instant, and the default cuts
// it off mid-write.
export const maxDuration = 60;

/**
 * Take a photograph off somebody's phone and give back a URL a draft can hold.
 *
 * A route handler rather than a server action, for one reason: a server action
 * body is capped at 1MB by default and a photograph is not. This has the
 * platform's own request limit and nothing tighter.
 *
 * Not in the middleware's open list, so it is behind the same login as every
 * page. That matters more here than on a page: this writes to storage, and an
 * open upload endpoint is somebody else's image host.
 */
export async function POST(request: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return Response.json({ error: "That upload did not arrive in one piece." }, { status: 400 });
  }

  const file = form.get("file");
  if (!(file instanceof File)) {
    return Response.json({ error: "No file was attached." }, { status: 400 });
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    return Response.json(
      { error: `That file is over the ${MAX_UPLOAD_BYTES / 1024 / 1024}MB limit.` },
      { status: 413 },
    );
  }

  const prefix = typeof form.get("prefix") === "string" ? String(form.get("prefix")) : "photo";

  try {
    const stored = await storePhoto(await file.arrayBuffer(), prefix);
    return Response.json(stored);
  } catch (err) {
    // The message is written to be read by the person who just chose the file,
    // so it is passed through rather than replaced with a status code.
    return Response.json({ error: (err as Error).message }, { status: 500 });
  }
}
