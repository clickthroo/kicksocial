import { Nav } from "../Nav.tsx";
import { PhotoProdBuilder } from "./PhotoProdBuilder.tsx";

export const dynamic = "force-dynamic";
// Generating copy waits on Claude; the default limit cuts it off mid-write.
export const maxDuration = 300;

export default function PhotoProdPage() {
  return (
    <div className="wrap">
      <header className="top">
        <h1>PhotoProd</h1>
        <div className="sub">A shirt from Kickio, under a photograph you supply</div>
        <Nav current="/photoprod" />
      </header>

      <p className="section-note">
        The Kickio Classics card without the shelf in front of it. Paste the link to any
        shirt, give it a photograph, and the engine reads the club, season, kit and price
        off Kickio&rsquo;s own record and lays them over the picture.
      </p>

      {/* The same notice as Classics, and for the same reason. Dropping the
          pre-2000 shelf dropped an editorial constraint, not a legal one. */}
      <div className="notice">
        <strong>The photograph has to be one Kickio may publish.</strong> Match and archive
        photography belongs to the agency that took it, and using it to sell a shirt
        without a licence is infringement however the post is worded. A named player
        beside a price also reads as an endorsement. Use an image Kickio owns or has
        licensed, and put the required credit in the field provided: it goes on the card.
      </div>

      <PhotoProdBuilder />
    </div>
  );
}
