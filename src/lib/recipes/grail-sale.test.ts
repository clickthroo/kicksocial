import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildCandidate, productImages, type ProductRow, type LookupResult } from "./grail-sale.ts";

const product = (over: Partial<ProductRow> = {}): ProductRow => ({
  id: "p1",
  slug: "1990-92-england-third-shirt",
  name: "1990-92 England Third Shirt",
  team: "England",
  season: "1990-91",
  shirt_type: "Third",
  manufacturer: "Umbro",
  player_name: null,
  number: null,
  issue: "Standard Retail Version",
  signed: "Not Signed",
  special_edition: "Not A Special Edition",
  boxed_edition: "Not A Boxed Edition",
  sleeves: "Short-Sleeved",
  colour: "Blue (Sky)",
  latest_condition: "Very Good",
  latest_size: "L",
  status: "active",
  deleted_at: null,
  primary_image_url: "https://img.example/0.jpg",
  images: [],
  ...over,
});

const lookup = (over: Partial<ProductRow> = {}): LookupResult => {
  const p = product(over);
  const { renderable, rejected } = productImages(p);
  return { product: p, images: renderable, unrenderableImages: rejected };
};

describe("photos", () => {
  test("uses primary_image_url when the gallery is empty", () => {
    // products.images is an empty array on plenty of rows that plainly have a
    // photo - the England third shirt is one. Reading only the gallery would
    // report "no photo" for them.
    const { renderable } = productImages(product({ images: [] }));
    assert.deepEqual(renderable, ["https://img.example/0.jpg"]);
  });

  test("keeps WebP, which the render route transcodes", () => {
    const { renderable, rejected } = productImages(
      product({ images: ["https://img.example/a.webp"], primary_image_url: null }),
    );
    assert.deepEqual(renderable, ["https://img.example/a.webp"]);
    assert.equal(rejected, 0);
  });

  test("still drops a format nothing can open", () => {
    const { renderable, rejected } = productImages(
      product({ images: ["https://img.example/a.svg"], primary_image_url: null }),
    );
    assert.deepEqual(renderable, []);
    assert.equal(rejected, 1);
  });

  test("refuses to build a post with no renderable photo", () => {
    const result = buildCandidate(
      lookup({ images: ["https://img.example/a.svg"], primary_image_url: null }),
      { url: "x", priceCents: 34_699 },
    );
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.reason : "", /no photo the card can render/i);
  });

  test("does not count the same photo twice", () => {
    const { renderable } = productImages(
      product({ images: ["https://img.example/0.jpg"], primary_image_url: "https://img.example/0.jpg" }),
    );
    assert.deepEqual(renderable, ["https://img.example/0.jpg"]);
  });
});

describe("the price is entered, not read", () => {
  test("says so in the claim, rather than naming a column it did not come from", () => {
    const result = buildCandidate(lookup(), { url: "x", priceCents: 34_699 });
    assert.equal(result.ok, true);
    if (!result.ok) return;

    const priceClaim = result.candidate.claims.find((c) => c.statement.startsWith("Sold for"));
    assert.ok(priceClaim);
    assert.match(priceClaim.source, /entered by an admin/i);
    assert.doesNotMatch(priceClaim.source, /price_cents/);
  });

  test("no buyer protection fee is added - the sale already happened", () => {
    // Elsewhere the engine adds 4% + 40p because listings carry an asking price.
    // Here the admin types what was actually paid, so adding a fee would invent
    // money that never changed hands.
    const result = buildCandidate(lookup(), { url: "x", priceCents: 34_699 });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.candidate.sourceData.price, "£346.99");
  });

  test("keeps pence, and drops them only when the amount is whole", () => {
    const withPence = buildCandidate(lookup(), { url: "x", priceCents: 34_699 });
    const whole = buildCandidate(lookup(), { url: "x", priceCents: 94_500 });
    assert.equal(withPence.ok && withPence.candidate.sourceData.price, "£346.99");
    assert.equal(whole.ok && whole.candidate.sourceData.price, "£945");
  });

  test("refuses a missing or nonsense price", () => {
    for (const priceCents of [0, -100, Number.NaN]) {
      assert.equal(buildCandidate(lookup(), { url: "x", priceCents }).ok, false);
    }
  });
});

describe("attribute signals", () => {
  test("Kickio's negative phrasings claim nothing", () => {
    // "Not A Boxed Edition" once read as a positive and a post claimed a shirt
    // was still boxed when its listing said the opposite.
    const result = buildCandidate(lookup(), { url: "x", priceCents: 10_000 });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.candidate.sourceData.rarity_signals, []);
    assert.deepEqual(result.candidate.sourceData.unknown_attribute_values, []);
  });

  test("a real signal is carried through", () => {
    const result = buildCandidate(lookup({ issue: "Match Issue" }), {
      url: "x",
      priceCents: 10_000,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.candidate.sourceData.rarity_signals, ["Match issue"]);
  });

  test("an unrecognised value is reported rather than guessed at", () => {
    const result = buildCandidate(lookup({ special_edition: "Testimonial Edition" }), {
      url: "x",
      priceCents: 10_000,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.deepEqual(result.candidate.sourceData.rarity_signals, []);
    assert.deepEqual(result.candidate.sourceData.unknown_attribute_values, [
      { column: "special_edition", value: "Testimonial Edition" },
    ]);
  });
});

describe("facts", () => {
  test("placeholders never reach the card", () => {
    const result = buildCandidate(
      lookup({ manufacturer: "Other", player_name: "Unknown", latest_size: "N/A" }),
      { url: "x", priceCents: 10_000 },
    );
    assert.equal(result.ok, true);
    if (!result.ok) return;
    const facts = result.candidate.sourceData;
    assert.equal(facts.manufacturer, undefined);
    assert.equal(facts.printing, undefined);
    assert.equal(facts.size, undefined);
  });

  test("a printed name is labelled as printing, not as a player-issue shirt", () => {
    const result = buildCandidate(lookup({ player_name: "Gascoigne", number: "19" }), {
      url: "x",
      priceCents: 10_000,
    });
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(result.candidate.sourceData.printing, "Gascoigne 19");
    const claim = result.candidate.claims.find((c) => c.statement.startsWith("Printed"));
    assert.match(claim?.basis ?? "", /not a player-issue shirt/i);
  });

  test("the admin's condition overrides the product's last-known one", () => {
    const result = buildCandidate(lookup(), {
      url: "x",
      priceCents: 10_000,
      condition: "Mint",
    });
    assert.equal(result.ok && result.candidate.sourceData.condition, "Mint");
  });

  test("the same shirt selling twice produces two subjects, not a duplicate", () => {
    const a = buildCandidate(lookup(), { url: "x", priceCents: 10_000, soldAt: "2026-09-17" });
    const b = buildCandidate(lookup(), { url: "x", priceCents: 12_000, soldAt: "2026-10-02" });
    assert.notEqual(
      a.ok && a.candidate.subjectRef,
      b.ok && b.candidate.subjectRef,
    );
  });

  test("links to the shirt's page on Kickio", () => {
    const result = buildCandidate(lookup(), { url: "x", priceCents: 10_000 });
    assert.equal(
      result.ok && result.candidate.sourceData.kickio_url,
      "https://kickio.com/marketplace/1990-92-england-third-shirt",
    );
  });
});
