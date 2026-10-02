/**
 * Battle of the Shirts - two shirts, one question, and an argument in the
 * comments.
 *
 * The only recipe here that is pure engagement. Every other post carries a
 * figure the engine had to earn: a like-for-like price movement, a sales rate
 * against supply, a career nobody can look up. This one carries a question,
 * and the thing it has to get right is different. There is no number to be
 * wrong about, so the integrity rules are about the shirts themselves.
 *
 * TWO CHOSEN BY A PERSON, NOT BY A QUERY. Which pair makes an argument is a
 * judgement no threshold captures: Villa's 1993-95 away against Ajax's 1989-90
 * home is a post, and two near-identical modern home shirts is not. So this is
 * on demand from /battle, like Grail Sale and Drops, and the engine's job is
 * to refuse the pairs that cannot work rather than to pick the pair.
 *
 * WHAT IT REFUSES, AND WHY EACH ONE MATTERS
 *
 *  - The same shirt twice. A shirt cannot fight itself, and the card would
 *    draw the same photo on both sides with no visible fault.
 *  - Either side without a renderable photo. This card IS the two photographs;
 *    one missing makes it a broken image next to a shirt, not a contest.
 *  - Anything that is not a home, away or third shirt. The same allowlist as
 *    everywhere else: a training top against a match shirt is not a fair fight
 *    and reads as a mistake.
 *
 * WHAT IT DELIBERATELY DOES NOT REFUSE
 *
 *  - Shirts that are not for sale. A vote post is not a shop window, and the
 *    best arguments are often about shirts nobody has. Where a side IS buyable
 *    the card says so, because that is worth knowing, but it is never a
 *    condition of the post.
 *  - Mismatched eras or clubs. A 1990s Villa away against a 1980s Ajax home is
 *    the whole point. Fairness is the admin's call, not the engine's.
 *
 * NO WINNER IS EVER DECLARED. Kickio has no vote count to read: the votes land
 * in the replies on each network. So the card asks and the copy asks, and
 * nothing here or in the brief may claim a result, a lead, or what other
 * people have said. A fabricated scoreline on a poll is the cheapest possible
 * way to lose a collector's trust.
 */
import { kickio } from "../kickio/client.ts";
import type { Claim, RecipeCandidate, RecipeResult } from "../engine/types.ts";
import { imageUrls } from "./grail-of-the-day.ts";
import { isMatchShirt } from "./who-am-i.ts";
import { kitLabel } from "./most-wanted.ts";
import { formatPrice } from "../kickio/pricing.ts";

export const BATTLE_KEY = "battle";

/** The side of the card a shirt is on. Also how a voter names it in a reply. */
export type Corner = "A" | "B";

interface ProductRow {
  id: string;
  name: string | null;
  team: string | null;
  season: string | null;
  shirt_type: string | null;
  manufacturer: string | null;
  player_name: string | null;
  slug: string | null;
  status: string | null;
  has_active_listing: boolean | null;
  lowest_price_cents: number | null;
  primary_image_url: string | null;
  images: unknown;
}

const COLUMNS =
  "id,name,team,season,shirt_type,manufacturer,player_name,slug,status," +
  "has_active_listing,lowest_price_cents,primary_image_url,images";

/** One shirt as the picker shows it, and as the card draws it. */
export interface Fighter {
  productId: string;
  title: string;
  team: string | null;
  season: string | null;
  kit: string;
  manufacturer: string | null;
  imageUrl: string | null;
  /** Null when it is not for sale, which is allowed and common. */
  price: string | null;
  buyable: boolean;
}

/**
 * Can this product be one side of a battle at all?
 *
 * Exported and pure so the picker can grey out a row for the same reason the
 * runner would refuse it, rather than letting someone choose a shirt and find
 * out after the click.
 */
export function canFight(shirt: Pick<Fighter, "imageUrl" | "kit">): boolean {
  return shirt.imageUrl !== null && isMatchShirt(shirt.kit);
}

