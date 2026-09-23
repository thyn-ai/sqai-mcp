---
icon: key
description: SQAI local mode runs on your machine. Free on 1 machine with one device login; sign in to manage your device or unlock more machines, seats, and commercial use.
---

# Licensing & accounts

SQAI local mode runs **on your machine**. The query plane runs in-process; the compute plane is a signed on-device runtime that provisions itself once and then stays local. Your local files and query results stay local — the only network calls are the one-time signed-runtime download and the one-time free device sign-in for licensing. There is no query-time network and nothing phones home.

- **Free on 1 machine** — `sqai login` enrolls this device on the `sqai_developer` tier; no card.
- **`sqai login` (required for local compute, free)** — claim a per-device account to manage your machines and unlock the paid ladder. Licensing only — it moves a signed token, never your data.
- **Pro / Team** — more machines, seats, and commercial use, billed from the account portal. Still on-device; still private.

{% hint style="info" %}
New here? Start with the [TypeScript quickstart](quickstart-ts.md) or [Python quickstart](quickstart-python.md). The free path is one command: `sqai login`.
{% endhint %}

## Free device login

Default `local` mode keeps execution on your machine. Run `sqai login` once to create the free `sqai_developer` device key used by local compute:

- **Query plane** — connect CSV/records/SQLite, resolve typed intent, execute in-process. No runtime process, sub-millisecond.
- **Computation plane** — all 5,790 exposed read-only capabilities (5,780 deterministic + 10 seed-required simulations, of 6,084 in the contract), dispatched through a signed managed runtime that provisions itself on first use, then stays warm on your machine.
- **Provenance** — `plan_hash`, `invocation_hash`, `computation_hash`, and the full determinism envelope on every call.

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

{% hint style="success" %}
**One-time provision, then warm.** The first-ever compute call downloads, verifies, extracts, and starts the managed runtime (~110s). The runtime then stays resident — there is **no per-query cold start**. Every later `compute()` is warm: `finance.npv` measures `latency_ms` of 0.83–0.93. Disable the download with `SQAI_RUNTIME_AUTO_INSTALL=0`.
{% endhint %}

## `sqai login` — your device account

Sign-in is **free** and required for local compute access. It associates this machine with the `sqai_developer` tier and uses the same device-code flow as the rest of the Thyn family (RFC 8628). It is **licensing only**: it obtains a signed, device-bound license — your data never leaves the machine.

{% stepper %}
{% step %}
#### Run `sqai login`

```bash
sqai login
```

It prints a short code and opens `accounts.thyn.ai` to authorize this device. Free forever on 1 machine — no card.
{% endstep %}

{% step %}
#### The runtime binds a device license

On the next call, the local runtime exchanges your account key once for a **platform-signed, device-bound offline license** (RS256), stored under `~/.sqai`. After that it runs fully offline — no query-time network.
{% endstep %}

{% step %}
#### Upgrade when you need more

Move up the ladder from `accounts.thyn.ai?app=sqai`. Your code is unchanged — only the entitlement behind your device moves.
{% endstep %}
{% endstepper %}

## Tiers

Free on 1 machine, forever. Paid tiers add machines, seats, and commercial use — billed from the account portal, never a cloud service.

| Tier | Price | Machines | For |
| --- | --- | --- | --- |
| **Developer** | Free | 1 device | Local, non-commercial use — the whole read-only surface |
| **Pro** | $25/mo | 3 devices | Commercial use, async jobs, webhooks, audit trail |
| **Team** | $99/mo | 10 devices | Everything in Pro + role-based access and team seats |

All tiers run the same on-device runtime with the full read-only capability surface. Tiers gate **machines, seats, and commercial rights** — not features of the compute itself.

## Connecting databases (private SQAI deployment)

Files, records, and SQLite run in-process with zero setup. To query a live database (Postgres, Oracle, MySQL, and the rest of the connector catalog), point SQAI at a private SQAI deployment — your infrastructure, your network. Set `SQAI_DEPLOYMENT_URL`; the query plane still resolves typed intent locally and compute is POSTed to your SQAI deployment.

```bash
export SQAI_DEPLOYMENT_URL=https://sqai.example.com:8443
```

| Env | Mode | Query plane | Computation plane |
| --- | --- | --- | --- |
| _(none)_ | `local` | in-process | managed runtime, on your machine |
| `SQAI_DEPLOYMENT_URL` | `deployment` | in-process | `{SQAI_DEPLOYMENT_URL}/v1/libraries/execute` (your SQAI deployment) |

See [Connect your data](connect-data.md) for the full connector catalog and per-source config.

## Managed-runtime trust

The compute plane needs no license to run free, but every bundle it installs is cryptographically verified against a trust root embedded in the SQAI packages — one release edit rotates the whole posture.

- **Signing** — one accepted release key: RS256 (RSASSA-PKCS1-v1_5 + SHA-256), RSA-4096. The private key never ships; it lives only as a CI secret and offline with the release owner.
- **Device license** — a signed-in device's license is RS256, product-scoped (`products.sqai`) and device-bound, issued by the platform license signer and verified offline by the runtime.
- **Revocation & rollback** — a revoked-key list plus a rollback floor `MIN_ACCEPTED_RUNTIME_VERSION = 0.1.0`; manifests below it are rejected (`rollback_protected`). The downloaded manifest is never trusted to carry its own keys.
- **Verify before extract** — RS256 signature over the exact manifest bytes → schema and path-safety checks → per-artifact sha256 and size → reject any unlisted, symlinked, or non-regular member, all **before** extraction. Extract to a temp dir, then atomic rename.
- **Per-user cache** — macOS `~/Library/Caches/SQAI/runtime`, Linux `$XDG_CACHE_HOME/sqai/runtime`, Windows `%LOCALAPPDATA%\SQAI\runtime`.
- **Air-gapped** — `SQAI_RUNTIME_AUTO_INSTALL=0` disables downloads; compute then fails structured (`runtime_provision_failed`) and you install manually with `sqai runtime install`.

The verified bundle's identity is stamped into every result's determinism envelope, so you can prove which signed runtime produced a value:

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

## Next steps

<table data-view="cards">
<thead><tr><th></th><th></th><th data-hidden data-card-target data-type="content-ref"></th></tr></thead>
<tbody>
<tr><td><strong>TypeScript quickstart</strong></td><td>Connect a source, run your first query and computation.</td><td><a href="quickstart-ts.md">quickstart-ts.md</a></td></tr>
<tr><td><strong>Python quickstart</strong></td><td>The same API, identical hashes.</td><td><a href="quickstart-python.md">quickstart-python.md</a></td></tr>
<tr><td><strong>Connect data</strong></td><td>Files and SQLite in-process; databases via your SQAI deployment.</td><td><a href="connect-data.md">connect-data.md</a></td></tr>
<tr><td><strong>CLI reference</strong></td><td>`sqai login`, `doctor`, `runtime`, and more.</td><td><a href="cli.md">cli.md</a></td></tr>
<tr><td><strong>Determinism & provenance</strong></td><td>What the hashes and the determinism envelope guarantee.</td><td><a href="determinism.md">determinism.md</a></td></tr>
<tr><td><strong>AI SDK tool</strong></td><td>Expose the on-device compute plane to an agent.</td><td><a href="ai-sdk-tools.md">ai-sdk-tools.md</a></td></tr>
</tbody>
</table>
