(() => {
  const svg=document.getElementById('training-svg');
  const mobile=document.getElementById('training-mobile');
  const detail=document.getElementById('training-stage');
  if(!svg||!mobile||!detail)return;
  const NS='http://www.w3.org/2000/svg';
  const paper='https://arxiv.org/html/2403.03954v7';
  const nodes=[
    {id:'depth',x:30,y:85,w:142,title:'Depth',sub:'84 x 84 / 2 frames',type:'visual',step:0},
    {id:'prep',x:206,y:85,w:142,title:'Crop + FPS',sub:'512 / 1024 xyz',type:'visual',step:1},
    {id:'mlp',x:384,y:85,w:180,title:'Point MLP',sub:'3 -> 64 -> 128 -> 256',type:'visual',step:2},
    {id:'pool',x:600,y:85,w:164,title:'Max + project',sub:'256 -> 64 visual',type:'visual',step:2},
    {id:'pose',x:30,y:230,w:142,title:'Robot pose',sub:'q_t / 2 frames',type:'pose',step:0},
    {id:'poseMlp',x:206,y:230,w:142,title:'Pose MLP',sub:'DimRobo -> 64 -> 64',type:'pose',step:3},
    {id:'fusion',x:600,y:230,w:164,title:'Concatenate',sub:'128 per observation',type:'condition',step:3},
    {id:'expert',x:30,y:390,w:142,title:'Expert actions',sub:'a^0 / H = 4',type:'action',step:0},
    {id:'noise',x:30,y:491,w:142,title:'k + Gaussian',sub:'100 train timesteps',type:'action',step:4},
    {id:'forward',x:260,y:432,w:180,title:'Forward noising',sub:'a^k from a^0',type:'action',step:4},
    {id:'noisy',x:490,y:432,w:164,title:'Noisy action',sub:'a^k / H = 4',type:'action',step:4},
    {id:'unet',x:810,y:432,w:170,title:'Conditional 1D UNet',sub:'a^k, k, c',type:'model',step:5},
    {id:'pred',x:1020,y:432,w:166,title:'Predicted sample',sub:'clean action',type:'model',step:5},
    {id:'loss',x:1020,y:523,w:166,title:'MSE + update',sub:'end-to-end gradients',type:'loss',step:6}
  ];
  const edges=[
    {id:'depth-prep',d:'M172 119 H206'},
    {id:'prep-mlp',d:'M348 119 H384'},
    {id:'mlp-pool',d:'M564 119 H600'},
    {id:'pool-fusion',d:'M682 153 V230'},
    {id:'pose-poseMlp',d:'M172 264 H206'},
    {id:'poseMlp-fusion',d:'M348 264 H600'},
    {id:'expert-forward',d:'M172 424 H222 V466 H260'},
    {id:'noise-forward',d:'M172 525 H222 V466 H260'},
    {id:'forward-noisy',d:'M440 466 H490'},
    {id:'noisy-unet',d:'M654 466 H810'},
    {id:'fusion-unet',d:'M764 264 H785 V466 H810'},
    {id:'unet-pred',d:'M980 466 H1020'},
    {id:'pred-loss',d:'M1103 500 V523'},
    {id:'expert-loss',d:'M101 458 V605 H995 V557 H1020'}
  ];
  const stages=[
    {title:'Expert observation-action windows',body:'Each expert demonstration supplies two observed timesteps and a four-action training target. The visual input is single-camera depth, and robot pose follows a separate branch. The three inputs shown here are paired samples from one demonstration window.',formula:String.raw`(D_{t-1:t},q_{t-1:t},a^0_{t:t+3})`,nodes:['depth','pose','expert'],edges:[],source:'Figure 2; Section III; Appendix A.'},
    {title:'Build a sparse point cloud',body:'Depth is back-projected with camera calibration, cropped to a task workspace, and downsampled by farthest point sampling. The reported model uses 512 or 1024 XYZ points without color.',formula:String.raw`P_t\in\mathbb R^{N\times3},\qquad N\in\{512,1024\}`,nodes:['depth','prep'],edges:['depth-prep'],source:'Section III-B; Appendix A.'},
    {title:'Encode points, then pool',body:'A shared per-point MLP has widths 64, 128, and 256, with LayerNorm and ReLU after each linear layer. Channelwise max pooling removes the point axis; Linear(256, 64) plus LayerNorm gives the compact visual feature.',formula:String.raw`v_t=\operatorname{LN}\!\left(W_p\max_i h_i+b_p\right)\in\mathbb R^{64}`,nodes:['prep','mlp','pool'],edges:['prep-mlp','mlp-pool'],source:'Section III-B; Appendix A encoder listing.'},
    {title:'Encode robot pose and fuse conditions',body:'The pose MLP maps DimRobo to 64 and then 64 again. At each of the two observed timesteps, its output joins the 64-D visual feature to form a 128-D representation for conditional action generation.',formula:String.raw`c_t=[v_t;g(q_t)]\in\mathbb R^{128}`,nodes:['pose','poseMlp','pool','fusion'],edges:['pose-poseMlp','poseMlp-fusion','pool-fusion'],source:'Appendix A; Section III-C.'},
    {title:'Noise the expert action chunk',body:'Training samples a diffusion timestep and Gaussian noise, then perturbs the clean four-action target. The paper describes 100 diffusion timesteps during training; this is a training process, separate from the 10 reverse steps used at inference.',formula:String.raw`a^k=\bar\alpha_k a^0+\bar\beta_k\epsilon^k`,nodes:['expert','noise','forward','noisy'],edges:['expert-forward','noise-forward','forward-noisy'],source:'Equation (2); Section III-C.'},
    {title:'Predict a clean action sample',body:'The convolutional Diffusion Policy backbone receives noisy actions, timestep k, and the visual-pose condition. Although the paper presents a noise-prediction equation, it reports using sample prediction with DDIM in the experiments.',formula:String.raw`\hat a^0=f_\theta(a^k,k,c)`,nodes:['noisy','fusion','unet','pred'],edges:['noisy-unet','fusion-unet','unet-pred'],source:'Section III-C; Appendix A; Table VII. Formula summarizes the reported sample-prediction mode.'},
    {title:'Compute error and update both branches',body:'A prediction error updates the action backbone and propagates through the conditioning paths into the visual and pose encoders. The paper prints Equation (2) in epsilon-prediction notation; the clean-sample target used in experiments is shown here as an explanatory counterpart, not a separately printed paper equation.',formula:String.raw`\mathcal L_{\mathrm{sample}}=\operatorname{MSE}(a^0,\hat a^0)`,nodes:['expert','pred','loss','unet','fusion','pool','mlp','poseMlp'],edges:['pred-loss','expert-loss','unet-pred','fusion-unet','pool-fusion','mlp-pool','poseMlp-fusion'],reverse:true,source:'Figure 2; Equation (2); Section III-C.'}
  ];
  const nodeMap=new Map(),edgeMap=new Map();
  let stage=0,timer=null,activeTab=false;

  function make(name,attrs={}) {
    const element=document.createElementNS(NS,name);
    Object.entries(attrs).forEach(([key,value])=>element.setAttribute(key,String(value)));
    return element;
  }
  function textNode(parent,x,y,label,className) {
    const item=make('text',{x,y,class:className});
    item.textContent=label;
    parent.append(item);
  }
  function build() {
    svg.replaceChildren();
    const defs=make('defs');
    const arrow=make('marker',{id:'train-arrow',markerWidth:8,markerHeight:8,refX:7,refY:4,orient:'auto'});
    arrow.append(make('path',{d:'M1 1 L7 4 L1 7',fill:'none',stroke:'#839d93','stroke-width':1.4}));
    defs.append(arrow);svg.append(defs);
    textNode(svg,30,48,'PERCEPTION / TWO OBSERVED TIMESTEPS','diagram-lane');
    textNode(svg,30,202,'ROBOT STATE / TWO OBSERVED TIMESTEPS','diagram-lane');
    textNode(svg,30,369,'EXPERT ACTION / FORWARD DIFFUSION / PREDICTION','diagram-lane');
    for(const edge of edges) {
      const path=make('path',{d:edge.d,class:'diagram-edge','data-edge':edge.id,'marker-end':'url(#train-arrow)'});
      svg.append(path);edgeMap.set(edge.id,path);
    }
    for(const node of nodes) {
      const group=make('g',{class:'diagram-node type-'+node.type,'data-node':node.id,tabindex:0,role:'button','aria-label':node.title+'; show training stage '+(node.step+1)});
      group.append(make('rect',{x:node.x,y:node.y,width:node.w,height:68,rx:3}));
      textNode(group,node.x+12,node.y+27,node.title,'diagram-title');
      textNode(group,node.x+12,node.y+49,node.sub,'diagram-sub');
      group.addEventListener('click',()=>{stop();update(node.step);});
      group.addEventListener('keydown',event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();stop();update(node.step);}});
      svg.append(group);nodeMap.set(node.id,group);
    }
    mobile.replaceChildren();
    for(const node of nodes) {
      const button=document.createElement('button');
      button.type='button';button.className='training-mobile-node';button.dataset.node=node.id;
      button.innerHTML='<strong>'+node.title+'</strong><span>'+node.sub+'</span>';
      button.addEventListener('click',()=>{stop();update(node.step);});
      mobile.append(button);
    }
    for(let i=0;i<4;i++)svg.append(make('circle',{r:5,class:'diagram-token',visibility:'hidden'}));
  }
  function stop() {
    clearInterval(timer);timer=null;
    const play=document.getElementById('train-play');
    play.innerHTML='&#9654;';play.setAttribute('aria-label','Play training stages');
  }
  function update(next) {
    stage=Math.max(0,Math.min(stages.length-1,Number(next)));
    const data=stages[stage];
    document.getElementById('train-range').value=stage;
    document.getElementById('train-counter').textContent=String(stage+1).padStart(2,'0')+' / 07';
    nodeMap.forEach((node,id)=>node.classList.toggle('active',data.nodes.includes(id)));
    edgeMap.forEach((edge,id)=>edge.classList.toggle('active',data.edges.includes(id)));
    mobile.querySelectorAll('[data-node]').forEach(node=>node.classList.toggle('active',data.nodes.includes(node.dataset.node)));
    detail.innerHTML='<div class="eyebrow">Training stage '+(stage+1)+' / 7</div><h3>'+data.title+'</h3><p>'+data.body+'</p><div class="math-line">\\('+data.formula+'\\)</div><p class="source"><a href="'+paper+'" target="_blank" rel="noopener noreferrer">Paper source ↗</a> '+data.source+'</p>';
    window.DP3RenderMath?.(detail);
  }
  function animate(now) {
    const data=stages[stage];
    const paths=data.edges.map(id=>edgeMap.get(id)).filter(Boolean);
    const tokens=svg.querySelectorAll('.diagram-token');
    const isVisible=activeTab&&paths.length>0&&!window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    tokens.forEach((token,index)=>{
      if(!isVisible){token.setAttribute('visibility','hidden');return;}
      const path=paths[(index+Math.floor(now/850))%paths.length];
      const length=path.getTotalLength();
      const phase=(now/1550+index*.24)%1;
      const point=path.getPointAtLength((data.reverse?1-phase:phase)*length);
      token.setAttribute('cx',point.x);token.setAttribute('cy',point.y);
      token.setAttribute('visibility','visible');
    });
    requestAnimationFrame(animate);
  }
  build();update(0);requestAnimationFrame(animate);
  document.getElementById('train-prev').addEventListener('click',()=>{stop();update(stage-1);});
  document.getElementById('train-next').addEventListener('click',()=>{stop();update(stage+1);});
  document.getElementById('train-range').addEventListener('input',event=>{stop();update(event.target.value);});
  document.getElementById('train-play').addEventListener('click',()=>{
    if(timer){stop();return;}
    const play=document.getElementById('train-play');
    play.innerHTML='&#10074;&#10074;';play.setAttribute('aria-label','Pause training stages');
    timer=setInterval(()=>{
      if(stage===stages.length-1){if(!document.getElementById('train-loop').checked){stop();return;}update(0);}
      else update(stage+1);
    },2700);
  });
  document.addEventListener('dp3:tab',event=>{activeTab=event.detail==='tab-training';if(!activeTab)stop();});
})();
