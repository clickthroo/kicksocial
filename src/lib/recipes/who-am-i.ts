/**
 * Who Am I? - six club shirts from one career, and an invitation to guess.
 *
 * The careers are written down in careers.ts; this decides which of them the
 * shelf can currently carry, picks the six shirts, and hands the copy enough
 * to write a career without ever naming the man. See docs/who-am-i-recipe.md
 * for why the careers cannot come out of Kickio's own data.
 *
 * THE RULE THAT KEEPS IT HONEST is the era match. A shirt only counts for a
 * spell when its season falls inside it: a 2019 Ajax shirt is not a 1994 Ajax
 * player's shirt. It is also the rule most likely to be quietly relaxed later
 * to lengthen the list, which is why it is one function with its own tests.
 */
import { kickio } from "../kickio/client.ts";
import { engine } from "../engine/client.ts";
import type { Claim, RecipeResult } from "../engine/types.ts";
import { pageIn } from "../kickio/page.ts";
import { imageUrls, kickioUrl } from "./grail-of-the-day.ts";
import { cleanValue } from "../kickio/values.ts";
import {
  CAREERS,
  CLUB_COUNTRY,
  careerByKey,
  spellCounts,
  type Career,
  type Spell,
} from "./careers.ts";

export const WHO_AM_I_KEY = "who_am_i";

/** The grid is 3×2. Six is the format, not a threshold to tune. */
export const SHIRTS = 6;

/** How long a player is out of the list once a post about him goes out. */
export const COOLDOWN_DAYS = 180;

export interface ShirtRow {
  id: string;
  slug: string | null;
  team: string;
  season: string | null;
  shirt_type: string | null;
  player_name: string | null;
  primary_image_url: string | null;
}

/**
 * The only kinds of shirt that may appear on the grid.
 *
 * An allowlist, not a blocklist. `shirt_type` also carries Training,
 * Goalkeeper, GK Home, Fourth, Pre-Match, Track Jacket, Cap and Socks, and a
 * training top or a pair of socks in a row of match shirts does not read as a
 * clue, it reads as a mistake. Matching by negation would also let the next
 * odd value through on its own.
 */
const WEARABLE = new Set(["home", "away", "third"]);

export function isMatchShirt(shirtType: string | null | undefined): boolean {
  return WEARABLE.has((shirtType ?? "").trim().toLowerCase());
}

export interface CoveredClub {
  team: string;
  country: string;
  /** The season shown, and the years he was there. */
  season: string;
  shirtType: string | null;
  from: number;
  to: number;
  england: boolean;
  loan: boolean;
  /** True for the one national-side tile, where one was needed. */
  international: boolean;
  /**
   * The name printed on this shirt, where there is one.
   *
   * It belongs to someone who wore that club's shirt in that season - a
   * TEAMMATE of the man being guessed, not the man himself. That is a clue
   * rather than a flaw, and the card and the copy both say so.
   */
  playerName: string | null;
  productId: string;
  slug: string | null;
  imageUrl: string;
}

/** "1997-98" -> 1997. Null for anything that is not a season. */
export function seasonStart(season: string | null | undefined): number | null {
  const match = /^(\d{4})/.exec((season ?? "").trim());
  return match ? Number(match[1]) : null;
}

/**
 * Does this shirt belong to that spell?
 *
 * Inclusive at both ends, because `from` and `to` are the first and last season
 * he was there. The whole post rests on this being strict.
 */
export function shirtFitsSpell(season: string | null | undefined, spell: Spell): boolean {
  const year = seasonStart(season);
  return year !== null && year >= spell.from && year <= spell.to;
}

/**
 * The best shirt for a spell: one from the middle of it.
 *
 * A player who was somewhere five years is remembered in the middle of that,
 * not in the season he arrived - and the first and last seasons are the ones
 * most likely to be a shirt he barely wore.
 */
