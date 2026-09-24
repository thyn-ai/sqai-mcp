import { describe, expect, it } from "vitest";

import {
  sqaiValueSchema,
  clarificationOutputSchema,
  computationBindingSchema,
  computationOkOutputSchema,
  computationSpecSchema,
  errorOutputSchema,
  explainQueryOkComputationOutputSchema,
  explainQueryOkQueryOutputSchema,
  filterConditionSchema,
  functionListOutputSchema,
  getResultInputSchema,
  getResultOutputSchema,
  listSourcesInputSchema,
  moduleListOutputSchema,
  queryDataInputSchema,
  queryOkOutputSchema,
  querySpecSchema,
  rejectedOutputSchema,
  sourceListOutputSchema,
} from "./schemas.js";

describe("filter schemas", () => {
  it("accepts every allowed operator", () => {
    for (const op of ["eq", "in", "gt", "gte", "lt", "lte", "is_null", "is_not_null"]) {
      expect(filterConditionSchema.safeParse({ column: "region", op }).success).toBe(true);
    }
  });

  it("rejects unknown operators", () => {
    expect(filterConditionSchema.safeParse({ column: "region", op: "like" }).success).toBe(false);
    expect(filterConditionSchema.safeParse({ column: "region", op: "neq" }).success).toBe(false);
  });
});

describe("querySpecSchema", () => {
  it("accepts a minimal spec and a full spec", () => {
    expect(querySpecSchema.safeParse({ metric: "revenue" }).success).toBe(true);
    expect(
      querySpecSchema.safeParse({
        metric: "revenue",
        aggregation: "sum",
        group_by: "region",
        filter: { conditions: [{ column: "region", op: "eq", value: "west" }] },
        limit: 10,
        order: "desc",
        source: "orders",
      }).success,
    ).toBe(true);
  });

  it("rejects bad aggregation, non-positive and fractional limits", () => {
    expect(querySpecSchema.safeParse({ metric: "revenue", aggregation: "median" }).success).toBe(false);
    expect(querySpecSchema.safeParse({ metric: "revenue", limit: 0 }).success).toBe(false);
    expect(querySpecSchema.safeParse({ metric: "revenue", limit: -3 }).success).toBe(false);
    expect(querySpecSchema.safeParse({ metric: "revenue", limit: 2.5 }).success).toBe(false);
  });
});

describe("sqaiValueSchema recursion", () => {
  it("accepts nested arrays, records, and tagged high-precision scalars", () => {
    const value = [
      null,
      true,
      1.5,
      "text",
      [1, [2, [3]]],
      { nested: { deep: [1, "a", null] } },
      { type: "bigint", value: "9007199254740993" },
      { type: "decimal", value: "1.000000000000000001" },
    ];
    const parsed = sqaiValueSchema.safeParse(value);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      // Tagged scalars keep their tag (parsed by the tagged branch, not the record branch).
      expect((parsed.data as unknown[])[6]).toEqual({ type: "bigint", value: "9007199254740993" });
    }
  });

  it("rejects non-wire values", () => {
    expect(sqaiValueSchema.safeParse(undefined).success).toBe(false);
    expect(sqaiValueSchema.safeParse(() => 1).success).toBe(false);
    expect(sqaiValueSchema.safeParse([1, undefined]).success).toBe(false);
    expect(sqaiValueSchema.safeParse({ fn: () => 1 }).success).toBe(false);
  });
});

describe("computationBindingSchema union", () => {
  it("accepts single and aligned bindings", () => {
    expect(
      computationBindingSchema.safeParse({ parameter: "v", source: "orders", field: "revenue" })
        .success,
    ).toBe(true);
    expect(
      computationBindingSchema.safeParse({ parameter: 0, source: "orders", field: "revenue" })
        .success,
    ).toBe(true);
    expect(
      computationBindingSchema.safeParse({
        parameters: ["x", "y"],
        source: "orders",
        fields: ["revenue", "units"],
        alignment: "rowwise",
        nullPolicy: "pairwise",
      }).success,
    ).toBe(true);
  });

  it("rejects aligned bindings without alignment, and bad nullPolicy", () => {
    expect(
      computationBindingSchema.safeParse({
        parameters: ["x"],
        source: "orders",
        fields: ["revenue"],
      }).success,
    ).toBe(false);
    expect(
      computationBindingSchema.safeParse({
        parameters: ["x"],
        source: "orders",
        fields: ["revenue"],
        alignment: "columnwise",
      }).success,
    ).toBe(false);
    expect(
      computationBindingSchema.safeParse({
        parameters: ["x"],
        source: "orders",
        fields: ["revenue"],
        alignment: "rowwise",
        nullPolicy: "drop",
      }).success,
    ).toBe(false);
  });
});

