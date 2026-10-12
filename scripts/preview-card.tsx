/**
 * Render a template to PNG files without a database, a network or a deploy.
 *
 *   npx tsc scripts/preview-card.tsx --outDir .next/preview-out --jsx react-jsx \
 *     --module esnext --moduleResolution bundler --target es2022 \
 *     --rewriteRelativeImportExtensions --skipLibCheck --esModuleInterop
 *   echo '{"type":"module"}' > .next/preview-out/package.json
 *   node .next/preview-out/scripts/preview-card.js heritage_card card sweep,paper
 *
 * Arguments: the key in SAMPLE_DRAFTS, a filename stem, and a comma-separated
 * list of styles. Every format is written for each style.
 *
 * WHY IT EXISTS. /api/render/preview does the same job and needs the engine's
 * credentials to load the brand, which a checkout does not have - so the only
 * way to look at a card was to deploy it. This caught the 16:9 heritage card
 * overflowing its own frame by 54px, which no test would have: Satori reports
 * no overflow, it just draws past the edge.
 *
 * THE PHOTOGRAPHS ARE STUBS. Satori fetches image URLs, and the sample drafts
 * point at Kickio's storage bucket, which a sandbox usually cannot reach. A
 * grey plate in each tile is the right fidelity for checking a composition
 * anyway: what is being looked at is where things sit, not what is in them.
 * It also means the house brand mark is missing here and the wordmark is drawn
 * instead, which is larger than the real lockup.
 */
import { writeFileSync } from "node:fs";
import { ImageResponse } from "next/dist/compiled/@vercel/og/index.node.js";
import { templateFor, FORMATS, type FormatKey } from "../src/lib/render/templates.tsx";
import { SAMPLE_DRAFTS } from "../src/lib/render/sample.ts";
import { DEFAULT_BRAND } from "../src/lib/brand/settings.ts";

const template = process.argv[2] ?? "heritage_card";
const out = process.argv[3] ?? "card";
const styles = (process.argv[4] ?? "sweep").split(",");

const stub =
  "data:image/svg+xml;base64," +
  Buffer.from(
    `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400"><rect width="400" height="400" fill="#cbced3"/><circle cx="200" cy="170" r="110" fill="#9aa0a8"/><rect x="90" y="250" width="220" height="120" fill="#aeb4bc"/></svg>`,
  ).toString("base64");

const draft = SAMPLE_DRAFTS[template]!;
const data = draft.source_data as Record<string, unknown>;
const patched = {
  ...draft,
  source_data: {
    ...data,
    ...(Array.isArray(data.images) ? { images: (data.images as unknown[]).map(() => stub) } : {}),
  },
};

for (const style of styles) {
  for (const format of ["ig", "x", "tiktok"] as FormatKey[]) {
    const response = new ImageResponse(
      templateFor(patched, format, { style: style as never, brand: DEFAULT_BRAND }),
      FORMATS[format],
    );
    const buffer = Buffer.from(await response.arrayBuffer());
    const path = `${out}-${style}-${format}.png`;
    writeFileSync(path, buffer);
    console.log(path, buffer.length);
  }
}
