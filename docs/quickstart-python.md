---
icon: python
description: Install the SQAI Python SDK, connect a source, ask a deterministic query, and run a finance.npv computation whose value and hashes are byte-identical to the TypeScript SDK.
---

# Quickstart (Python)

SQAI — Structured Query AI — is the governed, read-only, deterministic structured-data tool for AI agents: typed intent in, contract-validated execution on the SQAI runtime, results plus provenance out. No raw SQL, no `eval`, no write path. This page takes a clean machine from `pip install` to a first answer across both planes — a **query** over a connected source and a **computation** (`finance.npv`) run on the signed on-device runtime.

This is the Python mirror of the [TypeScript Quickstart](quickstart-ts.md): same plans, same numbers, **byte-identical** `plan_hash` / `invocation_hash` / `computation_hash`. The query plane runs in-process — no separate service, sub-millisecond on typical files. Run `sqai login` once for the free `sqai_developer` device key; the computation plane then provisions a signed runtime **once**, on the first `compute()`, and stays warm and resident — no cold start per query.

{% hint style="info" %}
Simple setup. `SQAI()` with no arguments infers **local** mode — in-process query plane plus a signed on-device runtime that downloads, verifies, and spawns itself on first compute use after your free `sqai login`. Local files stay on your machine. The API is snake_case; every call returns a plain `dict`. Set `SQAI_DEPLOYMENT_URL` only to point SQAI at your SQAI deployment for live databases; see [Installation](installation.md) and [Concepts](concepts.md).
{% endhint %}

{% stepper %}
{% step %}
#### Install the SDK

{% tabs %}
{% tab title="pip" icon="python" %}
```bash
pip install sqai
```

This installs the `sqai` package: the `SQAI` client, the capability contract (embedded, hash-pinned), and the on-device runtime provisioner. It needs **no separate service or database** to start. Python ≥ 3.10.
{% endtab %}
{% endtabs %}

Working in TypeScript? See the [TypeScript Quickstart](quickstart-ts.md) — same plans, byte-identical hashes. The three governed agent tools ship in the TS package (see [AI SDK Tools](ai-sdk-tools.md)).
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

```python
from sqai import SQAI

sqai = SQAI(mode="local")  # or SQAI() — local is inferred when no env is set
```

`SQAI(**config)` returns a client; `create_sqai(**config)` is the equivalent factory. All arguments are keyword-only. Mode inference is `SQAI_DEPLOYMENT_URL` (⇒ `deployment`) → `local` (the default, no env set). `SQAI_API_KEY`, if set, is only the Bearer credential forwarded to a private SQAI deployment — it does not select a cloud (there is none). Optional config includes `policy`, `tenant_id`, `timeout`, and `runtime_modules` — governance lives here in code and is [never reachable from model input](policy.md).
{% endstep %}

{% step %}
#### Connect a source

`connect()` registers a source as immutable and typed, returning a `dict`. Re-connecting the same name with changed data raises `source_already_registered`.

{% tabs %}
{% tab title="CSV / TSV / JSON" icon="file-csv" %}
```python
sales = sqai.connect("./data/sales.csv", name="sales")
```
{% endtab %}
{% tab title="records" icon="brackets-curly" %}
```python
sales = sqai.connect(
    [{"region": "east", "revenue": 500.5, "units": 3}, ...],
    name="sales",
)
```
{% endtab %}
{% tab title="SQLite" icon="database" %}
```python
sales = sqai.connect(
    {"provider": "sqlite", "path": "./shop.db", "table": "orders"},
    name="sales",
)
```
{% endtab %}
{% endtabs %}

Files, in-memory records, and SQLite files all run **in-process, no key**. Live databases (PostgreSQL, MySQL, Oracle, Snowflake, BigQuery, …) connect through a private SQAI deployment (`SQAI_DEPLOYMENT_URL`) — see [Installation](installation.md).

```python
print(sales["fields"])          # ['region', 'product', 'revenue', 'cost', 'units', 'order_date']
print(sales["row_count"])       # 12
print(sales["schema_revision"]) # pinned into every plan_hash for this data
```

The returned dict, verbatim:

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

`schema_revision` is what makes a query replayable: change the data and a stored-plan replay surfaces `schema_revision_mismatch` instead of silently returning different numbers.
{% endstep %}

{% step %}
#### Ask a query (query plane)

