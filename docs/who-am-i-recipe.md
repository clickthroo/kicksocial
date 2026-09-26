# Who Am I? A guess-the-player post

A 3×2 grid of six club shirts from one player's career, a career written out
without the name, and an invitation to answer in the comments. Modelled on
Classic Football Shirts' "Guess the player", which is one of the most reliably
commented-on formats in this corner of football.

Status: **built**, at `/who-am-i`. The findings below decided the shape, so
they come first.

---

## 1. The obvious way to build this does not work

The instinct is to use `products.player_name`, the name printed on the shirt,
and find players whose name appears across six clubs. Measured against the live
catalogue, every player who clears that bar:

| name | clubs | what it actually is |
|---|---|---|
| Ronaldo | 8 | **two people.** Al-Nassr, Man Utd, Portugal, Juventus (Cristiano) plus Barcelona, Brazil, Inter (Nazário) |
| Beckham | 5 | one person, but five, and one of them is England |
| Keane | 4 | **two people**, Roy and Robbie, plus a Northern Ireland shirt that is neither |
| Cole | 4 | **four people**, Andy, Ashley, Joe, Carlton |
| Goalkeeper | 4 | junk in the column |
| Issue | 4 | junk in the column |

So: **zero real players qualify today**, and the naive version produces posts
that are confidently wrong. On this format that is the worst possible failure,
because the entire design invites people to reply with the answer, the first
comment would be someone pointing out there are two Ronaldos.

`player_name` is also the wrong column conceptually. The reference post uses
six **plain** club shirts, no names printed. The puzzle is the clubs.

## 2. What the catalogue can actually carry

| | |
|---|---|
| photographed products, not deleted | **3,545** |
| distinct clubs among them | **406** |
| with a parsable season | 3,542 (99.9%) |
| span | 1975 – 2026 |

That is a deep shelf. Checked against four real careers, counting only clubs
where we hold a shirt from a season inside the player's spell:

- **Anelka**: PSG, Arsenal, Real Madrid, Liverpool, Man City, Bolton, Chelsea,
  Juventus, West Brom. Nine coverable clubs.
- **Robbie Keane**: Wolves, Coventry, Inter, Leeds, Spurs, Liverpool, Celtic,
  West Ham, Aston Villa. Nine.
- **Craig Bellamy**: Norwich, Coventry, Newcastle, Celtic, Blackburn,
  Liverpool, West Ham, Man City, Cardiff. Nine.
- **Crespo**: River Plate, Parma, Lazio, Inter, Chelsea, Milan. Six.

The format works. What it needs is a career source, and that cannot come out of
Kickio.

## 3. The approach

**A curated career list, intersected live with the catalogue.**

Careers are researched and written into the repo, a small, reviewable file,
the same shape `legend-shelf.ts` already uses for its legend allowlist, and for
the same reason: an allowlist cannot fail open, and a wrong attribution here is
a false claim about a real person.

Qualification is then computed **live** against the products table, so the list
refreshes itself exactly like Price History: as the catalogue grows, players
qualify on their own, and nobody has to maintain a second list of who is ready.

```ts
interface Career {
  key: string;                    // "anelka"
  display: string;                // the answer. Never leaves the engine.
  born: number;
  /** In order. `from`/`to` are the seasons he was actually there. */
  spells: Array<{
    team: string;                 // must match products.team exactly
    from: number;                 // 1997 = the 1997-98 season
    to: number;
    loan?: boolean;
    england?: "top" | "championship";
  }>;
  /** One or two facts the copy may use. Verified, not colour. */
  notes: string[];
}
```

### Qualifying rule

A player is offerable when **all** of these hold:

1. **Six or more distinct clubs** where we hold a photographed, non-deleted
   product whose `season` falls inside that spell. Six is the grid.
2. **Era match is mandatory.** A 2019 Ajax shirt is not a Seedorf shirt. This is
   the rule that keeps the post honest, and it is the one most likely to be
   quietly dropped later to make the list longer, it must not be.
3. **At least one English club at Championship level or better**, per the brief.
   Carried on the spell, not inferred from the club, because clubs move
   divisions.
4. **Club shirts only.** A national shirt gives away nationality in one glance
   and halves the puzzle. National spells may still be mentioned in the copy.
5. **No two shirts from the same club**, and preferably no two from the same
   season, the grid should read as six chapters.
