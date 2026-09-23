---
icon: chart-simple
description: 195 read-only capabilities for descriptive statistics, probability, distributions, and Bayesian inference — each a hash-pinned function that runs on the signed on-device runtime and returns its value plus a reproducing hash.
---

# Statistics, probability & distributions

This is SQAI's core numerical-inference domain: **195 read-only capabilities** for summarizing data, reasoning under uncertainty, fitting and comparing distributions, and the sampling math behind Bayesian updates and LLM decoding. Every one is a named, hash-pinned function — never a handwritten formula — that takes typed arguments, runs on the signed on-device runtime (no cloud, on your machine, no data leaves it), and returns its value plus the hashes that reproduce it. These 195 are part of the contract's **5,790 exposed read-only capabilities** (contract `sha256:31247fb2…`); the domain spans 19 namespaces, from fast primitives in `stats` to conjugate updates in `bayesian`.

You call any of them the same way — `module`, `function`, `args`:

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
import { createSQAI } from "@thyn-ai/sqai";

// Install only the packs you call (see Compute & filtering).
const sqai = createSQAI({ runtimeModules: ["stats", "probability", "bayesian"] });

const r = await sqai.compute({
  module: "stats",
  function: "compute_variance",
  args: [[12, 15, 11, 14, 20, 9]],
});
// r.value is the variance; r.computation_hash reproduces it.
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
from sqai import SQAI

# Install only the packs you call (see Compute & filtering).
sqai = SQAI(runtime_modules=["stats", "probability", "bayesian"])

r = sqai.compute(
    module="stats",
    function="compute_variance",
    args=[[12, 15, 11, 14, 20, 9]],
)
# r["value"] is the variance; r["computation_hash"] reproduces it.
```
{% endtab %}
{% endtabs %}

{% hint style="info" %}
Every result carries an `invocation_hash` (known **before** the call runs), a `computation_hash` (the full-fidelity replay key), the `contract_hash`, and a determinism envelope pinning platform, precision, and thread count. What each field means — and why TypeScript and Python return byte-identical hashes — is in [Determinism & provenance](../determinism.md).
{% endhint %}

## Descriptive statistics & primitives

The `stats` namespace holds the fast, low-level building blocks — means, variances, sorts, and integer helpers — that heavier routines compose on. Pass a numeric list; get a scalar or a transformed list back.

| Capability | What it computes |
|---|---|
| `stats.compute_mean` | Compute mean |
| `stats.compute_variance` | Compute variance |
| `stats.count_below_zero` | Count below zero |
| `stats.fast_sort` | Fast sort |
| `stats.ilog2` | Ilog2 |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// Arithmetic mean of a sample → float64.
await sqai.compute({ module: "stats", function: "compute_mean", args: [[12, 15, 11, 14, 20, 9]] });

// How many observations are negative → integer count.
await sqai.compute({ module: "stats", function: "count_below_zero", args: [[-2.1, 0.4, -0.7, 1.2]] });
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# Arithmetic mean of a sample → float64.
sqai.compute(module="stats", function="compute_mean", args=[[12, 15, 11, 14, 20, 9]])

# How many observations are negative → integer count.
sqai.compute(module="stats", function="count_below_zero", args=[[-2.1, 0.4, -0.7, 1.2]])
```
{% endtab %}
{% endtabs %}

## Probability & combinatorics

The `probability` namespace covers exact discrete probability and the combinatorial functions underneath it — Bayes' rule, the binomial PMF, factorials, choose, and Shannon entropy.

| Capability | What it computes |
|---|---|
| `probability.bayes` | Bayes' theorem: P(A\|B) = P(B\|A) * P(A) / P(B) |
| `probability.binomial_pmf` | Binomial PMF: P(X=k) = C(n,k) * p^k * (1-p)^(n-k) |
| `probability.combinations` | Binomial coefficient: C(n, k) = n! / (k! * (n-k)!) |
| `probability.entropy` | Shannon entropy in bits: H = -Σ p * log2(p) |
| `probability.factorial` | Compute n! as Float64 |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// Posterior P(A|B) from P(B|A)=0.9, prior P(A)=0.01, evidence P(B)=0.05.
await sqai.compute({ module: "probability", function: "bayes", args: [0.9, 0.01, 0.05] });

// P(X=3) for 10 Bernoulli trials at p=0.25 → probability mass at k=3.
await sqai.compute({ module: "probability", function: "binomial_pmf", args: [10, 3, 0.25] });

