import type { ServiceSearchResult } from "@/contracts/services";

// Shown when the agent container isn't configured or doesn't answer. Company
// names are fictional on purpose: these quotes are made up, so they must not be
// attached to real businesses.
export const demoCleaningSearch: ServiceSearchResult = {
  kind: "cleaning",
  location: "Mission District, San Francisco",
  deadline: "2026-11-28",
  budget_usd: 1300,
  home: { bedrooms: 1, sqft: 747 },
  source: "sample",
  searched_at: "2026-10-24T20:00:00Z",
  recommended_id: "demo-bayview-bright",
  explanation:
    "Picked Bayview Bright Cleaners: $1,150 and they can come Nov 26, two days before your deadline. Sunset Sparkle is cheaper at $980, but its first opening is Dec 2, after you've moved out.",
  quotes: [
    {
      provider: { id: "demo-sunset-sparkle", name: "Sunset Sparkle Cleaning", rating: 4.6, review_count: 212, neighborhood: "Outer Sunset", website: null, maps_url: null },
      price_usd: 980,
      earliest_date: "2026-12-02",
      includes: ["Move-out deep clean", "Inside oven + fridge"],
      before_deadline: false,
      within_budget: true,
      note: "Cheapest, but can't come until Dec 2, after your Nov 28 deadline.",
      simulated: true,
    },
    {
      provider: { id: "demo-bayview-bright", name: "Bayview Bright Cleaners", rating: 4.8, review_count: 389, neighborhood: "Bayview", website: null, maps_url: null },
      price_usd: 1150,
      earliest_date: "2026-11-26",
      includes: ["Move-out deep clean", "Inside oven + fridge", "Carpet shampoo + receipt"],
      before_deadline: true,
      within_budget: true,
      note: "Cheapest option that makes the deadline, and includes the carpet receipt your lease asks for.",
      simulated: true,
    },
    {
      provider: { id: "demo-mission-fresh", name: "Mission Fresh Co.", rating: 4.9, review_count: 156, neighborhood: "Mission", website: null, maps_url: null },
      price_usd: 1240,
      earliest_date: "2026-11-21",
      includes: ["Move-out deep clean", "Inside oven + fridge", "Carpet shampoo + receipt", "Wall spot-cleaning"],
      before_deadline: true,
      within_budget: true,
      note: "Makes the deadline with a week to spare, $90 more.",
      simulated: true,
    },
    {
      provider: { id: "demo-golden-gate-maids", name: "Golden Gate Maids", rating: 4.7, review_count: 540, neighborhood: "Richmond", website: null, maps_url: null },
      price_usd: 1480,
      earliest_date: "2026-11-19",
      includes: ["Move-out deep clean", "Inside oven + fridge", "Carpet shampoo + receipt", "Window tracks"],
      before_deadline: true,
      within_budget: false,
      note: "Earliest opening, but $180 over your $1,300 budget.",
      simulated: true,
    },
  ],
};
