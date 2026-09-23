---
icon: code-compare
description: The same logical operation returns the same value and byte-identical plan_hash / invocation_hash / computation_hash in the TypeScript and Python SDKs — one contract, one canonical serializer, two idioms.
---

# Python ↔ TypeScript parity

SQAI ships two SDKs — TypeScript `@thyn-ai/sqai` and Python `sqai` — that are the **same product in two idioms**. They embed the same hash-pinned capability contract (`4778` capabilities, `sha256:31247fb2…`), provision the same signed on-device runtime, and share one canonical serializer. The consequence you can build on: the same logical query or computation returns the **same value** and **byte-identical** `plan_hash`, `invocation_hash`, and `computation_hash` whether it ran in Node or CPython. A result produced in Python replays and verifies in TypeScript, and vice versa.

This guide is the map between the two: what is identical, where the surfaces differ, the one naming rule that keeps code portable, and how to prove parity on your own machine.

{% hint style="info" %}
**What parity guarantees:** given the same contract, the same resolved identity, and the same execution scope, both SDKs return the same value and the same three hashes — every time, in either language. **What it does not claim:** identical floating-point results across arbitrary CPUs, OSes, or bundle versions. Parity is *within the declared execution scope*, which every result carries in its determinism envelope. Two runs in the same scope compare exactly; two runs in different scopes are told so by the scope, not silently reconciled. See [Determinism & provenance](../determinism.md).
{% endhint %}

## What is identical, what differs

| Layer | Identical across SDKs | Language-specific |
|---|---|---|
| Capability contract | `4778` capabilities, `sha256:31247fb2…`, embedded in both | — |
| Exposed surface | 5,790 read-only (5,780 deterministic + 10 seed-required simulations) | — |
| Wire shape | Spec fields in, result fields out — all snake_case | — |
| Hashing | `plan_hash`, `invocation_hash`, `computation_hash` — same bytes | — |
| Value type | `SqaiValue` (numbers, strings, bools, arrays, nested) | — |
| Env / modes | `SQAI_DEPLOYMENT_URL`, `SQAI_API_KEY`, `local` / `deployment` | — |
| SDK version | `0.1.14` | — |
| Method names | — | camelCase (TS) vs snake_case (Python) |
| Client config keys | — | `tenantId` (TS) vs `tenant_id` (Python) |
| Result access | — | property access (TS) vs `dict` keys (Python) |
| Runtime | Node ≥ 20 | Python ≥ 3.10 |

Everything that becomes a **hash** is identical; everything that is merely **language ergonomics** follows each language's convention.

## Install and create a client

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// npm install @thyn-ai/sqai   (Node ≥ 20)
import { createSQAI } from "@thyn-ai/sqai";

const sqai = createSQAI(); // mode inferred: local (no env set)
```

`createSQAI(config?)` returns an `SQAI` client. Config is camelCase: `policy`, `tenantId`, `timeout`, `runtimeModules`.
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# pip install sqai   (Python ≥ 3.10)
from sqai import SQAI

sqai = SQAI()  # or SQAI(mode="local"); create_sqai(**config) is the factory
```

`SQAI(**config)` returns a client; all arguments are keyword-only and snake_case: `policy`, `tenant_id`, `timeout`, `runtime_modules`.
{% endtab %}
{% endtabs %}

Both infer mode the same way: no env ⇒ `local`; `SQAI_DEPLOYMENT_URL` set ⇒ `deployment`. `SQAI_API_KEY`, if present, is only the Bearer credential forwarded to a private SQAI deployment — it never selects a cloud, because [there is none](../quickstart-python.md). Governance lives in `policy` at construction time in both languages and is never reachable from model input.

## One naming rule keeps code portable

There is exactly one rule, and it removes all the guesswork:

> **Method names and client-config keys follow each language's convention. Everything on the wire — the spec fields you pass in and the result fields you read out — is snake_case in both.**

