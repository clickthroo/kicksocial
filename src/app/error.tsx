"use client";

/**
 * What a page shows when a server render throws.
 *
 * WHY IT EXISTS. Without this file Next draws its own: "Application error: a
 * server-side exception has occurred (see the server logs for more
 * information)" over a white page, with a digest and nothing to do about it.
 * That is what an admin saw when a password change failed, and it tells the
 * person at the keyboard neither what happened nor the one thing that usually
 * fixes it.
 *
 * THE ONE THING THAT USUALLY FIXES IT IS RELOADING, and the reason is worth
 * writing down. This app deploys on every push to its branch. A page you
 * opened a minute ago belongs to the build that served it, and a form you then
 * submit carries that build's identity: if a new deployment went live in
 * between, the request arrives somewhere that has never heard of it and Next
 * refuses it before any of this app's own code runs. Nothing was saved,
 * nothing was half-saved, and the next load is on the new build and works.
 * That is exactly what a reload does, so the button says so rather than making
 * somebody guess.
 *
 * The digest is shown because it is the only handle on the server log. Server
 * error messages are deliberately redacted in production, so there is nothing
 * else here to print that would be true.
 */
export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="wrap">
      <header className="top">
        <h1>That did not go through</h1>
        <div className="sub">Something failed on the server before it finished</div>
      </header>

      <section className="card settings">
        <div className="card-head">
          <h2>Try it again</h2>
          <p className="desc">
            Nothing was saved. If the tool was deployed while this page was open, which
            happens whenever a change is pushed, the first attempt is refused and the
            next one goes through on the new version.
          </p>
        </div>

        <div className="row">
          <p className="hint">
            If it keeps happening, the reference below is what matches this to a line in
            the server log.
          </p>
          {error.digest && (
            <p className="hint">
              Reference: <strong>{error.digest}</strong>
            </p>
          )}
        </div>

        <div className="actions">
          <button className="btn approve" type="button" onClick={() => reset()}>
            Try again
          </button>
          <button
            className="btn"
            type="button"
            onClick={() => {
              // A full load rather than a re-render: the point is to fetch the
              // current build, which `reset()` alone does not do.
              window.location.reload();
            }}
          >
            Reload the page
          </button>
        </div>
      </section>
    </div>
  );
}
