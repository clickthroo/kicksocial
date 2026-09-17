import type { PostDraft } from "../engine/types.ts";

/**
 * Representative drafts for designing templates without waiting for a real run.
 * The values are real rows observed in Kickio on 2026-09-16, so layouts are
 * tested against realistic string lengths rather than convenient short ones.
 */
const base = {
  status: "draft" as const,
  copy: {},
  claims: [],
  image_path: null,
  video_path: null,
  notes: null,
  created_at: "2026-09-16T09:00:00Z",
  reviewed_at: null,
  published_at: null,
};

export const SAMPLE_DRAFTS: Record<string, PostDraft> = {
  grail_card: {
    ...base,
    id: "sample-grail",
    recipe_key: "grail_of_the_day",
    subject_ref: "sample",
    headline: "1986-88 Manchester United Third Shirt",
    generation: { visual_template: "grail_card" },
    source_data: {
      title: "1986-88 Manchester United Third Shirt",
      price: "£945",
      team: "Manchester United",
      season: "1986-87",
      condition: "Very Good",
      rarity_signals: ["1980s", "Match issue", "Mint condition"],
      images: [],
    },
  },
  trend_chart: {
    ...base,
    id: "sample-trend",
    recipe_key: "price_trends",
    subject_ref: "club:germany",
    headline: "Germany up 34.5%",
    generation: { visual_template: "trend_chart" },
    source_data: {
      label: "Germany",
      pct_change: 34.51,
      change_window_days: 90,
      cohort_count: 7,
      total_sales: 723,
      median_fair_price: "£61",
      series: [100, 103, 101, 108, 112, 109, 118, 121, 119, 126, 131, 134.5].map((v, i) => ({
        day: `2026-06-${String(i + 1).padStart(2, "0")}`,
        index_value: v,
      })),
    },
  },
  grail_sale_card: {
    ...base,
    id: "sample-grail-sale",
    recipe_key: "grail_sale",
    subject_ref: "1990-92-england-third-shirt@2026-09-17",
    headline: "Sold: 1990-92 England Third Shirt — £346.99",
    generation: { visual_template: "grail_sale_card" },
    source_data: {
      title: "1990-92 England Third Shirt",
      price: "£346.99",
      sold_at: "2026-09-17",
      team: "England",
      season: "1990-91",
      shirt_type: "Third",
      manufacturer: "Umbro",
      condition: "Very Good",
      size: "L",
      rarity_signals: ["1990s", "Match issue"],
      // A real product photo, so the composition is judged against a real
      // shirt on a real background rather than a flat placeholder.
      images: [
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/scraped/cfs/ENGT90860264/0.jpg",
      ],
    },
  },
  roundup_card: {
    ...base,
    id: "sample-roundup",
    recipe_key: "sold_this_week",
    subject_ref: "2026-W38",
    headline: "Sold this week",
    generation: { visual_template: "roundup_card" },
    source_data: {
      featured: [
        { team: "Manchester United", season: "1990-92", shirt_type: "Away", condition: "Very Good", price: "£420" },
        { team: "Borussia Dortmund", season: "1995-96", shirt_type: "Home", condition: "Mint", price: "£385" },
        { team: "Napoli", season: "1988-89", shirt_type: "Home", condition: "Good", price: "£340" },
        { team: "Ajax", season: "1994-95", shirt_type: "Home", condition: "Very Good", price: "£295" },
        { team: "Parma", season: "1998-99", shirt_type: "Away", condition: "Very Good", price: "£260" },
      ],
    },
  },
};
