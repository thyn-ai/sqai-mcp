---
icon: sliders
description: 92 read-only, deterministic capabilities for optimization and operations research — LP and constraint solving, EOQ and queueing, line-search and gradient steps, and serving/search tuning — across 10 modules.
---

# Optimization & operations research

Optimization is where a decision has a *best* answer under constraints — the order quantity that minimizes inventory cost, the vertex of a feasible region that maximizes an objective, the step that most reduces a loss. SQAI's optimization pack turns those decisions into **named, hash-pinned capabilities** an agent can call: **92 read-only capabilities across 10 modules**, every one deterministic and reproducible. No cloud, on your machine — the runtime dispatches the call and returns the value plus the hashes that reproduce it, never handwritten formulas the model invented on the spot.

The pack spans classical operations research (EOQ, Little's Law, the assignment problem), 2-variable linear programming, constraint satisfaction, constrained nonlinear optimization, the building blocks of line-search and quasi-Newton solvers, first-order optimizer updates, and the latency/retrieval heuristics that tune LLM serving. All 92 are deterministic — same input, same value, same `computation_hash`, in TypeScript and Python alike.

{% hint style="info" %}
New to compute? [Compute & filtering](../compute-and-filtering.md) covers the full `compute()` spec, `runtimeModules` filtering, and binding capability arguments to connected data. Every hash on a result is explained in [Determinism & provenance](../determinism.md).
{% endhint %}

## The optimization pack

Ten modules, grouped by what they optimize:

| Module | For |
|---|---|
| `linear_programming` | 2-variable LP: solve, enumerate feasible vertices, feasibility checks, duality bounds |
| `constraint` | Constraint-satisfaction predicates and backtracking search — N-Queens, graph coloring, magic squares |
| `operations_research` | Inventory (EOQ), queueing (Little's Law), assignment cost |
| `optimization_constrained` | Penalty, barrier, and augmented-Lagrangian steps for constrained nonlinear problems |
| `scipy_optimize_ops` | Line-search and Newton-type building blocks — Armijo, BFGS, conjugate gradient, bisection |
| `optimizer_full` | First-order and quasi-Newton parameter updates — Adadelta, Adan, L-BFGS, Muon |
| `optimize` | General-purpose minimizers, e.g. `optimize.minimize_brent` (Brent's method on `[a, b]`) |
| `optimization_meta` | Meta-optimization helpers |
| `latency_optimizer` | LLM serving heuristics — early exit, layer/attention skipping, speculation, KV prefetch |
| `vector_search` | ANN index tuning and search scoring — HNSW, FAISS nprobe, distance bounds, beam search |

Names below are `module.function`; each summary is the real one-liner `searchCapabilities` returns. The calls are realistic; returns are described from each signature — run them locally to get the value and its hashes.

## Linear programming

Small, exact linear programs solved by vertex enumeration — no external solver, fully deterministic. Enumerate the feasible region's corners, test a candidate for feasibility, or maximize an objective directly.

| Capability | What it computes |
|---|---|
| `linear_programming.lp_solve_2var` | Solve 2-variable LP: maximize c·x subject to constraints |
| `linear_programming.enumerate_vertices_2d` | Find all feasible vertices for a 2-variable LP |
| `linear_programming.is_feasible` | Check if x satisfies Ax ≤ b and x ≥ 0 |
| `linear_programming.dual_value` | Weak duality bound: optimal primal value via vertex enumeration |
| `linear_programming.line_intersection_2d` | Solve a1·x + b1·y = c1, a2·x + b2·y = c2 |

Maximize `3x + 2y` subject to `x + y ≤ 4` and `x + 3y ≤ 6` (with `x, y ≥ 0`):

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
import { createSQAI } from "@thyn-ai/sqai";

const sqai = createSQAI({ runtimeModules: ["linear_programming"] });

// maximize c·x  s.t.  A x <= b,  x >= 0
const lp = await sqai.compute({
  module: "linear_programming",
  function: "lp_solve_2var",
  args: [[3, 2], [[1, 1], [1, 3]], [4, 6]],
});
// lp.value → the optimal vertex and objective value; lp.computation_hash replays it

// Is a candidate point feasible for the same constraint set?
const feasible = await sqai.compute({
  module: "linear_programming",
  function: "is_feasible",
  args: [[[1, 1], [1, 3]], [4, 6], [3, 1]],
});
// feasible.value → boolean
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
from sqai import create_sqai

sqai = create_sqai(runtime_modules=["linear_programming"])

# maximize c·x  s.t.  A x <= b,  x >= 0
lp = sqai.compute(
    module="linear_programming",
    function="lp_solve_2var",
    args=[[3, 2], [[1, 1], [1, 3]], [4, 6]],
)
# lp["value"] → the optimal vertex and objective value; lp["computation_hash"] replays it

# Is a candidate point feasible for the same constraint set?
feasible = sqai.compute(
    module="linear_programming",
    function="is_feasible",
    args=[[[1, 1], [1, 3]], [4, 6], [3, 1]],
)
# feasible["value"] → boolean
```
{% endtab %}
{% endtabs %}

`enumerate_vertices_2d` returns every corner of the feasible polygon for the same `A`, `b`; `dual_value` returns the weak-duality bound on the optimum; `line_intersection_2d` solves a 2×2 linear system for the crossing point of two constraint lines.

## Constraint satisfaction

Predicates and backtracking search for combinatorial feasibility — verify a candidate assignment, or count/search the solution space directly.

| Capability | What it computes |
|---|---|
| `constraint.all_different` | Check if all values in the list are unique |
| `constraint.n_queens_check` | Check if a queen placement is valid (no attacks) |
| `constraint.count_solutions_nqueens` | Count total solutions for N-Queens |
| `constraint.graph_coloring` | Color a graph with `n_colors` using backtracking |
| `constraint.magic_square_check` | Check if a square grid is a magic square |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const sqai = createSQAI({ runtimeModules: ["constraint"] });

// Can this graph (adjacency lists) be 3-colored?
const coloring = await sqai.compute({
  module: "constraint",
  function: "graph_coloring",
  args: [[[1, 2], [0, 2], [0, 1]], 3],
});
// coloring.value → a valid color assignment, or an empty result if none exists

// Count all N-Queens solutions for an 8×8 board
const solutions = await sqai.compute({
  module: "constraint",
  function: "count_solutions_nqueens",
  args: [8],
});
// solutions.value → total number of distinct solutions
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
sqai = create_sqai(runtime_modules=["constraint"])

# Can this graph (adjacency lists) be 3-colored?
coloring = sqai.compute(
    module="constraint",
    function="graph_coloring",
    args=[[[1, 2], [0, 2], [0, 1]], 3],
)
# coloring["value"] → a valid color assignment, or an empty result if none exists

# Count all N-Queens solutions for an 8×8 board
solutions = sqai.compute(
    module="constraint",
    function="count_solutions_nqueens",
    args=[8],
)
# solutions["value"] → total number of distinct solutions
```
{% endtab %}
{% endtabs %}

`all_different` is the classic uniqueness constraint over a list; `n_queens_check` validates one placement (no two queens attacking); `magic_square_check` verifies that every row, column, and diagonal of a grid sums to the same constant.

## Operations research: inventory & queueing

The textbook decision models — order sizing, waiting lines, and task assignment — as pinned capabilities.

| Capability | What it computes |
|---|---|
| `operations_research.eoq_quantity` | EOQ = √(2·D·S / H) — economic order quantity |
| `operations_research.eoq_total_cost` | TC = √(2·D·S·H) — total annual inventory cost at EOQ |
| `operations_research.little_law_l` | L = λ·W — expected number in system |
| `operations_research.little_law_w` | W = L / λ — expected time in system |
| `operations_research.assignment_cost_3` | Total assignment cost for 3 tasks (costs already matched) |

Annual demand `D = 12000` units, order cost `S = 75`, holding cost `H = 1.5` per unit-year; a queue receiving `λ = 45` arrivals per hour with mean wait `W = 0.5` hours:

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const sqai = createSQAI({ runtimeModules: ["operations_research"] });

// Economic order quantity and the total annual cost incurred at it
const eoq = await sqai.compute({
  module: "operations_research",
  function: "eoq_quantity",
  args: [12000, 75, 1.5],
});
// eoq.value → optimal order quantity (units)

// Little's Law: expected number of items in the system
const l = await sqai.compute({
  module: "operations_research",
  function: "little_law_l",
  args: [45, 0.5],
});
// l.value → expected number in system
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
sqai = create_sqai(runtime_modules=["operations_research"])

# Economic order quantity and the total annual cost incurred at it
eoq = sqai.compute(
    module="operations_research",
    function="eoq_quantity",
    args=[12000, 75, 1.5],
)
# eoq["value"] → optimal order quantity (units)

# Little's Law: expected number of items in the system
l = sqai.compute(
    module="operations_research",
    function="little_law_l",
    args=[45, 0.5],
)
# l["value"] → expected number in system
```
{% endtab %}
{% endtabs %}

`eoq_total_cost` returns the annual inventory cost at that order size; `little_law_w` inverts Little's Law to expected time in system; `assignment_cost_3` sums the cost of a 3-task assignment whose task-to-agent costs are already matched.

{% hint style="success" %}
These are prime candidates for [computing over connected data](../connect-data.md): bind `eoq_quantity`'s demand argument to a `demand` column of a source and the result records the exact `source_name`, `fields`, `row_count`, and `input_hash` it read — reproducible from the data, not just the literals.
{% endhint %}

## Constrained nonlinear optimization

The interior workings of constrained solvers — evaluate the objective and constraints, estimate a gradient, and take a barrier or augmented-Lagrangian step. Objectives and constraints are addressed by ID so a solver loop can drive them without shipping code.

| Capability | What it computes |
|---|---|
| `optimization_constrained.eval_objective_c` | Evaluate objective function by ID |
| `optimization_constrained.eval_constraint` | Evaluate constraint g(x) ≤ 0 by ID |
| `optimization_constrained.gradient_estimate` | Numerical gradient of penalized objective via central differences |
| `optimization_constrained.barrier_method` | Interior barrier: minimize f(x) − μ·Σ log(−g_i(x)) |
| `optimization_constrained.augmented_lagrangian_step` | One step of augmented Lagrangian |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const sqai = createSQAI({ runtimeModules: ["optimization_constrained"] });

// Evaluate the built-in objective #0 at a point
const f = await sqai.compute({
  module: "optimization_constrained",
  function: "eval_objective_c",
  args: [0, [1.0, 2.0]],
});
// f.value → objective value at x

// Central-difference gradient of the penalized objective at the same point
const grad = await sqai.compute({
  module: "optimization_constrained",
  function: "gradient_estimate",
  args: [0, [1.0, 2.0]],
});
// grad.value → gradient vector
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
sqai = create_sqai(runtime_modules=["optimization_constrained"])

# Evaluate the built-in objective #0 at a point
f = sqai.compute(
    module="optimization_constrained",
    function="eval_objective_c",
    args=[0, [1.0, 2.0]],
)
# f["value"] → objective value at x

# Central-difference gradient of the penalized objective at the same point
grad = sqai.compute(
    module="optimization_constrained",
    function="gradient_estimate",
    args=[0, [1.0, 2.0]],
)
# grad["value"] → gradient vector
```
{% endtab %}
{% endtabs %}

`eval_constraint` scores a constraint g(x) ≤ 0 by ID (feasible when the value is ≤ 0); `barrier_method` returns the interior-point objective for a given barrier parameter μ; `augmented_lagrangian_step` advances one Lagrangian iteration. For an unconstrained 1-D minimum, `optimize.minimize_brent` finds the minimizer of a function on an interval `[a, b]`.

## Line search & Newton-type steps

The scalar building blocks of gradient-based solvers — the pieces you compose into BFGS, conjugate gradient, or a custom line search. Each is one deterministic step, not a full solver, so you keep the loop.

| Capability | What it computes |
|---|---|
| `scipy_optimize_ops.armijo_condition` | Armijo sufficient decrease condition check |
| `scipy_optimize_ops.bisection_midpoint` | Bisection method midpoint |
| `scipy_optimize_ops.bfgs_hessian_update_term` | BFGS inverse-Hessian rank-1 update scalar |
| `scipy_optimize_ops.conjugate_gradient_beta_fr` | Fletcher-Reeves CG β coefficient |
| `scipy_optimize_ops.conjugate_gradient_beta_pr` | Polak-Ribière CG β coefficient (one dimension contribution) |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const sqai = createSQAI({ runtimeModules: ["scipy_optimize_ops"] });

// Does a trial step satisfy Armijo sufficient decrease?
const armijo = await sqai.compute({
  module: "scipy_optimize_ops",
  function: "armijo_condition",
  args: [8.6, 10.0, 0.5, -3.2, 1e-4], // f_new, f_old, alpha, grad·dir, c1
});
// armijo.value → boolean: accept the step or shrink it

// Fletcher-Reeves beta from successive gradient norms (squared)
const beta = await sqai.compute({
  module: "scipy_optimize_ops",
  function: "conjugate_gradient_beta_fr",
  args: [4.0, 9.0],
});
// beta.value → CG restart coefficient for the next search direction
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
sqai = create_sqai(runtime_modules=["scipy_optimize_ops"])

# Does a trial step satisfy Armijo sufficient decrease?
armijo = sqai.compute(
    module="scipy_optimize_ops",
    function="armijo_condition",
    args=[8.6, 10.0, 0.5, -3.2, 1e-4],  # f_new, f_old, alpha, grad·dir, c1
)
# armijo["value"] → boolean: accept the step or shrink it

# Fletcher-Reeves beta from successive gradient norms (squared)
beta = sqai.compute(
    module="scipy_optimize_ops",
    function="conjugate_gradient_beta_fr",
    args=[4.0, 9.0],
)
# beta["value"] → CG restart coefficient for the next search direction
```
{% endtab %}
{% endtabs %}

`bisection_midpoint` returns the interval midpoint for a bracketing root/line search; `bfgs_hessian_update_term` yields the scalar of the rank-1 inverse-Hessian update; `conjugate_gradient_beta_pr` contributes the Polak-Ribière β for one dimension.

## Gradient-based optimizers

Parameter-update rules from modern training — first-order adaptive methods through quasi-Newton and orthogonalized updates. Each returns the updated step for the state you pass in.

| Capability | What it computes |
|---|---|
| `optimizer_full.adadelta_update` | Adadelta parameter update |
| `optimizer_full.adan_update` | Adan (Adaptive Nesterov Momentum) update |
| `optimizer_full.gradient_centralization` | Gradient centralization: project gradient to have zero mean |
| `optimizer_full.lbfgs_two_loop_scale` | L-BFGS initial Hessian scaling: H₀ = (sᵀy)/(yᵀy) × I |
| `optimizer_full.muon_orthogonal_update` | Muon optimizer: orthogonalize gradient via Newton-Schulz |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const sqai = createSQAI({ runtimeModules: ["optimizer_full"] });

// Center a gradient to zero mean before the update
const centered = await sqai.compute({
  module: "optimizer_full",
  function: "gradient_centralization",
  args: [[0.4, -0.1, 0.7, -0.3]],
});
// centered.value → the mean-zero gradient

// L-BFGS initial inverse-Hessian scale from the latest (s, y) pair
const h0 = await sqai.compute({
  module: "optimizer_full",
  function: "lbfgs_two_loop_scale",
  args: [[0.02, -0.01, 0.03], [0.10, -0.04, 0.08]], // s, y
});
// h0.value → scalar scaling for H0 = (sᵀy)/(yᵀy)
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
sqai = create_sqai(runtime_modules=["optimizer_full"])

# Center a gradient to zero mean before the update
centered = sqai.compute(
    module="optimizer_full",
    function="gradient_centralization",
    args=[[0.4, -0.1, 0.7, -0.3]],
)
# centered["value"] → the mean-zero gradient

# L-BFGS initial inverse-Hessian scale from the latest (s, y) pair
h0 = sqai.compute(
    module="optimizer_full",
    function="lbfgs_two_loop_scale",
    args=[[0.02, -0.01, 0.03], [0.10, -0.04, 0.08]],  # s, y
)
# h0["value"] → scalar scaling for H0 = (sᵀy)/(yᵀy)
```
{% endtab %}
{% endtabs %}

`adadelta_update` and `adan_update` return the next parameter step for their respective adaptive rules; `muon_orthogonal_update` orthogonalizes the gradient via a Newton-Schulz iteration.

## Serving & search optimization

Optimization also means squeezing latency and recall out of a serving stack. Two modules cover it: `latency_optimizer` scores when to skip work in a transformer, and `vector_search` tunes approximate-nearest-neighbor indexes and search scoring.

**Latency heuristics**

| Capability | What it computes |
|---|---|
| `latency_optimizer.early_exit_confidence` | Confidence score for early exit from the transformer layer stack |
| `latency_optimizer.adaptive_depth_score` | Score for skipping remaining layers based on token difficulty and budget |
| `latency_optimizer.attention_skip_score` | Score for skipping attention in a layer (sliding-window proxy) |
| `latency_optimizer.async_speculation_gain` | Net gain from asynchronous speculative branching |
| `latency_optimizer.kv_prefetch_overlap` | Overlap fraction of KV prefetch with decode computation |

**ANN index & search tuning**

| Capability | What it computes |
|---|---|
| `vector_search.hnsw_search_ef_scale` | Recommended `ef` search parameter: max(ef_construction, k) |
| `vector_search.hnsw_layer_probability` | HNSW probability that a node exists at a given level |
| `vector_search.faiss_nprobe_coverage` | Approximate fraction of the index covered by `nprobe` lists |
| `vector_search.ann_distance_bound` | Triangle-inequality lower bound on query-to-point distance |
| `vector_search.beam_search_score` | Length-normalised beam search score |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const sqai = createSQAI({
  runtimeModules: ["vector_search", "latency_optimizer"],
});

// Recommended ef for an HNSW query given the index's ef_construction and top-k
const ef = await sqai.compute({
  module: "vector_search",
  function: "hnsw_search_ef_scale",
  args: [200, 10], // ef_construction, k
});
// ef.value → the ef search parameter to use

// Confidence that a token can exit the layer stack early
const exit = await sqai.compute({
  module: "latency_optimizer",
  function: "early_exit_confidence",
  args: [0.92, 0.15], // top-1 prob, margin
});
// exit.value → early-exit confidence score
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
sqai = create_sqai(runtime_modules=["vector_search", "latency_optimizer"])

# Recommended ef for an HNSW query given the index's ef_construction and top-k
ef = sqai.compute(
    module="vector_search",
    function="hnsw_search_ef_scale",
    args=[200, 10],  # ef_construction, k
)
# ef["value"] → the ef search parameter to use

# Confidence that a token can exit the layer stack early
exit = sqai.compute(
    module="latency_optimizer",
    function="early_exit_confidence",
    args=[0.92, 0.15],  # top-1 prob, margin
)
# exit["value"] → early-exit confidence score
```
{% endtab %}
{% endtabs %}

`faiss_nprobe_coverage` estimates recall for an IVF index at a given `nprobe`; `ann_distance_bound` gives a triangle-inequality lower bound to prune candidates; `beam_search_score` is the length-normalised score for ranking decode hypotheses.

## Discovery & filtering

You don't have to know a name up front. `searchCapabilities(query, limit=10)` ranks the exposed contract by token overlap over name, category, and summary, in-process — no runtime, no key, no provision.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
sqai.searchCapabilities("economic order quantity", 5)
  .map((m) => `${m.entry.name} — ${m.entry.summary}`);
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
[f"{m['entry']['name']} — {m['entry']['summary']}"
 for m in sqai.search_capabilities("economic order quantity", 5)]
```
{% endtab %}
{% endtabs %}

Search sees the whole contract; a filtered runtime only executes the modules you installed. Filter to just the optimization modules you call so the provisioned bundle stays small:

```bash
export SQAI_RUNTIME_MODULES="linear_programming,operations_research,optimization_constrained"
```

{% hint style="warning" %}
A `compute()` against a module outside your filter has nothing to dispatch to. Search first, then set `runtimeModules` (or `SQAI_RUNTIME_MODULES`) to the packs you actually call. Filtered bundles need a build service — set `SQAI_BUILD_SERVICE_URL`. See [Compute & filtering](../compute-and-filtering.md).
{% endhint %}

## Provenance on every result

These are optimization *decisions* — the kind you have to be able to defend later. Every `compute()` here carries the full determinism envelope: an `invocation_hash` known **before** execution, a `computation_hash` after it, the pinned `contract_hash` (`sha256:31247fb2…`), and the scope (`platform`, `precision_mode: "float64"`, `thread_count: 1`) the value was produced in. Re-run the same LP or EOQ call on the same scope and you get byte-identical hashes — in TypeScript and Python alike. Bind an argument to connected data and `provenance.bindings` additionally records the exact `source_name`, `fields`, `row_count`, and `input_hash` behind the number.

{% hint style="info" %}
All 92 capabilities in this pack are deterministic — none require a seed. The 10 seed-required simulations in the contract live in other domains; see [Determinism & provenance](../determinism.md) for how seeds are recorded and replayed.
{% endhint %}

## Next steps

<table data-view="cards">
<thead><tr><th></th><th></th><th data-hidden data-card-target data-type="content-ref"></th></tr></thead>
<tbody>
<tr><td><strong>Compute &#38; filtering</strong></td><td>The full <code>compute()</code> spec, <code>runtimeModules</code> filtering, and binding arguments to data.</td><td><a href="../compute-and-filtering.md">compute-and-filtering.md</a></td></tr>
<tr><td><strong>Determinism &#38; provenance</strong></td><td>What every hash on an optimization result means, and how they reproduce it.</td><td><a href="../determinism.md">determinism.md</a></td></tr>
<tr><td><strong>Linear algebra</strong></td><td>Matrices, decompositions, and vector kernels the solvers here build on.</td><td><a href="linear-algebra.md">linear-algebra.md</a></td></tr>
<tr><td><strong>Statistics &#38; probability</strong></td><td>Estimation, distributions, and tests that pair with optimization workflows.</td><td><a href="statistics.md">statistics.md</a></td></tr>
</tbody>
</table>
