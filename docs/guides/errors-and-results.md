---
icon: triangle-exclamation
description: Every SQAI result is a typed, discriminated union and every failure is a typed SqaiError — how to branch on status, kind, code, source, and retryable across both SDKs and the AI SDK tools.
---

# Errors & typed results

SQAI hands back typed outcomes, never guesses, and never returns a raw stack trace. A result is a discriminated union you `switch` on; a failure is a `SqaiError` carrying `{ code, message, retryable, request_id }` plus `source` and structured `details`. Codes are stable snake_case — a code is never renamed and the same condition never gets two codes — so your handling logic branches on `code`, never on message text.

There are two result models, and which one you get depends on how you called SQAI. The **raw SDK** (`ask`, `compute`, `connect`) throws a `SqaiError` on failure and, for the query resolver, returns a three-way verdict for the "understood but not executed" cases. The **AI SDK tools** (`listSources`, `queryData`, `explainQuery`) fold *everything* — ambiguity, refusal, and failure — into a status field, because a tool the model calls must **never throw**. Same vocabulary, same codes; two shapes.

{% hint style="info" %}
Every value below is real for the illustrative call `finance.npv(0.1, [-1000, 300, 420, 560, 680]) = 505.020148896933` (`contract_hash sha256:31247fb2…`). Error messages shown are the exact strings SQAI emits — but branch on `code`, not on the message. For the one-line fix behind each code, see [Troubleshooting](../troubleshooting.md).
{% endhint %}

## Two surfaces, one error type

| | Raw SDK (`ask` / `compute` / `connect`) | AI SDK tools (`queryData` / `explainQuery` / `listSources`) |
|---|---|---|
| On failure | throws `SqaiError` | returns `{ status: "error", code, message, retryable, request_id }` — **never throws** |
| Query ambiguity | `ask()` returns `status: "needs_clarification"` | tool returns `status: "needs_clarification"` |
| Query refusal | `ask()` returns `status: "rejected"` | tool returns `status: "rejected"` |
| Success | resolved value + provenance (result object / `dict`) | `status: "ok"` + `kind` + value + provenance |
| Who reacts | your `try/catch` and `switch` | the model reads the status and self-corrects; your code reads `output` |

The rule of thumb: **in application code you own, use the raw SDK and wrap it in `try/catch`. In a tool the model drives, use the AI SDK tools and branch on `output.status`.** Don't mix the two error models — a tool that throws would abort the model's run instead of letting it recover.

## The SqaiError type

Every raw-SDK failure is one `SqaiError`. Inspect its fields; never parse the message.

| Field | Meaning |
|---|---|
| `code` | Stable snake_case identifier — the thing to branch on (`seed_required`, `unsupported_operation`, `policy_denied_function`, …). |
| `source` | `"sqai"` — the SDK stopped it **before** dispatch (validation, policy, provisioning). `"engine"` — the SQAI runtime or your private deployment rejected it, and the code passes through verbatim. |
| `retryable` | `true` only for transient faults (`compute_runtime_unavailable`, `network_error`, `timeout`, `rate_limited`, `service_unavailable`, `quota_exhausted`). Everything else is terminal. |
| `request_id` | Correlates a dispatched request (`sqai_…`) for support and logs. `null` when the SDK caught it locally before dispatch. |
| `details` | Structured, code-specific context: `nearest_matches` for `unsupported_operation`, `reason` for `runtime_provision_failed`, `{ platform, supported }` for `unsupported_platform`. |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
import { createSQAI, SqaiError } from "@thyn-ai/sqai";

const sqai = createSQAI();

try {
  const r = await sqai.compute({ module: "finance", function: "npv", args: [0.1, cashflows] });
  console.log(r.value, r.computation_hash); // 505.020148896933  b74f67d0…
} catch (error) {
  if (error instanceof SqaiError) {
    console.error(error.code, error.source, error.retryable, error.requestId);
    // → "seed_required" "sqai" false null
    if (error.code === "unsupported_operation") {
      console.log(error.details?.nearest_matches); // closest real capability names
    }
  } else {
    throw error; // not a SqaiError → a real bug; let it surface
  }
}
```

`error.requestId` is camelCase in TypeScript. `SqaiError` and the core types re-export from `@thyn-ai/sqai-ai-sdk` too, so you rarely import both packages.
{% endtab %}
{% tab title="Python" icon="python" %}
```python
from sqai import SQAI, SqaiError

sqai = SQAI()

