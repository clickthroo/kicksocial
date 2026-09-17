import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  isLive,
  scoreListing,
  kickioUrl,
  imageUrls,
  DEFAULT_GRAIL_CONFIG,
  KICKIO_DIRECT_SELLER,
  APPROVED_PARTNER_SELLER,
} from "./grail-of-the-day.ts";

/** Shorthand for the default rules with a chosen staleness window. */
const rules = (maxStockCheckAgeDays = 7) => ({
  maxStockCheckAgeDays,
  allowedSellerIds: DEFAULT_GRAIL_CONFIG.allowedSellerIds,
});

/** A listing that is genuinely live and sellable. */
function live(overrides: Record<string, unknown> = {}) {
  return {
    id: "l1",
    title: "1993-94 Arsenal Away Shirt",
    price_cents: 49900,
    currency: "GBP",
    team: "Arsenal",
    season: "1993-94",
    shirt_type: "Away",
    condition: "Very Good",
    issue: "Standard Retail Version",
    signed: "Not Signed",
    special_edition: null,
    boxed_edition: null,
    player_name: null,
    manufacturer: "Nike",
    images: ["https://example.com/a.jpg"],
    created_at: "2026-09-01T00:00:00Z",
    removed_at: null,
    removed_reason: null,
    consecutive_gone_count: 0,
    reserved_until: null,
    last_stock_checked_at: "2026-09-16T00:00:00Z",
    is_partner_listing: false,
    seller_id: KICKIO_DIRECT_SELLER,
    source: "kickio",
    source_url: "https://example.com/listing",
    products: { status: "active", deleted_at: null, slug: "arsenal-1993-94-away" },
    ...overrides,
  } as Parameters<typeof isLive>[0];
}

describe("live-listing eligibility", () => {
  test("accepts a genuinely live listing", () => {
    assert.equal(isLive(live()), true);
  });

  test("rejects one already sold elsewhere", () => {
    // Real case in Kickio: status stays 'active' while removed_at is set with
    // removed_reason 'sold_detected'. Posting this sends people to a dead link.
    assert.equal(
      isLive(live({ removed_at: "2026-09-15T00:00:00Z", removed_reason: "sold_detected" })),
      false,
    );
  });

  test("rejects one withdrawn manually", () => {
    assert.equal(
      isLive(live({ removed_at: "2026-09-15T00:00:00Z", removed_reason: "manual" })),
      false,
    );
  });

  test("rejects a product still in Kickio's review queue", () => {
    for (const status of ["pending", "rejected", "archived"]) {
      assert.equal(
        isLive(live({ products: { status, deleted_at: null, slug: "s" } })),
        false,
        `product status '${status}' must not be featured`,
      );
    }
  });

  test("rejects a soft-deleted product", () => {
    assert.equal(
      isLive(live({ products: { status: "active", deleted_at: "2026-09-10T00:00:00Z", slug: "s" } })),
      false,
    );
  });

  test("rejects one the stock checker can no longer find", () => {
    assert.equal(isLive(live({ consecutive_gone_count: 2 })), false);
  });

  test("rejects one reserved for a buyer mid-checkout", () => {
    const now = new Date("2026-09-16T12:00:00Z");
    assert.equal(isLive(live({ reserved_until: "2026-09-16T12:30:00Z" }), rules(), now), false);
  });

  test("accepts one whose reservation has lapsed", () => {
    const now = new Date("2026-09-16T12:00:00Z");
    assert.equal(isLive(live({ reserved_until: "2026-09-16T11:00:00Z" }), rules(), now), true);
  });

  test("rejects a listing with no linked product at all", () => {
    assert.equal(isLive(live({ products: null })), false);
  });

  test("rejects a scraped listing never confirmed in stock", () => {
    // consecutive_gone_count = 0 is also the value for one never checked.
    assert.equal(
      isLive(live({ source: "scrape", last_stock_checked_at: null, consecutive_gone_count: 0 })),
      false,
    );
  });

  test("rejects a scraped listing whose stock check has gone stale", () => {
    const now = new Date("2026-09-16T12:00:00Z");
    const scraped = (checked: string) =>
      live({ source: "scrape", seller_id: APPROVED_PARTNER_SELLER, last_stock_checked_at: checked });
    assert.equal(isLive(scraped("2026-09-01T00:00:00Z"), rules(), now), false);
    assert.equal(isLive(scraped("2026-09-14T00:00:00Z"), rules(), now), true);
  });

  test("does NOT demand a stock check of Kickio Direct stock", () => {
    // Kickio Direct has no external source to verify, so the column is null for
    // all of it. Requiring it unconditionally excluded every Kickio listing -
    // which is how scraped eBay inventory ended up in the drafts instead.
    assert.equal(
      isLive(live({ source: "kickio", last_stock_checked_at: null })),
      true,
    );
  });

  test("rejects sellers whose listings do not appear on kickio.com", () => {
    const cfs = "00000000-0000-0000-0000-0000000000c1";
    assert.equal(isLive(live({ seller_id: cfs })), false);
  });

  test("accepts both sellers that do appear on the site", () => {
    assert.equal(isLive(live({ seller_id: KICKIO_DIRECT_SELLER })), true);
    assert.equal(
      isLive(live({
        seller_id: APPROVED_PARTNER_SELLER,
        source: "scrape",
        last_stock_checked_at: new Date().toISOString(),
      })),
      true,
    );
  });

  test("the staleness window is configurable", () => {
    const now = new Date("2026-09-16T12:00:00Z");
    const old = live({
      source: "scrape",
      seller_id: APPROVED_PARTNER_SELLER,
      last_stock_checked_at: "2026-09-04T00:00:00Z",
    });
    assert.equal(isLive(old, rules(7), now), false);
    assert.equal(isLive(old, rules(30), now), true);
  });
});

