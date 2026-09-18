import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  isListed,
  summariseSet,
  qualifies,
  subjectRefFor,
  parseSubjectRef,
  progressVerdict,
  newlyListed,
  DEFAULT_FEATURED_COLLECTION_CONFIG as CONFIG,
  type CollectionSummary,
  type PriorPost,
} from "./featured-collection.ts";

const set = {
  id: "set-1",
  slug: "kickio-grail-list",
  name: "Kickio Grail List",
  description: "The shirts every collector wants",
  kind: "curated",
  visibility: "public",
};

const product = (over: Partial<Record<string, unknown>> = {}) => ({
  id: "p-1",
  slug: "1988-90-netherlands-home-shirt",
  name: "1988-90 Netherlands Home Shirt",
  team: "Netherlands",
  season: "1988-89",
  status: "active",
  deleted_at: null,
  primary_image_url: "https://img.example/nl.jpg",
  ...over,
}) as never;

/**
 * One slot and, unless `product` is null, the shirt it points at.
 *
 * The two travel together in the fixtures because they travel together in the
 * recipe: the slot row is always readable, the product may not be.
 */
const slot = (
  sort: number,
  over: { label?: string; productId?: string | null; product?: Record<string, unknown> | null } = {},
) => {
  const productId = over.productId === undefined ? `p-${sort}` : over.productId;
  const row = {
    set_id: "set-1",
    sort,
    label: over.label ?? `Slot ${sort}`,
    product_id: productId,
  } as never;
  const shirt =
    productId === null || over.product === null
      ? null
      : (product({
          id: productId,
          primary_image_url: `https://img.example/${sort}.jpg`,
          ...(over.product ?? {}),
        }) as unknown as Record<string, unknown>);
  return { row, productId, shirt };
};

const build = (parts: ReturnType<typeof slot>[]) => ({
  slots: parts.map((p) => p.row),
  products: new Map(
    parts
      .filter((p) => p.productId !== null && p.shirt !== null)
      .map((p) => [p.productId as string, p.shirt as never]),
  ),
});

const summarise = (parts: ReturnType<typeof slot>[]) => {
  const { slots, products } = build(parts);
  return summariseSet(set, slots, products);
};

/** n listed slots, then m empty ones. */
const list = (listed: number, empty: number) => [
  ...Array.from({ length: listed }, (_, i) => slot(i + 1)),
  ...Array.from({ length: empty }, (_, i) => slot(listed + i + 1, { productId: null })),
];

describe("what counts as listed", () => {
  test("an active, undeleted, photographed shirt is listed", () => {
    assert.equal(isListed(product()), true);
  });

  test("pending and archived shirts are not", () => {
    // Kickio's `products_read` policy returns any row that is not soft-deleted,
    // whatever its status, so the join hands back all 77 matched slots. Twelve
    // of them are pending or archived. Counting those as listed would put
    // twelve dead links in a post inviting people to go and buy them.
    assert.equal(isListed(product({ status: "pending" })), false);
    assert.equal(isListed(product({ status: "archived" })), false);
  });

  test("status is an allowlist, so an unknown status is not listed", () => {
    assert.equal(isListed(product({ status: "under_review" })), false);
    assert.equal(isListed(product({ status: null })), false);
  });

  test("a soft-deleted shirt is not, even if still marked active", () => {
    assert.equal(isListed(product({ deleted_at: "2026-01-01T00:00:00Z" })), false);
  });

  test("a shirt with no renderable photo is not - the card cannot show it", () => {
    assert.equal(isListed(product({ primary_image_url: null })), false);
    assert.equal(isListed(product({ primary_image_url: "https://img.example/a.webp" })), false);
  });

  test("a missing product is not", () => {
    assert.equal(isListed(null), false);
  });
});

describe("summarising a set", () => {
  test("separates listed, missing and stale rather than lumping them together", () => {
    const summary = summarise([
      slot(1),
      slot(2),
      slot(3, { product: { status: "pending" } }),
      slot(4, { productId: null }),
      slot(5, { product: { primary_image_url: null } }),
    ])!;

    assert.equal(summary.slots, 5);
    assert.equal(summary.listed, 2);
    assert.equal(summary.missing, 1);
    // Pending shirt plus photoless shirt: matched, but not buyable.
    assert.equal(summary.stale, 2);
    // The three numbers the post can quote account for every slot.
    assert.equal(summary.listed + summary.missing + summary.stale, summary.slots);
  });

  test("an unfilled slot is told apart from an invisible product by the slot row", () => {
    // `product_id` lives on the slot, which is readable, so a slot the curator
    // has not filled never gets confused with one whose product RLS withheld.
    const summary = summarise([slot(1, { productId: null }), slot(2, { product: null })])!;
    assert.equal(summary.missing, 1);
    assert.equal(summary.stale, 1);
  });

  test("keeps the curator's order, so the hunt list leads with the top grails", () => {
    const summary = summarise([
      slot(3, { label: "Third" }),
      slot(1, { label: "First", productId: null }),
      slot(2, { label: "Second", productId: null }),
    ])!;
    assert.deepEqual(summary.hunting, ["First", "Second"]);
    assert.deepEqual(summary.featured.map((f) => f.label), ["Third"]);
  });

  test("does not repeat one photo in the grid", () => {
    const summary = summarise([
      slot(1, { product: { primary_image_url: "https://img.example/same.jpg" } }),
      slot(2, { product: { primary_image_url: "https://img.example/same.jpg" } }),
    ])!;
    assert.equal(summary.listed, 2);
    assert.equal(summary.photos.length, 1);
  });

  test("refuses a set with no slug", () => {
    assert.equal(summariseSet({ ...set, slug: null }, [], new Map()), null);
  });
});

