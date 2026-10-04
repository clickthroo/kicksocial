/**
 * Who to look for a photograph of.
 *
 * Kickio Classics asks a person for an archive photograph, which means the
 * first job in front of them is a blank one: a 1991-92 Fiorentina shirt is
 * sitting there and they have to remember who played for Fiorentina in 1991.
 * That is the slow part of making the post, and it is the part the engine can
 * help with without touching the judgement that has to stay human.
 *
 * TWO SOURCES, AND THEY ARE NOT EQUALLY GOOD
 *
 * 1. `careers.ts`, written by hand for Who Am I?, with spells dated to the
 *    season. A name from here is era-checked: the spell covers the year on the
 *    shirt. It covers 70 of the 206 team-and-season combinations currently on
 *    the Classics shelf, because that file was researched to answer a different
 *    question (careers spanning six clubs) and is thin on one-club greats.
 * 2. `products.player_name` - the name actually printed on a shirt Kickio holds
 *    for that club within a couple of seasons. This is where Batistuta,
 *    Cantona and Shearer come from, the players the first source misses. It is
 *    weaker evidence: the column is free text, it carries junk, and a name
 *    printed on a 1995 shirt does not prove the man was there in 1993.
 *
 * So each name is labelled with where it came from, and the picker says so.
 * A suggestion the admin can weigh is useful; a list that hides which half was
 * checked is how a wrong player ends up named on a card.
 *
 * NEITHER SOURCE IS A SQUAD LIST. This is "who we can show was connected to
 * that club around then", and the copy on the page says exactly that. The
 * admin still has to look at the photograph and decide.
 */
import { CAREERS } from "./careers.ts";
import { cleanValue } from "../kickio/values.ts";

/**
 * How far either side of the shirt's season a printed name still counts.
 *
 * Two seasons each way. Squads turn over slowly and a shirt is usually in the
 * catalogue for the season it was sold rather than the season it was worn, so
 * nothing either side is a near-certain miss. Wider than this and a 1993 name
 * starts being offered for a 1998 shirt, which is a different era of the same
 * club.
 */
export const ERA_YEARS = 2;

/** Never show more than this many. Past a dozen it is a phone book. */
export const MAX_PLAYERS = 12;

export type PlayerSource = "career" | "catalogue";

export interface EraPlayer {
  name: string;
  source: PlayerSource;
  /** For a catalogue name, the season it was printed on. */
  season?: string;
}

/** The first year of a season string, or null. Same rule as everywhere else. */
function startYear(season: string | null | undefined): number | null {
  const match = /^(\d{4})/.exec((season ?? "").trim());
  return match ? Number(match[1]) : null;
}

/**
 * Careers on file whose spell at this club covers this year.
 *
 * The national sides are included, because `products.team` holds England and
 * Brazil alongside the clubs and 15 of the dearest pre-2000 shirts in stock are
 * England shirts. A player's international years live outside `spells`, which
 * is the same omission that once cost Who Am I eleven careers.
 */
export function careerPlayers(team: string, season: string | null | undefined): string[] {
  const year = startYear(season);
  if (year === null) return [];

  const names: string[] = [];
  for (const career of CAREERS) {
    const atClub = career.spells.some((s) => s.team === team && year >= s.from && year <= s.to);
    const forCountry =
      career.international?.team === team &&
      year >= career.international.from &&
      year <= career.international.to;
    if (atClub || forCountry) names.push(career.display);
  }
  return [...new Set(names)];
}

/**
 * Words that are in the column but are not somebody's name.
 *
 * Measured against the pre-2002 catalogue: "Not Applicable" twice, "Not
 * Specified", a bare comma and a bare full stop. `cleanValue` catches the
 * punctuation and the usual placeholders; these are the ones particular to a
 * name field, where "Goalkeeper" and "Player Issue" describe the shirt rather
 * than the man who wore it.
 */
const NOT_A_NAME = new Set([
  "not applicable",
  "not specified",
  "no name",
  "no player",
  "nameless",
  "blank",
  "plain",
  "goalkeeper",
  "keeper",
  "gk",
  "issue",
  "player issue",
  "match worn",
  "match issue",
  "squad",
  "team",
  "home",
  "away",
  "third",
  "unnamed",
  "n a",
]);

/**
 * The name printed on a shirt, if the column holds one.
 *
 * The column is free text typed by sellers and it shows: squad numbers
 * ("Beckham #7"), the club typed in front of the name ("Manchester United
 * Cantona"), the club on its own ("Marinos"), HTML entities where a title was
 * pasted in, and the odd outright wrong entry (a Dennis Rodman on a Japan
 * shirt, which no filter can catch and the admin has to).
 *
 * `team` is passed so the club's own words can be stripped out: without that,
 * "Manchester United Cantona" is offered as a player and reads as a mistake in
 * a list that is meant to save someone time.
 */
