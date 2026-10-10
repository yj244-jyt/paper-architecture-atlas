(() => {
  "use strict";

  const models = [
    {
      id: "B0",
      name: "Official RiEMann",
      color: "#315d91",
      timing: "Inside attention L1",
      caption: "B0 has no separate entry transform. Its first ConvSE3 attention block uses every relative edge while producing typed edge K/V from the scalar RGB features.",
      typeFormula: "(k_{ij},v_{ij})=\\operatorname{ConvSE3}(h_j,\\Delta_{j\\to i})",
      qkvTitle: "Edge-specific K/V",
      qkvText: "Q is nodewise. K and V are rebuilt for every directed edge, so the same source point j produces different K/V when sent to different receivers.",
      qkvFormula: "q_i=W_Qh_i,\\quad(k_{ij},v_{ij})=K_\\ell(\\Delta_{j\\to i})h_j",
      scoreFormula: "\\alpha_{ij}=\\operatorname{softmax}_{j\\in\\mathcal N(i)}(q_i^\\top k_{ij}/\\sqrt d),\\quad z_i=\\sum_j\\alpha_{ij}v_{ij}",
      facts: ["local radius graph", "4 edge-K/V layers", "geometry enters K/V"]
    },
    {
      id: "M1",
      name: "Relative-edge control",
      color: "#a35d16",
      timing: "Inside attention L1",
      caption: "M1 also has no standalone entry module. Its first edge-attention layer changes RGB scalars into the hidden typed fiber; the same edge-conditioned K/V construction repeats in all four layers.",
      typeFormula: "(k_{ij}^{(1)},v_{ij}^{(1)})=K_1(\\Delta_{j\\to i})c_j",
      qkvTitle: "Edge-specific K/V + distance penalty",
      qkvText: "Each edge gets its own steerable K/V. M1 also subtracts a learned nonnegative penalty proportional to edge length before the neighborhood Softmax.",
      qkvFormula: "q_i=W_Qh_i,\\quad(k_{ij},v_{ij})=K_\\ell(\\Delta_{j\\to i})h_j",
      scoreFormula: "\\alpha_{ij}=\\operatorname{softmax}_{j\\in\\mathcal N(i)}(q_i^\\top k_{ij}/\\sqrt d-\\beta_\\ell\\lVert\\Delta_{j\\to i}\\rVert/R)",
      facts: ["local radius graph", "4 edge-K/V layers", "edge K/V computed repeatedly"]
    },
    {
      id: "M2",
      name: "Nodewise-Q/K/V candidate",
      color: "#007f70",
      timing: "Once before attention",
      caption: "M2 first averages steerable contributions from the radius neighborhood to create a mixed typed feature at each node. Later attention layers do not rebuild directional K/V on every edge.",
      typeFormula: "h_i^{(0)}=|\\mathcal N(i)|^{-1}\\sum_{j\\in\\mathcal N(i)}K_{\\rm type}(\\Delta_{j\\to i})c_j",
      qkvTitle: "Nodewise Q/K/V, gathered on local edges",
      qkvText: "Q, K, and V are computed once per node per layer. A neighbor's K/V can be reused on every outgoing edge; the radius graph still limits which pairs interact.",
      qkvFormula: "(q_i,k_i,v_i)=\\operatorname{Linear}_{\\rm eq}(h_i)",
      scoreFormula: "\\alpha_{ij}=\\operatorname{softmax}_{j\\in\\mathcal N(i)}(q_i^\\top k_j/\\sqrt d-\\eta_\\ell\\lVert\\Delta_{j\\to i}\\rVert\\log N),\\quad z_i=\\sum_j\\alpha_{ij}v_j",
      facts: ["local radius graph", "1 type transform + 3 attention layers", "node K/V reused across edges"]
    }
  ];

  const NS = "http://www.w3.org/2000/svg";
  const root = document.querySelector(".edge-microscope");
  const graphs = document.getElementById("edge-graphs");
  const comparison = document.getElementById("qkv-comparison");
  const slider = document.getElementById("edge-progress");
  const playButton = document.getElementById("edge-play");
  const speed = document.getElementById("edge-speed");
  const loop = document.getElementById("edge-loop");
  const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  const panels = [];
  let phase = 0;
  let playing = false;
  let visible = false;
  let interacted = false;
  let previousFrame = 0;
  let mathQueue = Promise.resolve();

  const center = { x: 180, y: 128 };
  const neighbors = Array.from({ length: 9 }, (_, index) => {
    const angle = -Math.PI / 2 + index * (Math.PI * 2 / 9);
    return {
      x: center.x + Math.cos(angle) * 108,
      y: center.y + Math.sin(angle) * 79,
      label: index === 2 ? "j" : ""
    };
  });

  const clamp = value => Math.max(0, Math.min(1, value));
  const ease = value => {
    const p = clamp(value);
    return p * p * (3 - 2 * p);
  };
  const svg = (tag, attrs = {}, value) => {
    const element = document.createElementNS(NS, tag);
    Object.entries(attrs).forEach(([key, item]) => element.setAttribute(key, String(item)));
    if (value !== undefined) element.textContent = value;
    return element;
  };
  const drawLine = (group, from, to, attrs = {}) => group.append(svg("line", {
    x1: from.x, y1: from.y, x2: to.x, y2: to.y,
    stroke: "#a9bcb6", "stroke-width": 1.4, "stroke-linecap": "round",
    ...attrs
  }));
  const drawDot = (group, point, radius, fill, opacity = 1) => group.append(svg("circle", {
    cx: point.x, cy: point.y, r: radius, fill, opacity
  }));
  const drawText = (group, value, x, y, color = "#40585c", size = 10, anchor = "middle") => group.append(svg("text", {
    x, y, fill: color, "font-size": size, "font-weight": 700,
    "font-family": "-apple-system, BlinkMacSystemFont, Segoe UI, sans-serif",
    "text-anchor": anchor
  }, value));

  function updateMath(element, tex) {
    element.dataset.tex = tex;
    mathQueue = mathQueue.then(async () => {
      if (!window.MathJax || element.dataset.tex !== tex) return;
      await window.MathJax.startup.promise;
      window.MathJax.typesetClear([element]);
      element.textContent = `\\(${tex}\\)`;
      await window.MathJax.typesetPromise([element]);
    }).catch(error => console.error("Relative-edge math rendering failed:", error));
  }

  function drawTypedGlyph(group, model, amount) {
    const opacity = .2 + .8 * ease(amount);
    group.append(svg("circle", { cx:center.x, cy:center.y, r:24, fill:model.color, opacity:.08 + .08 * amount }));
    drawLine(group, {x:center.x-19,y:center.y+18}, {x:center.x+19,y:center.y-18}, {stroke:model.color,"stroke-width":2.2,opacity});
    drawLine(group, {x:center.x-19,y:center.y-18}, {x:center.x+19,y:center.y+18}, {stroke:model.color,"stroke-width":2.2,opacity});
    group.append(svg("rect", {x:center.x-5,y:center.y-5,width:10,height:10,rx:2,fill:model.color,opacity}));
  }

  function draw(panel) {
    const model = panel.model;
    const group = svg("g");
    panel.canvas.replaceChildren(group);
    group.append(svg("rect", { x:0, y:0, width:360, height:260, fill:"#f8faf9" }));
    group.append(svg("ellipse", { cx:center.x, cy:center.y, rx:124, ry:94, fill:"none", stroke:"#d7e2de", "stroke-width":1.2, "stroke-dasharray":"4 5" }));
    drawText(group, "radius neighborhood N(i)", center.x, 247, "#6d8185", 9);

    neighbors.forEach((neighbor, index) => {
      drawLine(group, neighbor, center, {stroke:"#a6bab4","stroke-dasharray":"4 5",opacity:.72});
      const travel = (phase * 1.22 + index * .105) % 1;
      const p = ease(travel);
      const moving = {
        x: neighbor.x + (center.x - neighbor.x) * p,
        y: neighbor.y + (center.y - neighbor.y) * p
      };
      drawDot(group, moving, model.id === "M2" ? 4.8 : 4.1, model.color, .45 + .55 * Math.sin(Math.PI * p));
      drawDot(group, neighbor, 6.2, "#6f8588");
      if (neighbor.label) {
        drawText(group, "j", neighbor.x + 13, neighbor.y - 9, "#263c42", 11);
        drawLine(group, center, neighbor, {stroke:"#d38a25","stroke-width":2.2,opacity:.95});
        drawText(group, "r(i,j)", (center.x + neighbor.x) / 2 + 13, (center.y + neighbor.y) / 2 - 7, "#9a5c17", 9);
      }
    });

    drawDot(group, center, 10, "#315d91");
    drawText(group, "i", center.x + 17, center.y - 12, "#263c42", 12);
    drawTypedGlyph(group, model, phase);
    drawText(group, model.timing, center.x, 20, model.color, 10);
    drawText(group, model.id === "M2" ? "average typed edge contributions" : "type change occurs with edge K/V", center.x, 226, model.color, 9);
  }

  function makePanels() {
    models.forEach(model => {
      const article = document.createElement("article");
      article.className = "edge-graph-panel";
      article.dataset.graphModel = model.id;
      const head = document.createElement("div");
      head.className = "edge-graph-head";
      const code = document.createElement("strong");
      code.textContent = model.id;
      const name = document.createElement("span");
      name.textContent = model.name;
      head.append(code, name);
      const canvas = svg("svg", {
        class:"edge-graph-svg", viewBox:"0 0 360 260", role:"img",
        "aria-label":`${model.id}: center receiver with a ring of radius-graph neighbors during the first relative-edge type transformation`
      });
      const caption = document.createElement("div");
      caption.className = "edge-graph-caption";
      caption.textContent = model.caption;
      const math = document.createElement("div");
      math.className = "edge-graph-math";
      math.setAttribute("aria-label", `${model.id} first type transformation equation`);
      article.append(head, canvas, caption, math);
      graphs.append(article);
      panels.push({model, canvas});
      updateMath(math, model.typeFormula);
    });
  }

  function makeComparison() {
    models.forEach(model => {
      const article = document.createElement("article");
      article.className = "qkv-card";
      article.dataset.graphModel = model.id;
      const head = document.createElement("div");
      head.className = "qkv-card-head";
      head.append(Object.assign(document.createElement("strong"), {textContent:model.id}), Object.assign(document.createElement("span"), {textContent:model.qkvTitle}));
      const body = document.createElement("p");
      body.textContent = model.qkvText;
      const projection = document.createElement("div");
      projection.className = "qkv-formula";
      const score = document.createElement("div");
      score.className = "qkv-formula score";
      const facts = document.createElement("div");
      facts.className = "qkv-facts";
      model.facts.forEach(value => facts.append(Object.assign(document.createElement("span"), {textContent:value})));
      article.append(head, body, projection, score, facts);
      comparison.append(article);
      updateMath(projection, model.qkvFormula);
      updateMath(score, model.scoreFormula);
    });
  }

  function render() {
    slider.value = String(Math.round(phase * 100));
    const output = document.getElementById("edge-progress-value");
    output.value = `${Math.round(phase * 100)}%`;
    output.textContent = output.value;
    playButton.textContent = playing ? "||" : ">";
    playButton.setAttribute("aria-label", playing ? "Pause relative-edge type transformation" : "Play relative-edge type transformation");
    playButton.title = playing ? "Pause animation" : "Play animation";
    panels.forEach(draw);
  }

  playButton.addEventListener("click", () => {
    interacted = true;
    playing = !playing;
    previousFrame = 0;
    render();
  });
  slider.addEventListener("input", () => {
    interacted = true;
    playing = false;
    phase = Number(slider.value) / 100;
    render();
  });
  reduceMotion.addEventListener("change", event => {
    if (event.matches) playing = false;
    render();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) playing = false;
    render();
  });
  new IntersectionObserver(entries => {
    visible = entries[0].isIntersecting;
    if (!visible) {
      playing = false;
      previousFrame = 0;
    } else if (!interacted && !reduceMotion.matches) {
      playing = true;
      previousFrame = 0;
    }
    render();
  }, {threshold:.12}).observe(root);

  function frame(now) {
    if (playing && visible && previousFrame) {
      phase += Math.min((now - previousFrame) / 3000, .08) * Number(speed.value);
      if (phase >= 1) {
        if (loop.checked) phase %= 1;
        else { phase = 1; playing = false; }
      }
      render();
    }
    previousFrame = now;
    requestAnimationFrame(frame);
  }

  makePanels();
  makeComparison();
  render();
  requestAnimationFrame(frame);
})();
