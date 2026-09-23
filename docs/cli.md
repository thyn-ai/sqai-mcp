---
icon: terminal
description: Every sqai CLI command — doctor, runtime provisioning, and contract inspection — with real output, --json everywhere, and scriptable exit codes.
---

# CLI reference

`sqai` is the operator's toolkit for SQAI (Structured Query AI) — the deterministic, read-only structured-data runtime for AI agents. It is **not** the query surface: connecting sources, asking questions, and running `compute()` all happen in-process through the [TypeScript](quickstart-ts.md) and [Python](quickstart-python.md) SDKs, sub-millisecond, with no separate service and no key. The CLI is what you run around that: check the environment, inspect the capability contract, provision the managed compute runtime, and prove TS↔Python parity from one shared contract hash.

Every command prints concise checkmark lines by default and a single JSON object with `--json`. Exit codes are scriptable: `0` success, `1` a failed check or fatal error, `2` a usage error. Nothing ever prints a stack trace — failures are structured with a code, a message, and remediation `details`.

{% hint style="info" %}
The query plane needs no CLI at all. Install the SDK ([Installation](installation.md)), call `connect()` and `ask()`, and you are running. Reach for `sqai` when you want to verify the SQAI runtime, provision the compute runtime, or wire health checks into CI.
{% endhint %}

<table data-view="cards">
<thead><tr><th></th><th></th><th data-hidden data-card-target data-type="content-ref"></th></tr></thead>
<tbody>
<tr><td><strong>Installation</strong></td><td>Install the SDK and the <code>sqai</code> CLI — npm or pip.</td><td><a href="installation.md">installation.md</a></td></tr>
<tr><td><strong>Determinism &#38; provenance</strong></td><td>The contract hash, invocation/computation hashes, and byte-identical replay.</td><td><a href="determinism.md">determinism.md</a></td></tr>
<tr><td><strong>Compute &#38; filtering</strong></td><td>The 6,084-capability compute plane the runtime serves.</td><td><a href="compute-and-filtering.md">compute-and-filtering.md</a></td></tr>
<tr><td><strong>Troubleshooting</strong></td><td>Every error message and its one-line fix.</td><td><a href="troubleshooting.md">troubleshooting.md</a></td></tr>
</tbody>
</table>

## Global behavior

A few rules apply to every command:

- **`--json` everywhere.** Every command accepts `--json` and then prints exactly one JSON object to stdout. Human mode prints `✓`/`✗`/`•` lines.
- **Exit codes.** `0` on success. `1` when a check fails or a command hits a fatal error (a failed doctor check, a runtime install failure, `--parity --strict` with no live runtime). `2` on a usage error (unknown command or runtime subcommand).
- **No stack traces.** Fatal errors are structured: a `code`, a `message` naming the fix, and `details` (with `details.reason` printed first when present).
- **Contract-anchored.** `doctor`, `runtime verify`, and `--version` all read the capability contract embedded in the SDK, so they report the same `sha256:31247fb2…` hash the SDKs stamp onto every result.

The CLI reads the same `SQAI_*` environment as the SDK:

| Variable | Default | Meaning |
| --- | --- | --- |
| `SQAI_RUNTIME_AUTO_INSTALL` | `1` | Set to `0` for air-gapped hosts: online download is disabled and `runtime install` fails fast with remediation. |
| `SQAI_DEPLOYMENT_URL` | (none) | Your private SQAI deployment URL (for live databases). Presence selects private SQAI deployment mode. |
| `SQAI_API_KEY` | (none) | Bearer credential forwarded to **your** private SQAI deployment. Local device credentials from `sqai login` live in `~/.sqai`; setting this variable is only for headless/local-test injection. Files and SQLite query in-process do not need it. |
| `SQAI_RUNTIME_MODULES` | (all) | Comma-separated allowlist for a filtered runtime build. |

## Commands

{% tabs %}
{% tab title="login" icon="right-to-bracket" %}
Sign this device in — **free on 1 machine**, and **licensing only**: it moves a signed token, never your data. Local compute uses this free device key; query execution over files/SQLite remains in-process. Same device-code flow (RFC 8628) the rest of the Thyn family uses.

```text
sqai login [--no-browser]
sqai logout
```

```text
$ sqai login
authenticating via https://accounts.thyn.ai …

  Open https://accounts.thyn.ai/device?user_code=WDJB-MJHT
  and enter code:  WDJB-MJHT

creating your free SQAI Developer API key …

  ✓ sqai login complete — the local runtime will provision a device-bound offline license on first use.
  SQAI runs fully on your machine; no data leaves it.
```

The account key is cached under `~/.sqai` (mode `600`). On the next compute call the local runtime exchanges it **once** for a platform-signed, device-bound offline license (RS256), then runs fully offline. `sqai logout` clears the cached credentials (the device identity is kept, so a re-login rebinds the same device rather than consuming a new seat). Headless CI: pass a token with `SQAI_TOKEN=… sqai login --no-browser`.