`ask(spec)` takes a `QuerySpec` dict, resolves it, and — if unambiguous — executes it, returning a dict with **exactly one** of three statuses. It never guesses.

```python
outcome = sqai.ask({
    "metric": "revenue",
    "aggregation": "sum",       # sum | avg | count | min | max
    "group_by": "region",
    "order": "desc",
    "source_name": "sales",
})

if outcome["status"] == "ok":
    print(outcome["data"].result)     # rows, deterministic order
    print(outcome["data"].plan_hash)  # replay key
elif outcome["status"] == "needs_clarification":
    print(outcome["resolution"].candidates)       # resolver wants a specific column
else:
    print(outcome["resolution"].rejection_reason) # why the intent was refused
```

`outcome["data"]` is the SQAI response with attribute access (`.result`, `.plan_hash`). Serialized, the real result:

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
    "plan_hash": "f87610d8afeb13e17500df6d275725825780c1f9f3d2eab54387de528d255aa7",
    "schema_revision": "e4938027ddf0d2210f019770403efd45d350eac28100902ddd7c5191c9b8cfbe",
    "decision_path": "exact_spec",
    "latency_ms": 0,
    "row_count": 3
  }
}
```

| Outcome key | What it means |
|---|---|
| `outcome["status"]` | `ok`, `needs_clarification`, or `rejected` — the resolver's verdict. |
| `outcome["data"].result` | The rows, in deterministic order. Present only on `ok`. |
| `outcome["data"].plan_hash` | Canonical hash of the resolved plan. Same plan ⇒ same hash ⇒ same result, in Python **and** TypeScript. |
| `outcome["resolution"].candidates` | Suggested columns when the intent is ambiguous (`needs_clarification`). |
| `outcome["resolution"].rejection_reason` | Why the intent was refused (`rejected`). |

Need each stage? `resolve(spec)`, `query(plan)`, `query_with_metadata(plan)`, and `verify(plan)` expose the plan and pass SQAI responses through verbatim.
{% endstep %}

{% step %}
#### Compute finance.npv (compute plane)

The computation plane runs any of the **5,790 read-only capabilities** (5,780 deterministic, 10 seed-required simulations) drawn from a contract of 6,084. Discover one, then call it — SQAI validates the intent against the pinned contract and dispatches; it never calculates anything itself.

```python
# Discover — search_capabilities(query, limit=10) returns [{ "entry", "score" }]
[m["entry"]["name"] for m in sqai.search_capabilities("npv")]
# → ['finance.npv']  ·  "Net Present Value: sum of cashflows[t] / (1+rate)^t for t=0..n-1"

result = sqai.compute(
    module="finance",
    function="npv",                     # signature: (rate: float64, cashflows: float64[]) -> float64
    args=[0.1, [-1000, 300, 420, 560, 680]],
)

print(result["value"])            # 505.020148896933
print(result["invocation_hash"])  # known BEFORE execution
print(result["computation_hash"]) # invocation_hash + canonical result
```

The full result dict, verbatim:

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

The first-ever `compute()` after `sqai login` provisions the signed runtime — download → verify signature + sha256 → extract → spawn, roughly 110s one time. It then stays resident, so every later call is warm: this one measured **0.93 ms**. One-time login, one-time setup, then instant.

| Result key | What it means |
|---|---|
| `result["value"]` | The SQAI runtime's result, verbatim. Type matches the signature's `returns`. |
| `result["invocation_hash"]` | Hash of the resolved intent — module, function, args, resolved bindings, seed, contract, scope. Known before dispatch. |
| `result["computation_hash"]` | `invocation_hash` folded with the canonical result. The full-fidelity replay key. |
| `result["contract_hash"]` | The pinned capability contract these hashes were computed against. |
| `result["determinism"]` | The declared execution scope. `kernel_build: 'mojo'` is the signed on-device runtime. See [Determinism](determinism.md). |

{% hint style="warning" %}
Simulations (`category: "simulation"`, 10 of them) require a seed — omit it and `compute()` raises `seed_required`. Pass `seed=` (int or string) to make every simulation replayable by construction. See [Compute & Filtering](compute-and-filtering.md).
{% endhint %}
{% endstep %}
{% endstepper %}

## Byte-identical across languages

The same computation — `finance.npv(0.1, [-1000, 300, 420, 560, 680])` — in **both** SDKs returns the same value and the same hashes, bit for bit. This is the parity guarantee, verified live.

{% tabs %}
{% tab title="Python" icon="python" %}
```python
sqai.compute(module="finance", function="npv",
             args=[0.1, [-1000, 300, 420, 560, 680]])
