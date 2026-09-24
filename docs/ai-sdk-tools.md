---
icon: robot
description: Expose SQAI to a Vercel AI SDK agent as three governed, deterministic, read-only tools — createSQAI, sqai.tools(), and a replayable hash on every answer.
---

# Vercel AI SDK tool

`@thyn-ai/sqai-ai-sdk` wraps an SQAI — **Structured Query AI** — client into three Vercel AI SDK tools you drop straight into `generateText` or `streamText`. The model authors typed intent; SQAI validates it against the hash-pinned capability contract and your application policy; the SQAI runtime executes it; every answer returns with a replayable hash. No raw SQL, no `eval`, no write path — the model reaches only a read-only surface of **5,790 exposed capabilities** (5,780 deterministic plus 10 seed-required simulations) plus your connected sources.

`sqai.tools()` returns tools whose `execute` is always present and that **never throw**: ambiguity, rejection, and failure come back as typed statuses the model can react to, not exceptions that abort the run. Policy lives in code and is unreachable from any tool input, so the model can only narrow what you enabled, never widen it. The query plane is in-process; local compute requires the one-time free `sqai login` device enrollment or `SQAI_API_KEY` before the signed runtime provisions itself.

{% hint style="info" %}
Keep SQAI imports **server-side**. On Next.js set `export const runtime = "nodejs"` (the Node runtime, not Edge). New to SQAI? Read the [TypeScript Quickstart](quickstart-ts.md) first — the toolkit is the same client with tools bolted on.
{% endhint %}

## Install

{% tabs %}
{% tab title="npm" icon="npm" %}
```bash
npm install ai zod @thyn-ai/sqai-ai-sdk
```
{% endtab %}
{% tab title="pnpm" icon="terminal" %}
```bash
pnpm add ai zod @thyn-ai/sqai-ai-sdk
```
{% endtab %}
{% tab title="yarn" icon="terminal" %}
```bash
yarn add ai zod @thyn-ai/sqai-ai-sdk
```
{% endtab %}
{% tab title="bun" icon="terminal" %}
```bash
bun add ai zod @thyn-ai/sqai-ai-sdk
```
{% endtab %}
{% endtabs %}

Peer dependencies are **`ai ^7.0.0`** and **`zod ^4.0.0`** — both required. `@thyn-ai/sqai-ai-sdk` depends on `@thyn-ai/sqai` and re-exports `SQAI`, `SqaiError`, and the core types, so you rarely import both packages. Node ≥ 20. See [Installation](installation.md) for the full matrix.

## Create the sample data

```bash
mkdir -p data
cat > data/sales.csv <<'CSV'
region,product,revenue,cost,units,order_date
east,widget,100.5,60.2,10,2026-01-05
east,widget,430,258.5,40,2026-01-12
east,gadget,800,470,16,2026-02-02
east,gadget,300,180,6,2026-02-19
east,sprocket,500,290,25,2026-03-01
west,widget,250,155,25,2026-01-08
west,gadget,619,371,12,2026-02-11
west,sprocket,400,236,20,2026-02-27
west,widget,250,148,24,2026-03-15
north,gadget,350,210,7,2026-01-21
north,widget,450,270,45,2026-02-09
north,sprocket,200,118,10,2026-03-22
CSV
```

## Wire SQAI into an agent

{% stepper %}
{% step %}
#### Create the toolkit

`createSQAI(config?)` from the AI-SDK package returns an `SQAIToolkit`: an `SQAI` client plus declarative `sources`. Config is the normal `SqaiConfig` (`mode`, `apiKey`, `deploymentUrl`, `policy`, `tenantId`, `runtimeModules`, …) with one extra key, `sources`.

```ts
import { createSQAI } from "@thyn-ai/sqai-ai-sdk";

const sqai = createSQAI({
  sources: [{ data: "./data/sales.csv", name: "sales" }],
  // policy, tenantId, mode, … all pass through to the underlying SQAI client.
});
```

