import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  isCatalogued,
  isBuyable,
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

const product = (over: Record<string, unknown> = {}) =>
  ({
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
 * One slot, the shirt record it points at, and how many live listings that
 * shirt has. All three travel together because all three decide the count.
 */
const slot = (
  sort: number,
  over: {
    label?: string;
    productId?: string | null;
    product?: Record<string, unknown> | null;
    listings?: number;
  } = {},
) => {
  const productId = over.productId === undefined ? `p-${sort}` : over.productId;
  return {
    row: {
      set_id: "set-1",
      sort,
      label: over.label ?? `Slot ${sort}`,
      product_id: productId,
    } as never,
    productId,
    shirt:
      productId === null || over.product === null
        ? null
        : (product({
            id: productId,
            primary_image_url: `https://img.example/${sort}.jpg`,
            ...(over.product ?? {}),
          }) as unknown as Record<string, unknown>),
    listings: over.listings ?? 1,
  };
};

const summarise = (parts: ReturnType<typeof slot>[]) =>
  summariseSet(
    set,
    parts.map((p) => p.row),
    new Map(
      parts
        .filter((p) => p.productId !== null && p.shirt !== null)
        .map((p) => [p.productId as string, p.shirt as never]),
    ),
    new Map(
      parts
        .filter((p) => p.productId !== null)
        .map((p) => [p.productId as string, p.listings]),
    ),
  );

/** n buyable slots, then m empty ones. */
const list = (buyable: number, empty: number) => [
  ...Array.from({ length: buyable }, (_, i) => slot(i + 1)),
  ...Array.from({ length: empty }, (_, i) => slot(buyable + i + 1, { productId: null })),
];

describe("catalogue versus shelf", () => {
  test("a catalogue row with no listing is not buyable", () => {
    // `products` is Kickio's catalogue: a shirt record exists whether or not
    // anyone is selling one. 65 of the Grail List's slots are catalogue-active
    // and only 39 have something to buy. Counting the catalogue would put 26
    // dead ends in a post whose whole purpose is to send people to look.
    assert.equal(isCatalogued(product()), true);
    assert.equal(isBuyable(product(), 0), false);
    assert.equal(isBuyable(product(), 1), true);
  });

  test("pending and archived records are neither catalogued nor buyable", () => {
    for (const status of ["pending", "archived", "under_review", null]) {
      assert.equal(isCatalogued(product({ status })), false, String(status));
      assert.equal(isBuyable(product({ status }), 5), false, String(status));
    }
  });

  test("a soft-deleted record is not, even with live listings", () => {
    assert.equal(isBuyable(product({ deleted_at: "2026-01-01T00:00:00Z" }), 3), false);
  });

  test("a missing record is not", () => {
    assert.equal(isCatalogued(null), false);
    assert.equal(isBuyable(null, 9), false);
  });
});

describe("summarising a set", () => {
  test("splits the slots four ways, and they add up", () => {
    const summary = summarise([
      slot(1),
      slot(2),
      // On the catalogue, nobody selling one.
      slot(3, { listings: 0 }),
      // Pending record.
      slot(4, { product: { status: "pending" }, listings: 4 }),
      // Never filled.
      slot(5, { productId: null }),
    ])!;

    assert.equal(summary.slots, 5);
    assert.equal(summary.buyable, 2);
    assert.equal(summary.catalogued, 1);
    assert.equal(summary.unlisted, 1);
    assert.equal(summary.missing, 1);
    assert.equal(
      summary.buyable + summary.catalogued + summary.unlisted + summary.missing,
      summary.slots,
    );
  });

  test("a shirt with no renderable photo still counts as buyable", () => {
    // It is for sale; it just cannot go in the grid. Letting the photo filter
    // reach back and reduce the headline would understate what is on the shelf.
    const summary = summarise([
      slot(1),
      slot(2, { product: { primary_image_url: "https://img.example/a.svg" } }),
      slot(3, { product: { primary_image_url: null } }),
    ])!;
    assert.equal(summary.buyable, 3);
    assert.equal(summary.photos.length, 1);
  });

  test("an unfilled slot is told apart from a record the reader cannot see", () => {
    // `product_id` lives on the slot, which is always readable, so a slot the
    // curator never filled is never confused with one RLS withheld.
    const summary = summarise([slot(1, { productId: null }), slot(2, { product: null })])!;
    assert.equal(summary.missing, 1);
    assert.equal(summary.unlisted, 1);
  });

  test("keeps the curator's order, so the hunt list leads with the top grails", () => {
    const summary = summarise([
      slot(3, { label: "Third" }),
      slot(1, { label: "First", productId: null }),
      slot(2, { label: "Second", productId: null }),
    ])!;
    assert.deepEqual(summary.hunting, ["First", "Second"]);
    assert.deepEqual(
      summary.featured.map((f) => f.label),
      ["Third"],
    );
  });

  test("does not repeat one photo in the grid", () => {
    const summary = summarise([
      slot(1, { product: { primary_image_url: "https://img.example/same.jpg" } }),
      slot(2, { product: { primary_image_url: "https://img.example/same.jpg" } }),
    ])!;
    assert.equal(summary.buyable, 2);
    assert.equal(summary.photos.length, 1);
  });

  test("refuses a set with no slug", () => {
    assert.equal(summariseSet({ ...set, slug: null }, [], new Map(), new Map()), null);
  });
});

describe("qualifying", () => {
  const summary = () => summarise(list(20, 40))!;

  test("a real list passes", () => {
    assert.equal(qualifies(summary(), CONFIG).ok, true);
  });

  test("a short list is not a list", () => {
    assert.equal(qualifies(summarise(list(14, 2))!, CONFIG).ok, false);
  });

  test("a list with almost nothing buyable is refused", () => {
    // 136 slots and 3 buyable is a fine page and a bad post: there is nothing
    // for the reader to do.
    const verdict = qualifies(summarise(list(3, 130))!, CONFIG);
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason!, /3 of 133/);
  });

  test("a catalogue full of shirts nobody is selling does not qualify", () => {
    // The failure this recipe was rewritten for: 65 catalogue rows reads as a
    // healthy list and is not something a reader can act on.
    const parts = Array.from({ length: 40 }, (_, i) => slot(i + 1, { listings: 0 }));
    const s = summarise(parts)!;
    assert.equal(s.catalogued, 40);
    assert.equal(qualifies(s, CONFIG).ok, false);
  });

  test("too few photos for the grid is refused", () => {
    const s: CollectionSummary = { ...summary(), photos: ["a", "b", "c"] };
    assert.equal(qualifies(s, CONFIG).ok, false);
  });
});

describe("subject refs", () => {
  test("carry both counts, so a list that has not moved dedupes against itself", () => {
    assert.equal(subjectRefFor("kickio-grail-list", 39, 136), "collection:kickio-grail-list@39/136");
  });

  test("case-folded, so one set cannot post twice under two spellings", () => {
    assert.equal(
      subjectRefFor("  Kickio-Grail-List ", 39, 136),
      "collection:kickio-grail-list@39/136",
    );
  });

  test("round-trip", () => {
    assert.deepEqual(parseSubjectRef("collection:kickio-grail-list@39/136"), {
      slug: "kickio-grail-list",
      buyable: 39,
      slots: 136,
    });
  });

  test("another recipe's ref does not parse", () => {
    assert.equal(parseSubjectRef("club:arsenal"), null);
    assert.equal(parseSubjectRef("collection:kickio-grail-list"), null);
  });
});

describe("the change rule", () => {
  const summary = (buyable: number, slots: number) => ({ buyable, slots }) as CollectionSummary;
  const prior = (buyable: number, slots: number, daysAgo: number): PriorPost => ({
    buyable,
    slots,
    at: new Date(Date.now() - daysAgo * 86_400_000).toISOString(),
    labels: [],
  });

  test("a first post always goes", () => {
    const verdict = progressVerdict(summary(39, 136), null, CONFIG);
    assert.equal(verdict.ok, true);
    assert.equal(verdict.change, null);
  });

  test("an unchanged list does not post again", () => {
    const verdict = progressVerdict(summary(39, 136), prior(39, 136, 60), CONFIG);
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason!, /nothing new/);
  });

  test("a newly listed grail is news", () => {
    const verdict = progressVerdict(summary(40, 136), prior(39, 136, 60), CONFIG);
    assert.equal(verdict.ok, true);
    assert.deepEqual(verdict.change, { buyable: 1, slots: 0 });
  });

  test("slots added to the list are news even when nothing new is buyable", () => {
    const verdict = progressVerdict(summary(39, 146), prior(39, 136, 60), CONFIG);
    assert.equal(verdict.ok, true);
    assert.deepEqual(verdict.change, { buyable: 0, slots: 10 });
  });

  test("a drop is not news - the list must never read as going backwards", () => {
    // A grail sells and its slot stops being buyable. True, and "38 of 136"
    // after "39 of 136" is a worse post than no post.
    assert.equal(progressVerdict(summary(38, 136), prior(39, 136, 60), CONFIG).ok, false);
  });

  test("the cooldown is a floor under the rule, not an alternative to it", () => {
    // Genuine progress, but three days after the last post. Both have to pass.
    const verdict = progressVerdict(summary(45, 136), prior(39, 136, 3), CONFIG);
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason!, /cooldown/);
  });
});

describe("naming what just landed", () => {
  const summary = (labels: string[]) =>
    ({ featured: labels.map((label) => ({ label })) }) as CollectionSummary;

  test("reports only labels that were not buyable last time", () => {
    const prior: PriorPost = { buyable: 2, slots: 10, at: "2026-01-01", labels: ["A", "B"] };
    assert.deepEqual(newlyListed(summary(["A", "B", "C"]), prior), ["C"]);
  });

  test("claims nothing on a first post", () => {
    assert.deepEqual(newlyListed(summary(["A"]), null), []);
  });

  test("claims nothing when the previous post recorded no labels", () => {
    // Drafts from before this field existed. Saying every shirt is new would
    // be a fabricated claim; saying nothing is merely a duller post.
    const prior: PriorPost = { buyable: 2, slots: 10, at: "2026-01-01", labels: [] };
    assert.deepEqual(newlyListed(summary(["A", "B"]), prior), []);
  });
});
