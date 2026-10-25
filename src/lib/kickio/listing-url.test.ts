import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { dropTargetFromUrl } from "./listing-url.ts";

const ID = "21b7f8c2-6e2c-4203-9d0a-65f93232cf6b";
const SLUG = "1994-96-chelsea-away-shirt";

const listing = (input: string) => {
  const result = dropTargetFromUrl(input);
  assert.equal(result.ok, true, `expected ok for ${input}: ${result.ok === false ? result.reason : ""}`);
  assert.equal(result.ok && result.kind, "listing", `expected a listing for ${input}`);
  return result.ok && result.kind === "listing" ? result.id : "";
};
const product = (input: string) => {
  const result = dropTargetFromUrl(input);
  assert.equal(result.ok, true, `expected ok for ${input}: ${result.ok === false ? result.reason : ""}`);
  assert.equal(result.ok && result.kind, "product", `expected a product for ${input}`);
  return result.ok && result.kind === "product" ? result.slug : "";
};
const reason = (input: string) => {
  const result = dropTargetFromUrl(input);
  assert.equal(result.ok, false, `expected refusal for ${input}`);
  return result.ok === false ? result.reason : "";
};

describe("a link to one seller's copy", () => {
  test("the real shape", () => {
    assert.equal(listing(`https://kickio.com/listings/${ID}`), ID);
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
      assert.equal(listing(url), ID, url);
    }
  });

  test("a bare listing id", () => {
    assert.equal(listing(ID), ID);
    assert.equal(listing(ID.toUpperCase()), ID);
  });

  test("whitespace from a copy-paste", () => {
    assert.equal(listing(`  https://kickio.com/listings/${ID}  `), ID);
  });
});

describe("a link to the shirt itself", () => {
  test("the product page is accepted, not refused", () => {
    // It used to be refused with an instruction to go and find a listing link.
    // The shirt's page leads with its cheapest live listing, the post links
    // back to that page either way, and the admin pasting it means exactly
    // what the engine would have picked.
    assert.equal(product(`https://kickio.com/marketplace/${SLUG}`), SLUG);
    assert.equal(product(`https://www.kickio.com/marketplace/${SLUG}/`), SLUG);
  });

  test("a bare slug", () => {
    assert.equal(product(SLUG), SLUG);
    assert.equal(product(SLUG.toUpperCase()), SLUG);
  });

  test("a slug under the listings path is read as the shirt", () => {
    // Listings have no slug, so something readable in that position is a
    // shirt's address under the wrong prefix. This is the link that was
    // actually pasted on the day the refusal was removed, and "that is not a
    // listing id" was a true and useless answer to it.
    assert.equal(product(`https://kickio.com/listings/${SLUG}`), SLUG);
  });
});

describe("refusing", () => {
  test("another site, however well-formed", () => {
    assert.match(reason(`https://ebay.co.uk/listings/${ID}`), /only accepts links from kickio\.com/i);
    // A lookalike host is the case an allowlist exists for.
    assert.match(reason(`https://kickio.com.evil.example/listings/${ID}`), /only accepts/i);
  });

  test("a Kickio link that is neither", () => {
    const message = reason("https://kickio.com/about");
    assert.match(message, /not a \/listings\/ or \/marketplace\/ page/i);
  });

  test("a path with nothing on the end says what is missing", () => {
    assert.match(reason("https://kickio.com/listings"), /nothing on the end/i);
    assert.match(reason("https://kickio.com/listings/"), /nothing on the end/i);
    assert.match(reason("https://kickio.com/marketplace/"), /nothing on the end/i);
  });

  test("something that is neither an id nor an address", () => {
    // Underscores and capitals are not what Kickio generates, and guessing
    // would look up something that either does not exist or is another shirt.
    assert.match(reason("https://kickio.com/listings/not a slug"), /not a listing id or a shirt/i);
    assert.match(reason("https://kickio.com/marketplace/Some_Thing"), /not a listing id or a shirt/i);
  });

  test("empty, and not a URL at all", () => {
    assert.match(reason(""), /paste a kickio listing or shirt link/i);
    assert.match(reason("   "), /paste a kickio listing or shirt link/i);
    // One word with no slash takes the bare path, and a plain word is a
    // perfectly good slug shape - it fails later, against the catalogue.
    assert.equal(product("banana"), "banana");
    assert.match(reason("not a url"), /not a valid URL/i);
    assert.match(reason("https://"), /not a valid URL/i);
  });
});
