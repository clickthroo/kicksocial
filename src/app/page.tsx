import { Nav } from "./Nav.tsx";
import Link from "next/link";
import { pendingDrafts } from "@/lib/run-recipe.ts";
import { DraftCard } from "./DraftCard.tsx";
import { freshness } from "@/lib/engine/freshness.ts";
import type { PostDraft } from "@/lib/engine/types.ts";

// The queue is the whole point of the tool - always show current state.
export const dynamic = "force-dynamic";

export default async function QueuePage() {
  let drafts: PostDraft[] = [];
  let loadError: string | null = null;

  try {
    drafts = await pendingDrafts();
  } catch (err) {
    loadError = (err as Error).message;
  }

  // Worked out once, and reused for each card below, so the header and the
  // cards can never disagree about what is stale.
  const ages = new Map(drafts.map((d) => [d.id, freshness(d.created_at, d.recipe_key)]));
  const needChecking = [...ages.values()].filter((a) => a.state === "stale").length;

  return (
    <div className="wrap">
      <header className="top">
        <h1>Approval queue</h1>
        <div className="sub">
          {loadError
            ? "Could not load drafts"
            : drafts.length === 0
              ? "Nothing waiting"
              : `${drafts.length} post${drafts.length === 1 ? "" : "s"} awaiting review` +
                (needChecking > 0 ? ` · ${needChecking} old enough to need a check` : "")}
        </div>
        <Nav current="/" />
      </header>

      {loadError && <div className="banner">{loadError}</div>}

      {!loadError && drafts.length === 0 && (
        <div className="empty">
          <h2>All clear</h2>
          <p>New drafts appear here as recipes run.</p>
          <p>
            Already approved something? It is waiting in{" "}
            <Link href="/publish">Publish</Link>.
          </p>
        </div>
      )}

      {/* Age is worked out here rather than in the card. The card is a client
          component, so a clock read during render would differ between the
          server's HTML and the browser's first paint - the sort of mismatch
          that makes React replace the markup and shows up as a flicker. */}
      {drafts.map((draft) => (
        <DraftCard
          key={draft.id}
          draft={draft}
          age={ages.get(draft.id)!}
        />
      ))}
    </div>
  );
}