function toFighter(row: ProductRow): Fighter {
  const photo =
    imageUrls([row.primary_image_url, ...(Array.isArray(row.images) ? row.images : [])])[0] ?? null;
  return {
    productId: row.id,
    title: row.name?.trim() || [row.season, row.team, row.shirt_type].filter(Boolean).join(" "),
    team: row.team,
    season: row.season,
    kit: kitLabel(row.shirt_type),
    manufacturer: row.manufacturer,
    imageUrl: photo,
    price:
      row.has_active_listing && row.lowest_price_cents
        ? formatPrice(row.lowest_price_cents, "GBP")
        : null,
    buyable: row.has_active_listing === true,
  };
}

/**
 * Shirts matching what the admin typed.
 *
 * Searches the product NAME, which is the string the admin is looking at on
 * Kickio ("1993-95 Aston Villa Away Shirt"). `search_tsv` exists but is tuned
 * for the marketplace's own search and would need its configuration matched
 * exactly; a name match is predictable, and this is a person typing a shirt
 * they already have in mind rather than browsing.
 *
 * Deliberately NOT restricted to shirts for sale. Half the catalogue has no
 * live listing and some of the best arguments are about shirts nobody can buy.
 */
export async function searchShirts(query: string, limit = 24): Promise<Fighter[]> {
  const term = query.trim();
  // Two characters matches most of the catalogue and makes the picker useless.
  if (term.length < 3) return [];

  const { data, error } = await kickio()
    .from("products")
    .select(COLUMNS)
    .is("deleted_at", null)
    .eq("status", "active")
    .ilike("name", `%${term}%`)
    .not("primary_image_url", "is", null)
    .limit(limit * 3);

  if (error) throw new Error(`Searching Kickio failed: ${error.message}`);

  return ((data ?? []) as unknown as ProductRow[])
    .map(toFighter)
    .filter(canFight)
    .slice(0, limit);
}

async function loadFighter(productId: string): Promise<Fighter | null> {
  const { data, error } = await kickio()
    .from("products")
    .select(COLUMNS)
    .eq("id", productId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`Loading the shirt failed: ${error.message}`);
  if (!data) return null;
  return toFighter(data as unknown as ProductRow);
}

/** "1993-95 Aston Villa Away" - what the card and the copy call a side. */
export function shortName(f: Fighter): string {
  const parts = [f.season, f.team, f.kit].filter(Boolean);
  return parts.length > 0 ? parts.join(" ") : f.title;
}

/**
 * What makes this pair worth arguing about, in one line, or null.
 *
 * Only ever states what the two shirts ARE. It must never reach for a reason
 * one is better, because that is the question being asked and answering it on
 * the card kills the post.
 */
export function framing(a: Fighter, b: Fighter): string | null {
  if (a.team && b.team && a.team === b.team) return `Two ${a.team} shirts. Only one can win`;
  if (a.season && b.season && a.season === b.season) return `Same season, different badge`;
  if (a.kit && b.kit && a.kit === b.kit && a.kit !== "") return `${a.kit} shirt against ${a.kit} shirt`;
  return null;
}

