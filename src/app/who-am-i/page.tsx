import { Nav } from "../Nav.tsx";
import { PlayerPicker } from "./PlayerPicker.tsx";
import { qualifyingPlayers, SHIRTS, WHO_AM_I_KEY, type QualifyingPlayer } from "@/lib/recipes/who-am-i.ts";
import { CAREERS } from "@/lib/recipes/careers.ts";
import { recordFirstSeen, countNew, isNew, NEW_FOR_DAYS } from "@/lib/recipes/first-seen.ts";

export const dynamic = "force-dynamic";
// Generating copy waits on Claude; the default limit cuts it off mid-write.
export const maxDuration = 300;

export default async function WhoAmIPage() {
  let players: QualifyingPlayer[] = [];
  let loadError: string | null = null;
  let firstSeen = new Map<string, string>();
  let badgeError: string | null = null;

  try {
    players = await qualifyingPlayers();
  } catch (err) {
    loadError = (err as Error).message;
  }

  // Recorded on the way past rather than by a job, so the dates are right even
  // between cron runs. It is a convenience, not the list, so losing it costs
  // the badge and nothing else - but it says so rather than going quiet.
  if (players.length > 0) {
    try {
      firstSeen = await recordFirstSeen(WHO_AM_I_KEY, players.map((p) => p.key));
    } catch (err) {
      badgeError = (err as Error).message;
    }
  }

  const fresh = countNew(firstSeen, players.map((p) => p.key));

  return (
    <div className="wrap">
      <header className="top">
        <h1>Who Am I?</h1>
        <div className="sub">
          {loadError
            ? "Could not work out which careers we can field"
            : `${players.length} ready of ${CAREERS.length} careers on file` +
              (fresh > 0 ? `, ${fresh} new this week` : "")}
        </div>
        <Nav current="/who-am-i" />
      </header>

      {loadError && <div className="banner">{loadError}</div>}
      {badgeError && (
        <div className="banner">
          The list is correct, but we could not work out which careers are new: {badgeError}
        </div>
      )}

      {!loadError && (
        <p className="section-note">
          A career is ready when we hold a photographed shirt from {SHIRTS} of its clubs,
          from a season he was actually there. A 2019 Ajax shirt is not a 1994 Ajax
          player&rsquo;s shirt. The list fills itself as the catalogue grows, so a career
          that is one shirt short today appears here on its own the week that shirt
          lands; anything marked New arrived in the last {NEW_FOR_DAYS} days. Most
          countries first, then the careers where we could pick from more than {SHIRTS}.
        </p>
      )}

      {!loadError && players.length === 0 && (
        <div className="empty">
          <h2>Nothing ready</h2>
          <p>
            No career on file currently has {SHIRTS} clubs with an era-correct shirt. More
            shirts, or more careers, and they appear here on their own.
          </p>
        </div>
      )}

      {players.map((player) => (
        <PlayerPicker
          key={player.key}
          player={player}
          isNew={isNew(firstSeen.get(player.key))}
        />
      ))}
    </div>
  );
}
