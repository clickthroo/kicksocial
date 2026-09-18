import { test, describe } from "node:test";
import assert from "node:assert/strict";
import {
  mayFeature,
  publicName,
  readAccess,
  summarise,
  subjectRefFor,
  parseCollectorRef,
  withCooldown,
  type ProfileRow,
  type CollectorProfileRow,
  type CollectionRow,
} from "./collector-access.ts";

const profile = (over: Partial<ProfileRow> = {}): ProfileRow => ({
  id: "11111111-1111-1111-1111-111111111111",
  username: "dave",
  display_name: "Dave",
  collection_public: true,
  deleted_at: null,
  ...over,
});

const collector = (over: Partial<CollectorProfileRow> = {}): CollectorProfileRow => ({
  user_id: "11111111-1111-1111-1111-111111111111",
  chosen_title: null,
  featured_consent: true,
  streak_weeks: 0,
  ...over,
});

const owns = (userId: string, n: number, over: Partial<CollectionRow> = {}): CollectionRow[] =>
  Array.from({ length: n }, (_, i) => ({
    user_id: userId,
    product_id: `p-${userId}-${i}`,
    acquired_at: `2026-01-${String((i % 28) + 1).padStart(2, "0")}`,
    hidden: false,
    ...over,
  }));

describe("the two opt-outs", () => {
  test("both true means postable - Kickio defaults both to true", () => {
    assert.equal(mayFeature(profile(), collector()), true);
  });

  test("either switch off means not postable", () => {
    assert.equal(mayFeature(profile({ collection_public: false }), collector()), false);
    assert.equal(mayFeature(profile(), collector({ featured_consent: false })), false);
  });

  test("a missing collector_profile row is not consent", () => {
    // That user has never been shown the switch. Reading a column default as
    // agreement is how an opt-out turns into a surprise. The role SQL fails
    // closed the same way.
    assert.equal(mayFeature(profile(), undefined), false);
  });

  test("null is not true - neither switch is inferred from the other", () => {
    assert.equal(mayFeature(profile({ collection_public: null }), collector()), false);
    assert.equal(mayFeature(profile(), collector({ featured_consent: null })), false);
  });

  test("a deleted profile is never postable", () => {
    assert.equal(mayFeature(profile({ deleted_at: "2026-01-01" }), collector()), false);
  });
});

describe("what a collector is called", () => {
  test("prefers the display name they chose", () => {
    assert.equal(publicName(profile()), "Dave");
  });

  test("falls back to the handle", () => {
    assert.equal(publicName(profile({ display_name: null })), "@dave");
  });

  test("returns null rather than inventing one", () => {
    // profiles carries full_name, city and last_login_city. None of them are
    // reachable from here, and an anonymous post is better than a real name.
    assert.equal(publicName(profile({ display_name: "  ", username: null })), null);
  });
});

describe("blind is not empty", () => {
  test("rows means access", () => {
    const verdict = readAccess(9, 120);
    assert.equal(verdict.ok, true);
  });

  test("profiles but no collections means the grant is missing, and says so", () => {
    // Under RLS a role with no matching policy reads zero rows and raises no
    // error. Reporting that as "no collectors qualify" would be a plausible
    // lie that could stand for weeks.
    const verdict = readAccess(9, 0);
    assert.equal(verdict.ok, false);
    assert.equal(verdict.ok === false && verdict.blind, true);
    assert.match(verdict.ok === false ? verdict.reason : "", /cannot see Kickio collections/);
    // Names the fix, not just the symptom - this string is what a reviewer
    // reads on the run log six weeks from now.
    assert.match(verdict.ok === false ? verdict.reason : "", /kickio-read-only-role\.sql/);
  });

  test("no profiles at all is a different problem, reported differently", () => {
    const verdict = readAccess(0, 0);
    assert.equal(verdict.ok, false);
    assert.equal(verdict.ok === false && verdict.blind, false);
  });
});

describe("summarising collectors", () => {
  const dave = "11111111-1111-1111-1111-111111111111";
  const sam = "22222222-2222-2222-2222-222222222222";

  test("counts only shirts, biggest collection first", () => {
    const out = summarise(
      [profile(), profile({ id: sam, username: "sam", display_name: "Sam" })],
      [collector(), collector({ user_id: sam })],
      [...owns(dave, 3), ...owns(sam, 7)],
    );
    assert.deepEqual(out.map((c) => [c.name, c.shirts]), [["Sam", 7], ["Dave", 3]]);
  });

  test("hidden shirts are not counted", () => {
    // Hiding one shirt inside a public collection is a choice about that
    // shirt, and it outranks the collection-level setting.
    const out = summarise(
      [profile()],
      [collector()],
      [...owns(dave, 3), ...owns(dave, 4, { hidden: true })],
    );
    assert.equal(out[0].shirts, 3);
  });

  test("a collector who opted out does not appear at all", () => {
    const out = summarise([profile()], [collector({ featured_consent: false })], owns(dave, 40));
    assert.deepEqual(out, []);
  });

  test("a collector with no profile row does not appear", () => {
    assert.deepEqual(summarise([], [collector()], owns(dave, 40)), []);
  });

  test("tracks when they last added one", () => {
    const out = summarise([profile()], [collector()], [
      { user_id: dave, product_id: "a", acquired_at: "2024-05-01", hidden: false },
      { user_id: dave, product_id: "b", acquired_at: "2026-02-09", hidden: false },
      { user_id: dave, product_id: "c", acquired_at: null, hidden: false },
    ]);
    assert.equal(out[0].lastAcquired, "2026-02-09");
  });
});

describe("one cooldown across both recipes", () => {
  const dave = "11111111-1111-1111-1111-111111111111";
  const base = { userId: dave, name: "Dave", title: null, shirts: 40, lastAcquired: null };
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString();

  test("a spotlight post blocks a progress post about the same person", () => {
    // Two private cooldowns would put one collector on the feed twice in a
    // fortnight under two headlines, which reads worse than a repeat.
    const posted = new Map([[dave, daysAgo(30)]]);
    assert.equal(withCooldown([base], posted, 180)[0].available, false);
  });

  test("available again once the cooldown passes", () => {
    const posted = new Map([[dave, daysAgo(200)]]);
    assert.equal(withCooldown([base], posted, 180)[0].available, true);
  });

  test("never posted is available", () => {
    assert.equal(withCooldown([base], new Map(), 180)[0].available, true);
  });

  test("available collectors sort above greyed ones, whatever their size", () => {
    const sam = "22222222-2222-2222-2222-222222222222";
    const out = withCooldown(
      [base, { ...base, userId: sam, name: "Sam", shirts: 5 }],
      new Map([[dave, daysAgo(10)]]),
      180,
    );
    assert.deepEqual(out.map((c) => c.name), ["Sam", "Dave"]);
  });
});

describe("subject refs", () => {
  const dave = "11111111-1111-1111-1111-111111111111";

  test("carry the person, so both recipes share one cooldown", () => {
    assert.equal(parseCollectorRef(subjectRefFor(dave, "spotlight")), dave);
    assert.equal(parseCollectorRef(subjectRefFor(dave, "progress", ":everton-home")), dave);
  });

  test("another recipe's ref does not parse", () => {
    assert.equal(parseCollectorRef("collection:kickio-grail-list@39/136"), null);
    assert.equal(parseCollectorRef("club:arsenal"), null);
  });
});
