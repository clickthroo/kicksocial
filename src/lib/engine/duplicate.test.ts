import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { isDuplicateSubject, DUPLICATE_SUBJECT_INDEX } from "./duplicate.ts";

const violation = (constraint: string) => ({
  code: "23505",
  message: `duplicate key value violates unique constraint "${constraint}"`,
});

describe("telling a duplicate subject from a real failure", () => {
  test("recognises the one-live-post-per-subject index", () => {
    assert.equal(isDuplicateSubject(violation(DUPLICATE_SUBJECT_INDEX)), true);
  });

  /**
   * The point of matching the constraint by name. A clash on the primary key
   * or on any index added later is a genuine fault, and swallowing it as
   * "already covered" would hide it behind a routine-looking skip.
   */
  test("another unique constraint stays a failure", () => {
    assert.equal(isDuplicateSubject(violation("post_drafts_pkey")), false);
  });

  test("other database errors are not duplicates", () => {
    assert.equal(isDuplicateSubject({ code: "23503", message: "foreign key" }), false);
    assert.equal(isDuplicateSubject({ code: "42501", message: "permission denied" }), false);
  });

  test("survives whatever shape the error turns up in", () => {
    assert.equal(isDuplicateSubject(null), false);
    assert.equal(isDuplicateSubject(undefined), false);
    assert.equal(isDuplicateSubject("23505"), false);
    assert.equal(isDuplicateSubject({ code: "23505" }), false);
  });
});