try:
    r = sqai.compute(module="finance", function="npv", args=[0.1, cashflows])
    print(r["value"], r["computation_hash"])  # 505.020148896933  b74f67d0…
except SqaiError as error:
    print(error.code, error.source, error.retryable, error.request_id)
    # → seed_required sqai False None
    if error.code == "unsupported_operation":
        print(error.details.get("nearest_matches"))  # closest real capability names
```

`error.request_id` is snake_case in Python, and results are plain `dict`s (`r["value"]`). Same codes, same `source` values, byte-identical hashes.
{% endtab %}
{% endtabs %}

## Query results: the resolver's verdict

`ask(spec)` resolves a typed `QuerySpec`, and — if the intent is unambiguous — executes it in-process. It returns **exactly one** of three statuses and **never guesses a column**. Ambiguity and refusal are *verdicts*, not errors: they come back as data you can act on. A genuine fault (unknown source, malformed spec, a policy denial) still throws the typed `SqaiError` above.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const outcome = await sqai.ask({
  metric: "revenue",
  aggregation: "sum",
  group_by: "region",
  source_name: "sales",
});

switch (outcome.status) {
  case "ok":
    outcome.data.result;    // rows, deterministic order
    outcome.data.plan_hash; // replay key — same plan ⇒ same hash, TS and Python
    break;
  case "needs_clarification":
    outcome.resolution.candidates; // the resolver wants a specific column — pick one, ask again
    break;
  case "rejected":
    outcome.resolution.rejection_reason; // understood, and refused (e.g. no such metric)
    break;
}
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
outcome = sqai.ask({
    "metric": "revenue",
    "aggregation": "sum",
    "group_by": "region",
    "source_name": "sales",
})

status = outcome["status"]
if status == "ok":
    outcome["data"].result      # rows, deterministic order
    outcome["data"].plan_hash   # replay key
elif status == "needs_clarification":
    outcome["resolution"].candidates       # pick one, ask again
else:  # "rejected"
    outcome["resolution"].rejection_reason # understood, and refused
```

`outcome["data"]` and `outcome["resolution"]` are SQAI responses with attribute access (`.result`, `.plan_hash`, `.candidates`).
{% endtab %}
{% endtabs %}

| `status` | Present | What it means |
|---|---|---|
| `ok` | `data.result`, `data.plan_hash`, `schema_revision`, `decision_path`, `validated` | Resolved to exactly one plan and executed. `decision_path: "exact_spec"` means the spec named column and source exactly. |
| `needs_clarification` | `resolution.candidates` | The metric matched more than one column — SQAI refuses to guess and hands back the candidates. |
| `rejected` | `resolution.rejection_reason` | The resolver understood the request and refused it (no matching metric, unsupported shape). |

{% hint style="info" %}
Need each stage separately? `resolve(spec)`, `query(plan)`, `queryWithMetadata(plan)` / `query_with_metadata(plan)`, and `verify(plan)` expose the resolved plan and pass SQAI responses through verbatim — useful for previewing a `plan_hash` before you execute.
{% endhint %}

## Compute results: value and provenance

