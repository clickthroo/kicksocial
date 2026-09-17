import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { slugFromUrl } from "./product-url.ts";

const slug = "1990-92-england-third-shirt";

describe("reading a slug from a pasted link", () => {
  test("accepts the shape the site actually produces", () => {
    for (const url of [
      `https://kickio.com/marketplace/${slug}`,
      `https://www.kickio.com/marketplace/${slug}`,
      `http://kickio.com/marketplace/${slug}`,
      `kickio.com/marketplace/${slug}`,
      `https://kickio.com/marketplace/${slug}/`,
      `https://kickio.com/marketplace/${slug}?utm_source=x`,
      `https://kickio.com/marketplace/${slug}#photos`,
      `  https://kickio.com/marketplace/${slug}  `,
    ]) {
      assert.deepEqual(slugFromUrl(url), { ok: true, slug }, url);
    }
  });

  test("accepts a bare slug, since the admin may already have it", () => {
    assert.deepEqual(slugFromUrl(slug), { ok: true, slug });
  });

  test("normalises case, because slugs are lowercase in the database", () => {
    assert.deepEqual(slugFromUrl(`https://KICKIO.com/marketplace/${slug.toUpperCase()}`), {
      ok: true,
      slug,
    });
  });
});

describe("refusing everything else", () => {
  // The point of an allowlist: a loose parser would pull "123456" out of an eBay
  // URL and look it up as a slug, or match a slug-shaped string on a host that
  // has nothing to do with Kickio.
  test("refuses other hosts, naming the host so the admin can see why", () => {
    const result = slugFromUrl(`https://www.ebay.co.uk/itm/${slug}`);
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.reason : "", /ebay\.co\.uk/);
  });

  test("refuses a host that merely ends in the real one", () => {
    assert.equal(slugFromUrl(`https://kickio.com.evil.example/marketplace/${slug}`).ok, false);
    assert.equal(slugFromUrl(`https://notkickio.com/marketplace/${slug}`).ok, false);
  });

  test("refuses a Kickio link that is not a product page", () => {
    assert.equal(slugFromUrl("https://kickio.com/about").ok, false);
    assert.equal(slugFromUrl("https://kickio.com/marketplace").ok, false);
    assert.equal(slugFromUrl("https://kickio.com/marketplace/").ok, false);
  });

  test("refuses empty and malformed input", () => {
    assert.equal(slugFromUrl("").ok, false);
    assert.equal(slugFromUrl("   ").ok, false);
    assert.equal(slugFromUrl("not a url at all").ok, false);
    assert.equal(slugFromUrl("https://kickio.com/marketplace/not_a_slug!").ok, false);
  });
});
