import Link from "next/link";
import { engine } from "@/lib/engine/client.ts";
import { listSellers, type SellerOption } from "@/lib/kickio/sellers.ts";
import { RecipeEditor, type RecipeRow } from "./RecipeEditor.tsx";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  let recipes: RecipeRow[] = [];
  let sellers: SellerOption[] = [];
  let loadError: string | null = null;

  try {
    const { data, error } = await engine()
      .from("recipes")
      .select("key,name,description,enabled,cadence,selection,prompt_template")
      .order("key");
    if (error) throw new Error(error.message);
    recipes = (data ?? []) as RecipeRow[];
    sellers = await listSellers();
  } catch (err) {
    loadError = (err as Error).message;
  }

  return (
    <div className="wrap">
      <header className="top">
        <nav className="top-nav">
          <Link className="top-link" href="/">
            Queue
          </Link>
          <Link className="top-link" href="/runs">
            Runs
          </Link>
        </nav>
        <h1>Settings</h1>
        <div className="sub">Changes take effect on the next run — no redeploy needed.</div>
      </header>

      {loadError && <div className="banner">{loadError}</div>}

      {recipes.map((recipe) => (
        <RecipeEditor key={recipe.key} recipe={recipe} sellers={sellers} />
      ))}
    </div>
  );
}
