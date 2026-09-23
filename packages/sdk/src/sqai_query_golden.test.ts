import { describe, expect, it } from "vitest";

import { SQAI } from "./sqai.js";
import { GOLDEN, ORDERS } from "./fixtures/orders.js";

async function connectedClient(): Promise<SQAI> {
  const client = new SQAI({ mode: "local" });
  await client.connect(ORDERS, { name: "orders" });
  return client;
}

describe("query plane goldens", () => {
  it("grouped sum by region returns exact values with counts", async () => {
    const client = await connectedClient();
    const outcome = await client.ask({
      metric: "revenue",
      aggregation: "sum",
      group_by: "region",
      source_name: "orders",
    });
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.data.result).toEqual(GOLDEN.byRegionSum);
    expect(outcome.data.result_type).toBe("table");
  });

  it("scalar avg keeps full float precision (no 4dp rounding)", async () => {
    const client = await connectedClient();
    const outcome = await client.ask({
      metric: "revenue",
      aggregation: "avg",
      source_name: "orders",
    });
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.data.result).toBe(GOLDEN.avgRevenue);
  });

  it("mean alias canonicalizes to avg — not silent sum", async () => {
    const client = await connectedClient();
    const outcome = await client.ask({
      metric: "revenue",
      aggregation: "mean" as never,
      source_name: "orders",
    });
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.data.result).toBe(GOLDEN.avgRevenue);
  });

  it("plan_hash is stable across resolve calls and replays identically", async () => {
    const client = await connectedClient();
    const spec = {
      metric: "revenue",
      aggregation: "sum" as const,
      group_by: "region",
      source_name: "orders",
    };
    const first = await client.resolve(spec);
    const second = await client.resolve(spec);
    expect(first.plan_hash).toBeTruthy();
    expect(first.plan_hash).toBe(second.plan_hash);
    expect(first.plan_hash).toMatch(/^[0-9a-f]{64}$/);

    const run1 = await client.query(first);
    const run2 = await client.query(first);
    expect(run1.result).toEqual(run2.result);
    expect(run1.plan_hash).toBe(run2.plan_hash);
  });

  it("filters apply exactly", async () => {
    const client = await connectedClient();
    const outcome = await client.ask({
      metric: "revenue",
      aggregation: "sum",
      source_name: "orders",
      filter: { conditions: [{ column: "region", op: "eq", value: "west" }] },
    });
    expect(outcome.status).toBe("ok");
    if (outcome.status !== "ok") return;
    expect(outcome.data.result).toBe(1519);
  });
});

describe("policy on the query plane", () => {
  it("denied source is rejected before execution", async () => {
    const client = new SQAI({ mode: "local", policy: { allowedSources: ["allowed_only"] } });
    await expect(client.connect(ORDERS, { name: "orders" })).rejects.toMatchObject({
      code: "policy_denied_source",
    });
  });

  it("denied field is rejected on resolve", async () => {
    const client = new SQAI({
      mode: "local",
      policy: { allowedFields: { orders: ["region", "units"] } },
    });
    await client.connect(ORDERS, { name: "orders" });
    await expect(
      client.ask({ metric: "revenue", source_name: "orders" }),
    ).rejects.toMatchObject({ code: "policy_denied_field" });
  });
});
