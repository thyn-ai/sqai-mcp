---
icon: shield-halved
description: SQAI runs on your machine — no cloud, no query-time network, read-only by construction, and a signed on-device runtime you can verify. What crosses the network, and what never does.
---

# Security & privacy (no cloud)

SQAI's security posture starts with an architecture, not a promise: **there is no SQAI cloud.** The query plane runs in-process; the compute plane is a signed runtime that provisions itself **once** and then stays local. Your data is read on your machine, computed on your machine, and hashed on your machine. In `local` mode the only network calls SQAI ever makes are the **one-time signed-runtime download** and the **one-time free device sign-in** — both setup, neither carries your data. After that there is **no query-time network** and **nothing phones home**.

Everything a model can reach is read-only by construction, fixed in your application code, and checked before anything runs. Every result is self-describing enough to prove — after the fact — exactly which signed runtime produced which value, against which contract, over which rows.

{% hint style="info" %}
This page is the security view of the two-plane model in [How it works](../concepts.md). For the enforcement mechanics it references — allow-lists, the result store, error codes — see [Policy & governance](../policy.md); for the trust root behind the runtime, [Licensing & accounts](../licensing.md).
{% endhint %}

## What never leaves your machine

In `local` mode (the default — no environment variables), your data is never transmitted. Files, in-memory records, and SQLite are read in-process; compute is dispatched to the on-device runtime. The only bytes that cross the network are two one-time setup calls.

| Network call | When | Where to | What it carries |
|---|---|---|---|
| Signed-runtime download | First-ever `compute()`, once | The runtime artifact host | The signed bundle — **none of your data** |
| Device sign-in (`sqai login`) | Once, at setup | `accounts.thyn.ai` | A device-code exchange for a signed license — **licensing only** |
| Query plane (`connect`/`ask`/`resolve`/`query`) | Every call | _Nowhere_ — in-process | Nothing crosses the network |
| Compute plane (`compute()`) | Every call, `local` mode | _Nowhere_ — on the on-device runtime | Nothing crosses the network |

After provisioning, disconnect the network and everything except a fresh download keeps working — the runtime holds a device-bound offline license and runs with no query-time network. Air-gapped from the start? Set `SQAI_RUNTIME_AUTO_INSTALL=0` to disable the download entirely; compute then fails structured (`runtime_provision_failed`) and you install the bundle out-of-band with `sqai runtime install`.

{% hint style="success" %}
**No telemetry, no per-query network.** SQAI does not beacon usage, does not stream your rows anywhere, and makes no call to run a query or a computation. The query plane never touches the network at all; the compute plane touches it exactly twice in a machine's lifetime, both at setup.
{% endhint %}

## The two modes — and the one that isn't cloud

SQAI infers its mode from the environment. There are exactly two, and neither is a hosted service:

| Env | Mode | Query plane | Compute plane | Where data goes |
|---|---|---|---|---|
| _(none)_ | `local` | in-process | on-device runtime, provisioned once then warm | Stays on your machine |
| `SQAI_DEPLOYMENT_URL` | `deployment` | in-process | `POST {SQAI_DEPLOYMENT_URL}/v1/libraries/execute` | Your own infrastructure |

`deployment` mode exists so you can query **live** databases (Postgres, Oracle, MySQL, warehouses, object storage, and the rest of the connector catalog) — but it points at a **private SQAI deployment you run**, on your network, not at any SQAI cloud. Even then the query plane still resolves typed intent locally; only the compute dispatch is POSTed to your deployment. `SQAI_API_KEY`, if set, is used **only** as the Bearer credential forwarded to your deployment when it requires auth — it never selects a cloud and does not change the mode.

{% hint style="warning" %}
The variable is `SQAI_DEPLOYMENT_URL`. Do not set legacy engine-style URL variables, and there is no default remote endpoint — omit the deployment URL and SQAI runs fully local. Files, records, and SQLite work in **both** modes; only live databases require a deployment.
{% endhint %}

## Read-only by construction

The strongest guarantee is the one nothing can toggle: SQAI has **no write path**. There is no raw SQL surface, no `eval`, and no code the model authors. The capability contract holds **0** `write` capabilities — all **6,084** capabilities are read-only. Of those, **5,790** are exposed to the SDKs (**5,780** deterministic plus **10** seed-required simulations); the **204** excluded capabilities are `non_deterministic` — also read-only, and unreachable by any policy setting because determinism is a property of the surface, not a toggle.