export function bestShirtFor(shirts: readonly ShirtRow[], spell: Spell): ShirtRow | null {
  const fitting = shirts.filter(
    (s) => shirtFitsSpell(s.season, spell) && s.primary_image_url && isMatchShirt(s.shirt_type),
  );
  if (fitting.length === 0) return null;
  const middle = (spell.from + spell.to) / 2;
  const named = (s: ShirtRow) => (cleanValue(s.player_name) ? 1 : 0);
  return [...fitting].sort((a, b) => {
    // A plain club shirt is the purer puzzle, so an unnamed one wins outright.
    // A named shirt is not wrong - it is a teammate, and the card says so -
    // but it hands over a clue that a blank shirt does not.
    if (named(a) !== named(b)) return named(a) - named(b);
    const distance =
      Math.abs((seasonStart(a.season) ?? 0) - middle) - Math.abs((seasonStart(b.season) ?? 0) - middle);
    if (distance !== 0) return distance;
    // Home shirts read as "the" shirt of a club; away shirts are a harder clue
    // but a worse picture of the era.
    const home = (s: ShirtRow) => (/(^|\s)home(\s|$)/i.test(s.shirt_type ?? "") ? 0 : 1);
    return home(a) - home(b);
  })[0];
}

/** Every club in this career the shelf can currently show, oldest first. */
export function coverFor(career: Career, byTeam: Map<string, ShirtRow[]>): CoveredClub[] {
  const covered: CoveredClub[] = [];
  const used = new Set<string>();

  for (const spell of career.spells) {
    if (!spellCounts(spell)) continue;
    // One club once. A second spell at the same place is the same tile.
    if (used.has(spell.team)) continue;
    const shirt = bestShirtFor(byTeam.get(spell.team) ?? [], spell);
    if (!shirt) continue;
    used.add(spell.team);
    covered.push({
      team: spell.team,
      country: CLUB_COUNTRY[spell.team] ?? "",
      season: shirt.season ?? "",
      shirtType: cleanValue(shirt.shirt_type),
      playerName: cleanValue(shirt.player_name),
      from: spell.from,
      to: spell.to,
      england: spell.england !== undefined,
      loan: spell.loan === true,
      international: false,
      productId: shirt.id,
      slug: shirt.slug,
      imageUrl: imageUrls([shirt.primary_image_url])[0]!,
    });
  }

  covered.sort((a, b) => a.from - b.from);

  // ONE national side, and only to reach six.
  //
  // Six era-correct CLUB shirts is a high bar against this shelf - of the
  // first thirty careers written down, most cover five and stop. A national
  // shirt is still a shirt he wore, and it fills the last tile rather than
  // replacing a club, so the puzzle stays a club puzzle. It does narrow
  // nationality in one glance, which is why it is a last resort and never more
  // than one: a hint makes a puzzle answerable, two hints make it a caption.
  if (covered.length < SHIRTS && career.international) {
    const spell: Spell = {
      team: career.international.team,
      from: career.international.from,
      to: career.international.to,
    };
    const shirt = bestShirtFor(byTeam.get(spell.team) ?? [], spell);
    if (shirt) {
      covered.push({
        team: spell.team,
        country: career.international.team,
        season: shirt.season ?? "",
        shirtType: cleanValue(shirt.shirt_type),
        playerName: cleanValue(shirt.player_name),
        from: spell.from,
        to: spell.to,
        england: false,
        loan: false,
        international: true,
        productId: shirt.id,
        slug: shirt.slug,
        imageUrl: imageUrls([shirt.primary_image_url])[0]!,
      });
      // Left at the end rather than slotted in by date. An international
      // career is not a chapter between two clubs, it is the thread running
      // through all of them, and sorting it into the middle made the grid read
      // as a transfer that never happened.
    }
  }

  return covered;
}

/**
 * Six of them, chosen for a better puzzle rather than for the first six.
 *
 * A career across six countries is a far better guess than one across six
 * English clubs, so a club whose country is not yet on the card wins. One
 * English club is then forced in: the audience is English, and a grid with
 * nothing recognisable to them is not a puzzle, it is a shrug.
 */
