import Link from "next/link";
import { currentEmail, signOut } from "./login/actions.ts";

/**
 * One nav for every screen. The ad-hoc floated links this replaces worked at
 * two destinations and fell apart at five - each page carried a different
 * subset, so where you could get to depended on where you happened to be.
 */
const DESTINATIONS = [
  { href: "/", label: "Queue" },
  { href: "/publish", label: "Publish" },
  { href: "/sold", label: "Grail Sale" },
  { href: "/drops", label: "Drops" },
  { href: "/price-history", label: "Price History" },
  { href: "/who-am-i", label: "Who Am I?" },
  { href: "/runs", label: "Runs" },
  { href: "/admin", label: "Settings" },
] as const;

export async function Nav({ current }: { current: string }) {
  // Read here rather than threaded through every page: the nav is the only
  // thing that needs it, and every page already renders the nav.
  const email = await currentEmail();

  return (
    <nav className="nav">
      {DESTINATIONS.map((d) => (
        <Link
          key={d.href}
          className="nav-link"
          href={d.href}
          aria-current={d.href === current ? "page" : undefined}
        >
          {d.label}
        </Link>
      ))}
      {email && (
        <form action={signOut} className="nav-out">
          <span className="nav-who" title={email}>
            {email}
          </span>
          <button className="nav-link nav-signout" type="submit">
            Sign out
          </button>
        </form>
      )}
    </nav>
  );
}
