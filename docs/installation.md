---
icon: download
description: Install the SQAI SDKs, AI SDK tools, and CLI — the query plane runs in-process immediately, and the compute runtime provisions once, then stays warm.
---

# Installation

SQAI ships as three npm packages and one PyPI package, all pinned to the same hash-locked capability contract (`sha256:31247fb2…`) and the same signed runtime bundle (`v0.1.0`). Install only the surface you need — the TypeScript SDK, the Vercel AI SDK tools, the CLI, or the Python SDK. The TypeScript and Python SDKs expose the identical API and produce byte-identical provenance hashes.

Nothing to provision up front. The **query plane** runs entirely in-process the moment you install — no server or Docker. Run `sqai login` once for the free `sqai_developer` device key; the **compute plane** then provisions its signed managed runtime transparently on your first `compute()` call and keeps it resident: one-time setup, then instant.

| Package | Registry | Install | Gives you |
| --- | --- | --- | --- |
| `@thyn-ai/sqai` | npm | `npm install @thyn-ai/sqai` | `createSQAI` — query and compute planes in TypeScript. |
| `@thyn-ai/sqai-ai-sdk` | npm | `npm install ai zod @thyn-ai/sqai-ai-sdk` | Vercel AI SDK tools: `listSources`, `queryData`, `explainQuery`. |
| `@thyn-ai/sqai-cli` | npm | `npm install -D @thyn-ai/sqai-cli` | The `sqai` binary — `doctor`, `runtime`, `version`. |
| `sqai` | PyPI | `pip install sqai` | The SQAI Python SDK — same API, identical hashes. |

{% hint style="info" %}
New to SQAI? Install the core SDK, run `sqai login` for the free `sqai_developer` tier, then follow the [TypeScript quickstart](quickstart-ts.md) or the [Python quickstart](quickstart-python.md) — connect a source and get a hashed answer in minutes.
{% endhint %}

## Requirements

- **Node ≥ 20** for the npm packages (`sqai doctor` enforces this).
- **Python ≥ 3.10** for the PyPI package.
- A **supported platform** for the compute plane: `darwin-arm64` or `linux-x64`. The query plane runs anywhere Node or Python runs.

## Install the core SDK

{% tabs %}
{% tab title="npm" icon="npm" %}
```bash
npm install @thyn-ai/sqai
```
{% endtab %}

{% tab title="pnpm" icon="terminal" %}
```bash
pnpm add @thyn-ai/sqai
```
{% endtab %}

{% tab title="yarn" icon="yarn" %}
```bash
yarn add @thyn-ai/sqai
```
{% endtab %}

{% tab title="bun" icon="terminal" %}
```bash
bun add @thyn-ai/sqai
```
{% endtab %}
{% endtabs %}

This installs `createSQAI`, the embedded hash-pinned capability contract, and the managed-runtime provisioner — both planes: `connect`/`ask`/`resolve`/`query`/`verify` for queries, and `compute`/`searchCapabilities` for computations. It needs **no separate service or database** for local files; local compute requires the free `sqai login` device key before the runtime provisions. See the [TypeScript quickstart](quickstart-ts.md).

## Install the AI SDK tools

Requires the peer dependencies **`ai ^7.0.0`** and **`zod ^4.0.0`** — both mandatory. Install all three together.

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

{% tab title="yarn" icon="yarn" %}
```bash
yarn add ai zod @thyn-ai/sqai-ai-sdk
```
{% endtab %}

{% tab title="bun" icon="terminal" %}
```bash
bun add ai zod @thyn-ai/sqai-ai-sdk
```
{% endtab %}
{% endtabs %}

Gives you `createSQAI` → `SQAIToolkit` and the three governed tools `listSources`, `queryData`, `explainQuery`. It depends on `@thyn-ai/sqai` (pulled in automatically) and re-exports `SQAI`, `SqaiError`, and core types. See [Vercel AI SDK tools](ai-sdk-tools.md).

## Install the CLI

{% tabs %}
{% tab title="npm" icon="npm" %}
```bash
npm install -D @thyn-ai/sqai-cli
```
{% endtab %}

{% tab title="pnpm" icon="terminal" %}
```bash
pnpm add -D @thyn-ai/sqai-cli
```
{% endtab %}

