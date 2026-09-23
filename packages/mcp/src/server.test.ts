/** Unit tests for the SQAI MCP server mapping layer (no stdio).
 *
 * Covers the contracts that make this a faithful MCP projection of the
 * AI-SDK tool surface:
 *   - exactly the three governed tools register, in a fixed order;
 *   - advertised descriptions are the tool objects' descriptions plus the
 *     uniform-gate disclosure (the only MCP-layer addition);
 *   - advertised inputSchemas equal z.toJSONSchema of the exported Zod
 *     schemas from @thyn-ai/sqai-ai-sdk;
 *   - spec annotations on every tool;
 *   - initialize/tools/list need no credentials;
 *   - the uniform license gate: with no login EVERY tools/call (all three
 *     tools, queryData in both kinds) returns the computation plane's
 *     login_required payload byte-for-byte, and unknown_tool stays
 *     credential-free;
 *   - with a stubbed license key the tools execute normally;
 *   - failures come back as structured results, never as crashes. */

import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  createSQAI,
  createSqaiTools,
  explainQueryInputSchema,
  listSourcesInputSchema,
  queryDataInputSchema,
  type QueryDataInput,
  type SqaiSourceInput,
  type SqaiToolSet,
} from "@thyn-ai/sqai-ai-sdk";

import {
  buildSqaiMcpServer,
  callTool,
  GATE_DISCLOSURE,
  listToolsResult,
  toolRegistry,
  type SqaiToolName,
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

/** The login_required payload exactly as the computation plane serializes it
 * through the MCP text channel (JSON.stringify of the AI-SDK error mapping —
 * status/code/message/retryable/request_id, in this key order). */
const LOGIN_REQUIRED_TEXT = JSON.stringify(
  {
    status: "error",
    code: "login_required",
    message:
      "Local compute requires a free SQAI device login. Run `sqai login` once, " +
      "or set SQAI_API_KEY in this process.",
    retryable: false,
    request_id: null,
  },
  null,
  2,
);

const LICENSE_ENV_KEYS = ["SQAI_API_KEY", "ALGENTA_API_KEY", "DE_API_KEY", "SQAI_HOME"] as const;

async function withEnv<T>(overrides: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const saved: Record<string, string | undefined> = {};
  for (const key of LICENSE_ENV_KEYS) {
    saved[key] = process.env[key];
  }
  for (const [key, value] of Object.entries(overrides)) {
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }
  try {
    return await fn();
  } finally {
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

/** No login: all key env vars scrubbed, and SQAI_HOME pointed at a fresh empty
 * directory so a real `sqai login` cache on the dev machine cannot leak in. */
function withScrubbedLicenseEnv<T>(fn: () => Promise<T>): Promise<T> {
  return withEnv(
    {
      SQAI_API_KEY: undefined,
      ALGENTA_API_KEY: undefined,
      DE_API_KEY: undefined,
      SQAI_HOME: mkdtempSync(join(tmpdir(), "sqai-mcp-no-login-")),
    },
    fn,
  );
}

/** The valid-license path, stubbed the way the repo's license tests stub the
 * completed `sqai login` state (provision_install.test.ts): no env keys, and a
 * cached device key under an isolated SQAI_HOME. The gate resolves the cached
 * key fully offline — no control-plane round-trip. ALGENTA_API_KEY is
 * saved/restored by withEnv: the gate promotes the cached key into it, and
 * that side effect must not leak across tests. */
function withStubbedLicenseEnv<T>(fn: () => Promise<T>): Promise<T> {
  const home = mkdtempSync(join(tmpdir(), "sqai-mcp-licensed-"));
  writeFileSync(join(home, "api_key"), "sqai-mcp-test-stub-key\n", "utf8");
  return withEnv(
    {
      SQAI_API_KEY: undefined,
      ALGENTA_API_KEY: undefined,
      DE_API_KEY: undefined,
      SQAI_HOME: home,
    },
    fn,
  );
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

  it("serves the tool objects' descriptions verbatim plus the uniform-gate disclosure", () => {
    for (const entry of registry) {
      const advertised = result.tools.find(tool => tool.name === entry.name);
      expect(typeof entry.tool.description).toBe("string");
      expect(advertised?.description).toBe(`${entry.tool.description} ${GATE_DISCLOSURE}`);
      // The disclosure states the free-login requirement in the house pattern.
      expect(advertised?.description).toContain("free community login");
      expect(advertised?.description).toContain("`sqai login`");
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
  it("answers listSources with zero sources configured (stubbed license)", async () => {
    await withStubbedLicenseEnv(async () => {
      const result = await callTool(toolRegistry(toolsFor()), "listSources", {});
      expect(result.isError).toBeUndefined();
      expect(result.structuredContent).toEqual({ sources: [] });
    });
  });

  it("searches the capability catalog with zero sources (catalog is in-process)", async () => {
    await withStubbedLicenseEnv(async () => {
      const result = await callTool(toolRegistry(toolsFor()), "listSources", {
        capabilitySearch: "median",
      });
      expect(result.isError).toBeUndefined();
      const output = result.structuredContent as { modules: Array<{ name: string }> };
      expect(Array.isArray(output.modules)).toBe(true);
      expect(output.modules.length).toBeGreaterThan(0);
    });
  });

  it("returns a structured error — not a crash — for queryData without sources", async () => {
    await withStubbedLicenseEnv(async () => {
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
  });

  it("executes a real deterministic query over an inline records source", async () => {
    await withStubbedLicenseEnv(async () => {
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
  });

  it("dry-runs a query through explainQuery (resolved plan + plan_hash)", async () => {
    await withStubbedLicenseEnv(async () => {
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
  });

  it("rejects invalid arguments with a structured invalid_arguments error", async () => {
    await withStubbedLicenseEnv(async () => {
      const result = await callTool(toolRegistry(toolsFor()), "queryData", { kind: "query" });
      expect(result.isError).toBe(true);
      const output = result.structuredContent as Record<string, unknown>;
      expect(output.status).toBe("error");
      expect(output.code).toBe("invalid_arguments");
    });
  });

  it("rejects an unknown tool with a structured unknown_tool error naming the valid tools", async () => {
    const result = await callTool(toolRegistry(toolsFor()), "dropTable", {});
    expect(result.isError).toBe(true);
    const output = result.structuredContent as Record<string, unknown>;
    expect(output.code).toBe("unknown_tool");
    expect(String(output.message)).toContain("listSources");
  });

  it("renders the JSON payload as the text content block too", async () => {
    await withStubbedLicenseEnv(async () => {
      const result = await callTool(toolRegistry(toolsFor()), "listSources", {});
      const parsed: unknown = JSON.parse(textOf(result));
      expect(parsed).toEqual({ sources: [] });
    });
  });
});

describe("uniform license gate", () => {
  const QUERY_ARGS: QueryDataInput = {
    version: "1",
    kind: "query",
    spec: { metric: "revenue", aggregation: "sum", group_by: "region" },
  };
  const COMPUTATION_ARGS: QueryDataInput = {
    version: "1",
    kind: "computation",
    spec: { module: "stats", function: "median", args: [[1, 2, 3], 3] },
  };

  const GATED_CALLS: Array<[SqaiToolName, unknown]> = [
    ["listSources", {}],
    ["queryData", QUERY_ARGS],
    ["queryData", COMPUTATION_ARGS],
    ["explainQuery", QUERY_ARGS],
  ];

  it.each(GATED_CALLS)(
    "%s returns the computation plane's login_required byte-for-byte with no login",
    async (name, args) => {
      await withScrubbedLicenseEnv(async () => {
        const registry = toolRegistry(toolsFor([{ data: ORDERS, name: "orders" }]));
        const result = await callTool(registry, name, args);
        expect(result.isError).toBe(true);
        expect(textOf(result)).toBe(LOGIN_REQUIRED_TEXT);
        expect(result.structuredContent).toEqual(JSON.parse(LOGIN_REQUIRED_TEXT));
      });
    },
  );

  it("the expected payload is what the ungated computation path actually emits", async () => {
    await withScrubbedLicenseEnv(async () => {
      // Straight through the AI-SDK tool (no MCP gate): kind=computation reaches
      // the managed-runtime provisioner, whose login check fires before any
      // network work, and the tool's error mapping renders it.
      const tools = toolsFor([{ data: ORDERS, name: "orders" }]);
      const output = (await tools.queryData.execute(COMPUTATION_ARGS, {
        toolCallId: "test",
        messages: [],
      } as never)) as Record<string, unknown>;
      expect(JSON.stringify(output, null, 2)).toBe(LOGIN_REQUIRED_TEXT);
    });
  });

  it("keeps unknown_tool credential-free with no login (discovery, not execution)", async () => {
    await withScrubbedLicenseEnv(async () => {
      const result = await callTool(toolRegistry(toolsFor()), "not_a_tool", {});
      expect(result.isError).toBe(true);
      expect((result.structuredContent as Record<string, unknown>).code).toBe("unknown_tool");
    });
  });

  it("gates argument validation too — scrubbed env yields login_required, not invalid_arguments", async () => {
    await withScrubbedLicenseEnv(async () => {
      const result = await callTool(toolRegistry(toolsFor()), "queryData", { kind: "query" });
      expect(result.isError).toBe(true);
      expect(textOf(result)).toBe(LOGIN_REQUIRED_TEXT);
    });
  });
});

describe("buildSqaiMcpServer", () => {
  it("constructs a server with zero env (initialize needs no credentials)", () => {
    expect(() => buildSqaiMcpServer({ version: "0.0.0-test" })).not.toThrow();
  });
});
