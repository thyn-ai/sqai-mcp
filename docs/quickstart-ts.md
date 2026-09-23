---
icon: bolt
description: Install the SQAI TypeScript SDK, create a client, connect a CSV, ask a deterministic query, and compute a hashed result — from a clean machine to a verifiable answer.
---

# Quickstart (TypeScript)

SQAI — Structured Query AI — is the governed, read-only, deterministic structured-data tool for AI agents: typed intent in, contract-validated execution on the SQAI runtime, results plus provenance out. No raw SQL, no `eval`, no write path. This page takes a clean machine from `npm install` to a first answer across both planes — a **query** over a connected source and a **computation** dispatched through the on-device runtime — with the real hashes each produces.

The query plane runs in-process: no separate service, sub-millisecond on typical files. Run `sqai login` once for the free `sqai_developer` device key; the compute plane then provisions a signed on-device runtime **once** on the first `compute()` call and stays resident — no per-query cold start. In local mode, file bytes and computation stay on your machine.

{% hint style="info" %}
Simple setup. `createSQAI()` with no arguments infers **local** mode — in-process query plane plus a signed on-device runtime that downloads, verifies, and spawns itself on first compute use after your free `sqai login`. Local files stay on your machine. Set `SQAI_DEPLOYMENT_URL` to point SQAI at a private SQAI deployment for live databases; see [Installation](installation.md) and [How it works](concepts.md).
{% endhint %}

{% stepper %}
{% step %}
#### Install the SDK

{% tabs %}
{% tab title="npm" icon="npm" %}
```bash
npm install @thyn-ai/sqai
```

This installs the core SDK: `createSQAI`, the capability contract (embedded, hash-pinned), and the on-device runtime provisioner. It needs **no separate service or database** to start. Node ≥ 20.
{% endtab %}
{% tab title="pnpm" icon="npm" %}
```bash
pnpm add @thyn-ai/sqai
```
{% endtab %}
{% tab title="yarn" icon="yarn" %}
```bash
yarn add @thyn-ai/sqai
```
{% endtab %}
{% tab title="bun" icon="js" %}
```bash
bun add @thyn-ai/sqai
```
{% endtab %}
{% endtabs %}

Building an agent tool? Add `@thyn-ai/sqai-ai-sdk` for the Vercel AI SDK tools (see [AI SDK Tools](ai-sdk-tools.md)). Prefer Python? See the [Python Quickstart](quickstart-python.md) — same plans, byte-identical hashes.
{% endstep %}

{% step %}
#### Create the sample data

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
{% endstep %}

{% step %}
#### Create a client

```ts
import { createSQAI } from "@thyn-ai/sqai";

const sqai = createSQAI(); // mode inferred: local (no env set)
```

`createSQAI(config?)` returns an `SQAI` client. With no config it runs `local`: in-process query plane, on-device runtime for compute — nothing leaves your machine. Mode inference is simple: no env ⇒ `local`; `SQAI_DEPLOYMENT_URL` set ⇒ `deployment`. `SQAI_API_KEY` is only the Bearer credential forwarded to a private SQAI deployment when it requires auth — it never selects a cloud. Optional config includes `policy`, `tenantId`, `timeout`, and `runtimeModules` — governance lives here in code and is [never reachable from model input](policy.md).
{% endstep %}

{% step %}
#### Connect a source

`connect()` registers a CSV path, an array of records, an object, or a SQLite file as an immutable, typed source — all in-process, no key. Re-connecting the same name with changed data throws `source_already_registered`.

```ts
const sales = await sqai.connect("./data/sales.csv", { name: "sales" });
```

```json
{
  "name": "sales",
  "source_id": "e135c6f7eec0e846c01c4ef8",
  "dataset_id": "e135c6f7eec0e846c01c4ef8",
  "fields": ["region", "product", "revenue", "cost", "units", "order_date"],
  "typed_fields": [
    { "name": "region", "type": "string" },
    { "name": "product", "type": "string" },
    { "name": "revenue", "type": "number" },
    { "name": "cost", "type": "number" },
    { "name": "units", "type": "number" },
    { "name": "order_date", "type": "date" }
  ],
  "row_count": 12,
  "schema_revision": "e4938027ddf0d2210f019770403efd45d350eac28100902ddd7c5191c9b8cfbe",
  "status": "ready"
}
```

`schema_revision` is what makes an answer replayable: it is pinned into every `plan_hash` and every binding's provenance. Change the data and a stored plan surfaces a schema mismatch instead of silently returning different numbers.

Files, in-memory arrays, `{records:[...]}`, and **SQLite** run in-process (`{ provider:"sqlite", path, table }`); Excel and Parquet are Python-only. Live databases — PostgreSQL, MySQL, **Oracle**, SQL Server, Snowflake, BigQuery, ClickHouse, Redshift — plus object storage and REST connect through a private SQAI deployment (`SQAI_DEPLOYMENT_URL`, with `SQAI_API_KEY` for auth if it requires it). See [Installation](installation.md).
{% endstep %}

