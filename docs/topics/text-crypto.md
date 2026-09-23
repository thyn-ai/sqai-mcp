---
icon: hashtag
description: 213 read-only capabilities for text similarity, information theory, bit and byte manipulation, AES primitives, compression, JSON parsing, and transformer positional encoding — every call deterministic and hash-pinned.
---

# Text, crypto & data utilities

The **text-crypto** pack is SQAI's bytes-and-symbols layer: **213 read-only capabilities** for turning strings, numbers, and byte buffers into scores, hashes, entropy, and encoded forms. Where the statistics and finance packs work over columns of floats, this pack works over the *shape* of data — how similar two column names are, how many bits a distribution carries, which bit is set, how a JSON array is laid out, how an AES round transforms a state.

Every function is a named, hash-pinned capability that runs on the signed on-device runtime — on your machine, no cloud, no data leaves it — and returns the value plus the hashes that reproduce it. All 213 are read-only and deterministic: the same bytes in yield the same value and the same `computation_hash`, byte-for-byte, in TypeScript and Python.

The pack spans **11 modules**: `text`, `string_distance`, `information_theory`, `bitops`, `compression`, `crypto`, `json`, `encoding`, `perceptual_hash`, `positional_encoding`, and `textile`. Names below are `module.function`; the summaries are the real one-liners `searchCapabilities` returns.

{% hint style="info" %}
New to compute? [Compute & filtering](../compute-and-filtering.md) covers `compute()`, `runtimeModules`, and binding arguments to data. Every hash on a result is explained in [Determinism & provenance](../determinism.md).
{% endhint %}

## Text similarity & fuzzy matching

The `text` and `string_distance` modules score how alike two strings are — the same lexical machinery SQAI's own resolver uses to map a natural-language hint onto a real column name. Each returns a float, most of them normalized to `[0, 1]`.

| Capability | What it computes |
|---|---|
| `text.column_scorer.score_column_hint` | Weighted composite lexical similarity between a hint and a column name |
| `text.column_scorer.score_ngram_overlap` | Dice coefficient on character n-grams: 2 * \|A ∩ B\| / (\|A\| + \|B\|) |
| `text.column_scorer.score_token_overlap` | Jaccard token overlap: \|A ∩ B\| / \|A ∪ B\| |
| `text.column_scorer.score_prefix_match` | Fraction of hint covered by the longest common prefix with col |
| `text.fuzzy.fuzzy_ratio` | Fuzzy match ratio: 2 * LCS / (len(a) + len(b)), range [0, 1] |

Score a hint against a candidate column name — `score_column_hint` blends the n-gram, token, and prefix signals into one number:

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// Composite similarity of a natural-language hint to a real column name.
await sqai.compute({
  module: "text",
  function: "column_scorer.score_column_hint",
  args: ["total revenue", "net_revenue"],
});

