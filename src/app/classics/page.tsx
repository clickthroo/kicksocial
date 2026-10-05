import Link from "next/link";
import { Nav } from "../Nav.tsx";
import { ClassicPicker } from "./ClassicPicker.tsx";
import { classicShirts, MIN_PRICE_CENTS, CLASSIC_BEFORE_YEAR } from "@/lib/recipes/classics.ts";
import { formatPrice } from "@/lib/kickio/pricing.ts";

export const dynamic = "force-dynamic";
// Generating copy waits on Claude; the default limit cuts it off mid-write.
export const maxDuration = 300;

/**
 * Which shirts the list is showing.
 *
 * The shelf runs to a couple of hundred shirts, and the question somebody
 * actually arrives with is one of three: what have we not used, what have we
 * published, or show me everything. A filter in the URL rather than in state,
 * so a view can be linked to and a reload does not lose it.
 */
type Show = "all" | "unused" | "published";

const SHOWS: Array<{ key: Show; label: string }> = [
  { key: "unused", label: "Not used yet" },
  { key: "published", label: "Published" },
  { key: "all", label: "All" },
];

function asShow(value: string | string[] | undefined): Show {
  return value === "unused" || value === "published" ? value : "all";
}

export default async function ClassicsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const show = asShow((await searchParams).show);

  let shirts: Awaited<ReturnType<typeof classicShirts>> = [];
  let loadError: string | null = null;

  try {
    shirts = await classicShirts();
  } catch (err) {
    loadError = (err as Error).message;
  }

  const counts = {
    all: shirts.length,
    unused: shirts.filter((s) => !s.use).length,
    published: shirts.filter((s) => s.use?.published).length,
  };

  const shown = shirts.filter((s) =>
    show === "unused" ? !s.use : show === "published" ? s.use?.published : true,
  );

  const fresh = counts.unused;

  return (
    <div className="wrap">
      <header className="top">
        <h1>Kickio Classics</h1>
        <div className="sub">
          {loadError
            ? "Could not load the shelf"
            : `${shirts.length} qualifying shirt${shirts.length === 1 ? "" : "s"}` +
              (fresh < shirts.length ? ` · ${fresh} never used · ${counts.published} published` : "")}
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

      {!loadError && shirts.length > 0 && (
        <nav className="filters">
          {SHOWS.map(({ key, label }) => (
            <Link
              key={key}
              className={`filter${show === key ? " on" : ""}`}
              href={key === "all" ? "/classics" : `/classics?show=${key}`}
              // The page is force-dynamic and the counts come off the engine's
              // own tables, so there is nothing to prefetch that will still be
              // true by the time it is clicked.
              prefetch={false}
            >
              {label} <span className="count">{counts[key]}</span>
            </Link>
          ))}
        </nav>
      )}

      {!loadError && shirts.length > 0 && shown.length === 0 && (
        <div className="empty">
          <h2>Nothing here yet</h2>
          <p>
            {show === "published"
              ? "No Classics post has been published yet. One shows up here once every platform it carries copy for is confirmed on the Publish page."
              : "Every qualifying shirt has been used at least once."}
          </p>
        </div>
      )}

      {!loadError && shirts.length === 0 && (
        <div className="empty">
          <h2>Nothing qualifies</h2>
          <p>
            This needs a pre-{CLASSIC_BEFORE_YEAR} match shirt in stock at{" "}
            {formatPrice(MIN_PRICE_CENTS, "GBP")} or more. The list fills as stock changes.
          </p>
        </div>
      )}

      {shown.map((shirt) => (
        <ClassicPicker key={shirt.productId} shirt={shirt} />
      ))}
    </div>
  );
}
