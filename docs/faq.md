---
icon: circle-question
description: Short answers on read-only guarantees, what leaves your machine, keys, speed, determinism, platforms, data sources, and cost.
---

# FAQ

SQAI (Structured Query AI) turns a question into a typed, policy-checked plan, runs it on a SQAI runtime, and returns the answer plus replayable hashes. Short answers below; each links to the page with the full story.

{% hint style="info" %}
New here? Read the [Overview](README.md), then the [Quickstart](quickstart-ts.md) — connect a file and get a typed, hashed answer in minutes.
{% endhint %}

## What is SQAI?

**Structured Query AI** — the governed, read-only structured-data tool for AI agents. A natural-language or typed question becomes a typed, policy-checked plan; the plan runs on the SQAI runtime; you get the answer plus full provenance. Query CSVs and databases — including Oracle — alongside 6,084 read-only compute capabilities, from `stats.median` to `finance.npv` to `option_pricing.black_scholes_call`. See [Overview](README.md).

## Is it really read-only?

Yes, by construction. The model authors typed intent; SQAI validates it against a generated, hash-pinned capability contract, applies your policy, and delegates execution. No raw SQL, no `eval`, no write path. Only capabilities that are `read_only && (deterministic || deterministic_when_seeded)` are exposed — the `write` and `non_deterministic` categories are absent from the packaged surface entirely, so no policy setting can reach them. See [Policy & governance](policy.md).

## What data leaves my machine?

In the default `local` mode, nothing does. The query plane resolves and executes in-process; the compute plane is a signed on-device runtime that provisions itself once and stays local, running **on your machine** as a local runtime process. The one outbound call is the first-use download of the signed runtime bundle from Cloudflare R2 — runtime code, not your rows. In `deployment` mode, plans are POSTed to the private SQAI deployment.

| Mode | Trigger | Query plane | Compute plane |
|---|---|---|---|
| `local` (default) | no env | in-process, nothing leaves | signed on-device runtime on your machine |
| `deployment` | `SQAI_DEPLOYMENT_URL` | in-process | POST `{deploymentUrl}/v1/libraries/execute` to your SQAI deployment |

When a tool result is oversized, the model receives only a truncated preview plus an opaque `result_id`; the full value stays server-side and is fetched with `getResult(id)` / `get_result(id)`. See [Vercel AI SDK tool](ai-sdk-tools.md).

## Do I need an API key or account?

Yes: run `sqai login` once for the free `sqai_developer` device key. It is licensing only; your data stays on your machine, and the signed on-device runtime provisions itself transparently on the first compute call. `SQAI_DEPLOYMENT_URL` is only needed to point SQAI at a private SQAI deployment; `SQAI_API_KEY`, if set, is only the Bearer credential forwarded to that private SQAI deployment when it requires auth — it does not select any cloud (there is no SQAI cloud).

## Is it fast?

Yes, and there is no per-query cold start. The query plane is in-process — sub-millisecond to low-millisecond on typical files (the sample `ask` returned `latency_ms: 0`). The compute runtime provisions **once**: the first-ever call downloads, extracts, and initializes the bundle (~110s), then stays warm and resident. Every later `compute()` is warm — `finance.npv` measured at 0.83–0.93 ms. One-time setup, then instant; the runtime stays running.

## How is it deterministic — and identical in TypeScript and Python?

Deterministic **within the declared execution scope**, not bit-identical across all hardware; every result carries the scope so a replay asserts like-for-like. Three hashes anchor it:

- `plan_hash` — query plane, sha256 over the canonical null-stripped plan.
- `invocation_hash` — compute plane, known **before** execution over `{module, function, args, kwargs, resolved_bindings, seed, contract_hash, execution_scope}`.
- `computation_hash` — known **after**, over `invocation_hash + result`.

The canonical serializer is conformance-locked, so the same computation yields the same numbers and byte-identical hashes in both SDKs. `finance.npv(0.1, [-1000, 300, 420, 560, 680])` returns `505.020148896933` with `computation_hash b74f67d0…` in TypeScript and Python alike. Call it twice and the hash is identical again:

```json
{
  "run1": "b74f67d0d7a594aa7ac91f6291612452aa8ccdf603351ebc8d801a6fddd91bc8",
  "run2": "b74f67d0d7a594aa7ac91f6291612452aa8ccdf603351ebc8d801a6fddd91bc8",
  "identical": true
}
```

See [Determinism & provenance](determinism.md).

## Which data sources can I query?

In-process, with no key: CSV, TSV, JSON, in-memory row arrays, `{ records: [...] }`, and SQLite files; Excel and Parquet in Python. Through a private SQAI deployment (`SQAI_DEPLOYMENT_URL`): PostgreSQL, MySQL, Oracle (bundled Thin-mode driver), Microsoft SQL Server, Snowflake, BigQuery, ClickHouse, Amazon Redshift; S3 / GCS / Azure Blob; Redis / Neo4j / Elasticsearch; REST APIs; and Git repos. Files and SQLite run in-process; live databases — **including Oracle** — connect through a private SQAI deployment (`SQAI_DEPLOYMENT_URL`). Access is governed, credentials are encrypted, and no data is copied. See [Connect your data](connect-data.md).

## Which platforms are supported?

The signed runtime bundle (v0.1.0) is published for **darwin-arm64** and **linux-x64**. Windows is not published — an on-device runtime call there returns a structured `unsupported_platform` rather than crashing. Requirements: Node ≥20 (checked by `sqai doctor`), Python ≥3.10. The `deployment` mode runs anywhere, since compute is POSTed to your SQAI deployment. See [Installation](installation.md).

## How does runtime filtering / build-on-provision work?

By default SQAI installs the pinned bundle covering the whole exposed surface. Set `runtimeModules` (config) or `SQAI_RUNTIME_MODULES` (env, comma-separated) to compile and install only a subset: SQAI calls the build service (`POST {buildServiceUrl}/v1/runtime/build`, default `https://sqai-buildservice.fly.dev`) with `{modules, platform}`, receives a signed, sha256-pinned bundle, and caches it by a filter cache-key. Filtered runtime processes get their own socket/port so they never collide. Setting a filter with no build service configured fails with `runtime_provision_failed` (`reason: no_build_service`). See [Compute & filtering](compute-and-filtering.md).

## Can the model widen my policy?

No. Policy is configured once in code at `createSQAI()` / `SQAI(...)` and is unreachable from model tool input — the AI SDK schemas carry no `allowed*` field of any kind. An explicit `allowedFunctions` list can only **narrow**; naming a non-eligible capability still throws `unsupported_operation`. The packaged surface is the ceiling. See [Policy & governance](policy.md).

## Is there an escape hatch?

Yes: `getUnsafeRuntime` from `@thyn-ai/sqai/unsafe` (Python: `get_unsafe_runtime` from `sqai.unsafe`). It bypasses the contract, policy, seed checks, and parity, and is **never** exposed to the AI SDK. Prefer `compute` / `ask` for anything a model touches.

## Free or paid?

Local development and the on-device compute plane are free after `sqai login` enrolls the machine on the `sqai_developer` tier. The license is device-bound and local compute still runs with no data leaving your machine. For production or serverless (where a deployed function should not host the runtime), point SQAI at a private SQAI deployment (`SQAI_DEPLOYMENT_URL`; `SQAI_API_KEY` is only the Bearer credential it forwards when your SQAI deployment requires auth). See [Licensing & accounts](licensing.md).

## What powers execution?

SQAI validates, authorizes, and hashes; a bundled SQAI runtime computes. Full attribution and third-party licenses live in the `NOTICE` file shipped with each package.

## Still stuck?

The AI SDK tools never throw — check `output.status === "error"` and `output.code`. For everything else, see [Troubleshooting](troubleshooting.md), or run `sqai doctor --parity --json`.
