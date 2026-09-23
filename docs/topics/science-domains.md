---
icon: atom
description: 3,645 read-only capabilities across 353 named domain packs — aerospace, cardiology, seismology, pharmacokinetics, and hundreds more — each a hash-pinned function, not a formula an agent typed.
---

# 100+ science & engineering domain packs

Past the core statistics, finance, and signal libraries, the SQAI runtime carries a long tail of **domain packs** — named, hash-pinned capabilities for specific fields of science and engineering. This collection alone is **3,645 read-only capabilities across 353 packs**, from `aerospace` and `cardiology` to `seismology`, `pharmacokinetics`, `metallurgy`, `photovoltaics`, and `viticulture`. Every one is a real function with a typed signature and a one-line summary — never a handwritten formula an agent pasted into a prompt.

They run on the exact same signed on-device runtime as everything else — no cloud, on your machine, no data leaves it — and every call returns its value plus the hashes that reproduce it. The packs live inside the full **6,084-capability contract** (`sha256:31247fb2…`); of the 5,790 exposed to the SDKs, 5,780 are deterministic and 10 are seed-required simulations. A domain pack is not a plugin you trust — it is a pinned entry in that contract, and its output carries the same provenance envelope as `finance.npv`.

{% hint style="info" %}
An agent asking "what's the drag force on this wing?" should not be inventing `½·ρ·v²·A·CD` in free text. It should call `aviation.drag_force` — a fixed capability whose result is hashed, replayable, and identical in TypeScript and Python. That is the whole point of a domain pack: move the physics out of the model and into a governed, deterministic function.
{% endhint %}

## The packs

Grouped by field below. Names are `module.function`; the summaries are the real one-liners `searchCapabilities` returns. This is a representative slice — the full collection spans 353 packs.

### Life sciences & medicine

| Capability | What it computes |
|---|---|
| `cardiology.cardiac_output` | Cardiac output: CO = HR × SV |
| `biomedical.alveolar_gas_equation` | Alveolar gas equation: PAO2 = FiO2*(Patm-PH2O) - PaCO2/RQ |
| `biomechanics.angular_acceleration` | α = Δω / t (rad/s²) |
| `bioinformatics.amino_acid_count` | Amino acid count for full ORF: AA = codons - 1 (minus stop codon) |
| `apiculture.brood_viability` | Viability V = hatched / total * 100 (%) |
| `aquaculture.ammonia_production` | Ammonia production estimate: NH3 ≈ feed * protein/100 * 0.03 |

Neighbouring packs in the same family include `pharmacokinetics`, `pharmacology`, `epidemiology`, `immunology`, `hematology`, `virology`, `genomics`, `proteomics`, and `veterinary`.

### Earth, atmosphere & space

| Capability | What it computes |
|---|---|
| `astronomy.apparent_magnitude` | m = M + 5*log10(d) - 5 |
| `cosmology.angular_diameter_distance` | Angular diameter distance: d_A = d_c / (1 + z) |
| `astrobiology.habitable_zone_inner` | Inner edge of habitable zone (runaway greenhouse) |
| `atmospheric_chemistry.acid_rain_ph` | Approximate pH of precipitation from acid deposition |
| `climate.apparent_temperature` | Australian Bureau of Meteorology apparent temperature |
| `biogeochemistry.carbon_use_efficiency` | Carbon use efficiency: CUE = NPP / GPP |
| `cryology.active_layer_depth` | Active layer thickness from Stefan equation |

Also in this family: `seismology`, `volcanology`, `glaciology`, `hydrology`, `geodesy`, `geophysics`, `meteorology`, `oceanography` (see `marine`), and `sedimentology`.

### Engineering, materials & structures

| Capability | What it computes |
|---|---|
| `aerospace.drag_force` | Drag force: D = Cd * q * S |
| `aviation.drag_force` | Aerodynamic drag: D = ½·ρ·v²·A·CD |
| `antenna.antenna_efficiency` | Antenna efficiency η = G / D (linear scale) |
| `battery.battery_pack_capacity` | Pack capacity C = n_parallel * C_cell (Ah) |
| `composites.composite_density` | Composite density: ρ = Vf*ρf + (1-Vf)*ρm |
| `ceramics.coefficient_of_thermal_expansion` | CTE = ΔL / (L0 * ΔT) |
| `concrete.aggregate_volume` | Aggregate volume: V_agg = total - cement - water - air*total/100 |
| `corrosion.cathodic_protection_current` | Required cathodic-protection current I = A * i_cp (A) |
| `combustion.adiabatic_flame_temp_estimate` | Adiabatic flame temperature: T_ad = T_r + Q/(m*cp) |
| `adhesives.bond_area_from_load` | Required bond area: A = F * SF / τ (mm²) |
| `cryogenics.boiloff_rate` | BOR = Q / (L * m) * 100 (%/day) |

Two packs, `aerospace` and `aviation`, both expose a `drag_force` — different conventions (`Cd·q·S` vs `½·ρ·v²·A·CD`), each pinned to its own hash. The field is wide: `thermodynamics`, `metallurgy`, `tribology`, `semiconductors`, `power_systems`, `photovoltaics`, `wind_energy`, `structural`, `geotechnical`, `hvac`, and `welding` all live here too.