Each source is a `SqaiSourceInput` — a path string, an array of records, or `{ data, name? }`. Sources connect **lazily** on the first tool call (or first `await sqai.ready`). A failed connect is captured, not thrown: it surfaces as a structured `source_connection_failed` error result on every tool call, and is readable at `sqai.connectionError`. The underlying client is `sqai.client`.
{% endstep %}

{% step %}
#### Register the tools

`sqai.tools(options?)` returns exactly four tools — `listSources`, `queryData`, `explainQuery`, `getResult` — typed as `SqaiToolSet`, which is assignable to the AI SDK's `ToolSet` with no cast. Pass it straight to `tools`.

```ts
import { generateText, isStepCount } from "ai";

const { text, steps } = await generateText({
  model: "openai/gpt-5-mini",   // any AI SDK model; gateway id shown, illustrative
  tools: sqai.tools(),
  stopWhen: isStepCount(12),
  prompt: "Which region had the highest total revenue?",
});
```

`stopWhen: isStepCount(n)` bounds how many tool-call rounds the model may take — a real answer usually needs several (`listSources` for exact field names, then `queryData`, sometimes `explainQuery` to debug a clarification). Set it high enough to finish, e.g. `12`.
{% endstep %}

{% step %}
#### Read the provenance

Every `ok` tool result is replayable. Walk `steps[].toolResults[].output` and pull the hash — `plan_hash` for queries, `invocation_hash` / `computation_hash` for computations.

```ts
for (const step of steps) {
  for (const toolResult of step.toolResults ?? []) {
    const output = (toolResult as { output?: Record<string, unknown> }).output;
    if (output?.status !== "ok") continue;
    if (output.kind === "query") {
      console.log(`[provenance] query plan_hash=${String(output.plan_hash).slice(0, 12)}…`);
    } else if (output.kind === "computation") {
      console.log(`[provenance] computation=${String(output.computation_hash).slice(0, 12)}…`);
    }
  }
}
```

The same logical plan produces the same hash in TypeScript and Python — conformance-locked. See [Determinism & provenance](determinism.md).
{% endstep %}
{% endstepper %}

### Full example

Connect a CSV, let the model run both planes — a grouped query and a financial computation over a bound column — print the answer, then print the replayable hash for every tool result.

{% code title="main.ts" lineNumbers="true" %}
```ts
import { generateText, isStepCount } from "ai";
import { createSQAI } from "@thyn-ai/sqai-ai-sdk";

const sqai = createSQAI({
  sources: [{ data: "./data/sales.csv", name: "sales" }],
});

const { text, steps } = await generateText({
  model: "openai/gpt-5-mini",   // any AI SDK model
  tools: sqai.tools(),
  stopWhen: isStepCount(12),
  prompt:
    "Which region had the highest total revenue? Also: what is the net present " +
    "value of the revenue stream at a 10% discount rate (finance.npv)?",
});

console.log(`\n${text}\n`);

// Provenance: every ok tool result is replayable.
for (const step of steps) {
  for (const toolResult of step.toolResults ?? []) {
    const output = (toolResult as { output?: Record<string, unknown> }).output;
    if (output?.status !== "ok") continue;
    if (output.kind === "query") {
      console.log(
        `[provenance] query plan_hash=${String(output.plan_hash).slice(0, 12)}…`,
      );
    } else if (output.kind === "computation") {
      console.log(
        `[provenance] computation invocation=${String(output.invocation_hash).slice(0, 12)}… ` +
          `computation=${String(output.computation_hash).slice(0, 12)}…`,
      );
    }
  }
}
```
{% endcode %}

The model calls `listSources` for exact field names, then `queryData` (kind `query`) for the grouped sum. Its result comes back shaped as a `columns`/`rows` table with the plan hash:

`sqai.tools()` applies `defaultLimit: 100` when the model omits `spec.limit`; that limit is part of the resolved plan and therefore part of `plan_hash`.

