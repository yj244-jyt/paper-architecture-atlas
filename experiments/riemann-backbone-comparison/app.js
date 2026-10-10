(() => {
  const stages = [
    { id: "input", title: "Full-scene XYZ + RGB", scene: "Identical observations enter B0, M1, and M2. The synthetic cloud shows a target region, other scene points, and a distractor region.", output: "Per-point coordinates and RGB", boundary: "Fixed: cameras, fusion, cropping, color preprocessing, and point ordering.", math: String.raw`P=\{(\mathbf{x}_i,\mathbf{c}_i)\}_{i=1}^{N}` },
    { id: "phi", title: "Saliency network phi", scene: "A type-0 score is assigned to every scene point. Invariant scores can emphasize the target without rotating as vectors; saliency determines the first local region.", output: "One type-0 scalar per scene point", boundary: "Changed: backbone only. Fixed: score-to-center rule and ROI 1 selection.", math: String.raw`s_i=\phi(P)_i\in\mathbb{R}` },
    { id: "roi1", title: "ROI 1: shared local crop", scene: "The scene is reduced to points near the saliency center before the manipulation networks run. This is a shared policy operation, not a separate network in any candidate.", output: "A local, ordered point subset", boundary: "Fixed: radius, fallback, point indices, and train/test center protocol.", math: String.raw`P_1=\{\mathbf{x}_i:\|\mathbf{x}_i-\mathbf{c}_s\|<r_1\}` },
    { id: "psi1", title: "Translation network psi1", scene: "Within ROI 1, a second type-0 field becomes Softmax weights. The same weighted XYZ sum yields the target translation for every candidate.", output: "One type-0 scalar per ROI 1 point", boundary: "Changed: backbone only. Fixed: Softmax and weighted-coordinate head.", math: String.raw`\begin{aligned}u_i&=\psi_1(P_1)_i\\\alpha_i&=\operatorname{softmax}(u)_i\\\hat{\mathbf t}&=\sum_i\alpha_i\mathbf{x}_i\end{aligned}` },
    { id: "psi2", title: "Orientation network psi2", scene: "Each ROI 1 point receives three type-1 vectors. ROI 2 selects a smaller neighborhood around the predicted translation for local pooling.", output: "Three type-1 vectors per ROI 1 point", boundary: "Changed: backbone only. Fixed: ROI 2, pooling, and vector convention.", math: String.raw`\begin{aligned}P_2&=\{\mathbf{x}_i\in P_1:\|\mathbf{x}_i-\hat{\mathbf t}\|<r_2\}\\V_i&=\psi_2(P_1)_i\in\mathbb{R}^{3\times3}\\\bar V&=|P_2|^{-1}\sum_{i\in P_2}V_i\end{aligned}` },
    { id: "pose", title: "Pose construction and execution", scene: "The pooled vectors are normalized and orthogonalized by IMGS. Translation and rotation form the same 6-DoF target for the same motion-planning and execution stack.", output: "Pose (t, R), then robot command", boundary: "Fixed: IMGS, target-frame convention, planner, and success criterion.", math: String.raw`\begin{aligned}\tilde V&=\operatorname{colnorm}(\bar V)\\\hat R&=\operatorname{IMGS}(\tilde V),\quad\hat T=(\hat{\mathbf t},\hat R)\end{aligned}` }
  ];
  const models = [
    { id: "B0", kind: "Official baseline", title: "RiEMann SE(3)-Transformer", subtitle: "Four attention layers with edge-conditioned K/V in each of phi, psi1, and psi2.", ops: ["Edge K/V + attention", "Edge K/V + attention", "Edge K/V + attention", "Edge K/V + attention"], types: ["edge", "edge", "edge", "edge"], labels: ["L1", "L2", "L3", "L4"], equation: String.raw`(k_{ij},v_{ij})=\mathrm{ConvSE3}_{\ell}(\mathbf r_{ij},h_j)`, caution: "Official per-layer edge K/V path. Rerun on the same hardware; paper FPS is not the comparison value." },
    { id: "M1", kind: "Edge-conditioned control", title: "Four relative-edge attention layers", subtitle: "The first layer converts scalar RGB to the hidden typed fiber while constructing edge K/V; the same edge-conditioned mechanism repeats in all four layers.", ops: ["Edge K/V + type change", "Edge K/V + attention", "Edge K/V + attention", "Edge K/V + attention"], types: ["edge", "edge", "edge", "edge"], labels: ["L1", "L2", "L3", "L4"], equation: String.raw`(k_{ij}^{(\ell)},v_{ij}^{(\ell)})=K_{\ell}(\mathbf x_i-\mathbf x_j)h_j^{(\ell)}`, caution: "Measured trained adapter. Its learned nonnegative distance penalty is applied to each local-edge attention score." },
    { id: "M2", kind: "Nodewise-Q/K/V candidate", title: "One type transformation + node Q/K/V", subtitle: "One relative-edge aggregation creates typed features, followed by three local attention layers whose equivariant Q/K/V are computed once per node.", ops: ["Relative-edge type transformation", "Node Q/K/V + local attention", "Node Q/K/V + local attention", "Node Q/K/V + local attention"], types: ["edge", "linear", "linear", "linear"], labels: ["TYPE", "L1", "L2", "L3"], equation: String.raw`\begin{aligned}h_i^{(0)}&=|\mathcal N(i)|^{-1}\!\sum_j K_{\rm type}(\mathbf x_i-\mathbf x_j)c_j\\(q_i,k_i,v_i)&=\mathrm{Linear}_{\rm eq}(h_i)\end{aligned}`, caution: "Measured trained adapter. Nodewise projections reuse K/V across local edges; they do not turn the radius graph into global attention." }
  ];
  const scene = document.getElementById("scene");
  const stageButtons = [...document.querySelectorAll("[data-stage]")];
  const playButton = document.getElementById("play");
  const restartButton = document.getElementById("restart");
  const scrub = document.getElementById("scrub");
  const speed = document.getElementById("speed");
  const loop = document.getElementById("loop");
  const progressValue = document.getElementById("progress-value");
  const grid = document.getElementById("model-grid");
  const modeButtons = [...document.querySelectorAll("[data-mode]")];
  const taskButtons = [...document.querySelectorAll("[data-task]")];
  const NS = "http://www.w3.org/2000/svg";
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let stageIndex = 1;
  let mode = "inference";
  let progress = 0.3;
  let playing = !reduceMotion.matches;
  let lastFrame = 0;
  let robotScene = null;
  let lastRobotStage = null;
  let lastFormulaStage = null;
  let mathQueue = Promise.resolve();
  const svg = (tag, attrs = {}) => {
    const node = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    return node;
  };
  const clamp = (n, a = 0, b = 1) => Math.min(b, Math.max(a, n));
  const smooth = n => { const x = clamp(n); return x * x * (3 - 2 * x); };
  const rng = (() => { let seed = 20261009; return () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296); })();

  function makeModelCards() {
    const graph = type => type === "edge"
      ? '<svg viewBox="0 0 42 26" aria-hidden="true"><path d="M5 19 19 7 37 19 M5 19 37 19" fill="none" stroke="currentColor" stroke-width="1.5" stroke-dasharray="3 2"/><circle cx="5" cy="19" r="3" fill="currentColor"/><circle cx="19" cy="7" r="3" fill="currentColor"/><circle cx="37" cy="19" r="3" fill="currentColor"/></svg>'
      : '<svg viewBox="0 0 42 26" aria-hidden="true"><path d="M5 13h10m12 0h10" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="5" cy="13" r="3" fill="currentColor"/><rect x="16" y="6" width="10" height="14" rx="2" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="37" cy="13" r="3" fill="currentColor"/></svg>';
    grid.innerHTML = models.map(model => `<article class="model-card" data-model="${model.id}">
      <div class="model-head"><span class="model-code">${model.id}</span><span class="model-kind">${model.kind}</span></div>
      <h3>${model.title}</h3><p class="model-sub">${model.subtitle}</p>
      <div class="model-input">Same input: <span class="branch-input">full scene</span></div>
      <div class="operator-stack"><span class="signal" aria-hidden="true"></span>${model.ops.map((op, i) => `<div class="operator ${model.types[i]}">${graph(model.types[i])}<span>${op}</span><span class="layer-number">${model.labels[i]}</span></div>`).join("")}</div>
      <div class="model-output">Same output: <span class="branch-output">type-0 saliency</span></div>
      <p class="model-equation">\\(${model.equation}\\)</p><p class="model-caution">${model.caution}</p>
    </article>`).join("");
    queueMath(grid);
  }

  function queueMath(element, tex) {
    if (tex !== undefined) element.dataset.tex = tex;
    mathQueue = mathQueue.then(async () => {
      if (!window.MathJax) return;
      await window.MathJax.startup.promise;
      if (tex !== undefined) {
        if (element.dataset.tex !== tex) return;
        window.MathJax.typesetClear([element]);
        element.textContent = `\\(${tex}\\)`;
      }
      await window.MathJax.typesetPromise([element]);
      if (tex !== undefined && element.dataset.tex === tex) element.dataset.renderedTex = tex;
    }).catch(error => console.error("Math rendering failed:", error));
  }

  const points = [];
  const pointNodes = [];
  function addPoint(x, y, category) {
    const node = svg("circle", { cx: x.toFixed(1), cy: y.toFixed(1), r: "2.7", fill: "#9fb5b0" });
    scene.append(node);
    points.push({ x, y, category });
    pointNodes.push(node);
  }
  function setupScene() {
    scene.append(svg("rect", { x: 0, y: 0, width: 1000, height: 350, fill: "#f7faf8" }));
    scene.append(svg("path", { d: "M45 278 925 278 M90 277 230 317 M840 277 930 319", stroke: "#cbdad4", "stroke-width": 2, fill: "none" }));
    scene.append(svg("path", { d: "M345 238 Q478 252 607 236 M357 200 Q477 214 592 198", stroke: "#e2ece8", "stroke-width": 1, fill: "none" }));
    scene.append(svg("path", { d: "M575 87 612 87 612 232 M575 104 598 104 M575 104 575 149", stroke: "#b8cbc4", "stroke-width": 5, "stroke-linecap": "round", fill: "none" }));
    for (let i = 0; i < 76; i++) addPoint(85 + rng() * 805, 178 + rng() * 96, "scene");
    for (let i = 0; i < 105; i++) { const a = rng() * Math.PI * 2; const r = Math.sqrt(rng()); addPoint(455 + Math.cos(a) * r * 99, 176 + Math.sin(a) * r * 60, "target"); }
    for (let i = 0; i < 38; i++) { const a = rng() * Math.PI * 2; const r = Math.sqrt(rng()); addPoint(745 + Math.cos(a) * r * 60, 205 + Math.sin(a) * r * 38, "distractor"); }
    const overlay = svg("g", { id: "scene-overlay" });
    scene.append(overlay);
    setSceneView();
  }

  function setSceneView() {
    scene.setAttribute("viewBox", window.innerWidth <= 760 ? "270 55 500 250" : "0 0 1000 350");
  }

  function drawOverlay(stage, p) {
    const overlay = document.getElementById("scene-overlay");
    overlay.replaceChildren();
    if (stage === "input") {
      const x = 90 + 795 * p;
      overlay.append(svg("path", { d: `M${x.toFixed(1)} 84 V273`, fill: "none", stroke: "#007f70", "stroke-width": 2, opacity: ".8" }));
      overlay.append(svg("circle", { cx: x.toFixed(1), cy: 175, r: "7", fill: "none", stroke: "#007f70", "stroke-width": 2 }));
    }
    if (stage === "phi") {
      const r = 16 + 21 * smooth(p);
      overlay.append(svg("circle", { cx: 456, cy: 175, r: r.toFixed(1), fill: "none", stroke: "#d38a25", "stroke-width": 2, opacity: (0.5 + 0.4 * p).toFixed(2) }));
      overlay.append(svg("circle", { cx: 456, cy: 175, r: "5", fill: "#d38a25" }));
    }
    if (["roi1", "psi1", "psi2"].includes(stage)) {
      const reveal = stage === "roi1" ? smooth(p) : 1;
      overlay.append(svg("circle", { cx: 455, cy: 176, r: (15 + 120 * reveal).toFixed(1), fill: "#dff2eb", "fill-opacity": "0.16", stroke: "#00866f", "stroke-width": 2, "stroke-dasharray": "8 5", opacity: reveal.toFixed(2) }));
    }
    if (["psi1", "psi2", "pose"].includes(stage)) {
      const reveal = stage === "psi1" ? smooth(p) : 1;
      const x = 455 + 23 * reveal;
      const y = 176 - 18 * reveal;
      overlay.append(svg("path", { d: `M${x - 12} ${y}h24 M${x} ${y - 12}v24`, stroke: "#cc7222", "stroke-width": 3, "stroke-linecap": "round", opacity: reveal.toFixed(2) }));
    }
    if (["psi2", "pose"].includes(stage)) {
      const reveal = stage === "psi2" ? smooth(p) : 1;
      overlay.append(svg("circle", { cx: 478, cy: 158, r: (5 + 39 * reveal).toFixed(1), fill: "none", stroke: "#c66252", "stroke-width": 2, "stroke-dasharray": "5 4", opacity: reveal.toFixed(2) }));
      [[416,164,-27,-20],[443,193,-11,-28],[478,150,23,-28],[505,184,30,-9],[469,209,8,-26],[528,164,26,-24]].forEach(([x,y,dx,dy]) => {
        overlay.append(svg("path", { d: `M${x} ${y}l${(dx * reveal).toFixed(1)} ${(dy * reveal).toFixed(1)}`, stroke: "#b84d43", "stroke-width": 2, "stroke-linecap": "round", opacity: reveal.toFixed(2) }));
      });
    }
    if (stage === "pose") {
      const reveal = smooth(p);
      overlay.append(svg("path", { d: `M478 158l${(64 * reveal).toFixed(1)} ${(-18 * reveal).toFixed(1)} M478 158l${(-18 * reveal).toFixed(1)} ${(-58 * reveal).toFixed(1)} M478 158l${(32 * reveal).toFixed(1)} ${(37 * reveal).toFixed(1)}`, stroke: "#315d91", "stroke-width": 4, "stroke-linecap": "round", fill: "none" }));
      overlay.append(svg("circle", { cx: 478, cy: 158, r: 6, fill: "#315d91", opacity: reveal.toFixed(2) }));
    }
  }

  function renderScene() {
    const stage = stages[stageIndex].id;
    const p = progress;
    points.forEach((point, i) => {
      let opacity = 0.8, radius = 2.5, fill = "#9fb5b0";
      if (point.category === "target") { fill = "#168c77"; radius = 2.9; }
      if (point.category === "distractor") fill = "#6b89a6";
      if (stage === "input") opacity = point.x < 90 + 795 * p ? .9 : .18;
      if (stage === "phi" && point.category === "target") { const near = clamp(1 - Math.hypot((point.x - 455) / 115, (point.y - 176) / 74)); fill = near > .35 ? "#df972f" : "#168c77"; radius += 2.1 * near * smooth(p); }
      if (["roi1", "psi1", "psi2"].includes(stage) && Math.hypot(point.x - 455, point.y - 176) > 135) opacity = 1 - .87 * (stage === "roi1" ? smooth(p) : 1);
      if (stage === "psi1" && point.category === "target") { const near = clamp(1 - Math.hypot((point.x - 478) / 90, (point.y - 158) / 60)); fill = near > .35 ? "#dc8a2d" : "#168c77"; radius += 2 * near * smooth(p); }
      if (stage === "psi2" && point.category === "target" && Math.hypot(point.x - 478, point.y - 158) < 44) { fill = "#b84d43"; radius = 3.8; }
      if (stage === "pose" && point.category !== "target") opacity = .22;
      pointNodes[i].setAttribute("fill", fill);
      pointNodes[i].setAttribute("opacity", opacity.toFixed(2));
      pointNodes[i].setAttribute("r", radius.toFixed(2));
    });
    drawOverlay(stage, p);
  }

  function renderModels() {
    const stage = stages[stageIndex].id;
    const backboneActive = ["phi", "psi1", "psi2"].includes(stage);
    const input = ["input", "phi"].includes(stage) ? "full-scene XYZ + RGB" : "ROI 1 XYZ + RGB";
    const output = stage === "psi2" ? "three type-1 vector fields" : stage === "psi1" ? "type-0 translation scores" : stage === "phi" ? "type-0 saliency scores" : "shared policy interface";
    document.querySelectorAll(".model-card").forEach(card => {
      card.querySelector(".branch-input").textContent = input;
      card.querySelector(".branch-output").textContent = output;
      const stack = card.querySelector(".operator-stack");
      const inBackward = mode === "training" && progress >= .5;
      const travel = mode === "training" ? (inBackward ? (1 - progress) * 2 : progress * 2) : progress;
      card.classList.toggle("is-backward", inBackward);
      card.classList.toggle("is-irrelevant", !backboneActive);
      card.querySelector(".signal").style.setProperty("--signal-y", `${travel * Math.max(0, stack.clientHeight - 18)}px`);
      const ops = [...stack.querySelectorAll(".operator")];
      ops.forEach((op, index) => {
        op.classList.toggle("is-pulsing", backboneActive && Math.min(ops.length - 1, Math.floor(travel * ops.length)) === index);
        const edge = op.querySelector("path");
        if (edge) edge.style.strokeDashoffset = String(-progress * 18 - index * 2);
      });
    });
  }

  function syncRobotScene() {
    if (!robotScene) return;
    const id = stages[stageIndex].id;
    if (lastRobotStage !== id) {
      const steps = { input: 0, phi: 2, roi1: 3, psi1: 5, psi2: 6, pose: 8 };
      robotScene.setStep(steps[id]);
      lastRobotStage = id;
    }
    if (id === "pose") robotScene.setActionProgress(progress);
  }

  function setupRobotScene() {
    try {
      if (!window.THREE || !window.Riemann3D) throw new Error("Shared scene scripts unavailable");
      robotScene = new window.Riemann3D(document.getElementById("robot-scene"), {});
      robotScene.setMode("both");
      syncRobotScene();
    } catch (error) {
      document.getElementById("robot-error").hidden = false;
      console.warn("Shared 3D scene unavailable:", error);
    }
  }

  function render() {
    const current = stages[stageIndex];
    stageButtons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.stage === current.id)));
    document.querySelectorAll("[data-pipe]").forEach(node => node.classList.toggle("is-active", node.dataset.pipe === current.id));
    document.getElementById("scene-title").textContent = current.title;
    document.getElementById("stage-title").textContent = current.title;
    document.getElementById("stage-description").textContent = current.scene;
    document.getElementById("stage-output").textContent = current.output;
    document.getElementById("stage-boundary").textContent = current.boundary;
    if (lastFormulaStage !== current.id) {
      lastFormulaStage = current.id;
      queueMath(document.getElementById("stage-formula"), current.math);
    }
    scrub.value = String(Math.round(progress * 100));
    progressValue.value = `${Math.round(progress * 100)}%`;
    progressValue.textContent = progressValue.value;
    playButton.textContent = playing ? "Pause" : "Play";
    playButton.setAttribute("aria-label", playing ? "Pause animation" : "Play animation");
    modeButtons.forEach(button => button.setAttribute("aria-pressed", String(button.dataset.mode === mode)));
    document.getElementById("training-flow").hidden = mode !== "training";
    document.getElementById("flow-phase").textContent = mode === "inference" ? "Forward features to a typed head" : progress < .5 ? "Forward: features and typed prediction" : "Backward: shared loss to candidate backbone";
    renderScene();
    renderModels();
    syncRobotScene();
  }

  function fillResults() {
    const data = window.EXPERIMENT_RESULTS;
    const body = document.getElementById("results-body");
    if (!data || !Array.isArray(data.metrics)) return;
    const format = (value, unit) => value === null || value === undefined ? "Not measured" : `${value} ${unit}`;
    data.metrics.forEach(metric => {
      const row = document.createElement("tr");
      [metric.label, format(metric.b0, metric.unit), format(metric.m1, metric.unit), format(metric.m2, metric.unit), metric.interpretation].forEach(value => {
        const cell = document.createElement("td");
        cell.textContent = value;
        row.append(cell);
      });
      body.append(row);
    });
    if (data.status !== "planned") {
      document.getElementById("report-status").textContent = `Results updated ${data.updated}`;
      document.querySelector(".pending-mark").textContent = "Measured data available";
    }
  }

  function frame(now) {
    if (playing && lastFrame) {
      progress += Math.min((now - lastFrame) / 2700, .1) * Number(speed.value);
      if (progress >= 1) {
        if (stageIndex === stages.length - 1 && !loop.checked) { progress = 1; playing = false; }
        else { progress %= 1; stageIndex = (stageIndex + 1) % stages.length; }
      }
      render();
    }
    lastFrame = now;
    requestAnimationFrame(frame);
  }
  stageButtons.forEach(button => button.addEventListener("click", () => { stageIndex = stages.findIndex(stage => stage.id === button.dataset.stage); progress = .28; render(); }));
  modeButtons.forEach(button => button.addEventListener("click", () => { mode = button.dataset.mode; if (!["phi", "psi1", "psi2"].includes(stages[stageIndex].id)) stageIndex = 1; progress = .05; render(); }));
  taskButtons.forEach(button => button.addEventListener("click", () => {
    taskButtons.forEach(item => item.setAttribute("aria-pressed", String(item === button)));
    if (robotScene) { robotScene.setTask(button.dataset.task); lastRobotStage = null; syncRobotScene(); }
  }));
  playButton.addEventListener("click", () => { playing = !playing; lastFrame = 0; render(); });
  restartButton.addEventListener("click", () => { stageIndex = 0; progress = 0; playing = true; lastFrame = 0; render(); });
  scrub.addEventListener("input", () => { progress = Number(scrub.value) / 100; render(); });
  reduceMotion.addEventListener("change", event => { if (event.matches) { playing = false; render(); } });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { playing = false; render(); } if (robotScene) robotScene.setActive(!document.hidden); });
  window.addEventListener("resize", setSceneView);
  makeModelCards();
  setupScene();
  setupRobotScene();
  fillResults();
  render();
  requestAnimationFrame(frame);
})();
