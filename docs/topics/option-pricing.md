---
icon: chart-line
description: 10 read-only, deterministic capabilities for pricing European options, computing their Greeks, and inverting the market for implied volatility — every quote hashed and reproducible.
---

# Option pricing & derivatives

The `option_pricing` module is SQAI's derivatives desk: **10 read-only capabilities** that price European options, compute their risk sensitivities (the Greeks), invert an observed premium for implied volatility, and recover one leg from another through put-call parity. Every one is a named, hash-pinned capability — never a handwritten formula — and every one is **deterministic**: it takes typed arguments, runs on the signed on-device runtime (no cloud, on your machine, no data leaves it), and returns the value plus the hashes that reproduce it. They are part of the 6,084-capability contract, `contract_hash` `sha256:31247fb2…`.

Reach for this module when an agent has to put a number on optionality — a fair premium, a delta to hedge, the vol the market is implying — and needs that number to be auditable: same inputs, same value, same `computation_hash`, in TypeScript or Python.

{% hint style="info" %}
All 10 capabilities live in the single `option_pricing` namespace and are deterministic — none is a seed-required simulation, so `compute()` never needs a `seed`. New to the runtime? [Compute & filtering](../compute-and-filtering.md) covers the whole library; [Determinism & provenance](../determinism.md) explains every hash on a result.
{% endhint %}

## Find them first

The capabilities are searchable in-process against the embedded contract — no runtime, no key, no provision. Search, then install only what you call.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
sqai.searchCapabilities("black scholes option", 5)
  .map((m) => `${m.entry.name} — ${m.entry.summary}`);
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
[f"{m['entry']['name']} — {m['entry']['summary']}"
 for m in sqai.search_capabilities("black scholes option", 5)]
```
{% endtab %}
{% endtabs %}

Real top-5 result:

```text
option_pricing.black_scholes_call — Black-Scholes European call price: S*N(d1) - K*exp(-rT)*N(d2)
option_pricing.black_scholes_put  — Black-Scholes European put price: K*exp(-rT)*N(-d2) - S*N(-d1)
option_pricing.binomial_tree_call — CRR binomial tree for European call option
option_pricing.delta_call         — Call delta: N(d1)
option_pricing.gamma              — Gamma (same for call/put): φ(d1) / (S * σ * √T)
```

{% hint style="warning" %}
Arguments are **positional** and follow the standard Black-Scholes parameterization — spot `S`, strike `K`, time-to-expiry `T` (in years), risk-free rate `r`, volatility `σ`. A wrong arity or type comes back as a structured error with `source: "engine"`, never a silent coercion. All examples below share one scenario: `S = 100`, `K = 105`, `T = 0.5`, `r = 0.04`, `σ = 0.20`.
{% endhint %}

## Pricing European options

The core valuation set. Two closed-form Black-Scholes prices and one lattice pricer that converges to them.

| Capability | What it computes |
|---|---|
| `option_pricing.black_scholes_call` | Black-Scholes European call price: S*N(d1) - K*exp(-rT)*N(d2) |
| `option_pricing.black_scholes_put` | Black-Scholes European put price: K*exp(-rT)*N(-d2) - S*N(-d1) |
| `option_pricing.binomial_tree_call` | CRR binomial tree for European call option |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// Closed-form Black-Scholes call and put on the same contract.
const call = await sqai.compute({
  module: "option_pricing",
  function: "black_scholes_call",
  args: [100, 105, 0.5, 0.04, 0.2], // S, K, T, r, σ
});

const put = await sqai.compute({
  module: "option_pricing",
  function: "black_scholes_put",
  args: [100, 105, 0.5, 0.04, 0.2],
});

// Same option on a 200-step Cox-Ross-Rubinstein lattice — converges to Black-Scholes.
const lattice = await sqai.compute({
  module: "option_pricing",
  function: "binomial_tree_call",
  args: [100, 105, 0.5, 0.04, 0.2, 200], // S, K, T, r, σ, steps
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# Closed-form Black-Scholes call and put on the same contract.
call = sqai.compute(module="option_pricing", function="black_scholes_call",
                    args=[100, 105, 0.5, 0.04, 0.2])  # S, K, T, r, σ

put = sqai.compute(module="option_pricing", function="black_scholes_put",
                   args=[100, 105, 0.5, 0.04, 0.2])

# Same option on a 200-step Cox-Ross-Rubinstein lattice — converges to Black-Scholes.
lattice = sqai.compute(module="option_pricing", function="binomial_tree_call",
                       args=[100, 105, 0.5, 0.04, 0.2, 200])  # …, steps
```
{% endtab %}
{% endtabs %}