export function pickSix(covered: readonly CoveredClub[], want = SHIRTS): CoveredClub[] {
  if (covered.length <= want) return [...covered];

  const chosen: CoveredClub[] = [];
  const countries = new Set<string>();

  for (const club of covered) {
    if (chosen.length >= want) break;
    if (!countries.has(club.country)) {
      chosen.push(club);
      countries.add(club.country);
    }
  }
  // Then fill on career order, which keeps the six spread across the years.
  for (const club of covered) {
    if (chosen.length >= want) break;
    if (!chosen.includes(club)) chosen.push(club);
  }

  if (!chosen.some((c) => c.england)) {
    const english = covered.find((c) => c.england);
    if (english) chosen[chosen.length - 1] = english;
  }

  return chosen.sort((a, b) => a.from - b.from);
}

export interface QualifyingPlayer {
  key: string;
  display: string;
  clubs: number;
  countries: number;
  span: string;
  /** Clubs beyond the six, so a reviewer can see there was a choice. */
  spare: number;
  postedAt: string | null;
  shirts: string[];
}

const COLUMNS = "id,slug,team,season,shirt_type,player_name,primary_image_url";

/**
 * Every team whose shirts this career could use, the national side included.
 *
 * The national side is the easy one to forget, because it does not live in
 * `spells`. Forgetting it does not fail loudly: `byTeam.get("England")` returns
 * undefined, `bestShirtFor` reads that as "no shirt", and the one lever that
 * takes a five-club career to six silently never fires. It cost eleven of the
 * careers on file before anyone noticed.
 */
export function teamsFor(career: Career): string[] {
  const teams = career.spells.map((s) => s.team);
  if (career.international) teams.push(career.international.team);
  return [...new Set(teams)];
}

async function shirtsForTeams(teams: readonly string[]): Promise<Map<string, ShirtRow[]>> {
  const rows = await pageIn<ShirtRow, string>("Loading shirts", teams, (batch, from, to) =>
    kickio()
      .from("products")
      .select(COLUMNS)
      .in("team", batch)
      .not("primary_image_url", "is", null)
      .is("deleted_at", null)
      .order("id", { ascending: true })
      .range(from, to),
  );

  const byTeam = new Map<string, ShirtRow[]>();
  for (const row of rows) {
    const held = byTeam.get(row.team);
    if (held) held.push(row);
    else byTeam.set(row.team, [row]);
  }
  return byTeam;
}

