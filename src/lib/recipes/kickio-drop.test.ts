import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  liveVerdict,
  choosePhotos,
  cheaperElsewhere,
  subjectRefFor,
  type ListingRow,
} from "./kickio-drop.ts";
import type { ProductRow } from "./grail-sale.ts";

const listing = (over: Partial<ListingRow> = {}): ListingRow =>
  ({
    id: "21b7f8c2-6e2c-4203-9d0a-65f93232cf6b",
    product_id: "p-1",
    seller_id: "s-1",
    title: "2002-03 Rangers FC Away Shirt",
    description: null,
    size: "L",
    condition: "Very Good",
    price_cents: 18_000,
    currency: "GBP",
    images: [],
    status: "active",
    deleted_at: null,
    removed_at: null,
    removed_reason: null,
    stock_quantity: 1,
    consecutive_gone_count: 0,
    accepts_offers: true,
    issue: null,
    signed: null,
    special_edition: null,
    boxed_edition: null,
    sleeves: null,
    player_name: null,
    number: null,
    manufacturer: null,
    ...over,
  }) as ListingRow;

const product = (over: Partial<ProductRow> = {}): ProductRow =>
  ({
    id: "p-1",
    slug: "2002-03-rangers-fc-away-shirt",
    name: "2002-03 Rangers FC Away Shirt",
    team: "Rangers",
    season: "2002-03",
    shirt_type: "Away",
    manufacturer: "Diadora",
    player_name: null,
    number: null,
    issue: null,
    signed: null,
    special_edition: null,
    boxed_edition: null,
    sleeves: null,
    colour: null,
    latest_condition: null,
    latest_size: null,
    status: "active",
    deleted_at: null,
    primary_image_url: "https://img.example/product.jpg",
    images: [],
    ...over,
  }) as ProductRow;

describe("is it actually buyable", () => {
  test("a live listing passes", () => {
    assert.equal(liveVerdict(listing()).ok, true);
  });

  test("every way a listing can be live in the database and gone in practice", () => {
    const cases: Array<[Partial<ListingRow>, RegExp]> = [
      [{ deleted_at: "2026-01-01" }, /deleted/i],
      [{ status: "sold" }, /is sold, not active/i],
      [{ status: "pending" }, /is pending, not active/i],
      [{ removed_at: "2026-01-01", removed_reason: "withdrawn by seller" }, /withdrawn/i],
      [{ stock_quantity: 0 }, /out of stock/i],
      // The stock checker has been to the source and not found it.
      [{ consecutive_gone_count: 2 }, /stock checker/i],
      [{ price_cents: null }, /no price/i],
      [{ price_cents: 0 }, /no price/i],
    ];
    for (const [over, pattern] of cases) {
      const verdict = liveVerdict(listing(over));
      assert.equal(verdict.ok, false, JSON.stringify(over));
      assert.match(verdict.reason!, pattern);
    }
  });

  test("a listing with no product has nowhere to link to", () => {
    // The post links to the product page, so an orphan listing cannot be
    // promoted at all - the CTA would have no destination.
    const verdict = liveVerdict(listing({ product_id: null }));
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason!, /nowhere to link/i);
  });
});

describe("which photo", () => {
  test("the product's, as specified", () => {
    const choice = choosePhotos(product(), listing({ images: ["https://img.example/seller.jpg"] }));
    assert.equal(choice.source, "product");
    assert.deepEqual(choice.urls, ["https://img.example/product.jpg"]);
  });

  test("falls back to the seller's photos rather than refusing", () => {
    // 52 of 1,649 live listings have no usable product photo but do have
    // seller photos. Refusing those loses a post over which table the picture
    // happens to sit in.
    const choice = choosePhotos(
      product({ primary_image_url: null, images: [] }),
      listing({ images: ["https://img.example/seller.jpg"] }),
    );
    assert.equal(choice.source, "listing");
    assert.deepEqual(choice.urls, ["https://img.example/seller.jpg"]);
  });

  test("WebP counts on both tiers now the renderer transcodes it", () => {
    const choice = choosePhotos(product({ primary_image_url: "https://img.example/a.webp" }), listing());
    assert.equal(choice.source, "product");
    assert.deepEqual(choice.urls, ["https://img.example/a.webp"]);
  });

  test("nothing usable anywhere", () => {
    const choice = choosePhotos(
      product({ primary_image_url: null, images: [] }),
      listing({ images: ["https://img.example/a.svg"] }),
    );
    assert.deepEqual(choice.urls, []);
  });
});

describe("the cheaper-listing warning", () => {
  test("silent when this is the only listing", () => {
    assert.equal(cheaperElsewhere(18_000, []), null);
  });

  test("silent when this is the cheapest", () => {
    assert.equal(cheaperElsewhere(18_000, [19_000, 25_000]), null);
  });

  test("warns, and reports the lowest of the cheaper ones", () => {
    // The post quotes this listing but links to the product page, which leads
    // with the cheapest. 225 products have more than one live listing.
    const cheaper = cheaperElsewhere(18_000, [25_000, 14_000, 16_500]);
    assert.deepEqual(cheaper, { lowestCents: 14_000, others: 3 });
  });

  test("an equal price is not cheaper", () => {
    assert.equal(cheaperElsewhere(18_000, [18_000]), null);
  });

  test("a listing with no price does not count as free", () => {
    // price_cents null arrives as 0 from the caller, and 0 < 18000 would
    // otherwise report a cheaper listing at nothing.
    assert.equal(cheaperElsewhere(18_000, [0]), null);
  });
});

describe("subject refs", () => {
  test("one listing, posted once", () => {
    assert.equal(
      subjectRefFor("21B7F8C2-6E2C-4203-9D0A-65F93232CF6B"),
      "drop:21b7f8c2-6e2c-4203-9d0a-65f93232cf6b",
    );
  });
});