```jsonc
{
  "status": "ok",
  "kind": "query",
  "data": {
    "columns": ["region", "revenue", "count"],
    "rows": [["east", 2130.5, 5], ["west", 1519, 4], ["north", 1000, 3]]
  },
  "total_rows": 3,
  "returned_rows": 3,
  "truncated": false,
  "plan_hash": "578bc850cde68b5628de6c382718243ab6c0109fae5589f4ee7c54af7daca4aa",
  "schema_revision": "e4938027ddf0d2210f019770403efd45d350eac28100902ddd7c5191c9b8cfbe",
  "source_name": "sales",
  "deterministic_scope": "local_registered_source",
  "decision_path": "exact_spec",
  "validated": true,
  "explanation": ["Executed deterministic local plan."]
  // intent_signature, request_id, result_id also present
}
```

Then `queryData` (kind `computation`) runs `finance.npv` with the rate as an arg and the revenue column **bound** — SQAI extracts and hashes the column upstream; the model never ships the array. The full result is the magic reveal — value, three hashes, the determinism envelope, and per-binding provenance:

```json
{
  "status": "ok",
  "kind": "computation",
  "value": 3188.1687606249325,
  "value_type": "float64",
  "truncated": false,
  "invocation_hash": "8223a694250fc751fcf8a7777b8e1f524c44ff1f0e7e83451467f554a6123950",
  "computation_hash": "ff5280ea128113f528dd1e9a28b9bc4a81469075ed7c981c7176fb172d98085d",
  "contract_hash": "sha256:31247fb219e656f349bb6d36fa65c2e2702e2688a2fddb4b16f1a9e09a02cdbb",
  "determinism": {
    "runtime_bundle_version": "0.1.0",
    "runtime_bundle_sha256": "4d64142e4c1ff63d299cfc8b172fdf97cb59169b545e1e02978e678a632ce6e1",
    "platform": "darwin-arm64",
    "architecture": "arm64",
    "kernel_build": "mojo",
    "precision_mode": "float64",
    "thread_count": 1,
    "input_hash": "6963288fc20a77263bf9c3455990a941dbe036440adb1b7efd8e3e59e9ba2ba4"
  },
  "provenance": {
    "bindings": [
      {
        "source_name": "sales",
        "fields": ["revenue"],
        "schema_revision": "e4938027ddf0d2210f019770403efd45d350eac28100902ddd7c5191c9b8cfbe",
        "row_count": 12,
        "input_hash": "2ea5ede72acd2912fe9e1230cef34afad4c9436bfa8a709bac2da02b478e3212"
      }
    ]
  },
  "latency_ms": 0.83,
  "request_id": "sqai_89fc558711314049"
}
```

The final answer and provenance lines:

```text
East had the highest total revenue (2,130.50 across 5 orders), ahead of west
(1,519) and north (1,000). The net present value of the revenue stream at a
10% discount rate is 3,188.17.

[provenance] query plan_hash=578bc850cde6…
[provenance] computation invocation=8223a694250f… computation=ff5280ea1281…
```

Every number the agent stated is anchored to a hash. Re-run the same intent against the same data and the hashes are byte-identical — in TypeScript **and** Python.

{% hint style="info" %}
**One-time setup, then warm.** The query plane is in-process — sub-millisecond to low-ms, no separate service, no key. After the one-time free `sqai login` device enrollment, the compute plane provisions the signed runtime **once** on the first computation (download → verify → extract → spawn, ~110s), then stays resident. There is **no per-query cold start**: the `finance.npv` call above returned in **0.83 ms**. See [Determinism & provenance](determinism.md).
{% endhint %}

## The four tools

<table data-view="cards">
<thead><tr><th></th><th></th><th></th></tr></thead>
<tbody>
<tr><td><strong>listSources</strong></td><td>Discover sources, capability modules, and function signatures.</td><td>Never executes</td></tr>
<tr><td><strong>queryData</strong></td><td>Run one query or computation intent; return governed results + provenance.</td><td>Executes</td></tr>
<tr><td><strong>explainQuery</strong></td><td>Dry-run: resolve or validate an intent without running it.</td><td>Never executes</td></tr>
<tr><td><strong>getResult</strong></td><td>Fetch the full stored result of an earlier <code>queryData</code> call by its <code>result_id</code>.</td><td>Never executes</td></tr>
</tbody>
</table>

