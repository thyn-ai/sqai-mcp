/** End-to-end MCP handshake against the BUILT server (dist/index.js).
 *
 * Drives the server exactly like an MCP host would — newline-delimited
 * JSON-RPC 2.0 over stdio (no port) — through initialize ->
 * notifications/initialized -> tools/list -> tools/call, and checks the
 * responses correlate by id.
 *
 * The headline contract: with ZERO SQAI_* env the server answers initialize
 * and tools/list (the toolkit's lazy-source behavior), so any MCP host can
 * introspect the three governed tools with no credentials and no sources. */

import { spawn, type ChildProcess } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SERVER = fileURLToPath(new URL("../dist/index.js", import.meta.url));
const PACKAGE_DIR = fileURLToPath(new URL("..", import.meta.url));
const TEST_SQAI_HOME = join(tmpdir(), `sqai-mcp-test-home-${process.pid}`);

interface RpcSession {
  child: ChildProcess;
  responses: Map<number, Record<string, unknown>>;
  stderr: string;
  exitCode: number | null;
}

function rpc(id: number | null, method: string, params?: Record<string, unknown>): string {
  const message: Record<string, unknown> = { jsonrpc: "2.0", method };
  if (id !== null) {
    message.id = id;
  }
  if (params !== undefined) {
    message.params = params;
  }
  return JSON.stringify(message);
}

const INITIALIZE_PARAMS = {
  protocolVersion: "2025-06-18",
  capabilities: {},
  clientInfo: { name: "sqai-mcp-e2e", version: "0.0.0" },
};

/** Deterministic zero-config environment: no credentials, no deployment URL,
 * an isolated SQAI_HOME, a closed daemon port, and runtime auto-install off
 * so nothing ever reaches the network. */
function testEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    ALGENTA_API_KEY: "",
    DE_API_KEY: "",
    SQAI_API_KEY: "",
    SQAI_DEPLOYMENT_URL: "",
    SQAI_SOURCES: "",
    SQAI_HOME: TEST_SQAI_HOME,
    SQAI_RUNTIME_AUTO_INSTALL: "0",
    ALGENTA_DAEMON_TCP: "127.0.0.1:9",
    ...extra,
  };
}

/** Feed newline-delimited JSON-RPC to the server, close stdin, collect every
 * stdout response until exit. Kills the child after `timeoutMs`. */
function runServer(
  requests: string[],
  env: Record<string, string> = {},
  timeoutMs = 30_000,
): Promise<RpcSession> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [SERVER], {
      cwd: PACKAGE_DIR,
      env: testEnv(env),
      stdio: ["pipe", "pipe", "pipe"],
    });
    const responses = new Map<number, Record<string, unknown>>();
    let stdout = "";
    let stderr = "";
    const killer = setTimeout(() => {
      child.kill("SIGKILL");
      reject(new Error(`sqai-mcp did not exit within ${timeoutMs}ms; stderr: ${stderr}`));
    }, timeoutMs);
    child.stdout?.on("data", (chunk: Buffer) => {
      stdout += chunk.toString("utf-8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      stderr += chunk.toString("utf-8");
    });
    child.on("error", error => {
      clearTimeout(killer);
      reject(error);
    });
    // The server may exit before reading (e.g. fail-fast on bad env); an
    // EPIPE on stdin is expected then, not a test failure.
    child.stdin?.on("error", () => {});
    child.on("close", code => {
      clearTimeout(killer);
      for (const line of stdout.split("\n")) {
        const trimmed = line.trim();
        if (trimmed.length === 0) {
          continue;
        }
        try {
          const message = JSON.parse(trimmed) as Record<string, unknown>;
          if (typeof message.id === "number") {
            responses.set(message.id, message);
          }
        } catch {
          // non-JSON stdout lines are protocol violations; ignored here and
          // caught by the assertions on the responses themselves
        }
      }
      resolve({ child, responses, stderr, exitCode: code });
    });
    child.stdin?.write(requests.join("\n") + "\n");
    child.stdin?.end();
  });
}

