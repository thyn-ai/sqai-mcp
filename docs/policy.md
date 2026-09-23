---
icon: shield-halved
description: How SQAI enforces read-only, pre-execution allow-lists for sources, fields, and functions that model tool input can never widen.
---

# Policy & governance

SQAI is governed by construction: the model proposes meaning, SQAI controls execution. Every source, field, and capability a model can reach is fixed in application code at `createSQAI()` / `create_sqai()` time and checked **before** anything runs. There is no raw SQL, no `eval`, and no write path — the contract holds **0** `write` capabilities. All 6,084 capabilities are read-only; the 5,790 exposed capabilities are replayable by construction (5,780 deterministic plus 10 seed-required simulations), and your policy can narrow that surface further, never past it.

Policy is unreachable from the model. The [AI SDK tool](ai-sdk-tools.md) schemas carry no policy field of any kind — a model request can only pick an operation *inside* the surface you configured. Tools never throw; a denial comes back as a typed `status: "error"` output.

{% hint style="info" %}
Enforcement is in-process and pre-execution: a denial throws before any plan is dispatched, so it costs nothing. The [compute plane](compute-and-filtering.md) provisions its runtime once (first call only), then stays warm — governance adds no per-query overhead.
{% endhint %}

{% hint style="danger" %}
**Policy can only narrow, never widen.** An explicit `allowedFunctions` list that names a capability outside the exposed replayable surface still throws `unsupported_operation` — the packaged surface is the ceiling. Model-supplied tool input contains no `allowed*` keys and cannot alter policy at all.
{% endhint %}

## Three layers of narrowing

Each layer is a strict subset of the one above it. Nothing in a lower layer can re-expose something a higher layer excluded.

| Layer | Set | Fixed by |
|---|---|---|
| Package surface | 5,790 exposed read-only capabilities (5,780 deterministic + 10 seed-required simulations, of 6,084) | The generated, hash-pinned [capability contract](concepts.md) — `sha256:31247fb2…` |
| Application policy | The subset you enable | `SqaiPolicy` in `createSQAI()` / `create_sqai()` |
| One model request | A single operation inside that subset | The model's typed tool call |

The 204 excluded capabilities are `non_deterministic` (also read-only), so no policy setting can reach them — determinism is a property of the surface, not a policy toggle.

## Configure a policy

