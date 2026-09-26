/**
 * Careers, researched by hand, for the Who Am I? post.
 *
 * WHY THIS FILE EXISTS AT ALL. The instinct is to build this from
 * `products.player_name` - the name printed on the shirt. Measured against the
 * live catalogue, every "player" whose name appears across six clubs is either
 * two people (Ronaldo is Cristiano AND Nazário; Cole is four different Coles)
 * or junk in the column ("Goalkeeper", "Issue"). Zero real players qualify, and
 * the naive version produces posts that are confidently wrong - on a format
 * whose entire design invites people to reply with the answer. See
 * docs/who-am-i-recipe.md.
 *
 * So the careers are written down, and the ENGINE decides which of them it can
 * currently field six era-correct shirts for. Adding a player here does not
 * publish anything; it makes him eligible the day the shelf can carry him.
 *
 * SEASONS ARE START YEARS, INCLUSIVE AT BOTH ENDS. A spell covering 1997-98 and
 * 1998-99 is `{ from: 1997, to: 1998 }`. Kickio stores seasons the same way
 * ("1997-98"), so a shirt matches when its start year falls inside the range.
 * This is the rule that keeps the post honest: a 2019 Ajax shirt is not a 1994
 * Ajax player's shirt, and nobody would forgive the mistake.
 *
 * `team` must match `products.team` EXACTLY - it is how the shirt is found.
 * A typo does not error, it silently drops a club, so the test file checks
 * every name against the catalogue's spelling.
 *
 * LOANS COUNT ONLY AT 20+ APPEARANCES. A half-season nobody remembers is a
 * cruel clue, and a three-game loan on the card would read as a mistake. Where
 * a loan is included, `apps` records why it earned its place.
 */

export type EnglishLevel = "top" | "championship";

export interface Spell {
  /** Exactly as Kickio spells it in `products.team`. */
  team: string;
  /** First season START year, e.g. 1997 for 1997-98. */
  from: number;
  /** Last season START year, inclusive. */
  to: number;
  loan?: boolean;
  /** Appearances. Required on a loan, which needs 20+ to count. */
  apps?: number;
  /** Set where this is an English club at Championship level or better. */
  england?: EnglishLevel;
}

export interface Career {
  key: string;
  /** The answer. Never reaches the copy - see the brief. */
  display: string;
  /** Country he played for. Used for the "countries" count, never shown. */
  nationality: string;
  /**
   * His international career, where he had one, as Kickio spells the national
   * side in `products.team`.
   *
   * Used ONLY to fill the last tile when six clubs cannot be covered - see
   * `coverFor`. Curated rather than assumed from nationality, because "played
   * for the country he was born in" is a guess and a card is a claim.
   */
  international?: { team: string; from: number; to: number };
  spells: Spell[];
  /**
   * Facts the copy may use, and nothing beyond them. No "widely regarded as",
   * no invented fees. Each one should be checkable in a minute.
   */
  notes: string[];
}