So `searchCapabilities` / `search_capabilities` and `tenantId` / `tenant_id` differ, but a `QuerySpec` uses `group_by` and `source_name` in **both** languages, and a result carries `invocation_hash`, `computation_hash`, `value_type`, `row_count`, and `plan_hash` in **both**. The payloads are the canonical form the hashes are computed over — they cannot diverge without moving a hash.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const outcome = await sqai.ask({
  metric: "revenue",
  aggregation: "sum",
  group_by: "region",     // snake_case on the wire, even in TS
  order: "desc",
  source_name: "sales",   // snake_case on the wire, even in TS
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
outcome = sqai.ask({
    "metric": "revenue",
    "aggregation": "sum",
    "group_by": "region",
    "order": "desc",
    "source_name": "sales",
})
```
{% endtab %}
{% endtabs %}

## The API map

The two surfaces are one-to-one. The only translations are the naming convention and how arguments are passed (an options object in TS, keyword args in Python).

| TypeScript | Python | Returns |
|---|---|---|
| `createSQAI(config?)` | `SQAI(**config)` / `create_sqai(**config)` | The client |
| `connect(src, { name })` | `connect(src, name=...)` | Source descriptor (`schema_revision`, `fields`, `row_count`) |
| `ask(spec)` | `ask(spec)` | `{ status, data?, resolution? }` |
| `resolve(spec)` | `resolve(spec)` | The resolved plan, verbatim |
| `query(plan)` | `query(plan)` | Query result |
| `queryWithMetadata(plan)` | `query_with_metadata(plan)` | Result + provenance |
| `verify(plan)` | `verify(plan)` | Validation verdict |
| `compute(spec)` | `compute(**spec)` / `compute(spec)` | Result + determinism envelope |
| `searchCapabilities(query, limit=10)` | `search_capabilities(query, limit=10)` | Ranked `{ entry: { name, summary }, score }` |

`connect()` takes the same source forms in both — a file path, records, or a SQLite descriptor `{ provider: "sqlite", path, table }` — all in-process, no key. `compute()` accepts a single spec in both; Python additionally accepts keyword args (`compute(module=..., function=..., args=...)`).

## Reading results: objects vs dicts

The result **shape** is identical; only the access idiom differs. TypeScript hands back objects with property access; Python hands back a plain `dict` from `compute()` (and `outcome["data"]` from `ask()` exposes attribute access for the SQAI response).

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const r = await sqai.compute({
  module: "finance",
  function: "npv",
  args: [0.1, [-1000, 300, 420, 560, 680]],
});

r.value;             // 505.020148896933
r.computation_hash;  // b74f67d0…  (field name is snake_case)
r.determinism.platform;
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
r = sqai.compute(module="finance", function="npv",
                 args=[0.1, [-1000, 300, 420, 560, 680]])

r["value"]             # 505.020148896933
r["computation_hash"]  # b74f67d0…  (same field name)
r["determinism"]["platform"]
```
{% endtab %}
{% endtabs %}

The field names — `value`, `value_type`, `invocation_hash`, `computation_hash`, `contract_hash`, `determinism`, `latency_ms`, `request_id` — are the same strings in both. Serialize either result to JSON and you get the same document.

## Byte-identical hashes

The flagship guarantee, verified live. The one specific value below is real; run it in either SDK and you get the same number and the same hashes, bit for bit.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const r = await sqai.compute({
  module: "finance",
  function: "npv",
  args: [0.1, [-1000, 300, 420, 560, 680]],
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
r = sqai.compute(module="finance", function="npv",
                 args=[0.1, [-1000, 300, 420, 560, 680]])
```
{% endtab %}
{% endtabs %}

```text
value            : 505.020148896933
invocation_hash  : b3ca3e925e4372a5f9365790a29c486afed868073d3fd301d03022f44689e423
computation_hash : b74f67d0d7a594aa7ac91f6291612452aa8ccdf603351ebc8d801a6fddd91bc8
contract_hash    : sha256:31247fb219e656f349bb6d36fa65c2e2702e2688a2fddb4b16f1a9e09a02cdbb
```

Run the identical input twice — in one SDK or across both — and the `computation_hash` is stable:

```json
{
  "run1": "b74f67d0d7a594aa7ac91f6291612452aa8ccdf603351ebc8d801a6fddd91bc8",
  "run2": "b74f67d0d7a594aa7ac91f6291612452aa8ccdf603351ebc8d801a6fddd91bc8",
  "identical": true
}
```

The same holds for the query plane: the same `QuerySpec` over the same source yields the same `plan_hash` and `schema_revision` in both languages. A plan hashed in Python replays against the same data in TypeScript, or fails loudly with `schema_revision_mismatch` if the data moved.

## Why they match: one canonical serializer

Parity is not maintained by two teams keeping two implementations in sync by hand — it is a property of a single canonical serializer that both SDKs call. TypeScript `canonicalJson` ≡ Python `canonical_json`, locked by the runtime's cross-language conformance suite. It:

- normalizes `-0` to `0`,
- renders numbers with ECMAScript semantics (so `1.0` and `1` serialize identically),
- sorts object keys,
- escapes Unicode identically, and
- preserves binding order.

`input_hash` is a stable hash over that same canonical form. The three hashes are then domain-separated SHA-256 over the canonical bytes, so a hash from one plane can never collide with another's:

```text
invocation_hash  = sha256("sqai:invocation:v1\0"  + canonicalJson(identity))
computation_hash = sha256("sqai:computation:v1\0" + invocation_hash + canonicalJson(value))
```

Because the identity fed to `invocation_hash` includes the `contract_hash` and the `execution_scope` (`<platform>:<mode>`), a contract bump or a platform change moves the hash in **both** SDKs at once — by design. Byte-identical input ⇒ byte-identical hash, in either language. Aggregation and numeric semantics (empty sets, tie-breaking, coercion) are owned by the SQAI runtime and locked by the same suite; neither SDK reimplements numerics.

## Where the SDKs differ

Parity is about the contract, the values, and the hashes — not about every ergonomic feature shipping in both packages on day one. The real differences today:

| Capability | TypeScript | Python |
|---|---|---|
| Files, records, SQLite (in-process `connect`) | Yes | Yes |
| Excel, Parquet inputs | — | Python-only |
| Vercel AI SDK agent tools | `@thyn-ai/sqai-ai-sdk` | — |
| CLI | `@thyn-ai/sqai-cli` (`npx @thyn-ai/sqai-cli …`) | `sqai …` |
| Escape hatch | `getUnsafeRuntime` | `get_unsafe_runtime` |

None of these change a value or a hash. A number bound from a Parquet column in Python produces the same `computation_hash` a TypeScript caller gets from the same values supplied any other way — the source format is upstream of the canonical identity.

{% hint style="warning" %}
The **error contract** is parallel, not identical in mechanics: both surface a stable `code` (e.g. `unsupported_operation`, `source_already_registered`, `seed_required`, `runtime_provision_failed`) and a `source` of `"engine" | "sqai"`. TypeScript **throws**; Python **raises** `SqaiError`. The 10 seed-required simulations reject an unseeded `compute()` with `seed_required` in both — pass `seed=` (int or string) and the seed is recorded in the identity and the envelope, making the simulation replayable across languages. See [Troubleshooting](../troubleshooting.md).
{% endhint %}

## Verify parity yourself

You do not have to take the guarantee on faith. Two checks, one from the CLI and one from code.

{% stepper %}
{% step %}
#### Confirm both SDKs pin the same contract

`sqai capabilities --count` reads the contract embedded in the SDK and prints the count and `capability_contract_hash`. Run it wherever each SDK is installed — the hash must match `sha256:31247fb2…`.

```text
sqai capabilities --count
# capabilities: 4778
# capability_contract_hash: sha256:31247fb219e656f349bb6d36fa65c2e2702e2688a2fddb4b16f1a9e09a02cdbb
```
{% endstep %}
{% step %}
#### Assert the exposure invariant

`sqai doctor --parity` asserts that every capability exposed to the SDKs is read-only and deterministic (or deterministic-when-seeded), and — with a live runtime — diffs contract modules against the runtime's `list_modules`. Add `--strict` in CI to *require* a live runtime rather than skip it.

```json
{
  "parity": { "invariant_ok": true, "violations": [], "missing_modules": [], "extra_modules": [] },
  "contract": { "capability_count": 4778, "capability_contract_hash": "sha256:31247fb2…" },
  "ok": true
}
```
{% endstep %}
{% step %}
#### Diff a real computation across languages

Compute the same call in each SDK and compare the `computation_hash` string. Equal strings prove byte-for-byte agreement — the value, the identity, and the contract all matched.

```text
py.computation_hash === ts.computation_hash   →   true
```
{% endstep %}
{% endstepper %}

## Writing portable code

Practical habits that keep a codebase parity-clean whichever SDK a service uses:

- **Author specs in snake_case.** `QuerySpec` and `ComputationSpec` fields (`group_by`, `source_name`, `parameter`, `alignment`) are snake_case in both languages. A spec authored once is valid in both.
- **Compare hashes, not formatted numbers.** The `computation_hash` is the portable identity. Don't compare stringified floats across languages; compare the hash the canonical serializer already computed.
- **Discover, then call.** `searchCapabilities` / `search_capabilities` return the same ranked `{ entry: { name, summary }, score }` — resolve a name at runtime instead of hard-coding it, and the same discovery code ports across SDKs. Every capability carries a real one-line `summary`, e.g. `accounting.compound_annual_growth` — "Compound annual growth rate: (ending/beginning)^(1/years) - 1", or `ml.classifiers.cosine_similarity` — "Cosine similarity: dot(a,b) / (||a|| * ||b||)".
- **Seed simulations explicitly.** The 10 `simulation` capabilities need a `seed`; pass the same seed in both languages for identical output and identical hashes.
- **Bind, don't zip.** Bind a source column with `bindings: [{ parameter, source, field }]` rather than assembling arrays in host code — the aligned column is pulled through the runtime's upstream extraction primitive identically in TS and Python, and `provenance.bindings` records the same `schema_revision`, `row_count`, and `input_hash`.
- **Set mode by env, not code.** `SQAI_DEPLOYMENT_URL` (and `SQAI_API_KEY` when your deployment requires auth) select `deployment` mode identically in both SDKs, so the same source can target `local` or a private SQAI deployment without code changes.

## Next steps

<table data-view="cards">
<thead><tr><th></th><th></th><th data-hidden data-card-target data-type="content-ref"></th></tr></thead>
<tbody>
<tr><td><strong>Determinism &#38; provenance</strong></td><td>What the three hashes cover, the determinism envelope, and the replay guarantee.</td><td><a href="../determinism.md">determinism.md</a></td></tr>
<tr><td><strong>Quickstart — Python</strong></td><td>pip install to a first byte-identical answer across both planes.</td><td><a href="../quickstart-python.md">quickstart-python.md</a></td></tr>
<tr><td><strong>Quickstart — TypeScript</strong></td><td>npm install to the same plans and byte-identical hashes.</td><td><a href="../quickstart-ts.md">quickstart-ts.md</a></td></tr>
<tr><td><strong>CLI reference</strong></td><td><code>sqai doctor --parity</code>, <code>capabilities --count</code>, and the shared contract hash.</td><td><a href="../cli.md">cli.md</a></td></tr>
</tbody>
</table>
