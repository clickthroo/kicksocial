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
  who_am_i_card: {
    ...base,
    id: "sample-who-am-i",
    recipe_key: "who_am_i",
    subject_ref: "crespo",
    headline: "Who am I? — Hernán Crespo (6 clubs, 3 countries)",
    generation: { visual_template: "who_am_i_card", style: "paper" },
    // One of the four careers the shelf can actually field today, with its real
    // six clubs - so the preview is the post, not a mock-up of one.
    source_data: {
      answer: "Hernán Crespo",
      clubs_shown: 6,
      countries: 3,
      span: "1993–2010",
      // About one shirt in three carries a player's name, and it is never the
      // answer's. The card has to say so, or a name in a row of blank shirts
      // reads as the answer being handed over. Two named is the common case.
      teammate_note: "Two of these carry a teammate's name — none of them mine",
      teammates: [
        { name: "Zanetti", club: "Inter Milan", season: "2002-03" },
        { name: "Lampard", club: "Chelsea", season: "2003-04" },
      ],
      images: [
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/scraped/cfs/BRAA069V/0.jpg",
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/scraped/cfs/GERH1221VL/0.jpg",
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/scraped/cfs/BRAA06098912/0.jpg",
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/scraped/cfs/GERH1216EXL/0.jpg",
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/ed40e67a-d264-412e-90ee-37a4b3e006b7/" +
          "6e5e6f6ac78efab47279e92f9d52c24b8e1511b2.jpg",
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/scraped/cfs/BRAA069V/0.jpg",
      ],
    },
  },
  price_history_card: {
    ...base,
    id: "sample-price-history",
    recipe_key: "price_history",
    subject_ref: "ed40e67a-d264-412e-90ee-37a4b3e006b7",
    headline: "Messi · 2009/10 Barcelona Away",
    generation: { visual_template: "price_history_card", style: "paper" },
    // Real rows, straight out of Kickio's sales_history: the most recent six
    // of the eight on record, which is what the card draws and also puts the
    // "most recent of 8" line in front of anyone previewing it.
    source_data: {
      product_id: "ed40e67a-d264-412e-90ee-37a4b3e006b7",
      title_lead: "Messi",
      title_main: "2009/10 Barcelona Away",
      subtitle: "Nike · Away shirt",
      recorded_sales: 6,
      total_recorded_sales: 8,
      price_low: "£138.99",
      price_high: "£276.99",
      price_latest: "£138.99",
      caveat: "Very Good at the bottom, Brand New at the top — the spread tracks condition",
      // The case the card is ordered around: one live on Kickio, under every
      // sale behind it. Previewing without this hides the busiest the header
      // block ever gets.
      in_stock: {
        price: "£129.99",
        size: "L",
        condition: "Very Good",
        listings: 2,
        standing: "under-all",
        line: "From £129.99 on Kickio now — under every sale shown",
      },
      condition_read: {
        verdict: "explained",
        summary: "Very Good at the bottom, Brand New at the top — the spread tracks condition",
        cheapest: { price: "£138.99", size: "M", condition: "Very Good" },
        dearest: { price: "£276.99", size: "XXL", condition: "Brand New" },
        like_for_like: { condition: "Very Good", count: 4, low: "£138.99", high: "£184.99" },
      },
      points: [
        { sold_at: "2026-06-21T00:00:00Z", price: "£142.99", price_cents: 14299, size: "M", condition: "Good" },
        { sold_at: "2026-06-26T00:00:00Z", price: "£166.99", price_cents: 16699, size: "XXL", condition: "Very Good" },
        { sold_at: "2026-08-06T00:00:00Z", price: "£184.99", price_cents: 18499, size: "M", condition: "Very Good" },
        { sold_at: "2026-08-07T00:00:00Z", price: "£276.99", price_cents: 27699, size: "XXL", condition: "Brand New" },
        // A real row with no size recorded, so the card is previewed with the
        // gap it will actually have rather than a tidy set that never occurs.
        { sold_at: "2026-08-12T00:00:00Z", price: "£161.99", price_cents: 16199, size: null, condition: "Very Good" },
        { sold_at: "2026-08-21T00:00:00Z", price: "£138.99", price_cents: 13899, size: "M", condition: "Very Good" },
      ],
      images: [
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/ed40e67a-d264-412e-90ee-37a4b3e006b7/" +
          "6e5e6f6ac78efab47279e92f9d52c24b8e1511b2.jpg",
      ],
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
      subject: "Germany football shirts",
      montage_basis: "Germany shirts listed on Kickio now",
      // Real Germany products, so the montage can be judged against real
      // photography rather than flat placeholders.
      images: [
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/scraped/shopify/10339151937883/0.jpg",
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/scraped/shopify/10346057040219/0.jpg",
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/scraped/cfs/GERH06BSC7EL/0.jpg",
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/admin/86ae9199-cf46-4151-8e77-78dea4d0049c/" +
          "2aae3361-33bc-4f53-9fb2-3f3da43afbd2-layflat.png",
      ],
      // Empty on purpose: Kickio has no per-subject price history, so a real
      // draft carries no chart. A sample with an invented rising line would
      // hide exactly the thing that went wrong here.
      series: [],
      series_basis: "No per-subject price history exists in Kickio, so no chart is drawn",
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
      // Sampled from the photo at generation time; only the Sweep style uses it.
      shirt_colour: { hex: "#7a263c", deep: "#240b12" },
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
      // A real week (2026-W39), so the layout is judged against the photography
      // Kickio actually holds - flat product shots on white, of wildly varying
      // crop - rather than against placeholders that would all behave.
      featured: [
        { team: "England", season: "1987-88", shirt_type: "Third", condition: "Very Good", price: "£414.99" },
        { team: "Barcelona", season: "1989-90", shirt_type: "Home", condition: "Very Good", price: "£368.99" },
        { team: "Northern Ireland", season: "1990-91", shirt_type: "Home", condition: "Very Good", price: "£322.99" },
        { team: "Manchester United", season: "1990-91", shirt_type: "Away", condition: "Mint", price: "£280.99" },
        { team: "AC Milan", season: "1988-89", shirt_type: "Home", condition: "Good", price: "£276.99" },
      ],
      // Index-aligned with `featured`. The recipe guarantees this by featuring
      // only sales it has a photo for.
      images: [
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/scraped/shopify/9549694599515/0.jpg",
        "https://www.classicfootballshirts.co.uk/cdn-cgi/image/catalog/product/cache/" +
          "f8158826193ba5faa8b862a9bd1eb9e9/8/2/" +
          "82f40ad0db74933d35460128b9e1c0e95dad974f058054e4f1480a1c24c3e084.jpeg",
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/scraped/cfs/IREH90772433/0.jpg",
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/scraped/cfs/MUNA90287874/0.jpg",
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/scraped/cfs/ACMH8890134/0.jpg",
      ],
    },
  },
  archive_grid: {
    ...base,
    id: "sample-archive",
    recipe_key: "club_archive",
    subject_ref: "club:manchester united",
    headline: "164 Manchester United shirts on Kickio, 1975–2025",
    generation: { visual_template: "archive_grid" },
    source_data: {
      subject: "Manchester United on Kickio",
      team: "Manchester United",
      shirts: 164,
      earliest: 1975,
      latest: 2025,
      span_years: 50,
      kit_types: 7,
      scope_note: "Counts describe Kickio's listings, not the club's full kit history",
      // Real Manchester United products, so the grid is judged against real
      // photography rather than flat placeholders.
      images: [
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/scraped/shopify/9753952289115/0.jpg",
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/scraped/cfs/MUNH82390340/0.jpg",
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/scraped/ebay/387996547563/0.jpg",
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/admin/580df542-f8a9-4cea-a24b-ae8cf87961bd/8760cdce-c8fd-4cf3-92be-998cf4431610-layflat.png",
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/scraped/cfs/MUNH86519652/0.jpg",
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/admin/9318a7ac-36d8-4463-a8f6-ee6611dc4e2e/d286add7-0233-4ad8-bd69-d561f1bdeab2-layflat.png",
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/admin/review-edits/listing/27e88984-be46-4f4c-8e22-fcf97d8f41b8/1784374678130-nohanger-composite.png",
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/scraped/cfs/MUNH88702189/0.jpg",
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/admin/34db047d-52c6-47a9-841d-c21ed74e7b63/c3e72fa4-a48e-4c09-8564-efa8776a9a19.jpeg",
      ],
    },
  },
  collection_grid: {
    ...base,
    id: "sample-collection",
    recipe_key: "featured_collection",
    subject_ref: "collection:kickio-grail-list@39/136",
    headline: "39 of 136 buyable on Kickio Grail List",
    generation: { visual_template: "collection_grid" },
    source_data: {
      subject: "Kickio Grail List",
      collection: "Kickio Grail List",
      collection_slug: "kickio-grail-list",
      slots: 136,
      // The real figures. 39 have an active listing; 26 more have a shirt page
      // on Kickio with nothing to buy on it; 59 slots were never filled; 12
      // point at a pending or archived record. 39 + 26 + 59 + 12 = 136.
      buyable: 39,
      catalogued_not_for_sale: 26,
      missing: 59,
      record_not_active: 12,
      hunting: [
        "Argentina 1986 Home",
        "West Germany 1988-90 Home",
        "Barcelona 1991/92 Away",
        "Napoli 1988/89 Home - Mars",
        "Inter Milan 1997/98 Away",
        "Brazil 1982 Home",
      ],
      // The first nine buyable slots in the curator's order.
      images: [
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/scraped/cfs/HOLH89865515/0.jpg",
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/scraped/cfs/ARSA91970270/0.jpg",
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/scraped/shopify/10460244148571/0.jpg",
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/admin/e00ff051-5382-4f41-8eae-69b729c9e1a4/b8c592d1-ec06-495d-a4ac-0e54b6500283-layflat.png",
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/scraped/cfs/USAA94335323/0.jpg",
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/scraped/shopify/10616568676699/0.jpg",
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/processed/listing/71b8efe4-10db-47e8-b0bc-55574b9dfaee/1784628196004-nobg.png",
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/scraped/cfs/ACMH8890134/0.jpg",
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/scraped/cfs/FRAH98360815/0.jpg",
      ],
    },
  },
  collector_grid: {
    ...base,
    id: "sample-collector",
    recipe_key: "collector_spotlight",
    subject_ref: "collector:11111111-1111-1111-1111-111111111111:spotlight",
    headline: "@dave: 214 shirts, 1983–2024",
    generation: { visual_template: "collector_grid" },
    source_data: {
      subject: "@dave's collection",
      collector: "@dave",
      collector_title: "Terrace Historian",
      shirts: 214,
      earliest: 1983,
      latest: 2024,
      span_years: 41,
      clubs: 31,
      top_club: { team: "Everton", shirts: 38 },
      collector_handle: "@dave",
      collector_flags: "collection_public and featured_consent both true",
      // No value, no price, no location. There is no field here that could
      // carry one, and the scoped role is not granted the columns that hold
      // one either.
      images: [
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/scraped/cfs/HOLH89865515/0.jpg",
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/scraped/cfs/ARSA91970270/0.jpg",
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/scraped/shopify/10460244148571/0.jpg",
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/admin/e00ff051-5382-4f41-8eae-69b729c9e1a4/b8c592d1-ec06-495d-a4ac-0e54b6500283-layflat.png",
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/scraped/cfs/USAA94335323/0.jpg",
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/scraped/shopify/10616568676699/0.jpg",
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/processed/listing/71b8efe4-10db-47e8-b0bc-55574b9dfaee/1784628196004-nobg.png",
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/scraped/cfs/ACMH8890134/0.jpg",
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/scraped/cfs/FRAH98360815/0.jpg",
      ],
    },
  },
  drop_card: {
    ...base,
    id: "sample-drop",
    recipe_key: "kickio_drop",
    subject_ref: "drop:21b7f8c2-6e2c-4203-9d0a-65f93232cf6b",
    headline: "2002-03 Rangers FC Away Shirt — £192.99",
    generation: { visual_template: "drop_card" },
    source_data: {
      title: "2002-03 Rangers FC Away Shirt",
      price: "£192.99",
      team: "Rangers",
      season: "2002-03",
      shirt_type: "Away",
      manufacturer: "Diadora",
      condition: "Very Good",
      size: "L",
      // Drives the "Offers considered" line where a Sale would carry a date.
      accepts_offers: true,
      rarity_signals: ["2000s", "Long sleeve"],
      shirt_colour: { hex: "#1b3a6b", deep: "#08131f" },
      kickio_url: "https://kickio.com/marketplace/2002-03-rangers-fc-away-shirt",
      photo_source: "product",
      images: [
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/scraped/cfs/ENGT90860264/0.jpg",
      ],
    },
  },
  index_chart: {
    ...base,
    id: "sample-index",
    recipe_key: "collection_index",
    subject_ref: "collector:11111111-1111-1111-1111-111111111111:spotlight:index@18.4",
    headline: "@dave's collection: up 18.4% in six months",
    generation: { visual_template: "index_chart" },
    source_data: {
      subject: "@dave's collection",
      collector: "@dave",
      pct_change: 18.4,
      basket: 11,
      excluded_no_sale: 3,
      excluded_too_new: 2,
      from: "2026-03-21",
      to: "2026-09-19",
      window_days: 182,
      // Rebased to 100 at the first point. There is no currency anywhere in
      // this card, and no field that could carry one.
      series: [
        { day: "2026-03-21", index: 100 },
        { day: "2026-04-21", index: 101.6 },
        { day: "2026-05-22", index: 104.9 },
        { day: "2026-06-22", index: 103.8 },
        { day: "2026-07-23", index: 111.2 },
        { day: "2026-08-23", index: 115.7 },
        { day: "2026-09-19", index: 118.4 },
      ],
    },
  },
  value_card: {
    ...base,
    id: "sample-value",
    recipe_key: "value_pick",
    subject_ref: "value:p1|S|very good",
    headline: "1993-94 Manchester United Away Shirt Cantona #7 — £154.31, 38% below",
    generation: { visual_template: "value_card" },
    source_data: {
      title: "1993-94 Manchester United Away Shirt Cantona #7",
      // What a buyer pays, buyer protection included.
      price: "£154.31",
      // The median of matching sales, not this shirt's former price.
      typical_price: "£250.99",
      discount_pct: 38,
      size: "S",
      condition: "Very Good",
      sales_count: 3,
      sales_low: "£237.99",
      sales_high: "£276.99",
      last_sold: "2026-09-03",
      scarcity: "only-on-kickio",
      scarcity_line: "The only one on Kickio.",
      team: "Manchester United",
      season: "1993-94",
      shirt_type: "Away",
      rarity_signals: ["1990s"],
      shirt_colour: { hex: "#1b1b1b", deep: "#070707" },
      kickio_url: "https://kickio.com/marketplace/1993-94-manchester-united-away-shirt",
      images: [
        "https://rlveellvebfzgyobceru.supabase.co/storage/v1/object/public/" +
          "product-images/scraped/cfs/ENGT90860264/0.jpg",
      ],
    },
  },
};
