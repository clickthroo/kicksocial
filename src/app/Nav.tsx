import Link from "next/link";
import { currentEmail, signOut } from "./login/actions.ts";
import { BUILDERS } from "@/lib/recipes/builders.ts";
import { loadProfile, profileLabel } from "@/lib/auth/profile.ts";

/**
 * One nav for every screen.
 *
 * It worked at five destinations and broke at eleven. Seven of those eleven
 * were builders - one per post type - and they went into the same flat
 * horizontally scrolling strip as the queue and the settings, so on a 390px
 * phone roughly half of them were off the right-hand edge with nothing to say
 * they existed. The strip also told you nothing: "Battle", "Drops" and "Grail
 * Sale" are names for things, not descriptions of them, and you had to open
 * one to find out which was which.
 *
 * Three post types were added in a single afternoon, so the list only grows.
 * The builders therefore live behind one destination, /new, which has room to
 * say what each one is and what you need in your hand before you start.
 */
const DESTINATIONS = [
  { href: "/", label: "Queue" },
  { href: "/publish", label: "Publish" },
  { href: "/new", label: "New post" },
  { href: "/runs", label: "Runs" },
  { href: "/admin", label: "Settings" },
] as const;

/**
 * Builders, which highlight "New post" rather than nothing.
 *
 * Read off the shared registry rather than listed again here. This was a third
 * copy of "which paths are builders", and the second copy had already gone
 * three recipes out of date without anybody noticing.
 */
const BUILDER_PATHS = BUILDERS.map((b) => b.href);

export async function Nav({ current }: { current: string }) {
  // Read here rather than threaded through every page: the nav is the only
  // thing that needs it, and every page already renders the nav.
  const email = await currentEmail();
  // The display name where one is set, the email otherwise. Read here so every
  // page gets it without threading it through, exactly as the email already is.
  const profile = email ? await loadProfile(email).catch(() => null) : null;
  const label = profile ? profileLabel(profile) : email;
  const active = BUILDER_PATHS.includes(current) ? "/new" : current;

  return (
    <nav className="nav">
      {DESTINATIONS.map((d) => (
        <Link
          key={d.href}
          className="nav-link"
          href={d.href}
          aria-current={d.href === active ? "page" : undefined}
        >
          {d.label}
        </Link>
      ))}
      {email && (
        <div className="nav-out">
          {/* A link rather than a label, and it carries no nav slot of its own:
              five destinations is what fits across a phone, and the account is
              not a sixth thing you go to, it is the thing you already are. */}
          <Link
            className="nav-who"
            href="/profile"
            title={`${email} - your account`}
            aria-current={current === "/profile" ? "page" : undefined}
            prefetch={false}
          >
            {label}
          </Link>
          <form action={signOut}>
            <button className="nav-link nav-signout" type="submit">
              Sign out
            </button>
          </form>
        </div>
      )}
    </nav>
  );
}
