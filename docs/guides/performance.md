---
icon: gauge-high
description: Where SQAI spends time — an in-process query plane at sub-millisecond, a compute runtime that provisions once then stays warm, and the knobs that keep both fast without ever touching a cloud.
---

# Performance & the two planes

SQAI has exactly two execution surfaces, and they have two completely different cost profiles. The **query plane** runs in your own process and answers metric intent in sub-millisecond time — no server, no key, no network. The **compute plane** is a signed on-device runtime that pays a single, one-time provisioning cost, then stays resident and answers every later `compute()` warm, in well under a millisecond. There is **no cloud** to add latency, and after the first provision there is **no per-query cold start**.

This page is about where the time goes and how to keep it small: what each plane costs, why the compute runtime is slow exactly once, how to pre-warm it, how to ship a smaller bundle, and how bindings and discovery keep both latency and model context down.

{% hint style="info" %}
New to the model behind the two planes? Read [How it works](../concepts.md) first — this page assumes the pipeline, the contract, and the provenance vocabulary it describes.
{% endhint %}

## Two planes, two cost profiles

Both planes share the capability contract, the policy layer, and the provenance vocabulary. They differ in what they run and what running it costs.

| | Query plane | Compute plane |
|---|---|---|
| Where it runs | In-process, inside `createSQAI()` | Signed on-device runtime process |
| Startup cost | None — ready the moment you `connect()` | One-time provision (~110s, first call ever) |
| Steady-state latency | Sub-millisecond on typical files | Warm ~0.9 ms (`finance.npv` measured 0.83–0.93 ms) |
| Per-query network | None | None in `local`; one round-trip in `deployment` |
| Needs a key | No | Free `sqai_developer` device key (`sqai login`) |
| What it does | Metric aggregation over connected sources | Function dispatch over 5,790 read-only capabilities |
| Provenance emitted | `plan_hash` | `invocation_hash`, `computation_hash`, `contract_hash` + determinism envelope |

The headline: the query plane is fast because it never leaves your process, and the compute plane is fast because it provisions once and then never cold-starts again.

## The query plane: in-process, sub-millisecond

