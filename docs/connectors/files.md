---
icon: file-lines
description: Connect CSV, TSV, JSON, in-memory rows, and SQLite files entirely in-process — no key, no network, no separate service. The bytes never leave your machine.
---

# Files & SQLite (in-process)

Files and SQLite are SQAI's zero-setup connectors. A path (or an array of rows) goes in, SQAI reads the bytes **on your machine**, infers a typed schema, and hands back a hash-pinned source. No key, no network, no separate database server — the query plane opens the file in-process and answers in sub-millisecond time on typical files. This is the same `connect()` front door described in [Connect your data](../connect-data.md), zoomed in on the local formats.

Everything here runs the same in Python and TypeScript, and the resulting `schema_revision` is byte-identical across both — so a plan built over a CSV in one SDK replays and verifies in the other.

{% hint style="info" %}
New to SQAI? The [Python](../quickstart-python.md) and [TypeScript](../quickstart-ts.md) quickstarts take the `sales.csv` used throughout this page from `connect()` to a hashed answer. Governance over which sources and fields a model may touch lives in [Policy & governance](../policy.md) — in code, never reachable from model input.
{% endhint %}

## What runs in-process

Pass a path, an array of records, a `{ records: [...] }` envelope, or a `{ provider: "sqlite", ... }` descriptor. SQAI reads the bytes locally, infers types, and returns a typed source — nothing leaves the process, and no `sqai login` or key is required for the query plane.

| Source | Connect shape | Notes |
|---|---|---|
| CSV / TSV | path string — `"./data/sales.csv"` or `"/abs/sales.csv"` | delimiter inferred |
| JSON | path string, or a parsed object / array | array of records, or a `{ records: [...] }` object |
| In-memory rows | array — `[{ region: "east", revenue: 512 }, …]` | no file on disk at all |
| Records envelope | `{ records: [ … ] }` | the explicit form of the array above |
| SQLite file | `{ provider: "sqlite", path, table }` or `{ provider: "sqlite", path, query }` | read-only; runs fully in-process |
| Excel / Parquet | path string | Python only |

Relative paths resolve against the working directory; absolute paths are read as given. Sources are **immutable** once connected — re-binding a name to different data throws `source_already_registered`.

## Connect a file

Give `connect()` a path and a `name`. The returned source is typed and hash-pinned — the same shape you get from a live database, so downstream code never knows or cares where the rows came from.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
import { createSQAI } from "@thyn-ai/sqai";

const sqai = createSQAI(); // local mode, no key
const sales = await sqai.connect("./data/sales.csv", { name: "sales" });

console.log(sales.fields);          // ["region", "product", "revenue", "cost", "units", "order_date"]
console.log(sales.row_count);       // 12
console.log(sales.schema_revision); // pinned into every plan_hash for this data
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
from sqai import create_sqai

sqai = create_sqai()  # local mode, no key
sales = sqai.connect("./data/sales.csv", name="sales")

print(sales["fields"])          # ['region', 'product', 'revenue', 'cost', 'units', 'order_date']
print(sales["row_count"])       # 12
print(sales["schema_revision"]) # pinned into every plan_hash for this data
```
{% endtab %}
{% endtabs %}

TSV and JSON connect exactly the same way — pass the path and SQAI picks the reader from the bytes. JSON also accepts an already-parsed value: an array of row objects, or a `{ records: [...] }` envelope.

### From rows already in memory

No file needed. Hand `connect()` the rows directly and SQAI infers the schema from the array. This is the fastest way to bring an agent's own working set — a fetched page of records, a computed table — under the same typed, governed, hash-pinned surface as a file.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const rows = await sqai.connect(
  [
    { region: "east", revenue: 500.5, units: 3 },
    { region: "west", revenue: 250.0, units: 25 },
  ],
  { name: "rows" },
);

// The explicit envelope form is equivalent:
const same = await sqai.connect(
  { records: [{ region: "east", revenue: 500.5, units: 3 }] },
  { name: "rows2" },
);
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
rows = sqai.connect(
    [
        {"region": "east", "revenue": 500.5, "units": 3},
        {"region": "west", "revenue": 250.0, "units": 25},
    ],
    name="rows",
)

# The explicit envelope form is equivalent:
same = sqai.connect(
    {"records": [{"region": "east", "revenue": 500.5, "units": 3}]},
    name="rows2",
)
```
{% endtab %}
{% endtabs %}

## Connect a SQLite file

