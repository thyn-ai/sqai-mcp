---
icon: fingerprint
description: Every SQAI result is reproducible within its declared execution scope — one determinism envelope, three domain-separated hashes, and byte-identical output across the TypeScript and Python SDKs.
---

# Determinism & provenance

SQAI's guarantee is exact and narrow: **deterministic within the declared execution scope** — not "bit-identical on every CPU and build ever made." The same computation identity returns the same value and the same hashes in TypeScript and Python, on the same scope. Every result carries that scope, so a replay asserts like-for-like instead of hoping the environment matched.

Provenance is computed from the operation, not logged after it. A query-plane plan yields a `plan_hash`; a computation yields an `invocation_hash` **before** it runs and a `computation_hash` **after**. All three are domain-separated SHA-256 over one canonical serializer shared by both SDKs. Of the 5,790 exposed capabilities, 5,780 are deterministic and 10 are seed-required simulations — replayable by construction.

{% hint style="info" %}
**What "deterministic" claims:** given the same contract, the same resolved identity, and the same execution scope, SQAI returns the same value and the same hashes — every time, in either language. **What it does not claim:** identical floating-point results across arbitrary CPUs, OSes, or bundle versions. SQAI does not pretend the environment is fixed; it records it in the envelope so any two runs compare exactly.
{% endhint %}

## The determinism envelope

Every compute result ships the scope its value was produced in. This is the real output of `finance.npv(0.1, [-1000, 300, 420, 560, 680])`:

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

| Field | What it pins |
|---|---|
| `runtime_bundle_version` | Signed managed-runtime bundle version (`0.1.0`); `"unmanaged"` when no bundle backs the run. |
| `runtime_bundle_sha256` | sha256 of this platform's bundle artifact; `"unmanaged"` when none is pinned. |
| `platform` | Platform key — `darwin-arm64`, `linux-x64`, … |
| `architecture` | `arm64`, `x64`. |
| `kernel_build` | The runtime that executed — here `mojo`. |
| `precision_mode` | Always `float64`. |
| `thread_count` | Always `1` — one fixed reduction order. |
| `seed` | Present **only** when the computation used a seed. |
| `input_hash` | Stable hash of the assembled positional argument vector. |

{% hint style="success" %}
`precision_mode: "float64"` and `thread_count: 1` are the two knobs that make numbers reproducible: fixed precision, single reduction order. That is why two runs in the same scope agree bit-for-bit. The runtime provisions once (~110s, first call ever), then stays warm — this `npv` measured `latency_ms` 0.93, no per-query cold start.
{% endhint %}

## The three hashes

| Hash | Plane | Known | Covers |
|---|---|---|---|
| `plan_hash` | query | after resolve | The canonical resolved plan — metric, aggregation, filter, group-by, `schema_revision`. Emitted by the SQAI runtime. |
| `invocation_hash` | compute | **before** execution | The operation identity — module, function, args, kwargs, resolved bindings, seed, `contract_hash`, `execution_scope`. |
| `computation_hash` | compute | **after** execution | `invocation_hash` folded with the canonical result value. The full-fidelity replay key. |

Each is prefixed with a versioned domain string, so a hash from one context can never collide with another's:

```text
invocation_hash  = sha256("sqai:invocation:v1\0"  + canonicalJson(identity))
computation_hash = sha256("sqai:computation:v1\0" + invocation_hash + canonicalJson(value))
```

The `identity` fed to `invocation_hash` has exactly these fields — change any one and the hash moves:

| Identity field | What it pins |
|---|---|
| `module`, `function`, `args`, `kwargs` | The capability and its literal arguments (`SqaiValue`). |
| `resolved_bindings[].input_hash` | Stable hash of the column vector extracted upstream, so identity binds the data — not just the column name. |
| `contract_hash` | The pinned capability contract (`sha256:31247fb2…`). A contract change moves every downstream hash. |
| `execution_scope` | `<platform>:<mode>`, e.g. `darwin-arm64:local`. Change platform or mode and the hash changes — by design. |
| `seed` | The seed, or `null` when the capability takes none. |

## Same input, identical hash

Run the identical input twice; the `computation_hash` is stable — same input, same hash, always:

```json
{
  "run1": "b74f67d0d7a594aa7ac91f6291612452aa8ccdf603351ebc8d801a6fddd91bc8",
  "run2": "b74f67d0d7a594aa7ac91f6291612452aa8ccdf603351ebc8d801a6fddd91bc8",
  "identical": true
}
```

## Byte-identical across TypeScript and Python

The flagship guarantee: the same computation in either SDK returns the same value and the same hashes, bit for bit.

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
```

Both SDKs share one canonical JSON serializer — TypeScript `canonicalJson` ≡ Python `canonical_json`, locked by the runtime's cross-language conformance suite. It normalizes `-0` to `0`, renders numbers with ECMAScript semantics, sorts object keys, escapes Unicode identically, and preserves binding order. `input_hash` is a stable hash over the same canonical form. Byte-identical input ⇒ byte-identical hash, in either language.

## Query-plane provenance

A resolved query carries the runtime's provenance fields verbatim — SQAI invents no parallel names. From `ask("total revenue by region")`:

```json
{
  "plan_hash": "f87610d8afeb13e17500df6d275725825780c1f9f3d2eab54387de528d255aa7",
  "schema_revision": "e4938027ddf0d2210f019770403efd45d350eac28100902ddd7c5191c9b8cfbe",
  "deterministic_scope": "local_registered_source",
  "decision_path": "exact_spec",
  "validated": true
}
```

`schema_revision` is the source schema the plan was validated against. Replaying a stored plan against changed data fails with `schema_revision_mismatch` instead of silently returning different numbers. Aggregation and ordering semantics — empty sets, tie-breaking, numeric coercion — are owned by the SQAI runtime and locked by the same conformance suite; SQAI validates and hashes, it reimplements no numerics.

## Binding provenance

Bind a source column to a parameter and the result records exactly which source, fields, and rows fed the number. Real output of `finance.npv(0.1, cashflows=<sales.revenue>)`:

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
  }
}
```

The value differs from the literal call because the cashflows are now the `revenue` column, so the hashes differ too — but `provenance.bindings` pins the `schema_revision`, `row_count`, and per-binding `input_hash` behind them. See [Compute & filtering](compute-and-filtering.md) for the full binding spec.

## Seeded simulations

The 10 `seed_required` simulation capabilities reject an unseeded `compute()` with a `seed_required` error. The seed is recorded in both the invocation identity and the envelope, so every simulation is replayable: same seed, same scope, same value, same `computation_hash`.

## Keep reading

<table data-view="cards">
<thead><tr><th></th><th></th><th data-hidden data-card-target data-type="content-ref"></th></tr></thead>
<tbody>
<tr><td><strong>How it works</strong></td><td>Separation of duties, the capability contract, and the two-plane flow.</td><td><a href="concepts.md">concepts.md</a></td></tr>
<tr><td><strong>Compute & filtering</strong></td><td>The full <code>ComputationSpec</code>, bindings, and simulations.</td><td><a href="compute-and-filtering.md">compute-and-filtering.md</a></td></tr>
<tr><td><strong>Policy & governance</strong></td><td>Allow-lists for sources, fields, and functions the model can never widen.</td><td><a href="policy.md">policy.md</a></td></tr>
<tr><td><strong>Troubleshooting</strong></td><td><code>schema_revision_mismatch</code>, <code>seed_required</code>, and every other error code.</td><td><a href="troubleshooting.md">troubleshooting.md</a></td></tr>
</tbody>
</table>
