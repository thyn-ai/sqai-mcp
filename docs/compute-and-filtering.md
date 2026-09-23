---
icon: layer-group
description: 6,084 read-only capabilities across every quantitative domain, with 5,790 exposed to the SDKs — installed as a signed bundle compiled for exactly the modules you filter to.
---

# Compute & filtering

The compute plane is the SQAI runtime's function library: **6,084 read-only capabilities** spanning statistics, finance, option pricing, signal processing, and LLM infrastructure. Every call takes typed arguments, runs on a signed on-device runtime — no cloud, on your machine, no data leaves it — and returns the value plus the hashes that reproduce it — no raw code, no `eval`, no write path. All 6,084 are read-only; **5,780 are deterministic** and 10 are seed-required simulations. 5,790 are exposed to the TypeScript, Python, and AI-SDK surfaces.

You never ship all of them. `runtimeModules` filters the build to exactly the modules you call; the build service compiles and signs a bundle for that filter, cached by filter-hash. First use compiles once, then the runtime stays resident — no per-query cold start. Determinism is preserved end to end: the same input yields the same `computation_hash` no matter which filter produced the bundle, or which SDK made the call.

{% hint style="info" %}
New here? [Quickstart — TypeScript](quickstart-ts.md) and [Quickstart — Python](quickstart-python.md) go from install to a hashed value in minutes. Every hash on a result is explained in [Determinism & provenance](determinism.md).
{% endhint %}

## The library

Grouped by domain below. Names are `module.function`; the summaries are the real one-liners `searchCapabilities` returns.

### Statistics, testing & probability

**Statistics**

| Capability | What it computes |
|---|---|
| `stats.median` | Median of UNSORTED input (mean of the two middle values for even n) |
| `stats.compute_mean` | Compute mean |
| `stats.compute_variance` | Compute variance |
| `metrics_agg.histogram_mean` | Mean of all observations |

**Hypothesis testing**

| Capability | What it computes |
|---|---|
| `stat_tests.pearson_r` | Pearson correlation coefficient and p-value |
| `stat_tests.t_test_1sample` | One-sample t-test: test if sample mean equals mu0 |
| `stat_tests.ks_test_2sample` | Two-sample Kolmogorov-Smirnov test |
| `hypothesis.mann_whitney_u` | Mann-Whitney U test for two independent samples |
| `ab_testing.confidence_interval_proportion` | Wilson score confidence interval for a proportion |

**Probability & distributions**

| Capability | What it computes |
|---|---|
| `distributions.sample_normal` | Sample normal |
| `distribution_fit.best_fit` | Compare normal(0) vs exponential(1) vs uniform(2) by AIC |
| `probability.bayes` | Bayes' theorem: P(A\|B) = P(B\|A) * P(A) / P(B) |
| `probability.binomial_pmf` | Binomial PMF: P(X=k) = C(n,k) * p^k * (1-p)^(n-k) |
| `probability.kl_divergence` | Kullback-Leibler divergence in bits: D_KL(P\|\|Q) = Σ p * log2(p/q) |

**Time series**

| Capability | What it computes |
|---|---|
| `timeseries_stats.autocorrelation` | Sample autocorrelation at the given lag |
| `timeseries_stats.holt_linear` | Holt's linear trend method (double exponential smoothing) |
| `timeseries_stats.rolling_mean` | Simple moving average with given window size |
| `time_series_decompose.stl_like` | Simplified STL: iterative trend + seasonal extraction |

### Numerical & linear algebra

**Linear algebra & matrices**

| Capability | What it computes |
|---|---|
| `linalg.mat_mul` | Matrix multiplication: C = A × B |
| `linalg.mat_inv` | Matrix inverse using Gauss-Jordan elimination with partial pivoting |
| `linalg.mat_det` | Determinant of a square matrix |
| `matrix_decomp.cholesky` | Cholesky decomposition for symmetric positive-definite matrix |
| `matrix_ops.gram_schmidt` | Gram-Schmidt orthogonalization |

**Calculus, interpolation & root-finding**

