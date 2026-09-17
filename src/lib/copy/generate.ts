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
import { PLATFORM_LIMITS } from "./limits.ts";

const MODEL = "claude-opus-5";

/**
 * Schema-constrained shape of a generated post.
 *
 * Structured outputs support a subset of JSON Schema: `minItems` may only be 0
 * or 1, so array lengths cannot be enforced here (the API rejects the whole
 * request with a 400 otherwise). Length guidance lives in each field's
 * `description` and in the brand voice instead.
 */
const COPY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["x", "instagram", "tiktok"],
  properties: {
    x: {
      type: "object",
      additionalProperties: false,
      required: ["text", "hashtags"],
      properties: {
        text: {
          type: "string",
          description:
            `Up to ${PLATFORM_LIMITS.x.chars} characters - this is a Premium account, ` +
            `so the old 280 limit does not apply. But the first ${PLATFORM_LIMITS.x.lead} ` +
            "characters are all that shows before X collapses the post behind " +
            "\"Show more\", so they must work as a complete thought on their own: " +
            "lead with the most surprising concrete fact and never split it across " +
            "that boundary. Anything after it is for the reader who has already " +
            "decided to keep going - use it for the detail a collector wants, not " +
            "for padding. Ends with the CTA and kickio.com.",
        },
        hashtags: {
          type: "array",
          items: { type: "string" },
          description:
            `${PLATFORM_LIMITS.x.hashtags} hashtags, without the leading #. They are ` +
            "appended after the post body and do not count against the lead.",
        },
      },
    },
    instagram: {
      type: "object",
      additionalProperties: false,
      required: ["caption", "hashtags"],
      properties: {
        caption: {
          type: "string",
          description:
            "Hook line, then 2-4 short paragraphs, ending with the CTA and kickio.com.",
        },
        hashtags: {
          type: "array",
          items: { type: "string" },
          // Structured outputs reject minItems above 1, so counts are stated
          // here and in the brand voice rather than enforced by the schema.
          description:
            `${PLATFORM_LIMITS.instagram.hashtags} hashtags, without the leading #. Instagram ` +
            `allows 30 and rewards reach, so fill it: work outward from the most ` +
            "specific (club, season, player, manufacturer, sponsor) through the " +
            "mid-tail (#90sfootball, #awaykit) to the broad (#footballshirt). Every " +
            "one must be a tag a real collector would browse - never invent a tag, " +
            "pad with near-duplicates of the same word, or repeat one in the caption.",
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
          items: { type: "string" },
          description:
            "Between 3 and 5 on-screen text beats, roughly six words each.",
        },
        cta: { type: "string", description: "Closing line, including kickio.com." },
        hashtags: {
          type: "array",
          items: { type: "string" },
          description:
            `${PLATFORM_LIMITS.tiktok.hashtags} hashtags for the caption, without the leading #. ` +
            "TikTok's caption is short, so these carry the discovery - mix club and " +
            "era tags with the broad football-shirt ones.",
        },
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

export interface GenerateOptions {
  /**
   * Which CTAs this recipe may close on. A sold-item post must not invite
   * anyone to buy the thing that has gone, so those recipes pass SOLD_CTA_POOL.
   */
  ctaPool?: string[];
}

export async function generateCopy(
  recipeBrief: string,
  candidate: RecipeCandidate,
  options: GenerateOptions = {},
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
              `## CTA to use this time\n\n${ctaForDay(new Date(), options.ctaPool)}\n\n` +
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
