(() => {
  const steps = [
    ["Input", "Point features enter the backbone", "Each dot is a point with a position and RGB. The same example points enter all three candidates."],
    ["Neighbors", "Build the same local radius graph", "Both receiving points i and i' have j as a neighbor. Their relative vectors to j differ."],
    ["Lift", "Encode geometry before attention", "M1 and M2 use the same proposed relative-edge lift once before L1. B0 has no separate proposed lift."],
    ["Query", "Form queries at receiving points", "All three paths project each receiver's current typed feature into a nodewise query Q."],
    ["Key / value", "The decisive K/V difference", "B0 and M1 form K/V separately on j to i and j to i'. M2 forms K/V once at j, then gathers them along both edges."],
    ["Weights", "Score neighbors with invariant attention", "Each receiver compares its Q with incoming K. Softmax yields scalar edge weights; the marks are illustrative, not learned scores."],
    ["Aggregate", "Move weighted values to receivers", "Values travel along the graph and are summed at i and i'. Typed vectors rotate equivariantly while weights stay invariant."],
    ["Four layers", "Repeat the attention block four times", "B0 and M1 rebuild geometry-conditioned edge K/V at each layer. M2 recomputes nodewise equivariant Q/K/V instead."],
    ["Heads", "Read out the same policy interfaces", "Each candidate is used separately in phi, psi1, and psi2, producing the same required scalar or vector output types."],
    ["Gradients", "Train with the same supervision", "Loss gradients flow back through attention and trainable projections. Raw observations and discrete ROI selection are not updated."]
  ];
  const models = [
    { id: "B0", name: "Official RiEMann", color: "#315d91" },
    { id: "M1", name: "Proposed edge control", color: "#a35d16" },
    { id: "M2", name: "Proposed linear K/V", color: "#007f70" }
  ];
  const captions = {
    B0: [
      "Official input to the SE(3)-Transformer.",
      "The radius graph supplies relative geometry to every attention layer.",
      "No added lift. Geometry enters the official edge convolution inside attention.",
      "LinearSE3 creates Q from each receiver's current features.",
      "ConvSE3 makes distinct edge-indexed K/V from each relative vector.",
      "Each receiving Q scores the K on its incoming edges.",
      "Scalar weights multiply edge V; typed results are summed at each receiver.",
      "Four edge-conditioned attention blocks; a final ConvSE3 follows the stack.",
      "Separate phi and psi1 scalar heads; psi2 supplies three type-1 vectors.",
      "Official trainable SE(3) blocks receive gradients from the policy losses."
    ],
    M1: [
      "Same XYZ/RGB observations and point order as B0.",
      "Uses the same neighborhood graph and proposed lift as M2.",
      "A proposed steerable edge operator builds typed features from relative vectors.",
      "Q is projected at each node, as in the other two paths.",
      "A new steerable kernel creates different K/V for j to i and j to i'.",
      "The edge-specific K is compared with the receiving Q.",
      "Attention sums the weighted edge V at each receiver.",
      "The directional K/V kernel is applied again in all four layers.",
      "The replacement preserves the same scalar and vector head contracts.",
      "Gradients update the proposed lift and four edge-message blocks."
    ],
    M2: [
      "Same XYZ/RGB observations and point order as M1.",
      "Keeps the same neighborhood graph and proposed initial lift as M1.",
      "The identical proposed lift supplies typed, geometry-aware starting features.",
      "An equivariant linear map projects Q at each receiving node.",
      "Equivariant linear maps form K and V once at j, then gather them on edges.",
      "Receiving Q scores the gathered nodewise K on each local edge.",
      "Weighted nodewise V still travels along edges and is summed at receivers.",
      "All four later layers use nodewise Q/K/V; local edge attention remains.",
      "The same separate phi, psi1, and psi2 head types are required.",
      "Gradients update the proposed lift and four nodewise attention blocks."
    ]
  };
  const points = {
    j: { x: 74, y: 115, label: "j" },
    i: { x: 255, y: 64, label: "i" },
    ip: { x: 255, y: 168, label: "i'" },
    a: { x: 73, y: 32, label: "" },
    b: { x: 73, y: 199, label: "" }
  };
  const edges = [["j", "i"], ["j", "ip"], ["a", "i"], ["b", "ip"]];
  const NS = "http://www.w3.org/2000/svg";
  const root = document.querySelector(".edge-microscope");
  const timeline = document.getElementById("edge-timeline");
  const graphs = document.getElementById("edge-graphs");
  const slider = document.getElementById("edge-progress");
  const playButton = document.getElementById("edge-play");
  const speed = document.getElementById("edge-speed");
  const loop = document.getElementById("edge-loop");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const panels = [];
  let index = 0, phase = 0, playing = false, visible = false, interacted = false, previousFrame = 0;
  let mathQueue = Promise.resolve();
  const ease = value => { const p = Math.min(1, Math.max(0, value)); return p * p * (3 - 2 * p); };
  function svg(tag, attrs, value) {
    const element = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([key, item]) => element.setAttribute(key, String(item)));
    if (value !== undefined) element.textContent = value;
    return element;
  }
  function line(group, from, to, color, width, opacity, length = 1, dashed = false) {
    const attrs = {
      x1: from.x, y1: from.y,
      x2: from.x + (to.x - from.x) * length,
      y2: from.y + (to.y - from.y) * length,
      stroke: color, "stroke-width": width, "stroke-linecap": "round", opacity
    };
    if (dashed) attrs["stroke-dasharray"] = "4 5";
    group.append(svg("line", attrs));
  }
  function dot(group, x, y, radius, fill, opacity = 1) {
    group.append(svg("circle", { cx: x, cy: y, r: radius, fill, opacity }));
  }
  function text(group, value, x, y, color = "#40585c", size = 11) {
    group.append(svg("text", {
      x, y, fill: color, "font-size": size, "font-weight": 700,
      "font-family": "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
      "text-anchor": "middle"
    }, value));
  }
  function pulse(group, from, to, amount, color) {
    const p = ease(amount);
    dot(group, from.x + (to.x - from.x) * p, from.y + (to.y - from.y) * p, 5, color);
  }
  function formula(model, step) {
    if (step === 0) return "P=\\{(\\mathbf x_i,\\mathbf c_i)\\}_{i=1}^{N}";
    if (step === 1) return "\\mathbf r_{ij}=\\mathbf x_j-\\mathbf x_i,\\quad j\\in\\mathcal N(i)";
    if (step === 2) return model === "B0"
      ? "\\text{No separate proposed lift; geometry enters ConvSE3}"
      : "h_i^{(0)}=\\operatorname{Lift}_{\\rm edge}(\\{(\\mathbf r_{ij},\\mathbf c_j)\\}_{j\\in\\mathcal N(i)})";
    if (step === 3) return "q_i^{(\\ell)}=W_Q^{(\\ell)}h_i^{(\\ell)}";
    if (step === 4) {
      if (model === "B0") return "(k_{ij},v_{ij})=\\mathrm{ConvSE3}_{\\ell}(h_j,\\mathbf r_{ij})";
      if (model === "M1") return "k_{ij}=K^K_{\\ell}(\\mathbf r_{ij})h_j,\\quad v_{ij}=K^V_{\\ell}(\\mathbf r_{ij})h_j";
      return "k_j=W_K^{(\\ell)}h_j,\\quad v_j=W_V^{(\\ell)}h_j";
    }
    if (step === 5) return model === "M2"
      ? "a_{ij}=\\operatorname{softmax}_{j\\in\\mathcal N(i)}(\\langle q_i,k_j\\rangle/\\sqrt d)"
      : "a_{ij}=\\operatorname{softmax}_{j\\in\\mathcal N(i)}(\\langle q_i,k_{ij}\\rangle/\\sqrt d)";
    if (step === 6) return model === "M2"
      ? "z_i=\\sum_{j\\in\\mathcal N(i)}a_{ij}v_j"
      : "z_i=\\sum_{j\\in\\mathcal N(i)}a_{ij}v_{ij}";
    if (step === 7) return model === "M2"
      ? "\\ell=1,\\ldots,4\\quad\\text{with nodewise Q/K/V}"
      : "\\ell=1,\\ldots,4\\quad\\text{with edge K/V}";
    if (step === 8) return "\\phi,\\psi_1:\\ell=0;\\qquad\\psi_2:3\\times\\ell=1";
    if (model === "B0") return "\\nabla_{\\theta_{\\rm B0}}\\mathcal L";
    return model === "M1"
      ? "\\nabla_{\\theta_{\\rm lift},\\theta_{\\rm edge}}\\mathcal L"
      : "\\nabla_{\\theta_{\\rm lift},\\theta_{\\rm linear}}\\mathcal L";
  }
  function draw(panel) {
    const group = svg("g", {});
    const p = ease(phase);
    const edgeBased = panel.model.id !== "M2";
    panel.canvas.replaceChildren(group);
    group.append(svg("rect", { x: 0, y: 0, width: 330, height: 230, fill: "#f8faf9" }));
    if (index > 0) edges.forEach(([from, to]) => {
      line(group, points[from], points[to], "#9fb7b0", 1.6, index === 1 ? .85 : .48, index === 1 ? p : 1, true);
    });
    if (index === 1) {
      text(group, "r(i,j)", 161, 77, "#526d73", 10);
      text(group, "r(i',j)", 162, 163, "#526d73", 10);
    }
    if (index === 2) {
      if (panel.model.id === "B0") text(group, "no separate input lift", 165, 28, panel.model.color);
      else {
        edges.forEach(([from, to]) => {
          line(group, points[from], points[to], panel.model.color, 2.2, .7, p);
          pulse(group, points[from], points[to], phase, panel.model.color);
        });
        text(group, "relative-edge lift", 165, 28, panel.model.color);
      }
    }
    if (index === 3) ["i", "ip"].forEach(key => {
      const point = points[key];
      dot(group, point.x, point.y, 13 + 5 * p, panel.model.color, .12 + .17 * p);
      text(group, key === "i" ? "Q(i)" : "Q(i')", point.x - 7, point.y - 24, panel.model.color);
    });
    if (index === 4 || index === 7) {
      const travel = index === 7 ? (phase * 4) % 1 : phase;
      if (edgeBased) edges.slice(0, 2).forEach(([from, to], edgeIndex) => {
        line(group, points[from], points[to], panel.model.color, 3, .85);
        pulse(group, points[from], points[to], travel, panel.model.color);
        text(group, edgeIndex ? "K(i',j) / V(i',j)" : "K(i,j) / V(i,j)", 164, edgeIndex ? 158 : 80, panel.model.color, 10);
      });
      else {
        dot(group, points.j.x, points.j.y, 16 + 4 * Math.sin(Math.PI * travel), panel.model.color, .18);
        text(group, "K(j), V(j)", 74, 88, panel.model.color);
        edges.slice(0, 2).forEach(([from, to]) => {
          line(group, points[from], points[to], panel.model.color, 2.7, .85);
          pulse(group, points[from], points[to], travel, panel.model.color);
        });
        text(group, "same pair used twice", 165, 194, panel.model.color, 10);
      }
    }
    if (index === 5 || index === 6) {
      edges.forEach(([from, to], edgeIndex) => {
        line(group, points[from], points[to], panel.model.color, edgeIndex < 2 ? 3 : 2, edgeIndex < 2 ? .85 : .5);
        pulse(group, points[from], points[to], (phase + edgeIndex * .12) % 1, index === 5 ? "#d5892d" : panel.model.color);
      });
      if (index === 5) {
        text(group, "alpha(i,j)", 164, 80, "#a35d16", 10);
        text(group, "alpha(i',j)", 164, 160, "#a35d16", 10);
      } else {
        text(group, "sum at i", 264, 36, panel.model.color, 10);
        text(group, "sum at i'", 264, 194, panel.model.color, 10);
      }
    }
    if (index === 7) {
      const active = Math.min(3, Math.floor(phase * 4));
      for (let layer = 0; layer < 4; layer++) {
        group.append(svg("rect", { x: 98 + layer * 36, y: 210, width: 30, height: 14, rx: 2, fill: layer === active ? panel.model.color : "#e2eae7" }));
        text(group, String(layer + 1), 113 + layer * 36, 220, layer === active ? "#fff" : "#526d73", 9);
      }
      text(group, "L", 87, 220, panel.model.color, 10);
    }
    if (index === 8) {
      ["i", "ip"].forEach(key => dot(group, points[key].x, points[key].y, 13 + 9 * p, panel.model.color, .15));
      text(group, "phi / psi1: scalar", 165, 27, panel.model.color);
      text(group, "psi2: 3 vectors", 165, 220, panel.model.color);
    }
    if (index === 9) {
      edges.forEach(([from, to]) => {
        line(group, points[from], points[to], "#b84d43", 2, .65);
        pulse(group, points[to], points[from], phase, "#b84d43");
      });
      text(group, "loss gradient", 165, 27, "#b84d43");
      text(group, "parameters update", 165, 220, "#b84d43", 10);
    }
    Object.entries(points).forEach(([key, point]) => {
      const receiver = key === "i" || key === "ip";
      const source = key === "j";
      const fill = receiver ? "#315d91" : source ? "#617980" : "#a8bbb5";
      const scale = index === 0 ? .25 + .75 * p : 1;
      dot(group, point.x, point.y, (receiver || source ? 8 : 5.5) * scale, fill, index === 0 ? .25 + .75 * p : 1);
      if (point.label) text(group, point.label, point.x + (receiver ? 16 : -15), point.y - 11, "#263c42", 12);
    });
  }
  function updateMath(element, tex) {
    if (element.dataset.tex === tex) return;
    element.dataset.tex = tex;
    mathQueue = mathQueue.then(async () => {
      if (!window.MathJax || element.dataset.tex !== tex) return;
      await window.MathJax.startup.promise;
      if (element.dataset.tex !== tex) return;
      window.MathJax.typesetClear([element]);
      element.textContent = "\\(" + tex + "\\)";
      await window.MathJax.typesetPromise([element]);
    }).catch(error => console.error("Point graph math rendering failed:", error));
  }
  function updateStep() {
    document.getElementById("edge-step-count").textContent = String(index + 1).padStart(2, "0") + " / " + steps.length;
    document.getElementById("edge-step-title").textContent = steps[index][1];
    document.getElementById("edge-step-description").textContent = steps[index][2];
    [...timeline.children].forEach((button, number) => {
      if (number === index) button.setAttribute("aria-current", "step");
      else button.removeAttribute("aria-current");
    });
    const active = timeline.children[index];
    const track = timeline.getBoundingClientRect();
    const item = active.getBoundingClientRect();
    timeline.scrollLeft += item.left - track.left - (track.width - item.width) / 2;
    panels.forEach(panel => {
      panel.caption.textContent = captions[panel.model.id][index];
      updateMath(panel.math, formula(panel.model.id, index));
    });
  }
  function render() {
    slider.value = String(Math.round(phase * 100));
    const output = document.getElementById("edge-progress-value");
    output.value = Math.round(phase * 100) + "%";
    output.textContent = output.value;
    playButton.textContent = playing ? "❚❚" : "▶";
    playButton.setAttribute("aria-label", playing ? "Pause point graph animation" : "Play point graph animation");
    playButton.title = playing ? "Pause animation" : "Play animation";
    panels.forEach(draw);
  }
  function select(step) {
    index = Math.min(steps.length - 1, Math.max(0, step));
    phase = 0;
    updateStep();
    render();
  }
  steps.forEach((step, number) => {
    const button = document.createElement("button");
    const counter = document.createElement("span");
    button.type = "button";
    counter.textContent = String(number + 1).padStart(2, "0");
    button.append(counter, document.createTextNode(step[0]));
    button.setAttribute("aria-label", "Step " + (number + 1) + ": " + step[1]);
    button.addEventListener("click", () => { interacted = true; playing = false; select(number); });
    timeline.append(button);
  });
  models.forEach(model => {
    const article = document.createElement("article");
    article.className = "edge-graph-panel";
    article.dataset.graphModel = model.id;
    const head = document.createElement("div");
    head.className = "edge-graph-head";
    const name = document.createElement("strong");
    name.textContent = model.id;
    const kind = document.createElement("span");
    kind.textContent = model.name;
    head.append(name, kind);
    const canvas = svg("svg", { class: "edge-graph-svg", viewBox: "0 0 330 230", role: "img", "aria-label": model.id + " point graph for the selected computation step" });
    const caption = document.createElement("div");
    caption.className = "edge-graph-caption";
    const math = document.createElement("div");
    math.className = "edge-graph-math";
    math.setAttribute("aria-label", model.id + " schematic equation");
    article.append(head, canvas, caption, math);
    graphs.append(article);
    panels.push({ model, canvas, caption, math });
  });
  document.getElementById("edge-prev").addEventListener("click", () => { interacted = true; playing = false; select(index - 1); });
  document.getElementById("edge-next").addEventListener("click", () => { interacted = true; playing = false; select(index + 1); });
  playButton.addEventListener("click", () => { interacted = true; playing = !playing; previousFrame = 0; render(); });
  slider.addEventListener("input", () => { interacted = true; playing = false; phase = Number(slider.value) / 100; render(); });
  reduceMotion.addEventListener("change", event => { if (event.matches) { playing = false; render(); } });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { playing = false; render(); } });
  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (!visible) { playing = false; previousFrame = 0; }
    else if (!interacted && !reduceMotion.matches) { playing = true; previousFrame = 0; }
    render();
  }, { threshold: .12 }).observe(root);
  function frame(now) {
    if (playing && visible && previousFrame) {
      phase += Math.min((now - previousFrame) / 2600, .08) * Number(speed.value);
      if (phase >= 1) {
        if (index === steps.length - 1 && !loop.checked) {
          phase = 1;
          playing = false;
        } else {
          phase %= 1;
          index = (index + 1) % steps.length;
          updateStep();
        }
      }
      render();
    }
    previousFrame = now;
    requestAnimationFrame(frame);
  }
  updateStep();
  render();
  requestAnimationFrame(frame);
})();