export const CAREERS: Career[] = [
  {
    key: "stam",
    display: "Jaap Stam",
    nationality: "Netherlands",
    international: { team: "Netherlands", from: 1996, to: 2004 },
    spells: [
      { team: "PSV Eindhoven", from: 1996, to: 1997 },
      { team: "Manchester United", from: 1998, to: 2000, england: "top" },
      { team: "Lazio", from: 2001, to: 2003 },
      { team: "AC Milan", from: 2004, to: 2005 },
      { team: "Ajax", from: 2006, to: 2006 },
    ],
    notes: [
      "Sold three years into a five-year deal, months after a treble",
      "The most expensive defender in the world when he moved to England",
      "Played for two of Milan's clubs' great rivals before joining one of them",
    ],
  },
  {
    key: "van-nistelrooy",
    display: "Ruud van Nistelrooy",
    nationality: "Netherlands",
    international: { team: "Netherlands", from: 1998, to: 2011 },
    spells: [
      { team: "PSV Eindhoven", from: 1998, to: 2000 },
      { team: "Manchester United", from: 2001, to: 2005, england: "top" },
      { team: "Real Madrid", from: 2006, to: 2009 },
      { team: "Hamburger SV", from: 2010, to: 2010 },
      { team: "Malaga", from: 2011, to: 2011 },
    ],
    notes: [
      "A knee gave way the day before his first English medical, and the move collapsed",
      "Scored in ten consecutive Champions League games",
      "Left England after a falling-out and won the league in Spain the next season",
    ],
  },
  {
    key: "vieira",
    display: "Patrick Vieira",
    nationality: "France",
    international: { team: "France", from: 1997, to: 2009 },
    spells: [
      { team: "AC Milan", from: 1995, to: 1995 },
      { team: "Arsenal", from: 1996, to: 2004, england: "top" },
      { team: "Juventus", from: 2005, to: 2005 },
      { team: "Inter Milan", from: 2006, to: 2009 },
      { team: "Manchester City", from: 2010, to: 2010, england: "top" },
    ],
    notes: [
      "Barely played in Italy at nineteen and left for London for about £3.5m",
      "Captained an unbeaten league season",
      "Won the title in Italy four years running, two of them later stripped",
    ],
  },
  {
    key: "balotelli",
    display: "Mario Balotelli",
    nationality: "Italy",
    international: { team: "Italy", from: 2010, to: 2018 },
    spells: [
      { team: "Inter Milan", from: 2007, to: 2009 },
      { team: "Manchester City", from: 2010, to: 2012, england: "top" },
      { team: "AC Milan", from: 2013, to: 2014 },
      { team: "Liverpool", from: 2014, to: 2015, england: "top" },
      { team: "AC Milan", from: 2015, to: 2015, loan: true, apps: 23 },
      { team: "Nice", from: 2016, to: 2018 },
      { team: "Marseille", from: 2018, to: 2018, loan: true, apps: 15 },
      { team: "Brescia", from: 2019, to: 2019 },
    ],
    notes: [
      "Asked why always him, on a shirt, in front of 80,000 people",
      "Won the league in England and in Italy before he was twenty-four",
      "Went home to play for the club of the city he grew up in",
    ],
  },
  {
    key: "ibrahimovic",
    display: "Zlatan Ibrahimović",
    nationality: "Sweden",
    international: { team: "Sweden", from: 2001, to: 2023 },
    spells: [
      { team: "Ajax", from: 2001, to: 2003 },
      { team: "Juventus", from: 2004, to: 2005 },
      { team: "Inter Milan", from: 2006, to: 2008 },
      { team: "Barcelona", from: 2009, to: 2009 },
      { team: "AC Milan", from: 2010, to: 2011 },
      { team: "Paris Saint-Germain", from: 2012, to: 2015 },
      { team: "Manchester United", from: 2016, to: 2017, england: "top" },
      { team: "AC Milan", from: 2019, to: 2022 },
    ],
    notes: [
      "Won a league title in four countries in a row",
      "Scored from forty yards with an overhead kick on an international farewell",
      "One season in Spain, and he has never been especially kind about it since",
    ],
  },
  {
    key: "pienaar",
    display: "Steven Pienaar",
    nationality: "South Africa",
    international: { team: "South Africa", from: 2002, to: 2016 },
    spells: [
      { team: "Ajax", from: 2001, to: 2005 },
      { team: "Borussia Dortmund", from: 2006, to: 2006 },
      { team: "Everton", from: 2007, to: 2010, england: "top" },
      { team: "Tottenham Hotspur", from: 2011, to: 2011, england: "top" },
      { team: "Everton", from: 2012, to: 2015, england: "top" },
      { team: "Sunderland", from: 2016, to: 2016, england: "top" },
    ],
    notes: [
      "Left Johannesburg for Amsterdam at seventeen",
      "Sold to a London club in January and loaned straight back the following season",
      "Played at a World Cup in his own country",
    ],
  },
  {
    key: "ashley-young",
    display: "Ashley Young",
    nationality: "England",
    international: { team: "England", from: 2007, to: 2018 },
    spells: [
      { team: "Watford", from: 2003, to: 2006, england: "championship" },
      { team: "Aston Villa", from: 2007, to: 2010, england: "top" },
      { team: "Manchester United", from: 2011, to: 2019, england: "top" },
      { team: "Inter Milan", from: 2020, to: 2020 },
      { team: "Aston Villa", from: 2021, to: 2022, england: "top" },
      { team: "Everton", from: 2023, to: 2024, england: "top" },
    ],
    notes: [
      "A winger who finished his career as a full-back",
      "Won the league in Italy at thirty-five",
      "Went back to a former club a decade after leaving it",
    ],
  },
  {
    key: "brian-laudrup",
    display: "Brian Laudrup",
    nationality: "Denmark",
    international: { team: "Denmark", from: 1987, to: 1998 },
    spells: [
      { team: "Bayern Munich", from: 1990, to: 1991 },
      { team: "Fiorentina", from: 1992, to: 1992 },
      { team: "AC Milan", from: 1993, to: 1993 },
      { team: "Rangers FC", from: 1994, to: 1997 },
      { team: "Chelsea", from: 1998, to: 1998, england: "top" },
      { team: "Ajax", from: 1999, to: 1999, loan: true, apps: 11 },
    ],
    notes: [
      "Won a European Championship with a squad called up from their holidays",
      "Three Italian seasons, and he barely played in one of them",
      "His brother played for the club he never did",
    ],
  },
  {
    key: "desailly",
    display: "Marcel Desailly",
    nationality: "France",
    international: { team: "France", from: 1993, to: 2004 },
    spells: [
      { team: "Nantes", from: 1986, to: 1991 },
      { team: "Marseille", from: 1992, to: 1992 },
      { team: "AC Milan", from: 1993, to: 1997 },
      { team: "Chelsea", from: 1998, to: 2003, england: "top" },
    ],
    notes: [
      "Won the European Cup in consecutive seasons with different clubs",
      "Sent off in a World Cup final his country still won",
      "Moved from midfield to centre-half and stayed there",
    ],
  },
  {
    key: "bergkamp",
    display: "Dennis Bergkamp",
    nationality: "Netherlands",
    international: { team: "Netherlands", from: 1990, to: 2000 },
    spells: [
      { team: "Ajax", from: 1986, to: 1992 },
      { team: "Inter Milan", from: 1993, to: 1994 },
      { team: "Arsenal", from: 1995, to: 2005, england: "top" },
    ],
    notes: [
      "Would not fly, and missed away games in Europe for a decade",
      "Two seasons in Italy he has described as the unhappiest of his career",
      "Named after a Scottish striker, with the spelling changed",
    ],
  },
  {
    key: "sheringham",
    display: "Teddy Sheringham",
    nationality: "England",
    international: { team: "England", from: 1993, to: 2002 },
    spells: [
      { team: "Millwall", from: 1984, to: 1990, england: "championship" },
      { team: "Nottingham Forest", from: 1991, to: 1991, england: "top" },
      { team: "Tottenham Hotspur", from: 1992, to: 1996, england: "top" },
      { team: "Manchester United", from: 1997, to: 2000, england: "top" },
      { team: "Tottenham Hotspur", from: 2001, to: 2002, england: "top" },
      { team: "Portsmouth", from: 2003, to: 2003, england: "top" },
      { team: "West Ham United", from: 2004, to: 2006, england: "championship" },
    ],
    notes: [
      "Came off the bench and scored in a Champions League final, then set up the winner",
      "Played in the Premier League past his fortieth birthday",
      "Left a London club for Manchester and came back four years later",
    ],
  },
  {
    key: "michael-owen",
    display: "Michael Owen",
    nationality: "England",
    international: { team: "England", from: 1998, to: 2008 },
    spells: [
      { team: "Liverpool", from: 1996, to: 2003, england: "top" },
      { team: "Real Madrid", from: 2004, to: 2004 },
      { team: "Newcastle United", from: 2005, to: 2008, england: "top" },
      { team: "Manchester United", from: 2009, to: 2011, england: "top" },
      { team: "Stoke City", from: 2012, to: 2012, england: "top" },
    ],
    notes: [
      "Scored at a World Cup at eighteen after running from the halfway line",
      "One season in Spain, mostly from the bench, and he still scored thirteen",
      "Signed for the rivals of the club he had supported and starred for",
    ],
  },
  {
    key: "schmeichel",
    display: "Peter Schmeichel",
    nationality: "Denmark",
    international: { team: "Denmark", from: 1987, to: 2001 },
    spells: [
      { team: "Manchester United", from: 1991, to: 1998, england: "top" },
      { team: "Sporting CP", from: 1999, to: 2000 },
      { team: "Aston Villa", from: 2001, to: 2001, england: "top" },
      { team: "Manchester City", from: 2002, to: 2002, england: "top" },
    ],
    notes: [
      "Captained the side that won a treble and left the same summer",
      "Scored a goal in the Premier League as a goalkeeper",
      "Finished at the club across the city from the one he is remembered at",
    ],
  },
  {
    key: "robbie-fowler",
    display: "Robbie Fowler",
    nationality: "England",
    international: { team: "England", from: 1996, to: 2002 },
    spells: [
      { team: "Liverpool", from: 1993, to: 2001, england: "top" },
      { team: "Leeds United", from: 2001, to: 2002, england: "top" },
      { team: "Manchester City", from: 2003, to: 2005, england: "top" },
      { team: "Liverpool", from: 2005, to: 2006, england: "top" },
      { team: "Blackburn Rovers", from: 2008, to: 2008, england: "top" },
    ],
    notes: [
      "Told a referee he had not been fouled, and asked him not to give the penalty",
      "Scored a hat-trick in four minutes and change",
      "Left the club he grew up at, and came back four years later",
    ],
  },
  {
    key: "di-canio",
    display: "Paolo Di Canio",
    nationality: "Italy",
    spells: [
      { team: "Juventus", from: 1990, to: 1992 },
      { team: "Napoli", from: 1993, to: 1993 },
      { team: "AC Milan", from: 1994, to: 1995 },
      { team: "Celtic", from: 1996, to: 1996 },
      { team: "Sheffield Wednesday", from: 1997, to: 1998, england: "top" },
      { team: "West Ham United", from: 1999, to: 2002, england: "top" },
      { team: "Charlton Athletic", from: 2003, to: 2003, england: "top" },
    ],
    notes: [
      "Pushed a referee over and was banned for eleven matches",
      "Caught the ball instead of scoring, because a goalkeeper was injured, and won a FIFA award for it",
      "Never played for his country",
    ],
  },
  {
    key: "zola",
    display: "Gianfranco Zola",
    nationality: "Italy",
    international: { team: "Italy", from: 1991, to: 1997 },
    spells: [
      { team: "Napoli", from: 1989, to: 1992 },
      { team: "Parma", from: 1993, to: 1995 },
      { team: "Chelsea", from: 1996, to: 2002, england: "top" },
      { team: "Cagliari", from: 2003, to: 2004 },
    ],
    notes: [
      "Wore the number ten at a club where it had belonged to Maradona",
      "Voted his English club's greatest ever player by its supporters",
      "Went home to play for the club of the island he was born on",
    ],
  },
  {
    key: "torres",
    display: "Fernando Torres",
    nationality: "Spain",
    international: { team: "Spain", from: 2003, to: 2014 },
    spells: [
      { team: "Atletico Madrid", from: 2001, to: 2006 },
      { team: "Liverpool", from: 2007, to: 2010, england: "top" },
      { team: "Chelsea", from: 2011, to: 2013, england: "top" },
      { team: "AC Milan", from: 2014, to: 2014, loan: true, apps: 10 },
      { team: "Atletico Madrid", from: 2015, to: 2017 },
    ],
    notes: [
      "Scored the only goal of a European Championship final",
      "The most expensive British transfer at the time, and he scored once in his first fourteen months",
      "Captained his boyhood club at nineteen",
    ],
  },
  {
    key: "alexis-sanchez",
    display: "Alexis Sánchez",
    nationality: "Chile",
    spells: [
      { team: "Barcelona", from: 2011, to: 2013 },
      { team: "Arsenal", from: 2014, to: 2017, england: "top" },
      { team: "Manchester United", from: 2018, to: 2018, england: "top" },
      { team: "Inter Milan", from: 2019, to: 2021 },
      { team: "Marseille", from: 2022, to: 2022 },
    ],
    notes: [
      "Swapped clubs with another player in a straight exchange in January",
      "Played a piano in a club announcement video that has not aged well",
      "Won two Copa Américas",
    ],
  },
  {
    key: "kanu",
    display: "Nwankwo Kanu",
    nationality: "Nigeria",
    international: { team: "Nigeria", from: 1994, to: 2010 },
    spells: [
      { team: "Ajax", from: 1993, to: 1995 },
      { team: "Inter Milan", from: 1996, to: 1998 },
      { team: "Arsenal", from: 1999, to: 2003, england: "top" },
      { team: "West Bromwich Albion", from: 2004, to: 2005, england: "top" },
      { team: "Portsmouth", from: 2006, to: 2011, england: "top" },
    ],
    notes: [
      "A heart defect found in a medical nearly ended his career at twenty-one",
      "Won an Olympic gold medal",
      "Scored the winning goal in an FA Cup final",
    ],
  },
  {
    key: "gary-cahill",
    display: "Gary Cahill",
    nationality: "England",
    international: { team: "England", from: 2010, to: 2018 },
    spells: [
      { team: "Aston Villa", from: 2004, to: 2007, england: "top" },
      { team: "Burnley", from: 2006, to: 2006, loan: true, apps: 26, england: "championship" },
      { team: "Bolton Wanderers", from: 2008, to: 2011, england: "top" },
      { team: "Chelsea", from: 2012, to: 2018, england: "top" },
      { team: "Crystal Palace", from: 2019, to: 2020, england: "top" },
      { team: "AFC Bournemouth", from: 2021, to: 2021, england: "championship" },
    ],
    notes: [
      "Won a Champions League and a Europa League with the same club",
      "A loan in the second tier as a twenty-year-old is where he learned to defend",
      "Captained his club in a cup final",
    ],
  },
  {
    key: "rio-ferdinand",
    display: "Rio Ferdinand",
    nationality: "England",
    international: { team: "England", from: 1997, to: 2011 },
    spells: [
      { team: "West Ham United", from: 1996, to: 2000, england: "top" },
      { team: "Leeds United", from: 2000, to: 2001, england: "top" },
      { team: "Manchester United", from: 2002, to: 2013, england: "top" },
      { team: "Queens Park Rangers", from: 2014, to: 2014, england: "top" },
    ],
    notes: [
      "Twice the most expensive defender in the world, eighteen months apart",
      "Banned for eight months for missing a test",
      "Won six league titles at one club",
    ],
  },
  {
    key: "joe-cole",
    display: "Joe Cole",
    nationality: "England",
    international: { team: "England", from: 2001, to: 2010 },
    spells: [
      { team: "West Ham United", from: 1998, to: 2002, england: "top" },
      { team: "Chelsea", from: 2003, to: 2009, england: "top" },
      { team: "Liverpool", from: 2010, to: 2012, england: "top" },
      { team: "Aston Villa", from: 2013, to: 2014, england: "top" },
      { team: "Coventry City", from: 2015, to: 2015, england: "championship" },
    ],
    notes: [
      "Captained a relegated side at twenty-one",
      "Won three league titles in west London",
      "Finished in England in the third tier, at a club in temporary exile from its city",
    ],
  },
  {
    key: "hamann",
    display: "Dietmar Hamann",
    nationality: "Germany",
    international: { team: "Germany", from: 1997, to: 2005 },
    spells: [
      { team: "Bayern Munich", from: 1993, to: 1997 },
      { team: "Newcastle United", from: 1998, to: 1998, england: "top" },
      { team: "Liverpool", from: 1999, to: 2005, england: "top" },
      { team: "Bolton Wanderers", from: 2006, to: 2006, england: "top" },
      { team: "Manchester City", from: 2006, to: 2008, england: "top" },
    ],
    notes: [
      "Came on at half-time in a Champions League final his side were losing 3-0",
      "Scored the last goal at the old Wembley",
      "One season in the north-east, then twenty-two years in England in total",
    ],
  },
  {
    key: "mcmanaman",
    display: "Steve McManaman",
    nationality: "England",
    international: { team: "England", from: 1994, to: 2001 },
    spells: [
      { team: "Liverpool", from: 1990, to: 1998, england: "top" },
      { team: "Real Madrid", from: 1999, to: 2002 },
      { team: "Manchester City", from: 2003, to: 2004, england: "top" },
    ],
    notes: [
      "Left England on a free transfer and won two European Cups",
      "Scored a volley in a Champions League final",
      "The first Englishman to win that competition with a foreign club",
    ],
  },
  {
    key: "hargreaves",
    display: "Owen Hargreaves",
    nationality: "England",
    international: { team: "England", from: 2001, to: 2008 },
    spells: [
      { team: "Bayern Munich", from: 2000, to: 2006 },
      { team: "Manchester United", from: 2007, to: 2010, england: "top" },
      { team: "Manchester City", from: 2011, to: 2011, england: "top" },
    ],
    notes: [
      "Played for England having never played club football there",
      "Born in Canada, raised on a Welsh father and an English passport",
      "Announced his own fitness with a video posted to the internet",
    ],
  },
  {
    key: "kanchelskis",
    display: "Andrei Kanchelskis",
    nationality: "Russia",
    international: { team: "Russia", from: 1992, to: 1998 },
    spells: [
      { team: "Manchester United", from: 1991, to: 1994, england: "top" },
      { team: "Everton", from: 1995, to: 1996, england: "top" },
      { team: "Fiorentina", from: 1997, to: 1997 },
      { team: "Rangers FC", from: 1998, to: 2001 },
      { team: "Southampton", from: 2002, to: 2002, england: "top" },
    ],
    notes: [
      "Scored a hat-trick in a Manchester derby",
      "Played for the Soviet Union, the CIS and Russia",
      "Left England for Italy and lasted less than a season",
    ],
  },
  {
    key: "tim-cahill",
    display: "Tim Cahill",
    nationality: "Australia",
    international: { team: "Australia", from: 1998, to: 2018 },
    spells: [
      { team: "Millwall", from: 1997, to: 2003, england: "championship" },
      { team: "Everton", from: 2004, to: 2011, england: "top" },
      { team: "New York Red Bulls", from: 2012, to: 2014 },
      { team: "Millwall", from: 2018, to: 2018, england: "championship" },
    ],
    notes: [
      "Reached an FA Cup final with a second-tier club at twenty-four",
      "Celebrated by boxing the corner flag",
      "His country's record scorer",
    ],
  },
  {
    key: "solano",
    display: "Nolberto Solano",
    nationality: "Peru",
    spells: [
      { team: "Boca Juniors", from: 1997, to: 1997 },
      { team: "Newcastle United", from: 1998, to: 2003, england: "top" },
      { team: "Aston Villa", from: 2003, to: 2004, england: "top" },
      { team: "Newcastle United", from: 2005, to: 2006, england: "top" },
      { team: "West Ham United", from: 2007, to: 2008, england: "top" },
      { team: "Leicester City", from: 2009, to: 2010, england: "championship" },
    ],
    notes: [
      "Played the trumpet in a salsa band while playing in the Premier League",
      "Left the north-east, came back eighteen months later",
      "Won a league title in Argentina before he came to England",
    ],
  },
  {
    key: "higuain",
    display: "Gonzalo Higuaín",
    nationality: "Argentina",
    international: { team: "Argentina", from: 2009, to: 2018 },
    spells: [
      { team: "River Plate", from: 2005, to: 2006 },
      { team: "Real Madrid", from: 2007, to: 2012 },
      { team: "Napoli", from: 2013, to: 2015 },
      { team: "Juventus", from: 2016, to: 2018 },
      { team: "AC Milan", from: 2018, to: 2018, loan: true, apps: 22 },
      { team: "Chelsea", from: 2018, to: 2018, loan: true, apps: 18, england: "top" },
    ],
    notes: [
      "Scored 36 in a 38-game Italian league season",
      "Bought by the champions from the team that had just pushed them closest",
      "Born in France, raised in Argentina, and chose Argentina",
    ],
  },
  {
    key: "eriksen",
    display: "Christian Eriksen",
    nationality: "Denmark",
    international: { team: "Denmark", from: 2010, to: 2025 },
    spells: [
      { team: "Ajax", from: 2010, to: 2012 },
      { team: "Tottenham Hotspur", from: 2013, to: 2019, england: "top" },
      { team: "Inter Milan", from: 2020, to: 2021 },
      { team: "Brentford", from: 2021, to: 2021, england: "top" },
      { team: "Manchester United", from: 2022, to: 2024, england: "top" },
    ],
    notes: [
      "Collapsed on the pitch at a European Championship and played again within a year",
      "Won the league in Italy and was told he could not play there afterwards",
      "Signed for a London club in January on a short deal to prove his fitness",
    ],
  },
  {
    key: "distin",
    display: "Sylvain Distin",
    nationality: "France",
    spells: [
      { team: "Paris Saint-Germain", from: 1998, to: 2001 },
      { team: "Newcastle United", from: 2001, to: 2001, loan: true, apps: 28, england: "top" },
      { team: "Manchester City", from: 2002, to: 2006, england: "top" },
      { team: "Portsmouth", from: 2007, to: 2008, england: "top" },
      { team: "Everton", from: 2009, to: 2014, england: "top" },
      { team: "AFC Bournemouth", from: 2015, to: 2015, england: "top" },
    ],
    notes: [
      "Played more than four hundred Premier League games and was never capped",
      "A loan in the north-east that his parent club would not turn permanent",
      "Was a security guard before he was a professional",
    ],
  },
  {
    key: "victor-moses",
    display: "Victor Moses",
    nationality: "Nigeria",
    international: { team: "Nigeria", from: 2012, to: 2018 },
    spells: [
      { team: "Crystal Palace", from: 2007, to: 2009, england: "championship" },
      { team: "Wigan Athletic", from: 2010, to: 2011, england: "top" },
      { team: "Chelsea", from: 2012, to: 2019, england: "top" },
      { team: "Liverpool", from: 2013, to: 2013, loan: true, apps: 22, england: "top" },
      { team: "West Ham United", from: 2015, to: 2015, loan: true, apps: 24, england: "top" },
      { team: "Fenerbahce", from: 2018, to: 2018, loan: true, apps: 22 },
      { team: "Inter Milan", from: 2019, to: 2023 },
    ],
    notes: [
      "Came to England as a child refugee",
      "Loaned to four clubs by one employer and then made a wing-back by a fifth manager",
      "Switched from England youth teams to an African nation",
    ],
  },
  {
    key: "xabi-alonso",
    display: "Xabi Alonso",
    nationality: "Spain",
    international: { team: "Spain", from: 2003, to: 2014 },
    spells: [
      { team: "Real Sociedad", from: 1999, to: 2003 },
      { team: "Liverpool", from: 2004, to: 2008, england: "top" },
      { team: "Real Madrid", from: 2009, to: 2013 },
      { team: "Bayern Munich", from: 2014, to: 2016 },
    ],
    notes: [
      "Scored in a Champions League final his side were 3-0 down in",
      "Scored from inside his own half, twice, in different seasons",
      "Won a World Cup and two European Championships",
    ],
  },
  {
    key: "ballack",
    display: "Michael Ballack",
    nationality: "Germany",
    international: { team: "Germany", from: 1999, to: 2010 },
    spells: [
      { team: "1. FC Kaiserslautern", from: 1997, to: 1998 },
      { team: "Bayer Leverkusen", from: 1999, to: 2001 },
      { team: "Bayern Munich", from: 2002, to: 2005 },
      { team: "Chelsea", from: 2006, to: 2009, england: "top" },
      { team: "Bayer Leverkusen", from: 2010, to: 2011 },
    ],
    notes: [
      "Finished second in the league, the cup and the Champions League in one season",
      "Missed a Champions League final through suspension",
      "Won a title in his first season at three different German clubs",
    ],
  },
  {
    key: "glen-johnson",
    display: "Glen Johnson",
    nationality: "England",
    international: { team: "England", from: 2003, to: 2014 },
    spells: [
      { team: "West Ham United", from: 2002, to: 2002, england: "top" },
      { team: "Chelsea", from: 2003, to: 2006, england: "top" },
      { team: "Portsmouth", from: 2007, to: 2008, england: "top" },
      { team: "Liverpool", from: 2009, to: 2014, england: "top" },
      { team: "Stoke City", from: 2015, to: 2017, england: "top" },
    ],
    notes: [
      "The first signing of a takeover that changed English football",
      "Won an FA Cup on the south coast",
      "A full-back who scored a goal of the season contender from twenty-five yards",
    ],
  },
  {
    key: "brad-friedel",
    display: "Brad Friedel",
    nationality: "United States",
    international: { team: "United States", from: 1992, to: 2005 },
    spells: [
      { team: "Liverpool", from: 1997, to: 1999, england: "top" },
      { team: "Blackburn Rovers", from: 2000, to: 2007, england: "top" },
      { team: "Aston Villa", from: 2008, to: 2010, england: "top" },
      { team: "Tottenham Hotspur", from: 2011, to: 2014, england: "top" },
    ],
    notes: [
      "Played 310 consecutive Premier League matches",
      "Scored a goal as a goalkeeper, and conceded from the restart",
      "Still playing in the Premier League at forty-three",
    ],
  },
  {
    key: "dwight-yorke",
    display: "Dwight Yorke",
    nationality: "Trinidad and Tobago",
    international: { team: "Trinidad and Tobago", from: 1989, to: 2009 },
    spells: [
      { team: "Aston Villa", from: 1989, to: 1997, england: "top" },
      { team: "Manchester United", from: 1998, to: 2001, england: "top" },
      { team: "Blackburn Rovers", from: 2002, to: 2003, england: "top" },
      { team: "Birmingham City", from: 2004, to: 2004, england: "top" },
      { team: "Sunderland", from: 2006, to: 2008, england: "top" },
    ],
    notes: [
      "Spotted on a tour match as a teenager and signed months later",
      "Scored 29 in a treble-winning season",
      "Played at a World Cup at thirty-four for a country of 1.3 million",
    ],
  },
  {
    key: "jenas",
    display: "Jermaine Jenas",
    nationality: "England",
    international: { team: "England", from: 2003, to: 2009 },
    spells: [
      { team: "Nottingham Forest", from: 1999, to: 2001, england: "championship" },
      { team: "Newcastle United", from: 2002, to: 2004, england: "top" },
      { team: "Tottenham Hotspur", from: 2005, to: 2012, england: "top" },
      { team: "Queens Park Rangers", from: 2013, to: 2013, england: "top" },
    ],
    notes: [
      "Young player of the year at nineteen",
      "Sold by his hometown club and bought back by nobody",
      "Scored in a League Cup final his side won",
    ],
  },
  {
    key: "falcao",
    display: "Radamel Falcao",
    nationality: "Colombia",
    international: { team: "Colombia", from: 2007, to: 2022 },
    spells: [
      { team: "River Plate", from: 2005, to: 2008 },
      { team: "FC Porto", from: 2009, to: 2010 },
      { team: "Atletico Madrid", from: 2011, to: 2012 },
      { team: "Monaco", from: 2013, to: 2018 },
      { team: "Manchester United", from: 2014, to: 2014, loan: true, apps: 29, england: "top" },
      { team: "Galatasaray", from: 2019, to: 2020 },
    ],
    notes: [
      "Scored in two Europa League finals, for two different clubs",
      "A knee injury cost him a World Cup his country reached the quarter-finals of",
      "Loaned to Manchester and scored four times in a season",
    ],
  },
  {
    key: "anelka",
    display: "Nicolas Anelka",
    nationality: "France",
    international: { team: "France", from: 1998, to: 2009 },
    spells: [
      { team: "Paris Saint-Germain", from: 1996, to: 1996 },
      { team: "Arsenal", from: 1997, to: 1998, england: "top" },
      { team: "Real Madrid", from: 1999, to: 1999 },
      { team: "Paris Saint-Germain", from: 2000, to: 2001 },
      { team: "Liverpool", from: 2001, to: 2001, loan: true, apps: 22, england: "top" },
      { team: "Manchester City", from: 2002, to: 2004, england: "top" },
      { team: "Fenerbahce", from: 2004, to: 2005 },
      { team: "Bolton Wanderers", from: 2006, to: 2007, england: "top" },
      { team: "Chelsea", from: 2007, to: 2011, england: "top" },
      { team: "West Bromwich Albion", from: 2013, to: 2013, england: "top" },
    ],
    notes: [
      "Won the league in England with two different clubs, nine years apart",
      "Left his first English club at twenty after less than two seasons",
      "Played in four countries before he was thirty",
    ],
  },
  {
    key: "robbie-keane",
    display: "Robbie Keane",
    nationality: "Republic of Ireland",
    international: { team: "Republic of Ireland", from: 1997, to: 2016 },
    spells: [
      { team: "Wolverhampton Wanderers", from: 1997, to: 1998, england: "championship" },
      { team: "Coventry City", from: 1999, to: 1999, england: "top" },
      { team: "Inter Milan", from: 2000, to: 2000 },
      { team: "Leeds United", from: 2000, to: 2001, england: "top" },
      { team: "Tottenham Hotspur", from: 2002, to: 2007, england: "top" },
      { team: "Liverpool", from: 2008, to: 2008, england: "top" },
      { team: "Tottenham Hotspur", from: 2009, to: 2010, england: "top" },
    ],
    notes: [
      "Six months in Italy at twenty, then straight back to England",
      "Sold by one London club and re-signed by them eighteen months later",
      "His country's record scorer",
    ],
  },
  {
    key: "bellamy",
    display: "Craig Bellamy",
    nationality: "Wales",
    international: { team: "Wales", from: 1998, to: 2013 },
    spells: [
      { team: "Norwich City", from: 1997, to: 1999, england: "championship" },
      { team: "Coventry City", from: 2000, to: 2000, england: "top" },
      { team: "Newcastle United", from: 2001, to: 2004, england: "top" },
      { team: "Blackburn Rovers", from: 2005, to: 2005, england: "top" },
      { team: "Liverpool", from: 2006, to: 2006, england: "top" },
      { team: "West Ham United", from: 2007, to: 2008, england: "top" },
      { team: "Manchester City", from: 2009, to: 2010, england: "top" },
      { team: "Cardiff City", from: 2010, to: 2010, loan: true, apps: 39, england: "championship" },
      { team: "Liverpool", from: 2011, to: 2011, england: "top" },
      { team: "Cardiff City", from: 2012, to: 2013, england: "top" },
    ],
    notes: [
      "Played for nine clubs and finished at the one he supported as a boy",
      "Scored in a Champions League knockout tie for a club he joined on loan",
      "Left one English club after a single season five separate times",
    ],
  },
  {
    key: "crespo",
    display: "Hernán Crespo",
    nationality: "Argentina",
    international: { team: "Argentina", from: 1995, to: 2007 },
    spells: [
      { team: "River Plate", from: 1993, to: 1995 },
      { team: "Parma", from: 1996, to: 1999 },
      { team: "Lazio", from: 2000, to: 2001 },
      { team: "Inter Milan", from: 2002, to: 2002 },
      { team: "Chelsea", from: 2003, to: 2003, england: "top" },
      { team: "AC Milan", from: 2004, to: 2004, loan: true, apps: 28 },
      { team: "Chelsea", from: 2005, to: 2005, england: "top" },
      { team: "Inter Milan", from: 2006, to: 2008 },
      { team: "Parma", from: 2010, to: 2011 },
    ],
    notes: [
      "Scored in a Champions League final and finished on the losing side",
      "Played for four different Italian clubs",
      "Left England after one season, came back, then left again",
    ],
  },
  {
    key: "crouch",
    display: "Peter Crouch",
    nationality: "England",
    international: { team: "England", from: 2005, to: 2010 },
    spells: [
      { team: "Tottenham Hotspur", from: 2000, to: 2000, england: "top" },
      { team: "Queens Park Rangers", from: 2000, to: 2000, loan: true, apps: 42, england: "championship" },
      { team: "Portsmouth", from: 2001, to: 2001, england: "championship" },
      { team: "Aston Villa", from: 2002, to: 2003, england: "top" },
      { team: "Southampton", from: 2004, to: 2004, england: "top" },
      { team: "Liverpool", from: 2005, to: 2007, england: "top" },
      { team: "Portsmouth", from: 2008, to: 2008, england: "top" },
      { team: "Tottenham Hotspur", from: 2009, to: 2010, england: "top" },
      { team: "Stoke City", from: 2011, to: 2018, england: "top" },
      { team: "Burnley", from: 2018, to: 2018, england: "top" },
    ],
    notes: [
      "Scored more than a hundred goals in England's top division",
      "Played for two London clubs, two south-coast clubs and two in the Midlands",
      "Won an FA Cup, and was sold by that club the following season",
    ],
  },
  {
    key: "adebayor",
    display: "Emmanuel Adebayor",
    nationality: "Togo",
    spells: [
      { team: "Monaco", from: 2003, to: 2005 },
      { team: "Arsenal", from: 2006, to: 2008, england: "top" },
      { team: "Manchester City", from: 2009, to: 2010, england: "top" },
      { team: "Real Madrid", from: 2010, to: 2010, loan: true, apps: 22 },
      { team: "Tottenham Hotspur", from: 2011, to: 2011, loan: true, apps: 37, england: "top" },
      { team: "Tottenham Hotspur", from: 2012, to: 2014, england: "top" },
      { team: "Crystal Palace", from: 2015, to: 2015, england: "top" },
    ],
    notes: [
      "Reached a Champions League final with a French club before he was twenty-two",
      "Scored against one former club and celebrated in front of their supporters",
      "Played for three clubs in London",
    ],
  },
  {
    key: "veron",
    display: "Juan Sebastián Verón",
    nationality: "Argentina",
    international: { team: "Argentina", from: 1996, to: 2010 },
    spells: [
      { team: "Boca Juniors", from: 1996, to: 1996 },
      { team: "Sampdoria", from: 1996, to: 1997 },
      { team: "Parma", from: 1998, to: 1998 },
      { team: "Lazio", from: 1999, to: 2000 },
      { team: "Manchester United", from: 2001, to: 2002, england: "top" },
      { team: "Chelsea", from: 2003, to: 2003, england: "top" },
      { team: "Inter Milan", from: 2004, to: 2005 },
    ],
    notes: [
      "The most expensive signing in English football when he arrived",
      "Played for four Italian clubs in nine years",
      "Won a league title in England and one in Italy",
    ],
  },
  {
    key: "gudjohnsen",
    display: "Eidur Gudjohnsen",
    nationality: "Iceland",
    spells: [
      { team: "PSV Eindhoven", from: 1994, to: 1997 },
      { team: "Bolton Wanderers", from: 1998, to: 1999, england: "championship" },
      { team: "Chelsea", from: 2000, to: 2005, england: "top" },
      { team: "Barcelona", from: 2006, to: 2008 },
      { team: "Monaco", from: 2009, to: 2009 },
      { team: "Stoke City", from: 2010, to: 2010, england: "top" },
      { team: "Fulham", from: 2011, to: 2011, england: "top" },
      { team: "Club Brugge", from: 2013, to: 2013 },
    ],
    notes: [
      "Replaced his own father in an international match",
      "Won titles in England and in Spain",
      "Played in six countries",
    ],
  },
  {
    key: "klinsmann",
    display: "Jürgen Klinsmann",
    nationality: "Germany",
    international: { team: "Germany", from: 1987, to: 1998 },
    spells: [
      { team: "VfB Stuttgart", from: 1984, to: 1988 },
      { team: "Inter Milan", from: 1989, to: 1991 },
      { team: "Monaco", from: 1992, to: 1993 },
      { team: "Tottenham Hotspur", from: 1994, to: 1994, england: "top" },
      { team: "Bayern Munich", from: 1995, to: 1996 },
      { team: "Sampdoria", from: 1997, to: 1997 },
      { team: "Tottenham Hotspur", from: 1997, to: 1997, england: "top" },
    ],
    notes: [
      "Won a World Cup and a European Championship",
      "One season in London, then back four years later to help them stay up",
      "Celebrated his first English goal by diving on the grass",
    ],
  },
  {
    key: "ziege",
    display: "Christian Ziege",
    nationality: "Germany",
    international: { team: "Germany", from: 1993, to: 2004 },
    spells: [
      { team: "Bayern Munich", from: 1990, to: 1996 },
      { team: "AC Milan", from: 1997, to: 1997 },
      { team: "Middlesbrough", from: 1998, to: 1999, england: "top" },
      { team: "Liverpool", from: 2000, to: 2000, england: "top" },
      { team: "Tottenham Hotspur", from: 2001, to: 2003, england: "top" },
      { team: "Borussia Monchengladbach", from: 2004, to: 2004 },
    ],
    notes: [
      "A left-back who won a European Championship",
      "Three English clubs in four seasons",
      "Left Germany for Italy, then England, then back to Germany",
    ],
  },
  {
    key: "mark-hughes",
    display: "Mark Hughes",
    nationality: "Wales",
    international: { team: "Wales", from: 1984, to: 1999 },
    spells: [
      { team: "Manchester United", from: 1983, to: 1985, england: "top" },
      { team: "Barcelona", from: 1986, to: 1986 },
      { team: "Manchester United", from: 1988, to: 1994, england: "top" },
      { team: "Chelsea", from: 1995, to: 1997, england: "top" },
      { team: "Southampton", from: 1998, to: 1999, england: "top" },
      { team: "Everton", from: 2000, to: 2000, england: "top" },
      { team: "Blackburn Rovers", from: 2001, to: 2001, england: "top" },
    ],
    notes: [
      "Left Manchester for Spain and was back within two years",
      "Won the FA Cup with two different clubs",
      "Managed four of the clubs he played against",
    ],
  },
  {
    key: "heinze",
    display: "Gabriel Heinze",
    nationality: "Argentina",
    international: { team: "Argentina", from: 2003, to: 2010 },
    spells: [
      { team: "Sporting CP", from: 2001, to: 2001 },
      { team: "Paris Saint-Germain", from: 2001, to: 2003 },
      { team: "Manchester United", from: 2004, to: 2006, england: "top" },
      { team: "Real Madrid", from: 2007, to: 2008 },
      { team: "Marseille", from: 2009, to: 2010 },
      { team: "Roma", from: 2011, to: 2011 },
    ],
    notes: [
      "Voted his English club's player of the year in his first season",
      "Left that club after a transfer request they refused",
      "Played in Portugal, France, England, Spain and Italy",
    ],
  },
  {
    key: "kp-boateng",
    display: "Kevin-Prince Boateng",
    nationality: "Ghana",
    spells: [
      { team: "Hertha BSC", from: 2005, to: 2006 },
      { team: "Tottenham Hotspur", from: 2007, to: 2008, england: "top" },
      { team: "Portsmouth", from: 2009, to: 2009, england: "top" },
      { team: "AC Milan", from: 2010, to: 2012 },
      { team: "Schalke 04", from: 2013, to: 2015 },
      { team: "AC Milan", from: 2016, to: 2016 },
      { team: "Eintracht Frankfurt", from: 2017, to: 2017 },
      { team: "Sassuolo", from: 2018, to: 2018 },
      { team: "Fiorentina", from: 2019, to: 2019 },
      { team: "Besiktas", from: 2020, to: 2020 },
      { team: "Hertha BSC", from: 2021, to: 2022 },
    ],
    notes: [
      "Played for more than a dozen clubs in five countries",
      "Reached an FA Cup final with a club that went into administration that season",
      "Born in Berlin, played internationally for an African nation",
    ],
  },
  {
    key: "lukaku",
    display: "Romelu Lukaku",
    nationality: "Belgium",
    international: { team: "Belgium", from: 2010, to: 2024 },
    spells: [
      { team: "RSC Anderlecht", from: 2009, to: 2010 },
      { team: "Chelsea", from: 2011, to: 2013, england: "top" },
      { team: "West Bromwich Albion", from: 2012, to: 2012, loan: true, apps: 38, england: "top" },
      { team: "Everton", from: 2013, to: 2016, england: "top" },
      { team: "Manchester United", from: 2017, to: 2018, england: "top" },
      { team: "Inter Milan", from: 2019, to: 2020 },
      { team: "Chelsea", from: 2021, to: 2021, england: "top" },
      { team: "Inter Milan", from: 2022, to: 2022, loan: true, apps: 37 },
      { team: "Roma", from: 2023, to: 2023, loan: true, apps: 47, england: "top" },
      { team: "Napoli", from: 2024, to: 2025 },
    ],
    notes: [
      "Signed for the same London club twice, a decade apart",
      "His country's record scorer",
      "Won a league title in Italy between two spells in England",
    ],
  },
  {
    key: "makelele",
    display: "Claude Makélélé",
    nationality: "France",
    international: { team: "France", from: 1995, to: 2008 },
    spells: [
      { team: "Nantes", from: 1992, to: 1996 },
      { team: "Marseille", from: 1997, to: 1997 },
      { team: "Celta Vigo", from: 1998, to: 1999 },
      { team: "Real Madrid", from: 2000, to: 2002 },
      { team: "Chelsea", from: 2003, to: 2007, england: "top" },
      { team: "Paris Saint-Germain", from: 2008, to: 2010 },
    ],
    notes: [
      "A position is named after the way he played",
      "Left Spain the summer they signed a Galáctico and did not replace him",
      "Won league titles in France, Spain and England",
    ],
  },
  {
    key: "lescott",
    display: "Joleon Lescott",
    nationality: "England",
    international: { team: "England", from: 2007, to: 2013 },
    spells: [
      { team: "Wolverhampton Wanderers", from: 2000, to: 2005, england: "championship" },
      { team: "Everton", from: 2006, to: 2008, england: "top" },
      { team: "Manchester City", from: 2009, to: 2013, england: "top" },
      { team: "West Bromwich Albion", from: 2014, to: 2014, england: "top" },
      { team: "Aston Villa", from: 2015, to: 2015, england: "top" },
      { team: "AEK Athens", from: 2016, to: 2016 },
      { team: "Sunderland", from: 2017, to: 2017, england: "championship" },
    ],
    notes: [
      "Won two league titles as a centre-half",
      "Left a Midlands club after six years without a top-division game",
      "Finished his career in Greece and then back in England",
    ],
  },
  {
    key: "defoe",
    display: "Jermain Defoe",
    nationality: "England",
    international: { team: "England", from: 2004, to: 2017 },
    spells: [
      { team: "West Ham United", from: 2000, to: 2003, england: "top" },
      { team: "AFC Bournemouth", from: 2000, to: 2000, loan: true, apps: 31 },
      { team: "Tottenham Hotspur", from: 2003, to: 2007, england: "top" },
      { team: "Portsmouth", from: 2008, to: 2008, england: "top" },
      { team: "Tottenham Hotspur", from: 2009, to: 2013, england: "top" },
      { team: "Toronto FC", from: 2014, to: 2014 },
      { team: "Sunderland", from: 2015, to: 2016, england: "top" },
      { team: "AFC Bournemouth", from: 2017, to: 2018, england: "top" },
      { team: "Rangers FC", from: 2019, to: 2020 },
    ],
    notes: [
      "Scored in ten consecutive league games while on loan as a teenager",
      "Signed for the same north London club twice",
      "Played in England, Canada and Scotland",
    ],
  },
  {
    key: "paul-ince",
    display: "Paul Ince",
    nationality: "England",
    international: { team: "England", from: 1992, to: 2000 },
    spells: [
      { team: "West Ham United", from: 1986, to: 1988, england: "top" },
      { team: "Manchester United", from: 1989, to: 1994, england: "top" },
      { team: "Inter Milan", from: 1995, to: 1996 },
      { team: "Liverpool", from: 1997, to: 1998, england: "top" },
      { team: "Middlesbrough", from: 1999, to: 2001, england: "top" },
      { team: "Wolverhampton Wanderers", from: 2002, to: 2005, england: "top" },
    ],
    notes: [
      "The first black player to captain England",
      "Photographed in the shirt of his next club before he had left his last",
      "Two years in Italy between two of England's biggest clubs",
    ],
  },
  {
    key: "les-ferdinand",
    display: "Les Ferdinand",
    nationality: "England",
    international: { team: "England", from: 1993, to: 1998 },
    spells: [
      { team: "Queens Park Rangers", from: 1987, to: 1994, england: "top" },
      { team: "Besiktas", from: 1988, to: 1988, loan: true, apps: 24 },
      { team: "Newcastle United", from: 1995, to: 1996, england: "top" },
      { team: "Tottenham Hotspur", from: 1997, to: 2002, england: "top" },
      { team: "West Ham United", from: 2003, to: 2003, england: "top" },
      { team: "Leicester City", from: 2004, to: 2004, england: "championship" },
      { team: "Bolton Wanderers", from: 2005, to: 2005, england: "top" },
      { team: "Watford", from: 2005, to: 2005, england: "championship" },
    ],
    notes: [
      "A season in Turkey on loan as a young player, and he won the cup there",
      "Scored in the Premier League for six different clubs",
      "Left the north-east after two seasons and 41 league goals",
    ],
  },
  {
    key: "edgar-davids",
    display: "Edgar Davids",
    nationality: "Netherlands",
    international: { team: "Netherlands", from: 1994, to: 2005 },
    spells: [
      { team: "Ajax", from: 1991, to: 1995 },
      { team: "AC Milan", from: 1996, to: 1996 },
      { team: "Juventus", from: 1997, to: 2003 },
      { team: "Inter Milan", from: 2004, to: 2004 },
      { team: "Tottenham Hotspur", from: 2005, to: 2006, england: "top" },
      { team: "Ajax", from: 2007, to: 2007 },
      { team: "Crystal Palace", from: 2010, to: 2010, england: "championship" },
    ],
    notes: [
      "Won a European Cup at twenty-two",
      "Wore protective glasses for most of his career",
      "Finished in England as a player-manager in the second tier",
    ],
  },
  {
    key: "ryan-babel",
    display: "Ryan Babel",
    nationality: "Netherlands",
    international: { team: "Netherlands", from: 2005, to: 2017 },
    spells: [
      { team: "Ajax", from: 2004, to: 2006 },
      { team: "Liverpool", from: 2007, to: 2010, england: "top" },
      { team: "TSG Hoffenheim", from: 2011, to: 2012 },
      { team: "Besiktas", from: 2015, to: 2016 },
      { team: "Fulham", from: 2018, to: 2018, england: "top" },
      { team: "Galatasaray", from: 2019, to: 2019 },
      { team: "Ajax", from: 2020, to: 2020 },
    ],
    notes: [
      "Left Amsterdam at twenty for one of England's biggest clubs",
      "Played for both Istanbul giants' rivals across two spells in Turkey",
      "Went back to the club that made him, thirteen years later",
    ],
  },
  {
    key: "nigel-de-jong",
    display: "Nigel de Jong",
    nationality: "Netherlands",
    international: { team: "Netherlands", from: 2004, to: 2015 },
    spells: [
      { team: "Ajax", from: 2002, to: 2005 },
      { team: "Hamburger SV", from: 2006, to: 2008 },
      { team: "Manchester City", from: 2009, to: 2011, england: "top" },
      { team: "AC Milan", from: 2012, to: 2015 },
      { team: "Galatasaray", from: 2016, to: 2017 },
      { team: "Mainz 05", from: 2018, to: 2018 },
    ],
    notes: [
      "Played in a World Cup final",
      "Won a league title in England in the last minute of the season",
      "Five countries in a fifteen-year career",
    ],
  },
  {
    key: "heskey",
    display: "Emile Heskey",
    nationality: "England",
    international: { team: "England", from: 1999, to: 2010 },
    spells: [
      { team: "Leicester City", from: 1994, to: 1999, england: "top" },
      { team: "Liverpool", from: 2000, to: 2003, england: "top" },
      { team: "Birmingham City", from: 2004, to: 2005, england: "top" },
      { team: "Wigan Athletic", from: 2006, to: 2008, england: "top" },
      { team: "Aston Villa", from: 2008, to: 2011, england: "top" },
      { team: "Bolton Wanderers", from: 2014, to: 2015, england: "championship" },
    ],
    notes: [
      "Won a League Cup with two different clubs",
      "Scored five in a season in which his club won three trophies",
      "Six English clubs, never played abroad in Europe",
    ],
  },
  {
    key: "david-james",
    display: "David James",
    nationality: "England",
    international: { team: "England", from: 1997, to: 2010 },
    spells: [
      { team: "Watford", from: 1990, to: 1991, england: "championship" },
      { team: "Liverpool", from: 1992, to: 1998, england: "top" },
      { team: "Aston Villa", from: 1999, to: 2000, england: "top" },
      { team: "West Ham United", from: 2001, to: 2003, england: "top" },
      { team: "Manchester City", from: 2004, to: 2005, england: "top" },
      { team: "Portsmouth", from: 2006, to: 2009, england: "top" },
      { team: "Bristol City", from: 2010, to: 2011, england: "championship" },
      { team: "AFC Bournemouth", from: 2013, to: 2013, england: "championship" },
    ],
    notes: [
      "Holds the record for Premier League appearances by a goalkeeper",
      "Won an FA Cup on the south coast at thirty-seven",
      "Eight English clubs, and a nickname he never liked",
    ],
  },
  {
    key: "andy-cole",
    display: "Andy Cole",
    nationality: "England",
    international: { team: "England", from: 1995, to: 2001 },
    spells: [
      { team: "Arsenal", from: 1989, to: 1991, england: "top" },
      { team: "Bristol City", from: 1992, to: 1992, england: "championship" },
      { team: "Newcastle United", from: 1992, to: 1994, england: "top" },
      { team: "Manchester United", from: 1994, to: 2000, england: "top" },
      { team: "Blackburn Rovers", from: 2001, to: 2003, england: "top" },
      { team: "Fulham", from: 2004, to: 2004, england: "top" },
      { team: "Manchester City", from: 2005, to: 2005, england: "top" },
      { team: "Portsmouth", from: 2006, to: 2006, england: "top" },
      { team: "Birmingham City", from: 2007, to: 2007, england: "top" },
      { team: "Sunderland", from: 2008, to: 2008, england: "top" },
      { team: "Burnley", from: 2008, to: 2008, england: "championship" },
      { team: "Nottingham Forest", from: 2008, to: 2008, england: "championship" },
    ],
    notes: [
      "Scored 34 goals in a 42-game league season",
      "Sold from one northern club to their title rivals midway through a season",
      "Played for a dozen English clubs and won five league titles at one of them",
    ],
  },
  {
    key: "louis-saha",
    display: "Louis Saha",
    nationality: "France",
    international: { team: "France", from: 2004, to: 2012 },
    spells: [
      { team: "Fulham", from: 2000, to: 2003, england: "top" },
      { team: "Manchester United", from: 2003, to: 2007, england: "top" },
      { team: "Everton", from: 2008, to: 2011, england: "top" },
      { team: "Tottenham Hotspur", from: 2011, to: 2011, england: "top" },
      { team: "Sunderland", from: 2012, to: 2012, england: "top" },
      { team: "Lazio", from: 2013, to: 2013 },
    ],
    notes: [
      "Scored in an FA Cup final for the club that had sold him a striker",
      "Moved from west London to Manchester in a January",
      "Finished in Italy after a career almost entirely in England",
    ],
  },
  {
    key: "bolo-zenden",
    display: "Boudewijn Zenden",
    nationality: "Netherlands",
    international: { team: "Netherlands", from: 1997, to: 2006 },
    spells: [
      { team: "PSV Eindhoven", from: 1994, to: 1997 },
      { team: "Barcelona", from: 1998, to: 2000 },
      { team: "Chelsea", from: 2001, to: 2003, england: "top" },
      { team: "Middlesbrough", from: 2003, to: 2003, loan: true, apps: 41, england: "top" },
      { team: "Liverpool", from: 2005, to: 2006, england: "top" },
      { team: "Marseille", from: 2007, to: 2008 },
      { team: "Sunderland", from: 2009, to: 2010, england: "top" },
    ],
    notes: [
      "Scored the winner in a League Cup final while on loan",
      "Played in a Champions League final",
      "Four English clubs, plus Spain, France and the Netherlands",
    ],
  },
  {
    key: "woodgate",
    display: "Jonathan Woodgate",
    nationality: "England",
    international: { team: "England", from: 1999, to: 2008 },
    spells: [
      { team: "Leeds United", from: 1998, to: 2002, england: "top" },
      { team: "Newcastle United", from: 2002, to: 2003, england: "top" },
      { team: "Real Madrid", from: 2004, to: 2006 },
      { team: "Middlesbrough", from: 2006, to: 2007, england: "top" },
      { team: "Tottenham Hotspur", from: 2008, to: 2010, england: "top" },
      { team: "Stoke City", from: 2011, to: 2012, england: "top" },
    ],
    notes: [
      "Scored an own goal and was sent off on his debut in Spain",
      "Headed the winner in a League Cup final",
      "Went from the north of England to the Bernabéu and back again",
    ],
  },
  {
    key: "chris-sutton",
    display: "Chris Sutton",
    nationality: "England",
    international: { team: "England", from: 1997, to: 1997 },
    spells: [
      { team: "Norwich City", from: 1991, to: 1993, england: "top" },
      { team: "Blackburn Rovers", from: 1994, to: 1998, england: "top" },
      { team: "Chelsea", from: 1999, to: 1999, england: "top" },
      { team: "Celtic", from: 2000, to: 2005 },
      { team: "Birmingham City", from: 2005, to: 2006, england: "top" },
      { team: "Aston Villa", from: 2006, to: 2006, england: "top" },
    ],
    notes: [
      "Won the league in England as half of a famous strike pairing",
      "One goal in his only season in London",
      "Won five league titles in Scotland",
    ],
  },
  {
    key: "gascoigne",
    display: "Paul Gascoigne",
    nationality: "England",
    international: { team: "England", from: 1988, to: 1998 },
    spells: [
      { team: "Newcastle United", from: 1985, to: 1987, england: "top" },
      { team: "Tottenham Hotspur", from: 1988, to: 1991, england: "top" },
      { team: "Lazio", from: 1992, to: 1994 },
      { team: "Rangers FC", from: 1995, to: 1997 },
      { team: "Middlesbrough", from: 1997, to: 1999, england: "top" },
      { team: "Everton", from: 2000, to: 2001, england: "top" },
      { team: "Burnley", from: 2001, to: 2001, england: "championship" },
    ],
    notes: [
      "Cried in a World Cup semi-final and became a national figure",
      "Injured himself in the FA Cup final that was meant to be his farewell",
      "Won the league in Scotland twice",
    ],
  },
];