describe("computationSpecSchema", () => {
  it("defaults args to [] and accepts seeds", () => {
    const parsed = computationSpecSchema.parse({ module: "stats", function: "median" });
    expect(parsed.args).toEqual([]);
    expect(
      computationSpecSchema.safeParse({ module: "simulate", function: "monte_carlo", seed: 42 })
        .success,
    ).toBe(true);
    expect(
      computationSpecSchema.safeParse({ module: "simulate", function: "monte_carlo", seed: "s1" })
        .success,
    ).toBe(true);
  });

  it("rejects missing module/function", () => {
    expect(computationSpecSchema.safeParse({ function: "median" }).success).toBe(false);
    expect(computationSpecSchema.safeParse({ module: "stats" }).success).toBe(false);
  });
});

describe("queryDataInputSchema discriminated union", () => {
  it("discriminates on kind for both variants", () => {
    expect(
      queryDataInputSchema.safeParse({
        version: "1",
        kind: "query",
        spec: { metric: "revenue", aggregation: "sum" },
      }).success,
    ).toBe(true);
    expect(
      queryDataInputSchema.safeParse({
        version: "1",
        kind: "computation",
        spec: { module: "stats", function: "median", args: [[1, 2, 3], 3] },
      }).success,
    ).toBe(true);
  });

  it("rejects wrong version, wrong kind, and cross-wired specs", () => {
    expect(
      queryDataInputSchema.safeParse({ version: "2", kind: "query", spec: { metric: "m" } }).success,
    ).toBe(false);
    expect(
      queryDataInputSchema.safeParse({ version: "1", kind: "mutation", spec: { metric: "m" } })
        .success,
    ).toBe(false);
    expect(
      queryDataInputSchema.safeParse({
        version: "1",
        kind: "computation",
        spec: { metric: "revenue" },
      }).success,
    ).toBe(false);
  });
});

describe("listSourcesInputSchema", () => {
  it("accepts empty input and each mode", () => {
    expect(listSourcesInputSchema.safeParse({}).success).toBe(true);
    expect(listSourcesInputSchema.safeParse({ capabilitySearch: "median" }).success).toBe(true);
    expect(listSourcesInputSchema.safeParse({ module: "stats" }).success).toBe(true);
  });
});

