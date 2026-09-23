---
icon: clock-rotate-left
description: Release history for SQAI — every version pins one tested substrate pair of SDKs, the SQAI runtime, the signed runtime bundle, and the capability-contract hash.
---

# Changelog

Reverse-chronological. SQAI is pre-1.0 (0.1.x): the surface is stable but may change. Every release pins one **tested substrate pair** — the `sqai` SDKs, the SQAI runtime, the signed runtime bundle, and the `capability_contract_hash` — validated together by `pnpm check-parity` before publish. TypeScript and Python at the same `sqai` version embed byte-identical contracts and produce byte-identical `plan_hash` / `invocation_hash` / `computation_hash`.

{% hint style="info" %}
The contract hash is the compatibility key. If two builds agree on it, they compute the same answer to the same bytes. Check yours with `sqai doctor --parity` or `sqai --version`.
{% endhint %}

## Tested substrate pair — 0.1.14 (current)

| Component | Pinned |
| --- | --- |
| `@thyn-ai/sqai`, `@thyn-ai/sqai-ai-sdk`, `@thyn-ai/sqai-cli` (npm) | `0.1.14` |
| `sqai` (PyPI) | `0.1.14` |
| SQAI runtime | `1.0.9` |
| Runtime bundle | `0.1.0` — `darwin-arm64`, `linux-x64` (`sha256:4d64142e…`) |
| `capability_contract_hash` | `sha256:31247fb2…` |
| Capabilities | 5,790 exposed read-only (5,780 deterministic + 10 seed-required simulations) of 6,084 total |
| Requires | Node ≥ 20, Python 3.14 |

## 0.1.14

