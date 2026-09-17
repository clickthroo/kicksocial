#!/usr/bin/env node
/**
 * Inline a logo file into src/lib/render/brand-mark.ts as a data URI.
 *
 * Usage: node scripts/embed-mark.mjs path/to/kickio-mark.png
 */
import { readFileSync, writeFileSync } from "node:fs";
import { extname, resolve } from "node:path";

const source = process.argv[2];
if (!source) {
  console.error("Usage: node scripts/embed-mark.mjs <path-to-png-or-jpg>");
  process.exit(1);
}

const ext = extname(source).toLowerCase();
const mime = ext === ".png" ? "image/png" : ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : null;
if (!mime) {
  // Satori decodes neither SVG reliably nor WebP at all, and a logo that
  // renders as an empty box is worse than no logo.
  console.error(`Unsupported format "${ext}". Use PNG or JPEG.`);
  process.exit(1);
}

const bytes = readFileSync(source);
const dataUri = `data:${mime};base64,${bytes.toString("base64")}`;

// Every card carries this, so an oversized file is paid for on every render.
const kb = Math.round(bytes.length / 1024);
if (kb > 400) {
  console.error(`That file is ${kb}KB. Resize it to ~512px square first.`);
  process.exit(1);
}

const target = resolve("src/lib/render/brand-mark.ts");
const current = readFileSync(target, "utf8");
const updated = current.replace(
  /export const KICKIO_MARK: string \| null = [\s\S]*?;\n$/,
  `export const KICKIO_MARK: string | null =\n  "${dataUri}";\n`,
);
if (updated === current) {
  console.error("Could not find the KICKIO_MARK constant to replace.");
  process.exit(1);
}
writeFileSync(target, updated);
console.log(`Embedded ${source} (${kb}KB) into ${target}`);
