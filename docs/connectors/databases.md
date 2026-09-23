---
icon: database
description: Connect PostgreSQL, MySQL, Oracle, SQL Server, and the warehouses to SQAI through a private SQAI deployment you run — credentials stay on your infrastructure, no data copied to any SQAI cloud.
---

# Databases via your private deployment

Files, records, and a SQLite file run **in-process** — no key, no network, sub-millisecond ([Connect your data](../connect-data.md)). Live databases are the one thing that needs a network hop, and SQAI never routes it through a cloud it operates: you point the SDK at a **private SQAI deployment** — infrastructure you run, on your network — with a single environment variable. Credentials stay on that deployment, SQAI reads schema and rows on demand, and **no data is copied to any SQAI service**. There is no SQAI-hosted database mode; `deployment` means *your* deployment.

The connector surface is the same in both SDKs and returns the same typed `SqaiSource` a CSV does, so nothing downstream — `ask()`, `compute()`, policy, provenance — knows or cares whether a column came from a file or from Snowflake.

{% hint style="info" %}
This is the connector page for **live databases**. For files, in-memory rows, and SQLite (all in-process, no deployment), start at [Connect your data](../connect-data.md). For the no-cloud licensing model behind all of this, see [Licensing & accounts](../licensing.md).
{% endhint %}

## How a live database connects

Two planes, one connection. When `SQAI_DEPLOYMENT_URL` is set, SQAI runs in `deployment` mode:

- **Query plane** — still **in-process**. `ask()`, `resolve()`, and `query()` resolve typed intent, validate against the pinned schema, and build a plan locally. No SQL leaves your process as free text; the resolver never guesses.
- **Compute plane** — dispatched to your deployment. `compute()` is `POST`ed to `{SQAI_DEPLOYMENT_URL}/v1/libraries/execute`, which runs the signed capability library against the live source and returns the value plus its provenance.

| Env set | Mode | Query plane | Compute plane |
| --- | --- | --- | --- |
| _(none)_ | `local` | in-process | managed runtime, on your machine |
| `SQAI_DEPLOYMENT_URL` | `deployment` | in-process | `POST {SQAI_DEPLOYMENT_URL}/v1/libraries/execute` (your deployment) |

Files and SQLite work in **both** modes — they stay in-process even when a deployment is configured. Only live databases, warehouses, object storage, and APIs require `deployment`. SQAI provisions a live connection **once**, then keeps it warm: there is no per-query cold start.

## Point SQAI at your deployment

Mode is inferred from the environment — set the URL and the next `createSQAI()` / `create_sqai()` runs in `deployment` mode with no code change.

```bash
export SQAI_DEPLOYMENT_URL="https://sqai.example.com:8443"
```

If your deployment requires auth, set `SQAI_API_KEY` — the Bearer credential SQAI forwards to **your** deployment. It authenticates against your private infrastructure only; it never selects a SQAI cloud, and files/SQLite queried in-process never need it.

```bash
export SQAI_API_KEY="<token-your-sqai-deployment-accepts>"
```

{% hint style="warning" %}
The variable is `SQAI_DEPLOYMENT_URL` — do not set legacy engine-style URL variables. Local device credentials from `sqai login` live in `~/.sqai` and are unrelated to `SQAI_API_KEY`; that variable is only for the Bearer token your deployment accepts.
{% endhint %}

## The connector catalog

Every entry below is a SQAI connector **type string**. Use it directly in `testConnector(...)`, `createConnector(...)`, or `connect(..., { connector: ... })`.

| Group | Type strings |
|---|---|
| Relational | `postgres`, `postgresql`, `mysql`, `mssql`, `oracle`, `sqlite` |
| Warehouses | `snowflake`, `bigquery`, `clickhouse`, `redshift` |
| Object storage | `s3`, `gcs`, `azure` |
| NoSQL / graph / search | `redis`, `neo4j`, `elastic`, `elasticsearch` |
| APIs and files | `rest`, `rest_api`, `file`, `file_upload` |
| Code repos | `github_repo`, `gitlab_repo`, `bitbucket_repo`, `local_repo`, `repo_archive` |

{% hint style="success" %}
Oracle **is** supported with no Oracle client to install — SQAI ships a bundled Thin-mode driver. Relational sources take host fields; warehouses and DSN-style sources take a single `connection_string`. Both attach a read-only `table` or `query`.
{% endhint %}

Common aliases normalize before dispatch: `postgresql` → `postgres` and
`click_house` → `clickhouse`. The non-database aliases are listed on
[Object storage, NoSQL, REST & repos](object-stores-and-apis.md).

## Connect a database

The flow is: **test** the credentials (optional, fast, saves nothing), then **connect** with a `table` or a read-only `query`. `persist: true` keeps the connection warm for reuse; the returned source is immutable for the life of the process.

{% stepper %}
{% step %}
#### Preview-test the credentials

`testConnector` / `test_connector` opens a connection, checks it, and returns `{ success, message }` without registering anything — a fast credential check before you commit.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
import { createSQAI } from "@thyn-ai/sqai";

