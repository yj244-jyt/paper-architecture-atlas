/* Shared paper-grounded scene reconstruction. Point values are illustrative. */
window.Riemann3D = function Riemann3D(container, options) {
  const T = window.THREE;
  const scene = new T.Scene();
  scene.background = new T.Color(0xeaf0ec);
  const camera = new T.PerspectiveCamera(43, 1, 0.01, 30);
  const renderer = new T.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = T.PCFSoftShadowMap;
  renderer.outputEncoding = T.sRGBEncoding;
  renderer.toneMapping = T.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  container.appendChild(renderer.domElement);
  const canvas = renderer.domElement;
  const focus = new T.Vector3(0, 0.68, 0);
  let azimuth = 0.82, elevation = 0.38, distance = 2.55;
  let cameraTween = null;
  let task = 'mug', mode = 'both', step = 0, yaw = 0, pitch = 0, shift = 0;
  let target = null, destination = null, ghost = null, actionGhost = null, pointMesh = null, points = [];
  let roiSphere = null, poolSphere = null, axes = null, ghostAxes = null, directionArrow = null, selectedMarker = null, motionLine = null, gripper = null;
  let fieldArrows = [], neighborLines = [], rawAxes = [], aggregationLines = [], cameras = [], robotSegments = [], selected = null, derived = null;
  let stageStarted = performance.now(), stageDuration = 2400, markerSources = [], baseColors = null;
  const signalMarkers = [], rawBasis = [new T.Vector3(1,.2,.06),new T.Vector3(.13,1,.14),new T.Vector3(.08,.17,1)];
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  let disposed = false, active = true, pointerDown = null, dragMoved = false;
  let actionProgress = 0, actionPlaying = false, actionStarted = 0;
  const raycaster = new T.Raycaster();
  raycaster.params.Points.threshold = 0.018;
  const pointer = new T.Vector2();
  const mats = {
    table: new T.MeshStandardMaterial({ color: 0x788b85, roughness: 0.9 }),
    pale: new T.MeshStandardMaterial({ color: 0xc7d2cd, roughness: 0.6, metalness: 0.08 }),
    dark: new T.MeshStandardMaterial({ color: 0x384851, roughness: 0.54, metalness: 0.25 }),
    mug: new T.MeshStandardMaterial({ color: 0x315d91, roughness: 0.4, metalness: 0.04 }),
    rack: new T.MeshStandardMaterial({ color: 0xb69437, roughness: 0.55, metalness: 0.08 }),
    plane: new T.MeshStandardMaterial({ color: 0x527a9d, roughness: 0.47, metalness: 0.12 }),
    faucet: new T.MeshStandardMaterial({ color: 0xb9c9cd, roughness: 0.23, metalness: 0.78 }),
    basin: new T.MeshStandardMaterial({ color: 0x717f86, roughness: 0.5, metalness: 0.26 }),
    distractor: new T.MeshStandardMaterial({ color: 0xd97052, roughness: 0.6 })
  };
  function seed(n) { const v = Math.sin(n * 127.13 + 21.53) * 43758.5453; return v - Math.floor(v); }
  function mesh(geometry, material, x, y, z, parent = scene) {
    const m = new T.Mesh(geometry, material);
    m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  }
  function box(w,h,d,mat,x,y,z,parent) { return mesh(new T.BoxGeometry(w,h,d),mat,x,y,z,parent); }
  function cylinder(rt,rb,h,mat,x,y,z,parent) { return mesh(new T.CylinderGeometry(rt,rb,h,24),mat,x,y,z,parent); }
  function ball(r,mat,x,y,z,parent) { return mesh(new T.SphereGeometry(r,16,12),mat,x,y,z,parent); }
  function segment(a,b,r,mat,parent=scene) {
    const va = new T.Vector3(...a), vb = new T.Vector3(...b), d = vb.clone().sub(va);
    const m = mesh(new T.CylinderGeometry(r,r,1,12),mat,0,0,0,parent);
    m.position.copy(va).add(vb).multiplyScalar(.5);
    m.scale.y = d.length();
    m.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),d.normalize());
    return m;
  }
  function line(a,b,color,opacity=1) {
    const g=new T.BufferGeometry().setFromPoints([new T.Vector3(...a),new T.Vector3(...b)]);
    const m=new T.Line(g,new T.LineBasicMaterial({color,transparent:opacity<1,opacity}));scene.add(m);return m;
  }
  scene.add(new T.HemisphereLight(0xffffff,0x9fb5a8,1.05));
  const key = new T.DirectionalLight(0xffffff,1.15);
  key.position.set(-1.8,3.4,2.2); key.castShadow=true; key.shadow.mapSize.set(1024,1024);
  key.shadow.camera.left=-2;key.shadow.camera.right=2;key.shadow.camera.top=2;key.shadow.camera.bottom=-2;
  scene.add(key);
  const floor = mesh(new T.PlaneGeometry(8,8),new T.MeshStandardMaterial({color:0xd8e3dc,roughness:1}),0,0,0);
  floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;floor.castShadow=false;
  // A flat teaching model of the paper's table; its simulated sectors are described in the text.
  const tableLow=.77, tableRadius=.75, tableThickness=.10;
  const tableBottom=tableLow-tableThickness;
  const tabletop=mesh(new T.CylinderGeometry(tableRadius,tableRadius,tableThickness,96),mats.table,0,tableLow-tableThickness/2,0);
  tabletop.castShadow=false;
  tabletop.receiveShadow=true;
  cylinder(.09,.11,tableBottom,mats.dark,0,tableBottom/2,0);
  cylinder(.27,.27,.035,mats.dark,0,.0175,0);
  const grid=new T.GridHelper(3,16,0xbccac4,0xcbd8d1);grid.position.y=.008;grid.material.transparent=true;grid.material.opacity=.34;scene.add(grid);
  function makeRobot(){
    const base=[0,.79,-.48], shoulder=[0,.94,-.48], elbow=[-.09,1.14,-.39], fore=[-.04,1.32,-.31], wrist=[-.12,1.34,-.17], tip=[-.18,1.27,-.06];
    cylinder(.12,.14,.10,mats.dark,base[0],base[1],base[2]);
    robotSegments.push(segment([0,.83,-.48],[0,.94,-.48],.069,mats.pale));
    cylinder(.07,.07,.08,mats.pale,shoulder[0],shoulder[1],shoulder[2]);
    for(const [a,b,r] of [[shoulder,elbow,.052],[elbow,fore,.047],[fore,wrist,.041],[wrist,tip,.032]])robotSegments.push(segment(a,b,r,mats.pale));
    for(const p of [elbow,fore,wrist])ball(.053,mats.dark,...p);
    const hand=box(.09,.055,.075,mats.dark,tip[0],tip[1],tip[2]);hand.rotation.y=-.3;
    box(.015,.058,.018,mats.pale,tip[0]-.04,tip[1]-.038,tip[2]+.015);
    box(.015,.058,.018,mats.pale,tip[0]+.04,tip[1]-.038,tip[2]+.015);
  }
  makeRobot();
  function makeCameras(){
    for(let i=0;i<6;i++){
      const a=i*Math.PI/3+.28,x=Math.cos(a)*1.04,z=Math.sin(a)*1.04;
      const g=new T.Group();g.position.set(x,1.43,z);g.lookAt(0,.79,0);scene.add(g);
      box(.065,.045,.09,mats.dark,0,0,0,g);
      cylinder(.018,.018,.02,mats.pale,0,0,.055,g).rotation.x=Math.PI/2;
      const cone=new T.Mesh(new T.ConeGeometry(.22,.55,18,1,true),new T.MeshBasicMaterial({color:0x1c8a80,transparent:true,opacity:.07,side:T.DoubleSide,depthWrite:false}));
      cone.rotation.x=-Math.PI/2;cone.position.z=.32;g.add(cone);cameras.push({g,cone});
    }
  }
  makeCameras();
  function clearObject(o){if(!o)return;scene.remove(o);o.traverse(n=>{if(n.geometry)n.geometry.dispose();if(n.material&&!Object.values(mats).includes(n.material)){if(Array.isArray(n.material))n.material.forEach(m=>m.dispose());else n.material.dispose()}})}
  function sample(kind,x,y,z,color,score=0){points.push({kind,local:new T.Vector3(x,y,z),color:new T.Color(color),score})}
  function mug(){
    target=new T.Group();target.position.set(-.4,.77,.10);scene.add(target);
    cylinder(.061,.058,.156,mats.mug,0,.078,0,target);
    cylinder(.052,.052,.15,new T.MeshStandardMaterial({color:0x142b43,roughness:.5}),0,.084,0,target);
    const lip=mesh(new T.TorusGeometry(.058,.008,10,40),mats.mug,0,.16,0,target);lip.rotation.x=Math.PI/2;
    const handleCurve=new T.CatmullRomCurve3([
      new T.Vector3(.052,.137,0),new T.Vector3(.080,.143,0),
      new T.Vector3(.127,.128,0),new T.Vector3(.157,.095,0),
      new T.Vector3(.153,.064,0),new T.Vector3(.122,.034,0),
      new T.Vector3(.080,.029,0),new T.Vector3(.053,.039,0)
    ]);
    mesh(new T.TubeGeometry(handleCurve,40,.012,12,false),mats.mug,0,0,0,target);
    ball(.014,mats.mug,.056,.137,0,target);
    ball(.014,mats.mug,.056,.039,0,target);
    for(let i=0;i<460;i++){
      const a=seed(i+10)*Math.PI*2,y=.015+seed(i+610)*.142,r=.058;
      sample('target',Math.cos(a)*r,y,Math.sin(a)*r,0x426d9d,4+2*Math.exp(-Math.pow(y-.15,2)/.0015));
    }
    for(let i=0;i<100;i++){
      const a=seed(i+900)*Math.PI*2;
      sample('target',Math.cos(a)*.058,.16,Math.sin(a)*.058,0x527fae,7);
    }
    for(let i=0;i<160;i++){
      const t=seed(i+1200),a=seed(i+1800)*Math.PI*2;
      const q=handleCurve.getPoint(t),tangent=handleCurve.getTangent(t);
      const nx=-tangent.y,ny=tangent.x;
      sample('target',q.x+nx*.012*Math.cos(a),q.y+ny*.012*Math.cos(a),.012*Math.sin(a),0x406995,4);
    }
    destination=new T.Group();destination.position.set(.37,.77,-.04);scene.add(destination);
    cylinder(.085,.11,.025,mats.rack,0,.015,0,destination);
    cylinder(.012,.018,.60,mats.rack,0,.30,0,destination);
    for(const y of [.28,.43,.57]){
      segment([0,y,0],[.17,y+.018,0],.012,mats.rack,destination);
      ball(.013,mats.rack,.17,y+.018,0,destination);
    }
    return {grip:new T.Vector3(.052,.155,0),roi:new T.Vector3(0,.10,0),label:'Grasp the mug → place it on the rack'};
  }
  function plane(){
    target=new T.Group();target.position.set(-.38,.72,.10);scene.add(target);
    const fus=mesh(new T.CylinderGeometry(.022,.029,.22,16),mats.plane,0,.07,0,target);fus.rotation.x=Math.PI/2;
    const nose=mesh(new T.ConeGeometry(.023,.055,16),mats.plane,0,.07,-.135,target);nose.rotation.x=-Math.PI/2;
    const wing=box(.22,.012,.055,mats.plane,0,.077,.005,target);wing.rotation.y=.04;
    box(.095,.008,.035,mats.plane,0,.09,.093,target);
    box(.008,.055,.035,mats.plane,0,.11,.094,target);
    for(let i=0;i<600;i++){
      const s=seed(i+50),a=seed(i+900)*Math.PI*2;
      let x,y,z;
      if(s<.52){x=Math.cos(a)*.023;y=.07+Math.sin(a)*.022;z=(seed(i+1500)-.5)*.22}
      else{x=(seed(i+1800)-.5)*.22;y=.078;z=(seed(i+2100)-.5)*.055}
      sample('target',x,y,z,0x6089a8,5+2*Math.exp(-(x*x+z*z)/.002));
    }
    destination=new T.Group();destination.position.set(.36,.77,-.06);scene.add(destination);
    for(const y of [.02,.19,.36])box(.34,.018,.24,mats.rack,0,y,0,destination);
    for(const x of [-.16,.16])for(const z of [-.11,.11])box(.018,.38,.018,mats.rack,x,.19,z,destination);
    return {grip:new T.Vector3(0,.09,0),roi:new T.Vector3(0,.07,0),label:'Grasp the plane → place it on the shelf'};
  }
  function faucet(){
    target=new T.Group();target.position.set(.16,.77,0);scene.add(target);
    cylinder(.11,.11,.025,mats.basin,0,.015,0,target);
    cylinder(.023,.03,.18,mats.faucet,0,.105,0,target);
    const curve=new T.CatmullRomCurve3([new T.Vector3(0,.19,0),new T.Vector3(.02,.28,0),new T.Vector3(.11,.28,0),new T.Vector3(.14,.20,0)]);
    mesh(new T.TubeGeometry(curve,22,.017,10,false),mats.faucet,0,0,0,target);
    cylinder(.017,.017,.055,mats.dark,-.065,.21,0,target);
    const handle=box(.11,.018,.024,mats.faucet,-.10,.245,0,target);handle.rotation.z=-.12;
    for(let i=0;i<550;i++){
      const a=seed(i+77)*Math.PI*2,t=seed(i+777);let x,y,z;
      if(t<.42){x=Math.cos(a)*.025;y=.03+seed(i+1777)*.18;z=Math.sin(a)*.025}
      else if(t<.76){x=-.10+(seed(i+2777)-.5)*.11;y=.245;z=(seed(i+3777)-.5)*.024}
      else{const q=curve.getPoint(seed(i+4777));x=q.x;y=q.y;z=q.z+Math.sin(a)*.015}
      sample('target',x,y,z,0xb2c4c6,4+3*Math.exp(-Math.pow(x+.10,2)/.002));
    }
    destination=null;
    return {grip:new T.Vector3(-.10,.245,0),roi:new T.Vector3(-.07,.22,0),label:'Reach the handle → move along the opening direction'};
  }
  function addBackgroundPoints(){
    for(let i=0;i<1050;i++){
      const a=seed(i+5500)*Math.PI*2,r=Math.sqrt(seed(i+6500))*.73;
      const x=Math.cos(a)*r,z=Math.sin(a)*r;
      if(Math.hypot(x+.4,z-.1)<.16||Math.hypot(x-.35,z)<.15)continue;
      sample('scene',x,tableLow+.004,z,0xa8b6af,-3);
    }
    for(let i=0;i<160;i++){
      sample('distractor',-.12+(seed(i+7500)-.5)*.09,tableLow+seed(i+9500)*.085,.37+(seed(i+8500)-.5)*.08,0xd97052,-1);
    }
  }
  const distractorSolid=new T.Group();scene.add(distractorSolid);
  box(.09,.085,.08,mats.distractor,-.12,tableLow+.0425,.37,distractorSolid);
  function worldPoint(p){return p.kind==='target'?p.local.clone().applyMatrix4(target.matrixWorld):p.local.clone()}
  function stableSoftmax(list,key){const max=Math.max(...list.map(key)),v=list.map(x=>Math.exp(key(x)-max)),s=v.reduce((a,b)=>a+b,0);return v.map(x=>x/s)}
  let shape=null;
  function calculate(){
    target.updateMatrixWorld(true);
    const visible=points.filter(p=>p.kind!=='distractor'||!options.hideDistractor);
    const salient=stableSoftmax(visible,p=>p.score);
    const coarse=new T.Vector3();
    visible.forEach((p,i)=>coarse.addScaledVector(worldPoint(p),salient[i]));
    const roi=visible.filter(p=>worldPoint(p).distanceTo(coarse)<=.2);
    const grip=shape.grip.clone().applyMatrix4(target.matrixWorld);
    const weight=stableSoftmax(roi,p=>6-2000*worldPoint(p).distanceToSquared(grip));
    const fine=new T.Vector3();
    roi.forEach((p,i)=>fine.addScaledVector(worldPoint(p),weight[i]));
    const local=roi.filter(p=>worldPoint(p).distanceTo(fine)<=.02);
    derived={visible,coarse,roi,weight,fine,local,grip};
  }
  function rebuildPoints(){
    if(pointMesh){scene.remove(pointMesh);pointMesh.geometry.dispose();pointMesh.material.dispose()}
    const positions=new Float32Array(points.length*3),colors=new Float32Array(points.length*3);
    const geometry=new T.BufferGeometry();
    geometry.setAttribute('position',new T.BufferAttribute(positions,3));
    geometry.setAttribute('color',new T.BufferAttribute(colors,3));
    const material=new T.PointsMaterial({size:.011,vertexColors:true,sizeAttenuation:true,transparent:true,opacity:.93,depthWrite:false});
    pointMesh=new T.Points(geometry,material);scene.add(pointMesh);
  }
  function sphere(radius,color,opacity){
    const material=new T.MeshBasicMaterial({color,transparent:true,opacity,depthWrite:false,side:T.DoubleSide});
    const s=mesh(new T.SphereGeometry(radius,24,18),material,0,0,0);
    s.castShadow=false;return s;
  }
  function createOverlays(){
    roiSphere=sphere(.2,0x008477,.11);poolSphere=sphere(.02,0xc34d43,.42);
    selectedMarker=sphere(.015,0x101f25,.9);
    axes=new T.AxesHelper(.14);scene.add(axes);
    if(options.comparison){ghostAxes=new T.AxesHelper(.14);scene.add(ghostAxes)}
    directionArrow=new T.ArrowHelper(new T.Vector3(-1,0,0),new T.Vector3(),.16,0xa77924,.035,.014);
    scene.add(directionArrow);
    gripper=new T.Group();scene.add(gripper);
    box(.065,.025,.035,new T.MeshBasicMaterial({color:0x1d846f,transparent:true,opacity:.52}),0,0,0,gripper);
    box(.01,.055,.012,new T.MeshBasicMaterial({color:0x1d846f,transparent:true,opacity:.52}),-.029,-.033,0,gripper);
    box(.01,.055,.012,new T.MeshBasicMaterial({color:0x1d846f,transparent:true,opacity:.52}),.029,-.033,0,gripper);
    for(let i=0;i<18;i++){
      const marker=ball(.015,new T.MeshBasicMaterial({color:i%3===0?0xb64e45:i%3===1?0x007e70:0x315d91,transparent:true,opacity:.9,depthWrite:false}),0,0,0);
      marker.castShadow=false;marker.visible=false;signalMarkers.push(marker);
    }
  }
  createOverlays();
  function removeFieldArrows(){for(const a of fieldArrows){scene.remove(a);a.line.geometry.dispose();a.line.material.dispose();a.cone.geometry.dispose();a.cone.material.dispose()}fieldArrows=[]}
  function removeNeighbors(){for(const o of neighborLines){scene.remove(o);o.geometry.dispose();o.material.dispose()}neighborLines=[]}
  function removeRawAxes(){for(const o of rawAxes){scene.remove(o);o.geometry.dispose();o.material.dispose()}rawAxes=[]}
  function removeAggregationLines(){for(const o of aggregationLines){scene.remove(o);o.geometry.dispose();o.material.dispose()}aggregationLines=[]}
  function makeActionGhost(){
    if(actionGhost)clearObject(actionGhost);
    actionGhost=target.clone(true);
    actionGhost.traverse(o=>{if(o.isMesh){o.material=new T.MeshBasicMaterial({color:0x16877c,transparent:true,opacity:.48,depthWrite:false});o.castShadow=false}});
    actionGhost.visible=false;scene.add(actionGhost);
  }
  function actionGoal(){
    if(task==='plane')return new T.Vector3(.36,.95,-.06);
    return new T.Vector3(.45,1.21,-.04);
  }
  function actionCaption(p){
    if(task==='faucet')return p<.25?'Reach the handle':p<.55?'Make contact':'Move along opening direction';
    return p<.25?'Approach target':p<.43?'Grasp and lift':p<.82?'Carry to placement':'Place target';
  }
  function updateAction(){
    if(!actionGhost||!target||!derived)return;
    const p=actionProgress,tip=new T.Vector3(-.18,1.27,-.06),grasp=derived.grip;
    if(step!==8||options.comparison){actionGhost.visible=false;return}
    if(task==='faucet'){
      actionGhost.visible=false;
      const direction=new T.Vector3(-1,0,0).applyQuaternion(target.quaternion);
      gripper.position.copy(p<.25?tip.clone().lerp(grasp,p/.25):grasp.clone().addScaledVector(direction,(p-.25)/.75*.17));
    }else{
      const start=target.position.clone(),lift=start.clone().add(new T.Vector3(0,.24,0));
      const goal=actionGoal(),preGoal=goal.clone().add(new T.Vector3(0,.15,0));
      let at=start;
      if(p>=.25&&p<.43)at=start.clone().lerp(lift,(p-.25)/.18);
      else if(p>=.43&&p<.82)at=lift.clone().lerp(preGoal,(p-.43)/.39);
      else if(p>=.82)at=preGoal.clone().lerp(goal,(p-.82)/.18);
      actionGhost.visible=p>=.25;
      actionGhost.position.copy(at);actionGhost.quaternion.copy(target.quaternion);actionGhost.updateMatrixWorld(true);
      const held=shape.grip.clone().applyMatrix4(actionGhost.matrixWorld);
      gripper.position.copy(p<.25?tip.clone().lerp(grasp,p/.25):held);
    }
    gripper.quaternion.copy(target.quaternion);
    if(options.onActionProgress)options.onActionProgress(p,actionCaption(p));
  }
  function cameraPreset(){
    const nextFocus=new T.Vector3();let nextDistance;
    if(step===0){nextFocus.set(0,.68,0);nextDistance=2.55}
    else if(step<=2){nextFocus.set(0,.68,0);nextDistance=2.15}
    else if(step<=7){nextFocus.copy(derived.coarse).lerp(new T.Vector3(0,.84,0),.36);nextDistance=1.18}
    else{nextFocus.set(0,.9,0);nextDistance=1.9}
    cameraTween={from:focus.clone(),to:nextFocus,fromDistance:distance,toDistance:nextDistance,start:performance.now()};
  }
  function refresh(){
    if(!target)return;
    target.rotation.set(pitch,yaw,0);target.position.x=(task==='faucet'?.16:task==='plane'?-.38:-.4)+shift;
    target.updateMatrixWorld(true);calculate();
    const position=pointMesh.geometry.attributes.position,color=pointMesh.geometry.attributes.color;
    const roiSet=new Set(derived.roi),localSet=new Set(derived.local);
    for(let i=0;i<points.length;i++){
      const p=points[i],v=worldPoint(p),c=p.color.clone();
      position.setXYZ(i,v.x,v.y,v.z);
      if(step===2||step===3){if(p.kind==='target')c.setHSL(.46,.52,.29+Math.min(.33,(p.score-3)*.065));else c.multiplyScalar(.48)}
      if(step>=4&&step<=6){if(!roiSet.has(p))c.multiplyScalar(.27);else if(step===5){const w=derived.weight[derived.roi.indexOf(p)];c.setHSL(.46,.72,.27+Math.min(.42,w*33))}else if(step===6&&localSet.has(p))c.set(0xc34d43)}
      if(step>=7&&p.kind!=='target')c.multiplyScalar(.54);
      color.setXYZ(i,c.r,c.g,c.b);
    }
    position.needsUpdate=true;color.needsUpdate=true;pointMesh.geometry.computeBoundingSphere();
    baseColors=color.array.slice();
    markerSources=derived.roi.filter((p,i)=>p.kind==='target'&&i%27===0).slice(0,18);
    const showSolid=mode!=='points',showPoints=mode!=='solid'||step>=1&&step<=6;
    target.visible=showSolid;destination&&(destination.visible=showSolid);distractorSolid.visible=showSolid&&options.hideDistractor!==true;
    pointMesh.visible=showPoints;
    roiSphere.visible=step>=3&&step<=5;roiSphere.position.copy(derived.coarse);
    poolSphere.visible=step>=6&&step<=7;poolSphere.position.copy(derived.fine);
    axes.visible=step>=7;axes.position.copy(derived.fine);axes.quaternion.copy(target.quaternion);
    directionArrow.visible=task==='faucet'&&step>=6;
    if(directionArrow.visible){
      directionArrow.position.copy(derived.fine);
      directionArrow.setDirection(new T.Vector3(-1,0,0).applyQuaternion(target.quaternion).normalize());
    }
    gripper.visible=step===8&&!options.comparison;gripper.position.copy(derived.fine);gripper.quaternion.copy(target.quaternion);
    selectedMarker.visible=selected!==null&&points[selected];if(selectedMarker.visible)selectedMarker.position.copy(worldPoint(points[selected]));
    cameras.forEach(c=>{c.g.visible=step===0&&showSolid;c.cone.visible=step===0});
    removeFieldArrows();
    removeNeighbors();
    removeRawAxes();
    removeAggregationLines();
    if(selected!==null&&(step===2||step===4)){
      const p=points[selected],v=worldPoint(p),radius=step===2?.10:.07;
      const neighbors=derived.visible.filter(q=>q!==p&&worldPoint(q).distanceTo(v)<=radius).slice(0,35);
      for(const q of neighbors){
        const u=worldPoint(q);
        neighborLines.push(line([v.x,v.y,v.z],[u.x,u.y,u.z],0x008477,.45));
      }
    }
    if(step===4||step===6){
      const sample=step===4?derived.roi.filter((p,i)=>p.kind==='target'&&i%52===0).slice(0,7):[null];
      if(step===4&&selected!==null&&derived.roi.includes(points[selected]))sample.push(points[selected]);
      for(const p of sample){
        const origin=p?worldPoint(p):derived.fine;
        for(const [basis,color] of [[new T.Vector3(1,0,0),0xb64e45],[new T.Vector3(0,1,0),0x007e70],[new T.Vector3(0,0,1),0x315d91]]){
          const direction=basis.applyQuaternion(target.quaternion).normalize();
          const length=step===4?.037:.10;
          const arrow=new T.ArrowHelper(direction,origin,length,color,length*.25,length*.13);
          scene.add(arrow);fieldArrows.push(arrow);
        }
      }
    }
    if(step===7){
      for(const v of rawBasis){
        const u=v.clone().normalize().applyQuaternion(target.quaternion).multiplyScalar(.15).add(derived.fine);
        const o=line([derived.fine.x,derived.fine.y,derived.fine.z],[u.x,u.y,u.z],0x9c6f25,.9);
        rawAxes.push(o);
      }
    }
    if(step===5||step===6){
      const source=step===5?markerSources:derived.local.filter((_,i)=>i%3===0);
      for(const p of source.slice(0,12)){
        const from=worldPoint(p),to=derived.fine;
        aggregationLines.push(line([from.x,from.y,from.z],[to.x,to.y,to.z],step===5?0xa77924:0x315d91,.43));
      }
    }
    if(motionLine){scene.remove(motionLine);motionLine.geometry.dispose();motionLine.material.dispose();motionLine=null}
    if(step===8&&!options.comparison){
      const tip=new T.Vector3(-.18,1.27,-.06),high=derived.fine.clone().add(new T.Vector3(0,.14,0));
      const last=task==='faucet'?derived.fine.clone().add(new T.Vector3(-.17,0,0)):actionGoal().add(shape.grip);
      const curve=new T.CatmullRomCurve3([tip,high,derived.fine,last]);
      const geometry=new T.BufferGeometry().setFromPoints(curve.getPoints(48));
      motionLine=new T.Line(geometry,new T.LineDashedMaterial({color:0x007c70,dashSize:.018,gapSize:.012}));motionLine.computeLineDistances();scene.add(motionLine);
    }
    if(options.comparison&&ghost){
      ghost.visible=true;ghost.position.set(task==='faucet'?.16:task==='plane'?-.38:-.4,target.position.y,target.position.z);
      ghost.updateMatrixWorld(true);
      ghostAxes.visible=true;ghostAxes.position.copy(shape.grip.clone().applyMatrix4(ghost.matrixWorld));
    }
    updateAction();
    animateStage(performance.now());
    if(selected!==null&&options.onSelect)options.onSelect(info());
  }
  function info(){
    if(selected===null||!points[selected])return null;
    const p=points[selected],v=worldPoint(p),i=derived.roi.indexOf(p);
    const radius=step===2?.10:step===4?.07:0;
    const neighbors=radius?derived.visible.filter(q=>q!==p&&worldPoint(q).distanceTo(v)<=radius).length:0;
    const axis=new T.Vector3(1,0,0).applyQuaternion(target.quaternion);
    return {id:selected,kind:p.kind,x:v.x,y:v.y,z:v.z,score:p.score,roi:i>=0,pool:derived.local.includes(p),weight:i>=0?derived.weight[i]:0,neighbors,radius,axis:[axis.x,axis.y,axis.z]};
  }
  function makeGhost(){
    if(ghost)clearObject(ghost);
    ghost=target.clone(true);
    ghost.traverse(o=>{if(o.isMesh){o.material=new T.MeshBasicMaterial({color:0x286e82,wireframe:true,transparent:true,opacity:.46,depthTest:false,depthWrite:false});o.castShadow=false}});
    scene.add(ghost);
  }
  function taskChange(name){
    if(target)clearObject(target);if(destination)clearObject(destination);
    target=null;destination=null;points=[];task=name;selected=null;
    shape=(name==='plane'?plane:name==='faucet'?faucet:mug)();
    addBackgroundPoints();rebuildPoints();if(options.comparison)makeGhost();else makeActionGhost();
    actionProgress=0;actionPlaying=false;
    refresh();cameraPreset();return shape.label;
  }
  function setStep(n){step=n;stageStarted=performance.now();refresh();cameraPreset()}
  function setAnimationDuration(ms){stageDuration=ms}
  function setActive(value){active=value;if(active)stageStarted=performance.now()}
  function setMode(v){mode=v;refresh()}
  function setTransform(degrees,pitchDegrees,translation){yaw=degrees*Math.PI/180;pitch=pitchDegrees*Math.PI/180;shift=translation;refresh();if(step>=3&&step<=7){cameraTween=null;focus.copy(derived.coarse).lerp(new T.Vector3(0,.84,0),.36);viewCamera()}}
  function setDistractor(show){options.hideDistractor=!show;refresh()}
  function setActionProgress(value){actionProgress=Math.max(0,Math.min(1,value));if(actionPlaying)actionStarted=performance.now()-actionProgress*4000;updateAction()}
  function setActionPlaying(playing){actionPlaying=playing;if(playing)actionStarted=performance.now()-actionProgress*4000}
  function viewCamera(){camera.position.set(focus.x+distance*Math.sin(azimuth)*Math.cos(elevation),focus.y+distance*Math.sin(elevation),focus.z+distance*Math.cos(azimuth)*Math.cos(elevation));camera.lookAt(focus)}
  function resize(){
    const w=Math.max(1,container.clientWidth),h=Math.max(1,container.clientHeight);
    camera.aspect=w/h;camera.updateProjectionMatrix();renderer.setSize(w,h,false);viewCamera();
  }
  const observer=new ResizeObserver(resize);observer.observe(container);
  function down(e){cameraTween=null;pointerDown={x:e.clientX,y:e.clientY,azimuth,elevation};dragMoved=false;canvas.setPointerCapture(e.pointerId)}
  function move(e){if(!pointerDown)return;const dx=e.clientX-pointerDown.x,dy=e.clientY-pointerDown.y;if(Math.abs(dx)+Math.abs(dy)>4)dragMoved=true;azimuth=pointerDown.azimuth-dx*.007;elevation=Math.max(-.05,Math.min(1.15,pointerDown.elevation+dy*.005));viewCamera()}
  function up(e){
    if(!pointerDown)return;pointerDown=null;
    if(dragMoved||!pointMesh||!pointMesh.visible)return;
    const rect=canvas.getBoundingClientRect();
    pointer.set((e.clientX-rect.left)/rect.width*2-1,-(e.clientY-rect.top)/rect.height*2+1);
    raycaster.setFromCamera(pointer,camera);const hit=raycaster.intersectObject(pointMesh)[0];
    if(hit){selected=hit.index;refresh()}else{selected=null;refresh();if(options.onSelect)options.onSelect(null)}
  }
  function wheel(e){e.preventDefault();cameraTween=null;distance=Math.max(.55,Math.min(5,distance+e.deltaY*.002));viewCamera()}
  canvas.addEventListener('pointerdown',down);canvas.addEventListener('pointermove',move);canvas.addEventListener('pointerup',up);canvas.addEventListener('wheel',wheel,{passive:false});
  function animateStage(now){
    if(options.comparison||!pointMesh||!derived)return;
    const phase=reducedMotion.matches?1:((now-stageStarted)%stageDuration)/stageDuration;
    const smooth=x=>x*x*(3-2*x);
    signalMarkers.forEach(marker=>marker.visible=false);
    if(step===0){
      const center=target.position.clone().add(new T.Vector3(0,.09,0));
      cameras.forEach((entry,i)=>{
        entry.cone.material.opacity=.035+.09*(.5+.5*Math.sin(phase*Math.PI*2-i*.7));
        const marker=signalMarkers[i];marker.visible=true;
        const travel=(phase+i/6)%1;
        marker.position.copy(entry.g.position).lerp(center,travel);
        marker.scale.setScalar(.7+.6*Math.sin(Math.PI*travel));
      });
    }
    if(step===1||step===2){
      const color=pointMesh.geometry.attributes.color;
      const channel=Math.min(2,Math.floor(phase*3));
      for(let i=0;i<points.length;i++){
        const p=points[i],at=i*3;
        if(step===1){
          const gain=p.kind==='target'?1.7:.62;
          color.setXYZ(i,baseColors[at]*(channel===0?gain:.16),baseColors[at+1]*(channel===1?gain:.16),baseColors[at+2]*(channel===2?gain:.16));
        }else{
          const reveal=Math.max(0,Math.min(1,(phase*1.3-(i%17)/20)*5));
          const signal=p.kind==='target'?Math.max(0,Math.min(1,(p.score-3)/5))*reveal:0;
          color.setXYZ(i,baseColors[at]*(.47+.35*reveal)+signal*.5,baseColors[at+1]*(.47+.25*reveal)+signal*.12,baseColors[at+2]*(.47+.2*reveal));
        }
      }
      color.needsUpdate=true;
    }
    if(step===3){
      const scale=.12+.88*smooth(Math.min(1,phase*1.4));
      roiSphere.scale.setScalar(scale);
      roiSphere.material.opacity=.08+.09*(1-phase);
      const marker=signalMarkers[0];marker.visible=true;
      marker.position.copy(derived.coarse);marker.scale.setScalar(1+1.3*(1-phase));
    }else roiSphere.scale.setScalar(1);
    if(step===4){
      fieldArrows.forEach((arrow,i)=>arrow.scale.setScalar(.12+.88*smooth(Math.max(0,Math.min(1,phase*3-(i%3)*.43)))));
    }
    if(step===5||step===6){
      const source=step===5?markerSources:derived.local.length?derived.local:markerSources;
      const count=Math.min(signalMarkers.length,source.length);
      for(let i=0;i<count;i++){
        const marker=signalMarkers[i],from=worldPoint(source[i]),travel=(phase+i/count)%1;
        marker.visible=true;marker.position.copy(from).lerp(derived.fine,smooth(travel));
        marker.scale.setScalar(.5+1.1*Math.sin(Math.PI*travel));
      }
      if(step===6){
        poolSphere.scale.setScalar(.7+.5*Math.sin(phase*Math.PI*2)**2);
        fieldArrows.forEach((arrow,i)=>arrow.scale.setScalar(.35+.65*smooth(Math.max(0,Math.min(1,phase*3-i*.55)))));
      }
    }else poolSphere.scale.setScalar(1);
    if(step===7){
      const progress=smooth(Math.min(1,phase*1.25));
      rawAxes.forEach((axis,i)=>{
        const raw=rawBasis[i].clone().normalize(),orth=new T.Vector3().setComponent(i,1);
        const end=raw.lerp(orth,progress).applyQuaternion(target.quaternion).multiplyScalar(.15).add(derived.fine);
        const position=axis.geometry.attributes.position;
        position.setXYZ(1,end.x,end.y,end.z);position.needsUpdate=true;
        axis.material.opacity=.95-.72*progress;
      });
      axes.scale.setScalar(.12+.88*progress);
    }else axes.scale.setScalar(1);
  }
  function animate(){
    if(disposed)return;
    requestAnimationFrame(animate);
    if(!active)return;
    if(cameraTween){
      const p=Math.min(1,(performance.now()-cameraTween.start)/650),e=p*p*(3-2*p);
      focus.copy(cameraTween.from).lerp(cameraTween.to,e);
      distance=cameraTween.fromDistance+(cameraTween.toDistance-cameraTween.fromDistance)*e;
      viewCamera();if(p===1)cameraTween=null;
    }
    if(actionPlaying&&step===8&&!options.comparison){actionProgress=((performance.now()-actionStarted)%4000)/4000;updateAction()}
    animateStage(performance.now());
    renderer.render(scene,camera);
  }
  taskChange(task);resize();animate();
  return {setTask:taskChange,setStep,setMode,setTransform,setDistractor,setActionProgress,setActionPlaying,setAnimationDuration,setActive,resize,info,getDerived:()=>derived,getCanvas:()=>canvas,getRenderer:()=>renderer,
    dispose(){disposed=true;observer.disconnect();renderer.dispose()}};
};
