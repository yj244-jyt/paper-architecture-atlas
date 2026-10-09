window.EXPERIMENT_RESULTS = {
  status: "planned",
  updated: "2026-10-09",
  metrics: [
    { label: "Training step", unit: "ms", b0: null, m1: null, m2: null, interpretation: "Same batch, GPU, and optimizer step" },
    { label: "Time to matched validation quality", unit: "min", b0: null, m1: null, m2: null, interpretation: "Threshold fixed before final runs" },
    { label: "Full-policy inference p50 / p95", unit: "ms", b0: null, m1: null, m2: null, interpretation: "Batch 1, same point-count protocol" },
    { label: "Peak training memory", unit: "GiB", b0: null, m1: null, m2: null, interpretation: "Include all three training phases" },
    { label: "Translation error", unit: "cm", b0: null, m1: null, m2: null, interpretation: "Held-out trajectory split" },
    { label: "Rotation geodesic error", unit: "deg", b0: null, m1: null, m2: null, interpretation: "Same IMGS and target convention" },
    { label: "Closed-loop success", unit: "%", b0: null, m1: null, m2: null, interpretation: "Paired scene seeds and confidence interval" }
  ]
};
