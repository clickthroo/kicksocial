import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { matchLegend, cheapestPerLegend, preferUnseen, LEGENDS, type LegendMatch } from "./legend-shelf.ts";

describe("matching a printed name to a legend", () => {
  test("matches the short print form as well as the full name", () => {
    assert.equal(matchLegend("Maradona", "Argentina")?.id, "maradona");
    assert.equal(matchLegend("Diego Maradona", "Argentina")?.id, "maradona");
  });

  test("is case- and whitespace-insensitive", () => {
    assert.equal(matchLegend("  zidane  ", "Real Madrid")?.id, "zidane");
    assert.equal(matchLegend("ZIDANE", "Real Madrid")?.id, "zidane");
  });

  test("drops placeholder values rather than matching them", () => {
    assert.equal(matchLegend("Unknown", "Arsenal"), null);
    assert.equal(matchLegend(null, "Arsenal"), null);
    assert.equal(matchLegend("", "Arsenal"), null);
  });

  test("an unrecognised name matches nothing", () => {
    assert.equal(matchLegend("J.S.Park", "South Korea"), null);
  });

  test("a name with no ambiguity needs no team hint", () => {
    assert.equal(matchLegend("Ronaldinho", "Some Obscure Club")?.id, "ronaldinho");
    assert.equal(matchLegend("Ronaldinho", "Anywhere")?.id, "ronaldinho");
  });

  describe("ambiguous surnames require a team hint", () => {
    test("bare 'Ronaldo' on one of his real clubs resolves to Ronaldo Nazário", () => {
      assert.equal(matchLegend("Ronaldo", "Brazil")?.id, "ronaldo_nazario");
      assert.equal(matchLegend("Ronaldo", "Barcelona")?.id, "ronaldo_nazario");
      assert.equal(matchLegend("Ronaldo", "Inter Milan")?.id, "ronaldo_nazario");
    });

    test("bare 'Ronaldo' on an unrelated team matches nothing - never guessed", () => {
      assert.equal(matchLegend("Ronaldo", "Manchester United"), null);
      assert.equal(matchLegend("Ronaldo", null), null);
    });

    test("the full name 'Cristiano Ronaldo' needs no team hint", () => {
      assert.equal(matchLegend("Cristiano Ronaldo", "Manchester United")?.id, "cristiano_ronaldo");
      assert.equal(matchLegend("CR7", "Juventus")?.id, "cristiano_ronaldo");
    });

    test("'Best' only matches on his own clubs, not as the ordinary word", () => {
      assert.equal(matchLegend("Best", "Manchester United")?.id, "best");
      assert.equal(matchLegend("Best", "Northern Ireland")?.id, "best");
      assert.equal(matchLegend("Best", "Arsenal"), null);
    });
  });

  test("every legend's match tokens are unique across the allowlist except where a team hint disambiguates", () => {
    // A token shared by two legends must be a token used ONLY on hinted
    // entries - two unrestricted definers of the same token would make the
    // match order-dependent, which the allowlist is designed to avoid.
    const seen = new Map<string, string[]>();
    for (const legend of LEGENDS) {
      for (const token of legend.match) {
        const key = token.trim().toLowerCase();
        seen.set(key, [...(seen.get(key) ?? []), legend.id]);
      }
    }
    for (const [token, ids] of seen) {
      if (ids.length <= 1) continue;
      const owners = ids.map((id) => LEGENDS.find((l) => l.id === id)!);
      const unrestricted = owners.filter((o) => !o.teamHints);
      assert.ok(
        unrestricted.length <= 1,
        `token "${token}" is claimed by more than one unrestricted legend: ${ids.join(", ")}`,
      );
    }
  });
});

function listing(overrides: Record<string, unknown> = {}) {
  return {
    id: "l1",
    title: "Shirt",
    price_cents: 50_000,
    currency: "GBP",
    team: "Argentina",
    season: "1994-95",
    shirt_type: "Away",
    condition: "Very Good",
    player_name: "Maradona",
    manufacturer: "Adidas",
    images: ["https://example.com/a.jpg"],
    removed_at: null,
    removed_reason: null,
    consecutive_gone_count: 0,
    reserved_until: null,
    last_stock_checked_at: null,
    is_partner_listing: false,
    seller_id: "seller",
    source_url: null,
    source: "direct",
    products: { status: "active", deleted_at: null, slug: "slug" },
    ...overrides,
  };
}

const maradona = LEGENDS.find((l) => l.id === "maradona")!;
const zidane = LEGENDS.find((l) => l.id === "zidane")!;

describe("cheapestPerLegend", () => {
  test("keeps only the cheapest listing per legend", () => {
    const matches: LegendMatch[] = [
      { legend: maradona, listing: listing({ id: "a", price_cents: 60_000 }) as never },
      { legend: maradona, listing: listing({ id: "b", price_cents: 45_000 }) as never },
      { legend: zidane, listing: listing({ id: "c", price_cents: 40_000 }) as never },
    ];
    const result = cheapestPerLegend(matches);
    assert.equal(result.length, 2);
    const byId = new Map(result.map((r) => [r.legend.id, r.listing.id]));
    assert.equal(byId.get("maradona"), "b");
    assert.equal(byId.get("zidane"), "c");
  });
});

describe("preferUnseen", () => {
  test("sorts previously-featured legends after fresh ones, without dropping them", () => {
    const matches: LegendMatch[] = [
      { legend: maradona, listing: listing({ id: "a" }) as never },
      { legend: zidane, listing: listing({ id: "b" }) as never },
    ];
    const ordered = preferUnseen(matches, new Set(["maradona"]));
    assert.deepEqual(
      ordered.map((m) => m.legend.id),
      ["zidane", "maradona"],
    );
  });

  test("stable order when nothing is recently featured", () => {
    const matches: LegendMatch[] = [
      { legend: maradona, listing: listing({ id: "a" }) as never },
      { legend: zidane, listing: listing({ id: "b" }) as never },
    ];
    const ordered = preferUnseen(matches, new Set());
    assert.deepEqual(
      ordered.map((m) => m.legend.id),
      ["maradona", "zidane"],
    );
  });
});
