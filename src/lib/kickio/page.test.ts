import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { chunk, pageAll, pageIn, PAGE, CHUNK } from "./page.ts";

/** A fake table of `total` rows that honours `range` the way PostgREST does. */
function table(total: number) {
  const calls: Array<[number, number]> = [];
  const fetchPage = (from: number, to: number) => {
    calls.push([from, to]);
    const size = Math.min(to - from + 1, PAGE);
    const rows = [];
    for (let i = from; i < Math.min(from + size, total); i++) rows.push({ i });
    return Promise.resolve({ data: rows, error: null });
  };
  return { calls, fetchPage };
}

describe("chunking a filter list", () => {
  test("keeps every value exactly once, in order, within a batch", () => {
    const ids = Array.from({ length: 1171 }, (_, i) => `id-${i}`);
    const batches = chunk(ids, 200);
    assert.equal(batches.length, 6);
    assert.deepEqual(batches.flat(), ids);
    assert.equal(batches[5].length, 171);
  });

  test("an empty list is no requests, not one empty request", () => {
    assert.deepEqual(chunk([]), []);
  });

  test("a list shorter than the chunk is one batch", () => {
    assert.deepEqual(chunk([1, 2, 3], 200), [[1, 2, 3]]);
  });

  test("refuses a chunk size that would never terminate", () => {
    assert.throws(() => chunk([1], 0), /positive integer/);
  });

  /**
   * The real failure: 1,171 uuids became a 29,276-character query string and
   * the gateway answered 400. 19,510 characters is known to pass.
   */
  test("the default chunk keeps a uuid filter well inside the URL limit", () => {
    const uuids = Array.from({ length: 5000 }, () => "8eb18556-1b80-422f-b7e5-fab91a4a2f0d");
    for (const batch of chunk(uuids)) {
      // uuid + the encoded comma between them.
      const queryLength = batch.join("%2C").length;
      assert.ok(
        queryLength < 12_000,
        `a batch of ${batch.length} is ${queryLength} characters of URL`,
      );
    }
  });
});

describe("reading past the row cap", () => {
  /**
   * Value Pick asked for 5,000 live listings and PostgREST returned 1,000 of
   * the 1,649 that exist, with HTTP 200 and no error. Paging is what makes the
   * other 649 visible.
   */
  test("returns all 1,649 rows, not the first page", async () => {
    const { fetchPage, calls } = table(1649);
    const rows = await pageAll("Loading listings", fetchPage);
    assert.equal(rows.length, 1649);
    assert.deepEqual(calls, [
      [0, 999],
      [1000, 1999],
    ]);
  });

  test("a single short page is one request", async () => {
    const { fetchPage, calls } = table(12);
    assert.equal((await pageAll("x", fetchPage)).length, 12);
    assert.equal(calls.length, 1);
  });

  test("an exactly-full table asks once more to learn it is done", async () => {
    const { fetchPage, calls } = table(PAGE);
    assert.equal((await pageAll("x", fetchPage)).length, PAGE);
    assert.equal(calls.length, 2);
  });

  test("an empty table is empty, not an error", async () => {
    const { fetchPage } = table(0);
    assert.deepEqual(await pageAll("x", fetchPage), []);
  });
});

describe("failing loudly", () => {
  /**
   * The distinction that produced the bug report: a broken read must not
   * arrive at the same place as an honest "nothing qualifies". A thrown error
   * is recorded as `failed`; a returned reason is shown as "Nothing to post".
   */
  test("a query error throws, naming the read", async () => {
    await assert.rejects(
      () => pageAll("Loading matching sales", () => Promise.resolve({ data: null, error: { message: "Bad Request" } })),
      /Loading matching sales failed: Bad Request/,
    );
  });

  test("a server ignoring range is refused rather than truncated", async () => {
    const always = () =>
      Promise.resolve({ data: Array.from({ length: PAGE }, (_, i) => ({ i })), error: null });
    await assert.rejects(() => pageAll("x", always, 3000), /ignoring the requested range/);
  });

  test("an error in a later chunk is not swallowed by the earlier ones", async () => {
    let seen = 0;
    await assert.rejects(
      () =>
        pageIn("Loading matching sales", [1, 2, 3, 4], () => {
          seen += 1;
          return seen < 3
            ? Promise.resolve({ data: [], error: null })
            : Promise.resolve({ data: null, error: { message: "Bad Request" } });
        }, 1),
      /Loading matching sales failed/,
    );
  });
});

describe("chunked and paged together", () => {
  test("every chunk is asked for, and all rows come back", async () => {
    const ids = Array.from({ length: 450 }, (_, i) => i);
    const batches: number[][] = [];
    const rows = await pageIn<{ i: number }, number>(
      "Loading matching sales",
      ids,
      (batch, from, to) => {
        if (from === 0) batches.push(batch);
        return table(batch.length).fetchPage(from, to);
      },
      200,
    );
    assert.equal(batches.length, 3);
    assert.deepEqual(batches.map((b) => b.length), [200, 200, 50]);
    assert.equal(rows.length, 450);
  });

  test("no values means no requests at all", async () => {
    let called = false;
    const rows = await pageIn("x", [], () => {
      called = true;
      return Promise.resolve({ data: [], error: null });
    });
    assert.deepEqual(rows, []);
    assert.equal(called, false);
  });

  test("the default chunk is the one the helper documents", () => {
    assert.equal(CHUNK, 200);
    assert.equal(PAGE, 1000);
  });
});
