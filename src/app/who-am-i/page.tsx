import { Nav } from "../Nav.tsx";
import { PlayerPicker } from "./PlayerPicker.tsx";
import { qualifyingPlayers, SHIRTS, type QualifyingPlayer } from "@/lib/recipes/who-am-i.ts";
import { CAREERS } from "@/lib/recipes/careers.ts";

export const dynamic = "force-dynamic";
// Generating copy waits on Claude; the default limit cuts it off mid-write.
export const maxDuration = 300;

export default async function WhoAmIPage() {
  let players: QualifyingPlayer[] = [];
  let loadError: string | null = null;

  try {
    players = await qualifyingPlayers();
  } catch (err) {
    loadError = (err as Error).message;
  }

  return (
    <div className="wrap">
      <header className="top">
        <h1>Who Am I?</h1>
        <div className="sub">
          {loadError
            ? "Could not work out which careers we can field"
            : `${players.length} ready of ${CAREERS.length} careers on file`}
        </div>
        <Nav current="/who-am-i" />
      </header>

      {loadError && <div className="banner">{loadError}</div>}

      {!loadError && (
        <p className="section-note">
          A career is ready when we hold a photographed shirt from {SHIRTS} of its clubs,
          from a season he was actually there. A 2019 Ajax shirt is not a 1994 Ajax
          player&rsquo;s shirt. The list fills itself as the catalogue grows. Most
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
        <PlayerPicker key={player.key} player={player} />
      ))}
    </div>
  );
}
