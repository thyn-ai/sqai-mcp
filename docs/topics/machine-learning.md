---
icon: robot
description: 114 read-only capabilities for embeddings, classifiers, clustering, model-evaluation metrics, and psychometrics — every score hash-pinned and byte-identical across the TypeScript and Python SDKs.
---

# Machine learning & metrics

This pack is the deterministic scoring layer for anything model-shaped: the vector math that powers retrieval and clustering, the classification and ranking metrics you report a model against, the cluster-quality indices you validate an unsupervised run with, psychometric item analysis, and the counters that meter a serving loop. **114 read-only capabilities across seven modules** — `ml`, `embeddings`, `ml_metrics_extended`, `clustering_metrics`, `psychometrics`, `decision_ml_fusion`, and `metrics_agg`.

None of these train a model or touch the network. They are named, hash-pinned capabilities — never handwritten formulas — that take typed arguments, run on the signed on-device runtime, and return the value plus the hashes that reproduce it. That is the point: a metric an agent reports, or a similarity score that gates a decision, is worthless if it drifts. Here `embeddings.cosine_similarity(a, b)` and `ml_metrics_extended.cohen_kappa(p_o, p_e)` yield the same value and the same `computation_hash` on every run, in either SDK.

{% hint style="info" %}
New to compute? [Compute & filtering](../compute-and-filtering.md) covers the `compute()` call shape and `runtimeModules`; [Determinism & provenance](../determinism.md) explains every hash a result carries. Module names below are `module.function`; summaries are the real one-liners `searchCapabilities` returns.
{% endhint %}

## Embeddings, classifiers & distances

The vector primitives. `embeddings.*` is the similarity toolkit you build retrieval, dedup, and nearest-neighbor logic on; `ml.classifiers.*` adds the classic estimators and the sigmoid link.

**Embeddings & similarity**

| Capability | What it computes |
|---|---|
| `embeddings.cosine_similarity` | Cosine similarity between two vectors |
| `embeddings.cosine_similarity_matrix` | NxN cosine similarity matrix |
| `embeddings.dot_product` | Dot product of two vectors |
| `embeddings.euclidean_distance` | L2 (Euclidean) distance between two vectors |
| `embeddings.centroid` | Mean of vectors (centroid) |

**Classifiers & distances**

