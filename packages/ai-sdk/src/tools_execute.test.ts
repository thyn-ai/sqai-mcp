/** Tool execution tests.
 *
 * The query plane runs REAL: the linked algenta-sdk plans and executes
 * in-process against locally connected fixtures. Computation dispatch is
 * mocked (no runtime daemon in CI) — contract validation still runs real. */

import { describe, expect, it, vi } from "vitest";
import type { ComputeResult } from "@thyn-ai/sqai";

import { createSQAI } from "./toolkit.js";
import { queryDataOutputSchema, explainQueryOutputSchema, listSourcesOutputSchema } from "./schemas.js";
import type { SqaiTool } from "./tools.js";

/** Execute a tool the way the AI SDK would, with a typed (non-streaming) result. */
async function run<INPUT, OUTPUT>(tool: SqaiTool<INPUT, OUTPUT>, input: INPUT): Promise<OUTPUT> {
  return (await tool.execute(input, { toolCallId: "test", messages: [] } as never)) as OUTPUT;
}

/** Deterministic fixture: 12 orders across 3 regions (mirrors @thyn-ai/sqai's
 * internal fixture — fixtures are not exported from the package). */
const ORDERS: Array<Record<string, unknown>> = [
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

const GOLDEN_BY_REGION = [
  ["east", 2130.5, 5],
  ["west", 1519, 4],
  ["north", 1000, 3],
];

const AMBIGUOUS_SALES = [
  { region: "east", revenue_gross: 100, revenue_net: 80 },
  { region: "west", revenue_gross: 200, revenue_net: 150 },
  { region: "east", revenue_gross: 300, revenue_net: 210 },
];

function ordersToolkit() {
  return createSQAI({ mode: "local", sources: [{ data: ORDERS, name: "orders" }] });
}

describe("queryData — query kind (real query plane)", () => {
  it("returns golden grouped numbers, resolution passthrough, and a retrievable result_id", async () => {
    const toolkit = ordersToolkit();
    const tools = toolkit.tools();
    const output = await run(tools.queryData, 
      {
        version: "1",
        kind: "query",
        spec: { metric: "revenue", aggregation: "sum", group_by: "region", source: "orders" },
      },
    );
    expect(queryDataOutputSchema.safeParse(output).success).toBe(true);
    expect(output.status).toBe("ok");
    if (output.status !== "ok" || output.kind !== "query") return;

    expect(output.data.columns).toEqual(["region", "revenue", "count"]);
    expect(output.data.rows).toEqual(GOLDEN_BY_REGION);
    expect(output.total_rows).toBe(3);
    expect(output.returned_rows).toBe(3);
    expect(output.truncated).toBe(false);

    expect(output.plan_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(output.plan_hash).toBe("f16237e16a9fc79ceda850a8054587d536f91013423469216714742f132d31b3");
    expect(output.schema_revision).toMatch(/^[0-9a-f]{64}$/);
    expect(output.source_name).toBe("orders");
    expect(output.intent_signature).toMatch(/^[0-9a-f]{64}$/);
    expect(output.deterministic_scope).toBe("local_registered_source");
    expect(output.decision_path).toBe("exact_spec");
    expect(output.validated).toBe(true);
    expect(typeof output.request_id).toBe("string");
    expect(output.explanation.length).toBeGreaterThan(0);

    // Full (untruncated) result is stored and retrievable.
    expect(output.result_id).toBeDefined();
    const record = toolkit.client.getResult(output.result_id as string);
    expect(record.value).toEqual([
      { region: "east", revenue: 2130.5, count: 5 },
      { region: "west", revenue: 1519, count: 4 },
      { region: "north", revenue: 1000, count: 3 },
    ]);
  });

  it("matches the public AI SDK CSV docs hash", async () => {
    const csvPath = new URL("../../../examples/ai-sdk-basic/data/sales.csv", import.meta.url)
      .pathname;
    const toolkit = createSQAI({
      mode: "local",
      sources: [{ data: csvPath, name: "sales" }],
    });
    const output = await run(
      toolkit.tools().queryData,
      {
        version: "1",
        kind: "query",
        spec: {
          metric: "revenue",
          aggregation: "sum",
          group_by: "region",
          order: "desc",
          source: "sales",
        },
      },
    );
    expect(output.status).toBe("ok");
    if (output.status !== "ok" || output.kind !== "query") return;
    expect(output.data.rows).toEqual(GOLDEN_BY_REGION);
    expect(output.plan_hash).toBe("578bc850cde68b5628de6c382718243ab6c0109fae5589f4ee7c54af7daca4aa");
  });

  it("returns scalar results with full float precision", async () => {
    const tools = ordersToolkit().tools();
    const output = await run(tools.queryData, 
      { version: "1", kind: "query", spec: { metric: "revenue", aggregation: "avg", source: "orders" } },
    );
    expect(output.status).toBe("ok");
    if (output.status !== "ok" || output.kind !== "query") return;
    expect(output.data.columns).toEqual(["value"]);
    expect(output.data.rows).toEqual([[387.4583333333333]]);
  });

  it("declares truncation when the model budget is smaller than the result", async () => {
    const toolkit = ordersToolkit();
    const tools = toolkit.tools({ maxRowsToModel: 2 });
    const output = await run(tools.queryData, 
      {
        version: "1",
        kind: "query",
        spec: { metric: "revenue", aggregation: "sum", group_by: "region", source: "orders" },
      },
    );
    expect(output.status).toBe("ok");
    if (output.status !== "ok" || output.kind !== "query") return;
    expect(output.total_rows).toBe(3);
    expect(output.returned_rows).toBe(2);
    expect(output.truncated).toBe(true);
    // The STORED result is still complete.
    const record = toolkit.client.getResult(output.result_id as string);
    expect((record.value as unknown[]).length).toBe(3);
  });

  it("asks for clarification when a metric is ambiguous across two numeric fields", async () => {
    const toolkit = createSQAI({ mode: "local", sources: [{ data: AMBIGUOUS_SALES, name: "sales" }] });
    const tools = toolkit.tools();
    const output = await run(tools.queryData, 
      { version: "1", kind: "query", spec: { metric: "revenue", source: "sales" } },
    );
    expect(queryDataOutputSchema.safeParse(output).success).toBe(true);
    expect(output.status).toBe("needs_clarification");
    if (output.status !== "needs_clarification") return;
    expect(output.question).toContain("Did you mean");
    expect(output.question).toContain("sales.revenue_gross");
    expect(output.question).toContain("sales.revenue_net");
    expect(output.candidates.length).toBe(2);
    expect(output.explanation.length).toBeGreaterThan(0);
  });

  it("rejects nonsense metrics with the upstream rejection_reason", async () => {
    const tools = ordersToolkit().tools();
    const output = await run(tools.queryData, 
      { version: "1", kind: "query", spec: { metric: "flurbium_quotient", source: "orders" } },
    );
    expect(queryDataOutputSchema.safeParse(output).success).toBe(true);
    expect(output.status).toBe("rejected");
    if (output.status !== "rejected") return;
    expect(output.rejection_reason).toBe("schema_unresolved");
    expect(output.explanation.length).toBeGreaterThan(0);
  });
});

describe("queryData — computation kind (dispatch mocked)", () => {
  function fakeComputeResult(value: ComputeResult["value"]): ComputeResult {
    return {
      status: "ok",
      value,
      value_type: "float64[]",
      module: "stats",
      function: "fast_sort",
      invocation_hash: "1".repeat(64),
      computation_hash: "2".repeat(64),
      contract_hash: "sha256:test",
      determinism: {
        runtime_bundle_version: "unmanaged",
        runtime_bundle_sha256: "unmanaged",
        platform: "darwin-arm64",
        architecture: "arm64",
        kernel_build: "mojo",
        precision_mode: "float64",
        thread_count: 1,
        input_hash: "3".repeat(64),
      },
      provenance: {
        bindings: [
          {
            source_name: "orders",
            fields: ["revenue"],
            schema_revision: "4".repeat(64),
            row_count: 12,
            input_hash: "5".repeat(64),
          },
        ],
      },
      latency_ms: 1.5,
      request_id: "sqai_test",
    };
  }

  it("passes the full determinism envelope through and stores the full value", async () => {
    const toolkit = ordersToolkit();
    const fullValue = Array.from({ length: 40 }, (_, index) => index * 1.5);
    const computeSpy = vi
      .spyOn(toolkit.client, "compute")
      .mockResolvedValue(fakeComputeResult(fullValue));
    const tools = toolkit.tools({ maxElementsToModel: 10 });
    const output = await run(tools.queryData, 
      {
        version: "1",
        kind: "computation",
        spec: {
          module: "stats",
          function: "fast_sort",
          args: [],
          bindings: [{ parameter: "v", source: "orders", field: "revenue" }],
        },
      },
    );
    expect(queryDataOutputSchema.safeParse(output).success).toBe(true);
    expect(output.status).toBe("ok");
    if (output.status !== "ok" || output.kind !== "computation") return;

    expect(computeSpy).toHaveBeenCalledOnce();
    expect(output.value).toBeNull();
    expect(output.preview).toEqual(fullValue.slice(0, 10));
    expect(output.element_count).toBe(40);
    expect(output.truncated).toBe(true);
    expect(output.value_type).toBe("float64[]");
    expect(output.invocation_hash).toBe("1".repeat(64));
    expect(output.computation_hash).toBe("2".repeat(64));
    expect(output.contract_hash).toBe("sha256:test");
    expect(output.determinism).toEqual({
      runtime_bundle_version: "unmanaged",
      runtime_bundle_sha256: "unmanaged",
      platform: "darwin-arm64",
      architecture: "arm64",
      kernel_build: "mojo",
      precision_mode: "float64",
      thread_count: 1,
      input_hash: "3".repeat(64),
    });
    expect(output.provenance?.bindings[0]?.source_name).toBe("orders");
    expect(output.latency_ms).toBe(1.5);
    expect(output.request_id).toBe("sqai_test");

    // Full value retrievable by result_id.
    const record = toolkit.client.getResult(output.result_id as string);
    expect(record.value).toEqual(fullValue);
  });

  it("passes scalar computation values straight through", async () => {
    const toolkit = ordersToolkit();
    vi.spyOn(toolkit.client, "compute").mockResolvedValue({
      ...fakeComputeResult(2),
      value_type: "float64",
    });
    const tools = toolkit.tools();
    const output = await run(tools.queryData, 
      { version: "1", kind: "computation", spec: { module: "stats", function: "median", args: [[1, 2, 3], 3] } },
    );
    expect(output.status).toBe("ok");
    if (output.status !== "ok" || output.kind !== "computation") return;
    expect(output.value).toBe(2);
    expect(output.preview).toBeUndefined();
    expect(output.truncated).toBe(false);
  });

  it("normalizes unknown capabilities to a structured error with nearest_matches — never throws", async () => {
    const tools = ordersToolkit().tools();
    const output = await run(tools.queryData, 
      { version: "1", kind: "computation", spec: { module: "nope", function: "nada", args: [] } },
    );
    expect(queryDataOutputSchema.safeParse(output).success).toBe(true);
    expect(output.status).toBe("error");
    if (output.status !== "error") return;
    expect(output.code).toBe("unsupported_operation");
    expect(output.retryable).toBe(false);
    expect(Array.isArray(output.nearest_matches)).toBe(true);
    expect((output.nearest_matches as string[]).length).toBeGreaterThan(0);
  });
});

describe("listSources", () => {
  it("describes sources with per-field ops derived from typed_fields", async () => {
    const tools = ordersToolkit().tools();
    const output = await run(tools.listSources, {});
    expect(listSourcesOutputSchema.safeParse(output).success).toBe(true);
    if (!("sources" in output)) return;
    expect(output.sources).toHaveLength(1);
    const orders = output.sources[0];
    expect(orders?.name).toBe("orders");
    expect(orders?.row_count).toBe(12);
    const byName = new Map(orders?.fields.map(field => [field.name, field]));
    expect(byName.get("revenue")?.type).toBe("number");
    expect(byName.get("revenue")?.ops).toEqual(
      expect.arrayContaining(["sum", "avg", "count", "min", "max", "gt", "lte"]),
    );
    expect(byName.get("region")?.type).toBe("string");
    expect(byName.get("region")?.ops).toEqual(["eq", "in", "is_null", "is_not_null"]);
    expect(byName.get("region")?.ops).not.toContain("sum");
    expect(byName.get("order_date")?.type).toBe("date");
    expect(byName.get("order_date")?.ops).not.toContain("avg");
  });

  it("aggregates capability search matches into at most 10 modules", async () => {
    const tools = ordersToolkit().tools();
    const output = await run(tools.listSources, { capabilitySearch: "median" });
    expect(listSourcesOutputSchema.safeParse(output).success).toBe(true);
    if (!("modules" in output)) return;
    expect(output.modules.length).toBeGreaterThan(0);
    expect(output.modules.length).toBeLessThanOrEqual(10);
    for (const module of output.modules) {
      expect(module.deterministic).toBe(true);
      expect(module.function_count).toBeGreaterThan(0);
      expect(module.sample_functions.length).toBeLessThanOrEqual(5);
      expect(module.sample_functions.length).toBeGreaterThan(0);
    }
  });

  it("lists a module's functions with exact signatures and seed flags", async () => {
    const tools = ordersToolkit().tools();
    const output = await run(tools.listSources, { module: "stats" });
    expect(listSourcesOutputSchema.safeParse(output).success).toBe(true);
    if (!("functions" in output)) return;
    const median = output.functions.find(entry => entry.name === "stats.median");
    expect(median).toBeDefined();
    expect(median?.signature).toBe("stats.median(v: float64[], n: int) -> float64");
    expect(median?.params).toEqual([
      { name: "v", type: "float64[]", required: true },
      { name: "n", type: "int", required: true },
    ]);
    expect(median?.returns).toBe("float64");
    expect(median?.deterministic).toBe(true);
    expect(median?.seed_required).toBe(false);
  });

  it("returns a structured error for unknown modules", async () => {
    const tools = ordersToolkit().tools();
    const output = await run(tools.listSources, { module: "definitely_not_a_module" });
    expect(output).toMatchObject({ status: "error", code: "unsupported_operation" });
  });
});

describe("explainQuery", () => {
  it("resolves and verifies a query without executing it", async () => {
    const tools = ordersToolkit().tools();
    const output = await run(tools.explainQuery, 
      {
        version: "1",
        kind: "query",
        spec: { metric: "revenue", aggregation: "sum", group_by: "region", source: "orders" },
      },
    );
    expect(explainQueryOutputSchema.safeParse(output).success).toBe(true);
    expect(output.status).toBe("ok");
    if (output.status !== "ok" || output.kind !== "query") return;
    expect(output.resolved_plan["source_name"]).toBe("orders");
    expect(output.resolved_plan["metric_column"]).toBe("revenue");
    expect(output.plan.length).toBeGreaterThan(0);
    expect(output.plan_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(output.confidence).toBe(1);
    expect(output.validated).toBe(true);
  });

  it("surfaces clarifications and rejections like queryData", async () => {
    const ambiguous = createSQAI({
      mode: "local",
      sources: [{ data: AMBIGUOUS_SALES, name: "sales" }],
    }).tools();
    const clarification = await run(ambiguous.explainQuery, 
      { version: "1", kind: "query", spec: { metric: "revenue", source: "sales" } },
    );
    expect(clarification.status).toBe("needs_clarification");

    const rejected = await run(
      ordersToolkit().tools().explainQuery,
      { version: "1", kind: "query", spec: { metric: "flurbium_quotient", source: "orders" } },
    );
    expect(rejected.status).toBe("rejected");
  });

  it("validates a computation without executing it (no dispatch, preview hash)", async () => {
    const toolkit = ordersToolkit();
    const computeSpy = vi.spyOn(toolkit.client, "compute");
    const tools = toolkit.tools();
    const output = await run(tools.explainQuery, 
      { version: "1", kind: "computation", spec: { module: "stats", function: "median", args: [[1, 2, 3], 3] } },
    );
    expect(explainQueryOutputSchema.safeParse(output).success).toBe(true);
    expect(output.status).toBe("ok");
    if (output.status !== "ok" || output.kind !== "computation") return;
    expect(output.matched_signature).toBe("stats.median(v: float64[], n: int) -> float64");
    expect(output.invocation_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(output.seed_required).toBe(false);
    expect(computeSpy).not.toHaveBeenCalled();
  });

  it("reports seed_required for simulation capabilities", async () => {
    const tools = ordersToolkit().tools();
    const output = await run(tools.explainQuery, 
      {
        version: "1",
        kind: "computation",
        spec: { module: "simulate", function: "bootstrap", args: [{ runs: 100 }] },
      },
    );
    expect(output.status).toBe("ok");
    if (output.status !== "ok" || output.kind !== "computation") return;
    expect(output.seed_required).toBe(true);
  });

  it("returns nearest_matches for unknown capabilities", async () => {
    const tools = ordersToolkit().tools();
    const output = await run(tools.explainQuery, 
      { version: "1", kind: "computation", spec: { module: "stats", function: "medain", args: [] } },
    );
    expect(output.status).toBe("error");
    if (output.status !== "error") return;
    expect(output.code).toBe("unsupported_operation");
    expect(output.nearest_matches).toContain("stats.median");
  });
});

describe("failed-ready toolkit", () => {
  it("every tool returns a structured error with the underlying SqaiError code", async () => {
    const toolkit = createSQAI({ mode: "local", sources: [[]] }); // empty source fails upstream
    const tools = toolkit.tools();

    const list = await run(tools.listSources, {});
    const query = await run(tools.queryData, 
      { version: "1", kind: "query", spec: { metric: "revenue" } },
    );
    const explain = await run(tools.explainQuery, 
      { version: "1", kind: "computation", spec: { module: "stats", function: "median", args: [] } },
    );

    for (const output of [list, query, explain]) {
      expect(output).toMatchObject({ status: "error", code: "empty_source" });
    }
    expect(toolkit.connectionError?.code).toBe("empty_source");
  });
});
