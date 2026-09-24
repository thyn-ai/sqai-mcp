/** sqai-mcp — stdio MCP server for SQAI.
 *
 * Serves exactly four tools (listSources, queryData, explainQuery, getResult)
 * over newline-delimited JSON-RPC on stdio. stdout carries protocol bytes only;
 * diagnostics go to stderr.
 *
 * Introspection (initialize / tools/list) is credential-free. Every tools/call
 * passes the uniform device-login gate (@thyn-ai/sqai ensureLocalLoginKey):
 * without a key it returns a structured login_required error — never a crash,
 * and the server keeps serving.
 *
 * Environment (all optional — zero env is a valid configuration):
 *   SQAI_SOURCES         JSON array of SqaiSourceInput (paths, row arrays, { data, name? })
 *   SQAI_API_KEY         licensing / API mode (semantics owned by @thyn-ai/sqai)
 *   SQAI_DEPLOYMENT_URL  private deployment endpoint (selects deployment mode) */

import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";

import { readSourcesFromEnv, SourcesEnvError } from "./env.js";
import { buildSqaiMcpServer, SERVER_NAME } from "./server.js";
import { serverVersion } from "./version.js";

async function main(): Promise<number> {
  let sources;
  try {
    sources = readSourcesFromEnv();
  } catch (error) {
    if (error instanceof SourcesEnvError) {
      console.error(
        JSON.stringify({
          error: {
            code: error.code,
            message: error.message,
            details: { variable: "SQAI_SOURCES" },
          },
        }),
      );
      return 1;
    }
    throw error;
  }

  const server = buildSqaiMcpServer({ sources, version: serverVersion() });
  await server.connect(new StdioServerTransport());
  console.error(
    `${SERVER_NAME} up: 3 tools (listSources, queryData, explainQuery), ` +
      `${sources.length} source(s) declared (lazy connect on first call)`,
  );
  return 0;
}

main()
  .then(code => {
    if (code !== 0) {
      process.exitCode = code;
    }
  })
  .catch((error: unknown) => {
    console.error(
      JSON.stringify({
        error: {
          code: "startup_failed",
          message: error instanceof Error ? error.message : String(error),
          details: {},
        },
      }),
    );
    process.exitCode = 1;
  });