`connect()` reads the bytes on your machine, infers a typed schema, and hands back an immutable source — no runtime process, no device key, no network. `resolve()` / `ask()` / `query()` / `verify()` then turn typed metric intent into a validated plan and execute it entirely in `createSQAI()`'s process. On typical files this is sub-millisecond, and it is available the instant the SDK imports.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const source = await sqai.connect("./data/sales.csv", { name: "sales" });
// In-process from here on — no runtime, no key.
const res = await sqai.ask({
  metric: "revenue",
  aggregation: "sum",
  group_by: "region",
  source_name: "sales",
});
res.data.plan_hash;      // canonical resolved plan
res.data.schema_revision; // the exact schema the plan ran against
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
source = sqai.connect("./data/sales.csv", name="sales")
# In-process from here on — no runtime, no key.
res = sqai.ask(
    metric="revenue",
    aggregation="sum",
    group_by="region",
    source_name="sales",
)
res["data"]["plan_hash"]        # canonical resolved plan
res["data"]["schema_revision"]  # the exact schema the plan ran against
```
{% endtab %}
{% endtabs %}

Two things keep the query plane cheap and predictable:

- **No process to warm.** The five aggregations (`sum`, `avg`, `count`, `min`, `max`) resolve and execute in-process; there is nothing to download or spawn.
- **Immutable sources.** A connected source is pinned to a `schema_revision`. Re-connecting the same name with changed data throws `source_already_registered` rather than silently re-reading — so repeated queries hit a stable, already-parsed schema.

{% hint style="info" %}
File size, not query complexity, dominates query-plane latency. Connecting a large CSV parses it once; every subsequent `ask()` / `query()` against that registered source is resolution-plus-aggregation over already-typed columns.
{% endhint %}

## The compute plane: provision once, then warm

The compute plane is the signed managed runtime. The first `compute()` on a machine pays a one-time provisioning cost; every call after that is warm. This is the single most important performance fact about SQAI: **the cold start happens once per machine, not once per process and never per query.**

{% stepper %}
{% step %}
#### First `compute()` ever — the one-time provision (~110s)

On the first computation the provisioner downloads the platform bundle, verifies its **RS256 manifest signature** and per-artifact `sha256`, extracts to a temp dir, atomically installs, and spawns the local runtime. Download + verify + extract + init is roughly **110 seconds, once**.
{% endstep %}
{% step %}
#### The runtime stays resident

After provisioning the runtime process stays up. There is no per-query cold start — subsequent calls reuse the warm process directly.
{% endstep %}
{% step %}
#### Every later `compute()` — warm (~0.9 ms)

Warm calls return in well under a millisecond. This is the real result of `finance.npv(0.1, [-1000, 300, 420, 560, 680])`, `latency_ms` and all:

```json
{
  "status": "ok",
  "value": 505.020148896933,
  "module": "finance",
  "function": "npv",
  "invocation_hash": "b3ca3e925e4372a5f9365790a29c486afed868073d3fd301d03022f44689e423",
  "computation_hash": "b74f67d0d7a594aa7ac91f6291612452aa8ccdf603351ebc8d801a6fddd91bc8",
  "contract_hash": "sha256:31247fb219e656f349bb6d36fa65c2e2702e2688a2fddb4b16f1a9e09a02cdbb",
  "determinism": {
    "precision_mode": "float64",
    "thread_count": 1
  },
  "latency_ms": 0.93
}
```
{% endstep %}
{% endstepper %}

{% hint style="success" %}
The compute runtime is pinned **single-threaded at `float64`** — that is what makes results reproducible (one fixed reduction order), and it means each call runs on one core. Throughput comes from the resident process answering calls back-to-back without re-warming, not from per-call parallelism.
{% endhint %}

## What the first call pays for

The ~110s is not arbitrary latency — it is verification and setup you pay once, then cache. The runtime is never trusted blindly:

- **Verify before extract.** RS256 signature over the exact manifest bytes → schema and path-safety checks → per-artifact `sha256` and size → reject any unlisted, symlinked, or non-regular member — all **before** extraction. Extract to a temp dir, then atomic rename.
- **Per-user cache, once per machine.** The verified bundle lives in a per-user cache, so provisioning happens once per machine, not once per process:
  - macOS — `~/Library/Caches/SQAI/runtime`
  - Linux — `$XDG_CACHE_HOME/sqai/runtime` (or `~/.cache/sqai/runtime`)
  - Windows — `%LOCALAPPDATA%\SQAI\runtime`
- **Air-gapped.** `SQAI_RUNTIME_AUTO_INSTALL=0` disables the download entirely; compute then fails structured (`runtime_provision_failed`) and you install the bundle out-of-band with `sqai runtime install`.

{% hint style="warning" %}
The one-time cost is per machine and per bundle. Wiping the cache, or provisioning a *different* bundle (a new version, or a different `runtimeModules` filter), pays a fresh provision for that bundle. Steady state is always warm.
{% endhint %}

## Pre-warm the runtime

The only slow moment is the first `compute()` on a cold machine. Move that cost off your critical path by provisioning ahead of the first real request — either from the CLI at deploy time, or with a throwaway compute at process boot.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// At server boot: pay the one-time provision before the first user request.
await sqai.compute({
  module: "finance",
  function: "npv",
  args: [0.1, [-1000, 300, 420, 560, 680]],
});
// ~110s the first time on a cold machine; ~0.9ms once the bundle is cached.
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# At process boot: pay the one-time provision before the first user request.
sqai.compute(
    module="finance",
    function="npv",
    args=[0.1, [-1000, 300, 420, 560, 680]],
)
# ~110s the first time on a cold machine; ~0.9ms once the bundle is cached.
```
{% endtab %}
{% tab title="CLI" icon="terminal" %}
```bash
# Provision at deploy/build time, not on the first request.
sqai runtime install
sqai runtime status   # confirm the runtime is resident before serving traffic
```
{% endtab %}
{% endtabs %}

{% hint style="info" %}
In containers, provision inside the image build or a warm-up step so the cache ships with the image. `sqai runtime status` tells you whether the runtime is already resident; a clean machine reports the runtime as `unavailable` until the first `compute()` or `sqai runtime install`.
{% endhint %}

## Smaller bundles with build-on-provision