const sqai = createSQAI(); // deployment mode inferred from SQAI_DEPLOYMENT_URL

const preview = await sqai.testConnector({
  type: "postgres",
  host: "db.example.com",
  port: 5432,
  database: "sales",
  user: "readonly",
  password: process.env.PG_PASSWORD,
});

if (!preview.success) throw new Error(preview.message);
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
import os
from sqai import create_sqai

sqai = create_sqai()  # deployment mode inferred from SQAI_DEPLOYMENT_URL

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
```
{% endtab %}
{% endtabs %}

Use a **read-only** database role for `user`. SQAI has no write path — no `INSERT`, `UPDATE`, `DDL`, or `eval` — but scoping the credential itself is defense in depth.
{% endstep %}

{% step %}
#### Connect with host fields

Give SQAI the connection parameters plus a `table` (SQAI reads its schema) or a read-only `query`. Pass `null` as the first argument — the source comes from `connector`, not a path.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
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
    query: "select region, revenue, cost, units, order_date from orders",
  },
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
orders = sqai.connect(
    connector={
        "type": "postgres",
        "host": "db.example.com",
        "port": 5432,
        "database": "sales",
        "user": "readonly",
        "password": os.environ["PG_PASSWORD"],
        "query": "select region, revenue, cost, units, order_date from orders",
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

Warehouses and DSN-style sources take a single `connection_string` plus a `query`.

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

`createConnector(...)` / `create_connector(...)` takes the same descriptor when you want to register a **reusable** connector once and refer to it by name later, rather than inline it on every `connect()`.
{% endstep %}
{% endstepper %}

## What comes back

Every live source returns the same typed `SqaiSource` a file does — `name`, `source_id`, `dataset_id`, `fields`, `typed_fields`, `row_count`, `schema_revision`, `status`. SQAI infers the column types from the live schema and pins a `schema_revision` into every plan and computation that touches the source:

```json
{
  "name": "orders",
  "source_id": "…",
  "dataset_id": "…",
  "fields": ["region", "revenue", "cost", "units", "order_date"],
  "typed_fields": [
    { "name": "region", "type": "string" },
    { "name": "revenue", "type": "number" },
    { "name": "cost", "type": "number" },
    { "name": "units", "type": "number" },
    { "name": "order_date", "type": "date" }
  ],
  "row_count": 12,
  "schema_revision": "<64-hex, pinned per revision>",
  "status": "ready"
}
```

`schema_revision` is what makes an answer replayable: it is folded into every `plan_hash` and into each binding's provenance. Change the underlying table and a stored-plan replay surfaces a `schema_revision_mismatch` instead of silently returning different numbers.

{% hint style="info" %}
The typed shape is identical to a CSV's, so code you wrote against `sales.csv` in the [TypeScript quickstart](../quickstart-ts.md) runs unchanged against a Postgres `orders` source — only the `connect()` call differs.
{% endhint %}

## Query and compute against a live source

Once connected, a live source is just a name. The **query plane** still runs in-process — it resolves typed intent locally and only reads the rows it needs through the deployment.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const outcome = await sqai.ask({
  metric: "revenue",
  aggregation: "sum",     // sum | avg | count | min | max
  group_by: "region",
  order: "desc",
  source_name: "orders",  // the live source
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
outcome = sqai.ask(
    metric="revenue",
    aggregation="sum",     # sum | avg | count | min | max
    group_by="region",
    order="desc",
    source_name="orders",  # the live source
)
```
{% endtab %}
{% endtabs %}

`ask()` returns exactly one of `ok`, `needs_clarification`, or `rejected`, with `data.result`, `data.plan_hash`, and `data.schema_revision` on `ok` — the same outcome shape documented in the [quickstart](../quickstart-ts.md). It never guesses.

