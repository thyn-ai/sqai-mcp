---
icon: diagram-project
description: 192 discrete-structure capabilities across 17 modules — graph traversal and shortest paths, heaps, interval arithmetic, Petri nets, and number theory — each an exact, hash-pinned result.
---

# Graphs, trees & number theory

This cluster is the discrete-mathematics side of the compute plane: **192 read-only capabilities across 17 modules** for the structures that don't reduce to a matrix or a distribution — graphs, heaps and trees, intervals, concurrency nets, and integer arithmetic. These are the algorithms an agent reaches for when the answer is a traversal order, a shortest path, a set of components, a token marking, or a number-theoretic fact — not a float.

Almost all of it is **integer- or structure-valued**, which makes it the cleanest corner of the runtime to reason about: no rounding, no reduction-order ambiguity, so the `computation_hash` is a pure function of the inputs. Every call runs on the signed on-device runtime — no cloud, on your machine, no data leaves it — and returns the value plus the hashes that reproduce it. Names below are `module.function`; the summaries are the real one-liners `searchCapabilities` returns.

{% hint style="info" %}
New to compute? [Compute & filtering](../compute-and-filtering.md) covers the `ComputationSpec`, `runtimeModules`, and bindings; [Determinism & provenance](../determinism.md) explains every hash on a result. This page assumes both.
{% endhint %}

## Graph algorithms

The `graph` module builds a weighted directed graph and runs the classic traversals and shortest-path search over it. Traversals return an ordering; `dijkstra` returns distances; `connected_components` reads the graph as undirected.

| Capability | What it computes |
|---|---|
| `graph.algorithms.graph_add_edge` | Add a directed edge from from_node to to_node with given weight |
| `graph.algorithms.bfs` | Breadth-first traversal order starting from source |
| `graph.algorithms.dfs` | Depth-first traversal order starting from source (iterative) |
| `graph.algorithms.dijkstra` | Dijkstra's shortest path algorithm from source node |
| `graph.algorithms.connected_components` | Find connected components treating the graph as undirected |

A graph is passed as an adjacency structure — each node mapped to its `[neighbor, weight]` edges. `bfs` and `dijkstra` take that graph plus a source node; `connected_components` takes the graph alone.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
import { createSQAI } from "@thyn-ai/sqai";

const sqai = createSQAI({ runtimeModules: ["graph"] });

// A weighted, directed adjacency map: node -> [[neighbor, weight], ...]
const g = {
  A: [["B", 7], ["C", 9]],
  B: [["C", 10], ["D", 15]],
  C: [["D", 11]],
  D: [],
};

// Breadth-first order from A — returns the visit sequence, e.g. ["A","B","C","D"].
const order = await sqai.compute({
  module: "graph",
  function: "algorithms.bfs",
  args: [g, "A"],
});

