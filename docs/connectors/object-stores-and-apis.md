---
icon: cloud-arrow-up
description: Connect S3/GCS/Azure object storage, Redis/Neo4j/Elasticsearch, REST APIs, and Git repos through a private SQAI deployment you run — credentials stay on your infrastructure, no data copied to any SQAI cloud.
---

# Object storage, NoSQL, REST & repos

Beyond relational databases and warehouses, SQAI reaches object storage, NoSQL/graph/search engines, REST APIs, and Git repositories. All of them are **managed connectors**: SQAI never routes them through a cloud it operates. You point the SDK at a **private SQAI deployment** — infrastructure you run, on your network — and it reads schema and rows on demand. Credentials stay on that deployment, and **no data is copied to any SQAI service**. The `cloud-arrow-up` here means *your* cloud, reached through *your* deployment.

Every one of these returns the same typed `SqaiSource` a CSV does. Once connected, an S3 object, an Elasticsearch index, a REST endpoint, or a repo tree is just a **name** — nothing downstream (`ask()`, `compute()`, policy, provenance) knows or cares where the rows came from.

{% hint style="info" %}
This page covers the **non-relational** managed connectors. For PostgreSQL/MySQL/Oracle/SQL Server and the warehouses, see [Databases via your private deployment](databases.md). For files, in-memory rows, and SQLite — all **in-process, no deployment, no key** — see [Files & SQLite](files.md) and [Connect your data](../connect-data.md).
{% endhint %}

## What this page connects

Every entry below is a SQAI connector **type string**. Unlike files and SQLite, all of them are live or network sources, so they run through a private SQAI deployment — set `SQAI_DEPLOYMENT_URL` first (next section).

| Group | Type strings | Common aliases |
|---|---|---|
| Object storage | `s3`, `gcs`, `azure` | — |
| NoSQL / graph / search | `redis`, `neo4j`, `elastic`, `elasticsearch` | `redis_cache` → `redis`, `elastic` → `elasticsearch` |
| REST & files | `rest`, `rest_api`, `file`, `file_upload` | `rest_api` → `rest`, `file_upload` → `file` |
| Code repos | `github_repo`, `gitlab_repo`, `bitbucket_repo`, `local_repo`, `repo_archive` | `github` / `github_repository` → `github_repo`, `gitlab` / `gitlab_repository` → `gitlab_repo`, `bitbucket` / `bitbucket_repository` → `bitbucket_repo`, `local_repository` → `local_repo`, `archive_repository` → `repo_archive` |

Aliases resolve to the canonical type, so `type: "github"` and `type: "github_repo"` are the same connector. `local_repo` and `repo_archive` read a path on the deployment host rather than a remote URL, but still run through the same managed connector surface.

{% hint style="success" %}
The `config` on a connector descriptor is a **passthrough** — SQAI forwards it verbatim to the driver on your deployment. The two fields the SDK itself understands everywhere are `connection_string` and a read-only `query`/`table` selector; every other key (bucket, region, index, base URL, auth headers, repo ref, local path) is a provider parameter your deployment's driver interprets. That is why the SDK's connector config type is an open record, not a fixed schema.
{% endhint %}

## Point SQAI at your deployment

Mode is inferred from the environment — set the URL and the next `createSQAI()` / `create_sqai()` runs in `deployment` mode with no code change.

```bash
export SQAI_DEPLOYMENT_URL="https://sqai.example.com:8443"
```

If your deployment requires auth, set `SQAI_API_KEY` — the Bearer credential SQAI forwards to **your** deployment. It authenticates against your private infrastructure only; it never selects a SQAI cloud.

```bash
export SQAI_API_KEY="<token-your-sqai-deployment-accepts>"
```

