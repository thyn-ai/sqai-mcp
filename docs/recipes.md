---
icon: book-open
description: Task-first snippets for SQAI — query a source, compute a hashed value, bind columns, discover capabilities, capture provenance, govern reach, and wire an agent. TypeScript and Python, byte-identical.
---

# Recipes

Copy-paste solutions for the things you actually do with SQAI — **Structured Query AI** — the governed, read-only, deterministic structured-data tool for AI agents. Every recipe uses the real SDK surface (`createSQAI` / `SQAI`, `ask`, `compute`, `searchCapabilities`, `connect`) and real capabilities from the hash-pinned contract. Each one runs on your machine: the query plane in-process, the compute plane on the signed on-device runtime after a one-time free `sqai login`. No cloud, no `eval`, no write path — and every value comes back with the hashes that reproduce it.

TypeScript is camelCase and returns objects; Python is snake_case and returns plain `dict`s. The plans and hashes are **byte-identical** across both. New to any of this? Start with the [TypeScript Quickstart](quickstart-ts.md) or [Python Quickstart](quickstart-python.md), then come back here.

{% hint style="info" %}
The single verified numeric example carried through these docs is `finance.npv(0.1, [-1000, 300, 420, 560, 680]) = 505.020148896933` (`invocation_hash` `b3ca3e92…`, `computation_hash` `b74f67d0…`, contract `sha256:31247fb2…`). Where a recipe uses another capability, it shows the **call** and describes what it returns — run it locally for your own hashed value.
{% endhint %}

## Before you start

Most recipes reuse one CSV. Create it once and connect it as `sales`.

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

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
import { createSQAI } from "@thyn-ai/sqai";

const sqai = createSQAI();                              // local mode inferred
const sales = await sqai.connect("./data/sales.csv", { name: "sales" });
// sales.schema_revision is pinned into every plan_hash and binding below.
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
from sqai import SQAI

sqai = SQAI()                                           # local mode inferred
sales = sqai.connect("./data/sales.csv", name="sales")
# sales["schema_revision"] is pinned into every plan_hash and binding below.
```
{% endtab %}
{% endtabs %}

A source is immutable once connected: re-connecting the same name with changed data raises `source_already_registered`, and any stored plan replayed against changed data surfaces `schema_revision_mismatch` instead of silently returning different numbers.

## Query the query plane

`ask(spec)` resolves a typed `QuerySpec` and, if unambiguous, executes it in-process — returning exactly one of `ok`, `needs_clarification`, or `rejected`. It never guesses. Every `ok` carries a `plan_hash`: same plan ⇒ same hash ⇒ same rows.

### Aggregate and group

Sum a metric by a dimension, largest first.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const outcome = await sqai.ask({
  metric: "revenue",
  aggregation: "sum",          // sum | avg | count | min | max
  group_by: "region",
  order: "desc",
  source_name: "sales",
});

if (outcome.status === "ok") {
  console.log(outcome.data.result);     // rows in deterministic order
  console.log(outcome.data.plan_hash);  // replay key
}
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
outcome = sqai.ask({
    "metric": "revenue",
    "aggregation": "sum",        # sum | avg | count | min | max
    "group_by": "region",
    "order": "desc",
    "source_name": "sales",
})

if outcome["status"] == "ok":
    print(outcome["data"].result)     # rows in deterministic order
    print(outcome["data"].plan_hash)  # replay key
```
{% endtab %}
{% endtabs %}

Returns revenue summed per region, `east` first — the exact rows and `plan_hash` shown in the [Quickstart](quickstart-ts.md).

### Filter before aggregating