```
{% endtab %}
{% tab title="TypeScript" icon="js" %}
```ts
sqai.compute({ module: "finance", function: "npv",
               args: [0.1, [-1000, 300, 420, 560, 680]] });
```
{% endtab %}
{% endtabs %}

```text
value            : 505.020148896933
invocation_hash  : b3ca3e925e4372a5f9365790a29c486afed868073d3fd301d03022f44689e423
computation_hash : b74f67d0d7a594aa7ac91f6291612452aa8ccdf603351ebc8d801a6fddd91bc8
```

Run the identical input twice and the `computation_hash` is stable — same input, same hash, always:

```json
{
  "run1": "b74f67d0d7a594aa7ac91f6291612452aa8ccdf603351ebc8d801a6fddd91bc8",
  "run2": "b74f67d0d7a594aa7ac91f6291612452aa8ccdf603351ebc8d801a6fddd91bc8",
  "identical": true
}
```

## Bind a column, keep the provenance

Instead of literal args, bind a source column to a parameter. SQAI pulls the aligned column through the upstream extraction primitive, dispatches, and records exactly which source, fields, and rows fed the number.

```python
result = sqai.compute(
    module="finance",
    function="npv",
    args=[0.1],
    bindings=[{
        "parameter": "cashflows",
        "source": "sales",
        "field": "revenue",   # 12 aligned values, pulled upstream — never zipped in Python
    }],
)

print(result["value"])                  # 3188.1687606249325
print(result["provenance"]["bindings"])
```

```json
{
  "value": 3188.1687606249325,
  "invocation_hash": "8223a694250fc751fcf8a7777b8e1f524c44ff1f0e7e83451467f554a6123950",
  "computation_hash": "ff5280ea128113f528dd1e9a28b9bc4a81469075ed7c981c7176fb172d98085d",
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
  "latency_ms": 0.83
}
```

The value differs because the cashflows are now the `revenue` column, so the hashes differ too — but `provenance.bindings` records the exact `schema_revision`, `row_count`, and `input_hash` behind them. `compute()` also accepts a single spec dict — `compute({"module": ..., "function": ..., "bindings": [...]})`.

## Modes

| Env set | Mode | Query plane | Computation plane |
|---|---|---|---|
| _(none)_ | `local` (default) | in-process | signed on-device runtime, provisioned once on first call |
| `SQAI_DEPLOYMENT_URL` | `deployment` | in-process | POST `{deployment_url}/v1/libraries/execute` to your SQAI deployment |

There is no SQAI cloud: `SQAI_API_KEY`, if set, is only the Bearer credential forwarded to a private SQAI deployment when it requires auth — used alongside `SQAI_DEPLOYMENT_URL`, never to select a cloud. In a serverless deployment, set `SQAI_DEPLOYMENT_URL` so the function dispatches to your SQAI deployment instead of provisioning the on-device runtime itself.

## Expected result

After this flow the client is created, `sales` is connected with a pinned `schema_revision`, `ask()` returns revenue summed by region in deterministic order with a `plan_hash`, and `compute()` returns `505.020148896933` with an `invocation_hash`, a `computation_hash`, and a determinism envelope — the same value and byte-identical hashes you get from the [TypeScript SDK](quickstart-ts.md). This cross-language parity is locked by the conformance suites.

## Troubleshooting

Every SQAI error is a `SqaiError` with a stable `code` (e.g. `unsupported_operation` with `nearest_matches`, `source_already_registered`, `seed_required`, `runtime_provision_failed`) and `source: "engine" | "sqai"`. See [Troubleshooting](troubleshooting.md). Run `sqai capabilities --count` to confirm the embedded contract (`4778`) and its `capability_contract_hash`.

## Next steps

- [Compute & Filtering](compute-and-filtering.md) — the full compute spec, bindings, and runtime module filtering.
- [Determinism](determinism.md) — what the three hashes cover and the replay guarantee.
- [Policy](policy.md) — allow-lists (`allowed_sources`, `allowed_fields`, `allowed_functions`) the model can never widen.
- [AI SDK Tools](ai-sdk-tools.md) — expose SQAI to an agent as three governed tools.
