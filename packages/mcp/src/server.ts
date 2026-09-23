/** SQAI MCP server — the three governed SQAI tools over the Model Context Protocol.
 *
 * The tool surface is READ, not forked: every advertised inputSchema comes
 * straight off the tool objects built by createSqaiTools(@thyn-ai/sqai-ai-sdk),
 * so the TDQS text and the Zod v4 schemas have exactly one source of truth
 * (packages/ai-sdk/src/tools.ts and schemas.ts). This module translates them
 * into MCP wire shape, adds the spec annotations, and wraps the served
 * descriptions with the uniform-gate disclosure (see GATE_DISCLOSURE — the
 * ai-sdk descriptions stay verbatim because the SDK-level query plane is not
 * gated; the MCP execution surface is).
 *
 * Uniform license gate (owner rule: every tool execution requires the free
 * community login; initialize/tools/list stay credential-free). Every
 * tools/call for a registered tool runs ensureLocalLoginKey from
 * @thyn-ai/sqai — verbatim the device-login check the computation plane
 * already runs before provisioning the managed runtime — so listSources,
 * queryData (both kinds) and explainQuery fail with the identical structured
 * login_required payload an unauthenticated computation returns. Unknown-tool
 * answers stay credential-free: they are discovery, not execution.
 *
 * Never-throw semantics are preserved end to end: the SQAI tools already
 * return structured errors instead of throwing, and every MCP-level failure
 * (unknown tool, invalid arguments, missing login, unexpected throw) is mapped
 * to a structured isError result — the server process never crashes on input. */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  type CallToolResult,
  type ListToolsResult,
  type ToolAnnotations,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import {
  createSQAI,
  createSqaiTools,
  ensureLocalLoginKey,
  SqaiError,
  type SQAIToolkit,
  type SqaiSourceInput,
  type SqaiTool,
  type SqaiToolSet,
} from "@thyn-ai/sqai-ai-sdk";

export const SERVER_NAME = "sqai-mcp";

/** Fixed registration order — the tool surface is exactly these three. */
const TOOL_NAMES = ["listSources", "queryData", "explainQuery"] as const;
export type SqaiToolName = (typeof TOOL_NAMES)[number];

/** MCP spec annotations for the SQAI tools. All three are read-only,
 * non-destructive, deterministic (repeated calls with the same input return
 * the same output — queryData proves it with plan_hash / invocation_hash) and
 * operate over local, explicitly connected sources rather than the open world. */
