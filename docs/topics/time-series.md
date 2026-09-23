---
icon: wave-square
description: 18 read-only capabilities for sequential data — decompose, test for stationarity, measure autocorrelation, smooth, and forecast — every one deterministic and byte-identical across TypeScript and Python.
---

# Time series & forecasting

Time series capabilities cover sequential, time-indexed data: splitting a series into **trend, seasonal, and residual** components; testing whether it is **stationary**; measuring how it correlates with its own past; and **smoothing or projecting** it forward. **18 read-only capabilities** live in two modules — `time_series_decompose` and `timeseries_stats` — and every one is deterministic. No seed, no randomness: the same series in yields the same value and the same `computation_hash`, in either SDK.

Like every capability, these run on the signed on-device runtime — no cloud, on your machine, no data leaves it — and return the value plus the hashes that reproduce it, with no raw code and no write path. Pass a literal array or bind a column from a connected source; either way the result ships a full [determinism envelope](../determinism.md), and bound calls also carry `provenance.bindings` naming exactly which rows fed the number.

{% hint style="info" %}
`searchCapabilities("autocorrelation stationarity", 10)` ranks these by token overlap over name, category, and summary and returns each with its real one-line `summary` — in-process, no runtime, no key. Search sees the whole contract; set `runtimeModules: ["time_series_decompose", "timeseries_stats"]` to install just these two packs. See [Compute & filtering](../compute-and-filtering.md).
{% endhint %}

## The library

Names are `module.function`; the summaries are the real one-liners `searchCapabilities` returns.

**Decomposition — trend, seasonal, residual** (`time_series_decompose`)

| Capability | What it computes |
|---|---|
| `time_series_decompose.decompose_additive` | Full additive decomposition |
| `time_series_decompose.stl_like` | Simplified STL: iterative trend + seasonal extraction |
| `time_series_decompose.moving_average_trend` | Extract trend via centered moving average |
| `time_series_decompose.detrend` | Remove trend: data − trend |
| `time_series_decompose.residual` | Residual = data − trend − seasonal |
| `time_series_decompose.detect_period` | Auto-detect dominant period via autocorrelation peak |

**Autocorrelation & periodicity** (`timeseries_stats`)

| Capability | What it computes |
|---|---|
| `timeseries_stats.autocorrelation` | Sample autocorrelation at the given lag |
| `timeseries_stats.autocorrelation_function` | Autocorrelation function for lags 0..max_lag |

**Stationarity & differencing** (`timeseries_stats`)

| Capability | What it computes |
|---|---|
| `timeseries_stats.adf_test_statistic` | Simplified Augmented Dickey-Fuller test statistic |
| `timeseries_stats.difference` | First or higher-order differencing |

**Smoothing & forecasting** (`timeseries_stats`)

| Capability | What it computes |
|---|---|
| `timeseries_stats.rolling_mean` | Simple moving average with given window size |
| `timeseries_stats.exponential_smoothing` | Single exponential smoothing (SES) |
| `timeseries_stats.holt_linear` | Holt's linear trend method (double exponential smoothing) |

{% hint style="info" %}
That is 13 of the **18** capabilities across `time_series_decompose` and `timeseries_stats`; the rest are variants and helpers in the same two modules. List them for your build with a search — the contract is the source of truth, and each entry carries its own `summary`.
{% endhint %}

## Bind a series

Every function here takes a numeric series plus, in most cases, a scalar (a lag, a window, a smoothing factor). The pattern mirrors `finance.npv`: **bind the series column by parameter name; leave the scalars as literal `args`.** The runtime pulls the aligned column through the upstream extraction primitive — it never zips arrays or computes anything itself — and records the lineage in `provenance.bindings`.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
import { createSQAI } from "@thyn-ai/sqai";

const sqai = createSQAI();
await sqai.connect("./data/visits.csv", { name: "visits" }); // daily count over time

