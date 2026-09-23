/** Unit tests for the SQAI MCP server mapping layer (no stdio).
 *
 * Covers the contracts that make this a faithful MCP projection of the
 * AI-SDK tool surface:
 *   - exactly the three governed tools register, in a fixed order;
 *   - advertised descriptions are the tool objects' descriptions (no fork);
 *   - advertised inputSchemas equal z.toJSONSchema of the exported Zod
 *     schemas from @thyn-ai/sqai-ai-sdk;
 *   - spec annotations on every tool;
 *   - zero-env introspection works (listSources with no sources);
 *   - failures come back as structured results, never as crashes. */

import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createSQAI,
  createSqaiTools,
  explainQueryInputSchema,
  listSourcesInputSchema,
  queryDataInputSchema,
  type SqaiSourceInput,
  type SqaiToolSet,
} from "@thyn-ai/sqai-ai-sdk";

import {
  buildSqaiMcpServer,
  callTool,
  listToolsResult,
  toolRegistry,
} from "./server.js";

const ORDERS: Array<Record<string, unknown>> = [
  { region: "east", revenue: 100.5, units: 10 },
  { region: "west", revenue: 619, units: 12 },
  { region: "east", revenue: 800, units: 16 },
];

function toolsFor(sources: SqaiSourceInput[] = []): SqaiToolSet {
  return createSqaiTools(createSQAI({ mode: "local", sources }));
}

/** The JSON Schema zod v4 produces for an exported tool schema, minus the
 * $schema key, with the MCP-required top-level type filled in — exactly what
 * the server must advertise. */
function expectedJsonSchema(schema: z.ZodType): Record<string, unknown> {
  const { $schema: _dropped, ...jsonSchema } = z.toJSONSchema(schema, { io: "input" });
  return { type: "object", ...jsonSchema };
}

function textOf(result: { content: Array<{ type: string; text?: string }> }): string {
  const block = result.content[0];
  return block && block.type === "text" ? (block.text ?? "") : "";
}

describe("toolRegistry", () => {
  it("registers exactly the three SQAI tools, in fixed order", () => {
    const registry = toolRegistry(toolsFor());
    expect(registry.map(entry => entry.name)).toEqual(["listSources", "queryData", "explainQuery"]);
  });

  it("carries the live tool objects (no copies, no forks)", () => {
    const tools = toolsFor();
    const registry = toolRegistry(tools);
    for (const entry of registry) {
      expect(entry.tool).toBe(tools[entry.name]);
    }
  });
});

describe("listToolsResult", () => {
  const registry = toolRegistry(toolsFor());
  const result = listToolsResult(registry);

  it("advertises the three tools", () => {
    expect(result.tools.map(tool => tool.name)).toEqual([
      "listSources",
      "queryData",
      "explainQuery",
    ]);
  });

  it("reads descriptions straight off the tool objects", () => {
    for (const entry of registry) {
      const advertised = result.tools.find(tool => tool.name === entry.name);
      expect(advertised?.description).toBe(entry.tool.description);
      expect(advertised?.description?.length ?? 0).toBeGreaterThan(0);
    }
  });

  it("advertises inputSchemas identical to z.toJSONSchema of the exported zod schemas", () => {
    const byName = new Map(result.tools.map(tool => [tool.name, tool.inputSchema]));
    expect(byName.get("listSources")).toEqual(expectedJsonSchema(listSourcesInputSchema));
    expect(byName.get("queryData")).toEqual(expectedJsonSchema(queryDataInputSchema));
    expect(byName.get("explainQuery")).toEqual(expectedJsonSchema(explainQueryInputSchema));
  });

  it("gives every advertised schema a top-level type of object (MCP spec)", () => {
    for (const tool of result.tools) {
      expect(tool.inputSchema.type).toBe("object");
    }
  });

  it("annotates every tool read-only / non-destructive / idempotent / closed-world", () => {
    for (const tool of result.tools) {
      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
    }
  });
});