export function careerByKey(key: string): Career | undefined {
  return CAREERS.find((c) => c.key === key);
}

/**
 * Where each club plays, for the "four countries" line on the card.
 *
 * Kickio has no country on `products`, and deriving one from a league table we
 * do not have would be guesswork. Seventy-four entries is a morning's typing
 * and it is checkable at a glance, which a heuristic would not be.
 */
export const CLUB_COUNTRY: Record<string, string> = {
  "AFC Bournemouth": "England", Arsenal: "England", "Aston Villa": "England",
  "Birmingham City": "England", "Blackburn Rovers": "England", "Bolton Wanderers": "England",
  "Bristol City": "England", Burnley: "England", "Cardiff City": "Wales",
  Chelsea: "England", "Coventry City": "England", "Crystal Palace": "England",
  Everton: "England", Fulham: "England", "Leeds United": "England",
  "Leicester City": "England", Liverpool: "England", "Manchester City": "England",
  "Manchester United": "England", Middlesbrough: "England", "Newcastle United": "England",
  "Norwich City": "England", "Nottingham Forest": "England", Portsmouth: "England",
  "Queens Park Rangers": "England", Southampton: "England", "Stoke City": "England",
  Sunderland: "England", "Tottenham Hotspur": "England", Watford: "England",
  "West Bromwich Albion": "England", "West Ham United": "England",
  "Wigan Athletic": "England", "Wolverhampton Wanderers": "England",
  Celtic: "Scotland", "Rangers FC": "Scotland",
  "AC Milan": "Italy", Fiorentina: "Italy", "Inter Milan": "Italy", Juventus: "Italy",
  Lazio: "Italy", Napoli: "Italy", Parma: "Italy", Roma: "Italy", Sampdoria: "Italy",
  Sassuolo: "Italy",
  Barcelona: "Spain", "Celta Vigo": "Spain", "Real Madrid": "Spain",
  "Bayern Munich": "Germany", "Borussia Monchengladbach": "Germany",
  "Eintracht Frankfurt": "Germany", "Hamburger SV": "Germany", "Hertha BSC": "Germany",
  "Mainz 05": "Germany", "Schalke 04": "Germany", "TSG Hoffenheim": "Germany",
  "VfB Stuttgart": "Germany",
  Marseille: "France", Monaco: "France", Nantes: "France", "Paris Saint-Germain": "France",
  Ajax: "Netherlands", "PSV Eindhoven": "Netherlands",
  "Club Brugge": "Belgium", "RSC Anderlecht": "Belgium",
  Besiktas: "Turkey", Fenerbahce: "Turkey", Galatasaray: "Turkey",
  "AEK Athens": "Greece", "Sporting CP": "Portugal",
  "Boca Juniors": "Argentina", "River Plate": "Argentina",
  "Toronto FC": "Canada", "New York Red Bulls": "United States",
  Brentford: "England", "Charlton Athletic": "England", Millwall: "England",
  "Sheffield Wednesday": "England",
  "Atletico Madrid": "Spain", Malaga: "Spain", "Real Sociedad": "Spain",
  Brescia: "Italy", Cagliari: "Italy",
  "Borussia Dortmund": "Germany", "Bayer Leverkusen": "Germany",
  "1. FC Kaiserslautern": "Germany",
  Nice: "France", "FC Porto": "Portugal",
};

/** Fewest appearances a loan needs before it earns a place on the card. */
export const MIN_LOAN_APPS = 20;

/** A loan nobody remembers is a cruel clue and reads as a mistake on the grid. */
export function spellCounts(spell: Spell): boolean {
  return !spell.loan || (spell.apps ?? 0) >= MIN_LOAN_APPS;
}
