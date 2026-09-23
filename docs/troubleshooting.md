---
icon: wrench
description: Every SqaiError code and its one-line fix, plus the sqai doctor and runtime diagnostics.
---

# Troubleshooting

SQAI never throws a raw stack trace. Every failure is a typed `SqaiError` carrying `{ code, message, retryable, request_id }` plus `source` and structured `details`. `source: "engine"` means the SQAI runtime rejected the request and its code passes through verbatim; `source: "sqai"` means the SDK stopped it before dispatch. Codes are stable snake_case — a code is never renamed and the same condition never gets two codes.

The query plane runs in-process: no separate service, nothing to provision, so it never raises a runtime error. Local compute requires one free `sqai login` device enrollment, then provisions the managed runtime exactly **once** — the first-ever `compute()` spends ~110s to download, verify (pinned sha256 + signed manifest), extract, and start the runtime — then stays **warm and resident on your machine**. Every later call is warm: `finance.npv` returns in ~0.9ms. There is **no per-query cold start**; a slow first call is the one-time setup, not a bug.

{% hint style="info" %}
Hit an error? Run `sqai doctor --json` first. It prints Node / SDK / contract / runtime / parity checks as one JSON object and exits non-zero on any failure. `sqai runtime status --json` shows whether the runtime is warm. Every code below maps to one fix.
{% endhint %}

## Every code, one fix

| Code | Source | One-line fix |
|---|---|---|
| `unsupported_platform` | sqai | No managed bundle for your OS/arch — set `SQAI_DEPLOYMENT_URL` to run compute on a private SQAI deployment. |
| `login_required` | sqai | Run `sqai login` once for the free `sqai_developer` device key, or set `SQAI_API_KEY` in the process. |
| `runtime_provision_failed` | sqai | Managed runtime couldn't install/start — read `details.reason`, then `sqai runtime install`. |
| `daemon_port_conflict` | sqai | Runtime process couldn't bind its socket/port — `sqai runtime stop` (or free the port), then retry. |
| `compute_runtime_unavailable` | sqai / runtime | No compute backend reachable — wait out the one-time provision, or set `SQAI_DEPLOYMENT_URL` for a private SQAI deployment. Retryable. |
| `contract_mismatch` | sqai | Runtime's contract hash ≠ the embedded one — align SDK and SQAI versions; check `sqai doctor`. |
| `seed_required` | sqai | Simulation capability called without a seed — pass `seed`. |
| `unsupported_operation` | sqai | Capability isn't in the exposed replayable surface (or the name is unknown) — use a listed one; see `details.nearest_matches`. |
| `invalid_intent` | sqai | Malformed computation (wrong arg count/type, missing or unknown param) — match the signature. |
| `duplicate_argument_binding` | sqai | A parameter was supplied twice across args/kwargs/bindings — supply each exactly once. |
| `policy_denied_source` | sqai | Source not in `allowedSources` — add it to the policy. |
| `policy_denied_field` | sqai | Field not in `allowedFields` for that source — add it. |
| `policy_denied_function` | sqai | Capability not in `allowedFunctions` — add it (must be in the exposed read-only surface). |
| `source_already_registered` | sqai | A name was re-connected to different data — pick a new name; connected sources are immutable. |
| `result_not_found` | sqai | Stored result missing, expired, or wrong principal — re-run; results are TTL'd per tenant. |
| `network_error` · `timeout` · `rate_limited` · `service_unavailable` · `quota_exhausted` | runtime | Transient private SQAI deployment failures — retry with backoff. Retryable. |

## Runtime provisioning

<details>

<summary><code>unsupported_platform</code> — no bundle for your OS/arch</summary>

The managed runtime ships as a signed per-platform bundle. If none is published for your `platform-arch` (the current tested pair is `darwin-arm64`, bundle `0.1.0`, sha256 `4d64142e…`), local compute can't provision.

```
No managed runtime bundle is published for 'linux-x64'.
```

`details` carries `{ platform, supported }`. **Fix:** run where a bundle exists, or point at a private SQAI deployment — set `SQAI_DEPLOYMENT_URL` (with `SQAI_API_KEY` only if your SQAI deployment requires auth). The query plane is unaffected; it needs no runtime.

</details>

<details>

<summary><code>runtime_provision_failed</code> — install or start failed</summary>