describe("rarity scoring", () => {
  test("ranks a match issue above a plain shirt of the same price", () => {
    const plain = scoreListing(live());
    const matchIssue = scoreListing(live({ issue: "Match Issue" }));
    assert.ok(matchIssue.score > plain.score);
    assert.ok(matchIssue.signals.includes("Match issue"));
  });

  test("treats 'Not Signed' as unsigned rather than a signature", () => {
    assert.ok(!scoreListing(live({ signed: "Not Signed" })).signals.includes("Signed"));
    assert.ok(scoreListing(live({ signed: "Signed" })).signals.includes("Signed"));
  });

  test("caps the price contribution so cost cannot beat genuine rarity", () => {
    // An expensive plain shirt should not outrank a cheaper match issue.
    const expensivePlain = scoreListing(live({ price_cents: 500_000 }));
    const cheapMatchIssue = scoreListing(live({ price_cents: 20_000, issue: "Match Issue" }));
    assert.ok(cheapMatchIssue.score > expensivePlain.score);
  });

  test("credits vintage from the season", () => {
    assert.ok(scoreListing(live({ season: "1986-87" })).signals.includes("1980s"));
    assert.ok(!scoreListing(live({ season: "2023-24" })).signals.includes("2020s"));
  });
});

describe("kickio listing url", () => {
  const env = { ...process.env };
  const restore = () => {
    process.env = { ...env };
  };

  test("builds the live marketplace pattern from a product slug", () => {
    restore();
    delete process.env.KICKIO_SITE_URL;
    delete process.env.KICKIO_PRODUCT_PATH;
    assert.equal(
      kickioUrl("1990-92-england-third-shirt"),
      "https://kickio.com/marketplace/1990-92-england-third-shirt",
    );
    restore();
  });

  test("returns null without a slug rather than a broken link", () => {
    restore();
    assert.equal(kickioUrl(null), null);
    restore();
  });

  test("can be overridden if the site moves", () => {
    restore();
    process.env.KICKIO_SITE_URL = "https://staging.kickio.com/";
    process.env.KICKIO_PRODUCT_PATH = "/shirts/{slug}";
    assert.equal(kickioUrl("abc"), "https://staging.kickio.com/shirts/abc");
    restore();
  });
});

/**
 * Every distinct value present in Kickio's `listings` on 2026-09-17. These are
 * the strings the scorer actually has to interpret, so they are asserted
 * directly rather than paraphrased.
 */
