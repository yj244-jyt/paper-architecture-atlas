(() => {
  const mount = document.getElementById('scene');
  const error = document.getElementById('scene-error');
  const metric = document.getElementById('scene-metric');
  if (!window.THREE || !mount) { if (error) error.hidden = false; return; }

  let renderer;
  try { renderer = new THREE.WebGLRenderer({antialias:true,alpha:false,preserveDrawingBuffer:true}); }
  catch (_) { error.hidden = false; return; }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1,2));
  renderer.setClearColor(0xdfe8e2,1);
  renderer.outputEncoding = THREE.sRGBEncoding;
  mount.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(40,1,.1,100);
  scene.add(new THREE.HemisphereLight(0xffffff,0x657c70,.58));
  const sun = new THREE.DirectionalLight(0xfff4e8,.78);
  sun.position.set(-2,6,4);
  scene.add(sun);
  const fill = new THREE.DirectionalLight(0xd5e5e0,.2);
  fill.position.set(4,3,-3);
  scene.add(fill);
  const grid = new THREE.GridHelper(6.6,16,0x8fa79d,0xb9cbbf);
  grid.position.y = -.16;
  scene.add(grid);

  const root = new THREE.Group();
  scene.add(root);
  const groups = {};
  for (const name of ['solid','sensor','rawObject','rawFloor','crop','sample','mlp','pool','condition','denoise','execute']) {
    groups[name] = new THREE.Group();
    root.add(groups[name]);
  }
  const material = (color,roughness=.82) => new THREE.MeshStandardMaterial({color,roughness});
  const mats = {
    table:material(0x779087,.94), bowl:new THREE.MeshStandardMaterial({color:0xa65d47,roughness:.8,side:THREE.DoubleSide}),
    food:material(0xc49a61,1), target:material(0x728c68,.92), drill:material(0x547586,.7),
    metal:material(0x77898a,.48), hand:material(0xb6c2b8,.8), cube:material(0x718f78,.9),
    visual:material(0x3c7167,.75), pose:material(0x5e7890,.75), fused:material(0xa9684b,.75),
    board:material(0x748e83,.92)
  };
  const sharedMaterials = new Set(Object.values(mats));
  const state = {task:'pour',display:'overlay',stage:0,stageStart:performance.now(),yaw:.68,pitch:.37,radius:6.55};
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const refs = {sampled:[],objectPoints:[],floorPoints:[],mlpLayers:[],poolBars:[],conditionBars:[],flows:[],traces:[],path:[]};
  const taskMeta = {
    pour:{origin:[-.9,.46,.1],goal:[.92,.53,-.28]},
    drill:{origin:[-.9,.44,.2],goal:[.95,.36,-.2]},
    reach:{origin:[-1.2,.55,.35],goal:[.85,.48,-.35]}
  };
  const cameraPoint = [-2.68,2.31,1.91];

  function mesh(geometry,mat,parent,x=0,y=0,z=0) {
    const item = new THREE.Mesh(geometry,mat);
    item.position.set(x,y,z);
    parent.add(item);
    return item;
  }
  function box(parent,size,mat,x,y,z) { return mesh(new THREE.BoxGeometry(...size),mat,parent,x,y,z); }
  function line(parent,points,color,opacity=1) {
    const geometry = new THREE.BufferGeometry().setFromPoints(points.map(point=>new THREE.Vector3(...point)));
    const item = new THREE.Line(geometry,new THREE.LineBasicMaterial({color,transparent:opacity<1,opacity}));
    parent.add(item);
    return item;
  }
  function cloud(parent,points,color,size) {
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position',new THREE.Float32BufferAttribute(points.flat(),3));
    const item = new THREE.Points(geometry,new THREE.PointsMaterial({color,size,opacity:.96,transparent:true,depthTest:false,depthWrite:false}));
    parent.add(item);
    return item;
  }
  function seeded(seed) { let value=seed>>>0; return () => { value=(1664525*value+1013904223)>>>0; return value/4294967296; }; }
  function sampleBox(out,cx,cy,cz,sx,sy,sz,count,rng) {
    for(let i=0;i<count;i++) {
      const face=i%6,u=rng()-.5,v=rng()-.5;
      let x=cx+u*sx,y=cy+v*sy,z=cz+(rng()-.5)*sz;
      if(face<2)x=cx+(face?-.5:.5)*sx;
      else if(face<4)y=cy+(face===2?-.5:.5)*sy;
      else z=cz+(face===4?-.5:.5)*sz;
      out.push([x,y,z]);
    }
  }
  function sampleRing(out,cx,cy,cz,radius,count,rng) {
    for(let i=0;i<count;i++) { const a=i/count*Math.PI*2; out.push([cx+Math.cos(a)*(radius+.025*(rng()-.5)),cy+rng()*.37,cz+Math.sin(a)*radius]); }
  }
  function sampleHorizontalCylinder(out,cx,cy,cz,radius,length,count,rng) {
    for(let i=0;i<count;i++) { const a=rng()*Math.PI*2; out.push([cx+(rng()-.5)*length,cy+Math.cos(a)*radius,cz+Math.sin(a)*radius]); }
  }
  function farthest(points,count) {
    const selected=[points[0]],used=new Set([0]),distances=points.map(()=>Infinity);
    while(selected.length<Math.min(count,points.length)) {
      const last=selected[selected.length-1];
      let best=-1,index=-1;
      for(let i=0;i<points.length;i++) {
        if(used.has(i))continue;
        const p=points[i],d=(p[0]-last[0])**2+(p[1]-last[1])**2+(p[2]-last[2])**2;
        distances[i]=Math.min(distances[i],d);
        if(distances[i]>best){best=distances[i];index=i;}
      }
      used.add(index); selected.push(points[index]);
    }
    return selected;
  }
  function clearGroup(group) {
    while(group.children.length) {
      const item=group.children[0]; group.remove(item);
      item.traverse(child=>{
        child.geometry?.dispose();
        if(child.material&&!sharedMaterials.has(child.material)) child.material.dispose();
      });
    }
  }
  function setMetric(value) { if(metric.textContent!==value) metric.textContent=value; }

  function addTask(task,rng) {
    const points=refs.objectPoints;
    box(groups.solid,[3.5,.08,2.35],mats.table,0,-.08,0);
    if(task==='pour') {
      const bowl=mesh(new THREE.CylinderGeometry(.37,.25,.36,40,1,true),mats.bowl,groups.solid,-.9,.37,.1);
      bowl.rotation.z=.08;
      mesh(new THREE.TorusGeometry(.37,.038,8,36),mats.bowl,groups.solid,-.9,.56,.1).rotation.x=Math.PI/2;
      mesh(new THREE.CylinderGeometry(.23,.22,.025,32),mats.food,groups.solid,-.9,.32,.1);
      const target=mesh(new THREE.CylinderGeometry(.55,.55,.06,40),mats.target,groups.solid,.92,.07,-.28);
      target.scale.z=.75;
      sampleRing(points,-.9,.22,.1,.3,205,rng);
      sampleBox(points,.92,.08,-.28,1,.07,.74,105,rng);
      const gripper=new THREE.Group(); gripper.position.set(-1.55,.85,.35); groups.solid.add(gripper);
      box(gripper,[.38,.2,.25],mats.hand,0,0,0);
      box(gripper,[.09,.3,.08],mats.hand,.14,-.19,-.13);
      box(gripper,[.09,.3,.08],mats.hand,.14,-.19,.13);
    } else if(task==='drill') {
      const body=mesh(new THREE.CylinderGeometry(.17,.2,.85,24),mats.drill,groups.solid,-.85,.48,.2);
      body.rotation.z=Math.PI/2;
      box(groups.solid,[.17,.36,.16],mats.drill,-.98,.25,.2);
      const bit=mesh(new THREE.CylinderGeometry(.04,.04,.52,16),mats.metal,groups.solid,-.23,.49,.2);
      bit.rotation.z=Math.PI/2;
      box(groups.solid,[.54,.54,.54],mats.cube,.95,.29,-.2);
      sampleHorizontalCylinder(points,-.85,.5,.2,.17,.78,210,rng);
      sampleBox(points,.95,.29,-.2,.54,.54,.54,130,rng);
      const hand=box(groups.solid,[.38,.26,.28],mats.hand,-1.43,.74,.2); hand.rotation.z=-.3;
    } else {
      mesh(new THREE.SphereGeometry(.18,24,16),mats.target,groups.solid,.85,.48,-.35);
      mesh(new THREE.TorusGeometry(.29,.012,8,40),mats.target,groups.solid,.85,.48,-.35).rotation.x=.32;
      box(groups.solid,[.34,.2,.25],mats.hand,-1.2,.55,.35);
      box(groups.solid,[.08,.32,.08],mats.hand,-1,.35,.22);
      box(groups.solid,[.08,.32,.08],mats.hand,-1,.35,.48);
      sampleBox(points,-1.2,.55,.35,.34,.2,.25,120,rng);
      for(let i=0;i<180;i++) { const u=rng()*Math.PI*2,z=rng()*2-1,r=Math.sqrt(1-z*z); points.push([.85+.18*r*Math.cos(u),.48+.18*z,-.35+.18*r*Math.sin(u)]); }
    }
  }
  function addSensor() {
    const housing=box(groups.sensor,[.34,.2,.23],mats.metal,-2.85,2.35,2.05);
    housing.rotation.y=-.6;
    const lens=mesh(new THREE.CylinderGeometry(.075,.075,.1,20),mats.drill,groups.sensor,-2.7,2.34,1.94);
    lens.rotation.x=Math.PI/2;
    for(const corner of [[-1.45,.04,-.9],[1.5,.04,-.9],[1.5,.04,.8],[-1.45,.04,.8]]) {
      line(groups.sensor,[cameraPoint,corner],0x68877e,.58);
    }
  }
  function addCrop() {
    const edges=new THREE.EdgesGeometry(new THREE.BoxGeometry(3.38,1.15,2.2));
    const boxLine=new THREE.LineSegments(edges,new THREE.LineBasicMaterial({color:0x287e69,transparent:true,opacity:.78}));
    boxLine.position.set(0,.53,0);
    groups.crop.add(boxLine);
    refs.cropBox=boxLine;
  }
  function bars(group,centerX,centerZ,count,color,baseHeights,spread=.68) {
    const result=[];
    const board=box(group,[spread+.17,.045,.48],mats.board,centerX,.035,centerZ);
    board.rotation.y=-.12;
    for(let i=0;i<count;i++) {
      const height=baseHeights[i%baseHeights.length];
      const bar=box(group,[.065,1,.07],color,centerX-spread/2+(i+.5)*spread/count,.08,centerZ+(i%2?-.08:.08));
      bar.userData.height=height;
      result.push(bar);
    }
    return result;
  }
  function flow(parent,from,to,count,color) {
    const result=[];
    for(let i=0;i<count;i++) {
      const particle=mesh(new THREE.SphereGeometry(.04,9,7),new THREE.MeshBasicMaterial({color}),parent,...from);
      result.push({particle,from:new THREE.Vector3(...from),to:new THREE.Vector3(...to),offset:i/count});
    }
    return result;
  }
  function addMlp() {
    const heights=[[.2,.31,.42,.24,.38,.3,.47,.27],[.34,.45,.28,.53,.33,.4,.57,.36],[.55,.37,.63,.44,.51,.66,.39,.58]];
    refs.mlpLayers=[1.08,1.68,2.28].map((x,index)=>bars(groups.mlp,x,-1.34,8,index===2?mats.fused:mats.visual,heights[index],.44));
    line(groups.mlp,[[-.45,.75,-.15],[1.08,.65,-1.34],[1.68,.65,-1.34],[2.28,.65,-1.34]],0x567f72,.4);
    refs.mlpFlows=flow(groups.mlp,[-.45,.75,-.15],[1.08,.65,-1.34],7,0xa9684b);
    for(const item of refs.mlpFlows) item.waypoints=[new THREE.Vector3(-.45,.75,-.15),new THREE.Vector3(1.08,.65,-1.34),new THREE.Vector3(1.68,.65,-1.34),new THREE.Vector3(2.28,.65,-1.34)];
  }
  function addPool() {
    refs.poolBars=bars(groups.pool,1.88,-1.18,16,mats.visual,[.31,.52,.43,.62,.37,.48,.57,.4],.8);
    for(let i=0;i<18;i++) line(groups.pool,[refs.sampled[(i*9)%refs.sampled.length],[1.88,.55,-1.18]],0x6d9a89,.19);
    refs.poolFlows=refs.sampled.slice(0,18).map((point,index)=>flow(groups.pool,point,[1.88,.55,-1.18],1,index%3?0x4d8978:0xb36950)[0]);
  }
  function addCondition() {
    refs.visualBars=bars(groups.condition,1.17,-1.44,8,mats.visual,[.3,.4,.53,.38,.48,.56,.35,.45],.5);
    refs.poseBars=bars(groups.condition,1.17,1.06,8,mats.pose,[.39,.28,.45,.52,.32,.48,.55,.37],.5);
    refs.fusedBars=bars(groups.condition,2.28,-.17,16,mats.fused,[.43,.52,.32,.59,.46,.55,.38,.5],.75);
    line(groups.condition,[[1.17,.62,-1.44],[2.28,.57,-.17]],0x467c6b,.55);
    line(groups.condition,[[1.17,.62,1.06],[2.28,.57,-.17]],0x607e9b,.55);
    refs.conditionFlows=[...flow(groups.condition,[1.17,.62,-1.44],[2.28,.57,-.17],5,0x3d7869),...flow(groups.condition,[1.17,.62,1.06],[2.28,.57,-.17],5,0x5f809d)];
  }
  function pathPoint(t) {
    const index=Math.min(refs.path.length-2,Math.floor(t*(refs.path.length-1)));
    const local=t*(refs.path.length-1)-index;
    return new THREE.Vector3(...refs.path[index]).lerp(new THREE.Vector3(...refs.path[index+1]),local);
  }
  function addPath(task) {
    const {origin,goal}=taskMeta[task];
    refs.path=[];
    for(let i=0;i<=40;i++) {
      const t=i/40;
      refs.path.push([origin[0]+(goal[0]-origin[0])*t,origin[1]+(goal[1]-origin[1])*t+.46*Math.sin(Math.PI*t),origin[2]+(goal[2]-origin[2])*t-.21*Math.sin(Math.PI*t)]);
    }
    line(groups.denoise,refs.path,0xb97158,.29);
    const noise=seeded(234);
    refs.traces=[];
    for(let trace=0;trace<3;trace++) {
      const initial=Array.from({length:4},(_,i)=>pathPoint((i+1)/5));
      const candidate=line(groups.denoise,initial.map(v=>v.toArray()),trace===0?0xa8513f:0xc48770,trace===0?.92:.5);
      const dots=initial.map(point=>mesh(new THREE.SphereGeometry(trace===0?.07:.045,10,8),new THREE.MeshBasicMaterial({color:trace===0?0xab533d:0xc08066}),groups.denoise,...point.toArray()));
      const offsets=initial.map(()=>new THREE.Vector3((noise()-.5)*1.4,(noise()-.5)*1.2,(noise()-.5)*1.25));
      refs.traces.push({candidate,dots,offsets});
    }
    line(groups.execute,refs.path,0xbb826c,.28);
    refs.progressLine=line(groups.execute,refs.path,0xb4583e,1);
    refs.marker=new THREE.Group();
    groups.execute.add(refs.marker);
    mesh(new THREE.SphereGeometry(.11,14,10),new THREE.MeshBasicMaterial({color:0x9c4d36}),refs.marker);
    box(refs.marker,[.07,.24,.07],mats.hand,.12,-.12,-.1);
    box(refs.marker,[.07,.24,.07],mats.hand,.12,-.12,.1);
    refs.actionDots=[];
    for(let i=0;i<4;i++) {
      const point=pathPoint((i+1)/5);
      refs.actionDots.push(mesh(new THREE.SphereGeometry(.065,10,8),new THREE.MeshBasicMaterial({color:i===3?0x7c8c79:0xb56749}),groups.execute,...point.toArray()));
    }
  }
  function build(task) {
    Object.values(groups).forEach(clearGroup);
    refs.objectPoints=[]; refs.floorPoints=[]; refs.sampled=[];
    const rng=seeded(task==='pour'?330:task==='drill'?521:903);
    addTask(task,rng);
    for(let i=0;i<430;i++) refs.floorPoints.push([(rng()-.5)*5.6,-.035,(rng()-.5)*3.6]);
    refs.sampled=farthest(refs.objectPoints,160);
    refs.rawObject=cloud(groups.rawObject,refs.objectPoints,0x597c90,.046);
    refs.rawFloor=cloud(groups.rawFloor,refs.floorPoints,0xb77569,.036);
    refs.sample=cloud(groups.sample,refs.sampled,0x175b4d,.075);
    refs.fpsCursor=mesh(new THREE.SphereGeometry(.085,12,8),new THREE.MeshBasicMaterial({color:0xb45e42}),groups.sample,...refs.sampled[0]);
    addSensor(); addCrop(); addMlp(); addPool(); addCondition(); addPath(task);
    updateVisibility();
  }
  function updateVisibility() {
    const s=state.stage,d=state.display;
    groups.solid.visible=d!=='points';
    groups.sensor.visible=s<=1;
    groups.rawObject.visible=d!=='solid'&&s>=1&&s<=2;
    groups.rawFloor.visible=d!=='solid'&&s>=1&&s<=2;
    groups.crop.visible=s===2;
    groups.sample.visible=d!=='solid'&&s>=3;
    groups.mlp.visible=s===4;
    groups.pool.visible=s===5;
    groups.condition.visible=s===6||s===7;
    groups.denoise.visible=s===7;
    groups.execute.visible=s===8;
    refs.fpsCursor.visible=s===3;
    refs.sample.geometry.setDrawRange(0,s===3?1:refs.sampled.length);
    refs.rawObject.geometry.attributes.position.set(refs.objectPoints.flat());
    refs.rawFloor.geometry.attributes.position.set(refs.floorPoints.flat());
  }
  function animateFlows(items,time,period=1.4) {
    for(const item of items) {
      const phase=(time/period+item.offset)%1;
      if(item.waypoints) {
        const segment=Math.min(2,Math.floor(phase*3));
        item.particle.position.copy(item.waypoints[segment]).lerp(item.waypoints[segment+1],phase*3-segment);
      } else item.particle.position.copy(item.from).lerp(item.to,phase);
      item.particle.scale.setScalar(.75+.45*Math.sin(Math.PI*phase));
    }
  }
  function animateBars(items,time,active=1) {
    for(let i=0;i<items.length;i++) {
      const bar=items[i],height=bar.userData.height,scale=active*(.83+.17*Math.sin(time*5+i*.75));
      bar.scale.y=Math.max(.04,height*scale);
      bar.position.y=.065+bar.scale.y/2;
    }
  }
  function animateStage(now) {
    const s=state.stage;
    const elapsed=reducedMotion?2.2:(now-state.stageStart)/1000;
    const phase=Math.min(1,elapsed/2.05);
    const wave=(Math.sin(elapsed*4)+1)/2;
    if(s===0) {
      setMetric('84 x 84 depth / one camera');
      for(const item of groups.sensor.children) if(item.material?.opacity!==undefined) item.material.opacity=.38+.22*wave;
    } else if(s===1) {
      const end=refs.objectPoints,attr=refs.rawObject.geometry.attributes.position;
      for(let i=0;i<end.length;i++) {
        const p=Math.max(0,Math.min(1,phase*1.35-i/end.length*.35));
        const e=p*p*(3-2*p);
        attr.setXYZ(i,cameraPoint[0]+(end[i][0]-cameraPoint[0])*e,cameraPoint[1]+(end[i][1]-cameraPoint[1])*e,cameraPoint[2]+(end[i][2]-cameraPoint[2])*e);
      }
      attr.needsUpdate=true;
      refs.rawFloor.material.opacity=.35;
      setMetric('Depth pixels -> XYZ samples');
    } else if(s===2) {
      const floor=refs.rawFloor.geometry.attributes.position;
      refs.floorPoints.forEach((p,i)=>floor.setXYZ(i,p[0],p[1]-.45*phase,p[2]));
      floor.needsUpdate=true;
      refs.rawFloor.material.opacity=.65*(1-phase)+.06;
      refs.cropBox.material.opacity=.58+.3*wave;
      setMetric('Crop / remove background points');
    } else if(s===3) {
      const count=Math.max(1,Math.round(phase*refs.sampled.length));
      refs.sample.geometry.setDrawRange(0,count);
      refs.fpsCursor.position.set(...refs.sampled[Math.min(count-1,refs.sampled.length-1)]);
      refs.fpsCursor.scale.setScalar(.75+.3*wave);
      setMetric(count+' / 160 illustrative FPS points');
    } else if(s===4) {
      const layer=Math.min(2,Math.floor((elapsed%2.4)/.8));
      refs.mlpLayers.forEach((items,index)=>animateBars(items,elapsed,index===layer?1:.42));
      animateFlows(refs.mlpFlows,elapsed,1.6);
      setMetric(['XYZ -> 64 / point','64 -> 128 / point','128 -> 256 / point'][layer]);
    } else if(s===5) {
      animateBars(refs.poolBars,elapsed,.72+.28*phase);
      animateFlows(refs.poolFlows,elapsed,1.3);
      setMetric(phase<.55?'Max over points / 256-D':'Project / 64-D visual feature');
    } else if(s===6) {
      animateBars(refs.visualBars,elapsed,.9);
      animateBars(refs.poseBars,elapsed,.9);
      animateBars(refs.fusedBars,elapsed,.65+.35*wave);
      animateFlows(refs.conditionFlows,elapsed,1.25);
      setMetric('64-D visual + 64-D pose -> 128-D');
    } else if(s===7) {
      animateBars(refs.visualBars,elapsed,.72);
      animateBars(refs.poseBars,elapsed,.72);
      animateBars(refs.fusedBars,elapsed,.85);
      const step=Math.min(10,Math.floor((elapsed%3.15)/.315)+1);
      const spread=Math.pow((11-step)/10,1.35);
      refs.traces.forEach((trace,index)=>{
        const positions=trace.candidate.geometry.attributes.position;
        trace.dots.forEach((dot,i)=>{
          const target=pathPoint((i+1)/5),offset=trace.offsets[i];
          const wobble=index===0?1:.85;
          const point=target.addScaledVector(offset,spread*wobble);
          dot.position.copy(point);
          positions.setXYZ(i,point.x,point.y,point.z);
        });
        positions.needsUpdate=true;
      });
      setMetric('DDIM denoising / step '+step+' of 10');
    } else {
      const progress=(elapsed%3.7)/3.7;
      refs.marker.position.copy(pathPoint(progress));
      refs.marker.rotation.z=.18*Math.sin(progress*Math.PI*2);
      refs.progressLine.geometry.setDrawRange(0,Math.max(2,Math.round(progress*refs.path.length)));
      refs.actionDots.forEach((dot,index)=>dot.scale.setScalar(index<Math.floor(progress*4)?1.35:.8));
      setMetric('Execute action '+Math.min(3,Math.floor(progress*3)+1)+' of 3 / re-observe');
    }
  }
  function resize() {
    const width=mount.clientWidth,height=mount.clientHeight;
    if(width<1||height<1)return;
    renderer.setSize(width,height,false);
    camera.aspect=width/height;
    camera.fov=width<600?49:40;
    camera.updateProjectionMatrix();
  }
  function frame(now) {
    animateStage(now);
    camera.position.set(Math.sin(state.yaw)*Math.cos(state.pitch)*state.radius,Math.sin(state.pitch)*state.radius+.65,Math.cos(state.yaw)*Math.cos(state.pitch)*state.radius);
    camera.lookAt(0,.48,0);
    renderer.render(scene,camera);
    requestAnimationFrame(frame);
  }

  let dragging=false,startX=0,startY=0;
  renderer.domElement.addEventListener('pointerdown',event=>{dragging=true;startX=event.clientX;startY=event.clientY;renderer.domElement.setPointerCapture(event.pointerId);});
  renderer.domElement.addEventListener('pointermove',event=>{if(!dragging)return;state.yaw+=(event.clientX-startX)*.007;state.pitch=Math.max(-.12,Math.min(1.1,state.pitch+(event.clientY-startY)*.006));startX=event.clientX;startY=event.clientY;});
  renderer.domElement.addEventListener('pointerup',()=>{dragging=false;});
  renderer.domElement.addEventListener('pointercancel',()=>{dragging=false;});
  renderer.domElement.addEventListener('wheel',event=>{event.preventDefault();state.radius=Math.max(4.5,Math.min(11,state.radius+Math.sign(event.deltaY)*.45));},{passive:false});
  window.addEventListener('resize',resize);
  if(window.ResizeObserver)new ResizeObserver(resize).observe(mount);
  window.DP3Scene={
    setTask(task){state.task=task;build(task);state.stageStart=performance.now();},
    setStage(stage){state.stage=stage;state.stageStart=performance.now();updateVisibility();},
    setDisplay(display){state.display=display;updateVisibility();},
    resize,
    getCanvas(){return renderer.domElement;}
  };
  build('pour'); resize(); requestAnimationFrame(frame);
})();