`compute()` has no ambiguity to resolve, so it is `ok`-or-throw: on success it returns the value plus its full provenance; on any failure it throws a `SqaiError`. This is the real, verified result of the `npv` call above:

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
  "determinism": { "runtime_bundle_version": "0.1.0", "platform": "darwin-arm64",
                   "kernel_build": "mojo", "precision_mode": "float64", "thread_count": 1,
                   "input_hash": "aadddd29e6a8cc682c934233448531039e4f4777ad508d164734a0095c4e10f1" },
  "latency_ms": 0.93,
  "request_id": "sqai_eaab471b197880a4"
}
```

`value` is the runtime's output verbatim (typed per the signature's `returns`); `invocation_hash` is known **before** dispatch; `computation_hash` folds in the canonical result. Bound calls also carry `provenance.bindings` naming the exact source, fields, `schema_revision`, `row_count`, and per-binding `input_hash`. See [Determinism & provenance](../determinism.md) for every field.

The failures `compute()` raises are all `source: "sqai"`, caught before anything is dispatched — the model can't compute past them:

```text
seed_required             '<capability>' is a simulation capability: a seed is required so results are replayable.
unsupported_operation     Unknown capability 'finance.npvv'.            // details.nearest_matches → ['finance.npv', …]
invalid_intent            'finance.npv' takes at most 2 arguments; got 3 positional.
duplicate_argument_binding Parameter 'cashflows' of 'finance.npv' was supplied through both kwargs and bindings.
```

{% hint style="warning" %}
The 10 seed-required simulations (of 5,790 exposed capabilities) reject an unseeded `compute()` with `seed_required`. Pass `seed` (int or string) — the seed enters the invocation identity and the determinism envelope, so the run is replayable by construction. See [Compute & filtering](../compute-and-filtering.md).
{% endhint %}

## AI SDK tool results: nothing throws

`sqai.tools()` returns tools whose `execute` is always present and that **never throw** — ambiguity, rejection, and failure all arrive as typed statuses the model can react to instead of an exception that aborts the run. Output is a discriminated union on `status` **and**, for `ok`, on `kind`:

```ts
for (const step of steps) {
  for (const toolResult of step.toolResults ?? []) {
    const output = (toolResult as { output?: Record<string, any> }).output;
    switch (output?.status) {
      case "ok":
        if (output.kind === "query") {
          output.data;       // { columns, rows }
          output.plan_hash;  // query replay key
        } else if (output.kind === "computation") {
          output.value;
          output.computation_hash; // compute replay key
        }
        break;
      case "needs_clarification":
        output.question; output.candidates; // resolver found the intent ambiguous
        break;
      case "rejected":
        output.rejection_reason; // resolver refused the intent
        break;
      case "error":
        output.code;            // same stable codes as SqaiError
        output.retryable;       // transient?
        output.request_id;
        output.nearest_matches; // present on unsupported_operation
        break;
    }
  }
}
```

| `status` | Key fields |
|---|---|
| `ok` + `kind:"query"` | `data:{ columns, rows }`, `total_rows`, `returned_rows`, `truncated`, `plan_hash`, `schema_revision`, `decision_path`, `validated`, `result_id?` |
| `ok` + `kind:"computation"` | `value`, `value_type`, `preview?`, `element_count?`, `invocation_hash`, `computation_hash`, `contract_hash`, `determinism`, `provenance?`, `latency_ms`, `result_id?` |
| `needs_clarification` | `question`, `candidates`, `explanation` |
| `rejected` | `rejection_reason`, `candidates`, `explanation` |
| `error` | `code`, `message`, `retryable`, `request_id`, `nearest_matches?` — a structured `SqaiError`, delivered as data |

{% hint style="warning" %}
In application code that inspects tool output, branch on `output.status === "error"` and read `output.code` — the same codes a raw-SDK `SqaiError` carries (`unsupported_operation`, `seed_required`, `policy_denied_function`, …). Truncation is always declared, never silent: query results drop **whole rows** (`truncated: true`, `returned_rows < total_rows`), and oversized computation values return a `preview` plus the full `element_count`. See [Vercel AI SDK tool](../ai-sdk-tools.md).
{% endhint %}

## source and retryable: the two axes

Once you have a `code`, two orthogonal fields decide what to do next: **`source`** (who caught it) and **`retryable`** (is it transient).

- **`source: "sqai"`** — caught locally, before dispatch. The request never reached the runtime. Almost always terminal: the call, the policy, or the environment is wrong and a bare retry will fail identically.
- **`source: "engine"`** — the SQAI runtime or your private deployment produced the code. Includes the transient network faults, which *are* worth retrying.
- **`retryable: true`** — a transient fault; back off and retry. The most common case is the very first `compute()` still finishing its one-time provision (`compute_runtime_unavailable`), or a private deployment returning 429 as `quota_exhausted`.

### Retryable — back off and retry

| Code | `source` |
|---|---|
| `compute_runtime_unavailable` | sqai / runtime |
| `network_error` · `timeout` · `rate_limited` · `service_unavailable` · `quota_exhausted` | engine |

### Terminal — change something, then re-run

Grouped by *who must change what* — a lens that complements the alphabetical fix list in [Troubleshooting](../troubleshooting.md):

| Fix the **intent** (the call is wrong) | Fix the **policy / registration** | Fix the **environment / setup** | Fetch / **replay** |
|---|---|---|---|
| `seed_required` | `policy_denied_source` | `login_required` | `result_not_found` |
| `unsupported_operation` | `policy_denied_field` | `unsupported_platform` | `schema_revision_mismatch` |
| `invalid_intent` | `policy_denied_function` | `runtime_provision_failed` | |
| `duplicate_argument_binding` | `source_already_registered` | `daemon_port_conflict` · `contract_mismatch` | |

`policy_denied_*` means the request fell outside the code-only allow-lists — policy can only **narrow** the read-only surface, never widen it, and is unreachable from model input (see [Policy & governance](../policy.md)). `result_not_found` and `schema_revision_mismatch` are the replay-time codes below.

## Stored results and replay

Large results are shaped for the caller but kept retrievable by a random, TTL-bounded, tenant-authorized `result_id`. Fetch the full value with `getResult` / `get_result`:

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const full = await sqai.getResult(result_id); // SqaiError: result_not_found if expired / wrong tenant
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
full = sqai.get_result(result_id)  # SqaiError: result_not_found if expired / wrong tenant
```
{% endtab %}
{% endtabs %}