See [Licensing & accounts](licensing.md) for tiers (free Developer · Pro · Team) and the no-cloud model.
{% endtab %}
{% tab title="doctor" icon="stethoscope" %}
Verify the environment and the embedded contract. `doctor` checks the Node version, that `@thyn-ai/sqai` imports, that the capability contract loads, that the repo's tested-pair pin (when present) matches, and — if a runtime is reachable — that it is healthy. It is the first thing to run when something looks wrong.

```text
sqai doctor [--parity] [--strict] [--json]
```

| Flag | Default | Meaning |
| --- | --- | --- |
| `--parity` | off | Also assert the exposure invariant — every capability exposed to TS/AI-SDK is read-only and deterministic (or deterministic-when-seeded) — and, with a live runtime, diff contract modules against `list_modules`. |
| `--strict` | off | With `--parity`, require a live runtime: an unreachable runtime becomes a failure (exit `1`) instead of a skip. |
| `--json` | off | Emit the full report as one JSON object. |

What you'll see (runtime not installed):

```text
✓ node: v20.11.1
✓ sdk: @thyn-ai/sqai 0.1.14 imports cleanly
✓ contract: 4778 capabilities, sha256:31247fb2…
• tested-pair: skipped (not inside the sqai repo)
• runtime: unavailable (checks skipped)
✓ doctor: ok
```

`• runtime: unavailable` is a skip, not a failure — the query plane runs in-process and needs no runtime. `doctor` stays exit `0`. Install the compute runtime with `sqai runtime install` (see the runtime tab).

`sqai doctor --parity --json` (abridged):

```json
{
  "command": "doctor",
  "ok": true,
  "version": "0.1.14",
  "contract": {
    "capability_count": 4778,
    "capability_contract_hash": "sha256:31247fb219e656f349bb6d36fa65c2e2702e2688a2fddb4b16f1a9e09a02cdbb",
    "runtime_bundle_version": "0.1.0"
  },
  "parity": {
    "invariant_ok": true,
    "violations": [],
    "runtime": "unavailable",
    "missing_modules": [],
    "extra_modules": []
  },
  "exit_code": 0
}
```

`--parity --strict` on a host with no runtime fails on purpose — use it in CI to guarantee the live runtime was actually exercised:

```text
✗ parity: runtime unreachable (--parity --strict requires a live runtime)
✗ doctor: FAILED
```
{% endtab %}

{% tab title="runtime" icon="server" %}
Manage the local compute runtime — the resident runtime that serves `compute()`. Files, SQLite, and every query-plane call run in-process without it; you only provision it to run the 6,084-capability compute library locally.

```text
sqai runtime <status|install|verify|stop> [--json]
```

| Subcommand | What it does |
| --- | --- |
| `status` | Report whether the runtime is available, the platform, and whether this process manages it. |
| `install` | Download → verify (pinned sha256 + signed manifest against the embedded trust root) → extract → start. One-time. |
| `verify` | Print the current status plus the contract's runtime bundle version and per-platform sha256 — no download. |
| `stop` | Request a stop. The v1 policy is leave-running; the runtime stays warm. |

**status** — before install:

```text
• runtime: unavailable
• platform: darwin-arm64
• managed by this process: no
```

```json
{
  "command": "runtime status",
  "ok": true,
  "status": {
    "available": true,
    "runtime_available": false,
    "engine": "unavailable",
    "module_count": 0,
    "platform": "darwin-arm64",
    "managed": false
  },
  "exit_code": 0
}
```

Once provisioned, `status` reports `✓ runtime: available — runtime mojo` with the resident module count and `managed by this process: yes`.