One code, many reasons — always in `details.reason` (printed first by `sqai runtime install`):

| `details.reason` | Meaning | Fix |
|---|---|---|
| `bundle_sha256_mismatch` | Downloaded tarball didn't match the contract's pinned sha256 (corrupt or tampered). | Re-run `sqai runtime install`; never bypass the check. |
| `download_failed` | Bundle couldn't be fetched. Retryable. | Check network, retry. |
| `rollback_protected` | Bundle version is below the minimum accepted (downgrade blocked). | Use a runtime ≥ the min version. |
| `daemon_unhealthy` | Bundle installed but the runtime never reported a usable runtime. | Check runtime logs, retry. |
| `install_rename_failed` | Verified bundle couldn't be moved into place. | Check cache-dir permissions/disk. |
| `no_build_service` | `runtimeModules` set with no build service. | Set `SQAI_BUILD_SERVICE_URL`, or omit `runtimeModules` to use the default bundle. |

Auto-install disabled? You'll see:

```
Automatic runtime installation is disabled (SQAI_RUNTIME_AUTO_INSTALL=0).
Install manually with `sqai runtime install`.
```

**Fix:** unset `SQAI_RUNTIME_AUTO_INSTALL=0`, or run `sqai runtime install`. Signature/trust failures (bad or revoked signing key) surface here too — those mean the bundle is untrusted; do not force it.

</details>

<details>

<summary><code>daemon_port_conflict</code> — socket/port already held</summary>

The runtime binds a deterministic per-runtime socket and TCP port so a filtered runtime never collides with the default. If the endpoint is already held by a stale runtime process, provisioning fails here. **Fix:** `sqai runtime stop` to release it, or free the port, then retry. `sqai runtime status --json` shows whether a runtime process is already `managed` by this process.

</details>

## Compute dispatch

<details>

<summary><code>compute_runtime_unavailable</code> — no backend reachable</summary>

Raised when the local runtime isn't up yet or a private SQAI deployment is unreachable. This is **retryable** — the common case is the first call still doing its one-time provision.

```
Your private SQAI deployment is unreachable: <cause>. Check SQAI_DEPLOYMENT_URL / SQAI_API_KEY.
```

**Fix:** for local mode, let the one-time provision finish (~110s) — every call after is warm. For private SQAI deployment mode, set `SQAI_DEPLOYMENT_URL` (with `SQAI_API_KEY` if your SQAI deployment requires auth). HTTP 429 from a private SQAI deployment arrives as `quota_exhausted` (source `engine`, retryable).

</details>

<details>

<summary><code>contract_mismatch</code> — runtime runs a different contract</summary>

The SQAI deployment advertises a capability-contract hash that differs from the one embedded in your SDK. Every result is stamped with `contract_hash` (`sha256:31247fb2…` for this build) so drift is detectable, not silent. **Fix:** align SDK and SQAI versions. `sqai doctor` cross-checks the embedded contract against `tested-pair.json` and reports `MISMATCH vs embedded contract: capability_contract_hash` when they diverge.

</details>

## Computation validation

These are caught by the SDK before anything is dispatched — the model can't compute past them.

<details>

<summary><code>seed_required</code> — a simulation needs a seed</summary>

10 of the 5,790 exposed capabilities are seed-required simulations. Called without a seed:

```
'<capability>' is a simulation capability: a seed is required so results are replayable.
```

**Fix:** pass `seed`. With a seed the result is deterministic and its `computation_hash` is reproducible.

</details>

<details>

<summary><code>unsupported_operation</code> — not on the surface</summary>

Of 6,084 total capabilities, 5,790 are exposed to TS/Python/AI-SDK — all read-only and replayable (5,780 deterministic plus 10 deterministic-when-seeded simulations). The rest are not. You hit this when the name is unknown, or the capability isn't in the exposed replayable surface (e.g. a struct-returning capability outside the exposed signature set):

```
Unknown capability 'finance.npvv'.
```

`details.nearest_matches` suggests the closest real names. **Fix:** call a listed capability — browse with `searchCapabilities` / `listSources` (each now carries a one-line `summary`).

</details>

<details>

<summary><code>invalid_intent</code> — malformed computation</summary>

Wrong positional count, unknown parameter, missing required parameter, or a wire-type mismatch:

```
'finance.npv' takes at most 2 arguments; got 3 positional.
'finance.npv' has no parameter 'rat'.
'finance.npv' is missing required parameter 'rate'.
Parameter 'rate' of 'finance.npv' expects float64.
```

**Fix:** match the capability's signature (name, arity, and types).

</details>

<details>

<summary><code>duplicate_argument_binding</code> — a parameter set twice</summary>

Every parameter must be supplied through exactly one of `args`, `kwargs`, or `bindings`. SQAI never silently overwrites:

```
Parameter 'cashflows' of 'finance.npv' was supplied through both kwargs and bindings.
```

**Fix:** supply each parameter once.

</details>

## Policy and sources

<details>

<summary><code>policy_denied_source</code> · <code>policy_denied_field</code> · <code>policy_denied_function</code></summary>

Application policy is pre-execution and un-overridable. A request outside the enabled subset is denied:

```
Source 'payroll' is not allowed by policy.
Field 'ssn' on source 'employees' is not allowed by policy.
Capability 'finance.npv' is not allowed by policy.
```

**Fix:** add the source/field/capability to `allowedSources` / `allowedFields` / `allowedFunctions`. Policy can only narrow the read-only surface, never widen it — a non-read-only capability still fails `unsupported_operation`.

</details>

<details>

<summary><code>source_already_registered</code> — sources are immutable</summary>

`connect()` binds a name to a schema revision for the life of the process. Re-connecting the same name to different data is rejected:

```
Source 'sales' is already registered; connected sources are immutable.
```

Re-connecting identical data returns the existing source. **Fix:** use a different name for different data.

</details>

<details>

<summary><code>result_not_found</code> — stored result gone or wrong principal</summary>

Stored results are TTL'd and scoped per tenant; a lookup from the wrong principal returns the same `result_not_found` as an expired one — by design, so it never leaks existence.

```
No such result for this principal.
```

**Fix:** re-run the computation, or fetch with the same principal before the TTL expires.

</details>

## Diagnose in order

{% stepper %}
{% step %}
#### Check the environment

```bash
sqai doctor --json
```

Verifies Node ≥ 20, that `@thyn-ai/sqai` imports, and that the embedded contract loads (`4778 capabilities, sha256:31247fb2…`). Non-zero exit means one check failed — read `checks[].detail`.
{% endstep %}

{% step %}
#### Check the runtime

```bash
sqai runtime status --json
```

`runtime_available: true` means the runtime is warm — compute will be sub-millisecond. `false` means the next `compute()` will provision (~110s, once).
{% endstep %}

{% step %}
#### Provision or repair

```bash
sqai runtime install      # download → verify → extract → start; structured failure on any step
sqai runtime verify       # print the pinned bundle version + per-platform sha256
sqai runtime stop         # release a stale runtime process endpoint
```

Every failure prints `code`, `message`, and `details.reason` — never a stack trace.
{% endstep %}

{% step %}
#### Confirm parity (optional)

```bash
sqai doctor --parity --strict
```

Asserts every exposed capability is read-only and replayable, and, against a live runtime, that the contract's modules match `list_modules`. `--strict` fails if no runtime is reachable.
{% endstep %}
{% endstepper %}

## Catch it in code

Inspect `code`, `source`, `retryable`, and `request_id` on the typed error — never parse the message.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
import { SqaiError } from "@thyn-ai/sqai";

try {
  await sqai.compute({ module: "finance", function: "npv", args: [0.1, cashflows] });
} catch (error) {
  if (error instanceof SqaiError) {
    console.error(error.code, error.source, error.retryable, error.requestId);
    // → "seed_required" "sqai" false null
    if (error.retryable) {
      // safe to retry (compute_runtime_unavailable, rate_limited, …)
    }
  }
}
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
from sqai import SqaiError

try:
    client.compute(module="finance", function="npv", args=[0.1, cashflows])
except SqaiError as error:
    print(error.code, error.source, error.retryable, error.request_id)
    # → seed_required sqai False None
    if error.retryable:
        ...  # safe to retry
```
{% endtab %}
{% endtabs %}

## Is the runtime warm?

`latency_ms` on any `compute()` result is the tell: warm calls are sub-millisecond (`finance.npv` ~0.93ms). A ~110s first call is the one-time provision, not a per-query cost — the runtime stays resident. See [Determinism & provenance](determinism.md) for the full result envelope.
