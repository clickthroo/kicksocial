import { Nav } from "../Nav.tsx";
import Link from "next/link";
import { engine } from "@/lib/engine/client.ts";
import { listSellers, type SellerOption } from "@/lib/kickio/sellers.ts";
import { archiveTeamOptions, type ArchiveTeamOption } from "@/lib/recipes/archive-options.ts";
import { DEFAULT_CLUB_ARCHIVE_CONFIG } from "@/lib/recipes/club-archive.ts";
import { RecipeEditor, type RecipeRow } from "./RecipeEditor.tsx";
import { BrandEditor } from "./BrandEditor.tsx";
import { loadBrand, DEFAULT_BRAND, type Brand } from "@/lib/brand/settings.ts";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  // Loaded independently, and in parallel. These came from four different
  // places behind one try/catch, which meant a blip fetching sellers from
  // Kickio left the club list silently empty AND made saved branding look
  // reset - one slow external read taking out three unrelated panels, with
  // nothing on screen to say which had failed.
  const [recipeResult, sellerResult, teamResult, brandResult] = await Promise.allSettled([
    engine()
      .from("recipes")
      .select("key,name,description,enabled,cadence,selection,prompt_template")
      .order("key")
      .then(({ data, error }) => {
        if (error) throw new Error(error.message);
        return (data ?? []) as RecipeRow[];
      }),
    listSellers(),
    archiveTeamOptions(
      DEFAULT_CLUB_ARCHIVE_CONFIG.cooldownDays,
      DEFAULT_CLUB_ARCHIVE_CONFIG.minShirts,
    ),
    loadBrand(),
  ]);

  const recipes: RecipeRow[] = recipeResult.status === "fulfilled" ? recipeResult.value : [];
  const sellers: SellerOption[] = sellerResult.status === "fulfilled" ? sellerResult.value : [];
  const teams: ArchiveTeamOption[] = teamResult.status === "fulfilled" ? teamResult.value : [];
  const brand: Brand = brandResult.status === "fulfilled" ? brandResult.value : DEFAULT_BRAND;

  // Name what is missing. An empty club list with no explanation reads as "there
  // are no clubs", which is a different and much more alarming thing.
  const failures = [
    ["Recipes", recipeResult],
    ["Seller list", sellerResult],
    ["Club list", teamResult],
    ["Branding", brandResult],
  ] as const;
  const loadError = failures
    .filter(([, r]) => r.status === "rejected")
    .map(([label, r]) => `${label}: ${(r as PromiseRejectedResult).reason?.message ?? "failed to load"}`)
    .join(" · ") || null;

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
        <RecipeEditor key={recipe.key} recipe={recipe} sellers={sellers} teams={teams} />
      ))}
    </div>
  );
}