Narrow rows with `filter.conditions` — each condition is `{ column, op, value? , values? }`. Numeric ops are `eq, in, gt, gte, lt, lte, is_null, is_not_null`; other types filter with `eq, in, is_null, is_not_null`.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const outcome = await sqai.ask({
  metric: "revenue",
  aggregation: "avg",
  group_by: "product",
  filter: {
    conditions: [
      { column: "region", op: "in", values: ["east", "west"] },
      { column: "units", op: "gte", value: 10 },
    ],
  },
  source_name: "sales",
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
outcome = sqai.ask({
    "metric": "revenue",
    "aggregation": "avg",
    "group_by": "product",
    "filter": {
        "conditions": [
            {"column": "region", "op": "in", "values": ["east", "west"]},
            {"column": "units", "op": "gte", "value": 10},
        ],
    },
    "source_name": "sales",
})
```
{% endtab %}
{% endtabs %}

Returns average revenue per product across the east/west rows with at least 10 units. The `conditions` are folded into the resolved plan, so they are part of the `plan_hash`.

### Take the top N

Add `limit` to cap returned rows after ordering. The limit is part of the resolved plan.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const outcome = await sqai.ask({
  metric: "revenue",
  aggregation: "sum",
  group_by: "product",
  order: "desc",
  limit: 2,               // top 2 products by revenue
  source_name: "sales",
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
outcome = sqai.ask({
    "metric": "revenue",
    "aggregation": "sum",
    "group_by": "product",
    "order": "desc",
    "limit": 2,             # top 2 products by revenue
    "source_name": "sales",
})
```
{% endtab %}
{% endtabs %}

### Inspect a plan without running it

Need the resolved plan or a dry check? `resolve(spec)` returns the plan, `verify(plan)` validates it, and `queryWithMetadata(plan)` runs it with the full envelope — all pass SQAI responses through verbatim.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const resolved = await sqai.resolve({
  metric: "revenue", aggregation: "sum", group_by: "region", source_name: "sales",
});
const check = await sqai.verify(resolved.plan);   // validate, no execution
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
resolved = sqai.resolve({
    "metric": "revenue", "aggregation": "sum", "group_by": "region", "source_name": "sales",
})
check = sqai.verify(resolved["plan"])             # validate, no execution
```
{% endtab %}
{% endtabs %}

## Compute deterministic values

`compute(spec)` dispatches one capability to the on-device runtime and returns the value plus `invocation_hash`, `computation_hash`, `contract_hash`, and a determinism envelope. SQAI validates the intent against the pinned contract and dispatches — it never calculates anything itself.

### Call a capability with literal args

The canonical example — net present value of a cashflow stream.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const r = await sqai.compute({
  module: "finance",
  function: "npv",                          // (rate: float64, cashflows: float64[]) -> float64
  args: [0.1, [-1000, 300, 420, 560, 680]],
});
r.value;             // 505.020148896933
r.computation_hash;  // b74f67d0d7a594aa7ac91f6291612452aa8ccdf603351ebc8d801a6fddd91bc8
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
r = sqai.compute(
    module="finance",
    function="npv",                          # (rate: float64, cashflows: float64[]) -> float64
    args=[0.1, [-1000, 300, 420, 560, 680]],
)
r["value"]            # 505.020148896933
r["computation_hash"] # b74f67d0d7a594aa7ac91f6291612452aa8ccdf603351ebc8d801a6fddd91bc8
```
{% endtab %}
{% endtabs %}

Swap in any of the **5,790 exposed read-only capabilities**: `finance.irr` (internal rate of return via Newton's method), `finance.cagr` (compound annual growth rate), `option_pricing.black_scholes_call` (European call price), `stat_tests.pearson_r` (correlation coefficient and p-value), `number_theory.gcd`, or `information_theory.entropy` (Shannon entropy, `-Σ p*log2(p)`). Each takes typed args and returns a value with the same three hashes.

### Run a seed-required simulation

Ten capabilities have `category: "simulation"` — a Monte Carlo sampler such as `bayesian.bayesian_ab_test` (P(B > A) from Beta posteriors). Omit `seed` and `compute()` fails `seed_required`; pass one (int or string) and the run is replayable by construction.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const r = await sqai.compute({
  module: "bayesian",
  function: "bayesian_ab_test",
  args: [/* successes_a, trials_a, successes_b, trials_b, … per its signature */],
  seed: 42,                                   // required for simulations
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
r = sqai.compute(
    module="bayesian",
    function="bayesian_ab_test",
    args=[...],                                 # per its signature
    seed=42,                                    # required for simulations
)
```
{% endtab %}
{% endtabs %}

The seed is folded into the `invocation_hash`, so the same seed always yields the same `computation_hash`. See [Compute & filtering](compute-and-filtering.md).

## Compute over connected data

Bind a source column to a parameter instead of pasting an array. SQAI pulls the aligned column through the upstream extraction primitive, dispatches, and records `provenance.bindings` — the source, fields, `schema_revision`, `row_count`, and a per-binding `input_hash`. The raw array never leaves the source.

### Bind one column

`finance.npv` over the `revenue` column, rate left literal.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const r = await sqai.compute({
  module: "finance",
  function: "npv",
  args: [0.1],                                                // rate stays literal
  bindings: [{ parameter: "cashflows", source: "sales", field: "revenue" }],
});
r.value;                        // 3188.1687606249325
r.provenance.bindings[0];       // { source_name:"sales", fields:["revenue"], row_count:12, input_hash:… }
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
r = sqai.compute(
    module="finance",
    function="npv",
    args=[0.1],                                                # rate stays literal
    bindings=[{"parameter": "cashflows", "source": "sales", "field": "revenue"}],
)
r["value"]                       # 3188.1687606249325
r["provenance"]["bindings"][0]   # {"source_name":"sales","fields":["revenue"],"row_count":12,"input_hash":…}
```
{% endtab %}
{% endtabs %}

### Bind several aligned columns

A multi-argument signature takes `{ parameters, fields, alignment: "rowwise" }` — the columns are zipped upstream, in order, and hashed together. For `risk.beta` (`cov(asset, market) / var(market)`) over a returns table:

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const returns = await sqai.connect("./data/returns.csv", { name: "returns" });

const r = await sqai.compute({
  module: "risk",
  function: "beta",
  bindings: [{
    source: "returns",
    parameters: ["asset", "market"],
    fields: ["asset_return", "market_return"],
    alignment: "rowwise",
  }],
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
returns = sqai.connect("./data/returns.csv", name="returns")

r = sqai.compute(
    module="risk",
    function="beta",
    bindings=[{
        "source": "returns",
        "parameters": ["asset", "market"],
        "fields": ["asset_return", "market_return"],
        "alignment": "rowwise",
    }],
)
```
{% endtab %}
{% endtabs %}

The parameter names (`asset`, `market`) must match the function signature — list them with `listSources({ module })` in the AI SDK, or read the signature returned by `searchCapabilities`.

### Query one plane, compute the other

A common shape: aggregate on the query plane to understand the data, then feed a column into the compute plane for a hashed metric. Here — group revenue by region, then take the NPV of the revenue stream.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const byRegion = await sqai.ask({
  metric: "revenue", aggregation: "sum", group_by: "region",
  order: "desc", source_name: "sales",
});                                             // query plane → plan_hash

const npv = await sqai.compute({
  module: "finance", function: "npv", args: [0.1],
  bindings: [{ parameter: "cashflows", source: "sales", field: "revenue" }],
});                                             // compute plane → value 3188.1687606249325
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
by_region = sqai.ask({
    "metric": "revenue", "aggregation": "sum", "group_by": "region",
    "order": "desc", "source_name": "sales",
})                                              # query plane → plan_hash

npv = sqai.compute(
    module="finance", function="npv", args=[0.1],
    bindings=[{"parameter": "cashflows", "source": "sales", "field": "revenue"}],
)                                               # compute plane → value 3188.1687606249325
```
{% endtab %}
{% endtabs %}

The query answer carries a `plan_hash`; the computation carries `invocation_hash` + `computation_hash` + `provenance`. Both are anchored to the same `schema_revision`, so the whole answer is reproducible.

## Discover the right capability

`searchCapabilities(query, limit = 10)` ranks the exposed contract by token overlap over name, category, and summary — in-process, no runtime, no key. It returns `[{ entry, score }]`; every `entry` carries a real one-line `summary`. Search first, then compute.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
sqai.searchCapabilities("black scholes option", 5)
  .map((m) => `${m.entry.name} — ${m.entry.summary}`);
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
[f"{m['entry']['name']} — {m['entry']['summary']}"
 for m in sqai.search_capabilities("black scholes option", 5)]
```
{% endtab %}
{% endtabs %}

Real top result: `option_pricing.black_scholes_call — Black-Scholes European call price: S*N(d1) - K*exp(-rT)*N(d2)`, followed by `black_scholes_put`, `binomial_tree_call`, `delta_call`, and `gamma`. Other useful searches: `"maximum drawdown"` → `finance.max_drawdown`; `"moving average"` → `timeseries_stats.rolling_mean`; `"kmeans"` → `ml.classifiers.kmeans_cluster`; `"cosine similarity"` → `embeddings.cosine_similarity`.

{% hint style="info" %}
Search sees the whole contract; a filtered runtime only executes the modules you installed. Search first, then set `runtimeModules` to the packs you actually call — see [Slim the runtime](#slim-the-runtime-and-switch-modes) below.
{% endhint %}

## Capture provenance and replay

Every `ok` computation is replayable. The `invocation_hash` is known **before** dispatch (module, function, args, resolved bindings, seed, contract, scope); the `computation_hash` folds in the canonical result.

### Log the three hashes

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const r = await sqai.compute({
  module: "finance", function: "npv",
  args: [0.1, [-1000, 300, 420, 560, 680]],
});
console.log({
  value: r.value,                       // 505.020148896933
  invocation: r.invocation_hash,        // b3ca3e92…
  computation: r.computation_hash,      // b74f67d0…
  contract: r.contract_hash,            // sha256:31247fb2…
  platform: r.determinism.platform,     // darwin-arm64
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
r = sqai.compute(
    module="finance", function="npv",
    args=[0.1, [-1000, 300, 420, 560, 680]],
)
print({
    "value": r["value"],                     # 505.020148896933
    "invocation": r["invocation_hash"],      # b3ca3e92…
    "computation": r["computation_hash"],    # b74f67d0…
    "contract": r["contract_hash"],          # sha256:31247fb2…
    "platform": r["determinism"]["platform"],# darwin-arm64
})
```
{% endtab %}
{% endtabs %}

### Prove determinism by re-running

Same input, same `computation_hash`, every run — and identically in the other SDK.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const call = () => sqai.compute({
  module: "finance", function: "npv", args: [0.1, [-1000, 300, 420, 560, 680]],
});
const [a, b] = [await call(), await call()];
console.log({
  run1: a.computation_hash, run2: b.computation_hash,
  identical: a.computation_hash === b.computation_hash,   // true — b74f67d0…
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
def call():
    return sqai.compute(module="finance", function="npv",
                        args=[0.1, [-1000, 300, 420, 560, 680]])
a, b = call(), call()
print({
    "run1": a["computation_hash"], "run2": b["computation_hash"],
    "identical": a["computation_hash"] == b["computation_hash"],  # True — b74f67d0…
})
```
{% endtab %}
{% endtabs %}

See [Determinism & provenance](determinism.md) for exactly what each hash covers.

## Handle every outcome

SQAI is explicit about ambiguity, rejection, and failure. In the SDKs `ask`/`compute` return typed statuses and raise a `SqaiError` (with a stable `code` and `source: "engine" | "sqai"`) only on hard failure. In the AI SDK tools, nothing ever throws.

### Branch on a query verdict

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const outcome = await sqai.ask({ metric: "sales", source_name: "sales" });
switch (outcome.status) {
  case "ok":
    outcome.data.result; break;
  case "needs_clarification":
    outcome.resolution.candidates; break;      // suggested columns
  case "rejected":
    outcome.resolution.rejection_reason; break; // why it was refused
}
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
outcome = sqai.ask({"metric": "sales", "source_name": "sales"})
if outcome["status"] == "ok":
    outcome["data"].result
elif outcome["status"] == "needs_clarification":
    outcome["resolution"].candidates            # suggested columns
else:
    outcome["resolution"].rejection_reason      # why it was refused
```
{% endtab %}
{% endtabs %}

### Catch a compute error

An unknown capability raises `unsupported_operation` carrying `nearest_matches` — turn the miss into a suggestion.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
import { SqaiError } from "@thyn-ai/sqai";

try {
  await sqai.compute({ module: "finance", function: "npvv", args: [0.1, []] });
} catch (e) {
  if (e instanceof SqaiError && e.code === "unsupported_operation") {
    console.log(e.nearest_matches);   // e.g. ["finance.npv", …]
  }
}
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
from sqai import SqaiError

try:
    sqai.compute(module="finance", function="npvv", args=[0.1, []])
except SqaiError as e:
    if e.code == "unsupported_operation":
        print(e.nearest_matches)      # e.g. ["finance.npv", …]
```
{% endtab %}
{% endtabs %}

Other codes worth branching on: `seed_required`, `source_already_registered`, `runtime_provision_failed`, and the policy denials below. Transient codes (`network_error`, `timeout`, `rate_limited`, `service_unavailable`) are marked `retryable`. See [Troubleshooting](troubleshooting.md).

## Govern what the caller can reach

Policy lives in code and is unreachable from model input. `allowedSources`, `allowedFields`, and `allowedFunctions` narrow the surface; a denied request comes back as a structured `policy_denied_source` / `policy_denied_field` / `policy_denied_function` — never a silent widening.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const sqai = createSQAI({
  policy: {
    allowedSources: ["sales"],
    allowedFields: { sales: ["region", "revenue", "cost"] },
    allowedFunctions: ["finance.npv", "stats.compute_mean"],
  },
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
sqai = SQAI(policy={
    "allowed_sources": ["sales"],
    "allowed_fields": {"sales": ["region", "revenue", "cost"]},
    "allowed_functions": ["finance.npv", "stats.compute_mean"],
})
```
{% endtab %}
{% endtabs %}

The reachable surface is always the intersection: packaged read-only contract ⊇ your policy ⊇ one request. A request can only narrow. See [Policy & governance](policy.md).

## Wire SQAI into an agent

`@thyn-ai/sqai-ai-sdk` wraps the client into three Vercel AI SDK tools — `listSources`, `queryData`, `explainQuery`. Their `execute` is always present and **never throws**: ambiguity, rejection, and failure return as typed statuses the model reacts to. Keep SQAI server-side (`export const runtime = "nodejs"` on Next.js).

{% code title="agent.ts" lineNumbers="true" %}
```ts
import { generateText, isStepCount } from "ai";
import { createSQAI } from "@thyn-ai/sqai-ai-sdk";

const sqai = createSQAI({
  sources: [{ data: "./data/sales.csv", name: "sales" }],
  policy: { allowedSources: ["sales"] },        // model can only narrow this
});

const { text, steps } = await generateText({
  model: "openai/gpt-5-mini",                    // any AI SDK model
  tools: sqai.tools(),                           // listSources, queryData, explainQuery
  stopWhen: isStepCount(12),                     // bound the tool-call rounds
  prompt: "Which region had the highest revenue, and the NPV at 10% (finance.npv)?",
});

// Provenance: every ok tool result is replayable.
for (const step of steps) {
  for (const tr of step.toolResults ?? []) {
    const out = (tr as { output?: Record<string, unknown> }).output;
    if (out?.status !== "ok") continue;
    if (out.kind === "query")       console.log("plan", out.plan_hash);
    if (out.kind === "computation") console.log("compute", out.computation_hash);
  }
}
```
{% endcode %}

The model authors typed intent; SQAI validates it against the contract and your policy, runs it, and returns provenance on every answer. Full walkthrough in [Vercel AI SDK tool](ai-sdk-tools.md).

### Retrieve a truncated result

Tools shape results to a model budget and declare truncation (`truncated: true`, `returned_rows < total_rows`). The full value stays retrievable in application code by `result_id`.

```ts
const full = await sqai.client.getResult(result_id);   // present when it fit maxOutputBytes
```

## Slim the runtime and switch modes

### Ship only the modules you call

`runtimeModules` filters the build to exactly the modules you name; the build service compiles and signs a bundle keyed by filter-hash. Determinism is unchanged — `finance.npv` returns the same value and `computation_hash` whether the bundle carries three modules or all of them.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const sqai = createSQAI({ runtimeModules: ["finance", "risk", "option_pricing"] });
// or: export SQAI_RUNTIME_MODULES="finance,risk,option_pricing"
//     export SQAI_BUILD_SERVICE_URL="https://build.sqai.example.com"
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
sqai = SQAI(runtime_modules=["finance", "risk", "option_pricing"])
# or: export SQAI_RUNTIME_MODULES="finance,risk,option_pricing"
#     export SQAI_BUILD_SERVICE_URL="https://build.sqai.example.com"
```
{% endtab %}
{% endtabs %}

{% hint style="warning" %}
Filtered bundles need a build service. Set `SQAI_BUILD_SERVICE_URL` (or `buildServiceUrl`); otherwise provisioning fails with `runtime_provision_failed`. Omit `runtimeModules` to use the default pinned bundle. See [Compute & filtering](compute-and-filtering.md).
{% endhint %}

### Point at a private deployment for a live database

Files, in-memory records, and **SQLite** run in-process. Live databases — PostgreSQL, MySQL, Oracle, SQL Server, Snowflake, BigQuery, ClickHouse, Redshift — connect through a private SQAI deployment you run. Set `SQAI_DEPLOYMENT_URL` (and `SQAI_API_KEY` only if your deployment requires auth); the `ask` / `compute` API is identical. There is no SQAI cloud.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// SQLite, in-process — no deployment needed:
await sqai.connect({ provider: "sqlite", path: "./shop.db", table: "orders" }, { name: "orders" });

// Live DB — set the env, then the same API dispatches to your deployment:
//   export SQAI_DEPLOYMENT_URL="https://sqai.example.com"
//   export SQAI_API_KEY="…"     # only if your deployment requires auth
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# SQLite, in-process — no deployment needed:
sqai.connect({"provider": "sqlite", "path": "./shop.db", "table": "orders"}, name="orders")

# Live DB — set the env, then the same API dispatches to your deployment:
#   export SQAI_DEPLOYMENT_URL="https://sqai.example.com"
#   export SQAI_API_KEY="…"     # only if your deployment requires auth
```
{% endtab %}
{% endtabs %}

See [Connect your data](connect-data.md) and [Installation](installation.md) for the full connector matrix.

## Next steps

<table data-view="cards">
<thead><tr><th></th><th></th><th data-hidden data-card-target data-type="content-ref"></th></tr></thead>
<tbody>
<tr><td><strong>Compute &#38; filtering</strong></td><td>The full <code>ComputationSpec</code>, binding forms, and runtime module filtering.</td><td><a href="compute-and-filtering.md">compute-and-filtering.md</a></td></tr>
<tr><td><strong>Vercel AI SDK tool</strong></td><td>Expose SQAI to an agent as three governed, never-throwing tools.</td><td><a href="ai-sdk-tools.md">ai-sdk-tools.md</a></td></tr>
<tr><td><strong>Determinism &#38; provenance</strong></td><td>What the three hashes cover and the cross-language replay guarantee.</td><td><a href="determinism.md">determinism.md</a></td></tr>
<tr><td><strong>Policy &#38; governance</strong></td><td>Allow-lists the caller can never widen, enforced in code.</td><td><a href="policy.md">policy.md</a></td></tr>
<tr><td><strong>Troubleshooting</strong></td><td>Every error <code>code</code> and what to do about it.</td><td><a href="troubleshooting.md">troubleshooting.md</a></td></tr>
<tr><td><strong>Connect your data</strong></td><td>Files, SQLite, and live databases via a private deployment.</td><td><a href="connect-data.md">connect-data.md</a></td></tr>
</tbody>
</table>