6. **Home, away or third only.** `shirt_type` also carries Training,
   Goalkeeper, GK Home/Away/Third, Fourth, Pre-Match, Track Jacket, Jacket, Cap
   and Socks. See §9.

### Ordering in the picker

Same pattern as Price History: the list is ordered by what makes the best post,
not by what is easiest to compute.

1. **Coverage**: players where we can field seven or more clubs, so the six
   chosen are the six most interesting rather than the only six available.
2. **Spread**: more countries and more decades first. A career across six
   English clubs is a weaker puzzle than one across six countries.
3. **Recency of the last post about them**, so the same face does not recur.

Cooldown: a player, once posted, is out for 180 days. Rejected and expired
drafts release him, exactly as elsewhere in the engine.

## 4. The card

Two crops, `paper` style, Kickio lockup as standard.

```
┌──────────────────────────────────────────┐
│  [mark]  KICKIO.COM              WHO AM I?│
│                                           │
│   ┌────┐   ┌────┐   ┌────┐                │
│   │ 1  │   │ 2  │   │ 3  │   six shirts,  │
│   └────┘   └────┘   └────┘   chronological│
│   ┌────┐   ┌────┐   ┌────┐   left→right,  │
│   │ 4  │   │ 5  │   │ 6  │   top→bottom   │
│   └────┘   └────┘   └────┘                │
│                                           │
│   6 clubs · 4 countries · 1996–2014        │
│   Answer in the comments                  │
└──────────────────────────────────────────┘
```

Deliberate choices:

- **No club names, no crests called out, no years per shirt.** The shirts are
  the puzzle. Labelling them is answering it.
- **A career-in-numbers strip**: clubs, countries, span. It is a hook, it adds
  difficulty gradients, and it names nobody.
- **Chronological order.** It reads as a story and it is a fair extra clue.
- **No silhouette.** The reference uses one; we have no player photography and a
  generic outline adds nothing. The type does the work instead.
- **Alt text describes the shirts, never the clubs**, so it does not spoil the
  puzzle for anyone reading it.

## 5. The copy

A short career written in the first person, "I signed at seventeen and left
before I was twenty", ending on the ask. The brief's hard rules:

- **Never the name.** Not the surname, not a nickname, not a shirt number that
  only one person wore at that club.
- Everything stated must come from `spells` or `notes`. No invented transfer
  fees, no invented trophies, no "widely regarded as".
- The clubs may be alluded to but not named, the grid already shows them, and
  naming them turns a puzzle into a caption.
- End with the ask. One line, no hashtag soup.
- No TikTok variant.

The answer is stored on the draft (never in the copy) so the reviewer can check
it, and so there is something to reply with when the thread fills up.

## 6. Engagement

The format earns comments because it is answerable and slightly competitive.
Two things make it work better:

- **A reveal.** The answer posted as a reply a few hours later, with a line about
  where to find those shirts. The draft carries the answer text ready to send.
- **Difficulty honesty.** A career nobody can get is not engaging, it is
  annoying. The picker shows a difficulty read, how famous the clubs are, how
  recent the career, so an easy one and a hard one can be alternated.

## 7. Decisions needed

1. **How many careers to seed.** Twenty gives roughly five months at one a week
   and is a day's research. Fifty is better but is the bulk of the work.
2. **Loans.** Include them? They make careers longer and puzzles harder
   (Keane at Celtic was six months). Recommendation: include, and mark them, so
   the copy can say "a half-season I barely talk about".
3. **The reveal.** Worth building the reply text into the draft, or handled by
   hand?
4. **Where it sits.** Its own page like Price History, or a section of it.
   Recommendation: its own, `/who-am-i`.


---

## 8. What building it taught us: reverse the search

The first thirty careers were chosen the obvious way: think of well-travelled
players, write them down, see who the shelf could carry. **Four of thirty
qualified.** The near-misses were all the same shape, five clubs covered and
one gap, usually a single missing season at a mid-table English club.

Reversing it, reading the inventory first, then looking for careers that fit,
does not fix that. It makes the search efficient, and it makes the ceiling
visible, which is the more useful result:

| club | seasons we hold, photographed |
|---|---|
| Manchester United | 1990–2025, nearly unbroken |
| Liverpool | 1991–2026, nearly unbroken |
| Arsenal | 1990–2025, nearly unbroken |
| Chelsea | 1993–2022 |
| Manchester City | 1989–99, 2003–13, 2015–25 |
| Everton, Spurs, Villa, Newcastle | dense in patches, gaps of 3–6 years |
| Middlesbrough | 2004, 2007, 2019 |
| Bolton | 1995, 2012 |
| Leicester | 2009 onwards only |

Six era-correct **club** shirts needs a career spent almost entirely at clubs in
the top block. Anelka, Vieira, Lukaku, Stam, Woodgate and Sheringham all cover
exactly five. It is not a search problem; it is the shelf.

### The lever, and why this one

Three ways to widen it, and only one is honest:

1. **Loosen the era match**: allow a shirt from a season either side. No. That
   is the one rule the format cannot survive losing.
2. **Drop to five tiles.** Works, but it is a different format, and 3×2 is the
   thing people recognise.
3. **Allow one national-side shirt, and only to reach six.** Taken.

A national shirt is still a shirt he wore, so nothing becomes untrue. It fills
the last tile rather than replacing a club, so the puzzle stays a club puzzle.
It does narrow nationality at a glance, which is why it is a last resort, why
it is never more than one, and why it does not satisfy the English-club rule.
A hint makes a puzzle answerable; two hints make it a caption.

**Four of thirty became eleven.**

### Which means the seeding method changes

Careers should now be chosen against the inventory rather than from memory: pick
players whose clubs sit in the dense blocks above, and check before writing.
The verifier is `coverFor` and it takes seconds to run against real years.

## 9. Two rules the real inventory forced

### Only shirts he would have played in

`shirt_type` is a free-ish field, and it is not limited to match shirts. The
values actually present include Training, Goalkeeper, GK Home, GK Away, GK
Third, Fourth, Pre-Match, Track Jacket, Jacket, Cap and Socks. A row of six
shirts is a claim: *this player wore these*. A training top or a manager's
jacket weakens the claim, and on a 3×2 grid it simply looks like a mistake.

`isMatchShirt` is an **allowlist**: home, away, third, applied as a hard
filter inside `bestShirtFor`, so a club with no match shirt in the era does not
count towards the six. Allowlist rather than a list of things to exclude,
because a negation list is only ever as good as today's data: the next odd
`shirt_type` anyone types would pass a "not a jacket" test and land on the card.
The same reasoning already governs legend names, conditions and sizes.

What it costs, measured:

| | before | after |
|---|---|---|
| photographed products | 3,546 | 3,322 |
| clubs covered | 406 | 402 |
| qualifying careers | 17 | 17 |

No career was lost. Two picks moved, because the club's in-era shirt turned out
not to be a match shirt: Balotelli's sixth is Brescia rather than Marseille, and
Laudrup's is Denmark rather than Ajax.

### Named shirts are a clue, not a leak

About one shirt in three carries a player's name on the back, and it is never
the mystery player's, because a shirt with *his* name would answer the puzzle
outright and never gets chosen. So the card has a choice: hide named shirts,
or explain them.

Hiding them throws away a third of the inventory, and several careers with it.
Explaining them is better than neutral, it is the strongest clue on the card.
Left unexplained, a name in a row of otherwise blank shirts reads either as the
answer being handed over or as a bug. Said out loud, it becomes: *the named
player was my teammate, at that club, in that season*, which narrows the answer
far more than a blank shirt does, while still requiring the reader to do the
work.

How it is implemented:

- `bestShirtFor` **prefers an unnamed shirt** when it has the choice, and takes
  a named one over nothing. Named shirts are a fallback, not a default.
- `teammateNote` writes the line under the career-in-numbers strip, "Two of
  these carry a teammate's name, none of them mine". It is absent entirely when
  no shirt is named, and the card shrinks its tiles to make room when it is
  present (390 → 355 on the portrait crop, 300 → 272 on the landscape one).
- Each named shirt adds a claim the writer may use: the name, the club, and the
  season, all three of which are on the product row.
- The brief permits the name as a clue and **forbids any statement the shirt
  does not support**. Same club, same season, nothing about friendship,
  position, who played more, or who replaced whom. The shirt is evidence of two
  facts and no others.

`teammates` and `teammate_note` both go into `source_data`, so the reveal page
and the post copy work from the same list the card drew.
