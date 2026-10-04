/**
 * Photographs a person uploads, kept in the engine's own storage.
 *
 * Kickio Classics asks an admin for an archive photograph, and until now the
 * only way to give it one was a direct link to an image file. On a desktop
 * that is a right-click away. On a phone it is close to impossible: the
 * picture is in the camera roll or saved from a licensing site, and iOS has
 * no way to turn a file on the device into a public URL. The post was
 * effectively desk-only, which is the opposite of how it gets used.
 *
 * So the file is uploaded instead, and this is where it lands: a bucket in the
 * CONTENT ENGINE's Supabase project. Never Kickio's - that database is
 * read-only from here, storage included, and engine state belongs in the
 * engine's own project.
 *
 * WHY THE BUCKET IS PUBLIC
 *
 * A draft stores a URL, and that URL is fetched by three things that hold no
 * credential of ours: the card renderer, the preview in the queue, and
 * eventually the social platform the asset is posted to. A signed URL expires
 * and would leave old drafts rendering blank; a private bucket would need a
 * proxy route for every one of those readers. The paths are random, so a URL
 * cannot be guessed, and the image is one somebody is about to publish
 * deliberately.
 *
 * WHY EVERYTHING IS RE-ENCODED
 *
 * Whatever arrives is normalised to JPEG before it is stored, for two reasons
 * that have both already cost a card. Satori draws WebP as an empty frame and
 * raises no error, so an unconverted upload renders a post with nothing on it.
 * And a phone photograph carries EXIF: an orientation flag that decides which
 * way up the picture is, and often the GPS coordinates of wherever it was
 * taken. `sharp().rotate()` bakes the orientation in, and the re-encode drops
 * the rest of the metadata, which is the right thing to do to a file that is
 * about to be published.
 */
import sharp from "sharp";
import { engine } from "./client.ts";

/** Where uploads live. Created on first use rather than by hand. */
export const PHOTO_BUCKET = "post-photos";

/**
 * The longest edge of a stored photograph.
 *
 * The widest card is 1200px and the tallest 1350px, so 2400 is twice what any
 * card can use. Beyond that is a bigger file to fetch on every render for
 * detail that is thrown away in the draw.
 */
export const MAX_EDGE = 2400;

/** Refused outright. Comfortably above a phone photo, below a stalled upload. */
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;

export interface StoredPhoto {
  url: string;
  bytes: number;
  width: number;
  height: number;
}

/**
 * Make sure the bucket is there.
 *
 * Creating it in code rather than in a migration because it is storage rather
 * than schema, and because a deployment that has never uploaded anything
 * should not need somebody to remember a manual step first. A bucket that
 * already exists comes back as an error naming it, which is not a failure.
 */
async function ensureBucket(): Promise<void> {
  const store = engine().storage;
  const { data } = await store.getBucket(PHOTO_BUCKET);
  if (data) return;

  const { error } = await store.createBucket(PHOTO_BUCKET, {
    public: true,
    fileSizeLimit: MAX_UPLOAD_BYTES,
    allowedMimeTypes: ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"],
  });
  // A race between two uploads is not an error worth failing an upload over.
  if (error && !/exists/i.test(error.message)) {
    throw new Error(`Could not create the photo bucket: ${error.message}`);
  }
}

/**
 * A name that cannot collide and cannot be guessed.
 *
 * The prefix is the recipe, so the bucket stays readable to a person looking
 * at it, and the rest is random: the bucket is public, and a public object
 * whose name can be worked out from the draft is a public object anybody can
 * find.
 */
export function photoPath(prefix: string, now = new Date(), id = crypto.randomUUID()): string {
  // Collapsed and trimmed, not just substituted: a prefix of "!!!" would
  // otherwise become a folder called "---", which is a folder nobody can read
  // and one the next person would assume was a bug.
  const safe =
    prefix
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "photo";
  const month = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  return `${safe}/${month}/${id}.jpg`;
}

/**
 * Store an uploaded image and hand back the URL a draft can keep.
 *
 * Throws with something a person can act on. An upload is a thing somebody is
 * watching happen, so "that did not work" is not an acceptable answer.
 */
export async function storePhoto(
  input: ArrayBuffer | Buffer | Uint8Array,
  prefix = "photo",
): Promise<StoredPhoto> {
  const buffer = Buffer.isBuffer(input) ? input : Buffer.from(input as ArrayBuffer);
  if (buffer.byteLength === 0) throw new Error("That file was empty.");
  if (buffer.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error(
      `That file is ${Math.round(buffer.byteLength / 1024 / 1024)}MB, over the ` +
        `${MAX_UPLOAD_BYTES / 1024 / 1024}MB limit.`,
    );
  }

  let jpeg: Buffer;
  let width = 0;
  let height = 0;
  try {
    const pipeline = sharp(buffer)
      // Applies the EXIF orientation flag and then drops it, so the picture is
      // the right way up everywhere rather than only in viewers that read EXIF.
      .rotate()
      .resize({ width: MAX_EDGE, height: MAX_EDGE, fit: "inside", withoutEnlargement: true })
      .jpeg({ quality: 88, mozjpeg: true });
    const { data, info } = await pipeline.toBuffer({ resolveWithObject: true });
    jpeg = data;
    width = info.width;
    height = info.height;
  } catch {
    // Overwhelmingly this is a HEIC straight off an iPhone, which sharp's
    // prebuilt binaries cannot open. The browser converts before uploading for
    // exactly that reason, so reaching here means the conversion was skipped.
    throw new Error(
      "That image could not be read. If it came from an iPhone it may be a HEIC - " +
        "open it, share it as a JPEG, and upload that.",
    );
  }

  await ensureBucket();

  const path = photoPath(prefix);
  const { error } = await engine()
    .storage.from(PHOTO_BUCKET)
    .upload(path, jpeg, { contentType: "image/jpeg", upsert: false });
  if (error) throw new Error(`The upload failed: ${error.message}`);

  const { data } = engine().storage.from(PHOTO_BUCKET).getPublicUrl(path);
  if (!data?.publicUrl) throw new Error("The upload succeeded but produced no URL.");

  return { url: data.publicUrl, bytes: jpeg.byteLength, width, height };
}