- **Query plane** — a metric-aggregation surface over your sources (`sum`, `avg`, `count`, `min`, `max`). Even a SQLite or database source is read through a read-only query; there is no update, insert, or DDL path.
- **Compute plane** — a function-dispatch surface over the runtime's math library. Every call takes typed arguments and returns a value plus hashes — no raw code, no side effects, no filesystem or network reach from inside a capability.

The model **proposes meaning**; SQAI **controls execution**. A model chooses an operation from the fixed surface — it never writes the operation.

## Governance the model can't widen

Which sources, fields, and functions the model can reach is fixed in **your** application code at `createSQAI()` / `create_sqai()` time, and enforced **pre-execution, in-process**. Each layer is a strict subset of the one above it — nothing lower can re-expose what a higher layer excluded.

| Layer | Set | Fixed by |
|---|---|---|
| Package surface | 5,790 exposed read-only capabilities | The hash-pinned capability contract — `sha256:31247fb2…` |
| Application policy | The subset you enable | `SqaiPolicy` in `createSQAI()` / `create_sqai()` |
| One model request | A single operation inside that subset | The model's typed tool call |

Policy can only **narrow**, never widen: an `allowedFunctions` list naming something outside the exposed replayable surface still throws `unsupported_operation` — the package surface is the ceiling. Critically, **policy is unreachable from the model.** The AI SDK tool schemas carry no policy field of any kind; model-supplied tool input contains no `allowed*` keys and cannot alter policy at all. A denial never throws to the model — it comes back as a typed `status: "error"` with a code like `policy_denied_source`, `policy_denied_field`, or `policy_denied_function`.

```ts
const sqai = createSQAI({
  tenantId: "tenant-a",
  policy: {
    allowedSources: ["orders"],
    allowedFields: { orders: ["region", "revenue"] },
    allowedFunctions: ["stat_tests.pearson_r"], // narrows to exactly this
  },
});
```

See [Policy & governance](../policy.md) for every enforcement point and denial code.

## Data minimization

SQAI is built so the least possible data reaches the model — and none of it reveals more than it must.

- **Bindings keep data out of the model's context.** A model never pastes a column of numbers into a tool call; it names a source and its fields, and SQAI resolves the actual values **in-process** through the runtime's aligned `extractColumns` primitive. Large data stays out of the prompt, and the `input_hash` is honest — computed over the values the runtime actually received, not a copy the model saw.
- **The result store is opaque and tenant-authorized.** Oversized outputs return a truncated preview plus a `result_id` handle; the full value is fetched with `getResult(id)` / `get_result(id)`. The id is 16 random bytes (`base64url`), never derived from tenant, source, schema, or hash material — it reveals nothing, including whether a result exists. A lookup from the wrong `tenantId` returns the same `result_not_found` as a missing id. The store is bounded: TTL 15 min, ≤256 results, 64 MB total / 16 MB per tenant.
- **Errors don't leak paths.** Any message that could reach a model is run through `sanitizeMessage` / `sanitize_message`, which strips absolute filesystem paths (`/Users/…`, `/home/…`, `C:\…`) down to their last segment. Every `SqaiError` carries a `source: "engine" | "sqai"` so you can tell an SQAI-runtime error from a policy denial — the runtime's codes pass through verbatim, SQAI's own codes are all non-retryable.

## The signed runtime you can trust

The compute plane needs no license to run free, but every bundle it installs is cryptographically verified against a trust root **embedded in the SQAI packages** — the downloaded manifest is never trusted to carry its own keys. One release edit rotates the whole posture.

{% stepper %}
{% step %}
#### One accepted signing key

RS256 (RSASSA-PKCS1-v1_5 + SHA-256), RSA-4096. The private key never ships — it lives only as a CI secret and offline with the release owner.
{% endstep %}
{% step %}
#### Verify **before** extract

RS256 signature over the exact manifest bytes → schema and path-safety checks → per-artifact sha256 and size → reject any unlisted, symlinked, or non-regular member — all before extraction. Extract to a temp dir, then atomic rename.
{% endstep %}
{% step %}
#### Revocation & rollback

A revoked-key list plus a rollback floor, `MIN_ACCEPTED_RUNTIME_VERSION = 0.1.0`; manifests below it are rejected (`rollback_protected`).
{% endstep %}
{% step %}
#### Per-user cache, no shared state

macOS `~/Library/Caches/SQAI/runtime`, Linux `$XDG_CACHE_HOME/sqai/runtime`, Windows `%LOCALAPPDATA%\SQAI\runtime`.
{% endstep %}
{% endstepper %}

The verified bundle's identity is stamped into every result's determinism envelope — so you can prove which signed runtime produced a value:

