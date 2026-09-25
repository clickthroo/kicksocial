import { Nav } from "./Nav.tsx";
import Link from "next/link";
import { pendingDrafts } from "@/lib/run-recipe.ts";
import { Queue } from "./Queue.tsx";
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
  const ages = Object.fromEntries(
    drafts.map((d) => [d.id, freshness(d.created_at, d.recipe_key)]),
  );
  const needChecking = Object.values(ages).filter((a) => a.state === "stale").length;

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

      {drafts.length > 0 && <Queue drafts={drafts} ages={ages} />}
    </div>
  );
}