// Shortest-path distances from A — returns the distance to each reachable node.
const dist = await sqai.compute({
  module: "graph",
  function: "algorithms.dijkstra",
  args: [g, "A"],
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
from sqai import SQAI

sqai = SQAI(runtime_modules=["graph"])

# A weighted, directed adjacency map: node -> [[neighbor, weight], ...]
g = {
    "A": [["B", 7], ["C", 9]],
    "B": [["C", 10], ["D", 15]],
    "C": [["D", 11]],
    "D": [],
}

# Breadth-first order from A — returns the visit sequence, e.g. ["A","B","C","D"].
order = sqai.compute(module="graph", function="algorithms.bfs", args=[g, "A"])

# Shortest-path distances from A — returns the distance to each reachable node.
dist = sqai.compute(module="graph", function="algorithms.dijkstra", args=[g, "A"])

print(order["value"], dist["value"])
```
{% endtab %}
{% endtabs %}

{% hint style="info" %}
`graph.algorithms.graph_add_edge` returns an updated adjacency structure, not a mutation — feed its `value` into the next call. `connected_components` ignores edge direction, so it groups nodes that are mutually reachable in the underlying undirected graph.
{% endhint %}

## Heaps & priority queues

The `heap` module is a binary-heap toolkit backing priority queues, scheduling, and streaming top-k. Both polarities are first-class — `_max` and `_min` variants — and each operation returns a value, a new heap, or both, so a heap threads cleanly through successive `compute()` calls.

| Capability | What it computes |
|---|---|
| `heap.heap_push_max` | Push value onto max-heap, maintaining heap property |
| `heap.heap_pop_max` | Pop and return maximum from max-heap |
| `heap.heap_pop_min` | Pop and return minimum from min-heap |
| `heap.heap_peek_max` | View maximum element without removing |
| `heap.heap_peek_min` | View minimum element without removing |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const sqai = createSQAI({ runtimeModules: ["heap"] });

// Push onto a max-heap — returns the reheapified array with the new element placed.
const pushed = await sqai.compute({
  module: "heap",
  function: "heap_push_max",
  args: [[9, 7, 3], 12],
});

// Peek the max without removing — returns the largest element, heap unchanged.
const top = await sqai.compute({
  module: "heap",
  function: "heap_peek_max",
  args: [pushed.value],
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
sqai = SQAI(runtime_modules=["heap"])

# Push onto a max-heap — returns the reheapified array with the new element placed.
pushed = sqai.compute(module="heap", function="heap_push_max", args=[[9, 7, 3], 12])

# Peek the max without removing — returns the largest element, heap unchanged.
top = sqai.compute(module="heap", function="heap_peek_max", args=[pushed["value"]])
```
{% endtab %}
{% endtabs %}

{% hint style="info" %}
`heap_peek_max` / `heap_peek_min` are pure reads — same heap, same value, same hash. The `_pop_` variants return the extremum together with the smaller heap that remains, so a priority-queue drain is a fold of `compute()` calls, each one independently replayable.
{% endhint %}

## Interval arithmetic

The `interval` module does rigorous arithmetic over closed ranges `[lo, hi]` — the foundation for uncertainty propagation, guaranteed bounds, and constraint solving. Operations follow the standard interval rules, so results are the tightest sound bound rather than a point estimate.

| Capability | What it computes |
|---|---|
| `interval.interval` | Create interval [lo, hi] |
| `interval.empty_interval` | Create an empty interval |
| `interval.interval_add` | Add two intervals: [a.lo+b.lo, a.hi+b.hi] |
| `interval.interval_div` | Divide intervals: a * [1/b.hi, 1/b.lo] |
| `interval.interval_contains` | Check if x ∈ [lo, hi] |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const sqai = createSQAI({ runtimeModules: ["interval"] });

// Sum of two ranges — returns [a.lo+b.lo, a.hi+b.hi], here the bound on [2,5]+[1,3].
const sum = await sqai.compute({
  module: "interval",
  function: "interval_add",
  args: [[2, 5], [1, 3]],
});

// Membership test — returns a boolean: is 4 inside [2, 5]?
const inside = await sqai.compute({
  module: "interval",
  function: "interval_contains",
  args: [[2, 5], 4],
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
sqai = SQAI(runtime_modules=["interval"])

# Sum of two ranges — returns [a.lo+b.lo, a.hi+b.hi], here the bound on [2,5]+[1,3].
total = sqai.compute(module="interval", function="interval_add", args=[[2, 5], [1, 3]])

# Membership test — returns a boolean: is 4 inside [2, 5]?
inside = sqai.compute(module="interval", function="interval_contains", args=[[2, 5], 4])

print(total["value"], inside["value"])
```
{% endtab %}
{% endtabs %}

{% hint style="warning" %}
`interval_div` widens by construction — dividing by a range that straddles zero has no finite bound, and the tightest sound result may be an empty or unbounded interval rather than a number. Treat the return as a guaranteed enclosure, not a scalar. Build inputs with `interval.interval`; use `interval.empty_interval` for the identity of a range that has been fully constrained away.
{% endhint %}

## Petri nets

The `petri_net` module models concurrent, token-based systems — the formalism behind workflow engines, protocol checkers, and resource schedulers. A state is a *marking* (tokens per place); firing a transition moves tokens according to input and output weights. The pack covers firing, the incidence relation, coverability, and deadlock detection.

| Capability | What it computes |
|---|---|
| `petri_net.fire_transition_list` | Fire transition: subtract inputs, add outputs |
| `petri_net.fire_transition_2p` | Fire transition in 2-place net |
| `petri_net.incidence_value` | Net effect of transition on a place = output_weight - input_weight |
| `petri_net.coverability_check` | Check if marking covers (>=) target for a single place |
| `petri_net.is_deadlocked_1t_2p` | Check deadlock for 1-transition 2-place net |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const sqai = createSQAI({ runtimeModules: ["petri_net"] });

// Fire a transition — subtract input weights, add output weights, return the new marking.
const next = await sqai.compute({
  module: "petri_net",
  function: "fire_transition_list",
  args: [[2, 1, 0], [1, 0, 0], [0, 1, 1]], // marking, inputs, outputs
});

// Coverability — returns a boolean: does the marking meet-or-exceed the target at a place?
const covers = await sqai.compute({
  module: "petri_net",
  function: "coverability_check",
  args: [next.value, [0, 2, 1]],
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
sqai = SQAI(runtime_modules=["petri_net"])

# Fire a transition — subtract input weights, add output weights, return the new marking.
nxt = sqai.compute(
    module="petri_net",
    function="fire_transition_list",
    args=[[2, 1, 0], [1, 0, 0], [0, 1, 1]],  # marking, inputs, outputs
)

# Coverability — returns a boolean: does the marking meet-or-exceed the target at a place?
covers = sqai.compute(
    module="petri_net", function="coverability_check", args=[nxt["value"], [0, 2, 1]]
)
```
{% endtab %}
{% endtabs %}

{% hint style="info" %}
`incidence_value` gives the per-place net effect (`output_weight - input_weight`) — the column of the incidence matrix you assemble reachability arguments from. The `_2p` / `_1t_2p` variants are closed-form checks for the small nets that appear inside larger analyses.
{% endhint %}

## Number theory

The `number_theory` module is exact integer arithmetic — GCDs, the extended Euclidean algorithm, coprimality, Euler's totient, and Fibonacci. These underpin modular arithmetic, RSA-style key math, hashing, and combinatorial identities, and because they are pure integer operations the result is exact for every input in range.

| Capability | What it computes |
|---|---|
| `number_theory.gcd` | Greatest common divisor via Euclidean algorithm |
| `number_theory.extended_gcd` | Returns [gcd, x, y] where a*x + b*y = gcd(a, b) |
| `number_theory.is_coprime` | True if gcd(a, b) == 1 |
| `number_theory.euler_totient` | Euler's totient φ(n) by trial division |
| `number_theory.fibonacci` | Nth Fibonacci number (iterative) |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const sqai = createSQAI({ runtimeModules: ["number_theory"] });

// Extended Euclid — returns [gcd, x, y] satisfying 240*x + 46*y = gcd(240, 46).
const bezout = await sqai.compute({
  module: "number_theory",
  function: "extended_gcd",
  args: [240, 46],
});

// Euler's totient — returns the count of integers in [1, n] coprime to n.
const phi = await sqai.compute({
  module: "number_theory",
  function: "euler_totient",
  args: [36],
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
sqai = SQAI(runtime_modules=["number_theory"])

# Extended Euclid — returns [gcd, x, y] satisfying 240*x + 46*y = gcd(240, 46).
bezout = sqai.compute(module="number_theory", function="extended_gcd", args=[240, 46])

# Euler's totient — returns the count of integers in [1, n] coprime to n.
phi = sqai.compute(module="number_theory", function="euler_totient", args=[36])

print(bezout["value"], phi["value"])
```
{% endtab %}
{% endtabs %}

{% hint style="success" %}
Integer results are the strongest case for the determinism guarantee: no `precision_mode` rounding, no reduction order to fix — `number_theory.gcd(48, 180)` yields the same value and the same `computation_hash` in TypeScript and Python, on every scope that carries the same `contract_hash`. See [Determinism & provenance](../determinism.md).
{% endhint %}

## Adjacent applied-science packs

The cluster also gathers three formula-dense science modules whose math sits next to the discrete work above — coordinate geometry, lattice geometry, and population accounting. Each capability is a named, hash-pinned formula, not a handwritten expression.

**Cartography** — map projections, bearings, and great-circle geometry.

| Capability | What it computes |
|---|---|
| `cartography.great_circle_distance` | Great circle distance using spherical law of cosines |
| `cartography.equirectangular_x` | Equirectangular projection x: x = (lon - central_meridian) * cos(lat) |
| `cartography.equirectangular_y` | Equirectangular projection y: y = latitude (identity mapping) |
| `cartography.declination_correction` | Correct magnetic bearing for declination: True = bearing + declination |
| `cartography.contour_interval_suggestion` | Suggest contour interval: CI = elevation_range / n_contours |

**Crystallography** — lattice spacing, diffraction angles, and packing.

| Capability | What it computes |
|---|---|
| `crystallography.d_spacing_cubic` | Cubic d-spacing: d = a / sqrt(h²+k²+l²) |
| `crystallography.bragg_angle` | Bragg angle: θ = asin(nλ/(2d)) |
| `crystallography.atomic_packing_factor_bcc` | BCC atomic packing factor: APF = π√3/8 ≈ 0.6802 |
| `crystallography.atomic_packing_factor_fcc` | FCC atomic packing factor: APF = π√2/6 ≈ 0.7405 |
| `crystallography.density_from_crystal` | Crystal density: ρ = Z*M/(Na*V) |

**Demographics** — vital rates and population dynamics.

| Capability | What it computes |
|---|---|
| `demographics.crude_birth_rate` | Crude birth rate: CBR = births / population * 1000 |
| `demographics.crude_death_rate` | Crude death rate: CDR = deaths / population * 1000 |
| `demographics.dependency_ratio` | Dependency ratio: DR = (young + old) / working_age * 100 |
| `demographics.doubling_time` | Doubling time (rule of 70): DT = 70 / growth_rate_pct (years) |
| `demographics.infant_mortality_rate` | Infant mortality rate: IMR = infant_deaths / live_births * 1000 |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const sqai = createSQAI({ runtimeModules: ["cartography"] });

// Great-circle distance between two lat/lon points via the spherical law of cosines.
const d = await sqai.compute({
  module: "cartography",
  function: "great_circle_distance",
  args: [51.5074, -0.1278, 48.8566, 2.3522], // London → Paris (lat, lon)
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
sqai = SQAI(runtime_modules=["cartography"])

# Great-circle distance between two lat/lon points via the spherical law of cosines.
d = sqai.compute(
    module="cartography",
    function="great_circle_distance",
    args=[51.5074, -0.1278, 48.8566, 2.3522],  # London → Paris (lat, lon)
)
```
{% endtab %}
{% endtabs %}

## More in this cluster

The 192 capabilities span **17 modules**. Alongside the packs above, the cluster carries more graph- and tree-shaped work you discover the same way:

- `graph_algorithms`, `graph_compiler`, `graph_decision` — further graph traversal, IR/compiler-graph, and decision-graph capabilities.
- `autograd_graph` — reverse-mode computation-graph primitives.
- `regression_tree` — tree-structured regression.
- `combinatorial` — counting and enumeration.
- `chromatography`, `oceanography`, `stratigraphy` — additional applied-science neighbors.

Don't guess names — search the embedded contract in-process. `searchCapabilities(query, limit = 10)` ranks by token overlap over name, category, and summary, reads the contract with no runtime or key, and returns each capability's real one-line `summary`. Search sees the whole contract; a filtered runtime only executes the modules you named in `runtimeModules`.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
sqai.searchCapabilities("shortest path graph", 5)
  .map((m) => `${m.entry.name} — ${m.entry.summary}`);
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
[f"{m['entry']['name']} — {m['entry']['summary']}"
 for m in sqai.search_capabilities("shortest path graph", 5)]
```
{% endtab %}
{% endtabs %}

{% hint style="info" %}
Search first, then set `runtimeModules` to exactly the packs you call — e.g. `["graph", "heap", "number_theory"]`. The build service compiles and signs a bundle for that filter, cached by filter-hash; a `compute()` against a module outside the filter has nothing to dispatch to. See [Compute & filtering](../compute-and-filtering.md).
{% endhint %}

## Next steps

<table data-view="cards">
<thead><tr><th></th><th></th><th data-hidden data-card-target data-type="content-ref"></th></tr></thead>
<tbody>
<tr><td><strong>Compute &#38; filtering</strong></td><td>The full <code>ComputationSpec</code>, <code>runtimeModules</code>, and column bindings.</td><td><a href="../compute-and-filtering.md">compute-and-filtering.md</a></td></tr>
<tr><td><strong>Determinism &#38; provenance</strong></td><td>What every hash means, and why integer results replay bit-for-bit.</td><td><a href="../determinism.md">determinism.md</a></td></tr>
<tr><td><strong>Optimization &#38; OR</strong></td><td>Linear programming, allocation, and search that pairs with graph work.</td><td><a href="optimization.md">optimization.md</a></td></tr>
<tr><td><strong>Applied science domains</strong></td><td>The wider pack of engineering and science capabilities.</td><td><a href="science-domains.md">science-domains.md</a></td></tr>
</tbody>
</table>
