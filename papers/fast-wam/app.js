(() => {
  const $ = id => document.getElementById(id);
  const clamp = (x, a = 0, b = 1) => Math.min(b, Math.max(a, x));
  const ease = x => x * x * (3 - 2 * x);
  const blue = "#3f77a0", amber = "#df9e45", green = "#087e6e", ink = "#20373a";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  let activeView = "inference";

  const inferStages = [
    {name:"Observe", title:"Observe the scene", copy:"The task instruction and current multi-camera images define the context. The illustration uses a towel, matching the paper's real-robot benchmark; no frames here are captured from the experiment.", repr:"Instruction l and current observation o", source:"Figure 2A; Sections 3.1–3.2"},
    {name:"Encode", title:"Encode words and pixels", copy:"The built-in T5 encoder turns language into embeddings. The pretrained video VAE maps the current image into clean first-frame latent tokens. Multiple camera images are concatenated before the VAE.", repr:"Language embeddings + clean f₀ tokens", source:"Section 3.2; Section 4.1"},
    {name:"World features", title:"Read the world once", copy:"The pretrained video DiT processes only the clean current-frame tokens. Its single forward pass supplies latent world features to the action expert. No future video is sampled.", repr:"z(o, l) from video DiT", source:"Figure 1C; Section 3.2; Equation 4"},
    {name:"Action noise", title:"Start an action chunk from noise", copy:"The action expert receives noisy action tokens plus the fixed world context and task language. It predicts a 32-action chunk, not a future image sequence.", repr:"Noisy action tokens aₜ; horizon h = 32", source:"Figure 2A; Section 4.1"},
    {name:"Denoise", title:"Refine actions for 10 steps", copy:"Action tokens follow the learned flow field over 10 inference steps. The animated paths suggest refinement only; their positions are illustrative and do not run the trained model.", repr:"Denoised action chunk a₁:₃₂", source:"Sections 3.2 and 4.1; Equations 5–8"},
    {name:"Act", title:"Execute and observe again", copy:"A controller uses the predicted action chunk, then new observations can start another control cycle. The cloth and gripper motion is a teaching reconstruction, not measured policy behavior.", repr:"Robot actions from predicted chunk", source:"Sections 3.1 and 4.2; Figure 3"}
  ];
  const trainStages = [
    {name:"Examples", title:"Provide present, future, and actions", copy:"Training examples include the current image, future frames, a language instruction, and the demonstrated action chunk. Future frames are available here because they are supervision, not predictions at test time."},
    {name:"Corrupt", title:"Interpolate both targets with noise", copy:"The VAE encodes future frames as latent targets. Independently sampled Gaussian noise and a flow time t form noisy future-video and action tokens using Equation 5."},
    {name:"Forward", title:"Run two branches around one anchor", copy:"The video DiT predicts a velocity for future-video latents; the action DiT predicts a velocity for actions. Both can read clean current-frame tokens and language, while action tokens cannot read future-video tokens."},
    {name:"Loss", title:"Measure two velocity errors", copy:"Each branch compares its predicted velocity with ε − y. The objective sums the action loss and λ times the video loss. The shown vectors are explanatory, not trained outputs."},
    {name:"Update", title:"Let video supervision shape the backbone", copy:"Gradients from video modeling update the visual world-model branch; action supervision updates the action path and shared visual context. Raw observations and ground-truth targets receive no parameter updates."}
  ];

  function initTabs() {
    for (const tab of document.querySelectorAll("[role=tab]")) tab.addEventListener("click", () => {
      activeView = tab.id.slice(4);
      for (const item of document.querySelectorAll("[role=tab]")) item.setAttribute("aria-selected", String(item === tab));
      for (const panel of document.querySelectorAll("[role=tabpanel]")) panel.hidden = panel.id !== activeView;
      infer.last = train.last = compare.last = performance.now();
      if (activeView === "evidence") renderEvidence();
    });
  }

  function rect(x,y,w,h,fill,stroke="#bdcfca",r=5,extra="") { return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" ${extra}/>`; }
  function line(x1,y1,x2,y2,color,width=2,extra="") { return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${width}" ${extra}/>`; }
  function txt(x,y,s,size=13,color=ink,weight=600,anchor="middle") { return `<text x="${x}" y="${y}" text-anchor="${anchor}" font-family="system-ui,sans-serif" font-size="${size}" font-weight="${weight}" fill="${color}">${s}</text>`; }
  function dot(x,y,r,color,opacity=1) { return `<circle cx="${x}" cy="${y}" r="${r}" fill="${color}" opacity="${opacity}"/>`; }
  function arrow(x1,y1,x2,y2,color=green,width=2.5,dash="") { return `${line(x1,y1,x2,y2,color,width,`stroke-dasharray="${dash}"`)}<path d="M ${x2-7} ${y2-5} L ${x2} ${y2} L ${x2-7} ${y2+5}" fill="none" stroke="${color}" stroke-width="${width}"/>`; }
  function pulseAlong(x1,y1,x2,y2,t,color=green,r=5) { return dot(x1+(x2-x1)*t,y1+(y2-y1)*t,r,color); }
  function token(x,y,label,color=blue,w=50) { return `${rect(x,y,w,34,"#fff",color,4,`stroke-width="2"`)}${txt(x+w/2,y+22,label,13,color,700)}`; }

  function robotArm(side, fold) {
    const mirrored = side === "right";
    const baseX = mirrored ? 527 : 83, elbowX = mirrored ? 500 - fold*14 : 139 + fold*14;
    const wristX = mirrored ? 474 - fold*52 : 176 + fold*52;
    const tipX = mirrored ? 475 - fold*84 : 176 + fold*84;
    const baseY = 73, elbowY = 113, wristY = 168 + fold*16, tipY = 210 + fold*24;
    let s = `<path d="M ${baseX+4} ${baseY+8} L ${elbowX+5} ${elbowY+8} L ${wristX+5} ${wristY+8}" fill="none" stroke="#8fa7a1" stroke-width="38" stroke-linecap="round" stroke-linejoin="round" opacity=".18"/>`;
    s += line(baseX,baseY,elbowX,elbowY,"#2d444c",39,`stroke-linecap="round"`);
    s += line(baseX-2,baseY-4,elbowX-2,elbowY-4,"#93aeb0",21,`stroke-linecap="round"`);
    s += line(elbowX,elbowY,wristX,wristY,"#324e55",33,`stroke-linecap="round"`);
    s += line(elbowX-3,elbowY-3,wristX-3,wristY-3,"#a0b9b8",17,`stroke-linecap="round"`);
    for(const [x,y,r] of [[baseX,baseY,27],[elbowX,elbowY,22],[wristX,wristY,17]]) {
      s += dot(x,y,r,"#253b43")+dot(x-3,y-4,r*.71,"#758f93")+dot(x,y,r*.31,"#bed0cc");
      s += `<path d="M ${x-r*.37} ${y-r*.36} Q ${x} ${y-r*.61} ${x+r*.32} ${y-r*.32}" fill="none" stroke="#e1eeea" stroke-width="2" opacity=".65"/>`;
    }
    s += line(wristX,wristY,tipX,tipY,"#2e4e55",16,`stroke-linecap="round"`);
    const angle = mirrored ? 17 : -17;
    s += `<g transform="translate(${tipX},${tipY}) rotate(${angle})">${rect(-17,-10,34,25,"url(#metal)","#37545b",5,`stroke-width="2"`)}${rect(-22,9,13,25,"#3a5b61","#253e46",3)}${rect(9,9,13,25,"#3a5b61","#253e46",3)}${line(-11,12,-11,31,"#a5bdb8",3)}${line(11,12,11,31,"#a5bdb8",3)}${dot(0,1,4,"#c6d8d3")}</g>`;
    return s;
  }

  function clothScene(stage,p) {
    const fold = stage === 5 ? ease(p) : 0;
    let s = `<defs>
      <linearGradient id="surface" x2="0" y2="1"><stop stop-color="#edf3f0"/><stop offset="1" stop-color="#cddbd5"/></linearGradient>
      <linearGradient id="metal" x2="1" y2="1"><stop stop-color="#b7cfca"/><stop offset=".45" stop-color="#6f9292"/><stop offset="1" stop-color="#375b61"/></linearGradient>
      <linearGradient id="clothLight" x2=".1" y2="0" x1=".9" y1="1"><stop stop-color="#85b6ca" stop-opacity=".6"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#0b405d" stop-opacity=".32"/></linearGradient>
      <pattern id="terry" patternUnits="userSpaceOnUse" width="290" height="290"><image href="terry-cloth.jpg" width="290" height="290"/></pattern>
      <filter id="softShadow" x="-30%" y="-40%" width="160%" height="180%"><feGaussianBlur stdDeviation="8"/></filter>
    </defs>`;
    s += `<rect width="920" height="460" fill="#edf3f0"/><path d="M0 356L628 356L628 460H0Z" fill="#d7e3dc"/>`;
    s += `<path d="M18 107L552 95L619 370L64 389Z" fill="#90a7a0" opacity=".32" filter="url(#softShadow)"/>`;
    s += `<path d="M18 88L554 88L615 353L63 375Z" fill="url(#surface)" stroke="#9cb6aa" stroke-width="3"/>`;
    s += `<path d="M63 375L615 353L612 369L67 391Z" fill="#a6bcb3"/>`;
    s += `<path d="M40 115L546 111L589 334L84 349Z" fill="#e8efeb" stroke="#c2d2c9" stroke-width="2"/>`;
    for(let i=0;i<5;i++)s+=`<path d="M ${96+i*95} 133 L ${128+i*95} 335" stroke="#dce7df" stroke-width="1"/>`;
    s += `<ellipse cx="333" cy="291" rx="194" ry="28" fill="#78988f" opacity=".22" filter="url(#softShadow)"/>`;
    const left=153+fold*71,right=502-fold*71,frontY=317-fold*58,backY=188+fold*16;
    const cloth=`M ${left+11} ${backY+10} Q ${left+114} ${backY-18} ${right-8} ${backY+12} Q ${right+17} ${backY+33} ${right-3} ${frontY-8} Q ${right-83} ${frontY+17} ${left+6} ${frontY-2} Q ${left-12} ${frontY-25} ${left+11} ${backY+10} Z`;
    s += `<path d="M ${left+8} ${frontY-4} Q 330 ${frontY+20} ${right-2} ${frontY-5} L ${right-6} ${frontY+10} Q 325 ${frontY+37} ${left+11} ${frontY+11}Z" fill="#184e6c" stroke="#1a506c" stroke-width="3"/>`;
    s += `<path d="${cloth}" fill="url(#terry)" stroke="#17587b" stroke-width="3"/>`;
    s += `<path d="${cloth}" fill="url(#clothLight)" opacity=".68"/>`;
    s += `<path d="M ${left+20} ${backY+22} Q 340 ${backY+8} ${right-15} ${backY+22} M ${left+20} ${frontY-18} Q 325 ${frontY-4} ${right-19} ${frontY-20}" fill="none" stroke="#96ccda" stroke-width="2.3" opacity=".7"/>`;
    s += `<path d="M ${left+23} ${backY+27} Q 298 ${237-fold*13} ${right-28} ${frontY-28}" fill="none" stroke="#d9eff1" stroke-width="2" opacity=".3"/>`;
    if(stage===5) s += `<path d="M ${left+20} ${frontY-43} Q 330 ${frontY-73} ${right-19} ${frontY-37}" fill="none" stroke="#a7d6df" stroke-width="4" opacity="${fold}"/>`;
    s += robotArm("left",fold)+robotArm("right",fold);
    s += `<path d="M 288 79 L 335 79 L 344 101 L 279 101 Z" fill="#354f56" stroke="#203d45" stroke-width="3"/>${rect(302,91,29,15,"#172f36","#7698a0",5)}${dot(311,98,3,"#6e9fbe")}${dot(323,98,3,"#6e9fbe")}`;
    s += `<path d="M 98 124L147 124 M 481 122L530 122" stroke="#a8bcb2" stroke-width="3"/>`;
    if(stage===0){const x=88+460*p;s+=`<path d="M ${x} 112L ${x+36} 338" stroke="#5aa8c1" stroke-width="4" opacity=".85"/><path d="M ${x-13} 118L ${x+56} 342" stroke="#5aa8c1" stroke-width="17" opacity=".1"/>`;}
    if(stage===5){s+=`<path d="M 179 235 Q 220 124 261 244 M 471 235 Q 431 124 390 244" fill="none" stroke="${green}" stroke-width="3" stroke-dasharray="8 7" opacity=".7"/>`;s+=dot(261,244,6,green)+dot(390,244,6,green);}
    s += `<rect x="629" y="21" width="270" height="418" rx="8" fill="#fcfefd" stroke="#c4d5cd" stroke-width="2"/>`;
    s += `<rect x="629" y="21" width="270" height="45" rx="8" fill="#e1ece6"/>${rect(629,57,270,9,"#e1ece6","none",0)}`;
    const labels=["OBSERVATION","VISUAL TOKENS","WORLD ENCODER","ACTION NOISE","ACTION REFINEMENT","EXECUTION"];
    s += txt(651,49,labels[stage],12,"#2f5b55",800,"start");
    if(stage===0){
      for(let i=0;i<3;i++){const x=650+i*77;s+=rect(x,101,67,78,"#d7e8e9","#93b4bb",4)+`<path d="M ${x+9} 137L ${x+57} 135L ${x+55} 160L ${x+12} 162Z" fill="#287397"/>`+dot(x+33,121,7,"#a9c5bd");}
      s+=txt(764,222,"multi-camera context",12,"#4c6c69",700);
      s+=`<path d="M 650 263H876" stroke="#c1d6d3" stroke-width="2"/>`;
      for(let i=0;i<25;i++){const x=650+i*9;s+=line(x,335,x,335-18-24*Math.sin((i/24)*Math.PI*3+p*4)**2,blue,3);}
    }
    if(stage===1){
      s+=rect(653,91,221,72,"#e6f2f5",blue,5)+txt(764,118,"video VAE",16,blue,800)+txt(764,142,"clean first-frame latents",11,blue,600);
      for(let i=0;i<30;i++){const x=662+(i%10)*22,y=202+Math.floor(i/10)*37;const q=ease(clamp((p-i*.015)/.65));s+=rect(x+q*10,y-q*20,13,13,q?"#6ba3bf":"#dae9ed",blue,2,`opacity="${.42+q*.58}"`);}
      s+=txt(764,374,"f₀  /  present only",12,blue,700);
    }
    if(stage===2){
      for(let i=0;i<5;i++){const y=91+i*51;s+=rect(663+i*5,y,197-i*10,38,i%2?"#d8eaf1":"#e6f2f5",blue,4)+txt(763,y+24,`transformer block ${i+1}`,11,blue,700);if(i<4)s+=pulseAlong(763,y+40,763,y+51,(p*2+i*.25)%1,blue,5);}
      s+=rect(689,365,150,35,"#dbeee8",green,4)+txt(764,388,"world features z",12,green,800);
    }
    if(stage===3||stage===4){
      s+=rect(652,90,224,80,"#fff1db",amber,5)+txt(764,120,"Action DiT",17,"#8e5a22",800)+txt(764,144,"current context stays fixed",11,"#8e5a22",600);
      const amount=stage===4?ease(p):0;
      for(let i=0;i<32;i++){const x=660+(i%8)*28,y=197+Math.floor(i/8)*34;const n=(1-amount)*Math.sin(i*8.4+p*20)*8;s+=rect(x+n,y-n*.4,18,15,i%3===0?"#f7ca72":"#dba357","#c4842c",3);}
      s+=`<path d="M 660 357H867" stroke="#e0c18b" stroke-width="2"/>`;
      for(let i=0;i<10;i++){const x=668+i*21;s+=dot(x,358,i<Math.round(p*10)&&stage===4?6:4,i<Math.round(p*10)&&stage===4?amber:"#e6d8b8");}
      s+=txt(764,399,stage===4?`${Math.min(10,Math.floor(p*10)+1)} / 10 action steps`:"Gaussian start",12,"#8e5a22",800);
    }
    if(stage===5){
      s+=rect(654,92,220,53,"#e2f1e9",green,5)+txt(764,124,"32-action chunk",16,green,800);
      for(let i=0;i<8;i++){const x=659+i*27;s+=rect(x,188,18,95-(i%3)*13,"#d5eae1","#8cbcaf",3)+dot(x+9,199+(i%3)*9,5,green);}
      s+=`<path d="M 663 341 Q 717 ${292-20*p} 765 340 T 864 323" fill="none" stroke="${green}" stroke-width="4"/>`;
      s+=txt(764,389,"new observation follows",11,green,700);
    }
    return s;
  }

  function setupSequence(prefix,stages,render,stepCount) {
    const obj={prefix,stages,render,stepCount,position:0,playing:!reduced,last:performance.now(),localUntil:0,speed:1};
    const steps=$(prefix+"-steps");
    stages.forEach((stage,i)=>{const b=document.createElement("button");b.type="button";b.innerHTML=`<b>${String(i+1).padStart(2,"0")}</b>${stage.name}`;b.addEventListener("click",()=>select(i));steps.append(b);});
    const range=$(prefix+"-range");
    const play=$(prefix+"-play");
    function select(i){obj.position=i*100;obj.localUntil=performance.now()+1600;obj.playing=false;sync();}
    function sync(){const i=Math.min(stages.length-1,Math.floor(obj.position/100));range.value=Math.round(obj.position);$(prefix+"-count").textContent=String(i+1).padStart(2,"0")+" / "+String(stages.length).padStart(2,"0");play.textContent=obj.playing?"Ⅱ":"▶";play.setAttribute("aria-label",obj.playing?"Pause playback":"Play playback");[...steps.children].forEach((b,j)=>b.setAttribute("aria-current",j===i?"step":"false"));render(i,(obj.position%100)/100);}
    $(prefix+"-prev").addEventListener("click",()=>select((Math.floor(obj.position/100)-1+stages.length)%stages.length));
    $(prefix+"-next").addEventListener("click",()=>select((Math.floor(obj.position/100)+1)%stages.length));
    play.addEventListener("click",()=>{obj.playing=!obj.playing;obj.localUntil=0;obj.last=performance.now();sync();});
    range.addEventListener("input",()=>{obj.position=Number(range.value);obj.playing=false;obj.localUntil=performance.now()+1400;sync();});
    if($(prefix+"-speed")) $(prefix+"-speed").addEventListener("change",e=>obj.speed=Number(e.target.value));
    obj.tick=now=>{const delta=Math.min(80,now-obj.last);obj.last=now;if(activeView!==({infer:"inference",train:"training"}[prefix]))return;if(obj.playing){obj.position+=delta*obj.speed/32;if(obj.position>=stages.length*100){if($(prefix+"-loop").checked)obj.position=0;else{obj.position=(stages.length-1)*100+99;obj.playing=false;}}sync();}else if(now<obj.localUntil){const i=Math.floor(obj.position/100);render(i,(now/1550)%1);}else if(!obj.localUntil){/* Preserve the last selected frame. */}};
    sync();return obj;
  }

  const infer=setupSequence("infer",inferStages,(i,p)=>{
    const stage=inferStages[i];$("scene").innerHTML=clothScene(i,p);$("scene-heading").textContent=stage.title;$("stage-number").textContent=`Step ${String(i+1).padStart(2,"0")}`;$("stage-title").textContent=stage.title;$("stage-copy").textContent=stage.copy;$("stage-repr").textContent=stage.repr;$("stage-source").textContent="Paper source: "+stage.source;
  });

  const trainNodes=[
    {x:60,y:50,w:160,h:62,title:"Instruction",sub:"T5 text encoder",color:green},
    {x:60,y:192,w:160,h:62,title:"Current frame",sub:"VAE → clean f₀",color:blue},
    {x:60,y:350,w:160,h:62,title:"Future frames",sub:"VAE → noisy f₁:T",color:blue},
    {x:316,y:350,w:150,h:62,title:"Action chunk",sub:"Noisy a₁:H",color:amber},
    {x:360,y:159,w:210,h:82,title:"Video DiT",sub:"shared visual anchor",color:blue},
    {x:645,y:159,w:210,h:82,title:"Action DiT",sub:"action expert",color:amber},
    {x:700,y:350,w:145,h:62,title:"Action loss",sub:"L act",color:amber},
    {x:504,y:350,w:145,h:62,title:"Video loss",sub:"λ L vid",color:blue}
  ];
  function trainingGraphic(stage,p){
    let s=`<rect width="1060" height="500" fill="#f9fbfa"/>`;
    s+=txt(20,27,"TRAINING GRAPH",11,"#60807b",800,"start");
    const edges=[[0,4,green],[0,5,green],[1,4,blue],[1,5,blue],[2,4,blue],[3,5,amber],[4,7,blue],[5,6,amber]];
    for(const [a,b,c] of edges){const A=trainNodes[a],B=trainNodes[b];let x1=A.x+A.w/2,y1=A.y+A.h/2,x2=B.x+B.w/2,y2=B.y+B.h/2;if(a===0){x1=A.x+A.w;y1=A.y+30;x2=B.x+B.w/2;y2=B.y;}if(b===7||b===6){x1=A.x+A.w/2;y1=A.y+A.h;x2=B.x+B.w/2;y2=B.y;}
      const op=(stage===0?.3:stage===1?.5:1);s+=line(x1,y1,x2,y2,c,2,`opacity="${op}"`);if(stage>=2&&stage<=3)s+=pulseAlong(x1,y1,x2,y2,(p+(a+b)*.11)%1,c,5);
      if(stage===4&&(b===7||b===6))s+=pulseAlong(x2,y2,x1,y1,p,green,6);
    }
    s+=line(570,200,645,200,"#aabbb7",2,`stroke-dasharray="6 5"`)+txt(608,189,"shared attention",10,"#637a79",700);
    for(let i=0;i<trainNodes.length;i++){const n=trainNodes[i];const live=(stage===0&&i<4)||(stage===1&&(i===2||i===3))||(stage===2&&(i===4||i===5))||(stage===3&&(i===6||i===7))||(stage===4&&(i===4||i===5||i===6||i===7));const fill=live?(n.color===amber?"#fff0d7":n.color===blue?"#e3f0f6":"#e0f2eb"):"#fff";s+=rect(n.x,n.y,n.w,n.h,fill,live?n.color:"#b8cbc5",6,`stroke-width="${live?2.5:1}"`)+txt(n.x+n.w/2,n.y+26,n.title,15,live?n.color:ink,800)+txt(n.x+n.w/2,n.y+47,n.sub,11,"#52696a",600);}
    if(stage===0){for(let i=0;i<4;i++){const n=trainNodes[i],x=n.x+n.w+21+25*((p+i*.21)%1),y=n.y+n.h/2;s+=dot(x,y,5,n.color,.75);}}
    if(stage===1){for(let i=0;i<7;i++){s+=dot(225+i*15,385+Math.sin(i*7+p*10)*13,3.5,blue);s+=dot(470+i*14,389+Math.sin(i*8+p*10)*12,3.5,amber);}}
    if(stage===3){s+=txt(763,453,"L = L act + λ L vid",16,green,800);}
    if(stage===4){s+=`<path d="M 760 419 Q 400 470 441 247" fill="none" stroke="${green}" stroke-width="3" stroke-dasharray="7 6"/>${pulseAlong(760,419,441,247,p,green,6)}`;s+=txt(384,453,"gradient to model weights",12,green,800);}
    s+=txt(890,69,"ACTION CANNOT READ",11,"#966c3c",800)+txt(890,86,"FUTURE-VIDEO TOKENS",11,"#966c3c",800);
    return s;
  }
  const train=setupSequence("train",trainStages,(i,p)=>{
    const stage=trainStages[i];$("training-svg").innerHTML=trainingGraphic(i,p);$("train-state").textContent=stage.name.toUpperCase();$("train-kicker").textContent=`Stage ${String(i+1).padStart(2,"0")}`;$("train-title").textContent=stage.title;$("train-copy").textContent=stage.copy;
    const names=["Instruction + current image","Future latents + action demonstration","Video DiT + action DiT","Video loss + action loss","Backpropagate to model weights"];
    if($("training-mobile").dataset.stage!==String(i)){
      $("training-mobile").innerHTML=names.map((n,j)=>`<div class="mobile-node ${i===j?"active":""} ${j===3?"loss":""}">${n}</div>${j<4?"<div class=mobile-arrow>↓</div>":""}`).join("");
      $("training-mobile").dataset.stage=String(i);
    }
  });

  const maskRows={training:["f₀","f₁","f₂","a₁","a₂"],inference:["f₀","a₁","a₂"]};
  const maskAllowed={training:[[1,0,0,0,0],[1,1,1,0,0],[1,1,1,0,0],[1,0,0,1,1],[1,0,0,1,1]],inference:[[1,0,0],[1,1,1],[1,1,1]]};
  let maskMode="training",maskRow=3;
  function renderMask(){
    const rows=maskRows[maskMode],allowed=maskAllowed[maskMode],grid=$("mask-grid");grid.style.setProperty("--cols",rows.length);grid.replaceChildren();
    const corner=document.createElement("span");corner.textContent="Q ↓";corner.className="col-label";grid.append(corner);
    for(const name of rows){const h=document.createElement("span");h.textContent=name;h.className="col-label";grid.append(h);}
    rows.forEach((name,i)=>{const label=document.createElement("button");label.type="button";label.className="row-label"+(maskRow===i?" selected":"");label.textContent=name;label.setAttribute("aria-label",`Select ${name} query row`);label.addEventListener("click",()=>{maskRow=i;renderMask();});grid.append(label);
      rows.forEach((_,j)=>{const cell=document.createElement("button");cell.type="button";cell.className="cell"+(allowed[i][j]?(i>0&&name.startsWith("a")?" action":" video"):"")+(maskRow===i?"":" dim");cell.setAttribute("aria-label",`${name} ${allowed[i][j]?"can":"cannot"} read ${rows[j]}`);cell.title=cell.getAttribute("aria-label");cell.addEventListener("click",()=>{maskRow=i;renderMask();});grid.append(cell);});});
    const name=rows[maskRow];$("mask-title").textContent=name+" query";$("mask-description").textContent=name==="f₀"?"Clean current-frame tokens read only themselves, keeping the shared visual anchor free of future information.":name.startsWith("f")?"Future-video tokens read the clean anchor and future-video tokens during training. They are removed at inference.":"Action tokens read the clean current-frame anchor and other action tokens. Future-video tokens are blocked, including during training.";
  }
  for(const b of $("mask-mode").querySelectorAll("button")) b.addEventListener("click",()=>{maskMode=b.dataset.mode;maskRow=maskMode==="training"?3:1;for(const item of $("mask-mode").querySelectorAll("button"))item.setAttribute("aria-pressed",String(item===b));renderMask();});
  renderMask();

  const designs={
    fast:{title:"Fast-WAM",sub:"Future video trains the model, then leaves the inference path.",explain:"Encode the current frame once. Keep its latent world features fixed while the action expert refines a 32-action chunk. The future-video branch has no inference tokens.",latency:"190 ms"},
    joint:{title:"Fast-WAM-Joint",sub:"Future-video and action tokens are refined together.",explain:"The joint variant couples video and action tokens through attention and denoises both during inference. The model must carry future-video tokens through generation.",latency:"580 ms"},
    idm:{title:"Fast-WAM-IDM",sub:"Generate future video first, then condition actions on it.",explain:"The IDM variant completes future-video denoising before action denoising starts. The generated future representation becomes context for the action branch.",latency:"810 ms"}
  };
  const compare={design:"fast",position:0,playing:!reduced,last:performance.now()};
  function comparisonGraphic(design,p){
    const d=designs[design];let s=`<rect width="1000" height="450" fill="#f9fbfa"/>`;
    s+=rect(32,135,156,140,"#e5f1f8",blue,7)+txt(110,171,"CURRENT",14,blue,800)+txt(110,193,"FRAME f₀",14,blue,800)+txt(110,237,"+ instruction",11,blue,600);
    s+=rect(259,135,174,140,"#e5f1f8",blue,7)+txt(346,171,"VIDEO DiT",15,blue,800)+txt(346,203,design==="fast"?"single pass":"video modeling",11,blue,700);
    const futureOn=design!=="fast";
    s+=rect(505,65,187,135,futureOn?"#e5f1f8":"#f1f5f3",futureOn?blue:"#b6c7c1",7,`opacity="${futureOn?1:.6}"`)+txt(599,96,"FUTURE VIDEO",14,futureOn?blue:"#889c98",800)+txt(599,118,futureOn?"f₁:T latents":"absent at test time",11,futureOn?blue:"#889c98",600);
    s+=rect(505,260,187,125,"#fff0d7",amber,7)+txt(599,292,"ACTION DiT",15,"#926022",800)+txt(599,318,"a₁:H denoising",11,"#926022",700);
    s+=rect(776,260,173,125,"#e0f2eb",green,7)+txt(862,291,"ACTION",15,green,800)+txt(862,319,"32 actions",11,green,700);
    s+=arrow(188,205,259,205,blue)+arrow(433,205,505,322,design==="idm"?"#a8b8b1":green)+arrow(692,322,776,322,green);
    if(futureOn){s+=arrow(433,181,505,130,blue);if(design==="idm")s+=arrow(692,160,615,260,blue);else s+=arrow(692,190,652,260,blue);}
    const current=clamp(p*3),future=clamp((p-.25)*2.1),action=clamp((p-(design==="idm"?.54:.34))*2);
    s+=pulseAlong(188,205,259,205,current,blue,6);
    if(futureOn){for(let i=0;i<9;i++){const x=534+(i%3)*48,y=142+Math.floor(i/3)*17;const n=(1-future)*10*Math.sin(i*8+p*24);s+=dot(x+n,y+n*.5,4,blue,.4+future*.5);}s+=pulseAlong(433,181,505,130,(p*2)%1,blue,6);}
    if(p>.28||design==="fast")for(let i=0;i<10;i++){const x=538+(i%5)*29,y=341+Math.floor(i/5)*14;const n=(1-action)*9*Math.cos(i*9+p*25);s+=dot(x+n,y-n*.6,3.5,amber,.7);}
    if(p>.7)s+=pulseAlong(692,322,776,322,clamp((p-.7)/.3),green,7);
    s+=txt(346,409,"WORLD REPRESENTATION",10,"#627b79",800)+txt(861,409,`reported ${d.latency}`,12,green,800);
    return s;
  }
  function renderComparison(){const d=designs[compare.design];$("compare-svg").innerHTML=comparisonGraphic(compare.design,compare.position/100);$("design-title").textContent=d.title;$("design-subtitle").textContent=d.sub;$("design-explain").textContent=d.explain;$("compare-range").value=Math.round(compare.position);$("compare-label").textContent=compare.position<25?"Current context":compare.position<55?"World / future video":compare.position<90?"Action refinement":"Action ready";$("compare-play").textContent=compare.playing?"Ⅱ":"▶";$("compare-play").setAttribute("aria-label",compare.playing?"Pause comparison animation":"Play comparison animation");}
  for(const b of $("designs").querySelectorAll("button")) b.addEventListener("click",()=>{compare.design=b.dataset.design;compare.position=0;compare.playing=!reduced;for(const item of $("designs").querySelectorAll("button"))item.setAttribute("aria-pressed",String(item===b));renderComparison();});
  $("compare-play").addEventListener("click",()=>{compare.playing=!compare.playing;compare.last=performance.now();renderComparison();});
  $("compare-range").addEventListener("input",e=>{compare.position=Number(e.target.value);compare.playing=false;renderComparison();});renderComparison();

  const results={robotwin:{title:"RoboTwin 2.0 average success",source:"Table 1",note:"Clean and randomized settings averaged as reported. All four Fast-WAM variants use no embodied pretraining.",rows:[["Fast-WAM",91.8,green],["Joint",90.6,"#da7a38"],["IDM",91.3,"#bd6c35"],["No video co-train",83.8,"#8b9c96"]]},libero:{title:"LIBERO average success",source:"Table 2",note:"Four suites, 40 tasks, 2,000 evaluation trials. All four Fast-WAM variants use no embodied pretraining.",rows:[["Fast-WAM",97.6,green],["Joint",98.5,"#da7a38"],["IDM",98.0,"#bd6c35"],["No video co-train",93.5,"#8b9c96"]]},real:{title:"Towel-folding success",source:"Figure 4",note:"Figure 4's success rates are plotted values; the manuscript states 10% for no video co-training. Approximate chart readings for other variants are marked ≈.",rows:[["Fast-WAM",75,green,"≈75%"],["Joint",70,"#da7a38","≈70%"],["IDM",90,"#bd6c35","≈90%"],["No video co-train",10,"#8b9c96","10%"]]}};
  let benchmark="robotwin";
  function renderEvidence(){const data=results[benchmark];$("evidence-title").textContent=data.title;$("evidence-source").textContent=data.source;$("result-note").textContent=data.note;$("result-chart").replaceChildren();for(const [name,value,color,label] of data.rows){const row=document.createElement("div");row.className="result-row";row.tabIndex=0;row.setAttribute("aria-label",`${name}: ${label||value+"%"}`);const n=document.createElement("span");n.textContent=name;const track=document.createElement("div");track.className="result-track";const bar=document.createElement("div");bar.className="result-bar";bar.style.setProperty("--value",value+"%");bar.style.setProperty("--color",color);track.append(bar);const num=document.createElement("b");num.textContent=label||value+"%";row.append(n,track,num);$("result-chart").append(row);}}
  for(const b of $("benchmark").querySelectorAll("button")) b.addEventListener("click",()=>{benchmark=b.dataset.benchmark;for(const item of $("benchmark").querySelectorAll("button"))item.setAttribute("aria-pressed",String(item===b));renderEvidence();});renderEvidence();

  function frame(now){infer.tick(now);train.tick(now);if(activeView==="comparison"&&compare.playing){const delta=Math.min(80,now-compare.last);compare.position+=delta/50;if(compare.position>=100){if($("compare-loop").checked)compare.position=0;else{compare.position=100;compare.playing=false;}}renderComparison();}compare.last=now;requestAnimationFrame(frame);}
  initTabs();requestAnimationFrame(frame);
})();
