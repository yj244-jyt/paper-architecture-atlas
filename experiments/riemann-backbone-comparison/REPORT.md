# RiEMann B0 / M1 / M2: Independent Experiment Report

**Status:** Planned; no model has been trained or benchmarked for this comparison.
**Updated:** 2026-10-09.
**Research question:** Can our SO(3)-equivariant backbone accelerate both training and inference in a RiEMann robot-manipulation policy without materially reducing geometric accuracy or closed-loop success?

## Controlled architecture

The official RiEMann policy supplies the full-scene XYZ/RGB input, a saliency network `phi`, ROI 1, a translation network `psi1`, an orientation network `psi2`, ROI 2 pooling, normalization and IMGS, and the target pose sent to an unchanged planner. RiEMann Figure 3 and Section 4.2 ground this flow. `psi2` evaluates points in ROI 1; ROI 2 selects points for pooling, not a second `psi2` forward pass.

| Candidate | Backbone in each of `phi`, `psi1`, `psi2` | Intended comparison |
|---|---|---|
| B0 | Official four-layer RiEMann SE(3)-Transformer | Re-measured baseline on the same hardware |
| M1 | Proposed layerwise relative-edge steerable message plus invariant attention | Direct replacement, typed output and quality check |
| M2 | Proposed one-time relative-edge lift, then equivariant linear Q/K/V and local invariant attention | Test reduced repeated edge-kernel work |

The three external contracts are held fixed: `phi` emits one type-0 score per scene point, `psi1` emits one type-0 score per ROI 1 point, and `psi2` emits three type-1 vectors per ROI 1 point. All candidates use the same point order, ROI definitions, output basis conversion, losses, and pose construction. M1 needs a genuine edge-message implementation; the current `e2tsp-escnn` `ConvE3` usage is nodewise coordinate-conditioned projection. M2's nodewise equivariant Q/K/V path exists as a reusable component, but its RiEMann adapter and trained performance remain unverified.

## Hypotheses

1. M2 performs fewer repeated steerable edge-kernel applications than M1 at the same depth and graph. This is a statement about the proposed computation schedule, not a measured time ratio.
2. M2 may have faster training steps and policy inference than B0 and M1, but graph construction, attention, memory traffic, optimizer behavior, and ROI overhead may erase that advantage. M1 versus B0 has no assumed runtime ordering.
3. A useful speedup must retain numerical equivariance and acceptable pose and task quality. Faster steps alone do not establish faster training if the model needs more steps to converge.

## Pre-run audit

- Record immutable source revisions, dirty diffs, data hashes, GPU/software versions, and simulator assets.
- Reproduce B0 forward/backward, checkpoint reload, and output shapes before replacement.
- Resolve the paper-versus-public-code configuration mismatch, then freeze one executable primary protocol. The paper reports A40, batch 4, 200 epochs, and learning rate `1e-4` in Appendix A.4; public Mug scripts use a different batch, schedule, and table downsampling. Do not silently combine settings.
- Establish a trajectory-level data split, at least three training seeds, fixed point/edge counts, matched RGB and geometric preprocessing, common radius graphs, and the same empty-ROI fallback.

## Execution order

1. B0 shared evaluator, small overfit test, and checkpoint equivalence.
2. M1 `phi`, `psi1`, and `psi2` individually under fixed ground-truth ROI; verify rotation, translation, permutation, gradients, and typed output conversion. Then connect predicted ROIs.
3. M2 with the same correctness tests and no extra training budget.
4. Three-seed offline comparison on the frozen protocol, then separate 2,500-point and 8,192-point measurements.
5. Paired SAPIEN Mug on Rack rollouts, followed by Plane on Shelf and Turn Faucet if assets and protocol permit. Reconstructed simulation must be labeled as such, not presented as reproduction of the paper's original simulator.

## Measurement and decision

Report forward, backward, optimizer-step time, samples/s, peak memory, and wall time to a predeclared validation-quality threshold. Report batch-1 synchronized p50/p95 time for each network, graph/ROI processing, pose construction, model-only inference, and the complete policy. Keep camera/planner/control latency separate from neural-network FPS. Report translation error, rotation geodesic error, type-0/type-1 residuals, and paired T/NI/NP/DO/ALL closed-loop success with confidence intervals and failure categories.

The dual-speed claim is supported only if training to matched quality and complete-policy inference are both faster on the same hardware, while preregistered quality and success thresholds hold. Otherwise, report which part of the hypothesis failed. Never treat the paper's reported 0.19 s as a direct comparator to a new machine.

## Results

No results are available yet. The website's results table is populated from [`results.js`](results.js); null values deliberately display as `Not measured`. Future updates must include configuration hashes, seeds, point and edge counts, uncertainty, and complete provenance beside measured values.

## Sources and interpretation

- [RiEMann paper](https://arxiv.org/abs/2403.19460), especially Figure 3, Section 4.2, Appendix A.1, A.2, and A.4.
- [Official RiEMann implementation](https://github.com/HeegerGao/RiEMann) for the executable baseline. Its server-side revision must be recorded before running.
- Our SO(3) package's `PLAN_SE3.md` and `equivariant/` architecture for the proposed components; code provenance must be recorded on the server.
- The diagrams and point cloud on this page are original teaching reconstructions. They are not trained activations, performance measurements, paper figures, or real simulator frames.