A database, still fully in-process — no key, no separate service, no server to start. Point at the `.db` file and name a `table`, or pass a read-only `query` to shape the columns before they are typed.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// A whole table
const orders = await sqai.connect(
  { provider: "sqlite", path: "./data/warehouse.db", table: "orders" },
  { name: "orders" },
);

// Or a read-only query — the projection becomes the schema
const revenue = await sqai.connect(
  {
    provider: "sqlite",
    path: "./data/warehouse.db",
    query: "select region, revenue, cost from orders",
  },
  { name: "revenue" },
);
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# A whole table
orders = sqai.connect(
    {"provider": "sqlite", "path": "./data/warehouse.db", "table": "orders"},
    name="orders",
)

# Or a read-only query — the projection becomes the schema
revenue = sqai.connect(
    {
        "provider": "sqlite",
        "path": "./data/warehouse.db",
        "query": "select region, revenue, cost from orders",
    },
    name="revenue",
)
```
{% endtab %}
{% endtabs %}

The SQLite table comes back typed, exactly like a file:

```json
{
  "name": "orders",
  "fields": ["region", "product", "revenue", "cost", "units", "order_date"],
  "typed_fields": [
    { "name": "region", "type": "string" },
    { "name": "product", "type": "string" },
    { "name": "revenue", "type": "number" },
    { "name": "cost", "type": "number" },
    { "name": "units", "type": "number" },
    { "name": "order_date", "type": "date" }
  ],
  "row_count": 12
}
```

{% hint style="info" %}
The `query` is **read-only** — SQAI resolves typed metric/group/filter intent and never opens a write path. The connector reads schema and rows to build a typed source; there is no `INSERT`/`UPDATE`/`DELETE` route through `connect()` or `ask()`.
{% endhint %}

## Excel & Parquet (Python only)

The Python SDK reads Excel workbooks and Parquet files the same way it reads a CSV — pass the path. These readers ship only in the Python package; in TypeScript, convert to CSV/JSON first or route through a SQLite file.

```python
report  = sqai.connect("./data/q1_report.xlsx", name="report")
events  = sqai.connect("./data/events.parquet", name="events")

print(report["typed_fields"])
```

Everything downstream — `ask()`, `compute()`, bindings, provenance — is identical regardless of which reader produced the rows.

## The typed source you get back

Every in-process source returns the same `SqaiSource` shape — the very shape a live database returns — so nothing downstream depends on the origin format:

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
  "schema_revision": "e4938027…",
  "status": "ready"
}
```

| Field | What it is |
|---|---|
| `name` | The handle you pass to `ask()` and bind in `compute()`. |
| `source_id` / `dataset_id` | Stable identifiers for the registered source. |
| `fields` / `typed_fields` | Column names and their inferred types (`string`, `number`, `date` in this sample). |
| `row_count` | Rows read in-process. |
| `schema_revision` | Canonical hash of the schema **and** data, pinned into every `plan_hash` and every binding's provenance. |
| `status` | `ready` once the source is typed and resident. |

`schema_revision` is what makes an answer replayable: it is folded into every `plan_hash` for this data and into each binding's provenance. Change a byte in the file and reconnect, and a stored-plan replay surfaces `schema_revision_mismatch` instead of silently returning different numbers. Files and in-memory rows produce the same `schema_revision` for the same data in both SDKs — this is the cross-language parity guarantee, applied to local sources.

{% hint style="warning" %}
Connected sources are **immutable**. Reading a changed file into the same `name` throws `source_already_registered`; connect it under a new `name`, or restart the client, to bring in fresh data. This is deliberate — it keeps a live plan pinned to the exact bytes it was resolved against.
{% endhint %}

## Query and compute over it

Once a file is connected it behaves like any other SQAI source — a typed query plane and a hashed compute plane, both over the same local bytes.

{% stepper %}
{% step %}
#### Ask a deterministic query

`ask()` resolves a typed `QuerySpec` and, if unambiguous, executes it in-process — returning exactly one of `ok`, `needs_clarification`, or `rejected`. It never guesses a column.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const outcome = await sqai.ask({
  metric: "revenue",
  aggregation: "sum",     // sum | avg | count | min | max
  group_by: "region",
  order: "desc",
  source_name: "sales",
});

if (outcome.status === "ok") {
  console.log(outcome.data.result);    // rows, deterministic order
  console.log(outcome.data.plan_hash); // replay key
}
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
outcome = sqai.ask({
    "metric": "revenue",
    "aggregation": "sum",     # sum | avg | count | min | max
    "group_by": "region",
    "order": "desc",
    "source_name": "sales",
})