/** When each player was last posted about, from the engine's own drafts. */
async function lastPosted(): Promise<Map<string, string>> {
  const { data, error } = await engine()
    .from("post_drafts")
    .select("subject_ref,created_at")
    .eq("recipe_key", WHO_AM_I_KEY)
    .in("status", ["draft", "approved", "published"])
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Loading Who Am I history failed: ${error.message}`);
  const seen = new Map<string, string>();
  for (const row of (data ?? []) as Array<{ subject_ref: string; created_at: string }>) {
    seen.set(row.subject_ref, row.created_at);
  }
  return seen;
}

/**
 * The careers a post could be made about right now.
 *
 * Ordered by what makes the better puzzle: most countries, then most spare
 * clubs (so the six shown were chosen rather than scraped together), then the
 * longest since we last used him.
 */
export async function qualifyingPlayers(now = Date.now()): Promise<QualifyingPlayer[]> {
  const teams = [...new Set(CAREERS.flatMap(teamsFor))];
  const [byTeam, posted] = await Promise.all([shirtsForTeams(teams), lastPosted()]);

  const rows: QualifyingPlayer[] = [];
  for (const career of CAREERS) {
    const covered = coverFor(career, byTeam);
    if (covered.length < SHIRTS) continue;
    // The brief: at least one English club, Championship or better.
    if (!covered.some((c) => c.england && !c.international)) continue;

    const postedAt = posted.get(career.key) ?? null;
    if (postedAt && now - Date.parse(postedAt) < COOLDOWN_DAYS * 86_400_000) continue;

    const six = pickSix(covered);
    rows.push({
      key: career.key,
      display: career.display,
      clubs: covered.length,
      countries: new Set(six.map((c) => c.country)).size,
      span: `${Math.min(...six.map((c) => c.from))}–${Math.max(...six.map((c) => c.to)) + 1}`,
      spare: covered.length - SHIRTS,
      postedAt,
      shirts: six.map((c) => c.imageUrl),
    });
  }

  return rows.sort(
    (a, b) =>
      b.countries - a.countries ||
      b.spare - a.spare ||
      Date.parse(a.postedAt ?? "1970-01-01") - Date.parse(b.postedAt ?? "1970-01-01"),
  );
}

/**
 * The reply to post once the guesses are in.
 *
 * Built in code rather than written by the model, for one reason: this is the
 * only text in the whole post that is ALLOWED to contain the name, and the
 * safest way to guarantee the model never writes it anywhere else is never to
 * let the model near it.
 */
export function revealText(career: Career, six: readonly CoveredClub[]): string {
  const clubs = six.map((c) => c.team);
  const last = clubs[clubs.length - 1];
  return (
    `It's ${career.display}. ${clubs.slice(0, -1).join(", ")} and ${last}: ` +
    `${six.length} clubs, ${new Set(six.map((c) => c.country)).size} countries. ` +
    `Shirts from most of them are on kickio.com.`
  );
}

/**
 * The line the card prints when a shirt on the grid carries a name.
 *
 * Without it the grid is quietly confusing: a "Möller 10" shirt in a row of
 * blank ones reads either as the answer being given away or as a mistake. It is
 * neither - it is a teammate, and saying so turns the oddity into the best clue
 * on the card.
 */
export function teammateNote(six: readonly CoveredClub[]): string | null {
  const named = six.filter((club) => club.playerName).length;
  if (named === 0) return null;
  return named === 1
    ? "One of these carries a teammate's name, not mine"
    : `${named === 2 ? "Two" : named === 3 ? "Three" : String(named)} of these carry a teammate's name, none of them mine`;
}

