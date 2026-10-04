/**
 * Kickio Classics - an expensive pre-2000 shirt, under a photograph of the era.
 *
 * WHY THE PHOTOGRAPH IS SUPPLIED BY A PERSON AND NOT FOUND BY THE ENGINE
 *
 * The obvious version of this recipe searches the web for a picture of a
 * famous player wearing the shirt and lays the card over it. It is not built
 * that way, and the reason is not that it would be hard.
 *
 * Match photography from the eighties and nineties belongs to Getty, PA,
 * Allsport, Mirrorpix and their peers. Publishing it to sell a shirt is
 * infringement whatever the post says, and it is infringement at the volume of
 * whatever cadence this runs at. Putting a named footballer beside a price is
 * also an implied endorsement, which in the UK is passing off and elsewhere
 * runs into image rights directly. Those are bills, not warnings.
 *
 * So the engine does the parts it can be right about - which shirt, what it
 * costs, how many are listed, what the card says - and the one judgement that
 * carries legal weight stays with a person, who supplies an image Kickio has
 * the right to publish and the credit line that goes with it. Same shape as
 * Battle of the Shirts: the engine refuses what it can check and leaves the
 * judgement to the admin.
 *
 * `photoCredit` is required for that reason. A licensed image almost always
 * comes with a required attribution, and a field that is easy to leave blank
 * is a field that gets left blank.
 *
 * WHAT THE CARD DOES WITH IT
 *
 * The photograph is the post. The shirt's details go over it small, in one
 * corner, under a scrim that exists only to keep them readable. A classic
 * shirt under a famous photograph sells itself; a price banner across the
 * middle of it does not.
 */
import { kickio } from "../kickio/client.ts";
import type { Claim, RecipeCandidate, RecipeResult } from "../engine/types.ts";
import { recentlyFeatured } from "./cooldown.ts";
import { formatPrice } from "../kickio/pricing.ts";
import { kickioUrl } from "./grail-of-the-day.ts";
import { isMatchShirt } from "./who-am-i.ts";
import { kitLabel } from "./most-wanted.ts";
import { pageIn } from "../kickio/page.ts";
import {
  careerPlayers,
  mergePlayers,
  printedName,
  type EraPlayer,
  type PrintedShirt,
  ERA_YEARS,
} from "./era-players.ts";

export const CLASSICS_KEY = "kickio_classics";

/** Before 2000, read off the season's first year. */
export const CLASSIC_BEFORE_YEAR = 2000;

/** Dear enough to be worth calling a classic. */
export const MIN_PRICE_CENTS = 15_000;

interface ProductRow {
  id: string;
  name: string | null;
  slug: string | null;
  team: string | null;
  season: string | null;
  shirt_type: string | null;
  manufacturer: string | null;
  player_name: string | null;
  lowest_price_cents: number | null;
  listings_count: number | null;
  primary_image_url: string | null;
}

const COLUMNS =
  "id,name,slug,team,season,shirt_type,manufacturer,player_name," +
  "lowest_price_cents,listings_count,primary_image_url";

/**
 * The first year of a season string, or null.
 *
 * `products.season_end_year` is null on every active row, which is why this
 * reads the text instead - the same discovery that made Price Trends match the
 * decade as a string prefix. Exported because "is this shirt pre-2000" is the
 * whole selection and deserves a test rather than a regex buried in a query.
 */
export function seasonStartYear(season: string | null | undefined): number | null {
  const match = /^(\d{4})/.exec((season ?? "").trim());
  if (!match) return null;
  const year = Number(match[1]);
  return Number.isInteger(year) ? year : null;
}

/** Is this shirt old enough for the post? */
export function isClassic(season: string | null | undefined): boolean {
  const year = seasonStartYear(season);
  return year !== null && year < CLASSIC_BEFORE_YEAR;
}

export interface ClassicShirt {
  productId: string;
  title: string;
  team: string | null;
  season: string | null;
  kit: string;
  manufacturer: string | null;
  playerName: string | null;
  priceCents: number;
  price: string;
  listingsCount: number;
  productUrl: string | null;
  /** Kickio's own catalogue shot. Only used by the picker, never by the card. */
  thumbUrl: string | null;
}

function toClassic(row: ProductRow): ClassicShirt | null {
  if (!isClassic(row.season)) return null;
  if (!isMatchShirt(row.shirt_type)) return null;
  const cents = row.lowest_price_cents ?? 0;
  if (cents < MIN_PRICE_CENTS) return null;

  return {
    productId: row.id,
    title: row.name?.trim() || [row.season, row.team, row.shirt_type].filter(Boolean).join(" "),
    team: row.team,
    season: row.season,
    kit: kitLabel(row.shirt_type),
    manufacturer: row.manufacturer,
    playerName: row.player_name?.trim() || null,
    priceCents: cents,
    price: formatPrice(cents, "GBP"),
    listingsCount: row.listings_count ?? 0,
    productUrl: kickioUrl(row.slug),
    thumbUrl: row.primary_image_url,
  };
}

interface NamedRow {
  team: string | null;
  season: string | null;
  player_name: string | null;
}