if outcome["status"] == "ok":
    print(outcome["data"].result)     # rows, deterministic order
    print(outcome["data"].plan_hash)  # replay key
```
{% endtab %}
{% endtabs %}
{% endstep %}

{% step %}
#### Bind a column into a computation

Bind a source field to a capability parameter and SQAI pulls the aligned column through the upstream extraction primitive, dispatches, and records exactly which source, fields, and rows fed the number. The example below runs the same `finance.npv` that returns `505.020148896933` from literal args — here over the 12 `revenue` values.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const result = await sqai.compute({
  module: "finance",
  function: "npv",
  args: [0.1],
  bindings: [{ parameter: "cashflows", source: "sales", field: "revenue" }],
});

console.log(result.value);
console.log(result.provenance.bindings);
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
result = sqai.compute(
    module="finance",
    function="npv",
    args=[0.1],
    bindings=[{"parameter": "cashflows", "source": "sales", "field": "revenue"}],
)

print(result["value"])
print(result["provenance"]["bindings"])
```
{% endtab %}
{% endtabs %}

The value is the NPV over the `revenue` column, and `provenance.bindings` records exactly the source, fields, `schema_revision`, `row_count`, and `input_hash` behind it — full lineage from the local file to the number:

```json
{
  "provenance": {
    "bindings": [
      {
        "source_name": "sales",
        "fields": ["revenue"],
        "schema_revision": "e4938027…",
        "row_count": 12,
        "input_hash": "2ea5ede7…"
      }
    ]
  }
}
```
{% endstep %}
{% endstepper %}

See [Compute & filtering](../compute-and-filtering.md) for the full compute spec and the 5,790 read-only capabilities you can bind a column into.

## In-process in both modes

Files and SQLite run **in-process in every mode**. Setting `SQAI_DEPLOYMENT_URL` routes only *live* databases to your private SQAI deployment — a local CSV, SQLite file, or in-memory array is still read on your machine, never uploaded.

| Env | Mode | Files & SQLite | Live databases |
|---|---|---|---|
| _(none)_ | `local` (default) | in-process, no key | not available |
| `SQAI_DEPLOYMENT_URL` | `deployment` | still in-process, on your machine | through your private SQAI deployment |

There is no SQAI cloud. `SQAI_API_KEY`, if set, is only the Bearer credential forwarded to a private SQAI deployment when it requires auth — it never selects a cloud and never applies to local files. See [Connect your data](../connect-data.md) for the live-database connectors.

## Errors you might see

Every SQAI error is a `SqaiError` with a stable `code` and a `source: "engine" | "sqai"`.

| Code / cause | When | Fix |
|---|---|---|
| `source_already_registered` | Re-connecting a `name` with changed data. | Use a new `name`, or restart the client — sources are immutable. |
| `schema_revision_mismatch` | Replaying a stored plan after the file's bytes changed. | Reconnect the current data and re-resolve; the mismatch is the guarantee working. |
| Path unreadable (`source: "engine"`) | Missing file, wrong path, or no read permission. | Check the path (relative resolves against the working directory) and that the process can read it. |
| SQLite `query` rejected | A non–read-only statement in `query`. | Use a `SELECT`; `connect()` has no write path. |

See [Troubleshooting](../troubleshooting.md) for the full error catalogue and the `nearest_matches` hints SQAI attaches to unresolved intents.

## Next steps

<table data-view="cards">
<thead><tr><th></th><th></th><th data-hidden data-card-target data-type="content-ref"></th></tr></thead>
<tbody>
<tr><td><strong>Connect your data</strong></td><td>The full front door — in-process files plus every live-database connector via a private SQAI deployment.</td><td><a href="../connect-data.md">connect-data.md</a></td></tr>
<tr><td><strong>Compute &amp; filtering</strong></td><td>Bind a file column into any of 5,790 capabilities and get a hashed value with provenance.</td><td><a href="../compute-and-filtering.md">compute-and-filtering.md</a></td></tr>
<tr><td><strong>Policy &amp; governance</strong></td><td>Allowlist the exact sources and fields a model may touch — in code, never from model input.</td><td><a href="../policy.md">policy.md</a></td></tr>
<tr><td><strong>Determinism &amp; provenance</strong></td><td>What <code>schema_revision</code> and the compute hashes cover, and the replay guarantee.</td><td><a href="../determinism.md">determinism.md</a></td></tr>
</tbody>
</table>
