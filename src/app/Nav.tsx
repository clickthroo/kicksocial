import Link from "next/link";

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
  { href: "/runs", label: "Runs" },
  { href: "/admin", label: "Settings" },
] as const;

export function Nav({ current }: { current: string }) {
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
    </nav>
  );
}
