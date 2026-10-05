import Link from "next/link";
import { Nav } from "../Nav.tsx";

export const dynamic = "force-dynamic";

/**
 * Every post you can make by hand, grouped by what you need before you start.
 *
 * Grouped that way rather than alphabetically, or by how the engine works
 * inside, because the question somebody actually arrives with is "I have this,
 * what can I do with it". Somebody holding a photograph and somebody holding a
 * link to a listing want different halves of this page, and under the old flat
 * nav both had to open three builders to find out which.
 *
 * The descriptions are the point of the page. "Battle", "Drops" and "Grail
 * Sale" are names for things rather than descriptions of them.
 */
const GROUPS: Array<{
  title: string;
  note: string;
  items: Array<{ href: string; label: string; blurb: string }>;
}> = [
  {
    title: "You have a photograph",
    note: "One you own or have licensed. It carries the post; the shirt's details go over it.",
    items: [
      {
        href: "/classics",
        label: "Kickio Classics",
        blurb:
          "A dear pre-2000 shirt, under a photograph of its era. Pick from the shelf the " +
          "engine builds, and it suggests who to look for.",
      },
      {
        href: "/photoprod",
        label: "PhotoProd",
        blurb:
          "The same card with no shelf in front of it. Paste the link to any shirt on " +
          "Kickio and give it a picture.",
      },
    ],
  },
  {
    title: "You have a Kickio link",
    note: "Paste it and the shirt's details are read off Kickio's own record.",
    items: [
      {
        href: "/drops",
        label: "Kickio Drops",
        blurb: "One listing that is live right now, promoted by hand.",
      },
      {
        href: "/sold",
        label: "Grail Sale",
        blurb: "A shirt that has just sold, and what it went for.",
      },
    ],
  },
  {
    title: "Pick from a list the engine builds",
    note: "It works out what currently qualifies; you choose which one.",
    items: [
      {
        href: "/battle",
        label: "Battle of the Shirts",
        blurb: "Two shirts, one vote, and an argument in the comments.",
      },
      {
        href: "/who-am-i",
        label: "Who Am I?",
        blurb: "Six shirts from one career, and a question. Never names the player.",
      },
      {
        href: "/price-history",
        label: "Price History",
        blurb: "What one shirt has actually sold for, over time, as a chart.",
      },
    ],
  },
];

export default function NewPostPage() {
  return (
    <div className="wrap">
      <header className="top">
        <h1>New post</h1>
        <div className="sub">Seven ways to make one by hand</div>
        <Nav current="/new" />
      </header>

      <p className="section-note">
        The rest write themselves on a schedule and turn up in the queue. These are the
        ones that need a person: a photograph, a link, or a choice.
      </p>

      {GROUPS.map((group) => (
        <section className="group" key={group.title}>
          <h2 className="group-title">{group.title}</h2>
          <p className="group-note">{group.note}</p>
          <div className="group-items">
            {group.items.map((item) => (
              <Link className="builder" key={item.href} href={item.href} prefetch={false}>
                <span className="builder-label">{item.label}</span>
                <span className="builder-blurb">{item.blurb}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