describe("attribute vocabulary, against real Kickio values", () => {
  const claims = (o: Record<string, unknown>) => scoreListing(live(o)).signals;

  test("'Not A Special Edition' is not a special edition", () => {
    // This exact string was read as a positive signal by the negation-based
    // test it replaced, flagging 1,335 listings as rare.
    assert.deepEqual(
      claims({ special_edition: "Not A Special Edition" }).filter((s) => /edition/i.test(s)),
      [],
    );
  });

  test("'Not A Boxed Edition' is not boxed", () => {
    // The false claim that shipped: a draft said "still boxed" of a shirt whose
    // listing read 'Not A Boxed Edition'. Only 2 listings are genuinely boxed.
    assert.deepEqual(
      claims({ boxed_edition: "Not A Boxed Edition" }).filter((s) => /box/i.test(s)),
      [],
    );
    assert.ok(claims({ boxed_edition: "Boxed Edition - In Box" }).includes("Boxed, in box"));
  });

  test("recognises every real special-edition value", () => {
    for (const [value, label] of [
      ["Special Edition", "Special edition"],
      ["Cup Final", "Cup final edition"],
      ["World Cup", "World Cup edition"],
      ["Centenary", "Centenary edition"],
      ["Champions League", "Champions League edition"],
      ["Champions", "Champions edition"],
    ] as const) {
      assert.ok(claims({ special_edition: value }).includes(label), `${value} -> ${label}`);
    }
  });

  test("distinguishes the real condition grades", () => {
    assert.ok(claims({ condition: "Mint" }).includes("Mint condition"));
    assert.ok(claims({ condition: "Brand New (With Tags)" }).includes("Brand new with tags"));
    for (const value of ["Very Good", "Good", "Fair", "Needs Attention", "Excellent Condition"]) {
      assert.deepEqual(
        claims({ condition: value }).filter((s) => /condition|brand new/i.test(s)),
        [],
        `${value} must not be presented as a rarity signal`,
      );
    }
  });

  test("reads the real issue values", () => {
    assert.ok(claims({ issue: "Match Issue" }).includes("Match issue"));
    assert.ok(claims({ issue: "Authentic/Player Version" }).includes("Player-issue spec"));
    assert.deepEqual(claims({ issue: "Standard Retail Version" }).filter((s) => /issue|spec/i.test(s)), []);
  });

  test("labels a printed name as printing, not as a player-issue shirt", () => {
    const signals = claims({ player_name: "Maradona" });
    assert.ok(signals.includes("Maradona printing"));
    assert.ok(!signals.some((s) => /player-issue/i.test(s)));
  });

  test("claims nothing about an unrecognised value, and reports it", () => {
    // Fail closed: new vocabulary must never become a confident false claim.
    const scored = scoreListing(live({ special_edition: "Testimonial Match" }));
    assert.deepEqual(scored.signals.filter((s) => /edition/i.test(s)), []);
    assert.deepEqual(scored.unknown, [
      { column: "special_edition", value: "Testimonial Match" },
    ]);
  });

  test("nulls and blanks are silent, not unknown", () => {
    const scored = scoreListing(live({ special_edition: null, boxed_edition: "  " }));
    assert.deepEqual(scored.unknown, []);
  });
});

describe("renderable photography", () => {
  const SB = "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/product-images";

  test("drops WebP, which the card renderer cannot decode", () => {
    // A WebP source renders as an empty frame with no error - a draft reached
    // review with no shirt in it. 533 listings are WebP-only.
    assert.deepEqual(imageUrls([`${SB}/scraped/ebay/389186049708/0.webp`]), []);
  });

  test("keeps jpg, jpeg and png, in the listing's own order", () => {
    const urls = [`${SB}/a.png`, `${SB}/b.jpg`, `${SB}/c.jpeg`];
    assert.deepEqual(imageUrls(urls), urls);
  });

  test("prefers a renderable image when the array mixes formats", () => {
    assert.deepEqual(
      imageUrls([`${SB}/0.webp`, `${SB}/1.jpg`, `${SB}/2.webp`]),
      [`${SB}/1.jpg`],
    );
  });

  test("tolerates a query string after the extension", () => {
    assert.deepEqual(imageUrls([`${SB}/a.jpg?width=800`]), [`${SB}/a.jpg?width=800`]);
  });

  test("accepts objects with a url field, as well as bare strings", () => {
    assert.deepEqual(imageUrls([{ url: `${SB}/a.jpg` }]), [`${SB}/a.jpg`]);
  });

  test("ignores malformed entries rather than passing them to the renderer", () => {
    assert.deepEqual(imageUrls([null, 42, "not-a-url", {}, `${SB}/ok.png`]), [`${SB}/ok.png`]);
  });

  test("returns nothing for a non-array", () => {
    assert.deepEqual(imageUrls(null), []);
    assert.deepEqual(imageUrls("string"), []);
  });
});
