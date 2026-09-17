"use server";

import { revalidatePath } from "next/cache";
import sharp from "sharp";
import {
  saveBrandColours,
  saveBrandMark,
  type BrandColours,
} from "@/lib/brand/settings.ts";

/** Formats Satori can decode. SVG is unreliable and WebP renders as nothing. */
const ACCEPTED = new Set(["image/png", "image/jpeg"]);
/** Before processing. The uploaded file never reaches the database as-is. */
const MAX_UPLOAD_BYTES = 6 * 1024 * 1024;
/** Every card carries the logo, so it is normalised to something small. */
const MARK_SIZE = 512;

function revalidateEverything(): void {
  revalidatePath("/admin");
  revalidatePath("/");
  revalidatePath("/publish");
}

/**
 * Take an uploaded logo, normalise it, and store it inlined.
 *
 * Re-encoded rather than stored as uploaded: the file decides the cost of every
 * render from here on, and "someone uploaded a 4MB print asset" should not be a
 * way to make each card slow.
 */
export async function uploadBrandMark(form: FormData): Promise<{ bytes: number }> {
  const file = form.get("mark");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose an image first.");

  if (!ACCEPTED.has(file.type)) {
    throw new Error(
      `${file.type || "That file"} cannot be used. PNG or JPEG only — the card ` +
        "renderer decodes neither SVG reliably nor WebP at all, and would draw an empty box.",
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`That file is ${Math.round(file.size / 1024 / 1024)}MB. The limit is 6MB.`);
  }

  const input = Buffer.from(await file.arrayBuffer());
  let png: Buffer;
  try {
    png = await sharp(input)
      // `contain` on a transparent background: a logo is a shape, and cropping
      // it to a square would cut a wordmark in half.
      .resize(MARK_SIZE, MARK_SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toBuffer();
  } catch {
    throw new Error("That image could not be read. Try re-saving it as a PNG.");
  }

  const dataUri = `data:image/png;base64,${png.toString("base64")}`;
  await saveBrandMark(dataUri, file.name);
  revalidateEverything();
  return { bytes: png.length };
}

export async function removeBrandMark(): Promise<void> {
  await saveBrandMark(null, null);
  revalidateEverything();
}

export async function updateBrandColours(colours: BrandColours): Promise<void> {
  await saveBrandColours(colours);
  revalidateEverything();
}