### listSources

Discovery. The model calls it before `queryData` so specs use exact names. Input `{ capabilitySearch?, module? }` selects one of three modes:

| Input | Returns |
|---|---|
| _(no args)_ | `{ sources: [{ name, fields:[{ name, type, ops }], row_count, schema_revision }] }` — connected sources with typed fields. |
| `{ capabilitySearch: "net present value" }` | `{ modules: [{ name, category, deterministic, function_count, sample_functions }] }` — up to 10 matching modules, ≤ 5 sample functions each, each with a real one-line summary. |
| `{ module: "finance" }` | `{ functions: [{ name, signature, params:[{ name, type, required }], returns, deterministic, seed_required }] }` — every read-only-eligible function in the module. |

`ops` depends on field type: number fields list aggregations plus all filter operators (`sum, avg, count, min, max, eq, in, gt, gte, lt, lte, is_null, is_not_null`); every other type lists filter operators only (`eq, in, is_null, is_not_null`). Module and function listings include only capabilities that are `ai_sdk` and read-only-eligible — the same surface the contract exposes.

### queryData

The one tool that executes. Input is a **versioned discriminated union** on `kind`:

```jsonc
// Query plane — tabular aggregation / grouping / filtering over a source.
{ "version": "1", "kind": "query",
  "spec": { "metric": "revenue", "aggregation": "sum",
            "group_by": "region", "order": "desc", "source": "sales" } }
```

```jsonc
// Computation plane — math over arrays; bind columns, never paste data inline.
{ "version": "1", "kind": "computation",
  "spec": { "module": "finance", "function": "npv", "args": [0.1],
            "bindings": [{ "parameter": "cashflows",
                           "source": "sales", "field": "revenue" }] } }
```

Query specs accept `metric` (required), `aggregation` (`sum|avg|count|min|max`), `group_by`, `filter` (`{ time_filter?, conditions: [{ column, op, value?, values? }] }`), `limit`, `order`, and `source`. Computation specs accept `module`, `function`, `args`, `kwargs`, `bindings`, and `seed`. Bindings pull source columns into function parameters — SQAI extracts and aligns them upstream; the model never ships raw arrays. See [Compute & filtering](compute-and-filtering.md) for the full `ComputationSpec` and binding forms.

Output is discriminated on `status` **and** `kind`:

| `status` | Shape (key fields) |
|---|---|
| `ok` + `kind:"query"` | `data:{ columns, rows }`, `total_rows`, `returned_rows`, `truncated`, `result_id?`, `plan_hash`, `schema_revision`, `source_name`, `intent_signature`, `deterministic_scope`, `decision_path`, `validated`, `request_id`, `explanation[]`. |
| `ok` + `kind:"computation"` | `value`, `value_type`, `preview?`, `element_count?`, `truncated`, `result_id?`, `invocation_hash`, `computation_hash`, `contract_hash`, `determinism`, `provenance?`, `latency_ms`, `request_id`. |
| `needs_clarification` | `question`, `candidates`, `explanation` — the resolver found the intent ambiguous. |
| `rejected` | `rejection_reason`, `candidates`, `explanation` — the resolver refused the intent. |
| `error` | `code`, `message`, `retryable`, `request_id`, `nearest_matches?` — a structured `SqaiError`, never a throw. |

{% hint style="warning" %}
Tools **never throw**. In application code that inspects tool output, branch on `output.status === "error"` and read `output.code` (e.g. `unsupported_operation`, `seed_required`, `policy_denied_function`). `retryable` marks transient failures (`network_error`, `timeout`, `rate_limited`, `service_unavailable`). See [Troubleshooting](troubleshooting.md).
{% endhint %}

### explainQuery

Same input as `queryData`, but it **never executes** — a dry run for the model to debug clarifications and rejections, and for you to preview a plan.

