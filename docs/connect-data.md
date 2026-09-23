---
icon: plug
description: Connect any data source to SQAI — files and SQLite in-process with no key; live databases through a private SQAI deployment. Local bytes stay local, and deployment credentials stay on your infrastructure.
---

# Connect your data

`connect()` is the front door to both SQAI planes. It registers a source once, infers a typed schema, and pins a `schema_revision` into every plan and computation that touches it. Files and a SQLite file run **in-process** — no separate service, no key, no cloud, sub-millisecond. Live databases, warehouses, object storage, and APIs connect through a **private SQAI deployment** — credentials stay on your infrastructure, no data copied to any SQAI service.

SQAI provisions a live connection **once**, then keeps it warm: there is no per-query cold start. One-time setup, then every query and `compute()` runs against a live, typed source. Connected sources are immutable — re-binding a name to different data throws `source_already_registered`.

{% hint style="info" %}
New here? [Quickstart — TypeScript](quickstart-ts.md) and [Quickstart — Python](quickstart-python.md) take a CSV from `connect()` to a hashed answer. Governance over which sources and fields a model may touch lives in [Policy & governance](policy.md), in code, never reachable from model input.
{% endhint %}

## Two ways in

<table data-view="cards">
<thead><tr><th></th><th></th><th data-hidden data-card-target data-type="content-ref"></th></tr></thead>
<tbody>
<tr><td><strong>In-process</strong></td><td>CSV, TSV, JSON, in-memory rows, <code>{records}</code>, SQLite file. No key, no network.</td><td><a href="#in-process-local-no-key">#in-process-local-no-key</a></td></tr>
<tr><td><strong>Private deployment</strong></td><td>PostgreSQL, MySQL, Oracle, MSSQL, Snowflake, BigQuery, ClickHouse, Redshift, object storage, REST, repos. Point at a private SQAI deployment with one env var.</td><td><a href="#private-sqai-deployment">#private-sqai-deployment</a></td></tr>
</tbody>
</table>

Mode is inferred from the environment: `SQAI_DEPLOYMENT_URL` set ⇒ `deployment`, else `local` (the default). SQAI does not provide a shared data cloud: `local` keeps files and SQLite on your machine, and `deployment` points at a private SQAI deployment you control. Files and SQLite work in both modes; live databases require `deployment`. `SQAI_API_KEY`, if set, is only the Bearer credential forwarded to a private SQAI deployment when it requires auth — it never selects a SQAI cloud.

## In-process (local, no key)

Pass a file path, an array of records, a `{ records: [...] }` envelope, or a `{ provider: "sqlite", ... }` descriptor. SQAI reads the bytes on your machine, infers types, and returns a typed source — nothing leaves the process.

| Source | Connect shape |
|---|---|
| CSV / TSV | path string — `"/abs/sales.csv"` |
| JSON | path string, or an object |
| In-memory rows | array — `[{ region: "east", revenue: 512 }, …]` |
| Records envelope | `{ records: [ … ] }` |
| SQLite file | `{ provider: "sqlite", path, table }` or `{ provider: "sqlite", path, query }` |
| Excel / Parquet | path string (Python only) |

{% stepper %}
{% step %}
#### Connect a file or rows

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
import { createSQAI } from "@thyn-ai/sqai";

const sqai = createSQAI(); // local mode, no key
const sales = await sqai.connect("./data/sales.csv", { name: "sales" });
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
from sqai import create_sqai

