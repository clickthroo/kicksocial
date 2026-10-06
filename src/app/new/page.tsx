import Link from "next/link";
import { Nav } from "../Nav.tsx";
import { BUILDERS, BUILDER_GROUPS, buildersIn } from "@/lib/recipes/builders.ts";

export const dynamic = "force-dynamic";

export default function NewPostPage() {
  return (
    <div className="wrap">
      <header className="top">
        <h1>New post</h1>
        <div className="sub">{BUILDERS.length} ways to make one by hand</div>
        <Nav current="/new" />
      </header>

      <p className="section-note">
        The rest write themselves on a schedule and turn up in the queue. These are the
        ones that need a person: a photograph, a link, or a choice.
      </p>

      {/*
        Grouped by what you need before you start, rather than alphabetically or
        by how the engine works inside, because the question somebody arrives
        with is "I have this, what can I do with it". The list itself lives in
        `builders.ts` and is shared with /runs, which used to keep its own copy
        and had gone three recipes out of date.
      */}
      {BUILDER_GROUPS.map((group) => (
        <section className="group" key={group.key}>
          <h2 className="group-title">{group.title}</h2>
          <p className="group-note">{group.note}</p>
          <div className="group-items">
            {buildersIn(group.key).map((item) => (
              <Link className="builder" key={item.key} href={item.href} prefetch={false}>
                <span className="builder-label">{item.name}</span>
                <span className="builder-blurb">{item.blurb}</span>
              </Link>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
