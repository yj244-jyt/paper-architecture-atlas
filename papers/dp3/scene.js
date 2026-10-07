(() => {
  const mount = document.getElementById('scene');
  const error = document.getElementById('scene-error');
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
  const sun = new THREE.DirectionalLight(0xfff4e8,.78); sun.position.set(-2,6,4); scene.add(sun);
  const fill = new THREE.DirectionalLight(0xd5e5e0,.2); fill.position.set(4,3,-3); scene.add(fill);
  const root = new THREE.Group(); scene.add(root);
  const grid = new THREE.GridHelper(6.6,16,0x8fa79d,0xb9cbbf); grid.position.y=-.16; scene.add(grid);
  const mats = {
    table:new THREE.MeshStandardMaterial({color:0x779087,roughness:.94}),
    bowl:new THREE.MeshStandardMaterial({color:0xa65d47,roughness:.8,side:THREE.DoubleSide}),
    food:new THREE.MeshStandardMaterial({color:0xc49a61,roughness:1}),
    target:new THREE.MeshStandardMaterial({color:0x728c68,roughness:.92}),
    drill:new THREE.MeshStandardMaterial({color:0x547586,roughness:.7,metalness:.12}),
    metal:new THREE.MeshStandardMaterial({color:0x77898a,roughness:.48,metalness:.2}),
    hand:new THREE.MeshStandardMaterial({color:0xb6c2b8,roughness:.8}),
    cube:new THREE.MeshStandardMaterial({color:0x718f78,roughness:.9}),
    wire:new THREE.LineBasicMaterial({color:0x789289,transparent:true,opacity:.55}),
    path:new THREE.LineBasicMaterial({color:0xb85e40,transparent:true,opacity:.95})
  };
  const groups = {solid:new THREE.Group(),raw:new THREE.Group(),kept:new THREE.Group(),sensor:new THREE.Group(),crop:new THREE.Group(),features:new THREE.Group(),actions:new THREE.Group()};
  Object.values(groups).forEach(group=>root.add(group));
  const state = {task:'pour',display:'overlay',stage:0,yaw:.68,pitch:.37,radius:6.55};
  const color = {raw:0x597c90,kept:0x175b4d,rejected:0xb77569};
  const taskMeta = {
    pour:{origin:[-.9,.46,.1],goal:[.92,.53,-.28]},
    drill:{origin:[-.9,.44,.2],goal:[.95,.36,-.2]},
    reach:{origin:[-1.2,.55,.35],goal:[.85,.48,-.35]}
  };
  function mesh(geometry,material,parent,x=0,y=0,z=0){const item=new THREE.Mesh(geometry,material);item.position.set(x,y,z);parent.add(item);return item;}
  function box(parent,size,material,x,y,z){return mesh(new THREE.BoxGeometry(...size),material,parent,x,y,z);}
  function line(parent,points,material){const geometry=new THREE.BufferGeometry().setFromPoints(points.map(p=>new THREE.Vector3(...p)));const item=new THREE.Line(geometry,material);parent.add(item);return item;}
  function seeded(seed){let value=seed>>>0;return()=>{value=(1664525*value+1013904223)>>>0;return value/4294967296;};}
  function makePoints(parent,points,pointColor,size){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(points.flat(),3));const material=new THREE.PointsMaterial({color:pointColor,size,transparent:true,opacity:.96,sizeAttenuation:true,depthWrite:false,depthTest:false});const cloud=new THREE.Points(geometry,material);parent.add(cloud);return cloud;}
  function disposeGroup(group){while(group.children.length){const item=group.children[0];group.remove(item);item.traverse(child=>{if(child.geometry)child.geometry.dispose();if(child.material && !Object.values(mats).includes(child.material))child.material.dispose();});}}
  function sampleBox(out,cx,cy,cz,sx,sy,sz,count,rng){for(let i=0;i<count;i++){const face=i%6;const u=rng()-.5,v=rng()-.5;let x=cx+u*sx,y=cy+v*sy,z=cz+(rng()-.5)*sz;if(face<2)x=cx+(face?-.5:.5)*sx;if(face>=2&&face<4)y=cy+(face===2?-.5:.5)*sy;if(face>=4)z=cz+(face===4?-.5:.5)*sz;out.push([x,y,z]);}}
  function sampleRing(out,cx,cy,cz,radius,count,rng){for(let i=0;i<count;i++){const a=i/count*Math.PI*2, h=rng()*.37, r=radius+(.03*(rng()-.5));out.push([cx+Math.cos(a)*r,cy+h,cz+Math.sin(a)*r]);}}
  function sampleCylinder(out,cx,cy,cz,radius,height,count,rng){for(let i=0;i<count;i++){const a=rng()*Math.PI*2;out.push([cx+Math.cos(a)*radius,cy+(rng()-.5)*height,cz+Math.sin(a)*radius]);}}
  function farthest(points,count){if(points.length<=count)return points;const chosen=[points[0]],used=new Set([0]),distances=points.map(()=>Infinity);while(chosen.length<count){const p=chosen[chosen.length-1];let max=-1,index=-1;for(let i=0;i<points.length;i++){if(used.has(i))continue;const q=points[i],d=(p[0]-q[0])**2+(p[1]-q[1])**2+(p[2]-q[2])**2;distances[i]=Math.min(distances[i],d);if(distances[i]>max){max=distances[i];index=i;}}used.add(index);chosen.push(points[index]);}return chosen;}
  function addCamera(){const housing=box(groups.sensor,[.34,.2,.23],mats.metal,-2.85,2.35,2.05);housing.rotation.y=-.6;const lens=mesh(new THREE.CylinderGeometry(.075,.075,.1,20),mats.drill,groups.sensor,-2.7,2.34,1.94);lens.rotation.x=Math.PI/2;const corners=[[-1.45,.04,-.9],[1.5,.04,-.9],[1.5,.04,.8],[-1.45,.04,.8]];corners.forEach(p=>line(groups.sensor,[[-2.68,2.31,1.91],p],mats.wire));}
  function addCrop(){const edges=new THREE.EdgesGeometry(new THREE.BoxGeometry(3.38,1.15,2.2));const boxLine=new THREE.LineSegments(edges,new THREE.LineBasicMaterial({color:0x80deb3,transparent:true,opacity:.6}));boxLine.position.set(0,.53,0);groups.crop.add(boxLine);}
  function addFeatures(){const rng=seeded(44);const panel=box(groups.features,[.84,.06,1.52],new THREE.MeshStandardMaterial({color:0x748e83,roughness:.88}),1.78,.06,-1.08);panel.rotation.y=-.2;for(let i=0;i<32;i++){const h=.13+rng()*.56;const bar=box(groups.features,[.065,h,.065],new THREE.MeshStandardMaterial({color:i%4===0?0xaf684e:0x3c7167,roughness:.84}),1.41+(i%8)*.105,.09+h/2,-1.66+Math.floor(i/8)*.28);bar.rotation.y=-.2;}}
  function addActions(task){const meta=taskMeta[task];const [ox,oy,oz]=meta.origin,[gx,gy,gz]=meta.goal;const points=[];for(let i=0;i<=35;i++){const t=i/35;points.push([ox+(gx-ox)*t,oy+(gy-oy)*t+.46*Math.sin(Math.PI*t),oz+(gz-oz)*t-.21*Math.sin(Math.PI*t)]);}line(groups.actions,points,mats.path);for(let i=0;i<4;i++){const p=points[Math.round((i+1)*35/4)];const dot=mesh(new THREE.SphereGeometry(.072,12,8),new THREE.MeshBasicMaterial({color:i===0?0xa34f36:0xbc674b}),groups.actions,...p);dot.userData.actionIndex=i;}groups.actions.userData.path=points;}
  function addPour(points,rng){
    const bowl=mesh(new THREE.CylinderGeometry(.37,.25,.36,40,1,true),mats.bowl,groups.solid,-.9,.37,.1);bowl.rotation.z=.08;
    mesh(new THREE.TorusGeometry(.37,.038,8,36),mats.bowl,groups.solid,-.9,.56,.1).rotation.x=Math.PI/2;
    mesh(new THREE.CylinderGeometry(.23,.22,.025,32),mats.food,groups.solid,-.9,.32,.1);
    const target=mesh(new THREE.CylinderGeometry(.55,.55,.06,40),mats.target,groups.solid,.92,.07,-.28);target.scale.z=.75;
    sampleRing(points,-.9,.22,.1,.3,205,rng);sampleBox(points,.92,.08,-.28,1,.07,.74,105,rng);
    const gripper=new THREE.Group();gripper.position.set(-1.55,.85,.35);groups.solid.add(gripper);box(gripper,[.38,.2,.25],mats.hand,0,0,0);box(gripper,[.09,.3,.08],mats.hand,.14,-.19,-.13);box(gripper,[.09,.3,.08],mats.hand,.14,-.19,.13);
  }
  function addDrill(points,rng){
    const body=mesh(new THREE.CylinderGeometry(.17,.2,.85,24),mats.drill,groups.solid,-.85,.48,.2);body.rotation.z=Math.PI/2;
    box(groups.solid,[.17,.36,.16],mats.drill,-.98,.25,.2);
    const bit=mesh(new THREE.CylinderGeometry(.04,.04,.52,16),mats.metal,groups.solid,-.23,.49,.2);bit.rotation.z=Math.PI/2;
    box(groups.solid,[.54,.54,.54],mats.cube,.95,.29,-.2);
    sampleCylinder(points,-.85,.5,.2,.17,.78,210,rng);sampleBox(points,.95,.29,-.2,.54,.54,.54,130,rng);
    const hand=box(groups.solid,[.38,.26,.28],mats.hand,-1.43,.74,.2);hand.rotation.z=-.3;
  }
  function addReach(points,rng){
    const target=mesh(new THREE.SphereGeometry(.18,24,16),mats.target,groups.solid,.85,.48,-.35);
    const ring=mesh(new THREE.TorusGeometry(.29,.012,8,40),mats.target,groups.solid,.85,.48,-.35);ring.rotation.x=.32;
    box(groups.solid,[.34,.2,.25],mats.hand,-1.2,.55,.35);box(groups.solid,[.08,.32,.08],mats.hand,-1,.35,.22);box(groups.solid,[.08,.32,.08],mats.hand,-1,.35,.48);
    sampleBox(points,-1.2,.55,.35,.34,.2,.25,120,rng);for(let i=0;i<180;i++){const u=rng()*Math.PI*2,z=rng()*2-1,r=Math.sqrt(1-z*z);points.push([.85+.18*r*Math.cos(u),.48+.18*z,-.35+.18*r*Math.sin(u)]);}
  }
  function build(task){
    Object.values(groups).forEach(disposeGroup);
    const rng=seeded(task==='pour'?330:task==='drill'?521:903);
    box(groups.solid,[3.5,.08,2.35],mats.table,0,-.08,0);
    const objectPoints=[];
    if(task==='pour')addPour(objectPoints,rng);else if(task==='drill')addDrill(objectPoints,rng);else addReach(objectPoints,rng);
    const floor=[];for(let i=0;i<480;i++)floor.push([(rng()-.5)*5.6,-.035,(rng()-.5)*3.6]);
    makePoints(groups.raw,[...floor,...objectPoints],color.raw,.035);
    makePoints(groups.kept,farthest(objectPoints,160),color.kept,.072);
    addCamera();addCrop();addFeatures();addActions(task);updateVisibility();
  }
  function updateVisibility(){
    const s=state.stage,d=state.display;
    groups.solid.visible=d!=='points'&&(s===0||s>=1);
    groups.raw.visible=d!=='solid'&&s>=1&&s<=3;
    groups.kept.visible=d!=='solid'&&s>=3;
    groups.sensor.visible=s<=1;
    groups.crop.visible=s===2;
    groups.features.visible=s>=4;
    groups.actions.visible=s>=7;
    if(s>=4&&s<=6)groups.raw.visible=false;
    if(s>=4&&d==='solid')groups.kept.visible=false;
    const dots=groups.actions.children.filter(child=>child.userData.actionIndex!==undefined);
    dots.forEach(dot=>dot.visible=s===8||dot.userData.actionIndex===0);
    root.rotation.y=0;
  }
  function resize(){const w=mount.clientWidth,h=mount.clientHeight;if(w<1||h<1)return;renderer.setSize(w,h,false);camera.aspect=w/h;camera.fov=w<600?49:40;camera.updateProjectionMatrix();}
  function frame(){camera.position.set(Math.sin(state.yaw)*Math.cos(state.pitch)*state.radius,Math.sin(state.pitch)*state.radius+.65,Math.cos(state.yaw)*Math.cos(state.pitch)*state.radius);camera.lookAt(0,.48,0);renderer.render(scene,camera);requestAnimationFrame(frame);}
  let dragging=false,startX=0,startY=0;
  renderer.domElement.addEventListener('pointerdown',event=>{dragging=true;startX=event.clientX;startY=event.clientY;renderer.domElement.setPointerCapture(event.pointerId);});
  renderer.domElement.addEventListener('pointermove',event=>{if(!dragging)return;state.yaw+=(event.clientX-startX)*.007;state.pitch=Math.max(-.12,Math.min(1.1,state.pitch+(event.clientY-startY)*.006));startX=event.clientX;startY=event.clientY;});
  renderer.domElement.addEventListener('pointerup',()=>{dragging=false;});
  renderer.domElement.addEventListener('pointercancel',()=>{dragging=false;});
  renderer.domElement.addEventListener('wheel',event=>{event.preventDefault();state.radius=Math.max(4.5,Math.min(11,state.radius+Math.sign(event.deltaY)*.45));},{passive:false});
  window.addEventListener('resize',resize);
  if(window.ResizeObserver)new ResizeObserver(resize).observe(mount);
  window.DP3Scene={setTask(task){state.task=task;build(task);},setStage(stage){state.stage=stage;updateVisibility();},setDisplay(display){state.display=display;updateVisibility();},resize,getCanvas(){return renderer.domElement;}};
  build('pour');resize();frame();
})();