sqai = create_sqai()  # local mode, no key
sales = sqai.connect("./data/sales.csv", name="sales")
```
{% endtab %}
{% endtabs %}

The returned source is typed and hash-pinned — the same shape from every source, in-process or live:

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

`schema_revision` is what makes a plan replayable: change the data and a stored-plan replay surfaces `schema_revision_mismatch` instead of silently returning different numbers.
{% endstep %}

{% step %}
#### Connect a SQLite file

A database, still fully in-process — no key, no separate service. Point at the file and name a `table` (or pass a read-only `query`).

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const orders = await sqai.connect(
  { provider: "sqlite", path: "./data/warehouse.db", table: "orders" },
  { name: "orders" },
);
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
orders = sqai.connect(
    {"provider": "sqlite", "path": "./data/warehouse.db", "table": "orders"},
    name="orders",
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
{% endstep %}
{% endstepper %}

## Private SQAI Deployment

Live databases connect through a **private SQAI deployment** — infrastructure you run, not any SQAI cloud. Set `SQAI_DEPLOYMENT_URL` to point SQAI at it, then call `connect()` with a managed connector. Credentials stay on your SQAI deployment; SQAI reads schema and rows on demand and copies no data.

```bash
export SQAI_DEPLOYMENT_URL="https://sqai.example.com:8443"
```

If your SQAI deployment requires auth, set `SQAI_API_KEY` as the Bearer credential SQAI forwards to it — it authenticates against your private deployment only, never an SQAI cloud:

```bash
export SQAI_API_KEY="<token-your-sqai-deployment-accepts>"
```

| Group | Sources |
|---|---|
| Relational | `postgres`, `postgresql`, `mysql`, `mssql`, `oracle`, `sqlite` |
| Warehouses | `snowflake`, `bigquery`, `clickhouse`, `redshift` |
| Object storage | `s3`, `gcs`, `azure` |
| NoSQL / graph / search | `redis`, `neo4j`, `elastic`, `elasticsearch` |
| APIs and files | `rest`, `rest_api`, `file`, `file_upload` |
| Code repos | `github_repo`, `gitlab_repo`, `bitbucket_repo`, `local_repo`, `repo_archive` |

Oracle **is** supported — SQAI ships a bundled Thin-mode driver, no Oracle client to install.

These are SQAI connector type strings. Use them directly in `sqai.testConnector(...)`,
`sqai.createConnector(...)`, or `sqai.connect(..., { connector: ... })`.
Common aliases normalize before dispatch: `postgresql` → `postgres`,
`click_house` → `clickhouse`, `redis_cache` → `redis`, `elastic` →
`elasticsearch`, `rest_api` → `rest`, `file_upload` → `file`, `github` and
`github_repository` → `github_repo`, `gitlab` and `gitlab_repository` →
`gitlab_repo`, `bitbucket` and `bitbucket_repository` → `bitbucket_repo`,
`local_repository` → `local_repo`, and `archive_repository` → `repo_archive`.

{% stepper %}
{% step %}
#### Connect with host fields

Give SQAI the connection parameters and a `table` or read-only `query`. Preview-test first when you want a fast credential check without saving anything.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const preview = await sqai.testConnector({
  type: "postgres",
  host: "db.example.com",
  port: 5432,
  database: "sales",
  user: "readonly",
  password: process.env.PG_PASSWORD,
});

if (!preview.success) throw new Error(preview.message);

const orders = await sqai.connect(null, {
  datasetName: "orders",
  persist: true,
  connector: {
    type: "postgres",
    host: "db.example.com",
    port: 5432,
    database: "sales",
    user: "readonly",
    password: process.env.PG_PASSWORD,
    query: "select region, revenue, cost from orders",
  },
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
import os

preview = sqai.test_connector(
    type="postgres",
    host="db.example.com",
    port=5432,
    database="sales",
    user="readonly",
    password=os.environ["PG_PASSWORD"],
)

if not preview["success"]:
    raise RuntimeError(preview["message"])

orders = sqai.connect(
    connector={
        "type": "postgres",
        "host": "db.example.com",
        "port": 5432,
        "database": "sales",
        "user": "readonly",
        "password": os.environ["PG_PASSWORD"],
        "query": "select region, revenue, cost from orders",
    },
    dataset_name="orders",
    persist=True,
)
```
{% endtab %}
{% endtabs %}
{% endstep %}

{% step %}
#### Or a connection string

Warehouses and DSN-style sources take a single string plus a `query`.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const revenue = await sqai.connect(null, {
  datasetName: "revenue",
  persist: true,
  connector: {
    type: "snowflake",
    connection_string: process.env.SNOWFLAKE_DSN,
    query: "select region, revenue from analytics.orders",
  },
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
revenue = sqai.connect(
    connector={
        "type": "snowflake",
        "connection_string": os.environ["SNOWFLAKE_DSN"],
        "query": "select region, revenue from analytics.orders",
    },
    dataset_name="revenue",
    persist=True,
)
```
{% endtab %}
{% endtabs %}

Every live source returns the same typed `SqaiSource` — `name`, `source_id`, `dataset_id`, `fields`, `typed_fields`, `row_count`, `schema_revision`, `status` — so downstream code never knows or cares whether the data came from a CSV or Snowflake.
{% endstep %}
{% endstepper %}

## After you connect

<table data-view="cards">
<thead><tr><th></th><th></th><th data-hidden data-card-target data-type="content-ref"></th></tr></thead>
<tbody>
<tr><td><strong>Ask a query</strong></td><td>Typed intent in, deterministic table out, with a plan and <code>plan_hash</code>.</td><td><a href="quickstart-ts.md">quickstart-ts.md</a></td></tr>
<tr><td><strong>Compute on a column</strong></td><td>Bind a source field into any of 5,790 capabilities and get a hashed value with provenance.</td><td><a href="compute-and-filtering.md">compute-and-filtering.md</a></td></tr>
<tr><td><strong>Govern access</strong></td><td>Allowlist the exact sources and fields a model may touch — in code.</td><td><a href="policy.md">policy.md</a></td></tr>
</tbody>
</table>

Every field bound into a computation carries its lineage. A `compute()` over the `revenue` column records the source, fields, `schema_revision`, `row_count`, and an `input_hash` in `provenance.bindings`:

```json
{
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
  }
}
```

See [Determinism & provenance](determinism.md) for how these hashes make a result replayable, and [How it works](concepts.md) for the two-plane model behind `connect()`.