export async function runBattle(leftId: string, rightId: string): Promise<RecipeResult> {
  if (leftId === rightId) {
    return { ok: false, reason: "A shirt cannot fight itself. Pick two different shirts." };
  }

  const [a, b] = await Promise.all([loadFighter(leftId), loadFighter(rightId)]);
  if (!a) return { ok: false, reason: "The first shirt could not be found on Kickio." };
  if (!b) return { ok: false, reason: "The second shirt could not be found on Kickio." };

  // Named individually, because "one of them will not work" sends someone back
  // to a list of two to guess which.
  for (const [side, f] of [["first", a], ["second", b]] as const) {
    if (f.imageUrl === null) {
      return {
        ok: false,
        reason: `The ${side} shirt (${shortName(f)}) has no photograph this card can draw. ` +
          "This post is the two pictures, so both sides need one.",
      };
    }
    if (!isMatchShirt(f.kit)) {
      return {
        ok: false,
        reason: `The ${side} shirt (${shortName(f)}) is a ${f.kit || "non-match"} shirt. ` +
          "Battles are home, away and third shirts only.",
      };
    }
  }

  // Sorted so the same two shirts produce the same key whichever order they
  // were picked in, and the duplicate guard catches the rematch.
  const subjectRef = [a.productId, b.productId].sort().join("|vs|");

  const claims: Claim[] = [
    {
      statement: `Corner A is the ${shortName(a)} shirt`,
      value: 0,
      source: `products.id = ${a.productId}`,
    },
    {
      statement: `Corner B is the ${shortName(b)} shirt`,
      value: 0,
      source: `products.id = ${b.productId}`,
    },
  ];

  const candidate: RecipeCandidate = {
    subjectRef,
    headline: `Battle of the Shirts: ${shortName(a)} vs ${shortName(b)}`,
    sourceData: {
      a: {
        corner: "A" as Corner,
        title: a.title,
        team: a.team,
        season: a.season,
        kit: a.kit,
        manufacturer: a.manufacturer,
        price: a.price,
        buyable: a.buyable,
      },
      b: {
        corner: "B" as Corner,
        title: b.title,
        team: b.team,
        season: b.season,
        kit: b.kit,
        manufacturer: b.manufacturer,
        price: b.price,
        buyable: b.buyable,
      },
      a_name: shortName(a),
      b_name: shortName(b),
      framing: framing(a, b),
      // Said in the data as well as the brief, because it is the one thing
      // about this post that could be got badly wrong: there is no result.
      no_result_available:
        "Votes land in the replies on each network. Kickio holds no count, so " +
        "nothing may claim a winner, a lead, or what anyone else has voted.",
    },
    claims,
    // Index 0 is corner A, index 1 is corner B. The card relies on it.
    images: [a.imageUrl!, b.imageUrl!],
  };

  return { ok: true, candidate };
}

export const BATTLE_BRIEF = `**Battle of the Shirts** - two shirts, one question, and an argument in the comments.

This post exists to be replied to. It is the one post in the set with no figure
to defend, so judge every line by whether it makes someone stop and pick a side.

THE ASK IS THE POST

Name both shirts, ask the question, and get out of the way. The two corners are
\`a\` and \`b\`, labelled A and B on the card, so the reply is one character and
nobody has to type a season to join in. Say so plainly: "A or B?".

Open on the pairing, not on the question. "Villa's 1993-95 away against Ajax's
1989-90 home" is a reason to look; "Which shirt is better?" on its own is a
scroll. The question goes at the end, where it is the last thing read.

TAKE NO SIDE. You may say what makes each shirt distinctive - the colourway,
the sponsor, the maker, the era it belongs to - and that is what gives people
something to argue with. You may not say which is better, hint at a favourite,
or weight the description of one more generously than the other. The moment the
post has an opinion, it stops being a question and the comments stop being a
contest.

Give each shirt roughly the same number of words. An unbalanced write-up reads
as a thumb on the scale even when no preference is stated.

NEVER INVENT A RESULT. There is no vote count anywhere in Kickio - the replies
are the votes, and they are on the network, not in this tool. So never write
that one is winning, that it is close, that the comments are split, or what
anyone has said. Nothing about this post knows any of that.

WHAT YOU MAY SAY ABOUT BUYING

Where \`buyable\` is true on a side, one short clause is allowed ("the Ajax one
is on Kickio now"). Where it is false, say nothing about availability for that
side - do not apologise for it and do not imply it is rare. This is a vote
post, not a listing: if neither is for sale, the post simply does not mention
buying at all, and that is fine.

FACTS ONLY FROM THE FACTS. Do not add what a shirt is worth, how many were
made, who scored in it, or which season it won something, unless it is in the
source data. A detail a collector knows to be wrong loses the argument before
it starts.

Close on the ask and kickio.com, as every post does.`;
