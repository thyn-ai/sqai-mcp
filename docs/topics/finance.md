---
icon: coins
description: 59 deterministic capabilities for time-value-of-money, portfolio risk, actuarial annuities, accounting ratios, and behavioral economics — every call hash-pinned and reproducible in TypeScript and Python.
---

# Finance, risk & accounting

Financial reasoning an agent can be trusted with: valuations and returns, portfolio risk measures, insurance and annuity math, accounting ratios, and behavioral-economics adjustments. **59 read-only capabilities** across five modules — `finance`, `risk`, `actuarial`, `accounting`, and `behavioral_economics`. Every one is a named, hash-pinned capability, never a formula the model wrote — so `finance.npv` means exactly one thing and returns the same value, with the same `computation_hash`, in TypeScript and Python. All 59 are deterministic: no seeds, no sampling, replayable by construction against contract `sha256:31247fb2…`.

{% hint style="info" %}
These are pure numeric capabilities. SQAI validates your arguments against the pinned contract and dispatches to the signed on-device runtime — it never invents a formula and it never touches the network. Pass rates as decimals: `0.1` is 10%, not `10`. See [Compute & filtering](../compute-and-filtering.md) for the full `ComputationSpec`, and [Determinism & provenance](../determinism.md) for what every hash means.
{% endhint %}

## Time value of money

The `finance` module: present/future value, discounted cashflows, growth rates, annuity payments, and drawdown. Names are `module.function`; summaries are the exact one-liners `searchCapabilities` returns.

| Capability | What it computes |
|---|---|
| `finance.npv` | Net Present Value: sum of cashflows[t] / (1+rate)^t for t=0..n-1 |
| `finance.irr` | Internal Rate of Return via Newton's method |
| `finance.cagr` | Compound Annual Growth Rate: (end/start)^(1/years) - 1 |
| `finance.compound_interest` | Future value with compound interest: P * (1 + r)^n |
| `finance.future_value` | Future value of a present amount: PV * (1 + r)^n |
| `finance.annuity_payment` | PMT — periodic payment for an ordinary annuity |
| `finance.max_drawdown` | Maximum drawdown: largest peak-to-trough decline as a fraction |

`finance.npv` is the canonical example — its value and hashes are identical in either SDK:

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
import { createSQAI } from "@thyn-ai/sqai";

const sqai = createSQAI(); // local · on your machine · no data leaves

// npv(rate, cashflows) -> float64
const r = await sqai.compute({
  module: "finance",
  function: "npv",
  args: [0.1, [-1000, 300, 420, 560, 680]],
});
r.value;            // 505.020148896933
r.computation_hash; // b74f67d0…  full-fidelity replay key

// irr(cashflows) -> the discount rate that makes NPV zero
await sqai.compute({ module: "finance", function: "irr",
  args: [[-1000, 300, 420, 560, 680]] });

// cagr(start, end, years) -> annualised growth as a decimal
await sqai.compute({ module: "finance", function: "cagr",
  args: [1000, 2100, 5] });
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
from sqai import create_sqai

sqai = create_sqai()  # local · on your machine · no data leaves

# npv(rate, cashflows) -> float64
r = sqai.compute(module="finance", function="npv",
                 args=[0.1, [-1000, 300, 420, 560, 680]])
r["value"]             # 505.020148896933
r["computation_hash"]  # b74f67d0…  full-fidelity replay key

# irr(cashflows) -> the discount rate that makes NPV zero
sqai.compute(module="finance", function="irr",
             args=[[-1000, 300, 420, 560, 680]])

