# @thyn-ai/sqai-mcp

<!-- mcp-name: io.github.thyn-ai/sqai -->

**SQAI (Structured Query AI) as an MCP server** — the three governed, deterministic, read-only structured-data tools for any MCP host (Claude Desktop, Cursor, and friends), over stdio.

The tool surface is not a fork: this server reads descriptions, Zod input schemas, and execute functions straight off the tool objects in [`@thyn-ai/sqai-ai-sdk`](https://www.npmjs.com/package/@thyn-ai/sqai-ai-sdk). One source of truth, projected to MCP.

## Install & run

```bash
# zero-config: introspection works with no environment at all
npx @thyn-ai/sqai-mcp
```

The server speaks newline-delimited JSON-RPC 2.0 on stdio. With zero environment it answers `initialize` and `tools/list` immediately — sources connect lazily on the first tool call, and a connection failure comes back as a structured `source_connection_failed` error, never a crash.

### Claude Desktop / Cursor

```json
{
  "mcpServers": {
    "sqai": {
      "command": "npx",
      "args": ["-y", "@thyn-ai/sqai-mcp"],
      "env": {
        "SQAI_SOURCES": "[{\"data\": \"./data/sales.csv\", \"name\": \"sales\"}]"
      }
    }
  }
}
```

Environment (all optional):

| Variable | Meaning |
| --- | --- |
| `SQAI_SOURCES` | JSON array of `SqaiSourceInput`: a path/URL string, an array of row objects, or `{ "data": …, "name": "…" }`. Connects lazily. |
| `SQAI_API_KEY` | API key for licensing / API mode (semantics owned by `@thyn-ai/sqai`). |
| `SQAI_DEPLOYMENT_URL` | Private deployment endpoint; selects deployment mode when present. |

A malformed `SQAI_SOURCES` fails fast at startup with a structured `invalid_sources_env` error on stderr — the server never serves a half-valid configuration.

## The three tools

| Tool | What it does |
| --- | --- |
| `listSources` | Discovery: connected sources with exact field names, types, and allowed operations; computation-catalog search; per-module function signatures. |
| `queryData` | One deterministic, read-only request — `kind: "query"` (aggregations, grouping, filtering over connected sources) or `kind: "computation"` (math over arrays; simulation modules require a seed). Large results truncate for context and stay retrievable via `result_id`. |
| `explainQuery` | Dry-run a `queryData` request: resolved plan, `plan_hash`, confidence, and validation without executing; or a computation-signature check with a preview `invocation_hash`. |

All three carry the MCP annotations `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true` (deterministic — `plan_hash` / `invocation_hash` prove it), `openWorldHint: false`.

Errors are structured payloads (`status: "error"`, `code`, `message`, `retryable`, `request_id`) — domain outcomes like `needs_clarification` and `rejected` are normal results the model can reason about, not failures.

## Licensing

The query plane runs in-process and needs no account. The computation plane is free on 1 machine with a one-time device registration (`npx @thyn-ai/sqai-cli login`, or `sqai login`) — licensing moves a signed token, never your data. Without registration, computation calls return a structured licensing error by design; queries keep working.

## Links

- Product: [sqai.com](https://sqai.com)
- TypeScript SDK: [`@thyn-ai/sqai`](https://www.npmjs.com/package/@thyn-ai/sqai)
- AI SDK tools: [`@thyn-ai/sqai-ai-sdk`](https://www.npmjs.com/package/@thyn-ai/sqai-ai-sdk)

Apache-2.0 · a [Thyn](https://thyn.ai) product
