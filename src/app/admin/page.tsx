import { Nav } from "../Nav.tsx";
import Link from "next/link";
import { engine } from "@/lib/engine/client.ts";
import { listSellers, type SellerOption } from "@/lib/kickio/sellers.ts";
import { RecipeEditor, type RecipeRow } from "./RecipeEditor.tsx";
import { BrandEditor } from "./BrandEditor.tsx";
import { loadBrand, DEFAULT_BRAND, type Brand } from "@/lib/brand/settings.ts";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  let recipes: RecipeRow[] = [];
  let sellers: SellerOption[] = [];
  let brand: Brand = DEFAULT_BRAND;
  let loadError: string | null = null;

  try {
    const { data, error } = await engine()
      .from("recipes")
      .select("key,name,description,enabled,cadence,selection,prompt_template")
      .order("key");
    if (error) throw new Error(error.message);
    recipes = (data ?? []) as RecipeRow[];
    sellers = await listSellers();
    brand = await loadBrand();
  } catch (err) {
    loadError = (err as Error).message;
  }

  return (
    <div className="wrap">
      <header className="top">
        <h1>Settings</h1>
        <div className="sub">Changes take effect on the next run — no redeploy needed.</div>
        <Nav current="/admin" />
      </header>

      {loadError && <div className="banner">{loadError}</div>}

      <BrandEditor brand={brand} />

      {recipes.map((recipe) => (
        <RecipeEditor key={recipe.key} recipe={recipe} sellers={sellers} />
      ))}
    </div>
  );
}
