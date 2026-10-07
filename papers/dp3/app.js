(() => {
  const paper = 'https://arxiv.org/html/2403.03954v7';
  const stages = [
    {name:'Observe',kicker:'SINGLE VIEW / DEPTH',title:'Observe the workspace',heading:'One depth view, one robot state',body:'DP3 starts from an 84 x 84 depth image captured by one camera. Camera intrinsics and extrinsics turn visible depth pixels into 3D coordinates. The reported policy omits RGB values, while robot pose is provided as a separate observation.',formula:String.raw`D_t\in\mathbb R^{84\times84}`,source:'Section III-B; Figure 2.',items:[['Visual input','84 x 84 depth'],['Camera views','1'],['Color channels','None']]},
    {name:'Unproject',kicker:'GEOMETRY / CAMERA',title:'Lift depth into 3D',heading:'Back-project the visible surface',body:'Each valid depth pixel becomes a point in the camera frame using intrinsics, then camera extrinsics place it in the chosen scene frame. A single view only reconstructs visible surfaces, so hidden geometry is not filled in by this display.',formula:String.raw`x_c=\frac{(u-c_x)z}{f_x},\quad y_c=\frac{(v-c_y)z}{f_y}`,source:'Section III-B; Figure 2. Formula is the standard pinhole back-projection used to explain the stated calibration step.',items:[['Representation','XYZ point cloud'],['View coverage','Visible surfaces'],['Displayed points','Synthetic']]},
    {name:'Crop',kicker:'PREPROCESS / BOUNDS',title:'Remove irrelevant regions',heading:'Crop to a task-relevant 3D volume',body:'The paper removes redundant ground and table points using a bounding box before downsampling. The box shown here is illustrative: the paper does not specify a universal box size, and each task has its own workspace.',formula:String.raw`P_{\mathrm{crop}}=\{p\in P:p_{\min}\leq p\leq p_{\max}\}`,source:'Section III-B; Table VII reports the effect of removing cropping.',items:[['Retained data','Task workspace'],['Discarded data','Background / table'],['Box dimensions','Illustrative']]},
    {name:'FPS',kicker:'PREPROCESS / SAMPLING',title:'Spread samples through space',heading:'Farthest point sampling',body:'FPS repeatedly selects the point farthest from the selected set, preserving spatial coverage better than uniform random sampling in the authors\' setup. DP3 uses 512 or 1024 input points by task; this browser draws fewer points for clarity.',formula:String.raw`p_{j+1}=\operatorname*{arg\,max}_{p\in P}\min_{s\in S_j}\lVert p-s\rVert_2`,source:'Section III-B; Appendix A.',items:[['Paper input size','512 / 1024'],['Browser display','160 sampled points'],['Selection','Farthest point sampling']]},
    {name:'Point MLP',kicker:'ENCODER / PER POINT',title:'Transform each XYZ sample',heading:'Shared three-layer point MLP',body:'The same MLP maps every sampled XYZ coordinate through widths 64, 128, and 256. Each linear layer is followed by LayerNorm and ReLU. The floating feature columns are illustrative activations, not extracted network weights.',formula:String.raw`h_i:\mathbb R^3\rightarrow\mathbb R^{64}\rightarrow\mathbb R^{128}\rightarrow\mathbb R^{256}`,source:'Section III-B; Appendix A code listing.',items:[['Input tensor','B x N x 3'],['Point features','B x N x 256'],['Weights','Shared across points']]},
    {name:'Pool',kicker:'ENCODER / GLOBAL',title:'Compress the point set',heading:'Max pool and project to 64 dimensions',body:'A channelwise max over the point dimension produces one 256-D feature vector. A Linear(256, 64) + LayerNorm projection head makes the compact visual condition v. Max pooling is insensitive to point ordering; it is not proof of rotation equivariance.',formula:String.raw`v=\operatorname{LN}\!\left(W_p\max_i h_i+b_p\right)\in\mathbb R^{64}`,source:'Section III-B; Appendix A.',items:[['Pooled vector','256-D'],['Visual condition','64-D'],['Point order','Permutation invariant']]},
    {name:'Condition',kicker:'FUSION / ROBOT STATE',title:'Join vision and robot pose',heading:'Condition the action model',body:'A separate pose MLP maps each observed robot pose q through DimRobo -> 64 -> 64. Concatenating it with that timestep\'s 64-D point-cloud feature yields a 128-D representation per observation; the policy uses two observed timesteps.',formula:String.raw`c_t=[v_t;g(q_t)]\in\mathbb R^{128}`,source:'Appendix A; Section III-C.',items:[['Visual feature','64-D'],['Pose feature','64-D'],['Per observation','128-D']]},
    {name:'Denoise',kicker:'DECISION / DDIM',title:'Generate a four-action chunk',heading:'Conditional action diffusion',body:'A convolutional diffusion-policy backbone starts from Gaussian action noise and uses the fixed visual and pose conditions at each reverse step. The experiments use DDIM with 10 inference steps and sample prediction. The warm path is a visual analogy, not a sampled policy output.',formula:String.raw`a^K\rightarrow a^{K-1}\rightarrow\cdots\rightarrow a^0\quad\big|\ (v,q)`,source:'Section III-C; Appendix A.',items:[['Inference steps','10'],['Prediction horizon','H = 4'],['Prediction mode','Clean sample']]},
    {name:'Execute',kicker:'CONTROL / RECEDING HORIZON',title:'Execute and observe again',heading:'Short action execution',body:'The model predicts four actions from two observed timesteps and executes three actions before the next observation and policy call, according to Appendix A. The displayed motion is an illustrative path, not a simulated robot or trained DP3 output.',formula:String.raw`N_{\mathrm{obs}}=2,\quad H=4,\quad N_{\mathrm{act}}=3`,source:'Appendix A; Appendix C horizon ablation.',items:[['Observed timesteps','2'],['Predicted actions','4'],['Executed actions','3']]}
  ];
  const stageList=document.getElementById('stage-list');
  const detail=document.getElementById('stage-detail');
  const readout=document.getElementById('representation');
  const scrub=document.getElementById('stage-range');
  const play=document.getElementById('play');
  let mathQueue=Promise.resolve();
  function renderMath(node){
    const version=String(Number(node.dataset.mathVersion||0)+1);
    node.dataset.mathVersion=version;
    mathQueue=mathQueue.then(()=>window.MathJax?.startup?.promise).then(()=>{
      if(node.dataset.mathVersion!==version || !window.MathJax?.typesetPromise)return;
      window.MathJax.typesetClear?.([node]);
      return window.MathJax.typesetPromise([node]);
    }).catch(error=>console.error('Math rendering failed',error));
    return mathQueue;
  }
  window.DP3RenderMath=renderMath;
  let stage=0,playing=false,timer=null,task='pour',denoiseStep=0,denoiseTimer=null;
  function stop(){playing=false;clearInterval(timer);play.innerHTML='&#9654;';play.setAttribute('aria-label','Play stages');play.title='Play stages';}
  function updateStage(value){
    stage=Math.max(0,Math.min(stages.length-1,Number(value)));
    const data=stages[stage];scrub.value=stage;
    document.getElementById('stage-counter').textContent=String(stage+1).padStart(2,'0')+' / 09';
    document.getElementById('scene-kicker').textContent=data.kicker;
    document.getElementById('scene-title').textContent=data.title;
    stageList.querySelectorAll('button').forEach((button,index)=>{if(index===stage)button.setAttribute('aria-current','step');else button.removeAttribute('aria-current');});
    detail.innerHTML='<div class="eyebrow">Stage '+(stage+1)+' / 9</div><h3>'+data.heading+'</h3><p>'+data.body+'</p><div class="math-line">\\('+data.formula+'\\)</div><p class="source"><a href="'+paper+'" target="_blank" rel="noopener noreferrer">Paper source ↗</a> '+data.source+'</p>';
    renderMath(detail);
    readout.innerHTML='<dl>'+data.items.map(item=>'<dt>'+item[0]+'</dt><dd>'+item[1]+'</dd>').join('')+'</dl>';
    if(window.DP3Scene)window.DP3Scene.setStage(stage);
  }
  stages.forEach((item,index)=>{const button=document.createElement('button');button.type='button';button.textContent=item.name;button.addEventListener('click',()=>updateStage(index));stageList.append(button);});
  document.getElementById('prev').addEventListener('click',()=>{stop();updateStage(stage-1);});
  document.getElementById('next').addEventListener('click',()=>{stop();updateStage(stage+1);});
  scrub.addEventListener('input',()=>{stop();updateStage(scrub.value);});
  function start(){playing=true;play.innerHTML='&#10074;&#10074;';play.setAttribute('aria-label','Pause stages');play.title='Pause stages';timer=setInterval(()=>{if(stage===stages.length-1){if(!document.getElementById('loop').checked){stop();return;}updateStage(0);}else updateStage(stage+1);},Number(document.getElementById('stage-speed').value));}
  play.addEventListener('click',()=>{if(playing)stop();else start();});
  document.getElementById('stage-speed').addEventListener('change',()=>{if(playing){stop();start();}});
  document.querySelectorAll('[data-task]').forEach(button=>button.addEventListener('click',()=>{task=button.dataset.task;document.querySelectorAll('[data-task]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));document.getElementById('scene-task').textContent=task==='pour'?'Pour / gripper':task==='drill'?'Drill / Allegro hand':'Reach / gripper';if(window.DP3Scene)window.DP3Scene.setTask(task);stop();updateStage(0);}));
  document.querySelectorAll('[data-display]').forEach(button=>button.addEventListener('click',()=>{document.querySelectorAll('[data-display]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));if(window.DP3Scene)window.DP3Scene.setDisplay(button.dataset.display);}));
  const tabs=[...document.querySelectorAll('.tab')];
  function activateTab(tab){tabs.forEach(button=>{const active=button===tab;button.setAttribute('aria-selected',String(active));document.getElementById(button.getAttribute('aria-controls')).hidden=!active;});stop();stopDenoise();if(tab.id==='tab-pipeline'&&window.DP3Scene)window.DP3Scene.resize();document.dispatchEvent(new CustomEvent('dp3:tab',{detail:tab.id}));}
  tabs.forEach((tab,index)=>{tab.addEventListener('click',()=>activateTab(tab));tab.addEventListener('keydown',event=>{let next;if(event.key==='ArrowRight')next=(index+1)%tabs.length;else if(event.key==='ArrowLeft')next=(index+tabs.length-1)%tabs.length;else return;event.preventDefault();tabs[next].focus();activateTab(tabs[next]);});});

  const svg=document.getElementById('denoise-svg');
  const NS='http://www.w3.org/2000/svg';
  const clean=[[.16,.34,.55,.83],[.72,.62,.40,.23],[.38,.46,.60,.69]];
  const offsets=[[.50,-.42,.36,-.65],[-.53,.49,-.39,.55],[.62,-.58,.46,-.32]];
  const colors=['#ffbe82','#7ee0b2','#94c5dd'];
  function elem(name,attrs={}){const node=document.createElementNS(NS,name);Object.entries(attrs).forEach(([key,value])=>node.setAttribute(key,String(value)));return node;}
  function drawDenoising(step){
    svg.replaceChildren();svg.append(elem('rect',{x:0,y:0,width:820,height:360,fill:'#173538'}));
    const plot={x:70,y:37,w:690,h:256};
    for(let i=0;i<=4;i++){const y=plot.y+i*plot.h/4;svg.append(elem('line',{x1:plot.x,y1:y,x2:plot.x+plot.w,y2:y,stroke:'#3d6462','stroke-width':1}));const label=elem('text',{x:plot.x-14,y:y+4,fill:'#8eb7b1','text-anchor':'end','font-size':11});label.textContent=(1-i*.5).toFixed(1);svg.append(label);}
    for(let i=0;i<4;i++){const x=plot.x+i*plot.w/3;svg.append(elem('line',{x1:x,y1:plot.y,x2:x,y2:plot.y+plot.h,stroke:'#315856','stroke-width':1}));const label=elem('text',{x,y:325,fill:'#bed6d0','text-anchor':'middle','font-size':12});label.textContent='a'+(i+1);svg.append(label);}
    const spread=Math.pow(1-step/10,1.55);
    clean.forEach((values,c)=>{
      const target=values.map((v,i)=>[plot.x+i*plot.w/3,plot.y+(1-v)*plot.h]);
      svg.append(elem('polyline',{points:target.map(p=>p.join(',')).join(' '),fill:'none',stroke:colors[c],opacity:.27,'stroke-dasharray':'4 5','stroke-width':2}));
      const current=values.map((v,i)=>[plot.x+i*plot.w/3,plot.y+(1-Math.max(.03,Math.min(.97,v+offsets[c][i]*spread)))*plot.h]);
      svg.append(elem('polyline',{points:current.map(p=>p.join(',')).join(' '),fill:'none',stroke:colors[c],'stroke-width':3,'stroke-linecap':'round','stroke-linejoin':'round'}));
      current.forEach(([x,y])=>svg.append(elem('circle',{cx:x,cy:y,r:5.5,fill:colors[c],stroke:'#173538','stroke-width':2})));
      const name=elem('text',{x:plot.x+plot.w+12,y:current[3][1]+4,fill:colors[c],'font-size':12,'font-weight':700});name.textContent=['x','y','z'][c];svg.append(name);
    });
    const caption=elem('text',{x:70,y:348,fill:'#9fc4bd','font-size':10});caption.textContent='Normalized coordinate illustration; values do not come from a trained policy.';svg.append(caption);
    document.getElementById('noise-level').textContent='Step '+step+' / 10';
    document.getElementById('denoise-range').value=step;
  }
  const denoisePlay=document.getElementById('denoise-play');
  function stopDenoise(){clearInterval(denoiseTimer);denoiseTimer=null;denoisePlay.innerHTML='&#9654;';denoisePlay.setAttribute('aria-label','Play denoising');}
  document.getElementById('denoise-range').addEventListener('input',event=>{stopDenoise();denoiseStep=Number(event.target.value);drawDenoising(denoiseStep);});
  denoisePlay.addEventListener('click',()=>{if(denoiseTimer){stopDenoise();return;}if(denoiseStep===10)denoiseStep=0;denoisePlay.innerHTML='&#10074;&#10074;';denoisePlay.setAttribute('aria-label','Pause denoising');drawDenoising(denoiseStep);denoiseTimer=setInterval(()=>{denoiseStep++;drawDenoising(denoiseStep);if(denoiseStep===10)stopDenoise();},550);});
  updateStage(0);drawDenoising(0);
})();
