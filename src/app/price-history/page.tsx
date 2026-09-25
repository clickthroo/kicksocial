import { Nav } from "../Nav.tsx";
import { ShirtPicker } from "./ShirtPicker.tsx";
import { qualifyingShirts, MIN_SALES, type QualifyingShirt } from "@/lib/recipes/price-history.ts";

export const dynamic = "force-dynamic";
// Generating copy waits on Claude; the default limit cuts it off mid-write.
export const maxDuration = 300;

export default async function PriceHistoryPage() {
  let shirts: QualifyingShirt[] = [];
  let loadError: string | null = null;

  try {
    shirts = await qualifyingShirts();
  } catch (err) {
    loadError = (err as Error).message;
  }

  const buyable = shirts.filter((s) => s.stock !== null).length;
  const underMarket = shirts.filter((s) => s.priority === 0).length;

  return (
    <div className="wrap">
      <header className="top">
        <h1>Price History</h1>
        <div className="sub">
          {loadError
            ? "Could not work out which shirts qualify"
            : shirts.length === 0
              ? "No shirt has enough recorded sales yet"
              : `${shirts.length} shirt${shirts.length === 1 ? "" : "s"} ready` +
                (buyable > 0 ? ` · ${buyable} in stock` : "") +
                (underMarket > 0 ? `, ${underMarket} under the market` : "")}
        </div>
        <Nav current="/price-history" />
      </header>

      {loadError && <div className="banner">{loadError}</div>}

      {!loadError && (
        <p className="section-note">
          A shirt earns this post with {MIN_SALES} recorded sales — and, once it has had
          one, {MIN_SALES} the last post did not have. Ordered by what a reader could do
          about it: in stock and under what the market has been paying first, then in
          stock, then whichever record is freshest.
        </p>
      )}

      {!loadError && shirts.length === 0 && (
        <div className="empty">
          <h2>Nothing ready</h2>
          <p>
            This needs {MIN_SALES} recorded sales of the same shirt. The list fills up on
            its own as Kickio records more.
          </p>
        </div>
      )}

      {shirts.map((shirt) => (
        <ShirtPicker key={shirt.productId} shirt={shirt} />
      ))}
    </div>
  );
}
