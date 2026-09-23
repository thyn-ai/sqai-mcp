---
icon: table-cells
description: 128 read-only capabilities for tensors, matrices, decompositions, and vector search — every call typed, deterministic, and hash-pinned, on your machine.
---

# Linear algebra & tensors

This is the numerical core of the compute plane: **128 read-only capabilities** for building and combining tensors, doing exact matrix arithmetic, factoring and solving systems, and scoring dense or sparse vectors for retrieval. It is the layer an agent reaches for when a question needs a determinant, an orthogonalization, a Cholesky factor, a cosine similarity, or an ANN bound — not a hand-written formula in a prompt, but a named, versioned capability that returns the value plus the hashes that reproduce it.

Everything here runs on the signed on-device runtime — no cloud, on your machine, no data leaves it — and every one of the 128 is **deterministic**: fixed `float64` precision, a single reduction order (`thread_count: 1`), same input ⇒ same `computation_hash`, byte-for-byte, in TypeScript and Python alike. None of them take a seed.

The pack spans ten modules:

| Module | Covers |
|---|---|
| `tensor` | N-D array construction, element-wise math, reductions, comparisons |
| `tensor_ops` | The per-element primitives behind matmul, outer products, broadcasting, softmax |
| `linalg` | Matrix construction and core operations — add, multiply, determinant, inverse, 2×2 eigenvalues |
| `linalg_ext` | Extended dense linear-algebra routines |
| `matrix_ops` | Products and structural tests — Hadamard, Kronecker, commutator, Gram-Schmidt, orthogonality |
| `matrix_decomp` | Decompositions and solvers — Cholesky, back-substitution, small determinants and eigensystems |
| `vector_kernels` | 64-dim Float32 dot / cosine / norm kernels and the batch ranker |
| `sparse_vector` | Sparse representation, arithmetic, and similarity |
| `vector_search` | ANN math — distance bounds, HNSW / FAISS parameters, beam scoring |
| `vector_similarity` | Similarity measures over dense vectors |

