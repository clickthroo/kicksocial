/**
 * Getting a photograph out of a phone and into a draft.
 *
 * Runs in the browser, before the upload, and does the two jobs that cannot be
 * done anywhere else.
 *
 * FORMAT. An iPhone photograph is a HEIC, and nothing downstream reads one:
 * sharp's prebuilt binaries cannot open it, Satori certainly cannot, and
 * neither can most of the places a card ends up. Safari CAN decode it, because
 * the system decoder is sitting right there, so the conversion to JPEG happens
 * on the device that already knows how. The server re-encodes again and would
 * reject a HEIC that slipped through, but by then the person has waited for a
 * 4MB upload to find out.
 *
 * SIZE. A recent phone camera produces 24 megapixels and 5MB or more. The
 * largest card is 1200x1350, so all but a fraction of that is thrown away in
 * the draw. Downscaling first turns a slow upload on a train into a fast one.
 *
 * It fails soft, deliberately: anything unexpected sends the original file and
 * lets the server deal with it. A conversion that cannot happen is a reason to
 * try the upload anyway, not a reason to refuse the photograph.
 */

/** Matches the server. The longest edge of what gets sent. */
export const CLIENT_MAX_EDGE = 2400;

/** Enough for an archive scan, small enough to post from a phone. */
export const JPEG_QUALITY = 0.88;

export interface UploadedPhoto {
  url: string;
  bytes: number;
  width: number;
  height: number;
}

/**
 * The size to draw at: the same shape, with the longest edge capped.
 *
 * Never enlarges. A small image scaled up to the cap would be a bigger file
 * carrying no more detail, and the card would blur it either way.
 */
export function fitWithin(
  width: number,
  height: number,
  edge = CLIENT_MAX_EDGE,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 0, height: 0 };
  const longest = Math.max(width, height);
  if (longest <= edge) return { width: Math.round(width), height: Math.round(height) };
  const scale = edge / longest;
  return { width: Math.max(1, Math.round(width * scale)), height: Math.max(1, Math.round(height * scale)) };
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement | null> {
  try {
    // Safari routes this through the system decoder, which is what makes a
    // HEIC off the camera roll work at all.
    return await createImageBitmap(file);
  } catch {
    // Older browsers, and the odd format createImageBitmap refuses but an
    // <img> will still show.
    const url = URL.createObjectURL(file);
    try {
      return await new Promise<HTMLImageElement>((resolve, reject) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => reject(new Error("decode failed"));
        img.src = url;
      });
    } catch {
      return null;
    } finally {
      // Revoked on the next frame: revoking it before the draw would pull the
      // source out from under the canvas.
      setTimeout(() => URL.revokeObjectURL(url), 0);
    }
  }
}

/**
 * A JPEG small enough to upload, or the original file if that cannot be done.
 */
export async function toUploadableJpeg(file: File): Promise<Blob> {
  const source = await decode(file);
  if (!source) return file;

  const width = "width" in source ? source.width : 0;
  const height = "height" in source ? source.height : 0;
  const size = fitWithin(width, height);
  if (size.width === 0 || size.height === 0) return file;

  try {
    const canvas = document.createElement("canvas");
    canvas.width = size.width;
    canvas.height = size.height;
    const context = canvas.getContext("2d");
    if (!context) return file;
    // White underneath: a transparent PNG flattened onto a JPEG's default
    // black would come out as a photograph with a black background.
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, size.width, size.height);
    context.drawImage(source as CanvasImageSource, 0, 0, size.width, size.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", JPEG_QUALITY),
    );
    return blob ?? file;
  } catch {
    return file;
  } finally {
    if ("close" in source && typeof source.close === "function") source.close();
  }
}

/**
 * Convert, upload, and hand back the URL the draft will keep.
 *
 * Errors carry the server's own wording. The person is standing there watching
 * a spinner, and "upload failed" tells them nothing they can act on.
 */
export async function uploadPhoto(file: File, prefix: string): Promise<UploadedPhoto> {
  const blob = await toUploadableJpeg(file);
  const body = new FormData();
  // The name matters only in logs, but a name is better than "blob".
  body.append("file", blob, file.name.replace(/\.[^.]+$/, "") + ".jpg");
  body.append("prefix", prefix);

  const response = await fetch("/api/photo", { method: "POST", body });
  const result = (await response.json().catch(() => null)) as
    | (UploadedPhoto & { error?: string })
    | null;

  if (!response.ok || !result || result.error || !result.url) {
    throw new Error(result?.error ?? `The upload failed (${response.status}).`);
  }
  return result;
}
