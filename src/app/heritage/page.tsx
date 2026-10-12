import { Nav } from "../Nav.tsx";
import { ClubPicker } from "./ClubPicker.tsx";
import {
  heritageClubs,
  DEFAULT_HERITAGE_CONFIG,
  type HeritageClub,
} from "@/lib/recipes/club-heritage.ts";

export const dynamic = "force-dynamic";
// Generating copy waits on Claude; the default limit cuts it off mid-write.
export const maxDuration = 300;

export default async function HeritagePage() {
  let clubs: HeritageClub[] = [];
  let loadError: string | null = null;

  try {
    clubs = await heritageClubs();
  } catch (err) {
    loadError = (err as Error).message;
  }

  return (
    <div className="wrap">
      <header className="top">
        <h1>Club Heritage Shirts</h1>
        <div className="sub">
          {loadError
            ? "Could not work out which clubs can field a card"
            : `${clubs.length} ${clubs.length === 1 ? "club" : "clubs"} can field one`}
        </div>
        <Nav current="/heritage" />
      </header>

      {loadError && <div className="banner">{loadError}</div>}

      {!loadError && (
        <p className="section-note">
          A club appears here when {DEFAULT_HERITAGE_CONFIG.featureCount} of its shirts
          each have a photograph, a season the engine can read and a live listing behind
          them. The card shows the earlier end of what it holds and never says so: the
          post calls them part of the club&rsquo;s heritage collection, available now.
          Claiming they are the oldest anything would be a statement about the whole
          catalogue, and it stops being true the day an older shirt is listed.
        </p>
      )}

      {!loadError && clubs.length === 0 && (
        <div className="empty">
          <h2>Nothing ready</h2>
          <p>
            No club currently has {DEFAULT_HERITAGE_CONFIG.featureCount} shirts the card
            can use. More listings with photographs, and clubs appear here on their own.
          </p>
        </div>
      )}

      {!loadError && clubs.length > 0 && <ClubPicker clubs={clubs} />}
    </div>
  );
}