A `result_id` is only present when the value fit within `maxOutputBytes`. A lookup from the wrong principal returns the same `result_not_found` as an expired one — by design, so existence never leaks. And a stored **plan** replayed against changed data fails with `schema_revision_mismatch` instead of silently returning different numbers: `schema_revision` is pinned into every `plan_hash` and every binding's provenance. See [Determinism & provenance](../determinism.md).

## A resilient handler

Combine the pieces: retry the transient faults with backoff, surface the terminal ones with their code. The same shape works in both languages.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
import { createSQAI, SqaiError } from "@thyn-ai/sqai";

const sqai = createSQAI();

async function withRetry<T>(fn: () => Promise<T>, tries = 4): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (error instanceof SqaiError && error.retryable && attempt < tries) {
        await new Promise((r) => setTimeout(r, 250 * 2 ** (attempt - 1))); // 250ms, 500ms, 1s…
        continue;
      }
      throw error; // terminal SqaiError, or a non-SqaiError bug
    }
  }
}

try {
  const r = await withRetry(() =>
    sqai.compute({ module: "finance", function: "npv", args: [0.1, cashflows] }),
  );
  console.log(r.value, r.computation_hash);
} catch (error) {
  if (error instanceof SqaiError) {
    // terminal: log error.code + error.requestId, fix the intent / policy / setup
    console.error(`[sqai:${error.source}] ${error.code}`, error.details ?? {});
  } else {
    throw error;
  }
}
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
import time
from sqai import SQAI, SqaiError

sqai = SQAI()

def with_retry(fn, tries=4):
    for attempt in range(1, tries + 1):
        try:
            return fn()
        except SqaiError as error:
            if error.retryable and attempt < tries:
                time.sleep(0.25 * 2 ** (attempt - 1))  # 250ms, 500ms, 1s…
                continue
            raise

try:
    r = with_retry(lambda: sqai.compute(
        module="finance", function="npv", args=[0.1, cashflows]))
    print(r["value"], r["computation_hash"])
except SqaiError as error:
    # terminal: log error.code + error.request_id, fix the intent / policy / setup
    print(f"[sqai:{error.source}] {error.code}", error.details or {})
```
{% endtab %}
{% endtabs %}

{% hint style="danger" %}
`getUnsafeRuntime()` from `@thyn-ai/sqai/unsafe` bypasses the contract, policy allow-lists, seed enforcement, and cross-language parity — so it also bypasses the typed-result and typed-error guarantees on this page. It is never bundled into the AI SDK and never reachable by a model. Outside the contract, none of these guarantees apply.
{% endhint %}

## Next steps

<table data-view="cards">
<thead><tr><th></th><th></th><th data-hidden data-card-target data-type="content-ref"></th></tr></thead>
<tbody>
<tr><td><strong>Troubleshooting</strong></td><td>Every error <code>code</code> mapped to its one-line fix, plus <code>sqai doctor</code> and runtime diagnostics.</td><td><a href="../troubleshooting.md">troubleshooting.md</a></td></tr>
<tr><td><strong>Vercel AI SDK tool</strong></td><td>The four tools that turn these statuses into something a model can self-correct against.</td><td><a href="../ai-sdk-tools.md">ai-sdk-tools.md</a></td></tr>
<tr><td><strong>Determinism &#38; provenance</strong></td><td>What the three hashes and the determinism envelope on every <code>ok</code> result cover.</td><td><a href="../determinism.md">determinism.md</a></td></tr>
<tr><td><strong>Policy &#38; governance</strong></td><td>The allow-lists behind <code>policy_denied_*</code> — narrow-only, enforced in code.</td><td><a href="../policy.md">policy.md</a></td></tr>
</tbody>
</table>