// Character-level Dice coefficient — robust to token order and typos.
await sqai.compute({
  module: "text",
  function: "column_scorer.score_ngram_overlap",
  args: ["cust_id", "customer_id"],
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# Composite similarity of a natural-language hint to a real column name.
sqai.compute(
    module="text",
    function="column_scorer.score_column_hint",
    args=["total revenue", "net_revenue"],
)

# Character-level Dice coefficient — robust to token order and typos.
sqai.compute(
    module="text",
    function="column_scorer.score_ngram_overlap",
    args=["cust_id", "customer_id"],
)
```
{% endtab %}
{% endtabs %}

Each returns a similarity score — higher is a closer match. `score_token_overlap` compares whole tokens (Jaccard), `score_prefix_match` rewards a shared leading substring, and `text.fuzzy.fuzzy_ratio` scores on the longest common subsequence, so `("kitten", "sitting")` lands below `1.0` in proportion to their shared characters.

{% hint style="info" %}
These are the exact scorers behind [column resolution](../concepts.md) — deterministic, so a hint always resolves the same way. The `string_distance` module carries lower-level edit-distance primitives if you want the raw distances rather than the normalized scores.
{% endhint %}

## Information theory & entropy

The `information_theory` module measures information content in **bits** — entropy, cross-entropy, channel capacity. Inputs are probability distributions (lists that sum to 1) or single probabilities; outputs are scalars in bits.

| Capability | What it computes |
|---|---|
| `information_theory.entropy` | Shannon entropy: -Σ p*log2(p) |
| `information_theory.binary_entropy` | Binary entropy: H(p) = -p*log2(p) - (1-p)*log2(1-p) |
| `information_theory.conditional_entropy` | Conditional entropy H(Y\|X) = H(X,Y) - H(X) |
| `information_theory.cross_entropy` | Cross entropy: -Σ p*log2(q) |
| `information_theory.channel_capacity_bsc` | Binary symmetric channel capacity: C = 1 - H(p) |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// Shannon entropy of a discrete distribution, in bits.
await sqai.compute({
  module: "information_theory",
  function: "entropy",
  args: [[0.5, 0.25, 0.25]],
});

// Capacity of a binary symmetric channel with 10% flip probability.
await sqai.compute({
  module: "information_theory",
  function: "channel_capacity_bsc",
  args: [0.1],
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# Shannon entropy of a discrete distribution, in bits.
sqai.compute(
    module="information_theory",
    function="entropy",
    args=[[0.5, 0.25, 0.25]],
)

# Capacity of a binary symmetric channel with 10% flip probability.
sqai.compute(
    module="information_theory",
    function="channel_capacity_bsc",
    args=[0.1],
)
```
{% endtab %}
{% endtabs %}

`entropy` returns the average bits per symbol of the distribution; `binary_entropy` is the two-outcome special case, maximal when `p = 0.5`; `cross_entropy` and `conditional_entropy` take a pair of distributions and return the bits of one measured against the other; `channel_capacity_bsc` returns the maximum reliable bits per use of a noisy binary channel.

## Bit operations & hashing

The `bitops` module is exact integer bit manipulation plus a fast string hash. Positions are 0-indexed from the least-significant bit.

| Capability | What it computes |
|---|---|
| `bitops.bit_set` | Set bit at position pos (0-indexed from LSB) |
| `bitops.bit_clear` | Clear bit at position pos |
| `bitops.bit_toggle` | Toggle bit at position pos |
| `bitops.bit_test` | Test if bit at position pos is set |
| `bitops.fnv1a_hash` | FNV-1a hash for strings |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// Set bit 3 of 0 → the integer 8.
await sqai.compute({ module: "bitops", function: "bit_set", args: [0, 3] });

// Is bit 0 of 5 set? (5 = 0b101)
await sqai.compute({ module: "bitops", function: "bit_test", args: [5, 0] });

// Stable, order-sensitive hash of a string.
await sqai.compute({ module: "bitops", function: "fnv1a_hash", args: ["order-42"] });
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# Set bit 3 of 0 → the integer 8.
sqai.compute(module="bitops", function="bit_set", args=[0, 3])

# Is bit 0 of 5 set? (5 = 0b101)
sqai.compute(module="bitops", function="bit_test", args=[5, 0])

# Stable, order-sensitive hash of a string.
sqai.compute(module="bitops", function="fnv1a_hash", args=["order-42"])
```
{% endtab %}
{% endtabs %}

`bit_set`, `bit_clear`, and `bit_toggle` return the modified integer; `bit_test` returns a boolean; `fnv1a_hash` returns the FNV-1a hash of the input string — deterministic, so the same string always hashes to the same value in either SDK.

## Compression

The `compression` module implements **delta coding** — store the first value, then differences — plus a savings metric. Round-trips are exact: `delta_decode(delta_encode(x)) == x`.

| Capability | What it computes |
|---|---|
| `compression.delta.delta_encode` | Delta encoding: first value as-is, then differences |
| `compression.delta.delta_decode` | Delta decoding: cumulative sum reconstruction |
| `compression.delta.delta_encode_float` | Quantize floats to int (multiply by precision) then delta encode |
| `compression.delta.delta_decode_float` | Delta decode then dequantize (divide by precision) |
| `compression.delta.compression_savings` | Compute compression savings: 1 - compressed/original |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// Delta-encode a monotonic series → small differences.
await sqai.compute({
  module: "compression",
  function: "delta.delta_encode",
  args: [[100, 103, 108, 110]],
});

// Reconstruct the original by cumulative sum.
await sqai.compute({
  module: "compression",
  function: "delta.delta_decode",
  args: [[100, 3, 5, 2]],
});

// Fraction saved: 1 - 384/1024.
await sqai.compute({
  module: "compression",
  function: "delta.compression_savings",
  args: [1024, 384],
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# Delta-encode a monotonic series → small differences.
sqai.compute(
    module="compression",
    function="delta.delta_encode",
    args=[[100, 103, 108, 110]],
)

# Reconstruct the original by cumulative sum.
sqai.compute(
    module="compression",
    function="delta.delta_decode",
    args=[[100, 3, 5, 2]],
)

# Fraction saved: 1 - 384/1024.
sqai.compute(
    module="compression",
    function="delta.compression_savings",
    args=[1024, 384],
)
```
{% endtab %}
{% endtabs %}

`delta_encode` returns the encoded list, `delta_decode` the reconstructed original; the `_float` pair quantizes to integers by a precision factor before encoding and divides back on the way out; `compression_savings` returns the fraction of size saved.

## Cryptographic primitives

The `crypto.aes_sbox` module exposes the deterministic building blocks of AES — S-Box substitution, the round-key XOR, and the inverse transforms. These are the transparent primitives, not a black-box cipher: each takes a byte or a 16-byte state and returns the transformed byte or state.

| Capability | What it computes |
|---|---|
| `crypto.aes_sbox.aes_sbox` | AES forward S-Box lookup for a single byte (0–255) |
| `crypto.aes_sbox.aes_inv_sbox` | AES inverse S-Box lookup for a single byte (0–255) |
| `crypto.aes_sbox.add_round_key` | XOR state with round key (same as xor_bytes for AES) |
| `crypto.aes_sbox.inv_sub_bytes` | Apply inverse S-Box to each byte of a 16-byte state |
| `crypto.aes_sbox.inv_shift_rows` | Inverse ShiftRows on 4×4 state (row-major, 16 bytes) |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// Forward S-Box substitution of a single byte.
await sqai.compute({ module: "crypto", function: "aes_sbox.aes_sbox", args: [0x53] });

// XOR a 16-byte state with a 16-byte round key.
await sqai.compute({
  module: "crypto",
  function: "aes_sbox.add_round_key",
  args: [
    [0x32, 0x88, 0x31, 0xe0, 0x43, 0x5a, 0x31, 0x37, 0xf6, 0x30, 0x98, 0x07, 0xa8, 0x8d, 0xa2, 0x34],
    [0x2b, 0x28, 0xab, 0x09, 0x7e, 0xae, 0xf7, 0xcf, 0x15, 0xd2, 0x15, 0x4f, 0x16, 0xa6, 0x88, 0x3c],
  ],
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# Forward S-Box substitution of a single byte.
sqai.compute(module="crypto", function="aes_sbox.aes_sbox", args=[0x53])

# XOR a 16-byte state with a 16-byte round key.
sqai.compute(
    module="crypto",
    function="aes_sbox.add_round_key",
    args=[
        [0x32, 0x88, 0x31, 0xe0, 0x43, 0x5a, 0x31, 0x37, 0xf6, 0x30, 0x98, 0x07, 0xa8, 0x8d, 0xa2, 0x34],
        [0x2b, 0x28, 0xab, 0x09, 0x7e, 0xae, 0xf7, 0xcf, 0x15, 0xd2, 0x15, 0x4f, 0x16, 0xa6, 0x88, 0x3c],
    ],
)
```
{% endtab %}
{% endtabs %}

`aes_sbox` / `aes_inv_sbox` return the substituted byte; `add_round_key` returns the XORed 16-byte state; `inv_sub_bytes` and `inv_shift_rows` return the inverse-transformed state. Because they are deterministic and hash-pinned, each step is independently reproducible and auditable — the same input state always yields the same output, with a `computation_hash` to prove it.

{% hint style="warning" %}
These are primitives for inspecting and verifying transforms, not a drop-in encryption API — SQAI is a read-only, deterministic compute tool. There is no key-management, RNG, or write path here.
{% endhint %}

## Parsing & byte decoding

The `json` module reads structure straight out of a JSON string in a single pass — no full deserialize — and the `encoding` module handles base64 and byte conversions. Useful for pulling a field or an array element out of a stored blob without materializing the whole object.

| Capability | What it computes |
|---|---|
| `json.parser.find_key` | Find the position of the value for 'key' in a JSON object |
| `json.parser.json_array_len` | Count elements in a JSON array string like "[1,2,3]" |
| `json.parser.json_array_get` | Get element at index from a JSON array |
| `json.parser.json_array_tokens` | Split a JSON array string into its raw element strings in ONE pass — O(n) total |
| `json.parser.json_decode_base64_bytes` | Standard base64 → raw bytes, single pass O(n) |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// Count elements without deserializing the array.
await sqai.compute({
  module: "json",
  function: "parser.json_array_len",
  args: ["[10, 20, 30]"],
});

// Pull element at index 1.
await sqai.compute({
  module: "json",
  function: "parser.json_array_get",
  args: ["[10, 20, 30]", 1],
});

// Decode standard base64 to raw bytes.
await sqai.compute({
  module: "json",
  function: "parser.json_decode_base64_bytes",
  args: ["aGVsbG8="],
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# Count elements without deserializing the array.
sqai.compute(
    module="json",
    function="parser.json_array_len",
    args=["[10, 20, 30]"],
)

# Pull element at index 1.
sqai.compute(
    module="json",
    function="parser.json_array_get",
    args=["[10, 20, 30]", 1],
)

# Decode standard base64 to raw bytes.
sqai.compute(
    module="json",
    function="parser.json_decode_base64_bytes",
    args=["aGVsbG8="],
)
```
{% endtab %}
{% endtabs %}

`json_array_len` returns the element count; `json_array_get` returns the raw element at an index; `find_key` returns the position of a key's value; `json_array_tokens` splits an array into its raw element strings in one O(n) pass; `json_decode_base64_bytes` returns the decoded bytes. The `perceptual_hash` module rounds out the pack with similarity hashing for near-duplicate detection.

## Positional encoding for transformers

The `positional_encoding` module carries the deterministic position math behind modern attention — ALiBi, RoPE, T5 relative buckets, and learned-embedding initialization. Part of SQAI's LLM-infrastructure surface, exposed as auditable, hash-pinned functions.

| Capability | What it computes |
|---|---|
| `positional_encoding.alibi_slope` | ALiBi attention slope for head h (Press et al.) |
| `positional_encoding.alibi_bias` | ALiBi position bias: -slope × \|query_pos - key_pos\| |
| `positional_encoding.rope_apply_cos` | Apply RoPE cosine rotation to even dimension: x × cos |
| `positional_encoding.relative_pe_bucket` | T5 relative position bucket index |
| `positional_encoding.learned_pe_init` | Xavier uniform init scale for learned positional embeddings |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// ALiBi slope for head 3 in an 8-head attention block.
await sqai.compute({
  module: "positional_encoding",
  function: "alibi_slope",
  args: [3, 8],
});

// Position bias between a query and key position, given a slope.
await sqai.compute({
  module: "positional_encoding",
  function: "alibi_bias",
  args: [0.125, 12, 4],
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# ALiBi slope for head 3 in an 8-head attention block.
sqai.compute(
    module="positional_encoding",
    function="alibi_slope",
    args=[3, 8],
)

# Position bias between a query and key position, given a slope.
sqai.compute(
    module="positional_encoding",
    function="alibi_bias",
    args=[0.125, 12, 4],
)
```
{% endtab %}
{% endtabs %}

`alibi_slope` returns the per-head slope; `alibi_bias` returns the distance-scaled bias added to attention logits; `rope_apply_cos` returns the RoPE-rotated component; `relative_pe_bucket` returns the T5 bucket index for a relative offset; `learned_pe_init` returns the Xavier init scale.

## Materials: textile engineering

The pack also ships the `textile` domain module — yarn and fabric formulas that operate on the same numeric primitives, included here as one of SQAI's applied-engineering packs.

| Capability | What it computes |
|---|---|
| `textile.denier_to_tex` | Convert denier to tex: tex = denier / 9 |
| `textile.fabric_gsm` | Fabric weight in GSM (grams per square meter) |
| `textile.fabric_cover_factor` | Fabric cover factor: CF = threads / sqrt(count) |
| `textile.moisture_regain` | Moisture regain: MR = (wet - dry) / dry * 100 |
| `textile.breaking_tenacity` | Breaking tenacity: T = F / tex (cN/tex when F in cN) |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// Convert 90 denier to tex.
await sqai.compute({ module: "textile", function: "denier_to_tex", args: [90] });
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# Convert 90 denier to tex.
sqai.compute(module="textile", function="denier_to_tex", args=[90])
```
{% endtab %}
{% endtabs %}

## Every result is reproducible

Nothing in this pack is a handwritten formula — each capability is a named entry in the pinned contract (`contract_hash` `sha256:31247fb2…`), and every `compute()` returns the value alongside its `invocation_hash`, `computation_hash`, and the full determinism envelope. Text scorers, entropy, bit ops, and AES steps are all deterministic, so replay is exact: the same bytes in yield the same value and the same `computation_hash`, in TypeScript and Python alike. See [Determinism & provenance](../determinism.md) for what each hash pins.

{% hint style="success" %}
Install only what you call. Set `runtimeModules` to the packs you use — e.g. `["text", "information_theory", "bitops"]` — and the build service compiles a signed bundle for exactly that filter. The filter changes what is installed, never what a function returns. See [Compute & filtering](../compute-and-filtering.md).
{% endhint %}

## Next steps

<table data-view="cards">
<thead><tr><th></th><th></th><th data-hidden data-card-target data-type="content-ref"></th></tr></thead>
<tbody>
<tr><td><strong>Compute & filtering</strong></td><td>The full <code>compute()</code> spec, <code>runtimeModules</code>, and binding arguments to columns.</td><td><a href="../compute-and-filtering.md">compute-and-filtering.md</a></td></tr>
<tr><td><strong>Determinism & provenance</strong></td><td>What every hash on a result means, and how they reproduce it.</td><td><a href="../determinism.md">determinism.md</a></td></tr>
<tr><td><strong>Connect data</strong></td><td>Bind these capabilities to columns of a file, SQLite, or private SQAI database.</td><td><a href="../connect-data.md">connect-data.md</a></td></tr>
<tr><td><strong>Policy & governance</strong></td><td>Restrict the sources, fields, and capabilities a model can reach — in code, never from model input.</td><td><a href="../policy.md">policy.md</a></td></tr>
</tbody>
</table>
</content>
</invoke>
