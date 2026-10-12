import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

/**
 * A "use server" file may export async functions and NOTHING ELSE.
 *
 * This is not a style rule, it is a runtime one. `profile/actions.ts` exported
 * an object - the empty form state, three lines long - and the file built,
 * type-checked, deployed and rendered without complaint. The failure came on
 * the first click of the button:
 *
 *   A "use server" file can only export async functions, found object.
 *
 * Next throws that while loading the module to run the action, which means it
 * never reaches the action's own error handling: the browser gets a blank
 * error page with a digest, every time, for days. Nothing in the normal build
 * or test run says a word about it.
 *
 * Checked by reading the source rather than importing it, because importing a
 * server action module needs the Next request runtime and this has to run in
 * the bare test runner.
 *
 * Type-only exports (`interface`, `type`) are erased before any of this
 * applies, so they are allowed and common.
 */
function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const path = join(dir, entry);
    if (statSync(path).isDirectory()) out.push(...filesUnder(path));
    else if (/\.tsx?$/.test(entry)) out.push(path);
  }
  return out;
}

const serverFiles = filesUnder("src").filter((path) =>
  /^\s*(["'])use server\1\s*;?/m.test(readFileSync(path, "utf8").slice(0, 400)),
);

describe("every \"use server\" module", () => {
  test("there are some, so the scan is testing something", () => {
    assert.ok(serverFiles.length > 5, `only found ${serverFiles.length}`);
  });

  for (const path of serverFiles) {
    test(`${path} exports only async functions`, () => {
      const source = readFileSync(path, "utf8");
      const offenders: string[] = [];
      for (const line of source.split("\n")) {
        const match = /^export\s+(.*)$/.exec(line.trim());
        if (!match) continue;
        const rest = match[1]!;
        // Allowed: an async function, and anything the compiler erases.
        if (/^async function\s/.test(rest)) continue;
        if (/^(type|interface)\s/.test(rest)) continue;
        if (/^\{[^}]*\}\s*from\s/.test(rest) && /\btype\b/.test(rest)) continue;
        offenders.push(line.trim());
      }
      assert.deepEqual(
        offenders,
        [],
        `${path} exports something that is not an async function:\n  ${offenders.join("\n  ")}`,
      );
    });
  }
});