**install** — the one-time provision. It downloads the pinned bundle, verifies its sha256 and RS256-signed manifest against the embedded trust root, extracts, and starts the runtime (about 110s the first time). After that the SQAI runtime stays resident, so there is **no per-query cold start** — see [Speed](#speed-one-time-provision-then-warm).

**verify** — inspect the pinned bundle without touching the network:

```text
• runtime: unavailable
• platform: darwin-arm64
• managed by this process: no
• contract runtime bundle: 0.1.0
• bundle darwin-arm64: sha256 4d64142e4c1f…
```

```json
{
  "command": "runtime verify",
  "ok": true,
  "status": {
    "available": true,
    "runtime_available": false,
    "engine": "unavailable",
    "module_count": 0,
    "platform": "darwin-arm64",
    "managed": false
  },
  "runtime_bundle": {
    "version": "0.1.0",
    "platforms": [
      { "platform": "darwin-arm64", "sha256": "4d64142e4c1ff63d299cfc8b172fdf97cb59169b545e1e02978e678a632ce6e1" },
      { "platform": "linux-x64", "sha256": "45c75c2a204a1ce379f418ccc01f32880831a8c7950c45172a83414d494a658d" }
    ]
  },
  "contract_hash": "sha256:31247fb219e656f349bb6d36fa65c2e2702e2688a2fddb4b16f1a9e09a02cdbb",
  "exit_code": 0
}
```

**stop**:

```text
✓ runtime stop requested (v1 policy is leave-running; spawn management lands with the bundle pipeline)
```
{% endtab %}

{% tab title="version" icon="tag" %}
Print the CLI version, the resolved `@thyn-ai/sqai` version, and the embedded contract hash prefix. `sqai help` (or no arguments) prints usage and exits `0`.

```text
sqai --version [--json]
sqai help
```

```text
sqai 0.1.14 (@thyn-ai/sqai 0.1.14, contract 31247fb219e6)
```

```json
{
  "command": "version",
  "sqai": "0.1.14",
  "@thyn-ai/sqai": "0.1.14",
  "contract_hash": "sha256:31247fb219e656f349bb6d36fa65c2e2702e2688a2fddb4b16f1a9e09a02cdbb",
  "exit_code": 0
}
```

`sqai help`:

```text
sqai — deterministic, read-only structured data for AI agents

Usage:
  sqai login [--no-browser]                    sign in this device (free on 1 machine); licensing only, no data leaves
  sqai logout                                  remove this device's cached credentials
  sqai doctor [--parity] [--strict] [--json]   environment, contract, and parity checks
  sqai runtime <status|install|verify|stop> [--json]
  sqai --version                               CLI + @thyn-ai/sqai versions + contract hash
  sqai help                                    show this help
```
{% endtab %}
{% endtabs %}

## Air-gapped hosts

Set `SQAI_RUNTIME_AUTO_INSTALL=0` to forbid any online download. `runtime install` then fails fast and structured — no network call, no stack trace:

```text
✗ runtime_provision_failed: Automatic runtime installation is disabled (SQAI_RUNTIME_AUTO_INSTALL=0). Install manually with `sqai runtime install` or `sqai runtime install --from-file`.
  platform: darwin-arm64
  version: 0.1.0
```

```json
{
  "command": "runtime install",
  "ok": false,
  "error": {
    "code": "runtime_provision_failed",
    "message": "Automatic runtime installation is disabled (SQAI_RUNTIME_AUTO_INSTALL=0). Install manually with `sqai runtime install` or `sqai runtime install --from-file`.",
    "retryable": false,
    "details": { "platform": "darwin-arm64", "version": "0.1.0" }
  },
  "exit_code": 1
}
```

{% hint style="warning" %}
The query plane is fully offline already — files, SQLite, and every `ask()`/`connect()` call run in-process with no download or key. `SQAI_RUNTIME_AUTO_INSTALL=0` only gates the **compute** runtime bundle. The SQAI runtime also enforces rollback protection: a bundle below the minimum accepted version is refused (`details.reason: rollback_protected`) before any bytes are written.
{% endhint %}

## Speed: one-time provision, then warm

The two planes have very different cost profiles, and the CLI is only involved in the second:

- **Query plane** — in-process, no separate service, no key. `connect()` + `ask()` return in sub-millisecond to low-millisecond time on typical files.
- **Compute plane** — the managed runtime provisions **once** (the first-ever call downloads, verifies, extracts, and initializes — about 110s), then stays resident. Every later `compute()` is warm: `finance.npv` measures `latency_ms` of 0.83–0.93. There is no per-query cold start; the runtime stays running (which is why `runtime stop` is leave-running in v1).

## Python console script

The full CLI (`doctor`, runtime provisioning) ships as the npm package `@thyn-ai/sqai-cli`. The `pip install sqai` package installs a deliberately minimal `sqai` console script for contract inspection:

{% tabs %}
{% tab title="pip" icon="python" %}
```bash
pip install sqai
```
{% endtab %}
{% endtabs %}

```text
$ sqai --version
sqai 0.1.14

$ sqai capabilities --count
4778

$ sqai capabilities
capability_contract_hash: sha256:31247fb219e656f349bb6d36fa65c2e2702e2688a2fddb4b16f1a9e09a02cdbb
capabilities: 4778
```

The Python SDK reads the same embedded contract as the CLI, so `sqai capabilities` reports the identical count and hash the SDK stamps onto results — the anchor of the [TS↔Python byte-identical guarantee](determinism.md). For `doctor` and runtime provisioning, use the npm CLI.

## Exit codes

| Code | Meaning | Example |
| --- | --- | --- |
| `0` | Success. | `doctor` passed; `runtime status`; `--version`; `help`. |
| `1` | A check failed or a fatal error occurred. | A failed doctor check; `runtime install` failure; `doctor --parity --strict` with an unreachable runtime. |
| `2` | Usage error. | Unknown command, or an unknown `runtime` subcommand (expected `status\|install\|verify\|stop`). |

## Next steps

- Start querying data with the [TypeScript](quickstart-ts.md) or [Python](quickstart-python.md) quickstart.
- Understand the hashes `doctor` and `--version` report in [Determinism &#38; provenance](determinism.md).
- Hit an error? [Troubleshooting](troubleshooting.md) lists every message and its fix.