Policy is a plain object passed once at construction. Set `tenantId` / `tenant_id` alongside it to scope the [result store](#result-store-opaque-and-tenant-authorized).

{% tabs %}
{% tab title="TypeScript" icon="code" %}
```ts
import { createSQAI } from "@thyn-ai/sqai";

const sqai = createSQAI({
  tenantId: "tenant-a",
  policy: {
    allowedSources: ["orders"],
    allowedFields: { orders: ["region", "revenue", "units", "order_date"] },
    allowedFunctions: "all-readonly", // or an explicit list: ["stat_tests.pearson_r"]
  },
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
from sqai import create_sqai

sqai = create_sqai(
    tenant_id="tenant-a",
    policy={
        "allowed_sources": ["orders"],
        "allowed_fields": {"orders": ["region", "revenue", "units", "order_date"]},
        "allowed_functions": "all-readonly",  # or ["stat_tests.pearson_r"]
    },
)
```
{% endtab %}
{% endtabs %}

| Key (TS / Python) | Type | Effect when set |
|---|---|---|
| `allowedSources` / `allowed_sources` | `string[]` | Only these source names may be connected, queried, or bound. |
| `allowedFields` / `allowed_fields` | `Record<source, string[]>` | Per source, only these columns may be a metric, `group_by`, filter column, or bound field. |
| `allowedFunctions` / `allowed_functions` | `"all-readonly"` \| `string[]` | `"all-readonly"` (default) permits the whole read-only surface; a list narrows to those `module.function` ids. |

Omitting a key leaves that dimension unrestricted (still bounded by the package surface). Sources are immutable once connected — re-connecting a name whose `schema_revision` changed throws `source_already_registered`, never a silent overwrite.

## Where enforcement happens

Every check runs pre-execution, in-process, identically in both SDKs.

| Call | Checked | Denial code |
|---|---|---|
| `connect(source, { name })` | source name | `policy_denied_source` |
| `ask` / `resolve` / `query` (with `source_name`) | source, `metric`, `group_by`, each filter column | `policy_denied_source`, `policy_denied_field` |
| `compute` bindings | binding source, every bound field | `policy_denied_source`, `policy_denied_field` |
| `compute` function | capability name + read-only eligibility | `policy_denied_function`, `unsupported_operation` |

Field allow-lists apply per named source: query-plane field checks fire only when `source_name` is set on the spec, so every governed query names its source.

## `all-readonly` semantics

`all-readonly` is the default and the widest a policy can go. A capability is eligible iff:

```
read_only AND (deterministic OR deterministic_when_seeded)
```

Seed *presence* is checked separately at validation: a `deterministic_when_seeded` capability (each of the 10 `simulation` functions) invoked without a `seed` throws `seed_required`, so every result stays replayable ([Determinism & provenance](determinism.md)).

An explicit list is checked in two steps — membership, then eligibility:

- Name not in the list → `policy_denied_function`.
- Name in the list but not read-only-eligible → `unsupported_operation` (policy cannot widen the package surface).

```ts
// policy.allowedFunctions = ["stat_tests.pearson_r"]
await sqai.compute({
  module: "stats",
  function: "median", // not in the allow-list
  bindings: [{ parameter: 0, source: "orders", field: "revenue" }],
});
```

The SDK raises `SqaiError`; the AI SDK tools convert it to a typed error output (they never throw — check `output.status === "error"`):

```json
{
  "status": "error",
  "code": "policy_denied_function",
  "message": "Capability 'stats.median' is not allowed by policy.",
  "retryable": false,
  "request_id": null
}
```

## Result store: opaque and tenant-authorized

Oversized outputs return a truncated preview to the model plus a `result_id` handle; the full value is retrieved with `getResult(id)` / `get_result(id)`. The store leaks nothing:

- **Unlinkable ids.** `result_id` is 16 random bytes (`base64url`), never derived from tenant, source, schema, or hash material — it reveals nothing, including whether a result exists.
- **Tenant-authorized.** A lookup from the wrong `tenantId` returns the same `result_not_found` as a missing id.
- **Bounded.** Defaults: TTL 15 min, ≤256 results, 64 MB total / 16 MB per tenant. A single result larger than the cap returns the preview with no retrievable handle.

## Error contract

Every failure is a `SqaiError` with `code`, `message`, `retryable`, `source: "engine" | "sqai"`, `details`, plus `requestId` / `request_id` and `toResult()` / `to_result()` (the JSON shape above). Policy denials use SQAI's own codes (`source: "sqai"`), all non-retryable. The SQAI runtime's codes pass through verbatim (`source: "engine"`), retryable only for `network_error`, `timeout`, `rate_limited`, and `service_unavailable`.

| Code | Raised when |
|---|---|
| `policy_denied_source` | Source not in `allowedSources`. |
| `policy_denied_field` | Field not in `allowedFields[source]`. |
| `policy_denied_function` | Capability not in an explicit `allowedFunctions` list. |
| `unsupported_operation` | Capability outside the exposed replayable surface, or unknown (carries `nearest_matches`). |
| `seed_required` | A `deterministic_when_seeded` capability (a `simulation`) invoked without a `seed`. |
| `source_already_registered` | Re-connecting a source name whose `schema_revision` changed. |
| `result_not_found` | Unknown `result_id`, or a lookup from the wrong tenant. |

{% hint style="warning" %}
Any message that could reach a model is run through `sanitizeMessage` / `sanitize_message`, which strips absolute filesystem paths (`/Users/…`, `/home/…`, `C:\…`) down to their last segment. Do not depend on error text carrying a full path. The complete code list lives in [Troubleshooting](troubleshooting.md).
{% endhint %}

## The one escape hatch

`getUnsafeRuntime` (`from "@thyn-ai/sqai/unsafe"`) / `get_unsafe_runtime` (`from sqai.unsafe`) returns the raw raw runtime with **none** of these guarantees — it bypasses the capability contract, policy allow-lists, seed enforcement, and the parity matrix. It is deliberately excluded from the package root and from the AI SDK. Import it only when you own the consequences.

## Related

<table data-view="cards">
<thead><tr><th></th><th></th><th data-hidden data-card-target data-type="content-ref"></th></tr></thead>
<tbody>
<tr><td><strong>Vercel AI SDK tool</strong></td><td>The typed tools a model calls — and how denials surface as <code>status: "error"</code>.</td><td><a href="ai-sdk-tools.md">ai-sdk-tools.md</a></td></tr>
<tr><td><strong>Compute &#38; filtering</strong></td><td>Bindings, the read-only surface, and where field policy is enforced.</td><td><a href="compute-and-filtering.md">compute-and-filtering.md</a></td></tr>
<tr><td><strong>Determinism &#38; provenance</strong></td><td>Seeds, replayable results, and the hashes behind every value.</td><td><a href="determinism.md">determinism.md</a></td></tr>
<tr><td><strong>Troubleshooting</strong></td><td>Every error code and its one-line fix.</td><td><a href="troubleshooting.md">troubleshooting.md</a></td></tr>
</tbody>
</table>
