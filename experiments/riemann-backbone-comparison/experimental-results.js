(() => {
  "use strict";

  const COLORS = { B0: "#315d91", M1: "#a35d16", M2: "#007f70" };
  const CONDITION_COLORS = { T: "#315d91", NI: "#5a877e", NP: "#d38a25", DO: "#b84d43", ALL: "#6f5a8e" };
  const conditions = ["T", "NI", "NP", "DO", "ALL"];
  const models = ["B0", "M1", "M2"];
  const conditionMeta = {
    T: { name: "Training distribution", change: "Familiar object instance, pose, and surroundings" },
    NI: { name: "New instance", change: "Object instance changes; pose stays familiar" },
    NP: { name: "New pose", change: "Target pose and position change" },
    DO: { name: "Distracting objects", change: "Distractors are added around the target" },
    ALL: { name: "All factors", change: "New instance + new pose + distractors" }
  };
  const summary = [
    ["T", { B0: [60, 60, .9398, 1], M1: [59, 60, .9114, .9971], M2: [56, 60, .8407, .9738] }],
    ["NI", { B0: [60, 60, .9398, 1], M1: [60, 60, .9398, 1], M2: [60, 60, .9398, 1] }],
    ["NP", { B0: [11, 60, .1056, .2992], M1: [34, 60, .4410, .6843], M2: [0, 60, 0, .0602] }],
    ["DO", { B0: [20, 60, .2273, .4594], M1: [36, 60, .4737, .7143], M2: [4, 60, .0262, .1593] }],
    ["ALL", { B0: [12, 60, .1183, .3178], M1: [12, 60, .1183, .3178], M2: [1, 60, .0029, .0886] }]
  ];
  const quality = [
    { model: "B0", params: "736,340", translation: "0.7237", rotation: "6.514", modelMs: "230.977", e2eMs: "240.816", memory: "18,125.1" },
    { model: "M1", params: "93,706", translation: "0.7979", rotation: "12.220", modelMs: "305.014", e2eMs: "324.981", memory: "2,168.7" },
    { model: "M2", params: "12,955", translation: "1.5482", rotation: "60.346", modelMs: "40.841", e2eMs: "66.201", memory: "441.1" }
  ];
  const training = [
    { model: "B0", phi: "5.14", mani: "6.82", total: "11.97", epoch: "92.8 / 49.1" },
    { model: "M1", phi: "7.47", mani: "11.36", total: "18.86", epoch: "134.4 / 81.8" },
    { model: "M2", phi: "1.73", mani: "6.50", total: "8.26", epoch: "31.1 / 46.8" }
  ];
  const significance = [
    { model: "M1", scope: "model-only", speed: "0.755x", ci: "[0.754, 0.756]", delta: "−74.967 ms", p: "not faster", tone: "slow" },
    { model: "M1", scope: "end-to-end", speed: "0.741x", ci: "[0.738, 0.743]", delta: "−84.916 ms", p: "not faster", tone: "slow" },
    { model: "M2", scope: "model-only", speed: "5.556x", ci: "[5.531, 5.579]", delta: "+189.545 ms", p: "p < 1e−4", tone: "fast" },
    { model: "M2", scope: "end-to-end", speed: "3.628x", ci: "[3.590, 3.665]", delta: "+175.569 ms", p: "p < 1e−4", tone: "fast" },
    { model: "M1", scope: "overall success", speed: "+12.7 pp", ci: "B0 54.3% → M1 67.0%", delta: "paired McNemar", p: "p = 5.853955e−6", tone: "fast" },
    { model: "M2", scope: "overall success", speed: "−14.0 pp", ci: "B0 54.3% → M2 40.3%", delta: "paired McNemar", p: "p = 1.3125856e−10", tone: "slow" }
  ];
  const readings = [
    ["T", "Near ceiling", "All models solve the familiar condition. The small M1/M2 differences are not where the architectures separate."],
    ["NI", "Near ceiling", "All models reach 100%. This is a useful sanity check, but it has little power to rank the backbones."],
    ["NP", "M1 advantage", "M1 reaches 56.7% versus B0 at 18.3%; M2 reaches 0%. The paired differences isolate the new-pose response."],
    ["DO", "M1 advantage", "M1 reaches 60.0% versus B0 at 33.3%; M2 falls to 6.7%. Distractors expose orientation and workspace failures."],
    ["ALL", "Hard combined case", "M1 matches B0 at 20.0%, while M2 is 1.7%. Combined novelty remains the dominant unresolved challenge."]
  ];

  // Representative real episode records. Coordinates are in the SAPIEN world frame.
  const cases = [
    {m:"B0",c:"T",s:0,n:0,ok:true,o:"success",t:[.4574,-.0294,.05],p:[.4670,-.0685,.0882],g:[.4578,-.0888,.2086],h:.2464},
    {m:"B0",c:"NI",s:0,n:0,ok:true,o:"success",t:[.4525,-.0464,.06],p:[.4552,-.0768,.0942],g:[.4398,-.0921,.2146],h:.2414},
    {m:"B0",c:"NP",s:0,n:0,ok:false,o:"policy_invalid",t:[.4456,.1384,.07],p:[.4241,.147,.0982],g:[.4217,.0642,.008],h:null},
    {m:"B0",c:"NP",s:1,n:0,ok:true,o:"success",t:[.4456,.1384,.07],p:[.4211,.0973,.1031],g:[.3155,.1027,.1648],h:.2737},
    {m:"B0",c:"DO",s:0,n:0,ok:true,o:"success",t:[.4701,-.049,.06],p:[.4609,-.0502,.1251],g:[.4699,-.0522,.2471],h:.2331},
    {m:"B0",c:"DO",s:0,n:5,ok:false,o:"policy_invalid",t:[.471,-.0516,.06],p:[.5134,-.0383,.0626],g:[.4334,-.0358,-.03],h:null},
    {m:"B0",c:"ALL",s:0,n:0,ok:false,o:"policy_invalid",t:[.4398,.1141,.06],p:[.7123,.0292,.0441],g:[.7151,-.0931,.0432],h:null},
    {m:"B0",c:"ALL",s:0,n:5,ok:true,o:"success",t:[.4281,.1154,.06],p:[.4265,.127,.0877],g:[.3538,.1166,.1856],h:.237},
    {m:"M1",c:"T",s:0,n:0,ok:true,o:"success",t:[.4574,-.0294,.05],p:[.4711,-.0721,.0802],g:[.4603,-.0983,.1993],h:.2389},
    {m:"M1",c:"T",s:2,n:17,ok:false,o:"execution_grasp",t:[.4597,-.0108,.05],p:[.4717,-.0562,.0841],g:[.4566,-.0774,.2036],h:null},
    {m:"M1",c:"NI",s:0,n:0,ok:true,o:"success",t:[.4525,-.0464,.06],p:[.4516,-.0743,.0937],g:[.4237,-.0908,.2118],h:.2402},
    {m:"M1",c:"NP",s:0,n:0,ok:false,o:"policy_invalid",t:[.4456,.1384,.07],p:[.4408,.1126,.0809],g:[.5042,.0704,-.015],h:null},
    {m:"M1",c:"NP",s:0,n:1,ok:true,o:"success",t:[.4133,.1482,.07],p:[.4167,.1243,.0952],g:[.4766,.0178,.0891],h:.2379},
    {m:"M1",c:"DO",s:0,n:0,ok:true,o:"success",t:[.4701,-.049,.06],p:[.4569,-.0459,.116],g:[.4746,-.0425,.2371],h:.2431},
    {m:"M1",c:"DO",s:1,n:0,ok:false,o:"execution_grasp",t:[.4701,-.049,.06],p:[.4389,-.0339,.0973],g:[.4353,-.0162,.2183],h:null},
    {m:"M1",c:"ALL",s:0,n:0,ok:false,o:"policy_invalid",t:[.4398,.1141,.06],p:[.4781,.1023,.0716],g:[.5148,.1825,-.0132],h:null},
    {m:"M1",c:"ALL",s:0,n:6,ok:true,o:"success",t:[.4256,.1189,.06],p:[.4475,.1269,.0832],g:[.368,.2049,.1341],h:.2555},
    {m:"M2",c:"T",s:0,n:0,ok:true,o:"success",t:[.4574,-.0294,.05],p:[.4728,-.0712,.0828],g:[.4663,-.0989,.2018],h:.2435},
    {m:"M2",c:"T",s:2,n:2,ok:false,o:"execution_grasp",t:[.4522,-.0217,.05],p:[.4671,-.0655,.0868],g:[.4473,-.089,.2053],h:null},
    {m:"M2",c:"NI",s:0,n:0,ok:true,o:"success",t:[.4525,-.0464,.06],p:[.4468,-.0746,.0837],g:[.4023,-.1105,.1919],h:.2288},
    {m:"M2",c:"NP",s:0,n:0,ok:false,o:"execution_grasp",t:[.4456,.1384,.07],p:[.4385,.1436,.1773],g:[.4519,.2652,.1756],h:null},
    {m:"M2",c:"DO",s:0,n:0,ok:false,o:"execution_grasp",t:[.4701,-.049,.06],p:[.4713,-.0004,.1163],g:[.4673,.0278,.2354],h:null},
    {m:"M2",c:"DO",s:0,n:1,ok:true,o:"success",t:[.4609,-.0548,.06],p:[.4698,-.0148,.1087],g:[.4345,.0007,.2249],h:.2554},
    {m:"M2",c:"ALL",s:0,n:0,ok:false,o:"execution_grasp",t:[.4398,.1141,.06],p:[.4612,.0075,.1269],g:[.394,.0477,.221],h:null},
    {m:"M2",c:"ALL",s:2,n:16,ok:true,o:"success",t:[.4156,.1385,.06],p:[.4304,.1463,.1225],g:[.4313,.1092,.2391],h:.241}
  ];

  const $ = selector => document.querySelector(selector);
  const make = (tag, attrs = {}, text = "") => {
    const node = document.createElement(tag);
    Object.entries(attrs).forEach(([key, value]) => node.setAttribute(key, value));
    if (text) node.textContent = text;
    return node;
  };
  const table = (element, headers, rows) => {
    element.replaceChildren();
    const thead = make("thead"), headRow = make("tr");
    headers.forEach(header => headRow.append(make("th", {scope:"col"}, header)));
    thead.append(headRow); element.append(thead);
    const body = make("tbody"); rows.forEach(values => { const tr = make("tr"); values.forEach(value => tr.append(make("td", {}, value))); body.append(tr); });
    element.append(body);
  };

  function renderCallouts() {
    const host = $("#result-callouts");
    const cards = [
      ["M2 / inference", "5.556×", "model-only speedup", "fast"],
      ["M1 / simulation", "67.0%", "highest overall success", "quality"],
      ["B0 / pose", "6.514°", "lowest rotation error", "baseline"]
    ];
    cards.forEach(([label, value, detail, tone]) => {
      const card = make("article", {class:`result-callout ${tone}`});
      card.append(make("span", {class:"callout-label"}, label), make("strong", {}, value), make("span", {class:"callout-detail"}, detail)); host.append(card);
    });
  }

  function renderSuccessChart() {
    const host = $("#success-chart"), width = 920, height = 350, margin = {top:28,right:18,bottom:54,left:52};
    const plotW = width - margin.left - margin.right, plotH = height - margin.top - margin.bottom, groupW = plotW / conditions.length, barW = 42;
    const ns = "http://www.w3.org/2000/svg", svg = document.createElementNS(ns, "svg"); svg.setAttribute("viewBox", `0 0 ${width} ${height}`); svg.setAttribute("role", "img");
    const y = v => margin.top + plotH * (1 - v), add = (tag, attrs, text) => { const n=document.createElementNS(ns,tag); Object.entries(attrs).forEach(([k,val])=>n.setAttribute(k,val)); if(text)n.textContent=text; svg.append(n); return n; };
    [0,.25,.5,.75,1].forEach(tick => { add("line", {x1:margin.left,y1:y(tick),x2:width-margin.right,y2:y(tick),stroke:"#d0ded9"}); add("text", {x:margin.left-10,y:y(tick)+4,"text-anchor":"end",fill:"#546a6f","font-size":"11"}, `${Math.round(tick*100)}%`); });
    summary.forEach(([condition, values], index) => {
      const center = margin.left + groupW * (index + .5); add("text", {x:center,y:height-17,"text-anchor":"middle",fill:"#17262c","font-size":"12","font-weight":"700"}, condition);
      models.forEach((model, modelIndex) => { const [successes,total,low,high] = values[model], value=successes/total, x=center+(modelIndex-1)*(barW+7)-barW/2; add("rect", {x,y:y(value),width:barW,height:plotH*(value),fill:COLORS[model],rx:2}); const mid=x+barW/2; add("line", {x1:mid,y1:y(low),x2:mid,y2:y(high),stroke:"#17262c","stroke-width":"2"}); add("line", {x1:mid-5,y1:y(low),x2:mid+5,y2:y(low),stroke:"#17262c","stroke-width":"2"}); add("line", {x1:mid-5,y1:y(high),x2:mid+5,y2:y(high),stroke:"#17262c","stroke-width":"2"}); add("title", {}, `${model} ${condition}: ${successes}/${total}`); });
    });
    add("text", {x:margin.left,y:15,fill:"#546a6f","font-size":"11"}, "Success rate"); host.replaceChildren(svg);
  }

  function renderTasks() {
    table(
      $("#condition-table"),
      ["Code", "Task name", "Controlled change", "Paired episodes"],
      conditions.map(condition => [condition, conditionMeta[condition].name, conditionMeta[condition].change, "60 per model"])
    );
  }

  function renderTables() {
    table($("#quality-table"), ["Model","Params","Translation cm","Rotation deg","Model p50 ms","E2E p50 ms","Peak MiB"], quality.map(row => [row.model,row.params,row.translation,row.rotation,row.modelMs,row.e2eMs,row.memory]));
    table($("#training-table"), ["Model","Phi h","Mani h","Total h","sec / epoch (Phi / Mani)"], training.map(row => [row.model,row.phi,row.mani,row.total,row.epoch]));
  }

  function renderSignificance() {
    const host = $("#significance-grid");
    significance.forEach(item => { const card=make("article", {class:`significance-card ${item.tone}`}); const success=item.scope==="overall success"; card.append(make("div", {class:"significance-head"}, `${item.model} · ${item.scope}`), make("strong", {}, item.speed), make("span", {class:"significance-ci"}, success?item.ci:`95% CI ${item.ci}`), make("span", {class:"significance-delta"}, success?item.delta:`B0 − candidate: ${item.delta}`), make("span", {class:"significance-p"}, item.p)); host.append(card); });
  }

  function renderReading() {
    const host=$("#condition-reading");
    readings.forEach(([condition,title,body])=>{
      const item=make("article",{class:"condition-item"});
      const copy=make("div");
      copy.append(make("h4",{},title),make("p",{},body));
      item.append(make("span",{class:"condition-chip",style:`--condition:${CONDITION_COLORS[condition]}`},condition),copy);
      host.append(item);
    });
  }

  function renderViewer() {
    const frame = $("#simulation-frame"), modelSelect = $("#sim-model"), conditionSelect = $("#sim-condition"), outcomeSelect = $("#sim-outcome"), gallery = $("#case-gallery"), playButton = $("#sim-play");
    models.forEach(model => modelSelect.append(make("option", {value:model}, model)));
    conditions.forEach(condition => conditionSelect.append(make("option", {value:condition}, `${condition} · ${conditionMeta[condition].name}`)));
    let selected = 0, filtered = [], timer = null;
    const framePath = item => `assets/simulation-frames/${item.c.toLowerCase()}-seed${String(item.n).padStart(2, "0")}.png`;

    function stopPlayback() {
      if (timer) window.clearInterval(timer);
      timer = null;
      playButton.textContent = "Play frames";
      playButton.setAttribute("aria-pressed", "false");
    }

    function renderGallery() {
      gallery.replaceChildren();
      filtered.forEach((item, index) => {
        const button = make("button", {type:"button", class:`case-card ${item.ok ? "success" : "failure"} ${index === selected ? "active" : ""}`});
        button.append(make("strong", {}, `${item.m} / ${item.c}`), make("span", {}, `${conditionMeta[item.c].name} · seed ${item.s} · scene ${item.n}`), make("small", {}, item.ok ? "SUCCESS" : item.o.replace("_", " ")));
        button.addEventListener("click", () => { selected = index; stopPlayback(); renderCase(); });
        gallery.append(button);
      });
      $("#sim-case-count").textContent = filtered.length ? `${selected + 1} / ${filtered.length} shown · ${cases.length} representatives` : `0 shown · ${cases.length} representatives`;
    }

    function renderCase() {
      const item = filtered[selected], facts = $("#sim-facts");
      facts.replaceChildren();
      renderGallery();
      if (!item) {
        frame.removeAttribute("src"); frame.alt = "No saved representative scene for this filter";
        $("#frame-source").textContent = "No matching saved scene"; $("#frame-progress").textContent = "";
        $("#sim-status").textContent = "NO REPRESENTATIVE CASE"; $("#sim-status").className = "case-status";
        $("#sim-title").textContent = `${modelSelect.value} / ${conditionSelect.value} · ${outcomeSelect.value}`;
        $("#sim-description").textContent = "No saved representative episode matches this exact filter. Switch the outcome or condition to inspect the available records.";
        return;
      }
      frame.src = framePath(item);
      frame.alt = `${item.c} ${conditionMeta[item.c].name}, scene seed ${item.n}, ${item.ok ? "successful" : "failed"} ${item.m} episode`;
      frame.classList.remove("frame-arrive"); void frame.offsetWidth; frame.classList.add("frame-arrive");
      $("#frame-source").textContent = `${item.c} · ${conditionMeta[item.c].name} · saved 8,192-point observation`;
      $("#frame-progress").textContent = `scene seed ${item.n}`;
      $("#sim-status").textContent = item.ok ? "SUCCESS · bilateral contact + lift hold" : `FAILURE · ${item.o.replace("_", " ")}`;
      $("#sim-status").className = `case-status ${item.ok ? "success" : "failure"}`;
      $("#sim-title").textContent = `${item.m} / ${item.c} · seed ${item.s}, scene ${item.n}`;
      $("#sim-description").textContent = item.ok ? "The recorded episode reached bilateral contact and the lift-and-hold criterion." : item.o === "policy_invalid" ? "The predicted grasp pose crossed the frozen Panda workspace gate before planning." : "The planned approach reached closure, but bilateral finger contact was not validated.";
      [["Task", `${item.c} · ${conditionMeta[item.c].name}`], ["Outcome", item.o], ["Target", `${item.t.map(v => v.toFixed(3)).join(", ")} m`], ["Predicted position", `${item.p.map(v => v.toFixed(3)).join(", ")} m`], ["Grasp point", `${item.g.map(v => v.toFixed(3)).join(", ")} m`], ["Held height", item.h ? `${item.h.toFixed(3)} m` : "not reached"]].forEach(([key, value]) => facts.append(make("dt", {}, key), make("dd", {}, value)));
    }

    function filteredCases() {
      filtered = cases.filter(item => item.m === modelSelect.value && item.c === conditionSelect.value && (outcomeSelect.value === "all" || (outcomeSelect.value === "success" ? item.ok : !item.ok)));
      selected = Math.min(selected, Math.max(0, filtered.length - 1));
      renderCase();
    }

    [modelSelect, conditionSelect, outcomeSelect].forEach(control => control.addEventListener("change", () => { selected = 0; stopPlayback(); filteredCases(); }));
    $("#sim-prev").addEventListener("click", () => { if (!filtered.length) return; selected = (selected - 1 + filtered.length) % filtered.length; stopPlayback(); renderCase(); });
    $("#sim-next").addEventListener("click", () => { if (!filtered.length) return; selected = (selected + 1) % filtered.length; stopPlayback(); renderCase(); });
    playButton.addEventListener("click", () => {
      if (timer) { stopPlayback(); return; }
      if (filtered.length < 2) return;
      playButton.textContent = "Pause frames"; playButton.setAttribute("aria-pressed", "true");
      timer = window.setInterval(() => { selected = (selected + 1) % filtered.length; renderCase(); }, 1800);
    });
    modelSelect.value = "M1"; conditionSelect.value = "NP"; filteredCases();
  }

  renderCallouts(); renderSuccessChart(); renderTasks(); renderTables(); renderSignificance(); renderReading(); renderViewer();
})();
