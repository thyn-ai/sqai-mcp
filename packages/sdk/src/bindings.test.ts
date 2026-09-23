/** End-to-end bindings: the model binds source columns to computation
 * parameters; alignment happens UPSTREAM (extractColumns), dispatch is
 * delegated — SQAI computes nothing itself. Dispatch is mocked (no daemon);
 * extraction is the real substrate. */

import { describe, expect, it, vi } from "vitest";
import type { MojoRuntime } from "algenta-sdk";

import { SQAI } from "./sqai.js";
import { ORDERS } from "./fixtures/orders.js";

function mockMojo(): MojoRuntime {
  return {
    execute: vi.fn(async (module: string, functionName: string, args?: unknown) => ({
      module,
      function: functionName,
      result: { r: 0.42, n: 12 },
      latency_ms: 2,
      engine_used: "mojo",
      request_id: "req_b1",
    })),
  } as unknown as MojoRuntime;
}

describe("computation bindings end-to-end", () => {
  it("aligned multi-column binding extracts rowwise upstream and dispatches verbatim", async () => {
    const mojo = mockMojo();
    const client = new SQAI({ mode: "local", computeTarget: { kind: "local", runtime: mojo } });
    await client.connect(ORDERS, { name: "orders" });

    const result = await client.compute({
      module: "stat_tests",
      function: "pearson_r",
      bindings: [
        {
          parameters: ["x", "y"],
          source: "orders",
          fields: ["revenue", "units"],
          alignment: "rowwise",
        },
      ],
    });

    expect(result.status).toBe("ok");
    expect(result.value).toEqual({ r: 0.42, n: 12 });
    // The dispatched vectors are the upstream-aligned columns, verbatim.
    const [module, fn, args] = (mojo.execute as ReturnType<typeof vi.fn>).mock
      .calls[0] as unknown as [string, string, number[][]];
    expect(module).toBe("stat_tests");
    expect(fn).toBe("pearson_r");
    expect(args[0]).toHaveLength(12);
    expect(args[1]).toHaveLength(12);
    expect(args[0]?.[0]).toBe(100.5);
    expect(args[1]?.[0]).toBe(10);
    // Provenance carries the binding lineage.
    expect(result.provenance?.bindings).toHaveLength(2);
    expect(result.provenance?.bindings[0]).toMatchObject({
      source_name: "orders",
      fields: ["revenue"],
      row_count: 12,
    });
    expect(result.invocation_hash).toMatch(/^[0-9a-f]{64}$/);
    expect(result.computation_hash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("single binding with filter extracts the filtered column", async () => {
    const mojo = mockMojo();
    const client = new SQAI({ mode: "local", computeTarget: { kind: "local", runtime: mojo } });
    await client.connect(ORDERS, { name: "orders" });

    await client.compute({
      module: "stats",
      function: "median",
      kwargs: { n: 5 },
      bindings: [
        {
          parameter: "v",
          source: "orders",
          field: "revenue",
          filter: { conditions: [{ column: "region", op: "eq", value: "east" }] },
        },
      ],
    });
    const [, , args] = (mojo.execute as ReturnType<typeof vi.fn>).mock.calls[0] as unknown as [
      string,
      string,
      [number[], number],
    ];
    expect(args[0]).toEqual([100.5, 430, 800, 300, 500]);
    expect(args[1]).toBe(5);
  });

  it("binding a policy-denied field fails before any extraction reaches dispatch", async () => {
    const mojo = mockMojo();
    const client = new SQAI({
      mode: "local",
      computeTarget: { kind: "local", runtime: mojo },
      policy: { allowedFields: { orders: ["region", "units"] } },
    });
    await client.connect(ORDERS, { name: "orders" });
    await expect(
      client.compute({
        module: "stats",
        function: "median",
        kwargs: { n: 1 },
        bindings: [{ parameter: "v", source: "orders", field: "revenue" }],
      }),
    ).rejects.toMatchObject({ code: "policy_denied_field" });
    expect(mojo.execute).not.toHaveBeenCalled();
  });

  it("duplicate parameter via kwargs + binding → duplicate_argument_binding", async () => {
    const mojo = mockMojo();
    const client = new SQAI({ mode: "local", computeTarget: { kind: "local", runtime: mojo } });
    await client.connect(ORDERS, { name: "orders" });
    await expect(
      client.compute({
        module: "stats",
        function: "median",
        kwargs: { v: [1], n: 1 },
        bindings: [{ parameter: "v", source: "orders", field: "revenue" }],
      }),
    ).rejects.toMatchObject({ code: "duplicate_argument_binding" });
  });
});
