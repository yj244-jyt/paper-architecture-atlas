(() => {
  const el=id=>document.getElementById(id);
  el('paperLink').href='https://arxiv.org/abs/2403.19460';
  const math=tex=>'<div class="math-display">\\['+tex+'\\]</div>';
  function typeset(root){
    if(window.MathJax&&MathJax.startup&&MathJax.startup.promise){
      MathJax.startup.promise.then(()=>MathJax.typesetPromise([root])).catch(console.error);
    }
  }
  const stages=[
    {short:'Scene input',title:'Multi-view RGB-D → full-scene point cloud',sub:'Six-camera fusion; no object segmentation',
      desc:'The simulated setup uses six RGB-D cameras around an uneven table of radius 0.75 m. Their observations are fused and downsampled to 8,192 colored points. The mug, rack, robot, table, and distractors share one input cloud. This 3D reconstruction follows the task layout, but its geometry and displayed point count are not original simulator data.',
      formula:'P=\\{(x_i,c_i)\\}_{i=1}^{N},\\qquad x_i,c_i\\in\\mathbb{R}^{3}',
      input:'Multi-view depth and color',output:'N×6 scene cloud',ref:'§3.1 p.3; §5.1 p.6; Fig. 4 p.6',active:0},
    {short:'Type-0 RGB',title:'RGB as three type-0 fields',sub:'Coordinates remain geometry, not input features',
      desc:'Each point contributes three rotationally invariant scalar channels: R, G, and B. The SE(3)-Transformer uses point coordinates for relative geometry and local neighborhoods; coordinates also enter the later weighted sum. The paper explicitly uses color alone as input features.',
      formula:'f_{\\mathrm{in}}(x)=f_0^R(x)\\oplus f_0^G(x)\\oplus f_0^B(x),\\qquad D^{(0)}(Q)=1',
      input:'Point positions xᵢ and colors cᵢ',output:'Three type-0 features per point',ref:'§4.1, Eq. (3), p.4',active:1},
    {short:'φ saliency',title:'φ predicts saliency over the full scene',sub:'Four local SE(3)-Transformer layers',
      desc:'φ produces a type-0 saliency score for every point. Attention and message passing connect local neighbors. Table 3 reports a 0.10 m message distance, four layers, and maximum type-l of 4 for φ. Saliency localizes the task region; it is not a segmentation mask.',
      formula:'f_s(x_i)=\\phi(P)_i,\\qquad w_i=\\frac{e^{f_s(x_i)}}{\\sum_j e^{f_s(x_j)}}',
      input:'Full-scene point features',output:'N saliency scalars',ref:'§4.2 p.5; Table 3 p.14',active:2},
    {short:'ROI',title:'Coarse target position and r₁ neighborhood',sub:'Later networks process only a local cloud',
      desc:'Algorithm 1 obtains a coarse target position by applying saliency Softmax weights to coordinates, then selects points within radius r₁. Section 4.2 instead describes the highest-scoring point as the center. This demonstration follows the weighted center in Algorithm 1 while preserving that distinction.',
      formula:'\\tilde t=\\sum_i w_i x_i,\\qquad B_{\\mathrm{ROI}}=\\{x_i:\\|x_i-\\tilde t\\|_2\\le r_1\\}',
      input:'P and saliency scores',output:'Local point set B_ROI',ref:'§4.2 p.5; Algorithm 1 p.12; Appendix A.4.2 p.14',active:3},
    {short:'ψ₁ / ψ₂',title:'Two action branches share the ROI',sub:'Position scalar field + orientation vector fields',
      desc:'ψ₁ outputs one type-0 affordance field on the ROI. ψ₂ outputs three type-1 vector fields, one for each orientation-matrix column. Each branch has four layers, one head, eight channels, and a 0.07 m message distance. The faucet task adds a fourth direction field to ψ₂.',
      formula:'f_t(x)=\\psi_1(B_{\\mathrm{ROI}})_x,\\quad \\psi_2(B_{\\mathrm{ROI}})_x=\\bigoplus_{k=1}^{3}f_1^k(x)',
      input:'ROI points and RGB',output:'1×type-0 + 3×type-1',ref:'§§4.1–4.2 pp.4–6; Table 3 p.14',active:4},
    {short:'Position t̂',title:'Affordance Softmax → target position',sub:'Continuous weighted coordinate sum',
      desc:'The ψ₁ output supplies logits. Softmax-normalized weights produce a weighted sum of all ROI coordinates. Because the weights sum to one, this position construction is naturally translation equivariant. When the target lies outside the object cloud convex hull, the paper assumes an additional offset tₒ.',
      formula:'\\alpha_i=\\operatorname{softmax}_{i\\in B_{\\mathrm{ROI}}}f_t(x_i),\\qquad \\hat t=\\sum_{i\\in B_{\\mathrm{ROI}}}\\alpha_i x_i\\;(+t_o)',
      input:'ROI coordinates + type-0 logits',output:'Target translation t̂ ∈ R³',ref:'§4.1 p.4; §4.2 p.5',active:5},
    {short:'Vector pool',title:'Mean-pool three vector fields inside r₂',sub:'Use directions near the target position',
      desc:'A smaller r₂ neighborhood is selected around predicted t̂. Each ψ₂ type-1 field is averaged over those points to form three candidate orientation axes. The appendix notes that an r₂ that is too small amplifies single-point noise. The articulated task also pools its fourth field into a direction d̂.',
      formula:'B_2=\\{x\\in B_{\\mathrm{ROI}}:\\|x-\\hat t\\|_2\\le r_2\\},\\quad v_k=\\frac{1}{|B_2|}\\sum_{x\\in B_2} f_1^k(x)',
      input:'Pointwise ψ₂ vector fields',output:'Three candidate orientation axes',ref:'§4.2 pp.5–6; Appendix A.9.2 p.18',active:6},
    {short:'IMGS',title:'IMGS orthogonalization',sub:'Construct a valid rotation for control',
      desc:'The three pooled vectors need not be orthogonal. Amber lines in the 3D scene illustrate raw candidate axes; red, green, and blue show orthogonalized axes. The paper uses two rounds of Iterative Modified Gram-Schmidt to obtain a valid rotation matrix. Figure 3 places this step on the non-backpropagating control path.',
      formula:'\\hat R=[v_1\\;v_2\\;v_3],\\qquad \\hat R_o=\\operatorname{IMGS}(\\hat R)\\in SO(3)',
      input:'Three candidate type-1 vectors',output:'Rotation matrix R̂ₒ',ref:'§4.2 p.6; Fig. 3 p.6; Appendix A.2 p.12',active:7},
    {short:'Action',title:'6-DoF end-effector target and execution',sub:'Pose, direction, and motion planning are distinct',
      desc:'The policy directly predicts an end-effector target pose; an external collision-aware motion planner executes it. Mug-on-rack and plane-on-shelf tasks have grasp and place phases. The faucet task reaches a target pose, then moves along a continuously predicted direction while maintaining orientation. The green line and gripper illustrate a target path, not the authors’ original planned trajectory.',
      formula:'\\hat T=(\\hat R_o,\\hat t)\\in SE(3),\\qquad \\text{articulated task: }\\hat d\\in\\mathbb R^3',
      input:'t̂, R̂ₒ; articulated task +d̂',output:'Robot target action',ref:'§3.1 p.3; §4.2 p.6; Appendix A.5.1 p.15',active:8}
  ];
  const visualStages=[
    {lead:'Six RGB-D views describe the same workspace. Fusion produces one cloud containing the target, robot, and uneven table.',
      items:[['cameras','Six RGB-D views','Color and depth from around the table'],['scene','Shared workspace','The raised table sector is 0.10 m higher'],['cloud','One point cloud P','Each dot has position and RGB']]},
    {lead:'The network reads color as three scalar values at each point. 3D coordinates define where points are and which points are neighbors.',
      items:[['cloud','Point xᵢ','A location in 3D space'],['rgb','RGB values cᵢ','Three numbers attached to xᵢ'],['scalars','Three type-0 channels','R, G, and B stay scalar under rotation']]},
    {lead:'The saliency network compares nearby points through four local layers and assigns one score to every input point.',
      items:[['neighbors','Local point neighbors','Connections use 3D distance'],['network','φ: four layers','SE(3)-Transformer message passing'],['scores','Saliency scores','Brighter dots matter more for the coarse position']]},
    {lead:'High saliency points pull the weighted center toward the task. A radius-r₁ sphere around that center retains the local ROI.',
      items:[['scores','Scores over P','Softmax converts scores to weights'],['roi','Coarse center + r₁','Points inside the sphere are selected'],['crop','ROI cloud','Later networks see only these points']]},
    {lead:'The same ROI goes to two parallel networks: one predicts a scalar grasp-position score per point; the other predicts three vectors per point.',
      items:[['crop','Shared ROI','Local points and RGB'],['scalar','ψ₁: position field','One type-0 value per point'],['vector','ψ₂: orientation fields','Three type-1 arrows per point']]},
    {lead:'The position field becomes Softmax weights. Every ROI point contributes its coordinate; their weighted sum gives the predicted target position.',
      items:[['scalar','Pointwise logits','A value from ψ₁ at every ROI point'],['weights','Weighted coordinates','Larger αᵢ contributes more'],['target','Predicted t̂','A 3D point near the grasp site']]},
    {lead:'Near t̂, the r₂ neighborhood selects reliable orientation predictions. Average each of the three vector fields separately.',
      items:[['local','r₂ around t̂','Keep nearby ROI points'],['vector','Vectors at each point','Three type-1 fields from ψ₂'],['pooled','Mean vectors v₁,v₂,v₃','Candidate orientation axes']]},
    {lead:'The three averaged vectors may be skewed. IMGS makes them orthonormal so they form a valid rotation matrix.',
      items:[['raw','Before IMGS','Three candidate axes need not be perpendicular'],['orthogonalize','Two IMGS rounds','Correct the axes and normalize them'],['rotation','Rotation R̂ₒ','Perpendicular, unit-length axes']]},
    {lead:'Position and orientation specify an end-effector target pose. A separate planner executes the reach and manipulation.',
      items:[['pose','Target pose T̂','Translation t̂ plus rotation R̂ₒ'],['planner','Motion planner','Computes a collision-aware route'],['action','Robot action','Reach, grasp, move, or turn']]}
  ];
  const visualDots=[[21,49],[29,35],[35,58],[43,43],[50,27],[54,55],[63,40],[70,61],[77,33],[83,51],[91,27],[100,45],[108,58],[118,37]];
  const dot=(x,y,r,color)=>'<circle cx="'+x+'" cy="'+y+'" r="'+r+'" fill="'+color+'"/>';
  const stroke=(x1,y1,x2,y2,color,width=2)=>'<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="'+color+'" stroke-width="'+width+'" stroke-linecap="round"/>';
  function visualGlyph(kind){
    const blue='#315d91',green='#007e70',red='#b64e45',gray='#a8b6af',amber='#a77924';
    const cloud=visualDots.map(([x,y],i)=>dot(x,y,3.2,i>3&&i<10?blue:gray)).join('');
    const axes=stroke(69,58,104,48,red,3)+stroke(69,58,64,20,green,3)+stroke(69,58,42,69,blue,3)+dot(69,58,4,'#17262c');
    let body='';
    if(kind==='cameras')body='<path d="M45 62 Q70 72 95 62" fill="none" stroke="#788b85" stroke-width="5"/>'+dot(70,49,8,blue)+[[17,35],[34,15],[62,7],[91,7],[117,16],[124,38]].map(([x,y])=>'<rect x="'+x+'" y="'+y+'" width="10" height="8" rx="1" fill="#384851"/>'+stroke(x+5,y+8,70,49,green,1)).join('');
    else if(kind==='scene')body='<ellipse cx="70" cy="65" rx="58" ry="12" fill="#788b85"/><path d="M39 59 v-22 h15 v22 M81 59 v-31 h8 v31" fill="none" stroke="#384851" stroke-width="7"/><rect x="28" y="33" width="19" height="22" rx="3" fill="'+blue+'"/><rect x="96" y="49" width="13" height="12" fill="#d97052"/>';
    else if(kind==='cloud'||kind==='crop')body=cloud+(kind==='crop'?'<circle cx="70" cy="44" r="37" fill="none" stroke="'+green+'" stroke-width="2"/>':'');
    else if(kind==='rgb')body=dot(48,42,7,blue)+['#c34d43','#2e9e70','#315d91'].map((c,i)=>'<rect x="'+(75+i*14)+'" y="30" width="10" height="25" rx="2" fill="'+c+'"/>').join('')+stroke(57,42,71,42,gray);
    else if(kind==='scalars')body=['R','G','B'].map((v,i)=>'<circle cx="'+(39+i*31)+'" cy="41" r="13" fill="'+[red,green,blue][i]+'"/><text x="'+(39+i*31)+'" y="45" text-anchor="middle" fill="#fff" font-size="12" font-weight="700">'+v+'</text>').join('');
    else if(kind==='neighbors')body=cloud+'<circle cx="70" cy="45" r="25" fill="none" stroke="'+green+'" stroke-dasharray="4 3" stroke-width="2"/>'+stroke(70,45,54,55,green)+stroke(70,45,83,51,green)+stroke(70,45,63,40,green)+dot(70,45,5,red);
    else if(kind==='network')body=[20,48,76,104].map((x,i)=>'<rect x="'+x+'" y="29" width="18" height="30" rx="2" fill="'+(i===3?green:'#c9e4da')+'" stroke="'+green+'"/><text x="'+(x+9)+'" y="48" text-anchor="middle" fill="'+(i===3?'#fff':green)+'" font-size="11">'+(i+1)+'</text>').join('')+stroke(38,44,48,44,green)+stroke(66,44,76,44,green)+stroke(94,44,104,44,green);
    else if(kind==='scores')body=visualDots.map(([x,y],i)=>dot(x,y,i>4&&i<10?5:2.5,i>4&&i<10?red:gray)).join('');
    else if(kind==='roi'||kind==='local')body=cloud+'<circle cx="69" cy="45" r="'+(kind==='local'?21:36)+'" fill="'+green+'" fill-opacity=".09" stroke="'+green+'" stroke-width="2"/>'+dot(69,45,5,red);
    else if(kind==='scalar')body=visualDots.slice(2,12).map(([x,y],i)=>dot(x,y,i>2&&i<7?6:3,i>2&&i<7?red:gray)).join('')+'<text x="105" y="18" fill="'+red+'" font-size="13">fₜ</text>';
    else if(kind==='vector')body=[[40,58],[70,49],[101,59]].map(([x,y])=>dot(x,y,3,blue)+stroke(x,y,x+10,y-3,red,2)+stroke(x,y,x+2,y-13,green,2)+stroke(x,y,x-9,y-7,blue,2)).join('')+'<text x="90" y="19" fill="'+green+'" font-size="12">3 × f₁</text>';
    else if(kind==='weights')body=visualDots.slice(2,12).map(([x,y],i)=>dot(x,y,i>2&&i<7?5:2.5,i>2&&i<7?red:gray)+stroke(x,y,71,46,amber,1)).join('')+dot(71,46,5,green);
    else if(kind==='target')body='<path d="M43 60 V27 H77 V60 M77 33 Q108 22 106 46 Q102 66 77 55" fill="none" stroke="'+blue+'" stroke-width="5"/>'+dot(106,44,5,red)+stroke(97,44,115,44,red)+stroke(106,35,106,53,red);
    else if(kind==='pooled'||kind==='raw'||kind==='rotation')body=kind==='raw'?stroke(69,58,108,46,amber,3)+stroke(69,58,78,19,amber,3)+stroke(69,58,37,45,amber,3)+dot(69,58,4,'#17262c'):axes+(kind==='rotation'?'<path d="M69 48 h10 v10" fill="none" stroke="#17262c" stroke-width="1.5"/>':'');
    else if(kind==='orthogonalize')body=stroke(28,59,53,42,amber,3)+stroke(28,59,39,28,amber,3)+stroke(28,59,77,59,amber,3)+'<text x="70" y="51" fill="'+green+'" font-size="17" font-weight="700">→</text>'+stroke(103,59,124,59,red,3)+stroke(103,59,103,31,green,3);
    else if(kind==='pose')body=axes+'<path d="M32 70 H115" stroke="'+gray+'" stroke-width="2" stroke-dasharray="4 4"/><text x="102" y="30" fill="'+red+'" font-size="12">t̂</text>';
    else if(kind==='planner')body='<rect x="17" y="59" width="20" height="10" fill="#384851"/>'+stroke(27,59,47,32,'#c7d2cd',9)+stroke(47,32,75,41,'#c7d2cd',8)+stroke(75,41,104,24,'#c7d2cd',7)+'<path d="M106 26 Q121 38 107 57" fill="none" stroke="'+green+'" stroke-width="2" stroke-dasharray="4 3"/>';
    else if(kind==='action')body='<path d="M33 60 V34 H53 V60 M53 40 Q77 36 72 52 Q68 62 53 56" fill="none" stroke="'+blue+'" stroke-width="4"/><path d="M64 29 Q86 16 107 37" fill="none" stroke="'+green+'" stroke-width="2" stroke-dasharray="4 3"/><path d="M109 60 V22 M109 33 h19" stroke="'+amber+'" stroke-width="5" fill="none"/>';
    return '<svg viewBox="0 0 140 86" role="img" aria-hidden="true">'+body+'</svg>';
  }
  function renderVisual(){
    const data=visualStages[step];
    const root=el('stageVisual');
    root.innerHTML='<div class="visual-head"><span class="eyebrow">What changes in this step</span><p>'+data.lead+'</p></div><div class="visual-flow">'+data.items.map(([kind,title,detail],i)=>'<div class="visual-item">'+visualGlyph(kind)+'<div><strong>'+title+'</strong><span>'+detail+'</span></div></div>'+(i<2?'<div class="visual-arrow" aria-hidden="true">→</div>':'')).join('')+'</div>';
    root.hidden=false;
  }
  const trainStages=[
    {short:'Demos',title:'Input demonstration clouds and target poses',desc:'Each iteration samples a batch of demonstrations. A demonstration supplies scene cloud P and end-effector target T=(R,t), which supervise the three networks. Real and simulated clouds are transformed into the end-effector coordinate frame.',formula:'\\mathcal D=\\{(P_i,T_i)\\}_{i=1}^{M},\\quad T_i=(R_i,t_i)',ref:'§3.1 p.3; Algorithm 1 p.12; Appendix A.5.2, A.6.1',nodes:['sample']},
    {short:'φ forward',title:'Four-layer full-scene φ forward pass',desc:'Three RGB type-0 input fields and the coordinate graph enter φ. Its four local SE(3)-Transformer layers produce pointwise saliency scalars; Softmax yields a coarse position. The diagram shows four backbone blocks because the paper does not specify per-layer tensor widths.',formula:'f_s=\\phi(P),\\qquad \\tilde t=\\sum_{x_i\\in P}\\operatorname{softmax}(f_s)_i x_i',ref:'§§4.1–4.2 pp.4–5; Table 3 p.14',nodes:['sample','phi']},
    {short:'ROI crop',title:'Select local points with radius r₁',desc:'The coarse target position from saliency defines the ROI. Section 4.2 describes an argmax center, while Algorithm 1 uses a weighted center; this diagram follows Algorithm 1. Cropping selects discrete points, and ψ₁ and ψ₂ process only those retained.',formula:'B_{\\mathrm{ROI}}=\\{x\\in P:\\|x-\\tilde t\\|_2\\le r_1\\}',ref:'§4.2 p.5; Algorithm 1 p.12',nodes:['sample','phi','roi']},
    {short:'Branches',title:'ψ₁ and ψ₂ produce action fields in parallel',desc:'Both branches are four-layer local SE(3)-Transformers. ψ₁ yields pointwise type-0 affordance; ψ₂ yields three type-1 orientation vector fields. The faucet task adds a fourth direction field.',formula:'f_t=\\psi_1(B_{\\mathrm{ROI}}),\\qquad f_R=\\psi_2(B_{\\mathrm{ROI}})',ref:'§4.2 pp.5–6; Table 3 p.14',nodes:['sample','phi','roi','psi1','psi2']},
    {short:'Aggregate',title:'Differentiable position and local vector pooling',desc:'Softmax weights from ψ₁ yield t̂ as a weighted coordinate sum. ψ₂ pools three vectors in the r₂ neighborhood of t̂ to form R̂. Figure 3 shows these output paths feeding training supervision.',formula:'\\hat t=\\sum_{x_i\\in B_{\\mathrm{ROI}}}\\alpha_i x_i,\\qquad \\hat R=[\\operatorname{mean}_{B_2}f_1^1\\;\\operatorname{mean}_{B_2}f_1^2\\;\\operatorname{mean}_{B_2}f_1^3]',ref:'§4.2 pp.5–6; Fig. 3 p.6',nodes:['sample','phi','roi','psi1','psi2','t','R']},
    {short:'Losses',title:'Coarse position, fine position, and rotation errors',desc:'Algorithm 1 supervises φ’s coarse position, ψ₁’s fine position, and ψ₂’s rotation axes with squared errors. The terms are shown per sample for clarity; the paper does not fully specify every batch and point normalization. IMGS is outside this training-loss path.',formula:'L_\\phi=\\|\\tilde t-t\\|_2^2,\\quad L_t=\\|\\hat t-t\\|_2^2,\\quad L_R=\\|\\hat R-R\\|_F^2',ref:'Algorithm 1 p.12; Fig. 3 p.6',nodes:['sample','phi','roi','psi1','psi2','t','R','loss']},
    {short:'Backprop',title:'Gradients update φ, ψ₁, and ψ₂',desc:'Algorithm 1 aggregates losses and updates the three models. Softmax, weighted sums, and mean pooling propagate gradients; Figure 3 distinguishes differentiable and non-differentiable paths. The paper reports 200 epochs, batch size 4, and learning rate 10⁻⁴ per module, but does not name an optimizer.',formula:'\\theta\\leftarrow\\operatorname{Update}(\\theta,\\nabla_\\theta L;\\eta),\\qquad \\theta=(\\theta_\\phi,\\theta_{\\psi_1},\\theta_{\\psi_2})',ref:'Algorithm 1 p.12; Appendix A.4.2 p.14',nodes:['sample','phi','roi','psi1','psi2','t','R','loss']}
  ];
  const nodeData={
    sample:{title:'Demo P,T',desc:'The scene cloud contains positions and colors. Target T=(R,t) supervises coarse position, fine position, and rotation axes.',formula:'P=\\{(x_i,c_i)\\},\\qquad T=(R,t)',ref:'§3.1'},
    phi:{title:'φ · Saliency Net',desc:'Four layers; maximum type-l=4; one head; eight channels; 0.10 m local message radius. Produces pointwise type-0 saliency.',formula:'\\phi:\\mathbb R^{N\\times 6}\\longrightarrow\\mathbb R^{N\\times 1}',ref:'Table 3; §4.2'},
    roi:{title:'B_ROI · Local crop',desc:'Spherical neighborhood radius r₁. Simulation uses 0.20 m; real mug uses 0.16 m; real plane uses 0.20 m.',formula:'B_{\\mathrm{ROI}}=\\{x_i:\\|x_i-\\tilde t\\|\\le r_1\\}',ref:'Appendix A.4.2'},
    psi1:{title:'ψ₁ · Position Net',desc:'Four layers; maximum type-l=3; one head; eight channels; 0.07 m message radius. Produces pointwise type-0 affordance.',formula:'\\psi_1:B_{\\mathrm{ROI}}\\longrightarrow f_t(x)\\in\\mathbb R',ref:'Table 3; §4.2'},
    psi2:{title:'ψ₂ · Orientation Net',desc:'Four layers; maximum type-l=4; one head; eight channels; 0.07 m message radius. Produces three type-1 fields, or four for the faucet task.',formula:'\\psi_2:B_{\\mathrm{ROI}}\\longrightarrow\\bigoplus_{k=1}^{3}f_1^k(x)',ref:'Table 3; §4.2'},
    t:{title:'t̂ · Position aggregate',desc:'Softmax-normalize ψ₁ outputs and weight each ROI point coordinate.',formula:'\\hat t=\\sum_i\\alpha_i x_i,\\qquad \\sum_i\\alpha_i=1',ref:'§4.2'},
    R:{title:'R̂ · Orientation pool',desc:'Average each of three type-1 fields within the r₂ neighborhood of t̂.',formula:'v_k=|B_2|^{-1}\\sum_{x\\in B_2}f_1^k(x)',ref:'§4.2'},
    loss:{title:'Three supervision losses',desc:'Coarse position, fine position, and rotation-axis errors jointly update the three networks. This is a conceptual decomposition; see Algorithm 1 for exact summation indices.',formula:'L\\sim L_\\phi+L_t+L_R',ref:'Algorithm 1'},
    imgs:{title:'IMGS · Control branch',desc:'At inference, orthogonalize the three candidate columns. Figure 3 places this on the non-backpropagating control path.',formula:'\\hat R_o=\\operatorname{IMGS}([v_1\\;v_2\\;v_3])',ref:'Fig. 3; Appendix A.2'}
  };
  let inferenceScene=null,equivScene=null,currentTask='mug',step=0,trainStep=0,timer=null,trainTimer=null,selectedNode='sample',actionManual=false,outputTicks=0;
  try{
    inferenceScene=new window.Riemann3D(el('scene3d'),{onSelect:showPoint,onActionProgress:showAction});
    inferenceScene.setTask(currentTask);
  }catch(error){console.error(error);el('sceneError').hidden=false}
  function showPoint(p){
    const out=el('pointReadout');
    if(!p){out.textContent='Click a point in the 3D cloud to inspect its position, ROI membership, and illustrative weight.';return}
    const kind={target:'target',scene:'scene',distractor:'distractor block'}[p.kind];
    out.innerHTML='<b>Point #'+p.id+' · '+kind+'</b><br>Position ('+p.x.toFixed(3)+', '+p.y.toFixed(3)+', '+p.z.toFixed(3)+') m<br>Illustrative saliency '+p.score.toFixed(2)+' · ROI '+(p.roi?'inside':'outside')+' · r₂ '+(p.pool?'inside':'outside')+'<br>Illustrative position weight '+p.weight.toFixed(5)+(p.radius?'<br>Within '+p.radius.toFixed(2)+' m message radius: '+p.neighbors+' neighbors · first type-1 axis ('+p.axis.map(x=>x.toFixed(2)).join(', ')+')':'');
  }
  function showAction(progress,label){
    el('actionScrub').value=Math.round(progress*100);
    el('actionCaption').textContent=label;
  }
  function setTask(name){
    currentTask=name;
    document.querySelectorAll('[data-task]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.task===name)));
    if(inferenceScene)el('taskCaption').textContent=inferenceScene.setTask(name);
    if(equivScene)equivScene.setTask(name);
    showPoint(null);
    applyTransforms();
    if(step===8)setStep(8);
  }
  document.querySelectorAll('[data-task]').forEach(b=>b.addEventListener('click',()=>setTask(b.dataset.task)));
  document.querySelectorAll('[data-mode]').forEach(b=>b.addEventListener('click',()=>{
    document.querySelectorAll('[data-mode]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));
    if(inferenceScene)inferenceScene.setMode(b.dataset.mode);
  }));
  function applyTransforms(){
    const a=Number(el('rotation').value),b=Number(el('pitch').value),d=Number(el('translation').value);
    el('rotationVal').textContent=a+'°';el('pitchVal').textContent=b+'°';el('translationVal').textContent=d+' cm';
    if(inferenceScene)inferenceScene.setTransform(a,b,d/100);
  }
  for(const id of ['rotation','pitch','translation'])el(id).addEventListener('input',applyTransforms);
  el('distractor').addEventListener('change',()=>inferenceScene&&inferenceScene.setDistractor(el('distractor').checked));
  function renderStep(){
    const s=stages[step];el('scrub').value=step;el('counter').textContent=String(step+1).padStart(2,'0')+' / 09';
    el('worldTitle').textContent=s.title;el('worldSub').textContent=s.sub;
    const flow=el('workflow');flow.replaceChildren();
    stages.forEach((x,i)=>{const b=document.createElement('button');b.className='step'+(i===step?' active':'')+(i<step?' done':'');b.type='button';b.setAttribute('aria-current',i===step?'step':'false');b.innerHTML='<span class="step-num">'+String(i+1).padStart(2,'0')+'</span><span class="step-title">'+x.short+'</span>';b.addEventListener('click',()=>setStep(i));flow.append(b)});
    el('detail').innerHTML='<div class="kicker">STEP '+String(step+1).padStart(2,'0')+' / 09</div><h2>'+s.title+'</h2><p>'+s.desc+'</p>'+math(s.formula)+'<div class="io-row"><div><b>Input</b>'+s.input+'</div><div><b>Output</b>'+s.output+'</div></div><div class="paper-ref">Paper reference: '+s.ref+'</div>';
    typeset(el('detail'));
    const micro=['Cloud P','RGB/type-0','φ','B_ROI','ψ₁ / ψ₂','t̂','R̂','IMGS','T̂'];
    el('microFlow').innerHTML=micro.map((x,i)=>'<span'+(i===step?' class="active"':'')+'>'+x+'</span>').join('');
    renderVisual();
    if(inferenceScene)inferenceScene.setStep(step);
    el('actionBar').hidden=step!==8;
  }
  function setStep(n){
    const previous=step;step=Math.max(0,Math.min(8,n));outputTicks=0;
    if(inferenceScene&&previous===8&&step!==8){inferenceScene.setActionPlaying(false);inferenceScene.setActionProgress(0);actionManual=false;el('actionPlay').textContent='▶'}
    renderStep();
    if(inferenceScene&&step===8){inferenceScene.setActionProgress(0);if(timer){inferenceScene.setActionPlaying(true);el('actionPlay').textContent='Ⅱ'}}
  }
  function stop(){
    if(timer){clearInterval(timer);timer=null}
    if(inferenceScene)inferenceScene.setActionPlaying(false);
    actionManual=false;el('actionPlay').textContent='▶';
    el('play').textContent='▶';el('play').setAttribute('aria-label','Play');
  }
  function play(){
    if(timer)return;
    el('play').textContent='Ⅱ';el('play').setAttribute('aria-label','Pause');
    if(step===8&&inferenceScene){inferenceScene.setActionPlaying(true);el('actionPlay').textContent='Ⅱ'}
    timer=setInterval(()=>{
      if(step===8){
        outputTicks++;
        if(outputTicks<Math.ceil(4000/Number(el('speed').value)))return;
        outputTicks=0;
        if(el('loop').checked)setStep(0);else stop();
      }else setStep(step+1);
    },Number(el('speed').value));
  }
  el('play').addEventListener('click',()=>timer?stop():play());
  el('back').addEventListener('click',()=>setStep(step-1));
  el('forward').addEventListener('click',()=>setStep(step+1));
  el('scrub').addEventListener('input',e=>setStep(Number(e.target.value)));
  el('speed').addEventListener('change',()=>{if(timer){stop();play()}});
  el('actionPlay').addEventListener('click',()=>{
    if(timer)stop();
    actionManual=!actionManual;
    if(inferenceScene)inferenceScene.setActionPlaying(actionManual);
    el('actionPlay').textContent=actionManual?'Ⅱ':'▶';
    el('actionPlay').setAttribute('aria-label',actionManual?'Pause task action':'Play task action');
  });
  el('actionScrub').addEventListener('input',e=>{
    if(timer)stop();
    actionManual=false;el('actionPlay').textContent='▶';
    if(inferenceScene){inferenceScene.setActionPlaying(false);inferenceScene.setActionProgress(Number(e.target.value)/100)}
  });

  const svgNS='http://www.w3.org/2000/svg';
  function svg(tag,attrs={}){const o=document.createElementNS(svgNS,tag);for(const [k,v] of Object.entries(attrs))o.setAttribute(k,v);return o}
  const nodes=[
    {id:'sample',x:20,y:180,w:130,h:86,title:'Demo P,T',sub:'Cloud + target pose'},
    {id:'phi',x:195,y:145,w:175,h:145,title:'φ Saliency Net',sub:'N → N × type-0',layers:4},
    {id:'roi',x:425,y:180,w:125,h:86,title:'B_ROI',sub:'r₁ neighborhood'},
    {id:'psi1',x:600,y:65,w:175,h:145,title:'ψ₁ Position Net',sub:'M → M × type-0',layers:4},
    {id:'psi2',x:600,y:260,w:175,h:145,title:'ψ₂ Orientation Net',sub:'M → M × 3 type-1',layers:4},
    {id:'t',x:825,y:96,w:130,h:76,title:'t̂ position',sub:'Softmax × coords'},
    {id:'R',x:825,y:297,w:130,h:76,title:'R̂ orientation',sub:'r₂ mean pool'},
    {id:'loss',x:1000,y:180,w:85,h:90,title:'Loss L',sub:'3 objectives'},
    {id:'imgs',x:1000,y:335,w:85,h:76,title:'IMGS',sub:'Control only'}
  ];
  const links=[
    ['sample','phi','M150 223 L195 218'],
    ['phi','roi','M370 218 L425 223'],
    ['roi','psi1','M550 205 C570 205 575 138 600 138'],
    ['roi','psi2','M550 240 C570 240 575 333 600 333'],
    ['psi1','t','M775 138 L825 134'],
    ['psi2','R','M775 333 L825 335'],
    ['t','loss','M955 134 C978 134 977 205 1000 210'],
    ['R','loss','M955 335 C977 335 977 260 1000 248'],
    ['R','imgs','M955 348 L1000 372']
  ];
  const phaseNodeSets=trainStages.map(s=>new Set(s.nodes));
  function nodeShape(n,active){
    const g=svg('g',{class:'node'+(active?' active':'')+(selectedNode===n.id?' selected':''),tabindex:'0',role:'button','aria-label':n.title,'data-node':n.id});
    g.append(svg('rect',{x:n.x,y:n.y,width:n.w,height:n.h,rx:4}));
    const title=svg('text',{x:n.x+11,y:n.y+21});title.textContent=n.title;g.append(title);
    const sub=svg('text',{x:n.x+11,y:n.y+39,class:'tiny'});sub.textContent=n.sub;g.append(sub);
    if(n.layers){
      for(let j=0;j<n.layers;j++){
        const box=svg('rect',{x:n.x+11+j*39,y:n.y+63,width:31,height:38,rx:2,fill:active?'#bde4d7':'#eaf3ef',stroke:'#9bbfb2'});
        g.append(box);
        const label=svg('text',{x:n.x+22+j*39,y:n.y+86,class:'tiny'});label.textContent='L'+(j+1);g.append(label);
      }
      const note=svg('text',{x:n.x+11,y:n.y+121,class:'tiny'});note.textContent='4 layers · 1 head · 8 channels';g.append(note);
    }
    g.addEventListener('click',()=>selectNode(n.id));
    g.addEventListener('keydown',e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();selectNode(n.id)}});
    return g;
  }
  function drawNetwork(){
    const graph=el('networkGraph');graph.replaceChildren();
    const active=phaseNodeSets[trainStep];
    for(const [from,to,path] of links){
      const isActive=active.has(from)&&active.has(to),reverse=trainStep===6&&isActive&&to!=='imgs';
      graph.append(svg('path',{d:path,class:'edge'+(isActive?' active':'')+(reverse?' gradient':'')}));
    }
    for(const n of nodes)graph.append(nodeShape(n,active.has(n.id)));
    const legend=svg('text',{x:25,y:450,class:'tiny'});
    legend.textContent=trainStep===6?'Red dashed: conceptual gradient paths to all three nets':'Green: active forward path in this training stage';
    graph.append(legend);
    const mobile=el('networkMobile');mobile.replaceChildren();
    function mobileNode(id){
      const n=nodes.find(x=>x.id===id),b=document.createElement('button');
      b.type='button';b.className=(active.has(id)?'active ':'')+(selectedNode===id?'selected':'');
      b.innerHTML='<strong>'+n.title+'</strong><small>'+n.sub+'</small>'+(n.layers?'<span class="mn-layers"><i>L1</i><i>L2</i><i>L3</i><i>L4</i></span>':'');
      b.addEventListener('click',()=>selectNode(id));return b;
    }
    function row(ids){
      const d=document.createElement('div');d.className=ids.length===2?'mn-pair':'mn-one';
      ids.forEach(id=>d.append(mobileNode(id)));mobile.append(d);
    }
    function arrow(pair=false){
      const d=document.createElement('div');d.className=pair?'mn-arrow pair':'mn-arrow';
      if(pair)d.innerHTML='<span>↓</span><span>↓</span>';else d.textContent='↓';
      mobile.append(d);
    }
    row(['sample']);arrow();row(['phi']);arrow();row(['roi']);arrow(true);
    row(['psi1','psi2']);arrow(true);row(['t','R']);arrow(true);row(['loss','imgs']);
  }
  function selectNode(id){
    selectedNode=id;drawNetwork();
    const n=nodeData[id];
    el('nodeDetail').innerHTML='<h2>'+n.title+'</h2><p>'+n.desc+'</p>'+math(n.formula)+'<div class="paper-ref">Paper reference: '+n.ref+'</div>';
    typeset(el('nodeDetail'));
  }
  function renderTrain(){
    const s=trainStages[trainStep];
    el('trainScrub').value=trainStep;el('trainCounter').textContent=String(trainStep+1).padStart(2,'0')+' / 07';
    el('trainDetail').innerHTML='<div class="kicker">TRAIN '+String(trainStep+1).padStart(2,'0')+' / 07</div><h2>'+s.title+'</h2><p>'+s.desc+'</p>'+math(s.formula)+'<div class="paper-ref">Paper reference: '+s.ref+'</div>';
    typeset(el('trainDetail'));
    const phases=el('trainingPhase');phases.replaceChildren();
    trainStages.forEach((x,i)=>{const b=document.createElement('button');b.type='button';b.className=i===trainStep?'active':'';b.textContent=x.short;b.addEventListener('click',()=>setTrain(i));phases.append(b)});
    drawNetwork();
  }
  function setTrain(n){trainStep=Math.max(0,Math.min(6,n));renderTrain()}
  function trainStop(){if(trainTimer){clearInterval(trainTimer);trainTimer=null}el('trainPlay').textContent='▶';el('trainPlay').setAttribute('aria-label','Play training')}
  function trainPlay(){if(trainTimer)return;el('trainPlay').textContent='Ⅱ';el('trainPlay').setAttribute('aria-label','Pause training');trainTimer=setInterval(()=>{if(trainStep===6){if(el('trainLoop').checked)setTrain(0);else trainStop()}else setTrain(trainStep+1)},1200)}
  el('trainPlay').addEventListener('click',()=>trainTimer?trainStop():trainPlay());
  el('trainBack').addEventListener('click',()=>setTrain(trainStep-1));
  el('trainForward').addEventListener('click',()=>setTrain(trainStep+1));
  el('trainScrub').addEventListener('input',e=>setTrain(Number(e.target.value)));
  function ensureEquiv(){
    if(equivScene)return;
    try{equivScene=new window.Riemann3D(el('equiv3d'),{comparison:true,hideDistractor:true});equivScene.setTask(currentTask);equivScene.setStep(8);equivScene.setMode('solid');applyEquiv()}
    catch(error){console.error(error);el('equivError').hidden=false}
  }
  function applyEquiv(){
    const a=Number(el('eqRot').value),b=Number(el('eqPitch').value),d=Number(el('eqMove').value);
    el('eqRotVal').textContent=a+'°';el('eqPitchVal').textContent=b+'°';el('eqMoveVal').textContent=d+' cm';
    if(equivScene)equivScene.setTransform(a,b,d/100);
  }
  for(const id of ['eqRot','eqPitch','eqMove'])el(id).addEventListener('input',applyEquiv);
  document.querySelectorAll('.tab').forEach(tab=>tab.addEventListener('click',()=>{
    document.querySelectorAll('.tab').forEach(x=>x.setAttribute('aria-selected',String(x===tab)));
    document.querySelectorAll('.view').forEach(x=>x.hidden=x.id!==tab.getAttribute('aria-controls'));
    if(tab.id!=='tab-inference')stop();
    if(tab.id!=='tab-training')trainStop();
    if(tab.id==='tab-equivariance'){ensureEquiv();requestAnimationFrame(()=>equivScene&&equivScene.resize())}
    if(tab.id==='tab-inference')requestAnimationFrame(()=>inferenceScene&&inferenceScene.resize());
    if(tab.id==='tab-training')typeset(el('training'));
  }));
  renderStep();renderTrain();selectNode('sample');applyEquiv();
  typeset(el('equivariance'));
})();
