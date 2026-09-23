/** Deterministic test fixture: 12 orders across 3 regions.
 * Golden numbers (used by TS and Python tests alike):
 *   sum(revenue)            = 4649.5
 *   avg(revenue)            = 387.4583333333333
 *   sum(revenue) by region  = east 2130.5, west 1519, north 1000
 *   count by region         = east 5, west 4, north 3
 */
export const ORDERS: Array<Record<string, unknown>> = [
  { region: "east", product: "widget", revenue: 100.5, units: 10, order_date: "2026-01-05" },
  { region: "east", product: "widget", revenue: 430, units: 40, order_date: "2026-01-12" },
  { region: "east", product: "gadget", revenue: 800, units: 16, order_date: "2026-02-02" },
  { region: "east", product: "gadget", revenue: 300, units: 6, order_date: "2026-02-19" },
  { region: "east", product: "sprocket", revenue: 500, units: 25, order_date: "2026-03-01" },
  { region: "west", product: "widget", revenue: 250, units: 25, order_date: "2026-01-08" },
  { region: "west", product: "gadget", revenue: 619, units: 12, order_date: "2026-02-11" },
  { region: "west", product: "sprocket", revenue: 400, units: 20, order_date: "2026-02-27" },
  { region: "west", product: "widget", revenue: 250, units: 24, order_date: "2026-03-15" },
  { region: "north", product: "gadget", revenue: 350, units: 7, order_date: "2026-01-21" },
  { region: "north", product: "widget", revenue: 450, units: 45, order_date: "2026-02-09" },
  { region: "north", product: "sprocket", revenue: 200, units: 10, order_date: "2026-03-22" },
];

export const GOLDEN = {
  sumRevenue: 4649.5,
  avgRevenue: 387.4583333333333,
  byRegionSum: [
    { region: "east", revenue: 2130.5, count: 5 },
    { region: "west", revenue: 1519, count: 4 },
    { region: "north", revenue: 1000, count: 3 },
  ],
} as const;