| Capability | What it computes |
|---|---|
| `interpolate.cubic_spline_natural` | Natural cubic spline interpolation (second derivatives = 0 at endpoints) |
| `integrate.simpson` | Simpson's 1/3 rule for equally-spaced data |
| `differentiate.gradient` | Numerical gradient for non-uniformly spaced data |
| `root_finding.newton_raphson` | Newton-Raphson root finding: x_{n+1} = x_n - f(x_n)/f'(x_n) |
| `optimize.minimize_brent` | Brent's method for function minimization on [a,b] |

**Optimization & operations research**

| Capability | What it computes |
|---|---|
| `linear_programming.enumerate_vertices_2d` | Find all feasible vertices for 2-variable LP |
| `operations_research.eoq_quantity` | EOQ = sqrt(2*D*S/H) |
| `allocation.equal_weight` | 1/n allocation across n assets |
| `multi_objective.is_dominated` | Check if solution b dominates solution a |

**Number theory**

| Capability | What it computes |
|---|---|
| `number_theory.is_prime` | Deterministic Miller-Rabin-like primality test for n < 2^31 |
| `number_theory.gcd` | Greatest common divisor via Euclidean algorithm |
| `number_theory.euler_totient` | Euler's totient φ(n) by trial division |
| `number_theory.fibonacci` | Nth Fibonacci number (iterative) |

### Finance & markets

**Finance & risk**

| Capability | What it computes |
|---|---|
| `finance.npv` | Net Present Value: sum of cashflows[t] / (1+rate)^t for t=0..n-1 |
| `finance.irr` | Internal Rate of Return via Newton's method |
| `finance.cagr` | Compound Annual Growth Rate: (end/start)^(1/years) - 1 |
| `finance.max_drawdown` | Maximum drawdown: largest peak-to-trough decline as a fraction |
| `risk.beta` | Beta = cov(asset, market) / var(market) |
| `risk.conditional_var` | CVaR (Expected Shortfall): average of returns below VaR threshold |
| `risk.information_ratio` | Information ratio: mean(excess) / std(excess) |

**Option pricing**

| Capability | What it computes |
|---|---|
| `option_pricing.black_scholes_call` | Black-Scholes European call price: S*N(d1) - K*exp(-rT)*N(d2) |
| `option_pricing.black_scholes_put` | Black-Scholes European put price: K*exp(-rT)*N(-d2) - S*N(-d1) |
| `option_pricing.implied_volatility` | Implied volatility via bisection on BS formula |
| `option_pricing.delta_call` | Call delta: N(d1) |
| `option_pricing.put_call_parity` | Put price from put-call parity: P = C - S + K*exp(-rT) |

### Signals, ML & information

**ML & metrics**

