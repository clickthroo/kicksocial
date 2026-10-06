/**
 * The posts a person makes by hand, and where each one is made.
 *
 * ONE LIST, BECAUSE TWO LISTS DRIFTED. The /new page knew about seven
 * builders; the /runs page knew about four, hardcoded, and sent every one of
 * them to /sold under the label "Add a sale". So Price History, Who Am I?,
 * Battle, Kickio Classics and PhotoProd all offered to add a sale, which is
 * not what any of them does, and the link went somewhere unrelated. Three of
 * those recipes were added in a single afternoon and nobody updated the second
 * list, which is exactly what a second list is for.
 *
 * `key` is `post_drafts.recipe_key` and `recipe_runs.recipe_key`, so a run can
 * be matched back to the page that would make another one. A recipe absent
 * from here is one cron drives, and /runs offers it a Run now button instead.
 */
export type BuilderGroup = "photograph" | "link" | "list";

export interface Builder {
  /** Matches `recipe_runs.recipe_key`. */
  key: string;
  name: string;
  href: string;
  /** The action on /runs. A verb and an object, not a generic "Run". */
  action: string;
  /** What it is, on /new. */
  blurb: string;
  group: BuilderGroup;
}

export const BUILDER_GROUPS: Array<{ key: BuilderGroup; title: string; note: string }> = [
  {
    key: "photograph",
    title: "You have a photograph",
    note: "One you own or have licensed. It carries the post; the shirt's details go over it.",
  },
  {
    key: "link",
    title: "You have a Kickio link",
    note: "Paste it and the shirt's details are read off Kickio's own record.",
  },
  {
    key: "list",
    title: "Pick from a list the engine builds",
    note: "It works out what currently qualifies; you choose which one.",
  },
];

export const BUILDERS: Builder[] = [
  {
    key: "kickio_classics",
    name: "Kickio Classics",
    href: "/classics",
    action: "Pick a shirt",
    blurb:
      "A dear pre-2000 shirt, under a photograph of its era. Pick from the shelf the " +
      "engine builds, and it suggests who to look for.",
    group: "photograph",
  },
  {
    key: "photo_prod",
    name: "PhotoProd",
    href: "/photoprod",
    action: "Paste a link",
    blurb:
      "The same card with no shelf in front of it. Paste the link to any shirt on " +
      "Kickio and give it a picture.",
    group: "photograph",
  },
  {
    key: "kickio_drop",
    name: "Kickio Drops",
    href: "/drops",
    action: "Pick a listing",
    blurb: "One listing that is live right now, promoted by hand.",
    group: "link",
  },
  {
    key: "grail_sale",
    name: "Grail Sale",
    href: "/sold",
    action: "Add a sale",
    blurb: "A shirt that has just sold, and what it went for.",
    group: "link",
  },
  {
    key: "battle",
    name: "Battle of the Shirts",
    href: "/battle",
    action: "Pick two shirts",
    blurb: "Two shirts, one vote, and an argument in the comments.",
    group: "list",
  },
  {
    key: "who_am_i",
    name: "Who Am I?",
    href: "/who-am-i",
    action: "Pick a career",
    blurb: "Six shirts from one career, and a question. Never names the player.",
    group: "list",
  },
  {
    key: "price_history",
    name: "Price History",
    href: "/price-history",
    action: "Pick a shirt",
    blurb: "What one shirt has actually sold for, over time, as a chart.",
    group: "list",
  },
];

/** The builder for a recipe key, or undefined when cron drives that recipe. */
export function builderFor(key: string): Builder | undefined {
  return BUILDERS.find((b) => b.key === key);
}

export function buildersIn(group: BuilderGroup): Builder[] {
  return BUILDERS.filter((b) => b.group === group);
}
