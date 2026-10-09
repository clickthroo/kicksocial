import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { displayNameProblem, profileLabel } from "./profile.ts";
import { passwordProblem } from "./admin.ts";

describe("what a display name has to clear", () => {
  test("an ordinary name passes", () => {
    assert.equal(displayNameProblem("Dave"), null);
    assert.equal(displayNameProblem("Siobhán O'Neill"), null);
  });

  test("empty is allowed, because clearing it is a real choice", () => {
    // The email is the fallback, so an empty name is "show my email" rather
    // than a validation failure.
    assert.equal(displayNameProblem(""), null);
    assert.equal(displayNameProblem("   "), null);
  });

  test("one character is refused", () => {
    assert.match(displayNameProblem("D") ?? "", /two characters/);
  });

  test("something long enough to break the header is refused", () => {
    assert.equal(displayNameProblem("x".repeat(60)), null);
    assert.match(displayNameProblem("x".repeat(61)) ?? "", /60 characters/);
  });

  test("a line break is refused rather than saved invisibly", () => {
    // It renders as a gap in the header with no visible cause.
    assert.match(displayNameProblem("Dave\nSmith") ?? "", /line break/);
    assert.match(displayNameProblem("Dave\u0000") ?? "", /control character/);
  });

  test("the length rules count the trimmed name", () => {
    // Otherwise padding with spaces passes a check the saved value then fails.
    assert.match(displayNameProblem("  D  ") ?? "", /two characters/);
    assert.equal(displayNameProblem("  Dave  "), null);
  });
});

describe("what the header shows", () => {
  test("the name when there is one", () => {
    assert.equal(profileLabel({ email: "a@b.test", displayName: "Dave" }), "Dave");
  });

  test("the email when there is not", () => {
    assert.equal(profileLabel({ email: "a@b.test", displayName: null }), "a@b.test");
    assert.equal(profileLabel({ email: "a@b.test", displayName: "" }), "a@b.test");
    // A name of spaces is not a name, and a blank header helps nobody.
    assert.equal(profileLabel({ email: "a@b.test", displayName: "   " }), "a@b.test");
  });
});

describe("the password rule is the same one the sign-in page uses", () => {
  test("twelve characters is the floor", () => {
    // Shared with the first-sign-in flow on purpose: two different minimums
    // for the same password is how one of them ends up weaker.
    assert.match(passwordProblem("short") ?? "", /12 characters/);
    assert.equal(passwordProblem("a-long-enough-one"), null);
  });

  test("a leading or trailing space is refused", () => {
    // It survives a paste and then cannot be typed back reliably.
    assert.match(passwordProblem(" a-long-enough-one") ?? "", /space/);
    assert.match(passwordProblem("a-long-enough-one ") ?? "", /space/);
  });
});
