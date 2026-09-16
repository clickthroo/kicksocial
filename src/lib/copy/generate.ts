/**
 * Turns a recipe's verified facts into platform-specific copy.
 *
 * The prompt is assembled so the stable parts come first and the volatile parts
 * last, which keeps the brand voice in the cached prefix:
 *
 *   system:   BRAND_VOICE          (identical every run - cached)
 *   user:     recipe brief         (identical per recipe - cached)
 *             facts + claims       (varies per post - after the breakpoint)
 *
 * Claude only ever sees facts the recipe verified against the database, and the
 * response is schema-constrained so we get all three platform variants or an
 * error - never a half-formed draft.
 */
import Anthropic from "@anthropic-ai/sdk";
import { BRAND_VOICE, ctaForDay } from "./brand-voice.ts";
import type { Claim, PlatformCopy, RecipeCandidate } from "../engine/types.ts";

const MODEL = "claude-opus-5";

/** Schema-constrained shape of a generated post. */
const COPY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["x", "instagram", "tiktok"],
  properties: {
    x: {
      type: "object",
      additionalProperties: false,
      required: ["text"],
      properties: {
        text: { type: "string", description: "Up to 260 characters. No hashtags." },
      },
    },
    instagram: {
      type: "object",
      additionalProperties: false,
      required: ["caption", "hashtags"],
      properties: {
        caption: { type: "string", description: "Hook line, then 2-4 short paragraphs." },
        hashtags: {
          type: "array",
          minItems: 4,
          maxItems: 8,
          items: { type: "string" },
          description: "Without the leading #.",
        },
      },
    },
    tiktok: {
      type: "object",
      additionalProperties: false,
      required: ["hook", "beats", "cta"],
      properties: {
        hook: { type: "string", description: "First two seconds." },
        beats: {
          type: "array",
          minItems: 3,
          maxItems: 5,
          items: { type: "string" },
          description: "On-screen text, roughly six words each.",
        },
        cta: { type: "string" },
      },
    },
  },
} as const;

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  if (!client) client = new Anthropic();
  return client;
}

function renderClaims(claims: Claim[]): string {
  return claims
    .map((c, i) => {
      const basis = c.basis ? `\n   basis: ${c.basis}` : "";
      return `${i + 1}. ${c.statement}\n   value: ${c.value}\n   source: ${c.source}${basis}`;
    })
    .join("\n");
}

export interface GenerateResult {
  copy: PlatformCopy;
  usage: { input: number; output: number; cacheRead: number };
}

export async function generateCopy(
  recipeBrief: string,
  candidate: RecipeCandidate,
): Promise<GenerateResult> {
  const response = await anthropic().messages.create({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: {
      effort: "high",
      format: { type: "json_schema", schema: COPY_SCHEMA },
    },
    system: [
      // Stable across every recipe and every run - the cacheable prefix.
      { type: "text", text: BRAND_VOICE, cache_control: { type: "ephemeral" } },
    ],
    messages: [
      {
        role: "user",
        content: [
          // Stable per recipe.
          {
            type: "text",
            text: `## This post\n\n${recipeBrief}`,
            cache_control: { type: "ephemeral" },
          },
          // Volatile - after the last cache breakpoint.
          {
            type: "text",
            text:
              `## FACTS (the only source of detail you may use)\n\n` +
              `\`\`\`json\n${JSON.stringify(candidate.sourceData, null, 2)}\n\`\`\`\n\n` +
              `## CLAIMS (every number in your copy must come from one of these, unchanged)\n\n` +
              `${renderClaims(candidate.claims)}\n\n` +
              `## CTA to use this time\n\n${ctaForDay()}\n\n` +
              `Write the three platform variants now.`,
          },
        ],
      },
    ],
  });

  if (response.stop_reason === "refusal") {
    throw new Error(
      `Copy generation refused: ${response.stop_details?.explanation ?? "no explanation"}`,
    );
  }

  const text = response.content.find((b) => b.type === "text");
  if (!text || text.type !== "text") {
    throw new Error("Copy generation returned no text block");
  }

  let copy: PlatformCopy;
  try {
    copy = JSON.parse(text.text) as PlatformCopy;
  } catch (err) {
    throw new Error(`Copy generation returned unparseable JSON: ${(err as Error).message}`);
  }

  return {
    copy,
    usage: {
      input: response.usage.input_tokens,
      output: response.usage.output_tokens,
      cacheRead: response.usage.cache_read_input_tokens ?? 0,
    },
  };
}
