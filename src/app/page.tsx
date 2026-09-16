import { pendingDrafts } from "@/lib/run-recipe.ts";
import { DraftCard } from "./DraftCard.tsx";
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

  return (
    <div className="wrap">
      <header className="top">
        <h1>Approval queue</h1>
        <div className="sub">
          {loadError
            ? "Could not load drafts"
            : drafts.length === 0
              ? "Nothing waiting"
              : `${drafts.length} post${drafts.length === 1 ? "" : "s"} awaiting review`}
        </div>
      </header>

      {loadError && <div className="banner">{loadError}</div>}

      {!loadError && drafts.length === 0 && (
        <div className="empty">
          <h2>All clear</h2>
          <p>New drafts appear here as recipes run.</p>
        </div>
      )}

      {drafts.map((draft) => (
        <DraftCard key={draft.id} draft={draft} />
      ))}
    </div>
  );
}
