---
icon: compass
description: SQAI is the governed, read-only structured-data tool for AI agents — typed, policy-checked plans run on a SQAI runtime, every answer carrying replayable hashes.
layout:
  outline:
    visible: false
---

# Overview

SQAI (Structured Query AI) is the governed, read-only structured-data tool for AI agents. A natural-language or typed question becomes a typed, policy-checked plan, the plan runs on the SQAI runtime, and you get the answer plus full provenance. Query CSVs and databases — including Oracle — alongside 6,084 read-only compute capabilities, from `stats.median` to `finance.npv` to `option_pricing.black_scholes_call`. Every capability is side-effect-free, and every result carries hashes that replay it exactly.

Setup is one free device login. The query plane runs in-process — no separate service — and returns in sub-millisecond to low-millisecond time on typical files. Run `sqai login` once for the free `sqai_developer` key; the compute runtime then provisions **once** (the first-ever call downloads, extracts, and initializes the bundle in ~110s), then stays warm and resident: there is no cold start per query. Every later `compute()` is warm — `finance.npv` measured at ~0.9ms.

{% hint style="info" %}
New to SQAI? Start with the [Quickstart](quickstart-ts.md) — connect a file and get a typed, hashed answer in minutes.
{% endhint %}

## Start here

<table data-view="cards">
<thead><tr><th></th><th></th><th data-hidden data-card-target data-type="content-ref"></th></tr></thead>
<tbody>
<tr><td><strong>Quickstart</strong></td><td>Install, connect a CSV, and get a typed, hashed answer.</td><td><a href="quickstart-ts.md">quickstart-ts.md</a></td></tr>
<tr><td><strong>Installation</strong></td><td>npm, pnpm, yarn, bun, or pip. No separate service to run.</td><td><a href="installation.md">installation.md</a></td></tr>
<tr><td><strong>Connect your data</strong></td><td>CSVs, SQLite, Excel/Parquet, and live databases — Postgres, Oracle, and more. Same API in Python.</td><td><a href="connect-data.md">connect-data.md</a></td></tr>
<tr><td><strong>Vercel AI SDK tool</strong></td><td>Give any agent governed, read-only data and compute tools.</td><td><a href="ai-sdk-tools.md">ai-sdk-tools.md</a></td></tr>
</tbody>
</table>

## Concepts and governance

<table data-view="cards">
<thead><tr><th></th><th></th><th data-hidden data-card-target data-type="content-ref"></th></tr></thead>
<tbody>
<tr><td><strong>How it works</strong></td><td>Question → typed plan → deterministic execution → provenance.</td><td><a href="concepts.md">concepts.md</a></td></tr>
<tr><td><strong>Compute &#38; filtering</strong></td><td>6,084 side-effect-free capabilities; bind arguments to columns.</td><td><a href="compute-and-filtering.md">compute-and-filtering.md</a></td></tr>
<tr><td><strong>Determinism &#38; provenance</strong></td><td>Replayable hashes; same input → identical hash.</td><td><a href="determinism.md">determinism.md</a></td></tr>
<tr><td><strong>Policy &#38; governance</strong></td><td>Allow-list sources, fields, and functions; read-only by construction.</td><td><a href="policy.md">policy.md</a></td></tr>
</tbody>
</table>

## Install

{% tabs %}
{% tab title="npm" icon="npm" %}
```bash
npm install @thyn-ai/sqai
```
{% endtab %}
{% tab title="pnpm" icon="cube" %}
```bash
pnpm add @thyn-ai/sqai
```
{% endtab %}
{% tab title="yarn" icon="yarn" %}
```bash
yarn add @thyn-ai/sqai
```
{% endtab %}
{% tab title="bun" icon="bowl-food" %}
```bash
bun add @thyn-ai/sqai
```
{% endtab %}
{% tab title="pip" icon="python" %}
```bash
pip install sqai
```
{% endtab %}
{% endtabs %}

The query plane needs nothing else — no separate service. Run `sqai login` once, then the compute runtime auto-provisions on the first `compute()` and stays warm. For the AI SDK tool add `@thyn-ai/sqai-ai-sdk`; for the CLI add `@thyn-ai/sqai-cli`. See [Installation](installation.md).

## A first look

Run a computation. The result is the answer plus everything needed to replay it — hashes, contract version, and the exact runtime it ran on.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
import { createSQAI } from "@thyn-ai/sqai";

const sqai = createSQAI();

const result = await sqai.compute({
  module: "finance",
  function: "npv",
  args: [0.1, [-1000, 300, 420, 560, 680]],
});

console.log(result.value); // 505.020148896933
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
from sqai import create_sqai

sqai = create_sqai()

result = sqai.compute(
    module="finance",
    function="npv",
    args=[0.1, [-1000, 300, 420, 560, 680]],
)

print(result["value"])  # 505.020148896933
```
{% endtab %}
{% endtabs %}

Both calls return the same result:

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

The `value` and both hashes are byte-identical in TypeScript and Python. Call it again and `computation_hash` is identical again — `same input → same hash`, forever. That is what makes an answer auditable and replayable. See [Determinism & provenance](determinism.md).

## What you can query

**Data sources.** In-process, with no key: CSV, TSV, JSON, in-memory row arrays, `{ records: [...] }`, and SQLite files; Excel and Parquet in Python. Through a private SQAI deployment (`SQAI_DEPLOYMENT_URL`, with `SQAI_API_KEY` only if it requires auth) — a private SQAI deployment on your own infrastructure, no SQAI cloud: PostgreSQL, MySQL, Oracle (bundled Thin-mode driver), Microsoft SQL Server, Snowflake, BigQuery, ClickHouse, Amazon Redshift; S3 / GCS / Azure Blob; Redis / Neo4j / Elasticsearch; REST APIs; and Git repos. Access is governed, credentials stay on your SQAI deployment, and no data is copied. See [Connect your data](connect-data.md).

**Compute.** 6,084 capabilities in total, all read-only and side-effect-free; 5,790 exposed to the TypeScript, Python, and AI SDKs; 5,780 fully deterministic and 10 seed-required simulations. Breadth spans statistics, hypothesis testing, probability and distributions, time series, linear algebra, finance and risk, option pricing, ML and metrics, signal/DSP, information theory, number theory, calculus and root-finding, and optimization — plus an LLM-infra pack (`flash_attention`, `kv_cache`, `moe_routing`, `rag_retrieval`, `embeddings`) and 100+ applied-science and engineering domain packs. `searchCapabilities` returns a one-line summary for each. See [Compute & filtering](compute-and-filtering.md).

Bind a compute argument to a live column and the result carries binding provenance — the source, fields, `schema_revision`, `row_count`, and `input_hash` it read. That is how an agent's numbers stay traceable to your data.