export function printedName(raw: unknown, team: string): string | null {
  const value = cleanValue(raw);
  if (value === null) return null;
  // A pasted title rather than a name. Decoding it would be guesswork about
  // what the seller meant, and the name is nearly always in the catalogue
  // again on a cleaner row.
  if (/&#|&[a-z]+;/i.test(value)) return null;

  const teamWords = new Set(
    team
      .toLowerCase()
      .split(/[^a-z]+/)
      .filter((w) => w.length > 2),
  );

  const words = value
    // Squad numbers, however they are written.
    .replace(/#\s*\d+/g, " ")
    .replace(/\b\d+\b/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter(Boolean)
    .filter((w) => !teamWords.has(w.toLowerCase().replace(/[^a-z]/g, "")));

  const name = words.join(" ").replace(/\s+/g, " ").trim();
  if (name.length < 3) return null;
  // Letters, and the punctuation that belongs inside a name.
  if (!/^[\p{L}][\p{L}\p{M}'’.\- ]*$/u.test(name)) return null;
  if (NOT_A_NAME.has(name.toLowerCase())) return null;
  return name;
}

/**
 * The last word of a name, lower-cased and unaccented.
 *
 * Used only to collapse "Shearer" and "Alan Shearer" into one entry, which the
 * catalogue holds both of for Newcastle 1995. Two different men sharing a
 * surname at one club in one era is rare enough to be worth the trade: showing
 * both spellings of the same player looks like the list does not know what it
 * is talking about.
 */
export function surnameKey(name: string): string {
  const words = name.trim().split(/\s+/);
  return (words[words.length - 1] ?? "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z]/g, "");
}

export interface PrintedShirt {
  name: string;
  season: string | null;
}

/**
 * One list, curated names first, each surname once.
 *
 * A curated name wins over a printed one for the same surname: both the dates
 * and the spelling are better, and "Dennis Bergkamp" is more use in a search
 * box than "Bergkamp". Printed names then follow, nearest season first, so a
 * name off a shirt from the exact season is offered before one from two years
 * away.
 */
export function mergePlayers(
  career: readonly string[],
  printed: readonly PrintedShirt[],
  season: string | null | undefined,
  limit = MAX_PLAYERS,
): EraPlayer[] {
  const out: EraPlayer[] = [];
  const seen = new Set<string>();

  for (const name of career) {
    const key = surnameKey(name);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    out.push({ name, source: "career" });
  }

  const year = startYear(season);
  const ordered = [...printed].sort((a, b) => {
    const distance = (s: PrintedShirt) =>
      year === null ? 0 : Math.abs((startYear(s.season) ?? year) - year);
    return distance(a) - distance(b) || a.name.localeCompare(b.name);
  });

  for (const shirt of ordered) {
    const key = surnameKey(shirt.name);
    if (key === "" || seen.has(key)) continue;
    seen.add(key);
    out.push({ name: shirt.name, source: "catalogue", season: shirt.season ?? undefined });
  }

  return out.slice(0, limit);
}

/**
 * What to type into an image search to find a photograph of this kit.
 *
 * The one word deliberately left out is "shirt". Searching for a shirt returns
 * shirts: product shots, eBay listings, replica mockups. What this post needs
 * is a photograph of a footballer playing, so the terms are the man, the club
 * and the year, and the kit as the bare word ("away") to separate a famous
 * change strip from the home one without dragging retail into the results.
 *
 * The player is quoted so the two words stay together: unquoted, a search for
 * Alan Shearer also finds every other Shearer and every other Alan.
 */
export function photoTerms(opts: {
  player?: string | null;
  team: string | null;
  season: string | null;
  kit?: string | null;
}): string {
  const player = opts.player?.trim();
  return [
    player ? `"${player}"` : null,
    opts.team?.trim() || null,
    opts.season?.trim() || null,
    opts.kit?.trim() ? opts.kit.trim().toLowerCase() : null,
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Google Images, large images only.
 *
 * `tbm=isch` is the image tab and `tbs=isz:l` asks for large ones, which is not
 * a nicety: the card uses the photograph full-bleed at 1200px or more, and a
 * thumbnail scaled up to that looks like a mistake nobody made on purpose.
 */
export function imageSearchUrl(terms: string): string {
  return `https://www.google.com/search?tbm=isch&tbs=isz:l&q=${encodeURIComponent(terms)}`;
}

/**
 * The same search at Getty, because Google Images is not a source.
 *
 * Everything this post needs is licensed, and a Google result is a picture
 * somebody else owns with the licence stripped off it. Getty is where the
 * usable version of the same photograph is, with a price and a credit line
 * attached, so it sits beside every name rather than being left implied.
 */
export function gettySearchUrl(terms: string): string {
  // Unquoted: Getty's own search handles a plain phrase better than it handles
  // quotation marks, which narrow it to nothing on an archive this old.
  return `https://www.gettyimages.co.uk/search/2/image?phrase=${encodeURIComponent(
    terms.replace(/"/g, ""),
  )}&sort=best`;
}