# cagr(start, end, years) -> annualised growth as a decimal
sqai.compute(module="finance", function="cagr", args=[1000, 2100, 5])
```
{% endtab %}
{% endtabs %}

`compound_interest` and `future_value` both take `(principal, rate, periods)` and return the grown amount; `annuity_payment` takes the periodic rate, number of periods, and principal and returns the level payment; `max_drawdown` takes a price or equity series and returns the largest peak-to-trough decline as a fraction of the peak.

## Annuities & actuarial

The `actuarial` module covers annuity valuation, insurance ratios, and mortality. Rates are per period; `n` is the number of periods.

| Capability | What it computes |
|---|---|
| `actuarial.annuity_present_value` | PV = PMT * (1 - (1+r)^(-n)) / r |
| `actuarial.annuity_future_value` | FV = PMT * ((1+r)^n - 1) / r |
| `actuarial.future_value` | FV = PV * (1 + r)^n |
| `actuarial.combined_ratio` | CR = LR + ER |
| `actuarial.force_of_mortality` | μx ≈ -ln(1 - qx) |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// Present value of $500/yr for 20 years at 4%
await sqai.compute({ module: "actuarial", function: "annuity_present_value",
  args: [500, 0.04, 20] });          // -> PV of the annuity stream

// Underwriting profitability: loss ratio + expense ratio
await sqai.compute({ module: "actuarial", function: "combined_ratio",
  args: [0.68, 0.29] });             // -> CR; > 1.0 means underwriting loss

// Force of mortality from a one-year death probability
await sqai.compute({ module: "actuarial", function: "force_of_mortality",
  args: [0.012] });                  // -> instantaneous mortality rate μx
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# Present value of $500/yr for 20 years at 4%
sqai.compute(module="actuarial", function="annuity_present_value",
             args=[500, 0.04, 20])         # -> PV of the annuity stream

# Underwriting profitability: loss ratio + expense ratio
sqai.compute(module="actuarial", function="combined_ratio",
             args=[0.68, 0.29])            # -> CR; > 1.0 means underwriting loss

# Force of mortality from a one-year death probability
sqai.compute(module="actuarial", function="force_of_mortality",
             args=[0.012])                 # -> instantaneous mortality rate μx
```
{% endtab %}
{% endtabs %}

## Accounting ratios

The `accounting` module turns balance-sheet and income-statement inputs into standard ratios and depreciation.

| Capability | What it computes |
|---|---|
| `accounting.current_ratio` | Current ratio: current_assets / current_liabilities |
| `accounting.debt_to_equity` | Debt-to-equity ratio: total_debt / total_equity |
| `accounting.break_even_units` | Break-even units: fixed_costs / (price - variable_cost) |
| `accounting.compound_annual_growth` | Compound annual growth rate: (ending/beginning)^(1/years) - 1 |
| `accounting.declining_balance` | Book value after year: cost * (1 - rate)^year |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// Liquidity: current assets 500k, current liabilities 300k
await sqai.compute({ module: "accounting", function: "current_ratio",
  args: [500000, 300000] });         // -> current ratio

// Units to break even: fixed 50k, price 40, variable cost 15
await sqai.compute({ module: "accounting", function: "break_even_units",
  args: [50000, 40, 15] });          // -> break-even unit count

// Declining-balance book value: cost 10k, 20%/yr, after year 3
await sqai.compute({ module: "accounting", function: "declining_balance",
  args: [10000, 0.2, 3] });          // -> remaining book value
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# Liquidity: current assets 500k, current liabilities 300k
sqai.compute(module="accounting", function="current_ratio",
             args=[500000, 300000])        # -> current ratio

# Units to break even: fixed 50k, price 40, variable cost 15
sqai.compute(module="accounting", function="break_even_units",
             args=[50000, 40, 15])         # -> break-even unit count

# Declining-balance book value: cost 10k, 20%/yr, after year 3
sqai.compute(module="accounting", function="declining_balance",
             args=[10000, 0.2, 3])         # -> remaining book value
