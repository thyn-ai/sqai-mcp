---
icon: wave-sine
description: 92 read-only capabilities for the frequency and time domains — FFT, windowing, wavelets, audio, acoustics, psychoacoustics, and signal timing — every transform deterministic and hash-pinned.
---

# Signal processing & DSP

The **signal-dsp** domain is SQAI's frequency-and-time-domain layer: **92 read-only capabilities** that turn a vector of samples into spectra, windows, envelopes, wavelet coefficients, and acoustic quantities. Where the statistics pack summarizes a column and the finance pack discounts a cashflow, this domain works on the *waveform* — how energy is distributed across frequency, how a frame is tapered before a transform, how a tone attenuates over distance, how a green phase is timed at an intersection.

Every function is a named, hash-pinned capability that runs on the signed on-device runtime — on your machine, no cloud, no data leaves it — and returns the value plus the hashes that reproduce it. All 92 are read-only and **deterministic**: no seed, and the same samples in yield the same value and the same `computation_hash`, byte-for-byte, in TypeScript and Python.

The domain spans **eight namespaces**: `fft`, `signal`, `signal_processing`, `wavelet`, `audio`, `acoustics`, `psychoacoustics`, and `traffic_signal`. Names below are `module.function`; the summaries are the real one-liners `searchCapabilities` returns. In a `compute()` call the top-level namespace is the `module` and the rest is the `function` — so `signal.dsp.convolve` is `module: "signal"`, `function: "dsp.convolve"`.

{% hint style="info" %}
New to compute? [Compute & filtering](../compute-and-filtering.md) covers `compute()`, `runtimeModules`, and binding arguments to data. Every hash on a result is explained in [Determinism & provenance](../determinism.md).
{% endhint %}

## FFT & spectral analysis

The `fft` module is a Cooley-Tukey radix-2 transform and the bins around it — forward, inverse, magnitude, phase, and power. Inputs are real (or complex) sample vectors; the transform expects a radix-2 length, so pad first.

| Capability | What it computes |
|---|---|
| `fft.fft` | Cooley-Tukey radix-2 DIT FFT |
| `fft.ifft` | Inverse FFT |
| `fft.fft_magnitude` | \|X[k]\| = sqrt(re² + im²) for each frequency bin |
| `fft.fft_phase` | Phase angle atan2(im, re) for each bin |
| `fft.power_spectrum` | \|FFT(x)\|² / N |
| `fft.next_power_of_2` | Smallest power of 2 >= n |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// Round a frame length up to a radix-2 size before transforming.
await sqai.compute({ module: "fft", function: "next_power_of_2", args: [1000] });

// Forward FFT of a 1024-sample frame → complex spectrum.
await sqai.compute({ module: "fft", function: "fft", args: [samples] });

// Per-bin magnitude of that spectrum.
await sqai.compute({ module: "fft", function: "fft_magnitude", args: [spectrum] });
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# Round a frame length up to a radix-2 size before transforming.
sqai.compute(module="fft", function="next_power_of_2", args=[1000])

# Forward FFT of a 1024-sample frame → complex spectrum.
sqai.compute(module="fft", function="fft", args=[samples])