{% hint style="info" %}
Names are `module.function`. Every summary below is the real one-liner `searchCapabilities` returns. Search the whole contract first, then set [`runtimeModules`](../compute-and-filtering.md#build-on-provision-filtering) to the modules you actually call — a `compute()` against a module outside your filter has nothing to dispatch to.
{% endhint %}

## Dense tensors

`tensor` is the array layer: create, transform, compare, reduce. `tensor_ops` exposes the numerically careful per-element steps that higher-level ops are built from — useful when you want to place one accumulation or broadcast decision under provenance rather than a whole kernel.

| Capability | What it computes |
|---|---|
| `tensor.arange` | Create a 1D tensor with values from start to stop (exclusive) by step |
| `tensor.add` | Element-wise addition |
| `tensor.apply_fn` | Apply a named function element-wise |
| `tensor.argmax` | Index of the maximum element |
| `tensor.allclose` | Check if two tensors are element-wise close within tolerance |
| `tensor_ops.flatten_index` | 2D row-major flat index: row × n_cols + col |
| `tensor_ops.broadcast_index` | NumPy-style broadcast: map index to 0 if dim_size == 1 |
| `tensor_ops.matmul_element` | One accumulation step in matrix multiplication C = A × B |
| `tensor_ops.outer_product_element` | Outer product element: (a ⊗ b)[i,j] = a_i × b_j |
| `tensor_ops.softmax_stable_element` | Numerically stable softmax element: exp(x_i − max) / Σexp(x_j − max) |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
import { createSQAI } from "@thyn-ai/sqai";
const sqai = createSQAI();

// arange(0, 10, 2) -> a 1D tensor [0, 2, 4, 6, 8]
const seq = await sqai.compute({
  module: "tensor",
  function: "arange",
  args: [0, 10, 2],
});
seq.value; // the tensor; seq.computation_hash pins it

// argmax over a vector -> the index of its largest element
const peak = await sqai.compute({
  module: "tensor",
  function: "argmax",
  args: [[3, 1, 4, 1, 5, 9, 2, 6]],
});

// allclose(a, b, tol) -> a boolean, within the given tolerance
const same = await sqai.compute({
  module: "tensor",
  function: "allclose",
  args: [[1.0, 2.0], [1.0, 2.0000001], 1e-6],
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
from sqai import create_sqai
sqai = create_sqai()

# arange(0, 10, 2) -> a 1D tensor [0, 2, 4, 6, 8]
seq = sqai.compute(module="tensor", function="arange", args=[0, 10, 2])
seq["value"]            # the tensor; seq["computation_hash"] pins it

# argmax over a vector -> the index of its largest element
peak = sqai.compute(module="tensor", function="argmax",
                    args=[[3, 1, 4, 1, 5, 9, 2, 6]])

# allclose(a, b, tol) -> a boolean, within the given tolerance
same = sqai.compute(module="tensor", function="allclose",
                    args=[[1.0, 2.0], [1.0, 2.0000001], 1e-6])
```
{% endtab %}
{% endtabs %}

`tensor.apply_fn` applies a named element-wise function across a tensor (the function is a contract-level name, never model-supplied code). The `tensor_ops.*` primitives return a single scalar or index each — one softmax element, one matmul accumulation, one broadcast mapping — so you can hash a step, not just a result.

## Matrices: construct, combine, test

`linalg` builds matrices and does the core arithmetic; `matrix_ops` supplies the products and structural checks that show up in physics, graphics, and orthogonalization.

| Capability | What it computes |
|---|---|
| `linalg.mat_from_list` | Create matrix from row-major flat list |
| `linalg.mat_identity` | Create an n×n identity matrix |
| `linalg.mat_add` | Element-wise addition |
| `linalg.mat_mul` | Matrix multiplication: C = A × B |
| `linalg.mat_inv` | Matrix inverse using Gauss-Jordan elimination with partial pivoting |
| `linalg.mat_det` | Determinant of a square matrix |
| `linalg.mat_eigenvalues_2x2` | Eigenvalues of a 2×2 matrix using the quadratic formula |
| `matrix_ops.hadamard_product` | Element-wise (Hadamard) product A ∘ B |
| `matrix_ops.kronecker_product` | Kronecker/tensor product A ⊗ B |
| `matrix_ops.commutator` | Matrix commutator [A,B] = AB − BA |
| `matrix_ops.gram_schmidt` | Gram-Schmidt orthogonalization |
| `matrix_ops.is_orthogonal` | Check if AᵀA ≈ I (orthogonal matrix) |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// Build a matrix from a row-major flat list: 2 rows × 2 cols
const A = await sqai.compute({
  module: "linalg",
  function: "mat_from_list",
  args: [[1, 2, 3, 4], 2, 2],
});

// Determinant of a square matrix -> a scalar
const det = await sqai.compute({
  module: "linalg",
  function: "mat_det",
  args: [[[1, 2], [3, 4]]],
});

// Gram-Schmidt -> an orthogonal set spanning the same space
const q = await sqai.compute({
  module: "matrix_ops",
  function: "gram_schmidt",
  args: [[[1, 1, 0], [1, 0, 1]]],
});

// is_orthogonal -> boolean: does AᵀA ≈ I ?
const ortho = await sqai.compute({
  module: "matrix_ops",
  function: "is_orthogonal",
  args: [[[0, -1], [1, 0]]],
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# Build a matrix from a row-major flat list: 2 rows × 2 cols
A = sqai.compute(module="linalg", function="mat_from_list",
                 args=[[1, 2, 3, 4], 2, 2])

# Determinant of a square matrix -> a scalar
det = sqai.compute(module="linalg", function="mat_det",
                   args=[[[1, 2], [3, 4]]])

# Gram-Schmidt -> an orthogonal set spanning the same space
q = sqai.compute(module="matrix_ops", function="gram_schmidt",
                 args=[[[1, 1, 0], [1, 0, 1]]])

# is_orthogonal -> boolean: does AᵀA ≈ I ?
ortho = sqai.compute(module="matrix_ops", function="is_orthogonal",
                     args=[[[0, -1], [1, 0]]])
```
{% endtab %}
{% endtabs %}

`linalg.mat_identity` takes a single size `n` and returns the n×n identity; `linalg.mat_mul` and `linalg.mat_add` take two conformable matrices; `linalg.mat_inv` returns the Gauss-Jordan inverse with partial pivoting. `matrix_ops.hadamard_product`, `kronecker_product`, and `commutator` each take two matrices and return the element-wise product, the ⊗ tensor product, and `AB − BA` respectively.

## Decompositions, determinants & solvers

`matrix_decomp` factors matrices and solves the triangular systems that factorizations leave behind — plus fast closed forms for the small sizes that dominate real workloads.

| Capability | What it computes |
|---|---|
| `matrix_decomp.cholesky` | Cholesky decomposition for symmetric positive-definite matrix |
| `matrix_decomp.back_substitution` | Solve Ux = b where U is upper triangular |
| `matrix_decomp.det_2x2` | Determinant of 2×2 matrix: ad − bc |
| `matrix_decomp.det_3x3` | Determinant of 3×3 matrix via cofactor expansion along row 0 |
| `matrix_decomp.eigen_2x2` | Eigenvalues and eigenvectors for 2×2 matrix |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// Cholesky of an SPD matrix -> the lower-triangular factor L (L Lᵀ = A)
const L = await sqai.compute({
  module: "matrix_decomp",
  function: "cholesky",
  args: [[[4, 2], [2, 3]]],
});

// Solve U x = b for upper-triangular U -> the solution vector x
const x = await sqai.compute({
  module: "matrix_decomp",
  function: "back_substitution",
  args: [[[2, 1], [0, 3]], [5, 9]],
});

// eigen_2x2 -> eigenvalues and their eigenvectors
const eig = await sqai.compute({
  module: "matrix_decomp",
  function: "eigen_2x2",
  args: [[[2, 0], [0, 3]]],
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# Cholesky of an SPD matrix -> the lower-triangular factor L (L Lᵀ = A)
L = sqai.compute(module="matrix_decomp", function="cholesky",
                 args=[[[4, 2], [2, 3]]])

# Solve U x = b for upper-triangular U -> the solution vector x
x = sqai.compute(module="matrix_decomp", function="back_substitution",
                 args=[[[2, 1], [0, 3]], [5, 9]])

# eigen_2x2 -> eigenvalues and their eigenvectors
eig = sqai.compute(module="matrix_decomp", function="eigen_2x2",
                   args=[[[2, 0], [0, 3]]])
```
{% endtab %}
{% endtabs %}

Use `det_2x2` / `det_3x3` when you know the size — they are closed forms (`ad − bc`, cofactor expansion along row 0) rather than the general `linalg.mat_det`. `back_substitution` pairs with `cholesky` (or any triangular factor) to finish a solve.

## Dense vector kernels

`vector_kernels` is the retrieval-math layer: fixed-width 64-dim Float32 kernels for dot products, cosine similarity, and inverse norms, plus a string encoder and the batch ranker's decision accessor. These are the primitives behind similarity scoring at query time.

| Capability | What it computes |
|---|---|
| `vector_kernels.dot.dot64_f32` | Dot product of two 64-element Float32 vectors |
| `vector_kernels.dot.cosine64_f32` | Cosine similarity between two 64-dim Float32 vectors |
| `vector_kernels.dot.l2_norm_inv_f32` | Compute 1/‖v‖₂ for a 64-element Float32 vector |
| `vector_kernels.dot.build_vec64_f32` | Encode a string as a 64-bucket bigram frequency vector |
| `vector_kernels.batch_ranker.to_planner_resolution` | Extract the planner decision from a RankResult |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// Encode two strings into 64-bucket bigram vectors, then score them.
const a = await sqai.compute({
  module: "vector_kernels",
  function: "dot.build_vec64_f32",
  args: ["structured query ai"],
});
const b = await sqai.compute({
  module: "vector_kernels",
  function: "dot.build_vec64_f32",
  args: ["structured data ai"],
});

// cosine64_f32(a, b) -> similarity in [-1, 1]
const sim = await sqai.compute({
  module: "vector_kernels",
  function: "dot.cosine64_f32",
  args: [a.value, b.value],
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# Encode two strings into 64-bucket bigram vectors, then score them.
a = sqai.compute(module="vector_kernels", function="dot.build_vec64_f32",
                 args=["structured query ai"])
b = sqai.compute(module="vector_kernels", function="dot.build_vec64_f32",
                 args=["structured data ai"])

# cosine64_f32(a, b) -> similarity in [-1, 1]
sim = sqai.compute(module="vector_kernels", function="dot.cosine64_f32",
                   args=[a["value"], b["value"]])
```
{% endtab %}
{% endtabs %}

`dot64_f32` returns the raw dot product; `l2_norm_inv_f32` returns `1/‖v‖₂` (multiply-to-normalize, no division at the call site); `batch_ranker.to_planner_resolution` reads the planner decision out of a `RankResult`.

## Sparse vectors

`sparse_vector` works in index/value pairs instead of dense arrays — the right shape for high-dimensional, mostly-zero features (BM25 term vectors, one-hot bags, TF-IDF).

| Capability | What it computes |
|---|---|
| `sparse_vector.dense_to_sparse` | Convert dense vector to sparse |
| `sparse_vector.sv_dot` | Sparse dot product |
| `sparse_vector.sv_cosine` | Cosine similarity between two sparse vectors |
| `sparse_vector.sv_add` | Sparse addition |
| `sparse_vector.sv_max` | Max value in sparse vector values list |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// Densify -> sparse: drops the zeros, keeps index/value pairs
const sv = await sqai.compute({
  module: "sparse_vector",
  function: "dense_to_sparse",
  args: [[0, 0, 3, 0, 5, 0]],
});

// Cosine similarity between two sparse vectors -> a scalar in [-1, 1]
const sim = await sqai.compute({
  module: "sparse_vector",
  function: "sv_cosine",
  args: [sv.value, sv.value],
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# Densify -> sparse: drops the zeros, keeps index/value pairs
sv = sqai.compute(module="sparse_vector", function="dense_to_sparse",
                  args=[[0, 0, 3, 0, 5, 0]])

# Cosine similarity between two sparse vectors -> a scalar in [-1, 1]
sim = sqai.compute(module="sparse_vector", function="sv_cosine",
                   args=[sv["value"], sv["value"]])
```
{% endtab %}
{% endtabs %}

`sv_dot` and `sv_add` take two sparse vectors and return a scalar and a sparse vector respectively; `sv_max` returns the largest stored value.

## Vector search & ANN

`vector_search` is the math that makes approximate nearest-neighbor indexes tunable and analyzable: pruning bounds, HNSW layer probabilities and search parameters, FAISS coverage, and beam scoring. Deterministic building blocks for reasoning about a retrieval index — not the index itself.

| Capability | What it computes |
|---|---|
| `vector_search.ann_distance_bound` | Triangle inequality lower bound on query-to-point distance |
| `vector_search.hnsw_layer_probability` | HNSW probability that a node exists at given level |
| `vector_search.hnsw_search_ef_scale` | Recommended ef search parameter: max(ef_construction, k) |
| `vector_search.faiss_nprobe_coverage` | Approximate fraction of index covered by nprobe lists |
| `vector_search.beam_search_score` | Length-normalised beam search score |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// Recommended ef for a search returning k results -> max(ef_construction, k)
const ef = await sqai.compute({
  module: "vector_search",
  function: "hnsw_search_ef_scale",
  args: [200, 10],
});

// Fraction of a FAISS index covered when probing nprobe of nlist lists
const coverage = await sqai.compute({
  module: "vector_search",
  function: "faiss_nprobe_coverage",
  args: [8, 256],
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# Recommended ef for a search returning k results -> max(ef_construction, k)
ef = sqai.compute(module="vector_search", function="hnsw_search_ef_scale",
                  args=[200, 10])

# Fraction of a FAISS index covered when probing nprobe of nlist lists
coverage = sqai.compute(module="vector_search", function="faiss_nprobe_coverage",
                        args=[8, 256])
```
{% endtab %}
{% endtabs %}

`ann_distance_bound` returns the triangle-inequality lower bound used to prune candidates; `hnsw_layer_probability` returns a node's probability of existing at a given level; `beam_search_score` returns the length-normalised score for ranking beams.

{% hint style="info" %}
The `vector_similarity` and `linalg_ext` modules round out the pack with further similarity measures and extended dense routines. Discover their exact members with `searchCapabilities("cosine")` or `searchCapabilities("matrix")` before you install — search reads the embedded contract in-process, with no runtime and no key.
{% endhint %}

## Every result carries its scope

A linear-algebra `compute()` returns exactly what any other capability returns: the value, the three domain-separated hashes, and the determinism envelope that pins the scope it ran in.

```json
{
  "status": "ok",
  "value": "...",
  "value_type": "...",
  "module": "matrix_decomp",
  "function": "cholesky",
  "invocation_hash": "...",
  "computation_hash": "...",
  "contract_hash": "sha256:31247fb219e656f349bb6d36fa65c2e2702e2688a2fddb4b16f1a9e09a02cdbb",
  "determinism": {
    "precision_mode": "float64",
    "thread_count": 1,
    "platform": "darwin-arm64",
    "kernel_build": "mojo"
  }
}
```

The `invocation_hash` is known **before** the factorization runs — it is the identity of `(module, function, args, contract, scope)`; the `computation_hash` folds in the canonical result afterward. `precision_mode: "float64"` and `thread_count: 1` are why two runs of the same call agree bit-for-bit, and why the same input yields the same hash in both SDKs. For the field-by-field breakdown — including the verified example `finance.npv(0.1, [-1000, 300, 420, 560, 680]) = 505.020148896933` with `computation_hash b74f67d0…` — see [Determinism & provenance](../determinism.md).

## Install just what you call

All 128 capabilities live in the embedded contract, but the runtime you provision ships only the modules you name. Pass `runtimeModules` (or set `SQAI_RUNTIME_MODULES`) to compile and sign a bundle for exactly your linear-algebra footprint.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const sqai = createSQAI({
  runtimeModules: ["linalg", "matrix_decomp", "vector_kernels"],
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
sqai = create_sqai(
    runtime_modules=["linalg", "matrix_decomp", "vector_kernels"],
)
```
{% endtab %}
{% endtabs %}

The filter changes only what is installed, never what a function returns: `matrix_decomp.cholesky(...)` yields the same value and the same `computation_hash` whether the bundle carries three modules or all of them. Filtered bundles need a build service — set `SQAI_BUILD_SERVICE_URL`. See [Compute & filtering](../compute-and-filtering.md#build-on-provision-filtering) for the full build-on-provision flow.

## Related

<table data-view="cards">
<thead><tr><th></th><th></th><th data-hidden data-card-target data-type="content-ref"></th></tr></thead>
<tbody>
<tr><td><strong>Compute &#38; filtering</strong></td><td>The full library, the <code>ComputationSpec</code>, bindings, and build-on-provision.</td><td><a href="../compute-and-filtering.md">compute-and-filtering.md</a></td></tr>
<tr><td><strong>Determinism &#38; provenance</strong></td><td>What every hash on a result means, and how they reproduce it.</td><td><a href="../determinism.md">determinism.md</a></td></tr>
<tr><td><strong>Machine learning &#38; metrics</strong></td><td>Regression, clustering, embeddings, and evaluation metrics built on this core.</td><td><a href="machine-learning.md">machine-learning.md</a></td></tr>
<tr><td><strong>Signals &#38; DSP</strong></td><td>FFTs, convolution, and spectral analysis over the same tensor layer.</td><td><a href="signal-dsp.md">signal-dsp.md</a></td></tr>
</tbody>
</table>