/**
 * Every name Kickio has ever had printed on a shirt from these clubs, before
 * the millennium.
 *
 * One read for the whole page rather than one per shirt: the shelf currently
 * runs to 85 clubs across 206 team-and-season combinations, and a query each
 * would be 206 round trips to build a list of suggestions.
 *
 * `season.lt.2002` is a text comparison, which is exactly right here - every
 * season in the column starts with its first year, so anything sorting below
 * "2002" is a nineties season, a 2000-01 or a 2001-02. That is the widest the
 * era window can reach from a pre-2000 shirt.
 *
 * The status filter is the same allowlist Who Am I uses: `pending` rows are
 * submitted and unreviewed, and they are where the mis-filed shirts live - the
 * catalogue holds a pending "AC Milan Away Shirt Milito #22", which is an
 * Inter shirt. A name read off that row would send someone looking for a
 * photograph that cannot exist.
 */
async function printedNames(teams: readonly string[]): Promise<Map<string, PrintedShirt[]>> {
  if (teams.length === 0) return new Map();

  const rows = await pageIn<NamedRow, string>("Loading printed names", teams, (batch, from, to) =>
    kickio()
      .from("products")
      .select("team,season,player_name")
      .in("team", batch)
      .is("deleted_at", null)
      .not("player_name", "is", null)
      .not("season", "is", null)
      .lt("season", "2002")
      .or("status.eq.active,has_active_listing.is.true")
      .order("id", { ascending: true })
      .range(from, to),
  );

  const byTeam = new Map<string, PrintedShirt[]>();
  for (const row of rows) {
    if (!row.team) continue;
    const name = printedName(row.player_name, row.team);
    if (!name) continue;
    const held = byTeam.get(row.team);
    const entry: PrintedShirt = { name, season: row.season };
    if (held) held.push(entry);
    else byTeam.set(row.team, [entry]);
  }
  return byTeam;
}

/** Printed names from within the era window of this shirt's season. */
function namesNearSeason(
  printed: readonly PrintedShirt[],
  season: string | null,
): PrintedShirt[] {
  const year = seasonStartYear(season);
  if (year === null) return [];
  return printed.filter((p) => {
    const theirs = seasonStartYear(p.season);
    return theirs !== null && Math.abs(theirs - year) <= ERA_YEARS;
  });
}

/**
 * Every shirt that could carry this post, dearest first.
 *
 * Dearest first because the post is called Classics and the price is the
 * headline fact on the card. Shirts already covered within the cooldown are
 * marked rather than removed, so the picker can show that the obvious choice
 * has been used recently instead of silently hiding it.
 *
 * Each row also carries the players the picker can offer as a starting point
 * for the photograph hunt. They are attached here rather than in `toClassic`
 * because they need a second read of the catalogue, and because the card never
 * sees them: this is help for the person choosing an image, not data in the
 * post.
 */
export async function classicShirts(cooldownDays = 120): Promise<
  Array<ClassicShirt & { postedRecently: boolean; players: EraPlayer[] }>
> {
  const { data, error } = await kickio()
    .from("products")
    .select(COLUMNS)
    .is("deleted_at", null)
    .eq("status", "active")
    .eq("has_active_listing", true)
    .gte("lowest_price_cents", MIN_PRICE_CENTS)
    .not("season", "is", null)
    .order("lowest_price_cents", { ascending: false })
    .limit(400);

  if (error) throw new Error(`Kickio query failed: ${error.message}`);

  const shirts = ((data ?? []) as unknown as ProductRow[])
    .map(toClassic)
    .filter((s): s is ClassicShirt => s !== null);

  const teams = [...new Set(shirts.map((s) => s.team).filter((t): t is string => !!t))];
  const [seen, printed] = await Promise.all([
    recentlyFeatured(CLASSICS_KEY, cooldownDays),
    printedNames(teams),
  ]);

  return shirts.map((s) => ({
    ...s,
    postedRecently: seen.has(s.productId),
    players: mergePlayers(
      s.team ? careerPlayers(s.team, s.season) : [],
      s.team ? namesNearSeason(printed.get(s.team) ?? [], s.season) : [],
      s.season,
    ),
  }));
}

async function loadClassic(productId: string): Promise<ClassicShirt | null> {
  const { data, error } = await kickio()
    .from("products")
    .select(COLUMNS)
    .eq("id", productId)
    .is("deleted_at", null)
    .maybeSingle();
  if (error) throw new Error(`Loading the shirt failed: ${error.message}`);
  if (!data) return null;
  return toClassic(data as unknown as ProductRow);
}

/**
 * Only formats the card can actually draw.
 *
 * Satori renders WebP as an empty frame and raises no error, so an unchecked
 * URL produces a card that looks fine in the queue with nothing on it. The
 * render pipeline transcodes what it can, but a link to a web page rather than
 * an image file is a different mistake and worth catching at the point someone
 * pastes it.
 */