# Per-bin magnitude of that spectrum.
sqai.compute(module="fft", function="fft_magnitude", args=[spectrum])
```
{% endtab %}
{% endtabs %}

`fft.fft` returns the complex spectrum; `fft.ifft` inverts it back to the time domain; `fft.fft_magnitude` and `fft.fft_phase` split each bin into its magnitude and its `atan2` phase; `fft.power_spectrum` returns `|FFT(x)|² / N`, the power carried by each bin; and `fft.next_power_of_2` returns the smallest radix-2 length ≥ n — `next_power_of_2(1000)` is `1024` — so you can zero-pad a frame to the length the transform expects.

{% hint style="info" %}
These bins chain: `fft` → `fft_magnitude` / `fft_phase` / `power_spectrum` all consume the output of a forward transform, and `ifft` reverses it. Because each step is its own hash-pinned capability, every stage of the pipeline is independently reproducible — see [A full spectral pipeline](#a-full-spectral-pipeline) below.
{% endhint %}

## Windowing & spectral features

The `signal_processing` module builds the tapers you apply before an FFT — to cut spectral leakage — plus the features you read off the result. Window functions take a length `n` and return that many coefficients.

| Capability | What it computes |
|---|---|
| `signal_processing.hann_window` | Hann window: 0.5*(1 - cos(2πk/(n-1))) |
| `signal_processing.hamming_window` | Hamming window: 0.54 - 0.46*cos(2πk/(n-1)) |
| `signal_processing.blackman_window` | Blackman window: 0.42 - 0.5*cos(2πk/(n-1)) + 0.08*cos(4πk/(n-1)) |
| `signal_processing.apply_window` | Element-wise multiply data by window |
| `signal_processing.peak_detect` | Find local peaks above threshold |
| `signal_processing.spectral_centroid` | Weighted mean frequency |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// A 256-point Hann taper.
await sqai.compute({ module: "signal_processing", function: "hann_window", args: [256] });

// Apply a window to a frame, element-wise.
await sqai.compute({
  module: "signal_processing",
  function: "apply_window",
  args: [frame, window],
});

// Indices of local maxima above a magnitude threshold.
await sqai.compute({
  module: "signal_processing",
  function: "peak_detect",
  args: [magnitudes, 1.0],
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# A 256-point Hann taper.
sqai.compute(module="signal_processing", function="hann_window", args=[256])

# Apply a window to a frame, element-wise.
sqai.compute(
    module="signal_processing",
    function="apply_window",
    args=[frame, window],
)

# Indices of local maxima above a magnitude threshold.
sqai.compute(
    module="signal_processing",
    function="peak_detect",
    args=[magnitudes, 1.0],
)
```
{% endtab %}
{% endtabs %}

`hann_window`, `hamming_window`, and `blackman_window` each return an n-point taper as a list of coefficients — increasing sidelobe suppression at the cost of a wider main lobe; `apply_window` multiplies a frame by a window and returns the tapered frame; `peak_detect` returns the indices of local maxima that clear the threshold; and `spectral_centroid` returns the magnitude-weighted mean frequency — the spectral "center of mass," a compact brightness feature.

## Time-domain operations

The `signal.dsp` functions operate on the raw sample sequence — no transform required. Convolution, autocorrelation, running sums, differences, and trend removal.

| Capability | What it computes |
|---|---|
| `signal.dsp.convolve` | 1D convolution (full mode) |
| `signal.dsp.autocorrelation` | Autocorrelation function for lags 0, 1, ..., max_lag |
| `signal.dsp.cumsum` | Cumulative sum: result[i] = sum(data[0..i]) |
| `signal.dsp.diff` | First differences: result[i] = data[i+1] - data[i] |
| `signal.dsp.detrend_linear` | Remove linear trend from data using least-squares fit |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// Full-mode 1D convolution of a signal with a kernel.
await sqai.compute({
  module: "signal",
  function: "dsp.convolve",
  args: [[1, 2, 3, 4], [0.25, 0.5, 0.25]],
});

// Autocorrelation for lags 0..5.
await sqai.compute({
  module: "signal",
  function: "dsp.autocorrelation",
  args: [series, 5],
});

// Strip a least-squares linear trend.
await sqai.compute({ module: "signal", function: "dsp.detrend_linear", args: [series] });
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# Full-mode 1D convolution of a signal with a kernel.
sqai.compute(
    module="signal",
    function="dsp.convolve",
    args=[[1, 2, 3, 4], [0.25, 0.5, 0.25]],
)

# Autocorrelation for lags 0..5.
sqai.compute(
    module="signal",
    function="dsp.autocorrelation",
    args=[series, 5],
)

