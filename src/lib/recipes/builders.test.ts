import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { BUILDERS, BUILDER_GROUPS, builderFor, buildersIn } from "./builders.ts";

/**
 * The registry that replaced three separate lists.
 *
 * /new knew about seven builders, /runs about four, and Nav kept a third copy
 * of the paths. The /runs copy sent every one of its four to /sold under the
 * label "Add a sale", which is true of exactly one of them, and three recipes
 * added in a single afternoon never reached it at all. These tests are what
 * stops the next one drifting the same way.
 */
describe("every builder points somewhere real", () => {
  for (const builder of BUILDERS) {
    test(`${builder.name} has a page at ${builder.href}`, () => {
      // Checked against the filesystem rather than a second list, which is the
      // whole point: a renamed route fails here instead of 404ing in use.
      const path = `src/app${builder.href}/page.tsx`;
      assert.ok(existsSync(path), `${path} does not exist`);
    });
  }

  test("keys are unique", () => {
    const keys = BUILDERS.map((b) => b.key);
    assert.equal(new Set(keys).size, keys.length);
  });

  test("hrefs are unique", () => {
    const hrefs = BUILDERS.map((b) => b.href);
    assert.equal(new Set(hrefs).size, hrefs.length);
  });

  test("every builder is in a group that exists", () => {
    const groups = new Set(BUILDER_GROUPS.map((g) => g.key));
    for (const builder of BUILDERS) {
      assert.ok(groups.has(builder.group), `${builder.name} is in group "${builder.group}"`);
    }
  });

  test("no group is empty, because /new would print a heading over nothing", () => {
    for (const group of BUILDER_GROUPS) {
      assert.ok(buildersIn(group.key).length > 0, `${group.title} has no builders`);
    }
  });
});

describe("the action says what the page actually asks for", () => {
  test("only Grail Sale offers to add a sale", () => {
    // The bug this registry fixes: Price History, Who Am I?, Battle, Kickio
    // Classics, Kickio Drops and PhotoProd all read "Add a sale" and all linked
    // to /sold, which is not what any of them does.
    const addsASale = BUILDERS.filter((b) => /add a sale/i.test(b.action));
    assert.deepEqual(addsASale.map((b) => b.key), ["grail_sale"]);
  });

  test("only Grail Sale links to /sold", () => {
    const toSold = BUILDERS.filter((b) => b.href === "/sold");
    assert.deepEqual(toSold.map((b) => b.key), ["grail_sale"]);
  });

  test("every action is a verb and an object, not a bare word", () => {
    // "Run" or "Go" on seven different rows tells a reader nothing about which
    // one they want.
    for (const builder of BUILDERS) {
      assert.ok(builder.action.trim().includes(" "), `${builder.name}: "${builder.action}"`);
      assert.ok(builder.action.length <= 20, `${builder.name}: "${builder.action}" is too long`);
    }
  });

  test("every builder says what it is", () => {
    for (const builder of BUILDERS) {
      assert.ok(builder.blurb.length > 20, builder.name);
      assert.ok(builder.name.trim() !== "", builder.key);
    }
  });
});

describe("looking a recipe up by its run key", () => {
  test("a builder is found by the key its runs are recorded under", () => {
    // /runs matches `recipe_runs.recipe_key` against this, so a mismatch shows
    // a Run now button on a recipe cron cannot run.
    assert.equal(builderFor("photo_prod")?.href, "/photoprod");
    assert.equal(builderFor("kickio_classics")?.href, "/classics");
    assert.equal(builderFor("grail_sale")?.action, "Add a sale");
  });

  test("a cron recipe has no builder, so /runs offers it Run now", () => {
    for (const key of ["grail_of_the_day", "yesterday_sales", "dropzone", "price_trends"]) {
      assert.equal(builderFor(key), undefined, key);
    }
  });

  test("an unknown key yields undefined rather than a wrong page", () => {
    assert.equal(builderFor("retired_recipe"), undefined);
  });
});