Each returns a single `float64` premium in `value` — the discounted risk-neutral expectation of the payoff. `black_scholes_call` and `black_scholes_put` are the analytic prices; `binomial_tree_call` prices the European call on a CRR lattice and tightens toward the closed-form value as the step count grows, letting an agent cross-check one method against the other.

## The Greeks

First- and second-order sensitivities of the price — what to hedge, and how fast the hedge decays.

| Capability | What it computes |
|---|---|
| `option_pricing.delta_call` | Call delta: N(d1) |
| `option_pricing.gamma` | Gamma (same for call/put): φ(d1) / (S * σ * √T) |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// ∂price/∂spot for the call — the hedge ratio, between 0 and 1.
const delta = await sqai.compute({
  module: "option_pricing",
  function: "delta_call",
  args: [100, 105, 0.5, 0.04, 0.2], // S, K, T, r, σ
});

// ∂²price/∂spot² — identical for the call and the put on this contract.
const gamma = await sqai.compute({
  module: "option_pricing",
  function: "gamma",
  args: [100, 105, 0.5, 0.04, 0.2],
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# ∂price/∂spot for the call — the hedge ratio, between 0 and 1.
delta = sqai.compute(module="option_pricing", function="delta_call",
                     args=[100, 105, 0.5, 0.04, 0.2])  # S, K, T, r, σ

# ∂²price/∂spot² — identical for the call and the put on this contract.
gamma = sqai.compute(module="option_pricing", function="gamma",
                     args=[100, 105, 0.5, 0.04, 0.2])
```
{% endtab %}
{% endtabs %}

`delta_call` returns `N(d1)`, the call's sensitivity to a one-unit move in spot — the number of shares that neutralizes the position, bounded in `(0, 1)`. `gamma` returns `φ(d1) / (S·σ·√T)`, the rate at which delta itself moves; it is the same for the call and the put on a given contract, so one call covers both legs.

## Implied volatility & put-call parity

Two inversions: recover the volatility the market is quoting, and recover one option's price from the other's.

| Capability | What it computes |
|---|---|
| `option_pricing.implied_volatility` | Implied volatility via bisection on BS formula |
| `option_pricing.put_call_parity` | Put price from put-call parity: P = C - S + K*exp(-rT) |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// Solve for the σ that reprices an observed premium (bisection on the BS formula).
const iv = await sqai.compute({
  module: "option_pricing",
  function: "implied_volatility",
  args: [3.75, 100, 105, 0.5, 0.04], // observed price, S, K, T, r
});

// Recover the put from a known call price — no re-pricing, pure arbitrage identity.
const putFromParity = await sqai.compute({
  module: "option_pricing",
  function: "put_call_parity",
  args: [3.75, 100, 105, 0.5, 0.04], // C, S, K, T, r
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# Solve for the σ that reprices an observed premium (bisection on the BS formula).
iv = sqai.compute(module="option_pricing", function="implied_volatility",
                  args=[3.75, 100, 105, 0.5, 0.04])  # observed price, S, K, T, r

# Recover the put from a known call price — no re-pricing, pure arbitrage identity.
put_from_parity = sqai.compute(module="option_pricing", function="put_call_parity",
                               args=[3.75, 100, 105, 0.5, 0.04])  # C, S, K, T, r
```
{% endtab %}
{% endtabs %}

`implied_volatility` inverts the Black-Scholes call formula by bisection, returning the `σ` for which the model price equals the quoted premium — the market's forward-looking volatility estimate. `put_call_parity` returns the put price implied by `P = C - S + K·exp(-rT)`: given the call, the put follows from no-arbitrage without pricing it independently, which also makes it a cheap consistency check against `black_scholes_put`.

## Provenance on every quote

A price is only useful if you can prove where it came from. Every `option_pricing` result carries the same determinism envelope as any other `compute()` — the `invocation_hash` is known **before** the value is produced, the `computation_hash` after, and both fold in the `contract_hash` so a contract change moves every downstream quote:

```json
{
  "status": "ok",
  "value": 10.450583572185565,
  "value_type": "float64",
  "module": "option_pricing",
  "function": "black_scholes_call",
  "invocation_hash": "…",
  "computation_hash": "…",
  "contract_hash": "sha256:31247fb2…",
  "determinism": {
    "precision_mode": "float64",
    "thread_count": 1,
    "platform": "darwin-arm64",
    "input_hash": "…"
  }
}
```

`precision_mode: "float64"` and `thread_count: 1` fix the precision and reduction order, so re-running the same call in the same scope returns the identical value and the identical `computation_hash` — bit for bit, and byte-identical between the TypeScript and Python SDKs. That is what makes a quote reproducible and a hedge decision auditable months later. See [Determinism & provenance](../determinism.md) for every field.

{% hint style="success" %}
Because these capabilities are pure functions of their arguments, an agent can bind a parameter to a **connected source** — e.g. sweep `black_scholes_call` across a strike column — and the result records the source, fields, `schema_revision`, `row_count`, and per-binding `input_hash` behind the number. See [Compute & filtering](../compute-and-filtering.md#compute-over-connected-data).
{% endhint %}

## Install just this module

You never ship all 6,084 capabilities. If option pricing is all you call, filter the build to this one module: the build service compiles and signs a bundle for exactly that set, cached by filter-hash, and it stays warm after the first provision.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
import { createSQAI } from "@thyn-ai/sqai";

const sqai = createSQAI({
  runtimeModules: ["option_pricing"], // often paired with ["finance", "risk"]
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
from sqai import SQAI

sqai = SQAI(runtime_modules=["option_pricing"])  # often paired with ["finance", "risk"]
```
{% endtab %}
{% endtabs %}

The filter changes only what is installed, never what a function returns: `black_scholes_call` yields the same value and the same `computation_hash` whether the bundle carries one module or all of them. Filtered bundles need a build service — set `SQAI_BUILD_SERVICE_URL`. See [Compute & filtering](../compute-and-filtering.md#build-on-provision-filtering) for the full flow.

## Next steps

<table data-view="cards">
<thead><tr><th></th><th></th><th data-hidden data-card-target data-type="content-ref"></th></tr></thead>
<tbody>
<tr><td><strong>Finance &#38; risk</strong></td><td>NPV, IRR, drawdown, beta, and CVaR — the valuation and risk packs option pricing pairs with.</td><td><a href="finance.md">finance.md</a></td></tr>
<tr><td><strong>Compute &#38; filtering</strong></td><td>The full library, the <code>ComputationSpec</code>, bindings, and build-on-provision filtering.</td><td><a href="../compute-and-filtering.md">compute-and-filtering.md</a></td></tr>
<tr><td><strong>Determinism &#38; provenance</strong></td><td>What every hash on a quote means, and how any two runs reproduce it.</td><td><a href="../determinism.md">determinism.md</a></td></tr>
<tr><td><strong>Connect data</strong></td><td>Bind strikes, spots, and rates to a source so a swept price records its inputs.</td><td><a href="../connect-data.md">connect-data.md</a></td></tr>
</tbody>
</table>