describe("callTool", () => {
  it("answers listSources with zero sources configured (credential-free introspection)", async () => {
    const result = await callTool(toolRegistry(toolsFor()), "listSources", {});
    expect(result.isError).toBeUndefined();
    expect(result.structuredContent).toEqual({ sources: [] });
  });

  it("searches the capability catalog with zero sources (catalog is in-process)", async () => {
    const result = await callTool(toolRegistry(toolsFor()), "listSources", {
      capabilitySearch: "median",
    });
    expect(result.isError).toBeUndefined();
    const output = result.structuredContent as { modules: Array<{ name: string }> };
    expect(Array.isArray(output.modules)).toBe(true);
    expect(output.modules.length).toBeGreaterThan(0);
  });

  it("returns a structured error — not a crash — for queryData without sources", async () => {
    const result = await callTool(toolRegistry(toolsFor()), "queryData", {
      version: "1",
      kind: "query",
      spec: { metric: "revenue" },
    });
    expect(result.isError).toBe(true);
    const output = result.structuredContent as Record<string, unknown>;
    expect(output.status).toBe("error");
    expect(output.code).toBe("source_required");
    expect(typeof output.message).toBe("string");
    expect(output.retryable).toBe(false);
  });

  it("executes a real deterministic query over an inline records source", async () => {
    const result = await callTool(
      toolRegistry(toolsFor([{ data: ORDERS, name: "orders" }])),
      "queryData",
      {
        version: "1",
        kind: "query",
        spec: { metric: "revenue", aggregation: "sum", group_by: "region" },
      },
    );
    expect(result.isError).toBeUndefined();
    const output = result.structuredContent as Record<string, unknown>;
    expect(output.status).toBe("ok");
    expect(output.kind).toBe("query");
    expect(output.data).toEqual({
      columns: ["region", "revenue", "count"],
      rows: [
        ["east", 900.5, 2],
        ["west", 619, 1],
      ],
    });
    expect(typeof output.plan_hash).toBe("string");
    expect(output.source_name).toBe("orders");
  });

  it("dry-runs a query through explainQuery (resolved plan + plan_hash)", async () => {
    const result = await callTool(
      toolRegistry(toolsFor([{ data: ORDERS, name: "orders" }])),
      "explainQuery",
      {
        version: "1",
        kind: "query",
        spec: { metric: "revenue", aggregation: "sum", group_by: "region" },
      },
    );
    expect(result.isError).toBeUndefined();
    const output = result.structuredContent as Record<string, unknown>;
    expect(output.status).toBe("ok");
    expect(output.kind).toBe("query");
    expect(typeof output.plan_hash).toBe("string");
    expect(output.validated).toBe(true);
  });

  it("rejects invalid arguments with a structured invalid_arguments error", async () => {
    const result = await callTool(toolRegistry(toolsFor()), "queryData", { kind: "query" });
    expect(result.isError).toBe(true);
    const output = result.structuredContent as Record<string, unknown>;
    expect(output.status).toBe("error");
    expect(output.code).toBe("invalid_arguments");
  });

  it("rejects an unknown tool with a structured unknown_tool error naming the valid tools", async () => {
    const result = await callTool(toolRegistry(toolsFor()), "dropTable", {});
    expect(result.isError).toBe(true);
    const output = result.structuredContent as Record<string, unknown>;
    expect(output.code).toBe("unknown_tool");
    expect(String(output.message)).toContain("listSources");
  });

  it("renders the JSON payload as the text content block too", async () => {
    const result = await callTool(toolRegistry(toolsFor()), "listSources", {});
    const parsed: unknown = JSON.parse(textOf(result));
    expect(parsed).toEqual({ sources: [] });
  });
});

describe("buildSqaiMcpServer", () => {
  it("constructs a server with zero env (initialize needs no credentials)", () => {
    expect(() => buildSqaiMcpServer({ version: "0.0.0-test" })).not.toThrow();
  });
});