{% hint style="warning" %}
The variable is `SQAI_DEPLOYMENT_URL` — do not set legacy engine-style URL variables. See [Databases via your private deployment](databases.md#point-sqai-at-your-deployment) for the full two-plane routing table; it applies identically to every connector on this page.
{% endhint %}

## The managed-connector lifecycle

These connectors give you more surface than the inline `connect(..., { connector })` form used for databases. You can **test** credentials, **create** a named reusable connector, **browse** it to discover what is inside, and **connect** either inline or by reference.

| Method (TypeScript / Python) | Returns | What it does |
|---|---|---|
| `testConnector` / `test_connector` | `{ success, message, latency_ms, status, error_type, recoverable }` | Opens the connection, checks it, registers nothing. |
| `createConnector` / `create_connector` | `{ id, name, connector_type, status, visibility, last_tested_at, created_at }` | Saves a **reusable, named** connector on the deployment. |
| `browseConnector` / `browse_connector` | `{ connector_type, items, total, message, labels, discovery }` | Lists what a source exposes — buckets/objects, indices, repo files — without materializing data. |
| `listConnectors` / `list_connectors` | `{ connectors, total, page, limit, pages }` | Pages through the connectors you have created. |
| `getConnector` · `updateConnector` · `deleteConnector` | `SqaiConnectorInfo` / `void` | Fetch, edit config, or remove a saved connector by `id`. |
| `connect` | `SqaiSource` | Registers a **source** from an inline `connector`, a saved `connectorId`, and an optional `selection`. |

{% hint style="info" %}
`testConnector`, `createConnector`, `browseConnector`, and friends require the deployment substrate. If your installed package predates them, the SDK throws a typed `unsupported_operation` (`"The installed SQAI package does not provide …; upgrade SQAI."`) instead of failing opaquely.
{% endhint %}

## Object storage — S3, GCS, Azure

Point at tabular objects (CSV, JSON, Parquet) in a bucket and SQAI's deployment reads them into a typed source. Give the connector a `connection_string` (a bucket/prefix URI) plus whatever credential and region keys your deployment's object-storage driver expects — those pass straight through `config`.

{% stepper %}
{% step %}
#### Test, then connect

Preview-test first for a fast credential check that saves nothing, then `connect()` with the same descriptor.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
import { createSQAI } from "@thyn-ai/sqai";

const sqai = createSQAI(); // deployment mode inferred from SQAI_DEPLOYMENT_URL

const preview = await sqai.testConnector({
  type: "s3",
  connection_string: "s3://analytics-exports/orders/",
  region: "us-east-1",              // provider key, forwarded to the driver
});

if (!preview.success) throw new Error(preview.message);

const orders = await sqai.connect(null, {
  datasetName: "orders",
  persist: true,
  connector: {
    type: "s3",
    connection_string: "s3://analytics-exports/orders/2026-*.parquet",
    region: "us-east-1",
  },
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
from sqai import create_sqai

sqai = create_sqai()  # deployment mode inferred from SQAI_DEPLOYMENT_URL

preview = sqai.test_connector(
    type="s3",
    connection_string="s3://analytics-exports/orders/",
    region="us-east-1",              # provider key, forwarded to the driver
)

if not preview["success"]:
    raise RuntimeError(preview["message"])

orders = sqai.connect(
    connector={
        "type": "s3",
        "connection_string": "s3://analytics-exports/orders/2026-*.parquet",
        "region": "us-east-1",
    },
    dataset_name="orders",
    persist=True,
)
```
{% endtab %}
{% endtabs %}

`gcs` (`gs://…`) and `azure` (`https://<account>.blob.core.windows.net/<container>/…`) take the same shape — a `connection_string` URI plus the account/credential keys their driver expects. Point at CSV/JSON/Parquet objects and the deployment infers the columns.
{% endstep %}
{% endstepper %}

## NoSQL, graph & search — Redis, Neo4j, Elasticsearch

Non-tabular engines connect through a `connection_string` and a **read-only** selector written in the source's own dialect. SQAI's query plane still resolves typed intent in-process; the connector on your deployment shapes the underlying store into rows.

| Type | Selector you attach | Reads |
|---|---|---|
| `elasticsearch` / `elastic` | an index/query selection | documents in an index, flattened to typed fields |
| `neo4j` | a read-only Cypher `query` | rows of a `MATCH … RETURN …` |
| `redis` | a key pattern / read command | values under a keyspace |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const events = await sqai.connect(null, {
  datasetName: "events",
  persist: true,
  connector: {
    type: "elasticsearch",
    connection_string: "https://search.example.com:9200",
    query: "orders-2026-*",          // index pattern; read-only
  },
});

const graph = await sqai.connect(null, {
  datasetName: "graph",
  persist: true,
  connector: {
    type: "neo4j",
    connection_string: "neo4j+s://graph.example.com:7687",
    query: "MATCH (r:Region)<-[:IN]-(o:Order) RETURN r.name AS region, o.revenue AS revenue",
  },
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
events = sqai.connect(
    connector={
        "type": "elasticsearch",
        "connection_string": "https://search.example.com:9200",
        "query": "orders-2026-*",          # index pattern; read-only
    },
    dataset_name="events",
    persist=True,
)

graph = sqai.connect(
    connector={
        "type": "neo4j",
        "connection_string": "neo4j+s://graph.example.com:7687",
        "query": "MATCH (r:Region)<-[:IN]-(o:Order) RETURN r.name AS region, o.revenue AS revenue",
    },
    dataset_name="graph",
    persist=True,
)
```
{% endtab %}
{% endtabs %}

The selector is read-only in every dialect: a Cypher `query` is a `MATCH … RETURN`, an ES selection is a search, a Redis pattern is a read. SQAI opens no write path in any of them.

## REST APIs

A `rest` (alias `rest_api`) connector turns a JSON endpoint into a typed source: point `connection_string` at the base URL, pass any auth headers your deployment's HTTP driver needs through `config`, and use `selection`/`query` to pick the collection or path whose records become rows.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const invoices = await sqai.connect(null, {
  datasetName: "invoices",
  persist: true,
  connector: {
    type: "rest",
    connection_string: "https://api.example.com/v2",
    // Provider keys, forwarded verbatim to the deployment's HTTP driver:
    headers: { Authorization: `Bearer ${process.env.INVOICES_TOKEN}` },
    query: "/invoices?status=paid",  // read-only GET path
  },
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
import os

invoices = sqai.connect(
    connector={
        "type": "rest",
        "connection_string": "https://api.example.com/v2",
        # Provider keys, forwarded verbatim to the deployment's HTTP driver:
        "headers": {"Authorization": f"Bearer {os.environ['INVOICES_TOKEN']}"},
        "query": "/invoices?status=paid",  # read-only GET path
    },
    dataset_name="invoices",
    persist=True,
)
```
{% endtab %}
{% endtabs %}

The response array is flattened into `typed_fields` and pinned with a `schema_revision`, exactly like any other source. SQAI issues reads only — there is no route to `POST`/`PUT`/`DELETE` through a connector.

## Code repositories

Repo connectors index a source tree into a typed source you can query and compute over — file paths, sizes, languages, commit metadata, and text become rows. `github_repo`, `gitlab_repo`, and `bitbucket_repo` read a remote URL; `local_repo` reads a checkout on the deployment host; `repo_archive` reads a `.tar`/`.zip` snapshot.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const repo = await sqai.connect(null, {
  datasetName: "repo",
  persist: true,
  connector: {
    type: "github_repo",
    connection_string: "https://github.com/acme/monorepo",
    // Provider keys forwarded to the driver (private repos):
    token: process.env.GITHUB_TOKEN,
    ref: "main",
  },
});

// A local checkout — no remote fetch, still a managed connector:
const local = await sqai.connect(null, {
  datasetName: "local",
  connector: { type: "local_repo", path: "/srv/checkouts/monorepo" },
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
import os

repo = sqai.connect(
    connector={
        "type": "github_repo",
        "connection_string": "https://github.com/acme/monorepo",
        # Provider keys forwarded to the driver (private repos):
        "token": os.environ["GITHUB_TOKEN"],
        "ref": "main",
    },
    dataset_name="repo",
    persist=True,
)

# A local checkout — no remote fetch, still a managed connector:
local = sqai.connect(
    connector={"type": "local_repo", "path": "/srv/checkouts/monorepo"},
    dataset_name="local",
)
```
{% endtab %}
{% endtabs %}

`gitlab_repo` and `bitbucket_repo` take the same shape with their own host; `repo_archive` points `connection_string` (or a `path`) at an archive file. Everything is read-only: SQAI never pushes, commits, or mutates a tree.

## Browse before you bind

`browseConnector` / `browse_connector` lists what a source exposes — buckets and objects, indices, repo files — **without materializing any rows**. Use it to discover the exact object, index, or path to name in `selection` before you `connect()`.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const browse = await sqai.browseConnector({
  type: "s3",
  connection_string: "s3://analytics-exports/",
  region: "us-east-1",
});

console.log(browse.total);   // how many items were discovered
console.log(browse.items);   // [{ key: "orders/2026-01.parquet", ... }, …]
console.log(browse.labels);  // human labels for the columns of `items`
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
browse = sqai.browse_connector(
    type="s3",
    connection_string="s3://analytics-exports/",
    region="us-east-1",
)

print(browse["total"])   # how many items were discovered
print(browse["items"])   # [{"key": "orders/2026-01.parquet", ...}, ...]
print(browse["labels"])  # human labels for the columns of `items`
```
{% endtab %}
{% endtabs %}

The `discovery` map describes how the listing was produced; `items` is a plain list of records you can page through. Browse is a listing, never a data read — it does not register a source.

## Reuse a connector by name

For sources you connect to repeatedly, `createConnector` / `create_connector` saves the descriptor **once** on the deployment and returns a `SqaiConnectorInfo` with a stable `id`. Later, `connect()` by `connectorId` and narrow what you materialize with `selection`.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const info = await sqai.createConnector({
  name: "exports",
  connectorType: "s3",
  visibility: "tenant",
  config: {
    connection_string: "s3://analytics-exports/",
    region: "us-east-1",
  },
});

const jan = await sqai.connect(null, {
  datasetName: "jan_orders",
  connectorId: info.id,
  selection: { object: "orders/2026-01.parquet" }, // narrows what materializes
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
info = sqai.create_connector(
    name="exports",
    connector_type="s3",
    visibility="tenant",
    config={
        "connection_string": "s3://analytics-exports/",
        "region": "us-east-1",
    },
)

jan = sqai.connect(
    connector_id=info["id"],
    dataset_name="jan_orders",
    selection={"object": "orders/2026-01.parquet"},  # narrows what materializes
)
```
{% endtab %}
{% endtabs %}

`listConnectors` pages through what you have saved; `getConnector`, `updateConnector`, and `deleteConnector` fetch, edit `config`, and remove one by `id`.

## What comes back

Every source on this page returns the same typed `SqaiSource` a CSV does — `name`, `source_id`, `dataset_id`, `fields`, `typed_fields`, `row_count`, `schema_revision`, `status`. SQAI infers types from the live schema and pins a `schema_revision` into every plan and computation that touches it:

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

Because the shape is identical, code you wrote against a CSV or a Postgres table runs unchanged against an S3 object, an Elasticsearch index, or a repo tree — only the `connect()` call differs. `schema_revision` is folded into every `plan_hash` and each binding's provenance: change the object, the index, or the branch behind a source and a stored-plan replay surfaces `schema_revision_mismatch` instead of silently returning different numbers.

## Query and compute over it

Once connected, a managed source is just a name. The **query plane** resolves typed intent **in-process** and reads only the rows it needs through your deployment; it never guesses a column.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const outcome = await sqai.ask({
  metric: "revenue",
  aggregation: "sum",     // sum | avg | count | min | max
  group_by: "region",
  order: "desc",
  source_name: "orders",  // the S3-backed source
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
    source_name="orders",  # the S3-backed source
)
```
{% endtab %}
{% endtabs %}

`ask()` returns exactly one of `ok`, `needs_clarification`, or `rejected`. To run one of the **5,790 exposed read-only capabilities** over a live column, bind a source field into the computation instead of passing a literal. The example below runs the same `finance.npv(rate, cashflows)` that returns `505.020148896933` from the literal args `(0.1, [-1000, 300, 420, 560, 680])` — here over the `revenue` column of the object-store source:

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const result = await sqai.compute({
  module: "finance",
  function: "npv",                    // (rate, cashflows) -> float64
  args: [0.1],                        // rate stays literal
  bindings: [{ parameter: "cashflows", source: "orders", field: "revenue" }],
});

console.log(result.value);
console.log(result.provenance.bindings);
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
result = sqai.compute(
    module="finance",
    function="npv",                    # (rate, cashflows) -> float64
    args=[0.1],                        # rate stays literal
    bindings=[{"parameter": "cashflows", "source": "orders", "field": "revenue"}],
)

print(result["value"])
print(result["provenance"]["bindings"])
```
{% endtab %}
{% endtabs %}

The value is the NPV over the live `revenue` column, and each binding in `provenance.bindings` records `source_name`, `fields`, `schema_revision`, `row_count`, and its own `input_hash` — full lineage from the remote object to the number, identical to what a CSV produces:

```json
{
  "provenance": {
    "bindings": [
      {
        "source_name": "orders",
        "fields": ["revenue"],
        "schema_revision": "<64-hex>",
        "row_count": 12,
        "input_hash": "<64-hex>"
      }
    ]
  }
}
```

Every computation also carries an `invocation_hash`, a `computation_hash`, the `contract_hash` (`sha256:31247fb2…`), and a determinism envelope. See [Compute & filtering](../compute-and-filtering.md) and [Determinism & provenance](../determinism.md) for the full result shape.

{% hint style="info" %}
Discover capabilities before you bind: `searchCapabilities(query, limit = 10)` / `search_capabilities(...)` reads the embedded contract **in-process** — no deployment round-trip — and each entry carries a real one-line `summary`.
{% endhint %}

## Read-only, by construction

A network connector loosens no guarantee:

- **No write path.** SQAI issues no writes over any connector — no object `PUT`, no `INSERT`/`UPDATE`, no Cypher mutation, no `POST`, no `git push`. The selector you attach is read-only, and the contract holds **0** write capabilities.
- **Immutable sources.** `connect()` binds a name to a schema revision for the life of the process. Re-connecting the same name to different data throws `source_already_registered` — never a silent overwrite. Re-connecting identical data returns the existing source.
- **Policy narrows, never widens.** Restrict which sources and fields a model may touch with `allowedSources` / `allowedFields`, enforced in code and pre-execution — a denial throws `policy_denied_source` or `policy_denied_field` before anything is dispatched.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const sqai = createSQAI({
  tenantId: "tenant-a",
  policy: {
    allowedSources: ["orders", "events"],
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
        "allowed_sources": ["orders", "events"],
        "allowed_fields": {"orders": ["region", "revenue", "units", "order_date"]},
        "allowed_functions": "all-readonly",  # or an explicit list
    },
)
```
{% endtab %}
{% endtabs %}

Governance lives in code at construction time and is never reachable from model tool input. Full detail in [Policy & governance](../policy.md).

## Errors you might see

Every failure is a typed `SqaiError` — `{ code, message, retryable, source, requestId }`, with `source: "engine" | "sqai"` — never a stack trace. Inspect the typed error; never parse the message (messages are sanitized of absolute paths before they can reach a model).

| Code | `source` | When | Fix |
|---|---|---|---|
| `unsupported_operation` | sqai | Installed package lacks `testConnector`/`browseConnector`/etc. | Upgrade SQAI to a build with the managed-connector surface. |
| `compute_runtime_unavailable` | sqai / engine | Deployment unreachable — **retryable**. | Check `SQAI_DEPLOYMENT_URL` / `SQAI_API_KEY`, then back off and retry. |
| `network_error` · `timeout` · `service_unavailable` | engine | Transient deployment or upstream failure. | Retry with backoff — these are marked retryable. |
| `rate_limited` · `quota_exhausted` | engine | Deployment or upstream API throttled you (HTTP 429 → `quota_exhausted`). | Retryable — back off. |
| `source_already_registered` | sqai | Re-connecting a `name` with changed data. | Use a new `name`, or restart the client — sources are immutable. |
| `policy_denied_source` · `policy_denied_field` | sqai | The source or field is not on the allowlist. | Widen the policy in code, or bind an allowed field. |

A `testConnector` result surfaces the same failure detail without throwing — check `success`, then `error_type` and `recoverable` before you commit to a `connect()`:

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const preview = await sqai.testConnector({ type: "s3", connection_string: "s3://exports/" });
if (!preview.success) {
  console.error(preview.error_type, preview.message, preview.recoverable);
}
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
preview = sqai.test_connector(type="s3", connection_string="s3://exports/")
if not preview["success"]:
    print(preview["error_type"], preview["message"], preview["recoverable"])
```
{% endtab %}
{% endtabs %}

{% hint style="warning" %}
Managed connectors need a reachable deployment: with none configured, the query plane still runs in-process, but a live `connect()` or `compute()` has nowhere to dispatch. Set `SQAI_DEPLOYMENT_URL`. Every code and its one-line fix is in [Troubleshooting](../troubleshooting.md).
{% endhint %}

## Next steps

<table data-view="cards">
<thead><tr><th></th><th></th><th data-hidden data-card-target data-type="content-ref"></th></tr></thead>
<tbody>
<tr><td><strong>Databases</strong></td><td>PostgreSQL, MySQL, Oracle, SQL Server, and the warehouses via your deployment.</td><td><a href="databases.md">databases.md</a></td></tr>
<tr><td><strong>Files &amp; SQLite</strong></td><td>CSV, TSV, JSON, rows, and SQLite — fully in-process, no deployment, no key.</td><td><a href="files.md">files.md</a></td></tr>
<tr><td><strong>Connect your data</strong></td><td>The full front door — every connector and the two-plane model behind <code>connect()</code>.</td><td><a href="../connect-data.md">connect-data.md</a></td></tr>
<tr><td><strong>Compute &amp; filtering</strong></td><td>Bind a live column into any of the 5,790 exposed capabilities.</td><td><a href="../compute-and-filtering.md">compute-and-filtering.md</a></td></tr>
<tr><td><strong>Policy &amp; governance</strong></td><td>Allowlist the exact sources and fields a model may touch — in code.</td><td><a href="../policy.md">policy.md</a></td></tr>
<tr><td><strong>Determinism &amp; provenance</strong></td><td>What the hashes and the determinism envelope guarantee.</td><td><a href="../determinism.md">determinism.md</a></td></tr>
</tbody>
</table>