```
{% endtab %}
{% endtabs %}

## Portfolio risk & performance

The `risk` module computes market sensitivity, tail risk, and risk-adjusted return. The series functions take return vectors; pair them with a connected column to bind the numbers to real data (see below).

| Capability | What it computes |
|---|---|
| `risk.beta` | Beta = cov(asset, market) / var(market) |
| `risk.alpha` | Jensen's alpha: mean(asset) - rf - beta*(mean(market) - rf) |
| `risk.information_ratio` | Information ratio: mean(excess) / std(excess) |
| `risk.conditional_var` | CVaR (Expected Shortfall): average of returns below VaR threshold |
| `risk.downside_deviation` | Downside deviation: sqrt(mean(min(r-target, 0)²)) |
| `risk.calmar_ratio` | Calmar ratio: annualized_return / max_drawdown |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const asset  = [0.012, -0.004, 0.021, 0.008, -0.011, 0.017];
const market = [0.010, -0.002, 0.018, 0.006, -0.009, 0.014];

// Market sensitivity of the asset
await sqai.compute({ module: "risk", function: "beta",
  args: [asset, market] });          // -> beta

// Expected shortfall below the 95% VaR threshold
await sqai.compute({ module: "risk", function: "conditional_var",
  args: [asset, 0.95] });            // -> CVaR (a loss magnitude)

// Return per unit of drawdown
await sqai.compute({ module: "risk", function: "calmar_ratio",
  args: [0.18, 0.25] });             // -> Calmar ratio
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
asset  = [0.012, -0.004, 0.021, 0.008, -0.011, 0.017]
market = [0.010, -0.002, 0.018, 0.006, -0.009, 0.014]

# Market sensitivity of the asset
sqai.compute(module="risk", function="beta",
             args=[asset, market])         # -> beta

# Expected shortfall below the 95% VaR threshold
sqai.compute(module="risk", function="conditional_var",
             args=[asset, 0.95])           # -> CVaR (a loss magnitude)

# Return per unit of drawdown
sqai.compute(module="risk", function="calmar_ratio",
             args=[0.18, 0.25])            # -> Calmar ratio
```
{% endtab %}
{% endtabs %}

## Behavioral economics

The `behavioral_economics` module quantifies well-known decision biases — useful when an agent is modeling how people (not markets) value outcomes.

| Capability | What it computes |
|---|---|
| `behavioral_economics.loss_aversion_coefficient` | Loss aversion coefficient: λ = \|loss_impact\| / gain_impact |
| `behavioral_economics.hyperbolic_discount` | Hyperbolic discount: PV = V / (1 + k*t) |
| `behavioral_economics.anchoring_adjusted_estimate` | Anchoring-adjusted estimate: Est = anchor + adjustment * factor |
| `behavioral_economics.endowment_effect_wta_wtp_ratio` | Endowment effect WTA/WTP ratio: Ratio = WTA / WTP |
| `behavioral_economics.fairness_ultimatum_threshold` | Fairness in ultimatum game: Fair% = (offer/total) * 100 |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// λ from a loss impact of -200 vs a gain impact of 100
await sqai.compute({ module: "behavioral_economics",
  function: "loss_aversion_coefficient", args: [-200, 100] });   // -> λ

// Present value of $1,000 in 12 periods, discount factor k=0.05
await sqai.compute({ module: "behavioral_economics",
  function: "hyperbolic_discount", args: [1000, 0.05, 12] });    // -> PV
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# λ from a loss impact of -200 vs a gain impact of 100
sqai.compute(module="behavioral_economics",
             function="loss_aversion_coefficient", args=[-200, 100])   # -> λ

# Present value of $1,000 in 12 periods, discount factor k=0.05
sqai.compute(module="behavioral_economics",
             function="hyperbolic_discount", args=[1000, 0.05, 12])    # -> PV
```
{% endtab %}
{% endtabs %}

## Bind a column, keep the provenance

Instead of literal arguments, bind a capability parameter to a column of a connected source. The runtime pulls the aligned column in-process, dispatches, and records exactly which source, fields, and rows fed the number — so the result is reproducible from the data it read. `finance.npv` at 10% over the `revenue` column of a `sales` source:

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const r = await sqai.compute({
  module: "finance",
  function: "npv",
  args: [0.1],
  bindings: [{ parameter: "cashflows", source: "sales", field: "revenue" }],
});
r.value;                 // NPV of the bound revenue column
r.provenance.bindings;   // source, fields, schema_revision, row_count, input_hash
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
r = sqai.compute(
    module="finance",
    function="npv",
    args=[0.1],
    bindings=[{"parameter": "cashflows", "source": "sales", "field": "revenue"}],
)
r["value"]                    # NPV of the bound revenue column
r["provenance"]["bindings"]   # source, fields, schema_revision, row_count, input_hash
```
{% endtab %}
{% endtabs %}

