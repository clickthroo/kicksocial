import { Nav } from "../Nav.tsx";
import Link from "next/link";
import { SoldForm } from "./SoldForm.tsx";

export const dynamic = "force-dynamic";
// Generating copy waits on Claude; the default limit cuts it off mid-write.
export const maxDuration = 300;

export default function SoldPage() {
  return (
    <div className="wrap">
      <header className="top">
        <h1>Post a sale</h1>
        <div className="sub">One shirt, one post, for each network.</div>
        <Nav current="/sold" />
      </header>

      <SoldForm />
    </div>
  );
}