{% step %}
#### Ask a query (query plane)

`ask(spec)` resolves a typed `QuerySpec` and, if unambiguous, executes it in-process — returning **exactly one** of three statuses. It never guesses.

```ts
const outcome = await sqai.ask({
  metric: "revenue",
  aggregation: "sum",       // sum | avg | count | min | max
  group_by: "region",
  order: "desc",
  source_name: "sales",
});

if (outcome.status === "ok") {
  console.log(outcome.data.result);    // rows, deterministic order
  console.log(outcome.data.plan_hash); // replay key
}
```

```json
{
  "status": "ok",
  "data": {
    "query_id": "local_query_f87610d8afeb",
    "result": [
      { "region": "east",  "revenue": 2130.5, "count": 5 },
      { "region": "west",  "revenue": 1519,   "count": 4 },
      { "region": "north", "revenue": 1000,   "count": 3 }
    ],
    "result_type": "table",
    "confidence": 1,
    "plan": [
      "Use source 'sales'.",
      "Aggregate 'revenue' with 'sum'.",
      "Group by 'region'."
    ],
    "row_count": 3,
    "decision_path": "exact_spec",
    "plan_hash": "f87610d8afeb13e17500df6d275725825780c1f9f3d2eab54387de528d255aa7",
    "schema_revision": "e4938027ddf0d2210f019770403efd45d350eac28100902ddd7c5191c9b8cfbe",
    "validated": true,
    "deterministic_scope": "local_registered_source"
  }
}
```

| Outcome field | What it means |
|---|---|
| `status` | `ok`, `needs_clarification`, or `rejected` — the resolver's verdict. |
| `data.result` | The rows, in deterministic order. Present only on `ok`. |
| `data.plan_hash` | Canonical hash of the resolved plan. Same plan ⇒ same hash ⇒ same result, in TS **and** Python. |
| `resolution.candidates` | Suggested columns when the intent is ambiguous (`needs_clarification`). |
| `resolution.rejection_reason` | Why the intent was refused (`rejected`). |

Need each stage? `resolve(spec)`, `query(plan)`, `queryWithMetadata(plan)`, and `verify(plan)` expose the plan and pass SQAI responses through verbatim.
{% endstep %}

{% step %}
#### Compute a value (compute plane)

The compute plane runs any of the **5,790 exposed read-only capabilities** (6,084 in the contract; 5,780 deterministic, 10 seed-required simulations). Call one directly with literal args — no source required.

```ts
const npv = await sqai.compute({
  module: "finance",
  function: "npv",                         // (rate: float64, cashflows: float64[]) -> float64
  args: [0.1, [-1000, 300, 420, 560, 680]],
});
```

```json
{
  "status": "ok",
  "value": 505.020148896933,
  "value_type": "float64",
  "module": "finance",
  "function": "npv",
  "invocation_hash": "b3ca3e925e4372a5f9365790a29c486afed868073d3fd301d03022f44689e423",
  "computation_hash": "b74f67d0d7a594aa7ac91f6291612452aa8ccdf603351ebc8d801a6fddd91bc8",
  "contract_hash": "sha256:31247fb219e656f349bb6d36fa65c2e2702e2688a2fddb4b16f1a9e09a02cdbb",
  "determinism": {
    "runtime_bundle_version": "0.1.0",
    "runtime_bundle_sha256": "4d64142e4c1ff63d299cfc8b172fdf97cb59169b545e1e02978e678a632ce6e1",
    "platform": "darwin-arm64",
    "architecture": "arm64",
    "kernel_build": "mojo",
    "precision_mode": "float64",
    "thread_count": 1,
    "input_hash": "aadddd29e6a8cc682c934233448531039e4f4777ad508d164734a0095c4e10f1"
  },
  "latency_ms": 0.93,
  "request_id": "sqai_eaab471b197880a4"
}
```

The `invocation_hash` is known **before** dispatch (module, function, args, bindings, seed, contract, scope); the `computation_hash` folds in the canonical result. Same inputs ⇒ identical `computation_hash`, every run:

```json
{ "run1": "b74f67d0…d91bc8", "run2": "b74f67d0…d91bc8", "identical": true }
```

{% hint style="success" %}
**One-time setup, then instant.** The first-ever `compute()` provisions the signed on-device runtime — download + verify RS256 signature and sha256 + extract + spawn, ~110s, once. It then stays resident: every later `compute()` is warm, ~0.9ms (this `npv` measured `latency_ms` 0.93). No per-query cold start.
{% endhint %}