const TOOL_ANNOTATIONS: Record<SqaiToolName, ToolAnnotations> = {
  listSources: {
    title: "List sources and capabilities",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  queryData: {
    title: "Query data (deterministic, read-only)",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
  explainQuery: {
    title: "Explain a query (dry-run)",
    readOnlyHint: true,
    destructiveHint: false,
    idempotentHint: true,
    openWorldHint: false,
  },
};

export interface RegisteredTool {
  name: SqaiToolName;
  /** The live AI-SDK tool object — description, inputSchema and execute are
   * read straight off it at request time. */
  tool: SqaiTool<unknown, unknown>;
  annotations: ToolAnnotations;
}

export function toolRegistry(tools: SqaiToolSet): RegisteredTool[] {
  return TOOL_NAMES.map(name => ({
    name,
    tool: tools[name] as SqaiTool<unknown, unknown>,
    annotations: TOOL_ANNOTATIONS[name],
  }));
}

/** AI-SDK tools carry their Zod schema at runtime (tool() passes it through);
 * the Tool type erases it to the ai package's Schema abstraction. */
function zodSchemaOf(tool: SqaiTool<unknown, unknown>): z.ZodType {
  return tool.inputSchema as unknown as z.ZodType;
}

/** Zod v4 → JSON Schema for tools/list. `io: "input"` keeps `.default()`
 * fields optional for the caller; the top-level `type: "object"` the MCP spec
 * requires is added when the schema itself does not state it (the queryData /
 * explainQuery discriminated union advertises oneOf instead). */
export function mcpInputSchema(tool: SqaiTool<unknown, unknown>): Record<string, unknown> {
  const { $schema: _dropped, ...jsonSchema } = z.toJSONSchema(zodSchemaOf(tool), { io: "input" });
  return { type: "object", ...jsonSchema };
}

/** AI-SDK v7 types `description` as string-or-function; the SQAI tools use
 * static strings. A function description has no faithful MCP projection
 * (there is no per-call model context to pass), so fail loudly rather than
 * advertise an empty or fabricated one. */
function descriptionOf(tool: SqaiTool<unknown, unknown>): string {
  const description = tool.description;
  if (typeof description === "function") {
    throw new Error(
      "sqai-mcp: a dynamic tool description cannot be projected to MCP; " +
        "the SQAI tools must keep static description strings",
    );
  }
  return description ?? "";
}

/** The uniform-gate disclosure appended to every served description. The
 * ai-sdk tool objects keep their verbatim descriptions (at SDK level the
 * in-process query plane is ungated); the MCP layer wraps at advertise time
 * because over MCP EVERY tool execution requires the free community login.
 * Exported so tests assert the exact text. */
export const GATE_DISCLOSURE =
  "Execution requires a free community login (`sqai login` device registration, or " +
  "SQAI_API_KEY) — fully offline thereafter.";

function gatedDescription(tool: SqaiTool<unknown, unknown>): string {
  return `${descriptionOf(tool)} ${GATE_DISCLOSURE}`;
}

export function listToolsResult(registry: RegisteredTool[]): ListToolsResult {
  return {
    tools: registry.map(entry => ({
      name: entry.name,
      description: gatedDescription(entry.tool),
      inputSchema: mcpInputSchema(entry.tool) as ListToolsResult["tools"][number]["inputSchema"],
      annotations: entry.annotations,
    })),
  };
}

interface StructuredError {
  status: "error";
  code: string;
  message: string;
  retryable: boolean;
  request_id: string | null;
}

function errorResult(error: StructuredError): CallToolResult {
  return {
    isError: true,
    content: [{ type: "text", text: JSON.stringify(error, null, 2) }],
    structuredContent: error as unknown as Record<string, unknown>,
  };
}

/** Run the shared device-login gate. On failure, return the SqaiError's
 * toResult() payload — key-for-key the object the AI-SDK error mapping emits
 * for an unauthenticated computation — so a gated tools/call is byte-for-byte
 * indistinguishable from the computation plane's own login_required. */
async function licenseGateFailure(): Promise<CallToolResult | null> {
  try {
    await ensureLocalLoginKey();
    return null;
  } catch (error) {
    if (error instanceof SqaiError) {
      return errorResult(error.toResult());
    }
    return errorResult({
      status: "error",
      code: "internal_error",
      message: error instanceof Error ? error.message : String(error),
      retryable: false,
      request_id: null,
    });
  }
}

/** Execute one tools/call. Every failure mode returns a structured result;
 * this function never throws. */
export async function callTool(
  registry: RegisteredTool[],
  name: string,
  args: unknown,
): Promise<CallToolResult> {
  const entry = registry.find(candidate => candidate.name === name);
  if (!entry) {
    return errorResult({
      status: "error",
      code: "unknown_tool",
      message: `Unknown tool '${name}'. Available tools: ${TOOL_NAMES.join(", ")}.`,
      retryable: false,
      request_id: null,
    });
  }
  // Uniform license gate: once the tool name resolves, everything downstream —
  // argument validation included — is execution, and every execution requires
  // the free community login. initialize and tools/list never reach this path.
  const gateFailure = await licenseGateFailure();
  if (gateFailure) {
    return gateFailure;
  }
  const parsed = zodSchemaOf(entry.tool).safeParse(args ?? {});
  if (!parsed.success) {
    return errorResult({
      status: "error",
      code: "invalid_arguments",
      message:
        `Invalid arguments for ${name}: ` +
        parsed.error.issues
          .map(issue => `${issue.path.join(".") || "<root>"}: ${issue.message}`)
          .join("; "),
      retryable: false,
      request_id: null,
    });
  }
  try {
    const output = (await entry.tool.execute(parsed.data, {
      toolCallId: `mcp-${name}`,
      messages: [],
    } as never)) as Record<string, unknown>;
    const text = JSON.stringify(output, null, 2);
    return {
      // The SQAI tools report failures as { status: "error", ... } payloads
      // instead of throwing; surface those as MCP tool errors, keep domain
      // outcomes (ok / needs_clarification / rejected) as normal results.
      ...(output?.status === "error" ? { isError: true } : {}),
      content: [{ type: "text", text }],
      structuredContent: output,
    };
  } catch (error) {
    // Last line of defense — the SQAI tools never throw by contract, but the
    // server must not crash even if that contract is ever broken upstream.
    return errorResult({
      status: "error",
      code: "internal_error",
      message: error instanceof Error ? error.message : String(error),
      retryable: false,
      request_id: null,
    });
  }
}

export interface SqaiMcpServerOptions {
  /** Sources declared up front; connections stay lazy (first tool call). */
  sources?: SqaiSourceInput[];
  /** Injected toolkit for tests; defaults to createSQAI({ sources }). */
  toolkit?: SQAIToolkit;
  version: string;
}

/** Build the MCP server around the three SQAI tools. Construction connects
 * nothing: the toolkit's lazy-source behavior means initialize and tools/list
 * work with zero env and zero credentials. */
export function buildSqaiMcpServer(options: SqaiMcpServerOptions): Server {
  const toolkit = options.toolkit ?? createSQAI({ sources: options.sources ?? [] });
  const registry = toolRegistry(createSqaiTools(toolkit));

  const server = new Server(
    { name: SERVER_NAME, version: options.version },
    { capabilities: { tools: {} } },
  );
  server.setRequestHandler(ListToolsRequestSchema, async () => listToolsResult(registry));
  server.setRequestHandler(CallToolRequestSchema, async request =>
    callTool(registry, request.params.name, request.params.arguments),
  );
  return server;
}
