import { test } from "node:test";
import assert from "node:assert/strict";
import { loginMessage, passwordProblem } from "./admin.ts";

test("the message never says which half was wrong", () => {
  // "No such user" and "wrong password" have to read identically, or the form
  // becomes a way to find out who has an account.
  assert.equal(loginMessage({ ok: false, reason: "invalid" }), "Email or password not recognised.");
});

test("a locked or disabled account says so, because waiting is the remedy", () => {
  assert.match(loginMessage({ ok: false, reason: "locked" }), /15 minutes/);
  assert.match(loginMessage({ ok: false, reason: "disabled" }), /turned off/);
});

test("a new password has to be long enough", () => {
  assert.match(passwordProblem("short") ?? "", /12 characters/);
  assert.equal(passwordProblem("a-long-enough-password"), null);
});

test("a password that is only spaces at the edges is refused", () => {
  assert.match(passwordProblem(" leading-space-here ") ?? "", /space/);
});