The default bundle carries the full library. If you only call a few modules, `runtimeModules` (env `SQAI_RUNTIME_MODULES`) filters the build to exactly those — the build service compiles and signs a bundle for that set, so the artifact you download, verify, and extract is smaller.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const sqai = createSQAI({
  runtimeModules: ["finance", "risk", "option_pricing"],
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
sqai = SQAI(runtime_modules=["finance", "risk", "option_pricing"])
```
{% endtab %}
{% endtabs %}

- **Cached by filter-hash.** Bundles are keyed by `sha256("mods|platform|version")[:20]`. Modules are normalized (trimmed, de-duplicated, sorted) before hashing, so `["stats","finance","stats"]` and `["finance","stats"]` resolve to the **same** cached bundle — same key, no rebuild.
- **Warm without a round-trip.** A filtered runtime spawns on its own socket/port and is cached by filter-hash; a warm filtered runtime is reused without a build-service call.
- **Each filter is its own process.** Different filters spawn different runtimes on non-colliding ports. Running several filters means several resident runtimes — each warm after its own one-time provision, so prefer one filter that covers the modules you actually call.
- **Determinism is untouched.** The filter changes only what is installed, never what a function returns: `finance.npv(0.1, [-1000, 300, 420, 560, 680])` yields the same `value` and the same `computation_hash` whether the bundle carries three modules or all of them.

{% hint style="warning" %}
Filtered bundles need a build service. Set `SQAI_BUILD_SERVICE_URL` (or `buildServiceUrl`); if `runtimeModules` is set with none configured, provisioning fails with `runtime_provision_failed`. Omit `runtimeModules` to use the default pinned bundle. Search the whole contract first, then filter to the packs you call — a `compute()` against a module outside your filter has nothing to dispatch to.
{% endhint %}

## Bindings keep data — and latency — out of the model

A model never pastes a column of numbers into a tool call. It names a source and its fields; SQAI pulls the actual values in-process through the runtime's aligned `extractColumns` primitive (`nullPolicy` default `pairwise`, `alignment: "rowwise"`) and dispatches. This is a performance decision as much as a governance one:

- **Small tool calls.** Only the source name and field names travel in the model's context, not the data — fewer tokens per call and no truncation of large columns into a prompt.
- **The hash is honest and cheap.** `input_hash` is computed over the column the runtime actually received, so provenance is byte-accurate without re-shipping the data anywhere.

```ts
await sqai.compute({
  module: "finance",
  function: "npv",
  args: [0.1],
  bindings: [{ parameter: "cashflows", source: "sales", field: "revenue" }],
});
// The revenue column is extracted in-process; the model's context stays tiny.
```

The result records exactly which source, fields, `schema_revision`, and `row_count` fed the number (see [Determinism & provenance](../determinism.md)). Large results are truncated to a preview and stored — `getResult(result_id)` fetches the full value later by a random, tenant-authorized, TTL-bounded id — so a big answer never floods the model's context either.

## Discovery and dry-runs are free

Finding a capability or checking a spec costs nothing on the runtime. `searchCapabilities(query, limit=10)` reads the embedded contract **in-process** — no runtime, no key, no provision — and `explainQuery` dry-runs a spec **without executing**, so a model can find its footing before it spends a warm `compute()`.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// In-process contract search — no runtime touched.
sqai.searchCapabilities("black scholes option", 5)
  .map((m) => `${m.entry.name} — ${m.entry.summary}`);
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# In-process contract search — no runtime touched.
[f"{m['entry']['name']} — {m['entry']['summary']}"
 for m in sqai.search_capabilities("black scholes option", 5)]
```
{% endtab %}
{% endtabs %}

For an agent, the loop is: `listSources()` / `searchCapabilities` to discover, `explainQuery` to confirm the spec resolves (returns `matched_signature`, a preview `invocation_hash`, and whether a seed is required), then one `queryData` / `compute` to actually run it. Only the last step touches the runtime — everything before it is in-process and free.

## Local vs deployment latency

Mode is inferred from the environment, and it is the one thing that changes compute-plane network cost. There is no SQAI cloud in either mode.

| Mode | Env | Query plane | Compute plane | Added per-call cost |
|---|---|---|---|---|
| `local` | _(none)_ | in-process | on-device warm runtime | none — nothing leaves your machine |
| `deployment` | `SQAI_DEPLOYMENT_URL` | in-process | `POST {url}/v1/libraries/execute` (your deployment) | one network round-trip per `compute()` |

In `deployment` mode the query plane still resolves and hashes typed intent **locally** — only compute dispatch is POSTed to your own SQAI deployment. So query-plane latency is identical in both modes; only `compute()` adds a round-trip, and only to infrastructure you run. `SQAI_API_KEY`, if set, is just the Bearer credential forwarded when your deployment requires auth — it never selects a cloud and never changes latency behavior.

{% hint style="warning" %}
Keep SQAI imports server-side. On Next.js set `export const runtime = "nodejs"` — the Edge runtime cannot host the runtime. In serverless, deployed functions never host the runtime; point at a private SQAI deployment with `SQAI_DEPLOYMENT_URL` so `compute()` dispatches instead of trying to provision in a function.
{% endhint %}

## Reading latency from a result

Every compute result reports its own server-side execution time in `latency_ms` and a `request_id` for correlation — no external tracing needed to see whether a call was warm.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const r = await sqai.compute({
  module: "finance",
  function: "npv",
  args: [0.1, [-1000, 300, 420, 560, 680]],
});
r.latency_ms;  // 0.93 — execution time on the warm runtime
r.request_id;  // e.g. "sqai_eaab471b197880a4"
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
r = sqai.compute(
    module="finance",
    function="npv",
    args=[0.1, [-1000, 300, 420, 560, 680]],
)
r["latency_ms"]  # 0.93 — execution time on the warm runtime
r["request_id"]  # e.g. "sqai_eaab471b197880a4"
```
{% endtab %}
{% endtabs %}

A `latency_ms` in the single-digit-millisecond range means the runtime is warm. A multi-second first call is the one-time provision described above — expected exactly once per machine per bundle.

## Performance checklist

- **Provision ahead of traffic.** Run `sqai runtime install` at deploy time, or a throwaway `compute()` at boot, so no user request pays the ~110s.
- **Cache the bundle with the image.** Provision inside the container build; the per-user cache ships with the image and steady state is warm.
- **Filter with `runtimeModules`** to the packs you actually call — a smaller signed bundle to download, verify, and extract. Keep to one filter where you can.
- **Bind columns, don't inline data.** Smaller tool calls, honest `input_hash`, and no large columns in the model's context.
- **Discover in-process.** Use `searchCapabilities` and `explainQuery` before you spend a warm `compute()`.
- **Watch `latency_ms`.** Single-digit ms is warm; a one-off multi-second call is the expected first-ever provision.
- **Run compute where the runtime lives.** `local` for on-device warmth, or a private `deployment` you run for live databases — never an Edge or short-lived serverless function.

## Next steps

<table data-view="cards">
<thead><tr><th></th><th></th><th data-hidden data-card-target data-type="content-ref"></th></tr></thead>
<tbody>
<tr><td><strong>How it works</strong></td><td>The pipeline, the two planes, and why the model never authors execution.</td><td><a href="../concepts.md">concepts.md</a></td></tr>
<tr><td><strong>Compute &#38; filtering</strong></td><td>The full <code>ComputationSpec</code>, bindings, and build-on-provision module filtering.</td><td><a href="../compute-and-filtering.md">compute-and-filtering.md</a></td></tr>
<tr><td><strong>Determinism &#38; provenance</strong></td><td>The three hashes and the determinism envelope, field by field.</td><td><a href="../determinism.md">determinism.md</a></td></tr>
<tr><td><strong>Licensing &#38; accounts</strong></td><td>The free device key, the signed runtime, and how it is trusted.</td><td><a href="../licensing.md">licensing.md</a></td></tr>
<tr><td><strong>Installation</strong></td><td>Packages, requirements, and the warm-compute provisioning steps.</td><td><a href="../installation.md">installation.md</a></td></tr>
<tr><td><strong>CLI reference</strong></td><td><code>sqai runtime install</code>, <code>status</code>, <code>doctor</code>, and more.</td><td><a href="../cli.md">cli.md</a></td></tr>
</tbody>
</table>
</content>
</invoke>
