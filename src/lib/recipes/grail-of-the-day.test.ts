import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isLive, scoreListing } from "./grail-of-the-day.ts";

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
    products: { status: "active", deleted_at: null },
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
        isLive(live({ products: { status, deleted_at: null } })),
        false,
        `product status '${status}' must not be featured`,
      );
    }
  });

  test("rejects a soft-deleted product", () => {
    assert.equal(
      isLive(live({ products: { status: "active", deleted_at: "2026-09-10T00:00:00Z" } })),
      false,
    );
  });

  test("rejects one the stock checker can no longer find", () => {
    assert.equal(isLive(live({ consecutive_gone_count: 2 })), false);
  });

  test("rejects one reserved for a buyer mid-checkout", () => {
    const now = new Date("2026-09-16T12:00:00Z");
    assert.equal(isLive(live({ reserved_until: "2026-09-16T12:30:00Z" }), now), false);
  });

  test("accepts one whose reservation has lapsed", () => {
    const now = new Date("2026-09-16T12:00:00Z");
    assert.equal(isLive(live({ reserved_until: "2026-09-16T11:00:00Z" }), now), true);
  });

  test("rejects a listing with no linked product at all", () => {
    assert.equal(isLive(live({ products: null })), false);
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