describe("output schema variants", () => {
  it("validates ok/query", () => {
    const parsed = queryOkOutputSchema.safeParse({
      status: "ok",
      kind: "query",
      data: { columns: ["region", "revenue"], rows: [["east", 2130.5], ["west", null]] },
      total_rows: 3,
      returned_rows: 2,
      truncated: true,
      result_id: "abc",
      plan_hash: "f".repeat(64),
      schema_revision: "a".repeat(64),
      source_name: "orders",
      intent_signature: "b".repeat(64),
      deterministic_scope: "local_registered_source",
      decision_path: "exact_spec",
      validated: true,
      request_id: "req_1",
      explanation: ["Executed deterministic local plan."],
    });
    expect(parsed.success).toBe(true);
  });

  it("validates ok/computation with determinism envelope and provenance", () => {
    const parsed = computationOkOutputSchema.safeParse({
      status: "ok",
      kind: "computation",
      value: null,
      value_type: "float64[]",
      preview: [1, 2, 3],
      element_count: 500,
      truncated: true,
      result_id: "r1",
      invocation_hash: "c".repeat(64),
      computation_hash: "d".repeat(64),
      contract_hash: "sha256:test",
      determinism: {
        runtime_bundle_version: "unmanaged",
        runtime_bundle_sha256: "unmanaged",
        platform: "darwin-arm64",
        architecture: "arm64",
        kernel_build: "mojo",
        precision_mode: "float64",
        thread_count: 1,
        seed: 42,
        input_hash: "e".repeat(64),
      },
      provenance: {
        bindings: [
          {
            source_name: "orders",
            fields: ["revenue"],
            schema_revision: null,
            row_count: 12,
            input_hash: "a".repeat(64),
          },
        ],
      },
      latency_ms: 1.5,
      request_id: "sqai_1",
    });
    expect(parsed.success).toBe(true);
  });

  it("validates needs_clarification with loosely typed candidates", () => {
    const parsed = clarificationOutputSchema.safeParse({
      status: "needs_clarification",
      question: "Did you mean sales.revenue_gross or sales.revenue_net?",
      candidates: [
        {
          source: "sales",
          column: "revenue_gross",
          role: "measure",
          confidence: 0.9,
          notes: ["token overlap"],
          score_components: { schema_similarity: 0.9 },
        },
      ],
      explanation: ["Metric mapping for 'revenue' is not decisive enough for execution."],
    });
    expect(parsed.success).toBe(true);
  });

  it("validates rejected and error", () => {
    expect(
      rejectedOutputSchema.safeParse({
        status: "rejected",
        rejection_reason: "schema_unresolved",
        candidates: [],
        explanation: ["Top metric match scored below the threshold."],
      }).success,
    ).toBe(true);
    expect(
      errorOutputSchema.safeParse({
        status: "error",
        code: "unsupported_operation",
        message: "Unknown capability 'nope.nada'.",
        retryable: false,
        request_id: null,
        nearest_matches: ["stats.median"],
      }).success,
    ).toBe(true);
  });

  it("validates every listSources variant", () => {
    expect(
      sourceListOutputSchema.safeParse({
        sources: [
          {
            name: "orders",
            fields: [{ name: "revenue", type: "number", ops: ["sum", "avg"] }],
            row_count: 12,
            schema_revision: "a".repeat(64),
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      moduleListOutputSchema.safeParse({
        modules: [
          {
            name: "stats",
            category: "statistical",
            deterministic: true,
            function_count: 12,
            sample_functions: ["median"],
          },
        ],
      }).success,
    ).toBe(true);
    expect(
      functionListOutputSchema.safeParse({
        functions: [
          {
            name: "stats.median",
            signature: "stats.median(v: float64[], n: int) -> float64",
            params: [
              { name: "v", type: "float64[]", required: true },
              { name: "n", type: "int", required: true },
            ],
            returns: "float64",
            deterministic: true,
            seed_required: false,
          },
        ],
      }).success,
    ).toBe(true);
  });

  it("validates both explainQuery ok variants", () => {
    expect(
      explainQueryOkQueryOutputSchema.safeParse({
        status: "ok",
        kind: "query",
        resolved_plan: { source_name: "orders", metric_column: "revenue" },
        plan: ["Use source 'orders'."],
        plan_hash: "f".repeat(64),
        confidence: 1,
        validated: true,
      }).success,
    ).toBe(true);
    expect(
      explainQueryOkComputationOutputSchema.safeParse({
        status: "ok",
        kind: "computation",
        matched_signature: "stats.median(v: float64[], n: int) -> float64",
        invocation_hash: "a".repeat(64),
        seed_required: false,
      }).success,
    ).toBe(true);
  });

  it("validates getResult input and both output variants", () => {
    expect(getResultInputSchema.safeParse({ result_id: "abc" }).success).toBe(true);
    expect(getResultInputSchema.safeParse({}).success).toBe(false);
    expect(
      getResultOutputSchema.safeParse({
        status: "ok",
        result_id: "abc",
        source_ids: ["orders"],
        created_at: 1_000,
        expires_at: 901_000,
        byte_size: 128,
        value: [{ region: "east", revenue: 2130.5, count: 5 }],
      }).success,
    ).toBe(true);
    expect(
      getResultOutputSchema.safeParse({
        status: "error",
        code: "result_not_found",
        message: "No such result for this principal.",
        retryable: false,
        request_id: null,
      }).success,
    ).toBe(true);
  });
});