### Physics, dynamics & control

| Capability | What it computes |
|---|---|
| `autonomous_vehicles.braking_distance` | d = v²/(2*g*(μ+G)) where g=9.81 m/s² |
| `control.bang_bang` | Bang-bang (on/off) control |
| `chaos.bifurcation_diagram` | Generate bifurcation diagram data for the logistic map |
| `cellular_automata.elementary_rule` | Apply Wolfram elementary CA rule (0-255) |
| `cellular.count_alive` | Count living cells in 2D grid |

Companions include `physics`, `optics`, `photonics`, `magnetism`, `plasma_physics`, `quantum`, `fluid`, `robotics`, `kalman`, and the numerical `ode` / `pde` solvers.

### Agriculture, industry & the applied long tail

| Capability | What it computes |
|---|---|
| `agriculture.crop_water_need` | ETc = ET0 * Kc (crop evapotranspiration) |
| `agronomy.crop_water_stress_index` | Crop Water Stress Index (CWSI) |
| `brewing.abv_from_og_fg` | ABV = (OG - FG) * 131.25 |
| `archaeology.artifact_density` | Artifact density: AD = n / V (per m³) |
| `auction.all_pay_revenue` | All-pay auction total revenue = sum of all bids |
| `blockchain.block_reward_halving` | Block reward after halvings = initial_reward / 2^halvings |

The tail keeps going: `viticulture`, `horticulture`, `fisheries`, `mycology`, `food_science`, `fermentation`, `perfumery`, `mining`, `logistics`, `supply_chain`, `insurance`, `numismatics`, `watchmaking`, and dozens more. If a field has a formula worth pinning, it tends to have a pack.

## Calling a pack

Every domain pack is reached through the same `compute()` entry point as the rest of the library — only `module` and `function` change. Compute the drag force on a wing with `aerospace.drag_force` (`D = Cd * q * S`):

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
import { createSQAI } from "@thyn-ai/sqai";

const sqai = createSQAI();

const r = await sqai.compute({
  module: "aerospace",
  function: "drag_force",
  args: [0.027, 15200, 122.6], // Cd, dynamic pressure q (Pa), reference area S (m²)
});
// r.value is the drag force in newtons, with r.computation_hash pinning it.
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
from sqai import SQAI

sqai = SQAI()

r = sqai.compute(
    module="aerospace",
    function="drag_force",
    args=[0.027, 15200, 122.6],  # Cd, dynamic pressure q (Pa), reference area S (m²)
)
# r["value"] is the drag force in newtons, with r["computation_hash"] pinning it.
```
{% endtab %}
{% endtabs %}

Swap `module`, `function`, and `args` and the same call reaches any of the 353 packs — the surface never changes, only the identity being resolved against the contract:

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// Cardiac output: CO = HR × SV — returns L/min for HR in bpm, SV in litres.
await sqai.compute({ module: "cardiology", function: "cardiac_output", args: [72, 0.07] });

// Composite density: ρ = Vf·ρf + (1−Vf)·ρm — returns kg/m³.
await sqai.compute({ module: "composites", function: "composite_density", args: [0.6, 1800, 1200] });

// Apparent magnitude: m = M + 5·log10(d) − 5 — returns the observed magnitude.
await sqai.compute({ module: "astronomy", function: "apparent_magnitude", args: [4.83, 10] });
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# Cardiac output: CO = HR × SV — returns L/min for HR in bpm, SV in litres.
sqai.compute(module="cardiology", function="cardiac_output", args=[72, 0.07])

# Composite density: ρ = Vf·ρf + (1−Vf)·ρm — returns kg/m³.
sqai.compute(module="composites", function="composite_density", args=[0.6, 1800, 1200])

# Apparent magnitude: m = M + 5·log10(d) − 5 — returns the observed magnitude.
sqai.compute(module="astronomy", function="apparent_magnitude", args=[4.83, 10])
```
{% endtab %}
{% endtabs %}

{% hint style="info" %}
Domain-pack arguments are positional and typed exactly like the summary reads. A capability that takes columns of connected data — a `revenue` series, a batch of measurements — accepts a binding instead of a literal, and the result records the source, fields, `schema_revision`, `row_count`, and per-binding `input_hash`. See [Connect data](../connect-data.md) and the binding spec in [Compute & filtering](../compute-and-filtering.md).
{% endhint %}

## Every result reproduces

A domain-pack result is not a bare number. It is a full **determinism envelope** — the same shape every `compute()` returns, whether the module is `finance` or `volcanology`: `value`, `value_type`, `module`, `function`, `invocation_hash` (known **before** execution), `computation_hash` (the full-fidelity replay key), `contract_hash` (`sha256:31247fb2…`), and a `determinism` block pinning `platform`, `architecture`, `precision_mode: "float64"`, `thread_count: 1`, and the `input_hash`.

The canonical, verified example is `finance.npv` — the same guarantee holds for every pack on this page:

```json
{
  "value": 505.020148896933,
  "invocation_hash": "b3ca3e925e4372a5f9365790a29c486afed868073d3fd301d03022f44689e423",
  "computation_hash": "b74f67d0d7a594aa7ac91f6291612452aa8ccdf603351ebc8d801a6fddd91bc8",
  "contract_hash": "sha256:31247fb219e656f349bb6d36fa65c2e2702e2688a2fddb4b16f1a9e09a02cdbb",
  "identical": true
}
```

Because `contract_hash` is part of the `invocation_hash` identity, a pinned pack cannot silently change under you: bump the contract and every downstream hash moves, loudly. The 10 seed-required simulations across the collection reject an unseeded call with `seed_required`, then record the seed in both the identity and the envelope — so even a stochastic simulation is replayable. Full field-by-field breakdown in [Determinism & provenance](../determinism.md).

{% hint style="success" %}
`precision_mode: "float64"` and `thread_count: 1` are why two runs agree bit-for-bit: fixed precision, one reduction order. A domain-pack call in TypeScript and the same call in Python return the same value and the same hashes, locked by the runtime's cross-language conformance suite.
{% endhint %}

## Install only the packs you call

You never ship all 6,084 capabilities. `runtimeModules` filters the provisioned bundle to exactly the packs you name; the build service compiles and signs a bundle for that filter, cached by filter-hash. Name three engineering packs and that is all the runtime carries:

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
const sqai = createSQAI({
  runtimeModules: ["aerospace", "materials", "thermodynamics"],
});

await sqai.compute({ module: "aerospace", function: "drag_force", args: [0.027, 15200, 122.6] });
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
sqai = SQAI(runtime_modules=["aerospace", "materials", "thermodynamics"])

sqai.compute(module="aerospace", function="drag_force", args=[0.027, 15200, 122.6])
```
{% endtab %}
{% endtabs %}

Or set it in the environment, no code change:

```bash
export SQAI_RUNTIME_MODULES="aerospace,materials,thermodynamics"
export SQAI_BUILD_SERVICE_URL="https://build.sqai.example.com"
```

Modules are normalized (trimmed, de-duplicated, sorted) before hashing, so `["materials","aerospace","materials"]` and `["aerospace","materials"]` resolve to the same cached bundle. Filtering changes only what is **installed**, never what a function **returns**: `aerospace.drag_force` yields the same value and `computation_hash` whether the bundle carries three packs or all 353.

{% hint style="warning" %}
Filtered bundles need a build service. Set `SQAI_BUILD_SERVICE_URL` (or `buildServiceUrl`). If `runtimeModules` is set with no build service configured, provisioning fails with `runtime_provision_failed`: _"runtimeModules was set but no build service is configured."_ Omit `runtimeModules` to use the default pinned bundle. Full walkthrough in [Compute & filtering](../compute-and-filtering.md).
{% endhint %}

## Find the right capability

353 packs is far too many to memorize, so discover them. `searchCapabilities(query, limit=10)` ranks the exposed capabilities by token overlap over name, category, and summary, and returns `[{ entry, score }]`. It reads the embedded contract in-process — no runtime, no key, no provision — so you can search before you ever filter or `compute()`.

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
sqai.searchCapabilities("drag force", 5)
  .map((m) => `${m.entry.name} — ${m.entry.summary}`);
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
[f"{m['entry']['name']} — {m['entry']['summary']}"
 for m in sqai.search_capabilities("drag force", 5)]
```
{% endtab %}
{% endtabs %}

The query surfaces both real drag-force packs, so you can pick the convention you want before pinning it:

```text
aerospace.drag_force — Drag force: D = Cd * q * S
aviation.drag_force  — Aerodynamic drag: D = ½·ρ·v²·A·CD
```

{% hint style="info" %}
Search sees the whole contract; a filtered runtime only executes the packs you installed. The workflow is: search to find the exact `module.function`, set `runtimeModules` to the packs you actually call, then `compute()`. A call against a module outside your filter has nothing to dispatch to.
{% endhint %}

## Next steps

<table data-view="cards">
<thead><tr><th></th><th></th><th data-hidden data-card-target data-type="content-ref"></th></tr></thead>
<tbody>
<tr><td><strong>Compute &#38; filtering</strong></td><td>The full <code>ComputationSpec</code>, bindings, and build-on-provision filtering for these packs.</td><td><a href="../compute-and-filtering.md">compute-and-filtering.md</a></td></tr>
<tr><td><strong>Determinism &#38; provenance</strong></td><td>What every hash on a pack result means, and how they reproduce it.</td><td><a href="../determinism.md">determinism.md</a></td></tr>
<tr><td><strong>Connect data</strong></td><td>Bind a pack's arguments to columns of a file, SQLite, or private SQAI database.</td><td><a href="../connect-data.md">connect-data.md</a></td></tr>
<tr><td><strong>Policy &#38; governance</strong></td><td>Allow-list exactly which packs and fields the model can ever reach.</td><td><a href="../policy.md">policy.md</a></td></tr>
</tbody>
</table>