function resultOf(session: RpcSession, id: number): Record<string, unknown> {
  const response = session.responses.get(id);
  expect(response, `missing response for id ${id}`).toBeDefined();
  return (response?.result ?? {}) as Record<string, unknown>;
}

function callPayload(session: RpcSession, id: number): Record<string, unknown> {
  const result = resultOf(session, id);
  const content = result.content as Array<{ type: string; text?: string }>;
  return JSON.parse(content[0]?.text ?? "{}") as Record<string, unknown>;
}

describe("sqai-mcp stdio e2e", () => {
  it("answers initialize + tools/list with ZERO env, then exits cleanly on stdin EOF", async () => {
    const session = await runServer([
      rpc(1, "initialize", INITIALIZE_PARAMS),
      rpc(null, "notifications/initialized"),
      rpc(2, "tools/list"),
    ]);

    expect(session.exitCode).toBe(0);

    const init = resultOf(session, 1);
    expect((init.serverInfo as Record<string, unknown>).name).toBe("sqai-mcp");
    expect(typeof (init.serverInfo as Record<string, unknown>).version).toBe("string");
    expect(init.capabilities).toMatchObject({ tools: {} });

    // The initialized notification must get NO response.
    expect([...session.responses.keys()]).toEqual([1, 2]);

    const tools = (resultOf(session, 2).tools ?? []) as Array<Record<string, unknown>>;
    expect(tools.map(tool => tool.name)).toEqual(["listSources", "queryData", "explainQuery"]);
    for (const tool of tools) {
      expect(tool.annotations).toMatchObject({
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false,
      });
      expect(typeof tool.description).toBe("string");
      expect((tool.inputSchema as Record<string, unknown>).type).toBe("object");
    }
  }, 45_000);

  it("serves a real deterministic query over an inline source from SQAI_SOURCES", async () => {
    const sources = JSON.stringify([
      {
        data: [
          { region: "east", revenue: 100.5 },
          { region: "west", revenue: 619 },
          { region: "east", revenue: 800 },
        ],
        name: "orders",
      },
    ]);
    const session = await runServer(
      [
        rpc(1, "initialize", INITIALIZE_PARAMS),
        rpc(null, "notifications/initialized"),
        rpc(2, "tools/call", {
          name: "queryData",
          arguments: {
            version: "1",
            kind: "query",
            spec: { metric: "revenue", aggregation: "sum", group_by: "region" },
          },
        }),
        rpc(3, "tools/call", { name: "not_a_tool", arguments: {} }),
      ],
      { SQAI_SOURCES: sources },
    );

    expect(session.exitCode).toBe(0);
    const query = callPayload(session, 2);
    expect(query.status).toBe("ok");
    expect(query.data).toEqual({
      columns: ["region", "revenue", "count"],
      rows: [
        ["east", 900.5, 2],
        ["west", 619, 1],
      ],
    });
    expect(typeof query.plan_hash).toBe("string");

    // Unknown tool: structured isError result, never a crash.
    const unknown = resultOf(session, 3);
    expect(unknown.isError).toBe(true);
    expect(callPayload(session, 3).code).toBe("unknown_tool");
  }, 45_000);

  it("fails fast with a structured stderr error when SQAI_SOURCES is malformed", async () => {
    const session = await runServer([rpc(1, "initialize", INITIALIZE_PARAMS)], {
      SQAI_SOURCES: "{not json",
    });
    expect(session.exitCode).toBe(1);
    expect(session.responses.size).toBe(0);
    const parsed = JSON.parse(
      session.stderr.split("\n").find(line => line.trim().startsWith("{")) ?? "{}",
    ) as { error?: { code?: string; message?: string } };
    expect(parsed.error?.code).toBe("invalid_sources_env");
  }, 45_000);
});