The same call is byte-identical in Python — same value, same `invocation_hash`, same `computation_hash`:

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const r = await sqai.compute({
  module: "finance",
  function: "npv",
  args: [0.1, [-1000, 300, 420, 560, 680]],
});
r.value;            // 505.020148896933
r.computation_hash; // b74f67d0d7a594aa7ac91f6291612452aa8ccdf603351ebc8d801a6fddd91bc8
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
r = sqai.compute(module="finance", function="npv",
                 args=[0.1, [-1000, 300, 420, 560, 680]])
r["value"]            # 505.020148896933
r["computation_hash"] # b74f67d0d7a594aa7ac91f6291612452aa8ccdf603351ebc8d801a6fddd91bc8
```
{% endtab %}
{% endtabs %}

{% hint style="warning" %}
Simulations (`category: "simulation"`, 10 of them) require a `seed` — omit it and `compute()` throws `seed_required`. This makes every simulation replayable by construction. See [Compute & filtering](compute-and-filtering.md).
{% endhint %}
{% endstep %}

{% step %}
#### Bind a column into a computation

Instead of literals, bind a source column to a parameter. SQAI pulls the aligned column through the upstream extraction primitive and dispatches — it never zips arrays or calculates anything itself — and records the lineage in `provenance.bindings`.

```ts
const bound = await sqai.compute({
  module: "finance",
  function: "npv",
  args: [0.1],                                             // rate stays literal
  bindings: [{ parameter: "cashflows", source: "sales", field: "revenue" }],
});
```

```json
{
  "status": "ok",
  "value": 3188.1687606249325,
  "module": "finance",
  "function": "npv",
  "invocation_hash": "8223a694250fc751fcf8a7777b8e1f524c44ff1f0e7e83451467f554a6123950",
  "computation_hash": "ff5280ea128113f528dd1e9a28b9bc4a81469075ed7c981c7176fb172d98085d",
  "determinism": {
    "runtime_bundle_version": "0.1.0",
    "platform": "darwin-arm64",
    "kernel_build": "mojo",
    "precision_mode": "float64",
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

Each binding records `source_name`, `fields`, `schema_revision`, `row_count`, and its own `input_hash`, so the result names exactly which data it consumed. Bind multiple aligned columns to a multi-argument signature with `{ parameters: [...], fields: [...], alignment: "rowwise" }`. Discover capabilities with `searchCapabilities(query, limit = 10)` — every one carries a real one-line `summary`.
{% endstep %}
{% endstepper %}

## Modes

| Env set | Mode | Query plane | Compute plane |
|---|---|---|---|
| _(none)_ | `local` | in-process | on-device runtime, provisioned once on first call |
| `SQAI_DEPLOYMENT_URL` | `deployment` | in-process | your SQAI deployment: `POST {deploymentUrl}/v1/libraries/execute` |

There is no SQAI-hosted or cloud mode: `local` runs entirely on your machine and `deployment` points at a private SQAI deployment. `SQAI_API_KEY`, when set, is only the Bearer credential forwarded to a private SQAI deployment — it never selects a cloud. Keep SQAI imports server-side; on Next.js set `export const runtime = "nodejs"` (the Node runtime, not Edge).

## Expected result

After this flow the client is created, `sales` is connected with a pinned `schema_revision`, `ask()` returns revenue summed by region in deterministic order with a `plan_hash`, and `compute()` returns `505.020148896933` for `finance.npv` with an `invocation_hash`, a `computation_hash`, and a full determinism envelope — byte-identical to the [Python SDK](quickstart-python.md). The bound variant adds `provenance.bindings` naming the exact column consumed.

## Troubleshooting

Every SQAI error carries a stable `code` and a `source` of `"engine"` or `"sqai"` (e.g. `unsupported_operation` with `nearest_matches`, `source_already_registered`, `seed_required`, `runtime_provision_failed`). See [Troubleshooting](troubleshooting.md), or run `npx @thyn-ai/sqai-cli doctor` to check Node, the embedded contract, and a live runtime probe.

## Next steps

<table data-view="cards">
<thead><tr><th></th><th></th><th data-hidden data-card-target data-type="content-ref"></th></tr></thead>
<tbody>
<tr><td><strong>Compute &#38; filtering</strong></td><td>The full <code>ComputationSpec</code>, bindings, and runtime module filtering.</td><td><a href="compute-and-filtering.md">compute-and-filtering.md</a></td></tr>
<tr><td><strong>Determinism &#38; provenance</strong></td><td>What the three hashes cover and the cross-language replay guarantee.</td><td><a href="determinism.md">determinism.md</a></td></tr>
<tr><td><strong>AI SDK Tools</strong></td><td>Expose SQAI to an agent as governed Vercel AI SDK tools.</td><td><a href="ai-sdk-tools.md">ai-sdk-tools.md</a></td></tr>
<tr><td><strong>Policy &#38; governance</strong></td><td>Allow-lists the model can never widen, enforced in code.</td><td><a href="policy.md">policy.md</a></td></tr>
</tbody>
</table>