# Strip a least-squares linear trend.
sqai.compute(module="signal", function="dsp.detrend_linear", args=[series])
```
{% endtab %}
{% endtabs %}

`dsp.convolve` returns the full-mode convolution (length `len(a) + len(b) - 1`), useful for FIR filtering and smoothing; `dsp.autocorrelation` returns one value per lag from 0 to `max_lag`, exposing periodicity; `dsp.cumsum` returns the running total and `dsp.diff` the first differences (inverse operations); `dsp.detrend_linear` fits a line by least squares and returns the residual, so a downstream FFT sees the oscillation, not the ramp.

## Wavelets

The `wavelet` module is a Haar discrete wavelet transform and the pieces you extract from it — approximation and detail bands, an energy ratio, and a denoiser built on soft thresholding.

| Capability | What it computes |
|---|---|
| `wavelet.haar_forward` | 1-level Haar DWT: output = [averages..., details...] |
| `wavelet.approx_coefficients` | Extract approximation part (first half of Haar output) |
| `wavelet.detail_coefficients` | Extract detail part (second half of Haar output) |
| `wavelet.energy_ratio` | Ratio of detail energy to total energy |
| `wavelet.denoise_haar` | Denoise: forward DWT → soft threshold → inverse DWT |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// One level of Haar DWT: [averages..., details...].
await sqai.compute({
  module: "wavelet",
  function: "haar_forward",
  args: [[4, 6, 10, 12]],
});

// Forward DWT → soft-threshold → inverse DWT, in one call.
await sqai.compute({
  module: "wavelet",
  function: "denoise_haar",
  args: [noisy, 0.5],
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# One level of Haar DWT: [averages..., details...].
sqai.compute(
    module="wavelet",
    function="haar_forward",
    args=[[4, 6, 10, 12]],
)

# Forward DWT → soft-threshold → inverse DWT, in one call.
sqai.compute(
    module="wavelet",
    function="denoise_haar",
    args=[noisy, 0.5],
)
```
{% endtab %}
{% endtabs %}

`haar_forward` returns the one-level transform with the approximation (averages) in the first half and the detail (differences) in the second; `approx_coefficients` and `detail_coefficients` slice those halves out; `energy_ratio` returns the fraction of total energy carried by the detail band — a compact roughness measure; and `denoise_haar` runs the full forward-transform → soft-threshold → inverse-transform round trip and returns the cleaned signal.

## Audio & synthesis

The `audio` module generates and characterizes waveforms — tone synthesis, amplitude envelopes, decibel conversions, and pitch-to-MIDI mapping.

| Capability | What it computes |
|---|---|
| `audio.generate_sine` | Generate n_samples of a sine wave at the given frequency and sample rate |
| `audio.envelope` | Amplitude envelope: running max absolute value over a window |
| `audio.amplitude_to_db` | Convert amplitude ratio to decibels: 20 * log10(amplitude / reference) |
| `audio.db_to_amplitude` | Convert decibels to amplitude ratio: reference * 10^(db/20) |
| `audio.frequency_to_midi` | Convert frequency (Hz) to MIDI note number: 69 + 12*log2(freq/440) |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// 1024 samples of a 440 Hz tone at 44.1 kHz.
await sqai.compute({ module: "audio", function: "generate_sine", args: [440, 44100, 1024] });

// Amplitude ratio 0.5 relative to full scale, in dB.
await sqai.compute({ module: "audio", function: "amplitude_to_db", args: [0.5, 1.0] });

// Concert-A 440 Hz → MIDI note number.
await sqai.compute({ module: "audio", function: "frequency_to_midi", args: [440] });
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# 1024 samples of a 440 Hz tone at 44.1 kHz.
sqai.compute(module="audio", function="generate_sine", args=[440, 44100, 1024])

# Amplitude ratio 0.5 relative to full scale, in dB.
sqai.compute(module="audio", function="amplitude_to_db", args=[0.5, 1.0])

