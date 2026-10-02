import { Nav } from "../Nav.tsx";
import { BattleBuilder } from "./BattleBuilder.tsx";

export const dynamic = "force-dynamic";
// Generating copy waits on Claude; the default limit cuts it off mid-write.
export const maxDuration = 300;

export default function BattlePage() {
  return (
    <div className="wrap">
      <header className="top">
        <h1>Battle of the Shirts</h1>
        <div className="sub">Two shirts, one question, an argument in the comments</div>
        <Nav current="/battle" />
      </header>

      <p className="section-note">
        Pick the pairing yourself: which two shirts make an argument is a judgement no
        threshold gets right. A clash of eras or a pair of famous ones beats two shirts
        that merely qualify. Home, away and third shirts only, and both sides need a
        photograph, because this post is the two pictures.
      </p>

      <BattleBuilder />
    </div>
  );
}