- Tracks the substrate's Mojo 1.0.0 release line: pins the graduated SQAI runtime distribution and its SDK pair at `1.0.9` (the deprecated pre-graduation core package name is no longer pinned).
- Contract re-generated against the 1.0.9 runtime surface: 6,084 capabilities (adds the new compute-plane module families — causal inference, forecasting backtesting, streaming, geospatial, survival analysis, optimization, and more), every carried-over signature re-verified byte-identical against the release's library contract.
- Python moves to 3.14 (`requires-python >=3.14,<3.15`, the graduated runtime's requirement); CI and release pipelines run a fleet `python3.14` venv.
- The graduated runtime dist dropped its cross-language canonical-JSON renderer; SQAI now vendors the exact renderer in both SDKs and owns the input provenance hash (`inputHash` / `input_hash`), so `invocation_hash` / `computation_hash` / input hashes stay byte-identical between TypeScript and Python.
- Column bindings: the graduated runtime line has not re-landed the local column-extraction plane, so `compute()` bindings over live source columns report `unsupported_operation` on this substrate pair (literal-arg compute and the query plane are unaffected).
- Runtime 1.0.9 restores strict aggregation parity in the local query plane (`avg` is the mean at full precision, unknown aggregations are rejected — never a silent sum).

## 0.1.13

- Superseded by `0.1.14`; use `0.1.14` for the post-Mojo-1.0.0 substrate line, the regenerated capability contract, and Python 3.14.

## 0.1.12

- Superseded by `0.1.14`; use `0.1.14` for public TypeScript declarations and unsafe escape hatches that stay SQAI-named and do not expose substrate runtime types.

## 0.1.11

- Superseded by `0.1.14`; use `0.1.14` for Python connector previews that accept the documented flat SQAI descriptor shape, such as `sqai.test_connector(type="postgres", host=...)`, and normalize it to the runtime descriptor internally.

## 0.1.10

- Superseded by `0.1.14`; use `0.1.14` for fully encapsulated Python deployment installs and connector previews. `pip install sqai` includes the deployment runtime dependency instead of asking users to install substrate packages separately, and the defensive missing-runtime error is SQAI-branded.

## 0.1.9

- Superseded by `0.1.14`; use `0.1.14` for the current SQAI wrapper surface and SQAI-facing CLI runtime wording.

## 0.1.8

- Superseded by `0.1.14`; use `0.1.14` for corrected public package metadata that describes the exposed capability surface as 4,564 deterministic capabilities plus 10 seed-required simulations.

## 0.1.7

- Enforced the required free-login gate before Python local compute starts, matching the TypeScript SDK behavior.
- Superseded by `0.1.14`; use `0.1.14` for the current SQAI wrapper surface and deployment-only public vocabulary.

## 0.1.6

- Superseded on PyPI by `0.1.13`; use `0.1.13` for the current SQAI wrapper surface and mandatory local-compute login gate.

## 0.1.5

- Superseded on PyPI by `0.1.13`; use `0.1.13` for the current SQAI wrapper surface.

## 0.1.4

**Byte-identical Python compute over gRPC, full white-label, and discovery for all 4,778.**

- **Python compute over gRPC.** Python `compute()` now dispatches to the same signed runtime process as TypeScript, over gRPC — a unix domain socket when present, TCP loopback otherwise. The two SDKs are hash-for-hash identical: `finance.npv(0.1, [-1000, 300, 420, 560, 680])` returns the same `value` and the same hashes in both.

```json
{
  "value": 505.020148896933,
  "invocation_hash": "b3ca3e925e4372a5f9365790a29c486afed868073d3fd301d03022f44689e423",
  "computation_hash": "b74f67d0d7a594aa7ac91f6291612452aa8ccdf603351ebc8d801a6fddd91bc8",
  "contract_hash": "sha256:79f1c5a6c7164e7e9e1750e70a5c03292fa87eb52d8148a740c06695924be9a1"
}
```

- **Capability summaries for discovery.** Every one of the 4,778 capabilities now carries a real one-line `summary`; `searchCapabilities` and the AI SDK `listSources` tool return it, so an agent picks a function by what it does — not by guessing a name.
- **Full white-label.** The public surface is `SqaiValue`, `getUnsafeRuntime`, and error `source: "engine" | "sqai"`. Runtime attribution now lives only in `NOTICE`.
- **Connector catalog documented.** Files and SQLite run in-process with no key; live databases — PostgreSQL, MySQL, **Oracle** (bundled Thin-mode driver), SQL Server, Snowflake, BigQuery, ClickHouse, Redshift — plus object storage, NoSQL/graph, REST, and Git repos connect through a private SQAI deployment (`SQAI_DEPLOYMENT_URL`). Access is governed, credentials stay on your SQAI deployment, no data copied.

See [Connect your data](connect-data.md) · [Compute & filtering](compute-and-filtering.md) · [Determinism & provenance](determinism.md).

## 0.1.4

**Build-on-provision runtime filtering.** All 4,574 exposed read-only functions stay available; select the subset you call and SQAI compiles and installs just those as one signed bundle.

- `runtimeModules` (config) / `SQAI_RUNTIME_MODULES` (comma-separated env) select the modules to compile. Omit for the default pinned bundle.
- Managed **build service live** at `https://sqai-buildservice.fly.dev` (`POST /v1/runtime/build` → `{url, sha256, cache_key}`); override with `SQAI_BUILD_SERVICE_URL`. Filtered runtime processes get their own socket/port and never collide.
- TypeScript ↔ Python parity confirmed end-to-end: identical `plan_hash` / `invocation_hash` / `computation_hash`.

```ts
const sqai = createSQAI({
  runtimeModules: ["scalar_math", "statistical", "financial"],
});
```

See [Compute & filtering](compute-and-filtering.md) and [Licensing & accounts](licensing.md).

## 0.1.2

**Managed compute plane live — simple setup.** After the free `sqai login` device enrollment (`sqai_developer`), the signed runtime provisions itself transparently on the first `compute()` call. No manual install.

- Provisions **once** — the first-ever call downloads, extracts, and initializes the bundle (~110s) — then stays warm and resident. There is **no cold start per query**: every later `compute()` runs against the live runtime process at ~0.9ms.
- Runtime bundle `0.1.0` published for `darwin-arm64` and `linux-x64`, each with a pinned sha256.
- Trust root embedded in the packages: RS256 (RSA-4096) manifest signature verified against exact bytes, per-artifact sha256 + size, path-safety, and a rollback floor (`MIN_ACCEPTED_RUNTIME_VERSION 0.1.0`) — all before extraction.
- Disable downloads with `SQAI_RUNTIME_AUTO_INSTALL=0` (→ `runtime_provision_failed`); an unpublished platform returns a structured `unsupported_platform` and never crashes the package.

See [Determinism & provenance](determinism.md).

## 0.1.0

**Initial release.** Both planes, three SDK surfaces, one CLI, Apache-2.0.

- **Query plane** — `connect` immutable CSV/record sources; `ask()` returns exactly one of `ok` / `needs_clarification` / `rejected`; `resolve` / `query` / `verify` expose the typed plan. In-process, no separate service, no key.
- **Compute plane** — `compute()` over the read-only replayable surface, returning `invocation_hash` / `computation_hash` / `contract_hash` and the full determinism envelope. Simulations require a seed.
- **Vercel AI SDK tools** — `@thyn-ai/sqai-ai-sdk` exposes exactly three tools (`listSources`, `queryData`, `explainQuery`); they never throw and never expose policy. Peers: `ai ^7.0.0`, `zod ^4.0.0`.
- **SDKs** — TypeScript (`@thyn-ai/sqai`) and Python (`sqai`), hash-for-hash identical.
- **CLI** — `sqai` (`@thyn-ai/sqai-cli`): `doctor`, `runtime`, `version`.
- **Governance** — code-only allow-lists (`allowedSources` / `allowedFields` / `allowedFunctions`) that the model can only narrow, never widen.

See [TypeScript quickstart](quickstart-ts.md) · [Python quickstart](quickstart-python.md) · [Vercel AI SDK tool](ai-sdk-tools.md).