| Capability | What it computes |
|---|---|
| `ml.classifiers.knn_predict` | K-nearest neighbors prediction (majority vote for classification) |
| `ml.classifiers.kmeans_cluster` | K-means clustering (Lloyd's algorithm) |
| `ml_metrics_extended.auc_trapezoid` | Trapezoidal rule AUC for one ROC segment |
| `ml_metrics_extended.matthews_corr_coeff` | Matthews Correlation Coefficient |
| `regression.ols_multiple` | Multiple OLS via normal equations: β = (X^T X)^-1 X^T y |
| `regression.ridge_regression` | Ridge: β = (X^T X + αI)^-1 X^T y |

**Signal / DSP**

| Capability | What it computes |
|---|---|
| `fft.fft` | Cooley-Tukey radix-2 DIT FFT |
| `fft.power_spectrum` | \|FFT(x)\|² / N |
| `signal.dsp.convolve` | 1D convolution (full mode) |
| `wavelet.denoise_haar` | Denoise: forward DWT → soft threshold → inverse DWT |
| `signal_processing.spectral_centroid` | Weighted mean frequency |

**Information theory**

| Capability | What it computes |
|---|---|
| `information_theory.entropy` | Shannon entropy: -Σ p*log2(p) |
| `information_theory.kl_divergence` | KL divergence: Σ p*log2(p/q) |
| `information_theory.mutual_information` | Mutual information I(X;Y) = H(X) + H(Y) - H(X,Y) |
| `information_theory.channel_capacity_bsc` | Binary symmetric channel capacity: C = 1 - H(p) |

### LLM infrastructure

A pack aimed at teams building on models: attention, caching, routing, retrieval, and tokenization math — all deterministic.

| Capability | What it computes |
|---|---|
| `flash_attention.flash_block_output` | Block output accumulation with running max correction |
| `kv_cache.incremental_decode_kv_append` | KV pairs appended per autoregressive decode step |
| `moe_routing.cosine_router_score` | Cosine-similarity router: route to most similar expert |
| `embeddings.cosine_similarity` | Cosine similarity between two vectors |
| `rag_retrieval.bm25_term_score` | BM25 term score contribution |
| `bpe_tokenizer.bpe_pair_frequency` | Normalised bigram frequency for BPE pair selection |
| `inference_engine.speculative_decode_accept_rate` | Speculative decoding acceptance rate α |

### 100+ applied-science & engineering packs

Every function is a named, hash-pinned capability — never handwritten formulas. Domain packs include `accounting`, `actuarial`, `aerospace`, `bioinformatics`, `biomechanics`, `epidemiology`, `hydrology`, `metallurgy`, `oceanography`, `pharmacokinetics`, `power_systems`, `robotics`, `seismology`, `semiconductors`, `thermodynamics`, `wind_energy`, `viticulture`, and more — 445 modules in all.

## Build-on-provision filtering

All 6,084 capabilities live in the embedded contract, but the runtime you provision ships only the modules you name. `runtimeModules` (env `SQAI_RUNTIME_MODULES`, comma-separated) is the filter; the build service compiles a signed bundle for exactly that set.

{% stepper %}
{% step %}
#### Declare the filter

Pass `runtimeModules` to the client, or set `SQAI_RUNTIME_MODULES`. Modules are normalized (trimmed, de-duplicated, sorted) before hashing, so `["stats","finance","stats"]` and `["finance","stats"]` resolve to the same bundle.
{% endstep %}
{% step %}
#### The build service compiles + signs

The SDK `POST`s `{ modules, platform }` to `SQAI_BUILD_SERVICE_URL` (`/v1/runtime/build`) and gets back a signed bundle keyed by **filter-hash** — `sha256("mods|platform|version")[:20]`. Same filter, same key, same cached bundle.
{% endstep %}
{% step %}
#### First use compiles once

The filtered runtime process spawns on its own socket/port (never colliding with the default or another filter's runtime) and is cached by filter-hash — a warm runtime process is reused without a build-service round-trip.
{% endstep %}
{% step %}
#### Warm forever after

The first-ever provision downloads, verifies the RS256 signature and sha256, extracts, and spawns — roughly 110s, once. After that the runtime stays resident: every `compute()` is warm, ~0.9ms. No per-query cold start.
{% endstep %}
{% endstepper %}

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
import { createSQAI } from "@thyn-ai/sqai";

// Install only what you call. Everything else is left out of the bundle.
const sqai = createSQAI({
  runtimeModules: ["finance", "risk", "option_pricing"],
});

await sqai.compute({
  module: "finance",
  function: "npv",
  args: [0.1, [-1000, 300, 420, 560, 680]],
});
```

Or via the environment, no code change:

```bash
export SQAI_RUNTIME_MODULES="finance,risk,option_pricing"
export SQAI_BUILD_SERVICE_URL="https://build.sqai.example.com"
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
from sqai import SQAI

# Install only what you call. Everything else is left out of the bundle.
sqai = SQAI(runtime_modules=["finance", "risk", "option_pricing"])

sqai.compute(
    module="finance",
    function="npv",
    args=[0.1, [-1000, 300, 420, 560, 680]],
)
```

Or via the environment, no code change:

```bash
export SQAI_RUNTIME_MODULES="finance,risk,option_pricing"
export SQAI_BUILD_SERVICE_URL="https://build.sqai.example.com"
```
{% endtab %}
{% endtabs %}

{% hint style="warning" %}
Filtered bundles need a build service. Set `SQAI_BUILD_SERVICE_URL` (or `buildServiceUrl`). If `runtimeModules` is set with no build service configured, provisioning fails with `runtime_provision_failed`: _"runtimeModules was set but no build service is configured."_ Omit `runtimeModules` to use the default pinned bundle.
{% endhint %}

**Determinism is preserved.** The filter changes what is installed, never what a function returns. `finance.npv(0.1, [-1000, 300, 420, 560, 680])` yields the same value and the same `computation_hash` whether the bundle carries three modules or all of them — and identically in TypeScript and Python:

```json
{
  "value": 505.020148896933,
  "invocation_hash": "b3ca3e925e4372a5f9365790a29c486afed868073d3fd301d03022f44689e423",
  "computation_hash": "b74f67d0d7a594aa7ac91f6291612452aa8ccdf603351ebc8d801a6fddd91bc8",
  "run1": "b74f67d0d7a594aa7ac91f6291612452aa8ccdf603351ebc8d801a6fddd91bc8",
  "run2": "b74f67d0d7a594aa7ac91f6291612452aa8ccdf603351ebc8d801a6fddd91bc8",
  "identical": true
}
```

## Discovery

`searchCapabilities(query, limit=10)` ranks the exposed capabilities by token overlap over name, category, and summary, and returns `[{ entry, score }]`. It reads the embedded contract in-process — no runtime, no key, no provision. Only the 5,790 exposed read-only capabilities are searchable: 5,780 deterministic plus 10 seed-required simulations.

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

{% hint style="info" %}
Search sees the whole contract; a filtered runtime only executes the modules you installed. Search first, then set `runtimeModules` to the packs you actually call — a `compute()` against a module outside your filter has nothing to dispatch to.
{% endhint %}

## Compute over connected data

Bind a capability's arguments to columns of a connected source instead of literals. The runtime extracts the column in-process, dispatches to the runtime, and records **provenance** — the source, fields, `schema_revision`, `row_count`, and per-binding `input_hash` — so the result is reproducible from the data it read. `finance.npv` over the `revenue` column of the `sales` source:

```json
{
  "status": "ok",
  "value": 3188.1687606249325,
  "value_type": "float64",
  "module": "finance",
  "function": "npv",
  "invocation_hash": "8223a694250fc751fcf8a7777b8e1f524c44ff1f0e7e83451467f554a6123950",
  "computation_hash": "ff5280ea128113f528dd1e9a28b9bc4a81469075ed7c981c7176fb172d98085d",
  "provenance": {
    "bindings": [
      {
        "source_name": "sales",
        "fields": ["revenue"],
        "schema_revision": "e4938027ddf0d2210f019770403efd45d350eac28100902ddd7c5191c9b8cfbe",
        "row_count": 12,
        "input_hash": "2ea5ede72acd2912fe9e1230cef34afad4c9436bfa8a709bac2da02b478e3212"
      }
    ]
  },
  "latency_ms": 0.83,
  "request_id": "sqai_89fc558711314049"
}
```

## Related

<table data-view="cards">
<thead><tr><th></th><th></th><th data-hidden data-card-target data-type="content-ref"></th></tr></thead>
<tbody>
<tr><td><strong>Determinism &#38; provenance</strong></td><td>What every hash on a result means, and how they reproduce it.</td><td><a href="determinism.md">determinism.md</a></td></tr>
<tr><td><strong>Connect data</strong></td><td>Sources you can bind compute to — files, SQLite, and private SQAI databases.</td><td><a href="connect-data.md">connect-data.md</a></td></tr>
<tr><td><strong>Policy &#38; governance</strong></td><td>Restrict sources, fields, and capabilities — in code, never from model input.</td><td><a href="policy.md">policy.md</a></td></tr>
<tr><td><strong>Vercel AI SDK tool</strong></td><td>Expose these capabilities to an agent as a validated tool.</td><td><a href="ai-sdk-tools.md">ai-sdk-tools.md</a></td></tr>
</tbody>
</table>