| Capability | What it computes |
|---|---|
| `ml.classifiers.cosine_similarity` | Cosine similarity: dot(a,b) / (\|\|a\|\| * \|\|b\|\|) |
| `ml.classifiers.euclidean_distance` | Euclidean (L2) distance between two vectors |
| `ml.classifiers.knn_predict` | K-nearest neighbors prediction (majority vote for classification) |
| `ml.classifiers.kmeans_cluster` | K-means clustering (Lloyd's algorithm) |
| `ml.classifiers.logistic_sigmoid` | Logistic sigmoid: σ(x) = 1 / (1 + exp(-x)) |

`embeddings.cosine_similarity` takes two equal-length vectors and returns a scalar in `[-1, 1]`; `cosine_similarity_matrix` takes a list of vectors and returns the full N×N matrix, ready to feed a threshold or a top-k.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
import { createSQAI } from "@thyn-ai/sqai";

const sqai = createSQAI({ runtimeModules: ["embeddings", "ml"] });

await sqai.compute({
  module: "embeddings",
  function: "cosine_similarity",
  args: [
    [0.12, 0.87, 0.44, 0.05], // query embedding
    [0.10, 0.90, 0.40, 0.02], // candidate embedding
  ],
});
// → a scalar in [-1, 1], plus invocation_hash / computation_hash
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
from sqai import SQAI

sqai = SQAI(runtime_modules=["embeddings", "ml"])

sqai.compute(
    module="embeddings",
    function="cosine_similarity",
    args=[
        [0.12, 0.87, 0.44, 0.05],  # query embedding
        [0.10, 0.90, 0.40, 0.02],  # candidate embedding
    ],
)
# → dict: the similarity value plus invocation_hash / computation_hash
```
{% endtab %}
{% endtabs %}

`ml.classifiers.kmeans_cluster` runs Lloyd's algorithm over a points matrix for a chosen `k` and returns the per-point cluster assignment; `knn_predict` takes labelled training points, a query, and `k`, and returns the majority-vote label.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
await sqai.compute({
  module: "ml.classifiers",
  function: "kmeans_cluster",
  args: [
    [[1.0, 1.1], [0.9, 1.2], [8.0, 8.1], [7.9, 8.3]], // points
    2,                                                 // k clusters
  ],
});
// → per-point cluster assignments (Lloyd's algorithm)
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
sqai.compute(
    module="ml.classifiers",
    function="kmeans_cluster",
    args=[
        [[1.0, 1.1], [0.9, 1.2], [8.0, 8.1], [7.9, 8.3]],  # points
        2,                                                  # k clusters
    ],
)
# → per-point cluster assignments (Lloyd's algorithm)
```
{% endtab %}
{% endtabs %}

## Classification & ranking metrics

`ml_metrics_extended.*` is the evaluation math you report a trained model against — calibration, ranking area, and agreement. Several are per-term contributions (one ROC segment, one AP term, one calibration bin, one sample), designed to be summed over your data so the running total stays hash-stable term by term.

| Capability | What it computes |
|---|---|
| `ml_metrics_extended.auc_trapezoid` | Trapezoidal rule AUC for one ROC segment |
| `ml_metrics_extended.average_precision_term` | One term in Average Precision sum: P(r) × ΔR |
| `ml_metrics_extended.brier_score_term` | Brier score term: (p - y)² for one sample |
| `ml_metrics_extended.calibration_ece_term` | Expected Calibration Error contribution for one confidence bin |
| `ml_metrics_extended.cohen_kappa` | Cohen's kappa: (p_o - p_e) / (1 - p_e) |

`cohen_kappa` takes observed agreement `p_o` and chance agreement `p_e` and returns the chance-corrected agreement; `brier_score_term` takes a predicted probability and the binary outcome and returns the squared error for that sample.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
await sqai.compute({
  module: "ml_metrics_extended",
  function: "cohen_kappa",
  args: [0.82, 0.55], // observed agreement, expected (chance) agreement
});
// → the chance-corrected agreement coefficient
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
sqai.compute(
    module="ml_metrics_extended",
    function="cohen_kappa",
    args=[0.82, 0.55],  # observed agreement, expected (chance) agreement
)
# → the chance-corrected agreement coefficient
```
{% endtab %}
{% endtabs %}

## Clustering evaluation

`clustering_metrics.*` scores an unsupervised result — both against ground-truth labels (ARI, contingency) and intrinsically (Calinski-Harabasz), plus the building blocks to inspect a partition.

| Capability | What it computes |
|---|---|
| `clustering_metrics.adjusted_rand_index` | Adjusted Rand Index: corrected-for-chance Rand index in [-1,1] |
| `clustering_metrics.calinski_harabasz` | Calinski-Harabasz index (higher is better) |
| `clustering_metrics.contingency_matrix` | Build a contingency table (n_true x n_pred) |
| `clustering_metrics.cluster_centroids` | Compute the centroid (mean) of each cluster |
| `clustering_metrics.cluster_sizes` | Count the number of items assigned to each cluster 0..k-1 |

`adjusted_rand_index` takes the true and predicted label vectors and returns a score in `[-1, 1]` where 1 is a perfect match and ~0 is chance — a clean pairing with the `kmeans_cluster` output above.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
await sqai.compute({
  module: "clustering_metrics",
  function: "adjusted_rand_index",
  args: [
    [0, 0, 1, 1, 2, 2], // true labels
    [0, 0, 1, 2, 2, 2], // predicted labels
  ],
});
// → chance-corrected agreement in [-1, 1]
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
sqai.compute(
    module="clustering_metrics",
    function="adjusted_rand_index",
    args=[
        [0, 0, 1, 1, 2, 2],  # true labels
        [0, 0, 1, 2, 2, 2],  # predicted labels
    ],
)
# → chance-corrected agreement in [-1, 1]
```
{% endtab %}
{% endtabs %}

## Psychometrics & item analysis

`psychometrics.*` covers test and survey analytics — reliability, item response theory, and classic item statistics — the same estimators used to validate an instrument or grade an item bank.

| Capability | What it computes |
|---|---|
| `psychometrics.cronbach_alpha` | Cronbach's α = (n/(n-1)) * (1 - Σσi²/σt²) |
| `psychometrics.irt_1pl_probability` | 1PL IRT: P(θ) = 1 / (1 + exp(-(θ - b))) |
| `psychometrics.irt_2pl_probability` | 2PL IRT: P(θ) = 1 / (1 + exp(-a*(θ - b))) |
| `psychometrics.item_difficulty` | Item difficulty: p = correct / total |
| `psychometrics.item_discrimination` | Item discrimination: D = p_upper - p_lower |

`irt_2pl_probability` returns the probability a respondent of ability `θ` answers an item correctly given its discrimination `a` and difficulty `b`; `cronbach_alpha` takes the item-score matrix and returns the reliability coefficient.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
await sqai.compute({
  module: "psychometrics",
  function: "irt_2pl_probability",
  args: [1.2, 1.5, 0.3], // ability θ, discrimination a, difficulty b
});
// → P(correct response) in (0, 1)
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
sqai.compute(
    module="psychometrics",
    function="irt_2pl_probability",
    args=[1.2, 1.5, 0.3],  # ability θ, discrimination a, difficulty b
)
# → P(correct response) in (0, 1)
```
{% endtab %}
{% endtabs %}

## Decision–ML fusion

`decision_ml_fusion.*` is the glue between a model's output and a downstream decision: exploration schedules, regret, confidence gating, and blending a model estimate with a prior. Use these when an agent must act on a prediction, not just report it.

| Capability | What it computes |
|---|---|
| `decision_ml_fusion.model_confidence_gate` | Gate decision on model confidence; fall back if uncertain |
| `decision_ml_fusion.expected_value_under_model` | Model-weighted expected value blending model and prior |
| `decision_ml_fusion.counterfactual_utility` | Counterfactual utility: regret vs best alternative |
| `decision_ml_fusion.adaptive_exploration_rate` | UCB1-style adaptive exploration rate |
| `decision_ml_fusion.ml_to_simulation_weight` | Map ML output probability to Monte Carlo simulation weight |

`expected_value_under_model` blends a model estimate with a prior by a weight and returns the fused expected value; `model_confidence_gate` returns the model's decision when confidence clears a threshold and the fallback otherwise — the deterministic core of a "trust the model, else defer" policy.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
await sqai.compute({
  module: "decision_ml_fusion",
  function: "expected_value_under_model",
  args: [0.72, 0.50, 0.8], // model estimate, prior, model weight
});
// → the weighted expected value blending model and prior
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
sqai.compute(
    module="decision_ml_fusion",
    function="expected_value_under_model",
    args=[0.72, 0.50, 0.8],  # model estimate, prior, model weight
)
# → the weighted expected value blending model and prior
```
{% endtab %}
{% endtabs %}

## Runtime metrics & counters

`metrics_agg.*` is the instrumentation layer — counters, gauges, and throughput — expressed as pure value transforms. `counter_create` returns a counter at 0; `counter_inc` returns the incremented counter; `counter_value` reads it; `gauge_set` returns the new gauge value. Because each is a deterministic function of its inputs, a metering pipeline built from them is replayable end to end.

| Capability | What it computes |
|---|---|
| `metrics_agg.compute_throughput` | Throughput = count / duration |
| `metrics_agg.counter_create` | Create a counter starting at 0 |
| `metrics_agg.counter_inc` | Increment counter by amount (default 1.0) |
| `metrics_agg.counter_value` | Get current counter value |
| `metrics_agg.gauge_set` | Set gauge and return new value |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
await sqai.compute({
  module: "metrics_agg",
  function: "compute_throughput",
  args: [1200, 4.0], // count, duration (seconds)
});
// → events per second
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
sqai.compute(
    module="metrics_agg",
    function="compute_throughput",
    args=[1200, 4.0],  # count, duration (seconds)
)
# → events per second
```
{% endtab %}
{% endtabs %}

## Discover, then filter to the packs you use

`searchCapabilities(query, limit=10)` ranks the exposed capabilities by token overlap over name, category, and summary. It reads the embedded contract in-process — no runtime, no key, no provision — so it is the fastest way to find the exact metric name before you call it.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
sqai.searchCapabilities("clustering quality index", 5)
  .map((m) => `${m.entry.name} — ${m.entry.summary}`);
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
[f"{m['entry']['name']} — {m['entry']['summary']}"
 for m in sqai.search_capabilities("clustering quality index", 5)]
```
{% endtab %}
{% endtabs %}

Once you know the packs you call, filter the installed runtime to exactly those modules. Search sees the whole contract; a filtered runtime only executes what you install, so set `runtimeModules` (or `SQAI_RUNTIME_MODULES`) to the ML packs you use and nothing else:

```bash
export SQAI_RUNTIME_MODULES="ml,embeddings,ml_metrics_extended,clustering_metrics,psychometrics"
```

{% hint style="info" %}
A `compute()` against a module outside your filter has nothing to dispatch to. Filtering changes *what is installed*, never *what a function returns* — `embeddings.cosine_similarity` yields the identical value and `computation_hash` whether the bundle carries two modules or all of them. See [Compute & filtering](../compute-and-filtering.md#build-on-provision-filtering) for the build-on-provision mechanics.
{% endhint %}

## Metrics over connected data

Bind an argument to a column of a connected source instead of passing a literal, and the runtime extracts the column in-process, dispatches, and records **provenance** — the source, fields, `schema_revision`, `row_count`, and per-binding `input_hash`. This is how you score real data: run `embeddings.centroid` over an embedding column, or a metric over a `predictions` column, and get a number pinned to the exact rows it read.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
await sqai.compute({
  module: "embeddings",
  function: "centroid",
  args: [{ source: "docs", column: "embedding" }], // bind to a column
});
// → result.provenance.bindings pins source, fields, schema_revision,
//   row_count, and input_hash behind the value
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
sqai.compute(
    module="embeddings",
    function="centroid",
    args=[{"source": "docs", "column": "embedding"}],  # bind to a column
)
# → result["provenance"]["bindings"] pins source, fields, schema_revision,
#   row_count, and input_hash behind the value
```
{% endtab %}
{% endtabs %}

Because identity binds the extracted column's `input_hash` — not just the column name — the same rows always reproduce the same result, and changed data produces a different, honestly different hash. See [Compute & filtering — compute over connected data](../compute-and-filtering.md#compute-over-connected-data) for the full binding spec.

## Every score is reproducible

Every result in this pack ships the determinism envelope: `invocation_hash` (known before execution), `computation_hash` (the full-fidelity replay key, known after), the `contract_hash` (`sha256:31247fb2…`), and the scope the value was produced in — `platform`, `precision_mode: "float64"`, `thread_count: 1`. Fixed precision and a single reduction order are what make a Cohen's kappa or a cosine similarity agree bit-for-bit across two runs, and byte-identical between the TypeScript and Python SDKs.

The canonical reference value for the shape of that envelope is `finance.npv(0.1, [-1000, 300, 420, 560, 680])` = `505.020148896933` (`invocation_hash` `b3ca3e92…`, `computation_hash` `b74f67d0…`). Every capability on this page returns the same structure around its own value.

{% hint style="success" %}
Reporting a metric to an agent or a dashboard? Carry the `computation_hash` with it. Anyone can re-run the identical call and assert the number by hash instead of trusting a screenshot — the whole reason these live on a governed runtime rather than in inline code.
{% endhint %}

## Next steps

<table data-view="cards">
<thead><tr><th></th><th></th><th data-hidden data-card-target data-type="content-ref"></th></tr></thead>
<tbody>
<tr><td><strong>Compute &#38; filtering</strong></td><td>The full call shape, <code>runtimeModules</code>, and binding compute to connected columns.</td><td><a href="../compute-and-filtering.md">compute-and-filtering.md</a></td></tr>
<tr><td><strong>Determinism &#38; provenance</strong></td><td>What every hash on a metric result means, and how a replay reproduces it.</td><td><a href="../determinism.md">determinism.md</a></td></tr>
<tr><td><strong>Linear algebra</strong></td><td>The tensor, matrix, and vector kernels these embeddings and clustering routines build on.</td><td><a href="linear-algebra.md">linear-algebra.md</a></td></tr>
<tr><td><strong>Statistics &#38; probability</strong></td><td>Distributions, hypothesis tests, and regression that pair with these metrics.</td><td><a href="statistics.md">statistics.md</a></td></tr>
</tbody>
</table>