{% tab title="yarn" icon="yarn" %}
```bash
yarn add -D @thyn-ai/sqai-cli
```
{% endtab %}

{% tab title="npx" icon="bolt" %}
Run without installing:

```bash
npx @thyn-ai/sqai-cli doctor
```
{% endtab %}
{% endtabs %}

Installs the `sqai` binary with `doctor`, `runtime <status|install|verify|stop>`, and `version`. See the [CLI reference](cli.md).

{% hint style="warning" %}
Two distinct binaries share the name `sqai`. The **npm** CLI (`@thyn-ai/sqai-cli`) has `doctor` and `runtime`; the **Python** console script (from `pip install sqai`) has only `--version` and `capabilities`. Use the npm CLI for diagnostics and provisioning.
{% endhint %}

## Install the Python SDK

{% tabs %}
{% tab title="pip" icon="python" %}
```bash
pip install sqai
```
{% endtab %}

{% tab title="uv" icon="python" %}
```bash
uv pip install sqai
```
{% endtab %}
{% endtabs %}

Python ≥ 3.10. Pulls in the SQAI runtime core and its gRPC client, plus the same contract and provisioner as the TypeScript SDK. Exposes `from sqai import SQAI` / `create_sqai(**config)` with snake_case kwargs and the same query and compute planes. Same logical plan or computation ⇒ identical `plan_hash` / `invocation_hash` / `computation_hash` as TypeScript, conformance-locked. See the [Python quickstart](quickstart-python.md).

## Verify

```bash
npx @thyn-ai/sqai-cli doctor
```

```text
✓ node: v20.11.0
✓ sdk: @thyn-ai/sqai 0.1.14 imports cleanly
✓ contract: 4778 capabilities, sha256:31247fb219e656f349bb6d36fa65c2e2702e2688a2fddb4b16f1a9e09a02cdbb
• tested-pair: skipped (not inside the sqai repo)
• runtime: unavailable (checks skipped)
✓ doctor: ok
```

On a clean machine the `runtime` line reads `unavailable` until the first `compute()` (or `sqai runtime install`) provisions it — the query plane needs nothing. The contract holds **6,084** read-only capabilities; **5,790** are exposed to the SDKs (5,780 deterministic plus 10 seed-required simulations). `doctor` checks Node ≥ 20, the SDK import, the embedded contract, the tested pair, and a live runtime probe; add `--parity` to enforce the read-only/replayable invariant and diff contract modules against the running SQAI, and `--json` to print exactly one JSON object. For Python, confirm the surface with `sqai capabilities --count`. See [Troubleshooting](troubleshooting.md).

## Two planes: instant queries, warm compute

{% stepper %}
{% step %}
#### Query plane — instant

Connect a CSV, TSV, JSON, record array, or SQLite file and call `ask` / `resolve` / `query` / `verify`. Everything runs in-process — no separate service — with sub-millisecond to low-ms latency on typical files. `local` mode is inferred when no env is set; `sqai login` supplies the free device key used by local compute.
{% endstep %}

{% step %}
#### First `compute()` — one-time provision (~110s)

On the first computation the provisioner downloads the platform bundle, verifies its **RS256 manifest signature** and per-artifact `sha256` against the contract-pinned hash, extracts to a temp dir, atomically installs, and spawns the local runtime. That download + extract + init takes about **110 seconds, once**.
{% endstep %}

{% step %}
#### Every later `compute()` — warm (~0.9ms)

The runtime stays resident, so there is **no per-query cold start**. Subsequent calls reuse it and return in well under a millisecond (`finance.npv` measured 0.83–0.93 ms):

```json
{
  "status": "ok",
  "value": 505.020148896933,
  "module": "finance",
  "function": "npv",
  "computation_hash": "b74f67d0d7a594aa7ac91f6291612452aa8ccdf603351ebc8d801a6fddd91bc8",
  "contract_hash": "sha256:31247fb219e656f349bb6d36fa65c2e2702e2688a2fddb4b16f1a9e09a02cdbb",
  "determinism": {
    "runtime_bundle_version": "0.1.0",
    "platform": "darwin-arm64",
    "precision_mode": "float64",
    "thread_count": 1
  },
  "latency_ms": 0.93
}
```
{% endstep %}
{% endstepper %}

The bundle caches per user, so provisioning happens once per machine, not once per process:

- macOS — `~/Library/Caches/SQAI/runtime`
- Linux — `$XDG_CACHE_HOME/sqai/runtime` (or `~/.cache/sqai/runtime`)
- Windows — `%LOCALAPPDATA%\SQAI\runtime`

## Supported platforms

The managed compute runtime is a signed native bundle (`v0.1.0`) published per platform. The query plane runs everywhere Node or Python runs.

| Platform | Managed runtime | Behavior |
| --- | --- | --- |
| `darwin-arm64` (Apple Silicon) | Published | Provisions on first `compute()`. |
| `linux-x64` | Published | Provisions on first `compute()`. |
| Windows / `darwin-x64` / other | Not published | Query plane works; `compute()` fails with a structured `unsupported_platform` error — never a crash. |

{% hint style="info" %}
To run the compute plane off a supported host, point at a private SQAI deployment with `SQAI_DEPLOYMENT_URL` (add `SQAI_API_KEY` if it requires auth) — queries and dispatch still work; only local provisioning is skipped.
{% endhint %}

## Environment variables

All optional — set them only to switch modes, filter the runtime, or run air-gapped. There are two modes and no SQAI cloud. Mode is inferred with no config: no env ⇒ `local` — everything runs on your machine and no data leaves it; `SQAI_DEPLOYMENT_URL` set ⇒ `deployment`, dispatching compute to a private SQAI deployment. `SQAI_API_KEY` never selects a mode.

| Variable | Effect | Default |
| --- | --- | --- |
| `SQAI_API_KEY` | Bearer credential forwarded to your `deployment` private SQAI deployment when it requires auth — used alongside `SQAI_DEPLOYMENT_URL`. Not a key to any SQAI cloud; never selects a mode. | unset |
| `SQAI_DEPLOYMENT_URL` | Selects `deployment` mode — compute is POSTed to your SQAI deployment at `{SQAI_DEPLOYMENT_URL}/v1/libraries/execute`. | unset |
| `SQAI_RUNTIME_MODULES` | Comma-separated module allow-list — compiles and installs a filtered runtime via the build service instead of the full bundle. | unset (full bundle) |
| `SQAI_BUILD_SERVICE_URL` | Build service used when `SQAI_RUNTIME_MODULES` is set. | `https://sqai-buildservice.fly.dev` |
| `SQAI_RUNTIME_AUTO_INSTALL` | `0` disables downloads (air-gapped) — provisioning then fails with a structured error. Any other value enables them. | enabled |

{% hint style="warning" %}
Keep SQAI imports server-side — it manages a native runtime and reads env credentials. On Next.js, set `export const runtime = "nodejs"` on any route or server action that uses SQAI; the Edge runtime cannot host the runtime. In serverless, deployed functions never host the runtime — point at a private SQAI deployment with `SQAI_DEPLOYMENT_URL` (add `SQAI_API_KEY` if it requires auth).
{% endhint %}

## Where to next

<table data-view="cards">
<thead><tr><th></th><th></th><th data-hidden data-card-target data-type="content-ref"></th></tr></thead>
<tbody>
<tr><td><strong>Quickstart — TypeScript</strong></td><td>Connect a source and get a hashed answer across both planes.</td><td><a href="quickstart-ts.md">quickstart-ts.md</a></td></tr>
<tr><td><strong>Quickstart — Python</strong></td><td>The same API, byte-identical hashes.</td><td><a href="quickstart-python.md">quickstart-python.md</a></td></tr>
<tr><td><strong>Vercel AI SDK tools</strong></td><td>Wire the three governed tools into an agent.</td><td><a href="ai-sdk-tools.md">ai-sdk-tools.md</a></td></tr>
<tr><td><strong>CLI reference</strong></td><td>Every <code>doctor</code> and <code>runtime</code> command and flag.</td><td><a href="cli.md">cli.md</a></td></tr>
<tr><td><strong>Compute &#38; filtering</strong></td><td>The full <code>ComputationSpec</code>, bindings, and module filtering.</td><td><a href="compute-and-filtering.md">compute-and-filtering.md</a></td></tr>
<tr><td><strong>Licensing &#38; the managed runtime</strong></td><td>How the signed bundle is trusted and provisioned.</td><td><a href="licensing.md">licensing.md</a></td></tr>
</tbody>
</table>