# Concert-A 440 Hz → MIDI note number.
sqai.compute(module="audio", function="frequency_to_midi", args=[440])
```
{% endtab %}
{% endtabs %}

`generate_sine` returns the sampled waveform; `envelope` returns the running max-absolute value over a sliding window — the amplitude outline; `amplitude_to_db` and `db_to_amplitude` are the inverse pair between a linear ratio and decibels; and `frequency_to_midi` maps a frequency to a MIDI note by `69 + 12*log2(freq/440)`, so 440 Hz lands exactly on 69 (concert A).

{% hint style="warning" %}
These are pure numeric functions — SQAI is a read-only, deterministic compute tool. `generate_sine` returns samples as data; nothing here opens an audio device, plays sound, or writes a file. There is no I/O, RNG, or write path in this domain.
{% endhint %}

## Acoustics

The `acoustics` module carries the physical sound formulas — decibel summation, distance attenuation, the Doppler shift, and material absorption.

| Capability | What it computes |
|---|---|
| `acoustics.decibel_sum_2` | Sum of two decibel levels: L = 10*log10(10^(L1/10) + 10^(L2/10)) |
| `acoustics.doppler_frequency` | Doppler effect: f' = f0 * (c + v_observer) / (c + v_source) |
| `acoustics.inverse_square_law_pressure` | SPL at distance d using inverse square law |
| `acoustics.distance_doubling_attenuation` | Attenuation when distance doubles (spherical spreading) |
| `acoustics.noise_reduction_coefficient` | Noise Reduction Coefficient: NRC = (α250+α500+α1000+α2000)/4 |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// Combine two incoherent sources at 85 dB and 88 dB.
await sqai.compute({ module: "acoustics", function: "decibel_sum_2", args: [85, 88] });

// Doppler-shifted frequency: 440 Hz source, 343 m/s sound, source at 30 m/s.
await sqai.compute({
  module: "acoustics",
  function: "doppler_frequency",
  args: [440, 343, 0, 30],
});

// Average absorption across the four octave bands.
await sqai.compute({
  module: "acoustics",
  function: "noise_reduction_coefficient",
  args: [0.35, 0.55, 0.75, 0.80],
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# Combine two incoherent sources at 85 dB and 88 dB.
sqai.compute(module="acoustics", function="decibel_sum_2", args=[85, 88])

# Doppler-shifted frequency: 440 Hz source, 343 m/s sound, source at 30 m/s.
sqai.compute(
    module="acoustics",
    function="doppler_frequency",
    args=[440, 343, 0, 30],
)

# Average absorption across the four octave bands.
sqai.compute(
    module="acoustics",
    function="noise_reduction_coefficient",
    args=[0.35, 0.55, 0.75, 0.80],
)
```
{% endtab %}
{% endtabs %}

`decibel_sum_2` returns the combined level of two incoherent sources (logarithmic, not arithmetic, addition); `doppler_frequency` returns the observed frequency given source and observer velocities; `inverse_square_law_pressure` returns the sound-pressure level at a target distance and `distance_doubling_attenuation` the drop per distance doubling under spherical spreading; and `noise_reduction_coefficient` returns the NRC, the mean absorption across the 250/500/1000/2000 Hz bands.

## Psychoacoustics

The `psychoacoustics` module models perceived sound — the Bark and critical-band scales, loudness weighting, and just-noticeable differences.

| Capability | What it computes |
|---|---|
| `psychoacoustics.bark_scale` | Bark scale value from frequency (Traunmüller 1990) |
| `psychoacoustics.critical_bandwidth` | Critical bandwidth (ERB approximation) at a center frequency |
| `psychoacoustics.equal_loudness_correction` | Approximate A-weighting correction at a frequency |
| `psychoacoustics.frequency_just_noticeable` | Just noticeable difference in frequency |
| `psychoacoustics.binaural_masking_level_diff` | Binaural masking level difference improvement |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// Bark-scale value at 1 kHz (Traunmüller 1990).
await sqai.compute({ module: "psychoacoustics", function: "bark_scale", args: [1000] });

// ERB-approximated critical bandwidth at a center frequency.
await sqai.compute({
  module: "psychoacoustics",
  function: "critical_bandwidth",
  args: [1000],
});

