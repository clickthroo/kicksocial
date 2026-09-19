import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { listingIdFromUrl } from "./listing-url.ts";

const ID = "21b7f8c2-6e2c-4203-9d0a-65f93232cf6b";

const ok = (input: string) => {
  const result = listingIdFromUrl(input);
  assert.equal(result.ok, true, `expected ok for ${input}: ${result.ok === false ? result.reason : ""}`);
  return result.ok ? result.id : "";
};
const reason = (input: string) => {
  const result = listingIdFromUrl(input);
  assert.equal(result.ok, false, `expected refusal for ${input}`);
  return result.ok === false ? result.reason : "";
};

describe("accepting a listing link", () => {
  test("the real shape", () => {
    assert.equal(ok(`https://kickio.com/listings/${ID}`), ID);
  });

  test("www, http, trailing slash, query and fragment", () => {
    for (const url of [
      `https://www.kickio.com/listings/${ID}`,
      `http://kickio.com/listings/${ID}`,
      `kickio.com/listings/${ID}`,
      `https://kickio.com/listings/${ID}/`,
      `https://kickio.com/listings/${ID}?utm_source=x`,
      `https://kickio.com/listings/${ID}#photos`,
    ]) {
      assert.equal(ok(url), ID, url);
    }
  });

  test("a bare listing id", () => {
    assert.equal(ok(ID), ID);
    assert.equal(ok(ID.toUpperCase()), ID);
  });

  test("whitespace from a copy-paste", () => {
    assert.equal(ok(`  https://kickio.com/listings/${ID}  `), ID);
  });
});

describe("refusing", () => {
  test("a product page is named as such, because it is the likely mistake", () => {
    // Product in, listing out is the whole point of this recipe, so "that is
    // not a listing URL" would be a true and useless thing to say.
    const message = reason("https://kickio.com/marketplace/2002-03-rangers-fc-away-shirt");
    assert.match(message, /product page, not a listing/i);
    assert.match(message, /one seller/i);
  });

  test("another site, however well-formed", () => {
    assert.match(reason(`https://ebay.co.uk/listings/${ID}`), /only accepts links from kickio\.com/i);
    // A lookalike host is the case an allowlist exists for.
    assert.match(reason(`https://kickio.com.evil.example/listings/${ID}`), /only accepts/i);
  });

  test("a Kickio link that is not a listing", () => {
    assert.match(reason("https://kickio.com/about"), /not a \/listings\/ page/i);
  });

  test("a listings link with nothing after it says what is missing", () => {
    // Both forms reach the prefix and stop there, so the useful message is
    // "there is no id on the end", not "this is not a listings page".
    assert.match(reason("https://kickio.com/listings"), /no listing id/i);
    assert.match(reason("https://kickio.com/listings/"), /no listing id/i);
  });

  test("a slug where the id should be", () => {
    // Listings have no slug. Something readable here means the admin has
    // pasted the wrong kind of link, and guessing would look one up that
    // either does not exist or belongs to a different shirt.
    assert.match(reason("https://kickio.com/listings/2002-03-rangers-fc-away-shirt"), /is not a listing id/i);
  });

  test("empty, and not a URL at all", () => {
    assert.match(reason(""), /paste a kickio listing url/i);
    assert.match(reason("   "), /paste a kickio listing url/i);
    // One word with no slash takes the bare-id path; anything with a space in
    // it is treated as a URL, and fails as one.
    assert.match(reason("banana"), /not a Kickio listing URL or listing id/i);
    assert.match(reason("not a url"), /not a valid URL/i);
    assert.match(reason("https://"), /not a valid URL/i);
  });
});
