/**
 * Changing the pictures on a draft that has already been written.
 *
 * The rule is small enough to look obvious and consequential enough to be
 * worth having on its own: a replace must replace, and must never quietly
 * become an append. Who Am I draws a 3x2 grid and Featured Collection a 3x3,
 * and both read `images` by position - so an off-by-one that appends instead
 * of swapping gives a six-tile grid a seventh image, which the template either
 * drops silently or draws into a layout built for six.
 */

/** Pull the image list off a draft's source data, ignoring anything that is not a URL. */
export function imagesOf(sourceData: Record<string, unknown> | null | undefined): string[] {
  const images = sourceData?.images;
  if (!Array.isArray(images)) return [];
  return images.filter((u): u is string => typeof u === "string");
}

/**
 * The list after putting `url` at `index`, or on the end.
 *
 * Throws on an index that is not there, rather than growing the list to fit.
 */
export function nextImages(
  images: readonly string[],
  url: string,
  index: number | "append",
): string[] {
  if (index === "append") return [...images, url];
  if (!Number.isInteger(index) || index < 0 || index >= images.length) {
    throw new Error(`There is no photo ${Number(index) + 1} on this draft to replace.`);
  }
  return images.map((existing, i) => (i === index ? url : existing));
}
