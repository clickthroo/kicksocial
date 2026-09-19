import { Nav } from "../Nav.tsx";
import { DropForm } from "./DropForm.tsx";

export const dynamic = "force-dynamic";
// Generating copy waits on Claude; the default limit cuts it off mid-write.
export const maxDuration = 300;

export default function DropsPage() {
  return (
    <div className="wrap">
      <header className="top">
        <h1>Kickio Drops</h1>
        <div className="sub">
          Paste a listing link and get a post that sells it, for each network.
        </div>
        <Nav current="/drops" />
      </header>

      <DropForm />
    </div>
  );
}