// Centered 7-day moving average of the `count` column.
const smoothed = await sqai.compute({
  module: "timeseries_stats",
  function: "rolling_mean",
  args: [7],                                                   // window stays literal
  bindings: [{ parameter: "data", source: "visits", field: "count" }],
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
from sqai import SQAI

sqai = SQAI()
sqai.connect("./data/visits.csv", name="visits")  # daily count over time

# Centered 7-day moving average of the `count` column.
smoothed = sqai.compute(
    module="timeseries_stats",
    function="rolling_mean",
    args=[7],                                       # window stays literal
    bindings=[{"parameter": "data", "source": "visits", "field": "count"}],
)
```
{% endtab %}
{% endtabs %}

`rolling_mean` returns the smoothed series (shorter than the input by the window) alongside the determinism envelope and a `provenance.bindings` entry naming `visits.count`, its `schema_revision`, `row_count`, and `input_hash` — so the smoothed values are reproducible from the exact rows they came from. Change the underlying data and a replay surfaces a `schema_revision_mismatch` rather than silently returning different numbers.

## Forecasting

Exponential smoothing weights recent observations more heavily than old ones. `exponential_smoothing` (single/SES) tracks the **level** with one factor `α`; `holt_linear` (double) adds a second factor `β` for the **trend**, so it can project a sloped series forward instead of flattening it.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// Single exponential smoothing — level only, α = 0.3.
const ses = await sqai.compute({
  module: "timeseries_stats",
  function: "exponential_smoothing",
  args: [0.3],
  bindings: [{ parameter: "data", source: "visits", field: "count" }],
});

// Holt's linear trend — level (α) + trend (β), for a series that drifts.
const holt = await sqai.compute({
  module: "timeseries_stats",
  function: "holt_linear",
  args: [0.5, 0.3],                                            // alpha, beta
  bindings: [{ parameter: "data", source: "visits", field: "count" }],
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# Single exponential smoothing — level only, alpha = 0.3.
ses = sqai.compute(
    module="timeseries_stats",
    function="exponential_smoothing",
    args=[0.3],
    bindings=[{"parameter": "data", "source": "visits", "field": "count"}],
)

# Holt's linear trend — level (alpha) + trend (beta), for a series that drifts.
holt = sqai.compute(
    module="timeseries_stats",
    function="holt_linear",
    args=[0.5, 0.3],  # alpha, beta
    bindings=[{"parameter": "data", "source": "visits", "field": "count"}],
)
```
{% endtab %}
{% endtabs %}

`exponential_smoothing` returns the smoothed level series; `holt_linear` returns the level-and-trend fit that extrapolates a sloped series forward. Because both are deterministic, the same series and the same `(α, β)` produce an identical `computation_hash` every run and in both SDKs — the same guarantee that pins `finance.npv(0.1, [-1000, 300, 420, 560, 680]) = 505.020148896933`.

{% hint style="success" %}
These are forecasting *math*, not simulation: none of them take a `seed`. The 10 `seed_required` capabilities in the contract are Monte-Carlo-style simulations elsewhere — nothing in `timeseries_stats` or `time_series_decompose` needs one. See [Seeded simulations](../determinism.md).
{% endhint %}

## A decomposition pipeline

Additive decomposition splits a series into `trend + seasonal + residual`. A clean pipeline finds the period, decomposes, then checks that what is left over is noise.

{% stepper %}
{% step %}
#### Detect the dominant period

`detect_period` finds the seasonality by locating the autocorrelation peak — no need to hard-code "12" for monthly or "7" for weekly.

```ts
const period = await sqai.compute({
  module: "time_series_decompose",
  function: "detect_period",
  bindings: [{ parameter: "data", source: "visits", field: "count" }],
});
```

Returns the integer period of the strongest cycle in the series.
{% endstep %}
{% step %}
#### Decompose additively

Feed the period to `decompose_additive` to pull apart trend, seasonal, and residual. (`moving_average_trend` and `detrend` expose the trend step on its own; `stl_like` is the iterative STL-style alternative.)

```ts
const parts = await sqai.compute({
  module: "time_series_decompose",
  function: "decompose_additive",
  args: [7],                                                   // period from step 1
  bindings: [{ parameter: "data", source: "visits", field: "count" }],
});
```

Returns the trend, seasonal, and residual components of the series.
{% endstep %}
{% step %}
#### Check the residual is noise

A good decomposition leaves a residual with no structure left in it. `residual` isolates `data − trend − seasonal`; `autocorrelation_function` over that residual should show no strong peaks.

```ts
const acf = await sqai.compute({
  module: "timeseries_stats",
  function: "autocorrelation_function",
  args: [14],                                                  // lags 0..14
  bindings: [{ parameter: "data", source: "visits", field: "residual" }],
});
```

Returns the autocorrelation at each lag `0..max_lag`; values near zero past lag 0 mean the seasonal and trend were fully removed.
{% endstep %}
{% endstepper %}

Each step is its own hashed computation with its own provenance — a decomposition pipeline is an auditable chain of results, not one opaque call.

## Stationarity & autocorrelation

Many time-series methods assume a **stationary** series (constant mean and variance). `difference` removes trend by subtracting lagged values; `adf_test_statistic` reports a simplified Augmented Dickey-Fuller statistic — the more negative it is, the stronger the evidence the series is stationary. `autocorrelation` measures dependence at a single lag; `autocorrelation_function` sweeps lags `0..max_lag` at once.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// First-order differencing to remove a linear trend.
const diffed = await sqai.compute({
  module: "timeseries_stats",
  function: "difference",
  args: [1],                                                   // order
  bindings: [{ parameter: "data", source: "visits", field: "count" }],
});

// ADF statistic on a literal series.
const adf = await sqai.compute({
  module: "timeseries_stats",
  function: "adf_test_statistic",
  args: [[8, 9, 7, 10, 11, 9, 12, 13, 11, 14, 15, 13]],
});

// Autocorrelation at lag 1.
const r1 = await sqai.compute({
  module: "timeseries_stats",
  function: "autocorrelation",
  args: [[8, 9, 7, 10, 11, 9, 12, 13, 11, 14, 15, 13], 1],     // series, lag
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# First-order differencing to remove a linear trend.
diffed = sqai.compute(
    module="timeseries_stats",
    function="difference",
    args=[1],  # order
    bindings=[{"parameter": "data", "source": "visits", "field": "count"}],
)

# ADF statistic on a literal series.
adf = sqai.compute(
    module="timeseries_stats",
    function="adf_test_statistic",
    args=[[8, 9, 7, 10, 11, 9, 12, 13, 11, 14, 15, 13]],
)

# Autocorrelation at lag 1.
r1 = sqai.compute(
    module="timeseries_stats",
    function="autocorrelation",
    args=[[8, 9, 7, 10, 11, 9, 12, 13, 11, 14, 15, 13], 1],  # series, lag
)
```
{% endtab %}
{% endtabs %}

`difference` returns the differenced series (shorter than the input by the order); `adf_test_statistic` returns a single test statistic; `autocorrelation` returns the correlation at the requested lag, and `autocorrelation_function` the whole `0..max_lag` vector. All are deterministic — no fabricated numbers here: run them on your series to get the exact value plus its `computation_hash`.

## Determinism for time series

Every capability in both modules is one of the **5,780 deterministic** functions in the contract, so the determinism guarantees apply directly:

- **`precision_mode: "float64"`, `thread_count: 1`.** Fixed precision and a single reduction order mean the same series produces the same floating-point result — and the same `computation_hash` — bit for bit, run to run.
- **No seed.** These are not simulations; the `determinism` envelope carries no `seed`, and the value is replayable from the input alone.
- **Bound calls pin their data.** A `provenance.bindings` entry records `source_name`, `fields`, `schema_revision`, `row_count`, and `input_hash`, so a forecast or decomposition names exactly the rows it consumed. Replaying it against changed data fails loudly with `schema_revision_mismatch`.
- **Same in both SDKs.** One canonical serializer backs TypeScript and Python, so `autocorrelation`, `holt_linear`, and every other function return byte-identical values and hashes in either language.

The contract itself is pinned by `contract_hash sha256:31247fb2…`; a contract change moves every downstream hash by design. See [Determinism & provenance](../determinism.md) for the full envelope and the three hashes.

## Next steps

<table data-view="cards">
<thead><tr><th></th><th></th><th data-hidden data-card-target data-type="content-ref"></th></tr></thead>
<tbody>
<tr><td><strong>Compute &#38; filtering</strong></td><td>The full <code>ComputationSpec</code>, bindings, and installing just these two packs with <code>runtimeModules</code>.</td><td><a href="../compute-and-filtering.md">compute-and-filtering.md</a></td></tr>
<tr><td><strong>Determinism &#38; provenance</strong></td><td>The determinism envelope and the three hashes every result carries.</td><td><a href="../determinism.md">determinism.md</a></td></tr>
<tr><td><strong>Connect your data</strong></td><td>Register a series from a file, SQLite, or a private SQAI deployment, then bind its column.</td><td><a href="../connect-data.md">connect-data.md</a></td></tr>
<tr><td><strong>Policy &#38; governance</strong></td><td>Restrict which sources, fields, and modules a model can reach — enforced in code.</td><td><a href="../policy.md">policy.md</a></td></tr>
</tbody>
</table>