- **Query:** `{ status:"ok", kind:"query", resolved_plan, plan[], plan_hash, confidence, validated }` — resolve + verify, no execution.
- **Computation:** `{ status:"ok", kind:"computation", matched_signature, invocation_hash, seed_required }` — confirms the capability exists and returns its signature.

{% hint style="warning" %}
The computation `invocation_hash` from `explainQuery` is a **preview**, computed over *unresolved* bindings (`input_hash` empty). It will **not** equal the `invocation_hash` from an executed `queryData` call, which hashes the extracted column data. Use it to confirm the shape of the intent, not as a replay key.
{% endhint %}

### getResult

Retrieval. When `queryData` returns `truncated: true`, the model preview is capped but the full result was stored — `getResult` fetches it by the `result_id` from the `queryData` output. Input is exactly `{ result_id }`; output is `{ status:"ok", result_id, source_ids, created_at, expires_at, byte_size, value }`, where `value` is the complete stored result (every row/element, not the preview).

The store is in-memory and short-lived: 15-minute default TTL, evicted oldest-first under memory pressure, and only results within `maxOutputBytes` (10 MB default) are stored at all. An unknown, expired, or evicted `result_id` returns a structured `result_not_found` error — re-run the original `queryData` request to regenerate. Read-only and idempotent.

## Model-context limits

`sqai.tools(options?)` bounds what reaches the model separately from what the runtime executes. Defaults:

```ts
sqai.tools({
  source: undefined,          // pin a default source; spec.source still wins
  defaultLimit: 100,          // rows when spec omits limit
  maxExecutionRows: 1000,     // hard cap the runtime executes
  maxRowsToModel: 25,         // rows the model sees
  maxCellsToModel: 250,       // cell budget (whole rows dropped to fit)
  maxElementsToModel: 500,    // array/vector/matrix elements previewed
  maxBytesToModel: 32_000,    // byte budget for the model-visible value
  maxOutputBytes: 10_000_000, // storage cap for a retrievable result_id
});
```

Truncation is always declared, never silent. Query results truncate rows-first, then drop whole rows until the cell budget fits — **a partial row is never shown** (`truncated: true`, `returned_rows < total_rows`). Computation arrays return a `preview` plus the full `element_count`, halved until the byte budget fits; oversized objects return `value: null, truncated: true`. The full result stays retrievable — the model fetches it with the `getResult` tool, application code reads it straight off the client:

```ts
const full = await sqai.client.getResult(result_id);
```

{% hint style="info" %}
A `result_id` is present only when the full value fits within `maxOutputBytes`; larger results are shaped for the model but not stored. Result ids are random, TTL-bounded, and tenant-authorized — a wrong-tenant lookup reads as `result_not_found`. See [How it works](concepts.md).
{% endhint %}

## Policy is unreachable from the model

Governance is code-only. `allowedSources`, `allowedFields`, and `allowedFunctions` are set in `createSQAI()` config; **no tool input schema contains a policy field**, so the model cannot widen its reach. It authors intent within three layers of narrowing — packaged read-only surface ⊇ your application policy ⊇ one model request — and every request can only narrow.

```ts
const sqai = createSQAI({
  sources: [{ data: "./data/sales.csv", name: "sales" }],
  policy: {
    allowedSources: ["sales"],
    allowedFields: { sales: ["region", "revenue", "cost"] },
    allowedFunctions: ["finance.npv", "stats.compute_mean"],
  },
});
```

A denied source, field, or function returns a structured `policy_denied_source` / `policy_denied_field` / `policy_denied_function` error to the model. See [Policy & governance](policy.md).

## Registry

`@thyn-ai/sqai-ai-sdk` is listed in the Vercel AI SDK community tools registry alongside the `ai` and `zod` peers.

## Next steps

- [Compute & filtering](compute-and-filtering.md) — the full `ComputationSpec`, binding forms, and runtime module filtering.
- [Determinism & provenance](determinism.md) — what the three hashes cover and the cross-language replay guarantee.
- [Policy & governance](policy.md) — allow-lists the model can never widen.
- [Troubleshooting](troubleshooting.md) — every error `code` and what to do about it.