To run one of the **5,790 exposed read-only capabilities** over a live column, bind a source field into the computation instead of passing a literal. The value is dispatched to your deployment, and the result records **provenance** naming exactly what it read:

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const bound = await sqai.compute({
  module: "finance",
  function: "npv",                    // (rate, cashflows) -> float64
  args: [0.1],                        // rate stays literal
  bindings: [{ parameter: "cashflows", source: "orders", field: "revenue" }],
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
bound = sqai.compute(
    module="finance",
    function="npv",                    # (rate, cashflows) -> float64
    args=[0.1],                        # rate stays literal
    bindings=[{"parameter": "cashflows", "source": "orders", "field": "revenue"}],
)
```
{% endtab %}
{% endtabs %}

Each binding in `provenance.bindings` carries `source_name`, `fields`, `schema_revision`, `row_count`, and its own `input_hash`, so a result names precisely which live data it consumed — the same provenance a file-backed source produces. Every computation also carries an `invocation_hash`, a `computation_hash`, the `contract_hash` (`sha256:31247fb2…`), and a determinism envelope. See [Compute & filtering](../compute-and-filtering.md) and [Determinism & provenance](../determinism.md) for the full result shape.

{% hint style="info" %}
Discover capabilities before you bind: `searchCapabilities(query, limit = 10)` / `search_capabilities(...)` reads the embedded contract **in-process** — no deployment round-trip — and each entry carries a real one-line `summary`.
{% endhint %}

## Read-only, by construction

A live database connection does not loosen any guarantee:

- **No write path.** SQAI issues no `INSERT`, `UPDATE`, `DELETE`, or `DDL`, and there is no `eval`. The `query` you attach is read-only; the contract holds **0** write capabilities.
- **Immutable sources.** `connect()` binds a name to a schema revision for the life of the process. Re-connecting the same name to different data throws `source_already_registered` — never a silent overwrite. Re-connecting identical data returns the existing source.
- **Policy narrows, never widens.** Restrict which live sources and fields a model may touch with `allowedSources` / `allowedFields`, enforced in code and pre-execution — a denial throws `policy_denied_source` or `policy_denied_field` before anything is dispatched.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const sqai = createSQAI({
  tenantId: "tenant-a",
  policy: {
    allowedSources: ["orders"],
    allowedFields: { orders: ["region", "revenue", "units", "order_date"] },
    allowedFunctions: "all-readonly", // or an explicit list
  },
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
sqai = create_sqai(
    tenant_id="tenant-a",
    policy={
        "allowed_sources": ["orders"],
        "allowed_fields": {"orders": ["region", "revenue", "units", "order_date"]},
        "allowed_functions": "all-readonly",  # or an explicit list
    },
)
```
{% endtab %}
{% endtabs %}

Governance lives in code at construction time and is never reachable from model tool input. Full detail in [Policy & governance](../policy.md).

## When the deployment is unreachable

Failures are typed `SqaiError`s — `{ code, message, retryable, source, request_id }` — never a stack trace. A deployment that is down, slow, or rate-limiting surfaces as a **retryable** error so you can back off and retry:

| Code | `source` | Meaning |
|---|---|---|
| `compute_runtime_unavailable` | sqai / engine | Deployment unreachable — retryable. Message: _"Your private SQAI deployment is unreachable: <cause>. Check SQAI_DEPLOYMENT_URL / SQAI_API_KEY."_ |
| `network_error` · `timeout` · `service_unavailable` | engine | Transient deployment failure — retry with backoff. |
| `rate_limited` · `quota_exhausted` | engine | Deployment throttled you (HTTP 429 arrives as `quota_exhausted`) — retryable. |

Inspect the typed error — never parse the message (messages are sanitized of absolute paths before they can reach a model):

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
import { SqaiError } from "@thyn-ai/sqai";

try {
  await sqai.compute({
    module: "finance",
    function: "npv",
    args: [0.1],
    bindings: [{ parameter: "cashflows", source: "orders", field: "revenue" }],
  });
} catch (error) {
  if (error instanceof SqaiError) {
    console.error(error.code, error.source, error.retryable, error.requestId);
    if (error.retryable) {
      // safe to retry: compute_runtime_unavailable, rate_limited, timeout, …
    }
  }
}
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
from sqai import SqaiError

try:
    sqai.compute(
        module="finance",
        function="npv",
        args=[0.1],
        bindings=[{"parameter": "cashflows", "source": "orders", "field": "revenue"}],
    )
except SqaiError as error:
    print(error.code, error.source, error.retryable, error.request_id)
    if error.retryable:
        ...  # safe to retry
```
{% endtab %}
{% endtabs %}

{% hint style="warning" %}
If no bundle is published for your OS/arch, local compute raises `unsupported_platform` — pointing at a private SQAI deployment (`SQAI_DEPLOYMENT_URL`) is exactly how you run compute in that case. The query plane is unaffected either way: it runs in-process and needs no runtime. Every code and its one-line fix is in [Troubleshooting](../troubleshooting.md).
{% endhint %}

## Next steps

<table data-view="cards">
<thead><tr><th></th><th></th><th data-hidden data-card-target data-type="content-ref"></th></tr></thead>
<tbody>
<tr><td><strong>Connect your data</strong></td><td>Files, records, and SQLite in-process — the full connector catalog and per-source config.</td><td><a href="../connect-data.md">connect-data.md</a></td></tr>
<tr><td><strong>Licensing & accounts</strong></td><td>The no-cloud model, free device login, and the deployment env vars.</td><td><a href="../licensing.md">licensing.md</a></td></tr>
<tr><td><strong>Compute & filtering</strong></td><td>Bind live columns into any of the 5,790 exposed capabilities.</td><td><a href="../compute-and-filtering.md">compute-and-filtering.md</a></td></tr>
<tr><td><strong>Policy & governance</strong></td><td>Allowlist the exact sources and fields a model may touch — in code.</td><td><a href="../policy.md">policy.md</a></td></tr>
<tr><td><strong>Determinism & provenance</strong></td><td>What the hashes and the determinism envelope guarantee.</td><td><a href="../determinism.md">determinism.md</a></td></tr>
<tr><td><strong>Troubleshooting</strong></td><td>Every deployment error code and its one-line fix.</td><td><a href="../troubleshooting.md">troubleshooting.md</a></td></tr>
</tbody>
</table>