describe("qualifying", () => {
  const summary = () => summarise(list(20, 40))!;

  test("a real list passes", () => {
    assert.equal(qualifies(summary(), CONFIG).ok, true);
  });

  test("a short list is not a list", () => {
    const s = summarise(list(14, 2))!;
    assert.equal(qualifies(s, CONFIG).ok, false);
  });

  test("a list with almost nothing buyable is refused", () => {
    // 136 slots and 3 listed is a fine page and a bad post: there is nothing
    // for the reader to do.
    const s = summarise(list(3, 130))!;
    const verdict = qualifies(s, CONFIG);
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason!, /3 of 133/);
  });

  test("too few photos for the grid is refused", () => {
    const s: CollectionSummary = { ...summary(), photos: ["a", "b", "c"] };
    assert.equal(qualifies(s, CONFIG).ok, false);
  });
});

describe("subject refs", () => {
  test("carry both counts, so a list that has not moved dedupes against itself", () => {
    assert.equal(subjectRefFor("kickio-grail-list", 65, 136), "collection:kickio-grail-list@65/136");
  });

  test("case-folded, so one set cannot post twice under two spellings", () => {
    assert.equal(subjectRefFor("  Kickio-Grail-List ", 65, 136), "collection:kickio-grail-list@65/136");
  });

  test("round-trip", () => {
    assert.deepEqual(parseSubjectRef("collection:kickio-grail-list@65/136"), {
      slug: "kickio-grail-list",
      listed: 65,
      slots: 136,
    });
  });

  test("another recipe's ref does not parse", () => {
    assert.equal(parseSubjectRef("club:arsenal"), null);
    assert.equal(parseSubjectRef("collection:kickio-grail-list"), null);
  });
});

describe("the change rule", () => {
  const summary = (listed: number, slots: number) =>
    ({ listed, slots }) as CollectionSummary;
  const prior = (listed: number, slots: number, daysAgo: number): PriorPost => ({
    listed,
    slots,
    at: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
    labels: [],
  });

  test("a first post always goes", () => {
    const verdict = progressVerdict(summary(65, 136), null, CONFIG);
    assert.equal(verdict.ok, true);
    assert.equal(verdict.change, null);
  });

  test("an unchanged list does not post again", () => {
    const verdict = progressVerdict(summary(65, 136), prior(65, 136, 60), CONFIG);
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason!, /nothing new/);
  });

  test("a filled slot is news", () => {
    const verdict = progressVerdict(summary(66, 136), prior(65, 136, 60), CONFIG);
    assert.equal(verdict.ok, true);
    assert.deepEqual(verdict.change, { listed: 1, slots: 0 });
  });

  test("slots added to the list are news even when nothing new is listed", () => {
    const verdict = progressVerdict(summary(65, 146), prior(65, 136, 60), CONFIG);
    assert.equal(verdict.ok, true);
    assert.deepEqual(verdict.change, { listed: 0, slots: 10 });
  });

  test("a drop is not news - the list must never read as going backwards", () => {
    // A grail sells and its slot stops being listed. True, and "64 of 136"
    // after "65 of 136" is a worse post than no post.
    const verdict = progressVerdict(summary(64, 136), prior(65, 136, 60), CONFIG);
    assert.equal(verdict.ok, false);
  });

  test("the cooldown is a floor under the rule, not an alternative to it", () => {
    // Genuine progress, but three days after the last post. Both have to pass.
    const verdict = progressVerdict(summary(70, 136), prior(65, 136, 3), CONFIG);
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason!, /cooldown/);
  });
});

describe("naming what just landed", () => {
  const summary = (labels: string[]) =>
    ({ featured: labels.map((label) => ({ label })) }) as CollectionSummary;

  test("reports only labels that were not listed last time", () => {
    const prior: PriorPost = { listed: 2, slots: 10, at: "2026-01-01", labels: ["A", "B"] };
    assert.deepEqual(newlyListed(summary(["A", "B", "C"]), prior), ["C"]);
  });

  test("claims nothing on a first post", () => {
    assert.deepEqual(newlyListed(summary(["A"]), null), []);
  });

  test("claims nothing when the previous post recorded no labels", () => {
    // Drafts from before this field existed. Saying every shirt is new would
    // be a fabricated claim; saying nothing is merely a duller post.
    const prior: PriorPost = { listed: 2, slots: 10, at: "2026-01-01", labels: [] };
    assert.deepEqual(newlyListed(summary(["A", "B"]), prior), []);
  });
});
