window.EXPERIMENT_RESULTS = {
  status: "measured",
  updated: "2026-10-10",
  metrics: [
    { label: "Phi + manipulation training wall time / seed", unit: "h", b0: "11.97", m1: "18.86", m2: "8.26", interpretation: "200 Phi + 500 manipulation epochs; logs summed per seed" },
    { label: "Full-policy inference p50", unit: "ms", b0: "240.816", m1: "324.981", m2: "66.201", interpretation: "Batch 1, warm-up + CUDA synchronized" },
    { label: "Peak offline evaluation memory", unit: "MiB", b0: "18125.1", m1: "2168.7", m2: "441.1", interpretation: "Same 2,500-point held-out protocol" },
    { label: "Translation error", unit: "cm", b0: "0.7237", m1: "0.7979", m2: "1.5482", interpretation: "360 held-out frames, 3 training seeds" },
    { label: "Rotation geodesic error", unit: "deg", b0: "6.514", m1: "12.220", m2: "60.346", interpretation: "Same IMGS and target convention" },
    { label: "Closed-loop success", unit: "%", b0: "54.3", m1: "67.0", m2: "40.3", interpretation: "900 paired reconstructed SAPIEN episodes" }
  ]
};
