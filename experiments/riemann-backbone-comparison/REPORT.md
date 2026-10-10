# RiEMann B0 / M1 / M2: Independent Experiment Report

**Status:** Completed.

**Updated:** 2026-10-10.
**Research question:** Can an alternative SO(3)-equivariant backbone accelerate training and inference in a RiEMann robot-manipulation policy without materially reducing geometric accuracy or closed-loop success?

## Controlled architecture

The policy flow is fixed around the tested backbone: full-scene XYZ/RGB input, saliency network `phi`, ROI 1, translation network `psi1`, orientation network `psi2`, ROI 2 pooling, IMGS pose construction, and the same execution stack. `psi2` evaluates points in ROI 1; ROI 2 selects points for pooling rather than triggering a second `psi2` pass.

| Candidate | Implemented backbone in each of `phi`, `psi1`, `psi2` | Geometric computation |
|---|---|---|
| B0 | Official four-layer RiEMann SE(3)-Transformer | Nodewise Q; edge-specific K/V in every attention layer |
| M1 | Four `RelativeEdgeTransformerLayer` blocks | The first layer changes scalar RGB into the hidden typed fiber while constructing edge K/V; all four layers use edge-specific K/V and a learned distance penalty |
| M2 | One relative-edge type transformation, then three `EquivariantTransformer` blocks | Mean-aggregated typed edge contributions at entry; nodewise equivariant Q/K/V in each later local-attention layer, with distance bias |

The implementation stores a directed edge from source `j` to receiver `i` and passes `Delta_(j->i) = x_i - x_j`. If the displayed convention is `r_ij = x_j - x_i`, then `Delta_(j->i) = -r_ij`; this is a sign convention, not a different neighborhood.

All three tested models use local radius graphs. Nodewise Q/K/V in M2 means projections are computed once per node and gathered along local edges; it does not mean global attention. The reusable geometry library can also center coordinates as `(x_i - mean(x)) / s`, but that creates a translation-free type-1 node reference and does not compute attention weights. The trained M2 adapter uses pairwise relative edges for its input type transformation.

The code variable `lift` refers only to M2's one-time conversion from scalar RGB into mixed typed features using relative geometry. Because this name is project-local and ambiguous, the public visualization calls the operation a **relative-edge type transformation**.

## What the comparison establishes

| Contrast | Supported reading | Important limit |
|---|---|---|
| B0 vs M1 | Practical comparison of the official backbone and the new edge-conditioned operator family | Several implementation details differ, so it is not an operator-only causal estimate |
| M1 vs M2 | Mechanism comparison between repeated edge-specific K/V and a one-time type transformation followed by nodewise Q/K/V | The entry stages and attention depths differ; this is not a clean single-variable ablation |
| B0 vs M2 | Primary practical speed, memory, offline-quality, and task-success comparison | A speed win does not imply quality preservation |

## Executed protocol

- Four NVIDIA L20Z GPUs were used for training. Each model used three seeds, 2,500 input points, batch 1, FP32, an 8/2 trajectory split, 200 `phi` epochs, and 500 manipulation epochs.
- Held-out prediction used the learned `phi` center. Offline metrics aggregate 360 held-out frames across the three seeds.
- Inference timings use batch 1, warm-up, and CUDA synchronization.
- The reconstructed closed-loop benchmark uses T, NI, NP, DO, and ALL conditions, 20 scene seeds, and 900 paired SAPIEN episodes in total.
- The success rule requires bilateral contact followed by 120 physics steps above `z = 0.15 m`.

## Principal results

| Metric | B0 | M1 | M2 |
|---|---:|---:|---:|
| Training wall time per seed, `phi` + manipulation | 11.97 h | 18.86 h | 8.26 h |
| Full-policy inference p50 | 240.816 ms | 324.981 ms | 66.201 ms |
| Peak offline-evaluation memory | 18,125.1 MiB | 2,168.7 MiB | 441.1 MiB |
| Translation error | 0.7237 cm | 0.7979 cm | 1.5482 cm |
| Rotation geodesic error | 6.514 deg | 12.220 deg | 60.346 deg |
| Reconstructed closed-loop success | 54.3% | 67.0% | 40.3% |

M2 is the clear efficiency winner: its median full-policy inference is about 3.64 times faster than B0 and it uses about 2.4% of B0's peak offline-evaluation memory. That efficiency does not preserve quality. M2 more than doubles translation error, increases rotation error by about 9.3 times, and lowers reconstructed closed-loop success by 14 percentage points relative to B0. M1 has the highest reconstructed success but is slower than B0, showing that parameter and memory reductions do not guarantee lower latency when edge-conditioned kernels repeat at every layer.

The original combined speed-and-quality hypothesis is therefore only partially supported. M2 validates the expected computational advantage of reusing nodewise K/V, but its geometric and task degradation is too large to call the replacement equivalent.

## Scope and provenance

The simulation is a transparent reconstructed proxy because the paper's private simulator assets and GPU-rendered original evaluation environment were unavailable. It must not be presented as a reproduction of the paper's published success benchmark. The web page uses exported saved scene observations for representative success and failure cases; they are not newly modeled illustrations.

Page data are stored in [`results.js`](results.js) and the experimental visualization assets beside this report. The complete CSVs, hashes, commands, failure taxonomy, checkpoints, and detailed Chinese analysis remain in the experiment workspace rather than this public site.

Primary references: the [RiEMann paper](https://arxiv.org/abs/2403.19460) and the [official attention implementation](https://github.com/HeegerGao/RiEMann/blob/main/networks/se3_transformer/model/layers/attention.py). The B0/M1/M2 integration and all reported measurements are independent experimental work, not claims by the RiEMann authors.
