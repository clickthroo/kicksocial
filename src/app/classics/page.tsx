import { Nav } from "../Nav.tsx";
import { ClassicPicker } from "./ClassicPicker.tsx";
import { classicShirts, MIN_PRICE_CENTS, CLASSIC_BEFORE_YEAR } from "@/lib/recipes/classics.ts";
import { formatPrice } from "@/lib/kickio/pricing.ts";

export const dynamic = "force-dynamic";
// Generating copy waits on Claude; the default limit cuts it off mid-write.
export const maxDuration = 300;

export default async function ClassicsPage() {
  let shirts: Awaited<ReturnType<typeof classicShirts>> = [];
  let loadError: string | null = null;

  try {
    shirts = await classicShirts();
  } catch (err) {
    loadError = (err as Error).message;
  }

  const fresh = shirts.filter((s) => !s.postedRecently).length;

  return (
    <div className="wrap">
      <header className="top">
        <h1>Kickio Classics</h1>
        <div className="sub">
          {loadError
            ? "Could not load the shelf"
            : `${shirts.length} qualifying shirt${shirts.length === 1 ? "" : "s"}` +
              (fresh < shirts.length ? ` · ${fresh} not posted recently` : "")}
        </div>
        <Nav current="/classics" />
      </header>

      {loadError && <div className="banner">{loadError}</div>}

      <p className="section-note">
        Pre-{CLASSIC_BEFORE_YEAR} home, away and third shirts in stock at{" "}
        {formatPrice(MIN_PRICE_CENTS, "GBP")} or more, dearest first. Pick one, give it a
        photograph of its era, and the engine writes the history and the listing summary
        over the top.
      </p>

      {/* The one thing about this post that is not a design choice. Said here,
          at the point of use, rather than only in a comment nobody reads. */}
      <div className="notice">
        <strong>The photograph has to be one Kickio may publish.</strong> Archive match
        photography belongs to Getty, PA, Allsport and the rest, and using it to sell a
        shirt without a licence is infringement however the post is worded. A named player
        beside a price also reads as an endorsement. Use an image Kickio owns or has
        licensed, and put the required credit in the field provided: it goes on the card.
      </div>

      {!loadError && shirts.length === 0 && (
        <div className="empty">
          <h2>Nothing qualifies</h2>
          <p>
            This needs a pre-{CLASSIC_BEFORE_YEAR} match shirt in stock at{" "}
            {formatPrice(MIN_PRICE_CENTS, "GBP")} or more. The list fills as stock changes.
          </p>
        </div>
      )}

      {shirts.map((shirt) => (
        <ClassicPicker key={shirt.productId} shirt={shirt} />
      ))}
    </div>
  );
}
