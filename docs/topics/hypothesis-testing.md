---
icon: flask-vial
description: 66 read-only capabilities for turning samples into decisions — parametric and nonparametric tests, A/B experiment design, and Bayesian updates — each returning its statistic, p-value, and reproducible hashes.
---

# Hypothesis testing & inference

This pack answers one question well: **does the data support the claim?** It holds **66 read-only capabilities** across seven namespaces — `stat_tests`, `hypothesis`, `ab_testing`, `bayesian_inference`, and three LLM-serving `inference_*` packs. The statistical core takes samples in and returns a test statistic, a p-value, a confidence or credible interval, or a posterior — never a chart, never a "probably." Every call runs on the signed on-device runtime (no cloud, on your machine, no data leaves it) and returns the value plus the hashes that reproduce it. These are ordinary members of the contract's deterministic set: same input, same p-value, same `computation_hash`, in TypeScript and Python alike.

Because they are deterministic capabilities and not free-form code, a p-value is now an auditable artifact. The number that decided a rollout carries an `invocation_hash` computed before it ran and a `computation_hash` after — so a reviewer can replay the exact test months later and get the exact same result, or fail loudly if the contract moved.

{% hint style="info" %}
New to compute? [Compute & filtering](../compute-and-filtering.md) covers `compute()`, `runtimeModules`, and binding arguments to connected columns. Every hash on these results is explained in [Determinism & provenance](../determinism.md).
{% endhint %}

## Parametric & goodness-of-fit tests

The `stat_tests` namespace covers correlation and the distributional tests you reach for first — comparing a sample to a reference distribution, or two samples to each other. Each returns its named statistic together with a p-value.

| Capability | What it computes |
|---|---|
| `stat_tests.pearson_r` | Pearson correlation coefficient and p-value |
| `stat_tests.chi_squared_test` | Chi-squared goodness-of-fit test |
| `stat_tests.ks_test_2sample` | Two-sample Kolmogorov-Smirnov test |
| `stat_tests.ks_test_normal` | One-sample KS test against normal distribution |
| `stat_tests.anderson_darling_normal` | Anderson-Darling test for normality |

`pearson_r` returns both the coefficient _r_ and its two-sided p-value in one call, so you never eyeball a correlation without its significance:

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
import { createSQAI } from "@thyn-ai/sqai";

const sqai = createSQAI({ runtimeModules: ["stat_tests", "hypothesis"] });

// r and its p-value for two paired series
await sqai.compute({
  module: "stat_tests",
  function: "pearson_r",
  args: [
    [1, 2, 3, 4, 5],
    [2.1, 3.9, 6.2, 7.8, 10.1],
  ],
});

