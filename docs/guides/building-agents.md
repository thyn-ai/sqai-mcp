---
icon: robot
description: Build a real agent on SQAI end to end — the discover → plan → execute loop, a system prompt that uses the tools well, streaming, clarifications, provenance capture, policy, and a Next.js route handler.
---

# Building agents with the AI SDK

[AI SDK Tools](../ai-sdk-tools.md) is the reference for the three tools. This is the build guide: how to turn `@thyn-ai/sqai-ai-sdk` into an agent that answers questions about your structured data **and shows its work** — every number anchored to a replayable hash, every reach bounded by code the model can never widen.

An SQAI agent is a normal [Vercel AI SDK](https://ai-sdk.dev) loop with one difference: the model does not write SQL or emit numbers from its own head. It authors typed intent — a `QuerySpec` or a `ComputationSpec` — SQAI validates that intent against the hash-pinned capability contract and your application policy, the SQAI runtime executes it, and the answer returns with provenance. The model reaches a **read-only** surface of **5,790 exposed capabilities** (5,780 deterministic plus 10 seed-required simulations) plus your connected sources, and nothing else.

{% hint style="info" %}
Keep every SQAI import **server-side**. On Next.js set `export const runtime = "nodejs"` (the Node runtime, not Edge). New here? Walk the [TypeScript Quickstart](../quickstart-ts.md) first — this guide assumes you can already `createSQAI`, `connect`, `ask`, and `compute`.
{% endhint %}

## What you're building

The agent gets three tools from `sqai.tools()` and does the rest itself:

<table data-view="cards">
<thead><tr><th></th><th></th><th></th></tr></thead>
<tbody>
<tr><td><strong>listSources</strong></td><td>Discover sources, capability modules, and function signatures.</td><td>Never executes</td></tr>
<tr><td><strong>queryData</strong></td><td>Run one query or computation intent; return governed results + provenance.</td><td>Executes</td></tr>
<tr><td><strong>explainQuery</strong></td><td>Dry-run: resolve or validate an intent without running it.</td><td>Never executes</td></tr>
</tbody>
</table>

Three properties do the heavy lifting, and every pattern below leans on them:

- **Tools never throw.** Ambiguity, rejection, and failure come back as typed statuses (`needs_clarification`, `rejected`, `error`) the model can react to inside the loop — not exceptions that abort the run.
- **Policy is unreachable from tool input.** No tool schema contains a policy field, so the model can only *narrow* what you enabled in code, never widen it.
- **Every `ok` result is replayable.** Queries carry a `plan_hash`; computations carry an `invocation_hash` and a `computation_hash`, byte-identical across TypeScript and Python.

## Before you start

Install the toolkit and its peers, and create the sample source used throughout.

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
{% tab title="bun" icon="terminal" %}
```bash
bun add ai zod @thyn-ai/sqai-ai-sdk
```
{% endtab %}
{% endtabs %}

Peers are **`ai ^7.0.0`** and **`zod ^4.0.0`**, both required; Node ≥ 20. `@thyn-ai/sqai-ai-sdk` re-exports `SQAI`, `SqaiError`, and the core types, so you rarely import `@thyn-ai/sqai` too. The query plane is in-process and needs no key; local compute needs the one-time free `sqai login` (RFC 8628 device flow — licensing only, no data leaves), or an `SQAI_API_KEY` forwarded to a private SQAI deployment.

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

## A working agent in one file

Create the toolkit once at module scope, hand `sqai.tools()` to `generateText`, and bound the loop with `stopWhen`. This is the whole thing.

{% code title="agent.ts" lineNumbers="true" %}
```ts
import { generateText, isStepCount } from "ai";
import { createSQAI } from "@thyn-ai/sqai-ai-sdk";

// Create once; reuse across requests. Sources connect lazily on first tool call.
const sqai = createSQAI({
  sources: [{ data: "./data/sales.csv", name: "sales" }],
});

const { text, steps } = await generateText({
  model: "openai/gpt-5-mini", // any AI SDK model; gateway id shown, illustrative
  tools: sqai.tools(),
  stopWhen: isStepCount(12),
  system:
    "You answer questions about connected data. Always call listSources for " +
    "exact field names before queryData. Never invent numbers — every figure " +
    "must come from a tool result. Bind source columns into computations; " +
    "never paste arrays inline.",
  prompt:
    "Which region had the highest total revenue? Also give the net present " +
    "value of the revenue stream at a 10% discount rate (finance.npv).",
});

console.log(`\n${text}\n`);
```
{% endcode %}

`createSQAI(config?)` returns an `SQAIToolkit`: an `SQAI` client (`sqai.client`), declarative `sources`, a `ready` promise, and `connectionError`. Config is the normal `SqaiConfig` — `mode`, `apiKey`, `deploymentUrl`, `policy`, `tenantId`, `runtimeModules`, `timeout` — with one extra key, `sources`. Each source is a path string, an array of records, or `{ data, name? }`; they connect **lazily** on the first tool call. A failed connect is captured, not thrown — it surfaces as a structured `source_connection_failed` result on every tool call and is readable at `sqai.connectionError`.

{% hint style="warning" %}
`stopWhen: isStepCount(n)` bounds how many tool-call rounds the model may take. A real answer usually needs several — `listSources` for exact names, then `queryData`, sometimes `explainQuery` to debug a clarification. Set it high enough to finish (e.g. `12`); too low and the model runs out of rounds mid-plan and hallucinates a closing sentence.
{% endhint %}

## The loop the model runs

Left alone with the three tools, a capable model converges on the same shape every time. Understanding it is how you write a prompt that steers it and a `stopWhen` that fits.

{% stepper %}
{% step %}
#### Discover the surface

The model calls `listSources` first so its specs use exact names. Three modes, selected by input:

| Input | Returns |
|---|---|
| _(no args)_ | `{ sources: [{ name, fields:[{ name, type, ops }], row_count, schema_revision }] }` — connected sources with typed fields. |
| `{ capabilitySearch: "net present value" }` | `{ modules: [...] }` — up to 10 matching modules, ≤ 5 sample functions each, each with a real one-line summary. |
| `{ module: "finance" }` | `{ functions: [{ name, signature, params, returns, deterministic, seed_required }] }` — every read-only-eligible function in the module. |

`ops` is type-aware: number fields list aggregations plus filter operators (`sum, avg, count, min, max, eq, in, gt, gte, lt, lte, is_null, is_not_null`); other types list filter operators only. So the model learns it may `sum` `revenue` but only `eq`/`in` on `region` — before it ever writes a spec.
{% endstep %}
{% step %}
#### (Optional) dry-run with explainQuery

`explainQuery` takes the same input as `queryData` but **never executes**. The model uses it to confirm a plan resolves before committing, and to recover from a clarification or rejection. A query dry-run returns `{ resolved_plan, plan[], plan_hash, confidence, validated }`; a computation dry-run returns `{ matched_signature, invocation_hash, seed_required }`, confirming the capability exists and showing its signature.
{% endstep %}
{% step %}
#### Execute with queryData

The one tool that executes. Input is a **versioned discriminated union** on `kind`:

```jsonc
// Query plane — aggregation / grouping / filtering over a source.
{ "version": "1", "kind": "query",
  "spec": { "metric": "revenue", "aggregation": "sum",
            "group_by": "region", "order": "desc", "source": "sales" } }
```

```jsonc
// Compute plane — math over arrays; bind columns, never paste data inline.
{ "version": "1", "kind": "computation",
  "spec": { "module": "finance", "function": "npv", "args": [0.1],
            "bindings": [{ "parameter": "cashflows",
                           "source": "sales", "field": "revenue" }] } }
```

The result is discriminated on `status` **and** `kind`. A `query` returns `data:{ columns, rows }` plus `plan_hash`; a `computation` returns `value`, `value_type`, `invocation_hash`, `computation_hash`, `contract_hash`, the `determinism` envelope, and `provenance`. See [AI SDK Tools](../ai-sdk-tools.md#querydata) for the full field lists.
{% endstep %}
{% endstepper %}

For the sample prompt the model runs `listSources` → `queryData` (a grouped `sum`, `kind:"query"`) → `queryData` (`finance.npv` with `revenue` **bound**, `kind:"computation"`). SQAI extracts and hashes the column upstream; the model never ships the array. It then writes a sentence anchored to both hashes.

{% hint style="info" %}
The `invocation_hash` from `explainQuery` is a **preview** — computed over *unresolved* bindings, so its `input_hash` is empty. It will **not** equal the `invocation_hash` from an executed `queryData` call, which hashes the extracted column. Use it to confirm shape, not as a replay key.
{% endhint %}

## A system prompt that uses the tools well

The tools are safe no matter what the model does — but a few lines of guidance turn a hesitant agent into a decisive one and cut wasted rounds. Everything here is enforcement-backed advice: if the model ignores it, it gets a typed error, not a wrong answer.

```text
You answer questions about the user's connected structured data.

Discovery
- Call listSources (no args) before your first queryData so specs use exact
  field names and legal operators (the `ops` list per field).
- To find a calculation, call listSources with { capabilitySearch: "..." },
  then { module: "<name>" } to read the exact signature and parameter names.

Execution
- Use queryData for aggregations, grouping, and filtering over a source.
- For math over columns, bind them: bindings:[{ parameter, source, field }].
  Never paste arrays inline — bound columns are hashed upstream for provenance.
- If queryData returns needs_clarification, read `question` and `candidates`
  and retry with a disambiguated spec. If it returns rejected, read
  `rejection_reason` and choose a different, supported approach.

Answering
- Every number in your answer must come from a tool result. Never estimate.
- State the figure and, when useful, that it is replayable by its hash.
```

Three habits matter most, and each maps to a guarantee:

- **Discover before executing.** `listSources` gives exact names and per-field `ops`, so the model writes a spec that resolves on the first try instead of guessing a column and eating a clarification round.
- **Bind, don't paste.** Bindings pull columns through SQAI's upstream extraction primitive and record lineage in `provenance.bindings`; an inline array has no provenance and defeats the point.
- **React to statuses.** `needs_clarification` and `rejected` are conversational turns, not dead ends — the model can retry within the same `stopWhen` budget.

## Stream the answer

Swap `generateText` for `streamText` to render tokens as they arrive. `steps` and the provenance inside them are still available once the stream settles, and `onStepFinish` lets you capture provenance the moment each tool round completes.

{% code title="stream.ts" lineNumbers="true" %}
```ts
import { streamText, isStepCount } from "ai";
import { createSQAI } from "@thyn-ai/sqai-ai-sdk";

const sqai = createSQAI({ sources: [{ data: "./data/sales.csv", name: "sales" }] });

const result = streamText({
  model: "openai/gpt-5-mini",
  tools: sqai.tools(),
  stopWhen: isStepCount(12),
  prompt: "Total revenue by region, and the NPV of the revenue stream at 10%.",
  onStepFinish({ toolResults }) {
    for (const tr of toolResults ?? []) {
      const out = (tr as { output?: Record<string, unknown> }).output;
      if (out?.status === "ok" && out.kind === "computation") {
        console.error(`[hash] ${String(out.computation_hash).slice(0, 12)}…`);
      }
    }
  },
});

for await (const delta of result.textStream) process.stdout.write(delta);

const steps = await result.steps; // full provenance, after the stream settles
```
{% endcode %}

## Handle clarifications and rejections

Because tools never throw, the interesting branches are *statuses*, not `try/catch`. The model handles most in-loop; your application code inspects `steps` when you need to react programmatically (log, retry with a wider policy, ask the human).

```ts
for (const step of steps) {
  for (const tr of step.toolResults ?? []) {
    const out = (tr as { output?: Record<string, unknown> }).output;
    switch (out?.status) {
      case "needs_clarification":
        // resolver found the intent ambiguous
        console.log("clarify:", out.question, out.candidates);
        break;
      case "rejected":
        // resolver refused the intent
        console.log("rejected:", out.rejection_reason);
        break;
      case "error":
        // structured SqaiError — never a throw
        console.log("error:", out.code, out.message, "retryable:", out.retryable);
        break;
    }
  }
}
```

Branch on `out.code` for errors. `retryable` marks transient failures (`network_error`, `timeout`, `rate_limited`, `service_unavailable`) worth a backoff; the rest are deterministic and won't change on retry — a governance denial (`policy_denied_source`, `policy_denied_field`, `policy_denied_function`), a missing capability (`unsupported_operation`, which carries `nearest_matches`), or a missing seed (`seed_required`). See [Troubleshooting](../troubleshooting.md) for every code.

{% hint style="warning" %}
Simulations (`category: "simulation"`, 10 of them) require a `seed` — omit it and `queryData` returns a `seed_required` error, never a throw. Passing a `seed` in the computation spec makes every simulation replayable by construction.
{% endhint %}

## Capture provenance for every answer

The point of an SQAI agent is that its answer is auditable. Every `ok` result is replayable, so collect the hashes into a record you store next to the answer. Re-run the same intent against the same data and the hashes are byte-identical — in TypeScript **and** Python.

```ts
type Provenance =
  | { kind: "query"; plan_hash: string; source_name: string }
  | { kind: "computation"; invocation_hash: string; computation_hash: string;
      contract_hash: string };

function collectProvenance(steps: Awaited<ReturnType<typeof generateText>>["steps"]) {
  const trail: Provenance[] = [];
  for (const step of steps) {
    for (const tr of step.toolResults ?? []) {
      const out = (tr as { output?: Record<string, any> }).output;
      if (out?.status !== "ok") continue;
      if (out.kind === "query") {
        trail.push({ kind: "query", plan_hash: out.plan_hash, source_name: out.source_name });
      } else if (out.kind === "computation") {
        trail.push({
          kind: "computation",
          invocation_hash: out.invocation_hash,
          computation_hash: out.computation_hash,
          contract_hash: out.contract_hash,
        });
      }
    }
  }
  return trail;
}
```

A single `finance.npv` computation like the one in the [Quickstart](../quickstart-ts.md#compute-a-value-compute-plane) — `finance.npv(0.1, [-1000, 300, 420, 560, 680])` — returns `value` `505.020148896933` with `invocation_hash` `b3ca3e92…` and `computation_hash` `b74f67d0…` against `contract_hash` `sha256:31247fb2…`. Store that alongside the model's sentence and the answer is no longer "the model said so" — it is a claim you can re-execute. What each hash covers and the cross-language replay guarantee are in [Determinism & provenance](../determinism.md).

{% hint style="info" %}
When a computation returns a large array, the model sees a truncated `preview` plus the full `element_count`; the complete value stays retrievable in application code by `result_id`: `const full = await sqai.client.getResult(result_id);`. A `result_id` is present only when the value fits `maxOutputBytes`; ids are random, TTL-bounded, and tenant-authorized.
{% endhint %}

## Layer policy so the agent can only narrow

Governance is code-only. `allowedSources`, `allowedFields`, and `allowedFunctions` are set in `createSQAI()` and appear in **no** tool input schema, so the model cannot widen its reach. It authors intent inside three layers of narrowing — packaged read-only surface ⊇ your application policy ⊇ one model request — and every request can only tighten.

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

A denied source, field, or function returns a structured `policy_denied_source` / `policy_denied_field` / `policy_denied_function` error to the model — it sees the boundary and can rephrase within it, but cannot cross it. Set policy from the request's identity (per-tenant, per-role) and the *same* agent code serves every user with a different, unforgeable reach. See [Policy & governance](../policy.md).

## Keep the model's context small

`sqai.tools(options?)` bounds what reaches the model separately from what the runtime executes — so a query can scan thousands of rows while the model sees only a summary. Defaults:

```ts
sqai.tools({
  source: undefined,          // pin a default source; spec.source still wins
  defaultLimit: 100,          // rows when spec omits limit (part of plan_hash)
  maxExecutionRows: 1000,     // hard cap the runtime executes
  maxRowsToModel: 25,         // rows the model sees
  maxCellsToModel: 250,       // cell budget (whole rows dropped to fit)
  maxElementsToModel: 500,    // array/vector/matrix elements previewed
  maxBytesToModel: 32_000,    // byte budget for the model-visible value
  maxOutputBytes: 10_000_000, // storage cap for a retrievable result_id
});
```

Truncation is always declared, never silent: query results drop whole rows until the budget fits (`truncated: true`, `returned_rows < total_rows` — a partial row is never shown); computation arrays return a `preview` plus the true `element_count`. Because `defaultLimit` becomes part of the resolved plan, it is folded into `plan_hash` — two agents with different limits produce different, honestly distinct hashes.

## Deploy in a Next.js route handler

Create the toolkit at module scope so sources and the compute runtime are reused across requests, force the Node runtime, and give the first request room to provision.

{% code title="app/api/chat/route.ts" lineNumbers="true" %}
```ts
import { streamText, isStepCount } from "ai";
import { createSQAI } from "@thyn-ai/sqai-ai-sdk";

export const runtime = "nodejs"; // never Edge — SQAI runs server-side
export const maxDuration = 300;  // room for the one-time runtime provision (~110s)

const sqai = createSQAI({ sources: [{ data: "./data/sales.csv", name: "sales" }] });

export async function POST(req: Request) {
  const { prompt } = await req.json();
  const result = streamText({
    model: "openai/gpt-5-mini",
    tools: sqai.tools(),
    stopWhen: isStepCount(12),
    prompt,
  });
  return result.toUIMessageStreamResponse();
}
```
{% endcode %}

{% hint style="info" %}
**One-time setup, then warm.** The query plane is in-process — sub-millisecond, no service, no key. After the free `sqai login`, the compute plane provisions the signed on-device runtime **once** on the first computation (download → verify RS256 + sha256 → extract → spawn, ~110s), then stays resident: no per-query cold start. On short-lived serverless functions, set **`SQAI_DEPLOYMENT_URL`** so compute dispatches to a private SQAI deployment you run instead of provisioning a runtime per invocation. There is no SQAI cloud — `local` runs on your machine, `deployment` points at your own SQAI deployment.
{% endhint %}

## Test the agent deterministically

The model is nondeterministic; SQAI's execution is not. So test the two layers separately. Assert on the model's *behaviour* loosely (did it call a tool, did it stay in budget) and on SQAI's *output* exactly — pin the hashes. Drive the SQAI layer directly through `sqai.client`, no model in the loop, and the assertion is byte-stable across runs, machines of the same platform, and both SDKs.

```ts
import { createSQAI } from "@thyn-ai/sqai-ai-sdk";

const sqai = createSQAI({ sources: [{ data: "./data/sales.csv", name: "sales" }] });

const r = await sqai.client.compute({
  module: "finance",
  function: "npv",
  args: [0.1, [-1000, 300, 420, 560, 680]],
});

// Deterministic: identical every run, in TS and Python.
expect(r.value).toBe(505.020148896933);
expect(r.computation_hash).toBe(
  "b74f67d0d7a594aa7ac91f6291612452aa8ccdf603351ebc8d801a6fddd91bc8",
);
```

You can also freeze a plan without executing: `explainQuery` (or `sqai.client.verify`) returns a `plan_hash` you can snapshot in tests, so a change to the resolved plan fails loudly instead of silently returning different numbers. Discover more capabilities to test with `sqai.client.searchCapabilities(query, limit = 10)` — real modules like `finance` (`finance.irr`, `finance.cagr`, `finance.max_drawdown`) and `stats` (`stats.compute_mean`, `stats.compute_variance`) each carry a one-line summary.

## Building agents in Python

The three governed tools ship in the **TypeScript** package — the Vercel AI SDK is JavaScript-only. In Python, build the same governed agent by wiring the core `sqai` client into your framework's tool definitions: expose thin functions that call `ask` and `compute` and return the plain `dict` result (hashes included). The client enforces the identical contract, policy, and determinism — the hashes are byte-identical to TypeScript.

{% tabs %}
{% tab title="Python" icon="python" %}
```python
from sqai import create_sqai

sqai = create_sqai()  # local mode inferred; snake_case, dict results
sqai.connect("./data/sales.csv", name="sales")

def query_data(spec: dict) -> dict:
    """Aggregate/group/filter a source. Returns rows + plan_hash."""
    return sqai.ask(spec)

def compute(spec: dict) -> dict:
    """Run a read-only capability. Returns value + invocation/computation hash."""
    return sqai.compute(spec)

# Register query_data + compute as tools in your Python agent framework, then:
out = query_data({"metric": "revenue", "aggregation": "sum",
                  "group_by": "region", "order": "desc", "source_name": "sales"})
res = compute({"module": "finance", "function": "npv",
               "args": [0.1, [-1000, 300, 420, 560, 680]]})
res["value"]            # 505.020148896933
res["computation_hash"] # b74f67d0d7a594aa7ac91f6291612452aa8ccdf603351ebc8d801a6fddd91bc8
```
{% endtab %}
{% tab title="TypeScript" icon="js" %}
```ts
// The TS equivalent is sqai.tools() — three ready-made, never-throwing tools.
import { createSQAI } from "@thyn-ai/sqai-ai-sdk";
const sqai = createSQAI({ sources: [{ data: "./data/sales.csv", name: "sales" }] });
const tools = sqai.tools(); // { listSources, queryData, explainQuery }
```
{% endtab %}
{% endtabs %}

Set `policy` on `create_sqai(...)` exactly as in TypeScript (`allowed_sources`, `allowed_fields`, `allowed_functions`) and the same narrowing applies — governance stays in code, unreachable from whatever the model emits. See the [Python Quickstart](../quickstart-python.md).

## Next steps

<table data-view="cards">
<thead><tr><th></th><th></th><th data-hidden data-card-target data-type="content-ref"></th></tr></thead>
<tbody>
<tr><td><strong>AI SDK Tools</strong></td><td>The full reference for listSources, queryData, and explainQuery.</td><td><a href="../ai-sdk-tools.md">ai-sdk-tools.md</a></td></tr>
<tr><td><strong>Compute &#38; filtering</strong></td><td>The full <code>ComputationSpec</code>, binding forms, and runtime module filtering.</td><td><a href="../compute-and-filtering.md">compute-and-filtering.md</a></td></tr>
<tr><td><strong>Policy &#38; governance</strong></td><td>Allow-lists the model can never widen, enforced in code.</td><td><a href="../policy.md">policy.md</a></td></tr>
<tr><td><strong>Determinism &#38; provenance</strong></td><td>What the three hashes cover and the cross-language replay guarantee.</td><td><a href="../determinism.md">determinism.md</a></td></tr>
<tr><td><strong>Troubleshooting</strong></td><td>Every error <code>code</code> and what to do about it.</td><td><a href="../troubleshooting.md">troubleshooting.md</a></td></tr>
</tbody>
</table>
