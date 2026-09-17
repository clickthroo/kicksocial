import { Nav } from "../Nav.tsx";
import Link from "next/link";
import { approvedDrafts, publishedPlatforms, recentPublishes, platformsOf } from "@/lib/publish.ts";
import { PostRow } from "./PostRow.tsx";
import type { PostDraft } from "@/lib/engine/types.ts";
import type { PublishEntry, LogRow } from "@/lib/publish.ts";

export const dynamic = "force-dynamic";

const LABELS: Record<string, string> = { x: "X", instagram: "Instagram", tiktok: "TikTok" };

function whenLabel(iso: string): string {
  return new Date(iso).toLocaleString("en-GB", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function PublishPage() {
  let drafts: PostDraft[] = [];
  let logged = new Map<string, PublishEntry[]>();
  let log: LogRow[] = [];
  let loadError: string | null = null;

  try {
    drafts = await approvedDrafts();
    logged = await publishedPlatforms(drafts.map((d) => d.id));
    log = await recentPublishes();
  } catch (err) {
    loadError = (err as Error).message;
  }

  const outstanding = drafts.filter((draft) => {
    const platforms = platformsOf(draft);
    const done = new Set((logged.get(draft.id) ?? []).map((e) => e.platform));
    return platforms.some((p) => !done.has(p));
  });

  const sevenDays = Date.now() - 7 * 86_400_000;
  const lastWeek = log.filter((r) => new Date(r.published_at).getTime() > sevenDays).length;

  return (
    <div className="wrap">
      <header className="top">
        <h1>Publish</h1>
        <div className="sub">
          {loadError
            ? "Could not load the publish log"
            : `${outstanding.length} cleared and waiting · ${lastWeek} posted in the last 7 days`}
        </div>
        <Nav current="/publish" />
      </header>

      {loadError && <div className="banner">{loadError}</div>}

      {!loadError && outstanding.length === 0 && log.length === 0 && (
        <div className="empty">
          <h2>Nothing posted yet</h2>
          <p>
            Approve a draft in the queue and it appears here with its assets, ready to post.
          </p>
        </div>
      )}

      {outstanding.length > 0 && (
        <>
          <h2 className="section">Ready to post</h2>
          <p className="section-note">
            Approving clears a post; it does not send it. Nothing leaves this tool on its
            own, so the log is only true if you confirm what you actually posted.
          </p>
          {outstanding.map((draft) => (
            <PostRow
              key={draft.id}
              draft={draft}
              platforms={platformsOf(draft)}
              entries={logged.get(draft.id) ?? []}
            />
          ))}
        </>
      )}

      {log.length > 0 && (
        <>
          <h2 className="section">Posted</h2>
          <section className="card">
            {log.map((row) => (
              <div className="log-row" key={row.id}>
                <div className="log-main">
                  <span className="log-headline">
                    {row.post_drafts?.headline ?? "(draft deleted)"}
                  </span>
                  <span className="log-meta">
                    {whenLabel(row.published_at)} · {row.post_drafts?.recipe_key.replace(/_/g, " ")}
                    {row.method !== "export" && ` · ${row.method}`}
                  </span>
                </div>
                <div className="log-side">
                  <span className="pill created">{LABELS[row.platform] ?? row.platform}</span>
                  {row.external_url && (
                    <a className="link" href={row.external_url} target="_blank" rel="noreferrer">
                      View ↗
                    </a>
                  )}
                </div>
              </div>
            ))}
          </section>
        </>
      )}
    </div>
  );
}
