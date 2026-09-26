"use server";

import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { knockoutBorder, describeKnockout } from "@/lib/brand/knockout.ts";
import {
  saveBrandColours,
  saveBrandMark,
  loadBrand,
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
export async function uploadBrandMark(
  form: FormData,
): Promise<{ bytes: number; note: string }> {
  const file = form.get("mark");
  if (!(file instanceof File) || file.size === 0) throw new Error("Choose an image first.");

  if (!ACCEPTED.has(file.type)) {
    throw new Error(
      `${file.type || "That file"} cannot be used. PNG or JPEG only. The card ` +
        "renderer decodes neither SVG reliably nor WebP at all, and would draw an empty box.",
    );
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error(`That file is ${Math.round(file.size / 1024 / 1024)}MB. The limit is 6MB.`);
  }

  const input = Buffer.from(await file.arrayBuffer());
  const knockout = form.get("knockout") !== "off";

  let png: Buffer;
  let note = "Left as uploaded.";
  try {
    // Knock the background out BEFORE the square resize. `fit: contain` pads
    // with transparency, which would make the corners transparent and stop the
    // detector finding the flat colour it is looking for - the white square
    // would survive in the middle of a transparent frame.
    //
    // Capped at 1024 first so the flood fill is bounded: a 4000px upload is
    // sixteen million pixels to walk, and this runs in a request.
    const bounded = await sharp(input)
      .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
      // JPEGs have no alpha channel to clear.
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    if (knockout) {
      const result = knockoutBorder(
        bounded.data,
        bounded.info.width,
        bounded.info.height,
      );
      note = describeKnockout(result, bounded.info.width * bounded.info.height);
    }

    png = await sharp(bounded.data, {
      raw: { width: bounded.info.width, height: bounded.info.height, channels: 4 },
    })
      // `contain` on transparent: a logo is a shape, and cropping it to a
      // square would cut a wordmark in half.
      .resize(MARK_SIZE, MARK_SIZE, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png({ compressionLevel: 9 })
      .toBuffer();
  } catch {
    throw new Error("That image could not be read. Try re-saving it as a PNG.");
  }

  const dataUri = `data:image/png;base64,${png.toString("base64")}`;
  await saveBrandMark(dataUri, file.name);
  revalidateEverything();
  return { bytes: png.length, note };
}

export async function removeBrandMark(): Promise<void> {
  await saveBrandMark(null, null);
  revalidateEverything();
}

export async function updateBrandColours(colours: BrandColours): Promise<void> {
  await saveBrandColours(colours);
  revalidateEverything();
}

/** Read the stored mark back, so the preview shows what was processed. */
export async function currentBrandMark(): Promise<string | null> {
  const brand = await loadBrand();
  return brand.markDataUri;
}