The value differs from the literal call because the cashflows are now the `revenue` column, so the hashes differ too — but the binding pins the `schema_revision`, `row_count`, and per-binding `input_hash` behind them. The shape (hashes abbreviated — the full 64-char values print at run time; see the verified end-to-end example in [Determinism & provenance](../determinism.md)):

```json
{
  "value": "<npv of the bound revenue column>",
  "invocation_hash": "8223a694…",
  "computation_hash": "ff5280ea…",
  "provenance": {
    "bindings": [
      {
        "source_name": "sales",
        "fields": ["revenue"],
        "schema_revision": "e4938027…",
        "row_count": 12,
        "input_hash": "2ea5ede7…"
      }
    ]
  }
}
```

{% hint style="success" %}
Every result in this pack ships a determinism envelope — `precision_mode: "float64"`, `thread_count: 1`, platform, and `runtime_bundle_sha256` — plus `invocation_hash` (known before execution) and `computation_hash` (after). Two runs in the same scope agree bit-for-bit. See [Determinism & provenance](../determinism.md).
{% endhint %}

## Install just this pack

You never ship all 6,084 capabilities. `runtimeModules` filters the build to exactly the modules you call; the build service compiles and signs a bundle for that filter, cached by filter-hash. For everything on this page:

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const sqai = createSQAI({
  runtimeModules: ["finance", "risk", "actuarial", "accounting", "behavioral_economics"],
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
sqai = create_sqai(
    runtime_modules=["finance", "risk", "actuarial", "accounting", "behavioral_economics"],
)
```
{% endtab %}
{% endtabs %}

Or set `SQAI_RUNTIME_MODULES="finance,risk,actuarial,accounting,behavioral_economics"` — no code change. Filtering changes only what is installed, never what a function returns: `finance.npv(0.1, [-1000, 300, 420, 560, 680])` yields `505.020148896933` and the same `computation_hash` whether the bundle carries five modules or all of them.

{% hint style="warning" %}
Filtered bundles need a build service — set `SQAI_BUILD_SERVICE_URL` (or `buildServiceUrl`). If `runtimeModules` is set with no build service configured, provisioning fails with `runtime_provision_failed`. Omit `runtimeModules` to use the default pinned bundle. See [Compute & filtering](../compute-and-filtering.md).
{% endhint %}

## Find the right capability

`searchCapabilities(query, limit=10)` ranks the exposed capabilities by token overlap over name, category, and summary, and returns `[{ entry, score }]`. It reads the embedded contract in-process — no runtime, no key, no provision — so you can discover before you filter.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
sqai.searchCapabilities("annuity present value", 5)
  .map((m) => `${m.entry.name} — ${m.entry.summary}`);
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
[f"{m['entry']['name']} — {m['entry']['summary']}"
 for m in sqai.search_capabilities("annuity present value", 5)]
```
{% endtab %}
{% endtabs %}

Search first, then set `runtimeModules` to the packs you actually call — a `compute()` against a module outside your filter has nothing to dispatch to.

## Next steps

<table data-view="cards">
<thead><tr><th></th><th></th><th data-hidden data-card-target data-type="content-ref"></th></tr></thead>
<tbody>
<tr><td><strong>Compute &#38; filtering</strong></td><td>The full <code>ComputationSpec</code>, bindings, and the build-on-provision filter.</td><td><a href="../compute-and-filtering.md">compute-and-filtering.md</a></td></tr>
<tr><td><strong>Determinism &#38; provenance</strong></td><td>What every hash on a result means, and how a replay reproduces it.</td><td><a href="../determinism.md">determinism.md</a></td></tr>
<tr><td><strong>Connect your data</strong></td><td>Sources you can bind compute to — files, SQLite, and private SQAI databases.</td><td><a href="../connect-data.md">connect-data.md</a></td></tr>
<tr><td><strong>Policy &#38; governance</strong></td><td>Restrict sources, fields, and capabilities — in code, never from model input.</td><td><a href="../policy.md">policy.md</a></td></tr>
</tbody>
</table>