export function looksLikeImage(url: string): boolean {
  if (!/^https:\/\//i.test(url)) return false;
  return /\.(jpe?g|png|webp|avif|gif|tiff?)(\?|$)/i.test(url);
}

export interface ClassicInput {
  productId: string;
  /** An image Kickio has the right to publish. */
  photoUrl: string;
  /** Who it belongs to. Required: a licence almost always demands one. */
  photoCredit: string;
  /** Who is in the photograph, if the admin wants it named on the card. */
  photoPlayer?: string;
}

export async function runClassics(input: ClassicInput): Promise<RecipeResult> {
  const photoUrl = input.photoUrl.trim();
  const credit = input.photoCredit.trim();

  if (!photoUrl) return { ok: false, reason: "A photograph is needed for this post." };
  if (!looksLikeImage(photoUrl)) {
    return {
      ok: false,
      reason:
        "That does not look like an image file. It needs to be an https link ending in " +
        ".jpg, .png or .webp, not a link to a page the image sits on.",
    };
  }
  if (!credit) {
    return {
      ok: false,
      reason:
        "A credit is required. Archive photography is licensed and almost always has to " +
        "carry an attribution, and this post publishes the image.",
    };
  }

  const shirt = await loadClassic(input.productId);
  if (!shirt) {
    return {
      ok: false,
      reason:
        "That shirt no longer qualifies: it needs to be a pre-2000 home, away or third " +
        `shirt, in stock, at ${formatPrice(MIN_PRICE_CENTS, "GBP")} or more.`,
    };
  }

  const player = input.photoPlayer?.trim() || shirt.playerName;

  const listingLine =
    shirt.listingsCount > 1
      ? `${shirt.listingsCount} listed on Kickio, from ${shirt.price}`
      : `One listed on Kickio, at ${shirt.price}`;

  const claims: Claim[] = [
    {
      statement: `${shirt.title} is listed on Kickio from ${shirt.price}`,
      value: shirt.priceCents / 100,
      source: `products.lowest_price_cents (id ${shirt.productId})`,
      basis: "The cheapest of the live listings for this exact shirt.",
    },
    {
      statement: listingLine,
      value: shirt.listingsCount,
      source: "products.listings_count",
    },
  ];

  const candidate: RecipeCandidate = {
    // The product, so the cooldown and the duplicate guard both work on the
    // shirt rather than on the photograph, which may be swapped.
    subjectRef: shirt.productId,
    headline: `Kickio Classics: ${shirt.title}`,
    sourceData: {
      title: shirt.title,
      team: shirt.team,
      season: shirt.season,
      kit: shirt.kit,
      manufacturer: shirt.manufacturer,
      player,
      price: shirt.price,
      listings_count: shirt.listingsCount,
      listing_line: listingLine,
      kickio_url: shirt.productUrl,
      photo_credit: credit,
      // Spelled out in the data as well as the brief. The history is the part
      // of this post with no source behind it, and a reviewer should be able
      // to see that stated rather than infer it.
      history_warning:
        "Nothing in this engine verifies the history of this shirt. Anything the copy " +
        "says about the era, the kit or the players is the model's own knowledge and " +
        "has to be read as a claim, not as a fact Kickio checked.",
    },
    claims,
    // The supplied photograph IS the card. Kickio's catalogue shot is
    // deliberately not here: two images would make the template choose, and
    // the whole point of this post is the archive picture.
    images: [photoUrl],
  };

  return { ok: true, candidate };
}

export const CLASSICS_BRIEF = `**Kickio Classics** - one pre-2000 shirt, under a photograph of its era.

The picture carries this post. Your job is the few lines beside it: what the
shirt is, why it is remembered, and where to get one.

STRUCTURE

1. The shirt and its moment. Two or three sentences of genuine history - the
   season, the kit, what the club was doing, who wore it. This is the reason
   somebody stops.
2. What Kickio has. Use \`listing_line\` as given: how many are listed and the
   price they start at. One sentence.
3. Send them to the shirt. \`kickio_url\` is the product page for this exact
   shirt, and it is where the post must point.

ON THE HISTORY, WHICH IS THE RISK IN THIS POST

Every other post here is built on figures the engine verified. This one asks
you for history, and nothing checks it. So:

- Write only what you are confident is true of this shirt and this season. A
  collector reading a Kickio post knows this era better than almost anyone, and
  one wrong detail costs more than a dull post.
- If you are not sure a player wore this exact kit in this exact season, do not
  say he did. "The shirt of that side" is safe; "the shirt he scored in at
  Wembley" is a specific claim that has to be right.
- Never invent a match, a goal, a score, a transfer or a date. Where you have
  nothing specific, write about the design - the colourway, the sponsor, the
  maker, what the kit looked like against what came before it.
- \`player\` is who is in the photograph, where the admin named them. You may
  say they wore the shirt. Do not build a story around them that the facts do
  not carry.

PRICES

\`price\` is the cheapest live listing, and it is the only price you may use.
Write it as a starting price ("from £189"), never as a valuation or as what the
shirt is worth. Do not mention size or condition: this post is about the shirt,
not about one seller's copy of it.

VOICE

Warmer than the market posts. This is the one post in the set that is allowed
to be fond of a shirt. Still no exclamation marks, still no urgency, and no
claim that it is rare or that it will not last unless the data says so - it
does not.

Close on the link and kickio.com.`;
