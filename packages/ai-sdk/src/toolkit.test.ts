import { describe, expect, it } from "vitest";

import { createSQAI, SQAIToolkit } from "./toolkit.js";
import { computationSpecSchema, listSourcesInputSchema, querySpecSchema } from "./schemas.js";
import type { SqaiTool } from "./tools.js";

/** Execute a tool the way the AI SDK would, with a typed (non-streaming) result. */
async function run<INPUT, OUTPUT>(tool: SqaiTool<INPUT, OUTPUT>, input: INPUT): Promise<OUTPUT> {
  return (await tool.execute(input, { toolCallId: "test", messages: [] } as never)) as OUTPUT;
}

const ORDERS: Array<Record<string, unknown>> = [
  { region: "east", revenue: 100.5, units: 10 },
  { region: "west", revenue: 619, units: 12 },
  { region: "east", revenue: 800, units: 16 },
];

describe("createSQAI toolkit", () => {
  it("connects declared sources lazily — on the first tool call, not at creation", async () => {
    const toolkit = createSQAI({ mode: "local", sources: [{ data: ORDERS, name: "orders" }] });
    expect(toolkit).toBeInstanceOf(SQAIToolkit);

    // Nothing connects at creation time (not even asynchronously).
    await new Promise(resolve => setTimeout(resolve, 20));
    expect(toolkit.client.listSources()).toHaveLength(0);

    const tools = toolkit.tools();
    const output = await run(tools.listSources, {});
    expect("sources" in output && output.sources).toHaveLength(1);
    expect(toolkit.client.listSources().map(source => source.name)).toEqual(["orders"]);
  });

  it("ready resolves to the connected sources and is shared across calls", async () => {
    const toolkit = createSQAI({ mode: "local", sources: [{ data: ORDERS, name: "orders" }] });
    const first = toolkit.ready;
    const second = toolkit.ready;
    expect(first).toBe(second); // one shared connection attempt
    const sources = await first;
    expect(sources.map(source => source.name)).toEqual(["orders"]);
    expect(sources[0]?.row_count).toBe(3);
  });

  it("accepts plain record arrays as sources (auto-named upstream)", async () => {
    const toolkit = createSQAI({ mode: "local", sources: [ORDERS] });
    const sources = await toolkit.ready;
    expect(sources).toHaveLength(1);
    expect(sources[0]?.fields).toEqual(["region", "revenue", "units"]);
  });

  it("connect() registers additional sources through the client", async () => {
    const toolkit = createSQAI({ mode: "local" });
    const source = await toolkit.connect(ORDERS, { name: "orders" });
    expect(source.name).toBe("orders");
    expect(toolkit.client.listSources()).toHaveLength(1);
  });

  it("tools({ source }) pins queries to that source", async () => {
    const toolkit = createSQAI({ mode: "local", sources: [{ data: ORDERS, name: "orders" }] });
    const tools = toolkit.tools({ source: "orders" });
    const output = await run(
      tools.queryData,
      { version: "1", kind: "query", spec: { metric: "revenue", aggregation: "sum" } }, // no source in spec
    );
    expect(output.status).toBe("ok");
    if (output.status !== "ok" || output.kind !== "query") return;
    expect(output.source_name).toBe("orders");
    expect(output.data.rows).toEqual([[1519.5]]);
  });

  it("spec.source wins over the pinned source", async () => {
    const toolkit = createSQAI({
      mode: "local",
      sources: [
        { data: ORDERS, name: "orders" },
        { data: [{ team: "a", headcount: 5 }], name: "teams" },
      ],
    });
    const tools = toolkit.tools({ source: "teams" });
    const output = await run(tools.queryData, 
      {
        version: "1",
        kind: "query",
        spec: { metric: "revenue", aggregation: "sum", source: "orders" },
      },
    );
    expect(output.status).toBe("ok");
    if (output.status !== "ok" || output.kind !== "query") return;
    expect(output.source_name).toBe("orders");
  });
});

describe("policy is never model-reachable", () => {
  it("input schemas expose no policy keys", () => {
    expect(Object.keys(querySpecSchema.shape).sort()).toEqual(
      ["aggregation", "filter", "group_by", "limit", "metric", "order", "source"].sort(),
    );
    expect(Object.keys(computationSpecSchema.shape).sort()).toEqual(
      ["args", "bindings", "function", "kwargs", "module", "seed"].sort(),
    );
    expect(Object.keys(listSourcesInputSchema.shape).sort()).toEqual(
      ["capabilitySearch", "module"].sort(),
    );
    const forbidden = ["policy", "allowedSources", "allowedFields", "allowedFunctions", "apiKey"];
    for (const keys of [
      Object.keys(querySpecSchema.shape),
      Object.keys(computationSpecSchema.shape),
      Object.keys(listSourcesInputSchema.shape),
    ]) {
      for (const key of forbidden) {
        expect(keys).not.toContain(key);
      }
    }
  });

  it("policy configured in code is enforced under the tools", async () => {
    const toolkit = createSQAI({
      mode: "local",
      policy: { allowedFields: { orders: ["region", "units"] } },
      sources: [{ data: ORDERS, name: "orders" }],
    });
    const tools = toolkit.tools();
    const output = await run(tools.queryData, 
      { version: "1", kind: "query", spec: { metric: "revenue", source: "orders" } },
    );
    expect(output).toMatchObject({ status: "error", code: "policy_denied_field" });
  });
});
