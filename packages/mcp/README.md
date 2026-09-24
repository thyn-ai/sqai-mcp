# @thyn-ai/sqai-mcp

<!-- mcp-name: io.github.thyn-ai/sqai -->

**SQAI (Structured Query AI) as an MCP server** — the four governed, deterministic, read-only structured-data tools for any MCP host (Claude Desktop, Cursor, and friends), over stdio.

The tool surface is not a fork: this server reads descriptions, Zod input schemas, and execute functions straight off the tool objects in [`@thyn-ai/sqai-ai-sdk`](https://www.npmjs.com/package/@thyn-ai/sqai-ai-sdk). One source of truth, projected to MCP.

## Install & run

```bash
# zero-config: introspection works with no environment at all
npx @thyn-ai/sqai-mcp
```

The server speaks newline-delimited JSON-RPC 2.0 on stdio. With zero environment it answers `initialize` and `tools/list` immediately — introspection needs no credentials. Executing any tool requires a free community login (`sqai login` / device registration) — fully offline thereafter; without it every tools/call returns a structured `login_required` error, never a crash. Sources connect lazily on the first tool call, and a connection failure comes back as a structured `source_connection_failed` error, never a crash.

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
| `SQAI_API_KEY` | API key for licensing / API mode (semantics owned by `@thyn-ai/sqai`). Not needed for introspection; required for tool execution unless `sqai login` has cached a device key. |
| `SQAI_DEPLOYMENT_URL` | Private deployment endpoint; selects deployment mode when present. |

A malformed `SQAI_SOURCES` fails fast at startup with a structured `invalid_sources_env` error on stderr — the server never serves a half-valid configuration.

## The four tools

| Tool | What it does |
| --- | --- |
| `listSources` | Discovery: connected sources with exact field names, types, and allowed operations; computation-catalog search; per-module function signatures. |
| `queryData` | One deterministic, read-only request — `kind: "query"` (aggregations, grouping, filtering over connected sources) or `kind: "computation"` (math over arrays; simulation modules require a seed). Large results truncate for context; the full result stays retrievable — pass the returned `result_id` to `getResult`. |
| `explainQuery` | Dry-run a `queryData` request: resolved plan, `plan_hash`, confidence, and validation without executing; or a computation-signature check with a preview `invocation_hash`. |
| `getResult` | Fetch the full stored result of an earlier `queryData` call by its `result_id` (only results within the 10 MB output cap get one). The store is in-memory and short-lived — 15-minute default TTL, evicted oldest-first under memory pressure; an unknown, expired, or evicted `result_id` returns a structured `result_not_found` error, so re-run the query to regenerate. |

All four carry the MCP annotations `readOnlyHint: true`, `destructiveHint: false`, `idempotentHint: true` (deterministic — `plan_hash` / `invocation_hash` prove it), `openWorldHint: false`.

Errors are structured payloads (`status: "error"`, `code`, `message`, `retryable`, `request_id`) — domain outcomes like `needs_clarification` and `rejected` are normal results the model can reason about, not failures.

### What the v1 surface is (and is not)

The MCP v1 surface is the discovery → execute → explain → retrieve cycle above, and nothing else. There is deliberately **no "list past queries" tool**: result handles are opaque random ids into a short-lived in-memory store — unlinkable by design, so a listing would reveal nothing useful and the entries expire within minutes. `result_id` is the only retrieval key, handed out by `queryData` itself. **Bindings and connectors are managed outside MCP**: connecting sources, and the connector lifecycle verbs (`test_connector` / `create_connector` / `list_connectors` / `browse_connector` / `get_connector` / `update_connector` / `delete_connector`), live in the SQAI CLI (`sqai`) and the TypeScript/Python SDKs — sources reach this server via `SQAI_SOURCES` at startup, and computation `bindings` ride inside a `queryData` spec.

## Licensing

Introspection (`initialize` / `tools/list`) needs no credentials. Executing any of the four tools requires a free community login (`npx @thyn-ai/sqai-cli login`, or `sqai login` — device registration) — fully offline thereafter; licensing moves a signed token, never your data. Without it, every tool call — local CSV reads included — returns a structured `login_required` error by design.

## Links

- Product: [sqai.com](https://sqai.com)
- TypeScript SDK: [`@thyn-ai/sqai`](https://www.npmjs.com/package/@thyn-ai/sqai)
- AI SDK tools: [`@thyn-ai/sqai-ai-sdk`](https://www.npmjs.com/package/@thyn-ai/sqai-ai-sdk)

Apache-2.0 · a [Thyn](https://thyn.ai) product