```json
{
  "determinism": {
    "runtime_bundle_version": "0.1.0",
    "runtime_bundle_sha256": "4d64142e4c1ff63d299cfc8b172fdf97cb59169b545e1e02978e678a632ce6e1",
    "platform": "darwin-arm64",
    "precision_mode": "float64",
    "thread_count": 1
  }
}
```

## Licensing is licensing only

`sqai login` is free, required for local compute, and uses the same RFC 8628 device-code flow as the rest of the Thyn family. It is **licensing only** — it moves a signed token, never your data.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
import { createSQAI } from "@thyn-ai/sqai";

const sqai = createSQAI(); // after sqai login: free · local · on your machine · no card
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
from sqai import create_sqai

sqai = create_sqai()  # after sqai login: free · local · on your machine · no card
```
{% endtab %}
{% endtabs %}

On its next call, the runtime exchanges your account key **once** for a **platform-signed, device-bound offline license** — RS256, product-scoped (`products.sqai`), verified offline by the runtime and stored under `~/.sqai`. After that it runs fully offline: no query-time network, no re-check. Paid tiers (Pro / Team, via `accounts.thyn.ai`) gate **machines, seats, and commercial rights** — not the compute itself, and not your privacy. Every tier runs the same on-device runtime.

## Provenance is a security property

Determinism isn't only reproducibility — it's an audit trail you can verify without trusting SQAI. Every compute result carries three domain-separated SHA-256 hashes plus the runtime identity that produced it:

- `invocation_hash` — the operation identity (module, function, args, resolved bindings, seed, `contract_hash`, execution scope), computed **before** execution.
- `computation_hash` — `invocation_hash` folded with the canonical result value, computed **after**. The full-fidelity replay key.
- `contract_hash` — the pinned capability contract the hashes were computed against (`sha256:31247fb2…`). A contract change moves every downstream hash.

Because the TypeScript and Python SDKs share one canonical serializer, byte-identical input yields byte-identical hashes in either language — so a value computed in one runtime replays and verifies in another. The real output of `finance.npv(0.1, [-1000, 300, 420, 560, 680])` is `505.020148896933`, `invocation_hash b3ca3e92…`, `computation_hash b74f67d0…`, against contract `sha256:31247fb2…`. Pair that with `provenance.bindings` (source, fields, `schema_revision`, `row_count`, `input_hash`) and you can prove which rows fed which number, on which signed runtime — after the fact, offline. See [Determinism & provenance](../determinism.md).

## The one escape hatch

`getUnsafeRuntime` (`from "@thyn-ai/sqai/unsafe"`) / `get_unsafe_runtime` (`from sqai.unsafe`) returns the raw runtime with **none** of these guarantees — it bypasses the capability contract, policy allow-lists, seed enforcement, and the cross-language parity matrix. It is deliberately excluded from the package root and from the AI SDK, and is never reachable by a model. Import it only in code you fully own; outside the contract, nothing on this page applies.

{% hint style="danger" %}
The unsafe runtime is the single documented way to leave the governed surface. If your threat model requires that model-driven code can never reach it, simply never import it — a model has no path to `@thyn-ai/sqai/unsafe` on its own.
{% endhint %}

## Next steps

<table data-view="cards">
<thead><tr><th></th><th></th><th data-hidden data-card-target data-type="content-ref"></th></tr></thead>
<tbody>
<tr><td><strong>Policy & governance</strong></td><td>Allow-lists, enforcement points, and the narrow-only rule.</td><td><a href="../policy.md">../policy.md</a></td></tr>
<tr><td><strong>Licensing & accounts</strong></td><td>The device flow, tiers, and the managed-runtime trust root.</td><td><a href="../licensing.md">../licensing.md</a></td></tr>
<tr><td><strong>How it works</strong></td><td>The two planes, the pipeline, and where each guarantee is enforced.</td><td><a href="../concepts.md">../concepts.md</a></td></tr>
<tr><td><strong>Determinism & provenance</strong></td><td>The three hashes and the envelope behind every verifiable result.</td><td><a href="../determinism.md">../determinism.md</a></td></tr>
<tr><td><strong>Connect your data</strong></td><td>Files and SQLite in-process; live databases via your deployment.</td><td><a href="../connect-data.md">../connect-data.md</a></td></tr>
<tr><td><strong>Troubleshooting</strong></td><td><code>runtime_provision_failed</code>, policy denials, and every other code.</td><td><a href="../troubleshooting.md">../troubleshooting.md</a></td></tr>
</tbody>
</table>
</content>
</invoke>