// Shannon entropy of a distribution, in bits.
await sqai.compute({ module: "probability", function: "entropy", args: [[0.5, 0.25, 0.25]] });
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# Posterior P(A|B) from P(B|A)=0.9, prior P(A)=0.01, evidence P(B)=0.05.
sqai.compute(module="probability", function="bayes", args=[0.9, 0.01, 0.05])

# P(X=3) for 10 Bernoulli trials at p=0.25 → probability mass at k=3.
sqai.compute(module="probability", function="binomial_pmf", args=[10, 3, 0.25])

# Shannon entropy of a distribution, in bits.
sqai.compute(module="probability", function="entropy", args=[[0.5, 0.25, 0.25]])
```
{% endtab %}
{% endtabs %}

## Distributions & sampling

The `distributions` namespace draws variates from named families and supplies the numeric approximations (`acos_approx`, and more) that make those draws fast in the runtime. Parameterize the family and get a variate back.

| Capability | What it computes |
|---|---|
| `distributions.sample_bernoulli` | Sample bernoulli |
| `distributions.sample_beta` | Sample beta |
| `distributions.sample_arcsine` | Sample arcsine |
| `distributions.sample_cauchy` | Sample cauchy |
| `distributions.acos_approx` | Acos approx |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// Draw a Bernoulli(0.3) variate → 0 or 1.
await sqai.compute({ module: "distributions", function: "sample_bernoulli", args: [0.3] });

// Draw from Beta(2, 5) → a value in (0, 1).
await sqai.compute({ module: "distributions", function: "sample_beta", args: [2.0, 5.0] });
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# Draw a Bernoulli(0.3) variate → 0 or 1.
sqai.compute(module="distributions", function="sample_bernoulli", args=[0.3])

# Draw from Beta(2, 5) → a value in (0, 1).
sqai.compute(module="distributions", function="sample_beta", args=[2.0, 5.0])
```
{% endtab %}
{% endtabs %}

