# SQAI — Structured Query AI

> **SQAI is the deterministic, read-only structured-data tool for AI agents, with governed execution and replayable provenance.**

Apache-2.0 · TypeScript + Python · built on Algenta as the underlying substrate · a [Thyn](https://thyn.ai) product

The model proposes meaning. SQAI controls execution: typed intent in, policy-checked
deterministic execution, replayable results with full provenance out. No raw SQL,
no eval, no write path.

## Architecture

| Layer | Package | What it is |
| --- | --- | --- |
| AI SDK tools | `@thyn-ai/sqai-ai-sdk` (npm) | Three Vercel AI SDK 7 tools — `listSources`, `queryData`, `explainQuery` |
| Product SDK | `@thyn-ai/sqai` (npm) | SQAI query plane + full computation plane |
| Product SDK | `sqai` (PyPI) | Same SQAI surface, 1:1 vocabulary |
| CLI | `@thyn-ai/sqai-cli` (npm, bin `sqai`) | `sqai doctor --parity`, `sqai runtime install/verify/status/stop` |
| Capability contract | Embedded SQAI contract | The generated, hash-pinned inventory of every capability SQAI exposes |
| Execution substrate | Algenta (exact-pinned) | Underlying deterministic execution substrate and managed signed runtime bundle |

## Quickstart (AI SDK)

```ts
import { generateText } from "ai";
import { createSQAI } from "@thyn-ai/sqai-ai-sdk";

const sqai = createSQAI({ sources: [{ data: "./data/sales.csv", name: "sales" }] });

const { text } = await generateText({
  model: "openai/gpt-5-mini",
  tools: sqai.tools(),
  prompt: "Which region had the highest total revenue?",
});
```

No server. No daemon for the query plane. The computation plane provisions a
signed managed runtime transparently on first use.

<!-- mcp-name: io.github.thyn-ai/sqai -->

## MCP server

The same three governed tools are available to any MCP host (Claude Desktop,
Cursor, …) as a stdio server — descriptions, Zod schemas, and execute
functions are read straight off the AI-SDK tool objects, never forked:

```bash
npx @thyn-ai/sqai-mcp
```

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

Introspection (`initialize` / `tools/list`) needs no credentials — zero
environment is a valid configuration. Executing any of the three tools requires
a free community login (`sqai login` once / device registration, or
`SQAI_API_KEY`) — fully offline thereafter; without it every tools/call returns
a structured `login_required` error. `SQAI_DEPLOYMENT_URL` keeps its usual
semantics from `@thyn-ai/sqai`.

| Tool | What it does |
| --- | --- |
| `listSources` | Discovery: sources with exact field names, types, and allowed operations; computation-catalog search; per-module signatures. |
| `queryData` | One deterministic, read-only query or computation; truncated results stay retrievable via `result_id`. |
| `explainQuery` | Dry-run: resolved plan, `plan_hash`, validation — or a computation-signature check with a preview `invocation_hash`. |

All three are annotated `readOnlyHint: true`, `destructiveHint: false`,
`idempotentHint: true`, `openWorldHint: false`. All three execute under the one
uniform license gate: free on 1 machine with a one-time device registration
(`sqai login`) — licensing moves a signed token, never your data; without it,
every tool call — local CSV reads included — returns a structured
`login_required` error by design.

## What works today

- Query plane (connect / resolve / query / verify / ask) — in-process, both languages
- Full SQAI computation plane behind capability-contract validation
- Policy allow-lists (sources, fields, functions) the model can never override
- Cross-language conformance: identical values, `plan_hash`, `intent_signature`
- Model-context truncation with opaque result handles

## Repository layout

```
contracts/        generated capability contract + tested version pair
packages/sdk/     @thyn-ai/sqai (TypeScript product SDK)
packages/ai-sdk/  @thyn-ai/sqai-ai-sdk (Vercel AI SDK tools)
packages/cli/     sqai CLI (doctor, runtime verbs)
packages/mcp/     @thyn-ai/sqai-mcp (MCP stdio server)
packages/python-sdk/  sqai (PyPI)
examples/         runnable examples (AI SDK registry example)
scripts/          contract sync + parity gate
docs/             GitBook (docs.sqai.com)
```

## Key documents

| Doc | Purpose |
| --- | --- |
| [docs/quickstart-ts.md](docs/quickstart-ts.md) | TypeScript quickstart |
| [docs/quickstart-python.md](docs/quickstart-python.md) | Python quickstart |
| [docs/ai-sdk-tools.md](docs/ai-sdk-tools.md) | Tool schemas and truncation contract |
| [docs/determinism.md](docs/determinism.md) | Hashes, envelopes, "deterministic within the declared execution scope" |
| [docs/licensing.md](docs/licensing.md) | Free developer tier, entitlements, runtime bundle trust |
| [SECURITY.md](SECURITY.md) | Security policy |
