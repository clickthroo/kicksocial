import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  seasonYear,
  summarise,
  qualifies,
  subjectRefFor,
  DEFAULT_CLUB_ARCHIVE_CONFIG as CONFIG,
} from "./club-archive.ts";

const product = (season: string | null, shirt_type: string | null, photo: string | null) => ({
  team: "Manchester United",
  season,
  shirt_type,
  name: `${season} Manchester United ${shirt_type}`,
  slug: `${season}-manchester-united-${shirt_type}`.toLowerCase(),
  primary_image_url: photo,
});

const deepClub = () =>
  Array.from({ length: 24 }, (_, i) =>
    product(`${1975 + i * 2}-${String((76 + i * 2) % 100).padStart(2, "0")}`,
      ["Home", "Away", "Third"][i % 3], `https://img.example/${i}.jpg`),
  );

describe("season parsing", () => {
  test("reads the year from the text, since season_end_year is null everywhere", () => {
    // All 2,597 active products have a null season_end_year and a populated
    // season string. Filtering on the column matched nothing, silently.
    assert.equal(seasonYear("1990-91"), 1990);
    assert.equal(seasonYear("2024-25"), 2024);
    assert.equal(seasonYear("  1986-87  "), 1986);
  });

  test("refuses text that is not a season", () => {
    for (const bad of [null, "", "unknown", "90-91", "N/A"]) {
      assert.equal(seasonYear(bad), null, String(bad));
    }
  });

  test("refuses years outside anything a football shirt could be", () => {
    // A 1850 shirt is a data error, not a find - and it would stretch the
    // headline span by a century.
    assert.equal(seasonYear("1850-51"), null);
    assert.equal(seasonYear("2400-01"), null);
  });
});

describe("summarising a club", () => {
  test("counts shirts, span and kit types from the rows themselves", () => {
    // teams.listings_count reports 65 for England where 140 products exist, so
    // these are recounted rather than read off that column.
    const summary = summarise("Manchester United", deepClub(), CONFIG)!;
    assert.equal(summary.shirts, 24);
    assert.equal(summary.earliest, 1975);
    assert.equal(summary.latest, 1975 + 23 * 2);
    assert.equal(summary.kitTypes, 3);
  });

  test("orders the grid oldest first, so it reads as a timeline", () => {
    const summary = summarise("Manchester United", deepClub(), CONFIG)!;
    assert.equal(summary.photos[0], "https://img.example/0.jpg");
    assert.equal(summary.featured[0].season?.startsWith("1975"), true);
  });

  test("shows no more than the grid holds", () => {
    const summary = summarise("Manchester United", deepClub(), CONFIG)!;
    assert.equal(summary.photos.length, CONFIG.gridSize);
  });

  test("skips photos the card cannot render", () => {
    // WebP renders as an empty frame with no error.
    const products = deepClub().map((p, i) =>
      i < 20 ? { ...p, primary_image_url: `https://img.example/${i}.webp` } : p,
    );
    const summary = summarise("Manchester United", products, CONFIG)!;
    assert.equal(summary.photos.length, 4);
    assert.ok(summary.photos.every((u) => u.endsWith(".jpg")));
  });

  test("never repeats the same photo in the grid", () => {
    const products = deepClub().map((p) => ({ ...p, primary_image_url: "https://img.example/same.jpg" }));
    const summary = summarise("Manchester United", products, CONFIG)!;
    assert.equal(summary.photos.length, 1);
  });

  test("returns nothing when no season can be read", () => {
    const products = deepClub().map((p) => ({ ...p, season: "unknown" }));
    assert.equal(summarise("Manchester United", products, CONFIG), null);
  });
});

describe("what qualifies as an archive", () => {
  test("a deep, wide-ranging club qualifies", () => {
    assert.equal(qualifies(summarise("Manchester United", deepClub(), CONFIG)!, CONFIG).ok, true);
  });

  test("refuses a club with too few shirts", () => {
    const summary = summarise("Manchester United", deepClub().slice(0, 8), CONFIG)!;
    const verdict = qualifies(summary, CONFIG);
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason ?? "", /shirts \(need/);
  });

  test("refuses a club whose shirts are all from the same few years", () => {
    // Twenty shirts from three seasons is a shelf, not an archive, and calling
    // it one would be the only misleading thing this recipe could do.
    const products = Array.from({ length: 24 }, (_, i) =>
      product(`202${i % 3}-2${i % 3}`, "Home", `https://img.example/${i}.jpg`),
    );
    const verdict = qualifies(summarise("Recent FC", products, CONFIG)!, CONFIG);
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason ?? "", /only spans/);
  });

  test("refuses a club without enough renderable photos", () => {
    const products = deepClub().map((p, i) =>
      i < 20 ? { ...p, primary_image_url: null } : p,
    );
    const verdict = qualifies(summarise("Manchester United", products, CONFIG)!, CONFIG);
    assert.equal(verdict.ok, false);
    assert.match(verdict.reason ?? "", /renderable photos/);
  });
});

describe("cooldown identity", () => {
  test("is case-insensitive, so one club cannot be featured twice", () => {
    assert.equal(subjectRefFor("Arsenal"), subjectRefFor("arsenal"));
    assert.equal(subjectRefFor("  Arsenal "), "club:arsenal");
  });
});