// Approximate A-weighting correction at 100 Hz.
await sqai.compute({
  module: "psychoacoustics",
  function: "equal_loudness_correction",
  args: [100],
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# Bark-scale value at 1 kHz (Traunmüller 1990).
sqai.compute(module="psychoacoustics", function="bark_scale", args=[1000])

# ERB-approximated critical bandwidth at a center frequency.
sqai.compute(
    module="psychoacoustics",
    function="critical_bandwidth",
    args=[1000],
)

# Approximate A-weighting correction at 100 Hz.
sqai.compute(
    module="psychoacoustics",
    function="equal_loudness_correction",
    args=[100],
)
```
{% endtab %}
{% endtabs %}

`bark_scale` returns the Bark-band value for a frequency; `critical_bandwidth` returns the ERB-approximated bandwidth around a center frequency; `equal_loudness_correction` returns the A-weighting adjustment at a frequency; `frequency_just_noticeable` returns the smallest perceptible pitch change; and `binaural_masking_level_diff` returns the detection improvement from binaural (two-ear) listening.

## Traffic-signal timing

The `traffic_signal` module carries the Webster/HCM intersection-timing formulas — cycle length, lane capacity, effective green, clearance intervals, and uniform delay.

| Capability | What it computes |
|---|---|
| `traffic_signal.cycle_length_webster` | Webster optimal cycle length: C = (1.5*L + 5) / (1 - Y) |
| `traffic_signal.capacity_lane` | Lane capacity: c = s * (g/C) |
| `traffic_signal.effective_green` | Effective green time: g = G - start_loss + end_gain |
| `traffic_signal.all_red_interval` | All-red clearance interval: AR = (W + L) / v |
| `traffic_signal.delay_uniform` | Uniform delay (Webster/HCM d1 component) |

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
// Webster optimal cycle length: 12 s lost time, critical-flow ratio 0.75.
await sqai.compute({
  module: "traffic_signal",
  function: "cycle_length_webster",
  args: [12, 0.75],
});

// Lane capacity: saturation flow, effective green, cycle length.
await sqai.compute({
  module: "traffic_signal",
  function: "capacity_lane",
  args: [1800, 27, 90],
});
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
# Webster optimal cycle length: 12 s lost time, critical-flow ratio 0.75.
sqai.compute(
    module="traffic_signal",
    function="cycle_length_webster",
    args=[12, 0.75],
)

# Lane capacity: saturation flow, effective green, cycle length.
sqai.compute(
    module="traffic_signal",
    function="capacity_lane",
    args=[1800, 27, 90],
)
```
{% endtab %}
{% endtabs %}

`cycle_length_webster` returns the delay-minimizing cycle length from total lost time and the sum of critical flow ratios; `capacity_lane` returns the per-lane capacity from the saturation flow and green ratio; `effective_green` adjusts nominal green for start loss and end gain; `all_red_interval` returns the clearance time to cross the intersection; and `delay_uniform` returns the Webster/HCM uniform-delay component per vehicle.

## A full spectral pipeline

Spectral analysis is a chain of these capabilities, each feeding the next. Every stage is its own hash-pinned `compute()`, so the whole pipeline is reproducible end to end — and installs from just three modules.

{% stepper %}
{% step %}
#### Synthesize or load the samples

Start from `audio.generate_sine` for a known tone, or bind the argument to a column of connected sensor data. Either way you hold a sample vector.
{% endstep %}
{% step %}
#### Taper the frame

Build an n-point `signal_processing.hann_window` and multiply it into the frame with `apply_window`. Tapering suppresses spectral leakage before the transform.
{% endstep %}
{% step %}
#### Transform to the frequency domain

`fft.fft` returns the complex spectrum. (Pad to a radix-2 length with `fft.next_power_of_2` first if the frame isn't already a power of two.)
{% endstep %}
{% step %}
#### Read the magnitudes and find peaks

`fft.fft_magnitude` gives per-bin magnitude; `signal_processing.peak_detect` returns the bins above a threshold — the dominant frequencies.
{% endstep %}
{% endstepper %}

{% tabs %}
{% tab title="TypeScript" icon="js" %}
```ts
import { createSQAI } from "@thyn-ai/sqai";

// Install only the three modules this pipeline touches.
const sqai = createSQAI({
  runtimeModules: ["audio", "signal_processing", "fft"],
});

// 1. A 1 kHz tone: 1024 samples at 44.1 kHz.
const tone = await sqai.compute({
  module: "audio", function: "generate_sine", args: [1000, 44100, 1024],
});

// 2. Taper the frame with a 1024-point Hann window.
const win = await sqai.compute({
  module: "signal_processing", function: "hann_window", args: [1024],
});
const framed = await sqai.compute({
  module: "signal_processing", function: "apply_window",
  args: [tone.value, win.value],
});

// 3. Forward FFT → complex spectrum, then per-bin magnitude.
const spectrum = await sqai.compute({
  module: "fft", function: "fft", args: [framed.value],
});
const mags = await sqai.compute({
  module: "fft", function: "fft_magnitude", args: [spectrum.value],
});

// 4. Bins whose magnitude clears the threshold.
const peaks = await sqai.compute({
  module: "signal_processing", function: "peak_detect", args: [mags.value, 1.0],
});
// peaks.computation_hash reproduces this exact peak list, byte-for-byte.
```
{% endtab %}
{% tab title="Python" icon="python" %}
```python
from sqai import SQAI

# Install only the three modules this pipeline touches.
sqai = SQAI(runtime_modules=["audio", "signal_processing", "fft"])

# 1. A 1 kHz tone: 1024 samples at 44.1 kHz.
tone = sqai.compute(module="audio", function="generate_sine", args=[1000, 44100, 1024])

# 2. Taper the frame with a 1024-point Hann window.
win = sqai.compute(module="signal_processing", function="hann_window", args=[1024])
framed = sqai.compute(
    module="signal_processing", function="apply_window",
    args=[tone["value"], win["value"]],
)

# 3. Forward FFT → complex spectrum, then per-bin magnitude.
spectrum = sqai.compute(module="fft", function="fft", args=[framed["value"]])
mags = sqai.compute(module="fft", function="fft_magnitude", args=[spectrum["value"]])

# 4. Bins whose magnitude clears the threshold.
peaks = sqai.compute(
    module="signal_processing", function="peak_detect",
    args=[mags["value"], 1.0],
)
# peaks["computation_hash"] reproduces this exact peak list, byte-for-byte.
```
{% endtab %}
{% endtabs %}

## Every result is reproducible

Nothing in this domain is a handwritten formula — each capability is a named entry in the pinned contract (`contract_hash` `sha256:31247fb2…`), and every `compute()` returns the value alongside its `invocation_hash`, `computation_hash`, and the full determinism envelope. FFTs, windows, wavelets, and acoustic formulas are all deterministic: with `precision_mode: "float64"` and `thread_count: 1` fixing the precision and reduction order, the same samples in yield the same value and the same `computation_hash`, in TypeScript and Python alike. See [Determinism & provenance](../determinism.md) for what each hash pins.

Bind an argument to a connected column instead of a literal — a sensor reading, a price series, a signal capture — and the result's `provenance.bindings` records the `source_name`, `fields`, `schema_revision`, `row_count`, and per-binding `input_hash`, so the spectrum is reproducible from the exact rows it read. See [Connect data](../connect-data.md).

{% hint style="success" %}
Install only what you call. Set `runtimeModules` to the packs you use — e.g. `["fft", "signal_processing", "audio"]` — and the build service compiles a signed bundle for exactly that filter. The filter changes what is installed, never what a function returns. See [Compute & filtering](../compute-and-filtering.md).
{% endhint %}

## Next steps

<table data-view="cards">
<thead><tr><th></th><th></th><th data-hidden data-card-target data-type="content-ref"></th></tr></thead>
<tbody>
<tr><td><strong>Compute & filtering</strong></td><td>The full <code>compute()</code> spec, <code>runtimeModules</code>, and binding arguments to columns.</td><td><a href="../compute-and-filtering.md">compute-and-filtering.md</a></td></tr>
<tr><td><strong>Determinism & provenance</strong></td><td>What every hash on a result means, and how they reproduce it.</td><td><a href="../determinism.md">determinism.md</a></td></tr>
<tr><td><strong>Connect data</strong></td><td>Bind these capabilities to columns of a file, SQLite, or private SQAI database.</td><td><a href="../connect-data.md">connect-data.md</a></td></tr>
<tr><td><strong>Text, crypto & data utilities</strong></td><td>The bytes-and-symbols pack — similarity, entropy, bit ops, AES, and encoding.</td><td><a href="text-crypto.md">text-crypto.md</a></td></tr>
</tbody>
</table>