// χ² goodness-of-fit: observed counts vs an expected (uniform) baseline
await sqai.compute({
  module: "stat_tests",
  function: "chi_squared_test",
  args: [
    [18, 22, 20, 25, 15],
    [20, 20, 20, 20, 20],
  ],
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
from sqai import SQAI

sqai = SQAI(runtime_modules=["stat_tests", "hypothesis"])

# r and its p-value for two paired series
sqai.compute(
    module="stat_tests",
    function="pearson_r",
    args=[[1, 2, 3, 4, 5], [2.1, 3.9, 6.2, 7.8, 10.1]],
)

# χ² goodness-of-fit: observed counts vs an expected (uniform) baseline
sqai.compute(
    module="stat_tests",
    function="chi_squared_test",
    args=[[18, 22, 20, 25, 15], [20, 20, 20, 20, 20]],
)
```
{% endtab %}
{% endtabs %}

`ks_test_2sample` reports the KS _D_ statistic and p-value for whether two samples were drawn from the same distribution; `ks_test_normal` and `anderson_darling_normal` are the normality checks you run before trusting a parametric test downstream — the Anderson-Darling variant is the more sensitive of the two in the tails.

## Nonparametric & rank-based tests

When you can't assume normality — skewed data, ordinal outcomes, small n — the `hypothesis` namespace gives you distribution-free comparisons plus the ranking primitive they share.

| Capability | What it computes |
|---|---|
| `hypothesis.mann_whitney_u` | Mann-Whitney U test for two independent samples |
| `hypothesis.kruskal_wallis` | Kruskal-Wallis H test for k independent groups |
| `hypothesis.fisher_exact_2x2` | Fisher's exact test for a 2×2 contingency table |
| `hypothesis.sign_test` | Sign test: count values above, below, and equal to the median |
| `hypothesis.rank_data` | Assign ranks (1-based) to data with average tie-breaking |

Mann-Whitney U is the nonparametric answer to the two-sample t-test; Kruskal-Wallis extends it to _k_ groups. Both return the test statistic and its p-value:

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// Two independent samples — is B shifted relative to A?
await sqai.compute({
  module: "hypothesis",
  function: "mann_whitney_u",
  args: [
    [12, 15, 14, 10, 13],
    [18, 20, 17, 22, 19],
  ],
});

// k groups at once — do any of the three differ?
await sqai.compute({
  module: "hypothesis",
  function: "kruskal_wallis",
  args: [
    [12, 15, 14, 10],
    [18, 20, 17, 22],
    [11, 13, 16, 12],
  ],
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# Two independent samples — is B shifted relative to A?
sqai.compute(
    module="hypothesis",
    function="mann_whitney_u",
    args=[[12, 15, 14, 10, 13], [18, 20, 17, 22, 19]],
)

# k groups at once — do any of the three differ?
sqai.compute(
    module="hypothesis",
    function="kruskal_wallis",
    args=[[12, 15, 14, 10], [18, 20, 17, 22], [11, 13, 16, 12]],
)
```
{% endtab %}
{% endtabs %}

`fisher_exact_2x2` gives the exact p-value for a 2×2 contingency table — the right choice for small conversion counts where the χ² approximation breaks down. `sign_test` is the most assumption-light location test there is: it just counts observations above, below, and equal to the median. `rank_data` returns 1-based ranks with average tie-breaking — the shared primitive the rank tests are built on, exposed on its own for when you need the ranks directly.

## A/B testing & experiment design

The `ab_testing` namespace covers the full experiment lifecycle: size it before you run it, bound the result after, and gate the decision — plus a bandit selector for adaptive allocation.

| Capability | What it computes |
|---|---|
| `ab_testing.power_analysis` | Statistical power for given effect size and sample size |
| `ab_testing.mde` | Minimum detectable effect size |
| `ab_testing.confidence_interval_proportion` | Wilson score confidence interval for a proportion |
| `ab_testing.is_significant` | Check if result is statistically significant |
| `ab_testing.epsilon_greedy_select` | Epsilon-greedy multi-arm bandit arm selection |

Design first: `power_analysis` returns the power (1 − β) you'd have for a given effect size and sample size, and `mde` inverts that — the smallest effect a design can actually detect. After the experiment, `confidence_interval_proportion` returns Wilson lower/upper bounds (well-behaved even at small n or extreme rates), and `is_significant` collapses the outcome to the boolean your rollout logic branches on.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const sqai = createSQAI({ runtimeModules: ["ab_testing"] });

// Power for a 0.3 effect at n = 200
await sqai.compute({
  module: "ab_testing",
  function: "power_analysis",
  args: [0.3, 200],
});

// Wilson interval for 118 conversions out of 400
await sqai.compute({
  module: "ab_testing",
  function: "confidence_interval_proportion",
  args: [118, 400],
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
sqai = SQAI(runtime_modules=["ab_testing"])

# Power for a 0.3 effect at n = 200
sqai.compute(module="ab_testing", function="power_analysis", args=[0.3, 200])

# Wilson interval for 118 conversions out of 400
sqai.compute(
    module="ab_testing",
    function="confidence_interval_proportion",
    args=[118, 400],
)
```
{% endtab %}
{% endtabs %}

`epsilon_greedy_select` picks an arm from per-arm value estimates, exploring uniformly with probability ε — the bandit alternative to a fixed split when you'd rather learn while you allocate.

{% hint style="warning" %}
Any capability that draws randomness takes a **seed** and records it in the determinism envelope, so even a stochastic selection replays exactly. If a `compute()` needs one and none is supplied it fails with `seed_required` — see [Seeded simulations](../determinism.md#seeded-simulations).
{% endhint %}

## Bayesian inference

The `bayesian_inference` namespace updates beliefs rather than rejecting nulls: posteriors, credible intervals, priors, and the information-theoretic quantities that drive experiment design.

| Capability | What it computes |
|---|---|
| `bayesian_inference.bayes_update_log` | Log-space posterior update: log P(θ\|x) ∝ log P(x\|θ) + log P(θ) |
| `bayesian_inference.credible_interval_half_width` | Gaussian credible interval half-width: z × σ |
| `bayesian_inference.expected_information_gain` | Expected Information Gain: EIG = H[p(θ)] - E[H[p(θ\|x)]] |
| `bayesian_inference.jeffreys_prior_gaussian` | Jeffreys prior for Gaussian σ: p(σ) ∝ 1/σ |
| `bayesian_inference.kl_gaussians` | KL divergence KL(N(μ1,σ1²) \|\| N(μ2,σ2²)) |

`bayes_update_log` does the update in log space — returning the unnormalised log-posterior as log-likelihood + log-prior — so long chains of evidence stay numerically stable. `credible_interval_half_width` is the Bayesian counterpart to a confidence interval's margin (z × σ), `expected_information_gain` scores how much a proposed observation would sharpen the posterior, and `kl_gaussians` gives the closed-form divergence between two Gaussians — the workhorse behind variational objectives and drift monitors.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const sqai = createSQAI({ runtimeModules: ["bayesian_inference"] });

// Closed-form KL between two Gaussians
await sqai.compute({
  module: "bayesian_inference",
  function: "kl_gaussians",
  args: [0.0, 1.0, 0.5, 1.2], // μ1, σ1, μ2, σ2
});

// One log-space posterior step from a log-likelihood and log-prior
await sqai.compute({
  module: "bayesian_inference",
  function: "bayes_update_log",
  args: [-2.3, -0.7],
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
sqai = SQAI(runtime_modules=["bayesian_inference"])

# Closed-form KL between two Gaussians
sqai.compute(
    module="bayesian_inference",
    function="kl_gaussians",
    args=[0.0, 1.0, 0.5, 1.2],  # mu1, sigma1, mu2, sigma2
)

# One log-space posterior step from a log-likelihood and log-prior
sqai.compute(module="bayesian_inference", function="bayes_update_log", args=[-2.3, -0.7])
```
{% endtab %}
{% endtabs %}

## A test, end to end

The everyday flow: find the right test, install only the packs you'll call, run it, and gate the decision on a hash you can replay.

{% stepper %}
{% step %}
#### Find the right test

Search the whole contract in-process — no runtime, no key — to confirm the capability and its summary before you wire it up.

```ts
sqai.searchCapabilities("two sample nonparametric test", 5)
  .map((m) => `${m.entry.name} — ${m.entry.summary}`);
```

`searchCapabilities` (Python `search_capabilities`) is also where you confirm the exact argument order for a capability, since it returns the full contract entry.
{% endstep %}
{% step %}
#### Install only those packs

Filter the runtime to the namespaces you actually call, so the signed bundle carries nothing else.

```ts
const sqai = createSQAI({
  runtimeModules: ["stat_tests", "hypothesis", "ab_testing"],
});
```
{% endstep %}
{% step %}
#### Run the test

`compute()` returns the statistic and p-value as `value`, plus the determinism envelope and both hashes. First provision compiles once (~110s); every call after is warm.
{% endstep %}
{% step %}
#### Gate the decision, keep the receipt

Branch on `ab_testing.is_significant`, and store the `computation_hash`. Re-running the same test in the same scope reproduces the p-value byte-for-byte; a moved `contract_hash` changes the hash instead of silently changing the number.
{% endstep %}
{% endstepper %}

## Test over connected data

You rarely have your samples as literals. Bind a capability's arguments to columns of a connected source and the runtime extracts the column in-process, dispatches to the runtime, and records **provenance** — the source, fields, `schema_revision`, `row_count`, and per-binding `input_hash` — so the test is reproducible from the exact data it read. Run `stat_tests.pearson_r` over two columns of a `sales` source instead of hard-coded arrays, and the result pins which rows produced it. See [Connect your data](../connect-data.md) and the binding spec in [Compute & filtering](../compute-and-filtering.md#compute-over-connected-data).

## The other "inference": LLM serving packs

This topic cluster is keyed on the word _inference_, so alongside statistical inference it gathers three packs about **running models** — cost, scheduling, and safety of an inference server. They are deterministic capabilities like the rest, just a different domain; reach for them when you're operating an LLM, not when you're reasoning about a sample.

**Cost & latency** — `inference_cost_latency`

| Capability | What it computes |
|---|---|
| `inference_cost_latency.attention_flops` | Attention flops |
| `inference_cost_latency.decode_latency_estimate` | Decode latency estimate |
| `inference_cost_latency.completion_token_estimate` | Completion token estimate |
| `inference_cost_latency.batch_efficiency_estimate` | Batch efficiency estimate |
| `inference_cost_latency.cost_latency_frontier_score` | Cost latency frontier score |

**Engine & scheduling** — `inference_engine`

| Capability | What it computes |
|---|---|
| `inference_engine.continuous_batching_capacity` | Maximum in-flight tokens for continuous batching |
| `inference_engine.dynamic_batching_priority` | Priority score for dynamic batching scheduler |
| `inference_engine.decode_time_per_token` | Decode step time per token (ms) |
| `inference_engine.kv_cache_hit_ratio` | KV-cache hit ratio for prefix caching |
| `inference_engine.batch_padding_mask` | Padding mask: 1.0 if valid token, 0.0 if padding |

**Serving security** — `inference_security`

| Capability | What it computes |
|---|---|
| `inference_security.jailbreak_pattern_score` | Jailbreak attempt detection score |
| `inference_security.adversarial_input_score` | Adversarial perturbation detection based on input perplexity spike |
| `inference_security.output_toxicity_estimate` | Estimated toxicity of generated output |
| `inference_security.data_leakage_risk_score` | Risk of training data memorisation leaking in output |
| `inference_security.pii_token_risk` | PII exposure risk for a generated token |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const sqai = createSQAI({ runtimeModules: ["inference_engine"] });

// Prefix-cache hit ratio for a serving workload
await sqai.compute({
  module: "inference_engine",
  function: "kv_cache_hit_ratio",
  args: [/* cached tokens, total tokens */ 384, 512],
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
sqai = SQAI(runtime_modules=["inference_engine"])

# Prefix-cache hit ratio for a serving workload
sqai.compute(
    module="inference_engine",
    function="kv_cache_hit_ratio",
    args=[384, 512],  # cached tokens, total tokens
)
```
{% endtab %}
{% endtabs %}

{% hint style="info" %}
Names, summaries, and exact signatures come from the contract itself. `searchCapabilities` (Python `search_capabilities`) ranks and returns the real entries — search before you `compute`, and set `runtimeModules` to only the namespaces you found.
{% endhint %}

## Next steps

<table data-view="cards">
<thead><tr><th></th><th></th><th data-hidden data-card-target data-type="content-ref"></th></tr></thead>
<tbody>
<tr><td><strong>Compute &#38; filtering</strong></td><td>The full <code>compute()</code> spec, <code>runtimeModules</code>, and binding arguments to connected columns.</td><td><a href="../compute-and-filtering.md">compute-and-filtering.md</a></td></tr>
<tr><td><strong>Determinism &#38; provenance</strong></td><td>What every hash on a p-value means, seeded simulations, and how a test replays.</td><td><a href="../determinism.md">determinism.md</a></td></tr>
<tr><td><strong>Connect your data</strong></td><td>Sources you can bind a test to — files, SQLite, and private SQAI databases.</td><td><a href="../connect-data.md">connect-data.md</a></td></tr>
<tr><td><strong>Vercel AI SDK tool</strong></td><td>Expose these tests to an agent as a validated, governed tool.</td><td><a href="../ai-sdk-tools.md">ai-sdk-tools.md</a></td></tr>
</tbody>
</table>
