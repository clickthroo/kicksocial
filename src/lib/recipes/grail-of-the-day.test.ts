import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  isLive,
  scoreListing,
  kickioUrl,
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
    assert.ok(scoreListing(live({ signed: "Signed by squad" })).signals.includes("Signed"));
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