{% hint style="warning" %}
Anything that draws pseudo-random samples is a **simulation**. Across the whole contract, 10 capabilities are `seed_required` and reject an unseeded `compute()` — the seed is then recorded in both the invocation identity and the determinism envelope, so the same seed in the same scope replays to the same value and the same `computation_hash`. See [Seeded simulations](../determinism.md#seeded-simulations).
{% endhint %}

## Bayesian inference

Two complementary namespaces. `bayesian` handles the Beta-Binomial conjugate workflow — priors, posteriors, credible intervals, Bayes factors, and a Monte Carlo A/B test. `bayesian_inference` covers the Gaussian and log-space machinery — log-posterior updates, KL between Gaussians, credible-interval widths, priors, and expected information gain.

**Beta-Binomial (`bayesian`)**

| Capability | What it computes |
|---|---|
| `bayesian.beta_posterior` | Beta-Binomial conjugate update |
| `bayesian.beta_mean` | Mean of Beta(α, β): α / (α + β) |
| `bayesian.beta_credible_interval` | Approximate credible interval [lower, upper] using normal approximation |
| `bayesian.bayes_factor` | Bayes factor: L(H1) / L(H0) |
| `bayesian.bayesian_ab_test` | P(B > A) using Monte Carlo sampling from Beta posteriors (flat prior) |

**Gaussian & log-space (`bayesian_inference`)**

| Capability | What it computes |
|---|---|
| `bayesian_inference.bayes_update_log` | Log-space posterior update: log P(θ\|x) ∝ log P(x\|θ) + log P(θ) |
| `bayesian_inference.kl_gaussians` | KL divergence KL(N(μ1,σ1²) \|\| N(μ2,σ2²)) |
| `bayesian_inference.credible_interval_half_width` | Gaussian credible interval half-width: z × σ |
| `bayesian_inference.jeffreys_prior_gaussian` | Jeffreys prior for Gaussian σ: p(σ) ∝ 1/σ |
| `bayesian_inference.expected_information_gain` | Expected Information Gain: EIG = H[p(θ)] - E[H[p(θ\|x)]] |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// Update a flat Beta(1,1) prior with 8 successes in 10 trials → posterior parameters.
await sqai.compute({ module: "bayesian", function: "beta_posterior", args: [1, 1, 8, 10] });

// Posterior mean of Beta(9, 3) → α / (α + β).
await sqai.compute({ module: "bayesian", function: "beta_mean", args: [9, 3] });

// KL( N(0,1) || N(0.5, 1.5²) ) → divergence in nats.
await sqai.compute({ module: "bayesian_inference", function: "kl_gaussians", args: [0, 1, 0.5, 1.5] });
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# Update a flat Beta(1,1) prior with 8 successes in 10 trials → posterior parameters.
sqai.compute(module="bayesian", function="beta_posterior", args=[1, 1, 8, 10])

# Posterior mean of Beta(9, 3) → α / (α + β).
sqai.compute(module="bayesian", function="beta_mean", args=[9, 3])

# KL( N(0,1) || N(0.5, 1.5²) ) → divergence in nats.
sqai.compute(module="bayesian_inference", function="kl_gaussians", args=[0, 1, 0.5, 1.5])
```
{% endtab %}
{% endtabs %}

## Distribution fitting & model selection

The `distribution_fit` namespace fits a family to data by maximum likelihood, then scores competing fits with information criteria so you can pick the model the data actually supports.

| Capability | What it computes |
|---|---|
| `distribution_fit.fit_normal` | Fit normal distribution via MLE |
| `distribution_fit.fit_exponential` | Fit exponential distribution via MLE |
| `distribution_fit.aic` | Akaike Information Criterion: 2k - 2*LL |
| `distribution_fit.bic` | Bayesian Information Criterion: k*ln(n) - 2*LL |
| `distribution_fit.best_fit` | Compare normal(0) vs exponential(1) vs uniform(2) by AIC |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// MLE fit of a normal to a sample → estimated parameters.
await sqai.compute({ module: "distribution_fit", function: "fit_normal", args: [[4.1, 3.8, 5.2, 4.6, 4.9, 5.5]] });

// Pick the best of normal / exponential / uniform by AIC → 0, 1, or 2.
await sqai.compute({ module: "distribution_fit", function: "best_fit", args: [[4.1, 3.8, 5.2, 4.6, 4.9, 5.5]] });
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# MLE fit of a normal to a sample → estimated parameters.
sqai.compute(module="distribution_fit", function="fit_normal", args=[[4.1, 3.8, 5.2, 4.6, 4.9, 5.5]])

# Pick the best of normal / exponential / uniform by AIC → 0, 1, or 2.
sqai.compute(module="distribution_fit", function="best_fit", args=[[4.1, 3.8, 5.2, 4.6, 4.9, 5.5]])
```
{% endtab %}
{% endtabs %}

## Sampling for LLM decoding

The `llm_sampling` namespace is the probability math behind token selection: min-p thresholds, beam-search scoring and length penalties, greedy checks, and fast power approximations — all deterministic, so a decoding step is auditable.

| Capability | What it computes |
|---|---|
| `llm_sampling.min_p_threshold` | Min-p dynamic threshold: threshold = max_prob × min_p |
| `llm_sampling.beam_score_update` | Accumulate beam search score: score += log P(token) |
| `llm_sampling.length_penalty` | Beam search length penalty (Wu et al.) |
| `llm_sampling.greedy_token_id` | Check if current token is the greedy choice |
| `llm_sampling.pow_approx` | Pow approx |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// Dynamic min-p cutoff from the top probability → threshold = max_prob × min_p.
await sqai.compute({ module: "llm_sampling", function: "min_p_threshold", args: [0.62, 0.05] });

// Extend a beam score by log P(token).
await sqai.compute({ module: "llm_sampling", function: "beam_score_update", args: [-3.71, -0.92] });
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# Dynamic min-p cutoff from the top probability → threshold = max_prob × min_p.
sqai.compute(module="llm_sampling", function="min_p_threshold", args=[0.62, 0.05])

# Extend a beam score by log P(token).
sqai.compute(module="llm_sampling", function="beam_score_update", args=[-3.71, -0.92])
```
{% endtab %}
{% endtabs %}

## Applied ratios: real estate

The `real_estate` pack clusters here because its valuation ratios are the same shape of deterministic scalar math — cap rates, coverage ratios, and appreciation compounding.

| Capability | What it computes |
|---|---|
| `real_estate.cap_rate` | Capitalisation rate: Cap = NOI / Value * 100 |
| `real_estate.cash_on_cash_return` | Cash-on-cash return: CoC = CF / Invested * 100 |
| `real_estate.debt_service_coverage` | Debt service coverage ratio: DSCR = NOI / ADS |
| `real_estate.break_even_ratio` | Break-even ratio: BER = (OE + DS) / GI * 100 |
| `real_estate.appreciation_value` | Future value via appreciation: FV = PV * (1+r)^n |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// Cap rate from net operating income and value → percent.
await sqai.compute({ module: "real_estate", function: "cap_rate", args: [82000, 1150000] });

// Debt service coverage: NOI / annual debt service → ratio.
await sqai.compute({ module: "real_estate", function: "debt_service_coverage", args: [82000, 61000] });
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# Cap rate from net operating income and value → percent.
sqai.compute(module="real_estate", function="cap_rate", args=[82000, 1150000])

# Debt service coverage: NOI / annual debt service → ratio.
sqai.compute(module="real_estate", function="debt_service_coverage", args=[82000, 61000])
```
{% endtab %}
{% endtabs %}

## The full namespace surface

The samples above are a slice; the domain's **195** capabilities span these 19 namespaces:

| Namespace | Theme |
|---|---|
| `stats` | Fast descriptive primitives — mean, variance, sort, integer helpers |
| `probability` | Exact discrete probability and combinatorics |
| `distributions` | Variate sampling from named families + numeric approximations |
| `distribution_fit` | MLE fits and AIC/BIC model selection |
| `bayesian` | Beta-Binomial priors, posteriors, credible intervals, A/B tests |
| `bayesian_inference` | Gaussian and log-space posterior updates, KL, information gain |
| `correlation` | Correlation coefficients between variables |
| `regression` | Regression fits |
| `regression_tree` | Tree-based regression splits |
| `sampling` | General sampling routines |
| `stats_bootstrap` | Bootstrap resampling estimates |
| `scipy_stats_ops` | SciPy-compatible statistical operations |
| `stat_tests` | Statistical hypothesis tests (see the sibling topic) |
| `state_space_models` | State-space / filtering models |
| `stateful_runtime` | Stateful accumulator helpers |
| `timeseries_stats` | Time-series statistics (see the sibling topic) |
| `llm_sampling` | Token-selection probability math for decoding |
| `real_estate` | Applied valuation ratios |
| `electrostatics` | Field/potential math bundled into this cluster |

{% hint style="info" %}
`stat_tests` and `timeseries_stats` also anchor their own pages — [Hypothesis testing](hypothesis-testing.md) and [Time series](time-series.md) — where their functions are laid out in full.
{% endhint %}

Not sure of the exact name? `searchCapabilities` ranks the exposed contract by token overlap over name, category, and summary — in-process, no runtime, no key, no provision:

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
sqai.searchCapabilities("beta posterior credible interval", 5)
  .map((m) => `${m.entry.name} — ${m.entry.summary}`);
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
[f"{m['entry']['name']} — {m['entry']['summary']}"
 for m in sqai.search_capabilities("beta posterior credible interval", 5)]
```
{% endtab %}
{% endtabs %}

It returns `[{ entry, score }]`, ranked most-relevant first — every `entry` carries the real one-line `summary`. Search sees the whole contract; a filtered runtime only executes the modules you named in `runtimeModules`, so search first, then set your filter to the packs you actually call.

## Compute over connected data

Bind a source column to an argument instead of passing a literal, and the runtime extracts it in-process, dispatches, and records provenance — the source, fields, `schema_revision`, `row_count`, and a per-binding `input_hash` — so a summary statistic is reproducible from the exact rows it read. `stats.compute_mean` over the `latency_ms` column of a connected `requests` source:

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
await sqai.compute({
  module: "stats",
  function: "compute_mean",
  bindings: [{ parameter: "values", source: "requests", field: "latency_ms" }],
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
sqai.compute(
    module="stats",
    function="compute_mean",
    bindings=[{"parameter": "values", "source": "requests", "field": "latency_ms"}],
)
```
{% endtab %}
{% endtabs %}

The value now reflects live data, and `provenance.bindings` pins exactly which data produced it. See [Compute & filtering](../compute-and-filtering.md) for the full binding spec and [Connect your data](../connect-data.md) for registering sources.

## Next steps

<table data-view="cards">
<thead><tr><th></th><th></th><th data-hidden data-card-target data-type="content-ref"></th></tr></thead>
<tbody>
<tr><td><strong>Hypothesis testing</strong></td><td>t-tests, KS, chi-squared, Mann-Whitney, and A/B significance.</td><td><a href="hypothesis-testing.md">hypothesis-testing.md</a></td></tr>
<tr><td><strong>Time series</strong></td><td>Autocorrelation, smoothing, differencing, and decomposition.</td><td><a href="time-series.md">time-series.md</a></td></tr>
<tr><td><strong>Compute &#38; filtering</strong></td><td>How <code>compute()</code>, bindings, and <code>runtimeModules</code> work end to end.</td><td><a href="../compute-and-filtering.md">compute-and-filtering.md</a></td></tr>
<tr><td><strong>Determinism &#38; provenance</strong></td><td>What every hash means, and how seeded simulations replay.</td><td><a href="../determinism.md">determinism.md</a></td></tr>
</tbody>
</table>