export async function runWhoAmI(playerKey: string): Promise<RecipeResult> {
  const career = careerByKey(playerKey);
  if (!career) return { ok: false, reason: `No career on file for '${playerKey}'` };

  const byTeam = await shirtsForTeams(teamsFor(career));
  const covered = coverFor(career, byTeam);

  if (covered.length < SHIRTS) {
    return {
      ok: false,
      reason:
        `Only ${covered.length} of this career's clubs have a shirt from the right years ` +
        `(need ${SHIRTS}). A shirt from outside the spell is not his shirt.`,
      diagnostics: { covered: covered.map((c) => `${c.team} ${c.season}`) },
    };
  }
  if (!covered.some((c) => c.england)) {
    return { ok: false, reason: "No English club among the shirts we can show" };
  }

  const six = pickSix(covered);
  const countries = new Set(six.map((c) => c.country));
  const span = { from: Math.min(...six.map((c) => c.from)), to: Math.max(...six.map((c) => c.to)) + 1 };

  // Every club shown is a claim that he played there, in those years, so each
  // one is stated as a claim with the shirt it was matched to.
  const claims: Claim[] = [
    ...six.map((club) => ({
      statement: `Played for ${club.team}${club.loan ? " (on loan)" : ""}, ${club.from}–${club.to + 1}`,
      value: club.season,
      source: `careers.ts (${career.key}) matched to products.id ${club.productId}`,
      basis: `The shirt shown is ${club.team} ${club.season}, inside that spell`,
    })),
    // A named shirt is a claim about a second person, so it gets its own. The
    // claim is narrow and checkable: that name was on that club's shirt in a
    // season the mystery player was there. It is not "they were close" or
    // "they played together every week".
    ...six
      .filter((club) => club.playerName)
      .map((club) => ({
        statement:
          `The ${club.team} shirt shown carries ${club.playerName}, who wore it in ` +
          `${club.season}, a season this player was at the club`,
        value: club.playerName!,
        source: `products.player_name (id ${club.productId})`,
        basis: "Teammate by squad and season, from the shirt itself - not a claim about anything more",
      })),
  ];

  return {
    ok: true,
    candidate: {
      subjectRef: career.key,
      // The queue needs to know who it is. The card and the copy never do.
      headline: `Who am I? ${career.display} (${six.length} clubs, ${countries.size} countries)`,
      sourceData: {
        // THE ANSWER. Held for the reviewer and the reveal, and named in the
        // brief as forbidden in the copy.
        answer: career.display,
        reveal: revealText(career, six),
        nationality: career.nationality,
        clubs_shown: six.length,
        countries: countries.size,
        span: `${span.from}–${span.to}`,
        span_from: span.from,
        span_to: span.to,
        // What the copy may say. Ordered, and deliberately without the answer.
        career: six.map((club) => ({
          club: club.team,
          country: club.country,
          years: `${club.from}–${club.to + 1}`,
          loan: club.loan,
          shirt: `${club.team} ${club.season}${club.shirtType ? ` ${club.shirtType}` : ""}`,
          kickio_url: club.slug ? kickioUrl(club.slug) : null,
        })),
        // The named shirts, which are a mechanic rather than an accident: each
        // one is somebody who wore that club's shirt in a season the mystery
        // player was there. The copy is told to use them as clues.
        teammates: six
          .filter((club) => club.playerName)
          .map((club) => ({ name: club.playerName, club: club.team, season: club.season })),
        teammate_note: teammateNote(six),
        notes: career.notes,
        clubs_not_shown: covered.filter((c) => !six.includes(c)).map((c) => c.team),
      },
      claims,
      images: six.map((c) => c.imageUrl),
    },
  };
}

export const WHO_AM_I_BRIEF = `**Who Am I?** - six shirts from one career, and a question.

The card shows six club shirts in career order and nothing else. Your job is a
short first-person career that makes someone want to answer.

THE ONE RULE ABOVE ALL OTHERS: **never name him.** Not the surname, not a first
name, not a nickname, not the squad number he is famous for. \`answer\` is in
the data so the reviewer can check it and so there is something to reply with
later - it must not appear in a single line you write. A post that names him is
not a puzzle, it is a caption, and it is the one mistake that wastes the whole
format.

Write it as him. "I signed at seventeen." "I left twice and came back once."
Use \`career\` for the clubs and years and \`notes\` for the facts you are
allowed to state. Nothing else is permitted - no invented fees, no trophies
that are not in the notes, no "widely regarded as".

Do not name the clubs either. They are in the grid; naming them answers the
question. Allude to them instead - "a January move to Manchester", "two years
in Italy", "the club I supported as a boy".

SOME SHIRTS CARRY A NAME, AND THAT NAME IS NEVER HIS. It belongs to a player
who wore that club's shirt in a season he was there - a TEAMMATE. \`teammates\`
lists them and the card says so out loud, because a named shirt in a row of
blank ones otherwise reads as the answer being handed over or as a mistake.

Use them. "The name on the third shirt was in the same dressing room as me" is
a better clue than anything you could invent, and it is the kind of thing that
gets an answer in the comments. What you may NOT do is say more about the
relationship than the shirt supports: same club, same season, nothing about
friendship, position or who played more.

Difficulty is the point. Lead with the least obvious chapter, not the most
famous one, and save the giveaway for last if you use it at all.

End with the ask, in one line: an invitation to answer in the comments. No
hashtag soup, no "RT if you know" - that is somebody else's format.

No TikTok variant. Write X and Instagram only.`;
