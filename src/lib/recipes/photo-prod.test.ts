import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { CARD_LABEL, PHOTO_PROD_BRIEF, PHOTO_PROD_KEY, runPhotoProd } from "./photo-prod.ts";
import { perishKind } from "../engine/freshness.ts";
import { stripEmDashes } from "../copy/dashes.ts";

describe("what PhotoProd refuses before it touches Kickio", () => {
  // Each of these returns before any lookup, so they run without a database.
  // That is the design as much as a convenience: a missing credit is not worth
  // a round trip, and a copy generation costs money.

  test("no photograph at all", async () => {
    const result = await runPhotoProd({
      productUrl: "https://kickio.com/marketplace/a-shirt",
      photoUrl: "",
      photoCredit: "Getty",
    });
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.reason : "", /photograph/i);
  });

  test("a link to the page an image sits on, rather than the image", async () => {
    // The commonest mistake, and the one worth catching before anything is
    // spent on it.
    const result = await runPhotoProd({
      productUrl: "https://kickio.com/marketplace/a-shirt",
      photoUrl: "https://example.test/gallery/famous-goal",
      photoCredit: "Getty",
    });
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.reason : "", /image file/i);
  });

  test("no credit", async () => {
    // Not a nicety. The image is published by this post and almost every image
    // worth using carries an attribution its licence insists on.
    const result = await runPhotoProd({
      productUrl: "https://kickio.com/marketplace/a-shirt",
      photoUrl: "https://example.test/photo.jpg",
      photoCredit: "   ",
    });
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.reason : "", /credit/i);
  });

  test("the photograph is checked before the link, so a bad link is not the first complaint", async () => {
    // Both are wrong here. The one named should be the one the person can fix
    // without going back to Kickio.
    const result = await runPhotoProd({
      productUrl: "not a url at all",
      photoUrl: "",
      photoCredit: "Getty",
    });
    assert.equal(result.ok, false);
    assert.match(result.ok === false ? result.reason : "", /photograph/i);
  });
});

describe("how PhotoProd is wired to the rest", () => {
  test("it has its own recipe key, so its runs and cooldowns are its own", () => {
    assert.equal(PHOTO_PROD_KEY, "photo_prod");
    assert.notEqual(PHOTO_PROD_KEY, "kickio_classics");
  });

  test("the queue knows what goes out of date about it", () => {
    // A recipe missing from PERISHES falls back to "listing", which is the safe
    // reading - but falling back silently is how one ends up unclassified for
    // months. This asserts it was decided.
    assert.equal(perishKind(PHOTO_PROD_KEY), "listing");
  });

  test("the card carries no sub-label, unlike Classics", () => {
    // `classic_card` draws both recipes. An empty string means no label; an
    // absent one would fall back to "KICKIO CLASSICS", which this is not.
    assert.equal(CARD_LABEL, "");
  });

  test("the brief tells the copy what to do when nothing is for sale", () => {
    // The one state Classics can never be in and this one often is. A post
    // sending somebody to buy a shirt that is not there costs more than a
    // quieter post.
    assert.match(PHOTO_PROD_BRIEF, /for_sale/);
    assert.match(PHOTO_PROD_BRIEF, /do not imply the shirt can\s*\n?be bought/i);
  });

  test("the brief forbids inventing history, as every photo-led brief must", () => {
    assert.match(PHOTO_PROD_BRIEF, /Never invent a match, a goal, a score, a transfer or a date/);
  });

  test("the brief has no em dashes in it", () => {
    // The ban is in the brand voice and the brief is prose that reaches the
    // model, so it has to hold here too. Checked through the matcher rather
    // than against a literal, because the character is deliberately confined
    // to the three files that have a reason to hold it.
    assert.equal(stripEmDashes(PHOTO_PROD_BRIEF), PHOTO_PROD_BRIEF);
  });
});
