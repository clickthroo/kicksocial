"use client";

/**
 * The same thing, for a failure in the root layout itself.
 *
 * It replaces the whole document, so it has to bring its own `html` and `body`
 * and cannot rely on anything the layout sets up. Styles are inline for the
 * same reason: the stylesheet is loaded by the layout that just failed.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="en-GB">
      <body
        style={{
          margin: 0,
          padding: "48px 20px",
          background: "#0b0d10",
          color: "#e8ebef",
          fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif",
          lineHeight: 1.5,
        }}
      >
        <div style={{ maxWidth: 560, margin: "0 auto" }}>
          <h1 style={{ fontSize: 24, margin: "0 0 12px" }}>That did not go through</h1>
          <p style={{ margin: "0 0 12px", color: "#9aa4b1" }}>
            Nothing was saved. If the tool was deployed while this page was open, the
            first attempt is refused and the next one works.
          </p>
          {error.digest && (
            <p style={{ margin: "0 0 20px", color: "#9aa4b1", fontSize: 14 }}>
              Reference: <strong>{error.digest}</strong>
            </p>
          )}
          <button
            type="button"
            onClick={() => reset()}
            style={{
              font: "inherit",
              fontWeight: 600,
              color: "#06210f",
              background: "#3ddc84",
              border: 0,
              borderRadius: 10,
              padding: "12px 18px",
              minHeight: 44,
            }}
          >
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
