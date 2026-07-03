import * as THREE from 'three';

/* ============================================================
   Sky Messenger — an original low-poly flying delivery game
   built with Three.js. Fly a paper-plane courier, pick up
   glowing letters, and drop them at the matching mailbox.
   ============================================================ */

const WORLD = 420;           // half-size of the ground plane
const CFG = {
  gameTime: 120,
  pickupRadius: 9,
  deliverRadius: 11,
  numHouses: 26,
  numTrees: 130,
  bonusPerDelivery: 6,
};

let renderer, scene, camera, clock;
let plane, propeller;
const state = {
  running: false,
  time: CFG.gameTime,
  score: 0,
  carrying: null,          // letter object being carried
  speed: 0,
  yaw: 0, pitch: 0, roll: 0,
  vel: new THREE.Vector3(),
};

const keys = {};
const touch = { active:false, dx:0, dy:0, boost:false };
const houses = [];         // {group, mailbox, pos, color, hasLetter}
const letters = [];        // active pickup letters
const clouds = [];
let activeLetter = null;   // the letter currently to be picked up
let mouse = { x:0, y:0 };

const el = id => document.getElementById(id);

/* ---------------- Init ----------------
   NOTE: init() is invoked at the very BOTTOM of this file, after every
   module-level const (mm, _v, COLOR_NAMES, …) has been initialized, so the
   render loop it starts can safely reference them. Calling it up here would
   hit a temporal-dead-zone ReferenceError and abort the whole module. */

function init() {
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x8ec9ff);
  scene.fog = new THREE.Fog(0x9fd0ff, 260, 560);

  camera = new THREE.PerspectiveCamera(62, innerWidth/innerHeight, 0.5, 2000);
  camera.position.set(0, 40, 60);

  renderer = new THREE.WebGLRenderer({ antialias:true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setSize(innerWidth, innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  el('app').appendChild(renderer.domElement);

  clock = new THREE.Clock();

  buildLights();
  buildGround();
  buildTown();
  buildTrees();
  buildClouds();
  buildPlane();

  addEventListener('resize', onResize);
  addEventListener('keydown', e => { keys[e.code] = true;
    if ([ 'ArrowUp','ArrowDown','ArrowLeft','ArrowRight','Space' ].includes(e.code)) e.preventDefault(); });
  addEventListener('keyup',   e => { keys[e.code] = false; });
  addEventListener('mousemove', e => {
    mouse.x = (e.clientX/innerWidth)*2 - 1;
    mouse.y = (e.clientY/innerHeight)*2 - 1;
  });
  setupTouch();

  el('startBtn').addEventListener('click', startGame);
  el('againBtn').addEventListener('click', () => location.reload());

  animate();
}

/* ---------------- Scene building ---------------- */
function buildLights() {
  scene.add(new THREE.HemisphereLight(0xffffff, 0x6a8f5a, 0.95));
  const sun = new THREE.DirectionalLight(0xfff2d6, 1.25);
  sun.position.set(120, 200, 80);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = 320;
  sun.shadow.camera.left = -s; sun.shadow.camera.right = s;
  sun.shadow.camera.top = s; sun.shadow.camera.bottom = -s;
  sun.shadow.camera.far = 600;
  scene.add(sun);
}

function buildGround() {
  const geo = new THREE.PlaneGeometry(WORLD*2, WORLD*2, 60, 60);
  // gentle rolling hills
  const pos = geo.attributes.position;
  for (let i=0;i<pos.count;i++){
    const x = pos.getX(i), y = pos.getY(i);
    const h = Math.sin(x*0.008)*Math.cos(y*0.009)*6 + Math.sin(x*0.02+y*0.02)*2;
    pos.setZ(i, h);
  }
  geo.computeVertexNormals();
  const mat = new THREE.MeshStandardMaterial({ color:0x7cbf5a, flatShading:true });
  const ground = new THREE.Mesh(geo, mat);
  ground.rotation.x = -Math.PI/2;
  ground.receiveShadow = true;
  scene.add(ground);

  // a winding river band
  const river = new THREE.Mesh(
    new THREE.PlaneGeometry(WORLD*2, 34, 1, 1),
    new THREE.MeshStandardMaterial({ color:0x4aa6e0, transparent:true, opacity:0.85 })
  );
  river.rotation.x = -Math.PI/2;
  river.position.set(0, 0.6, -40);
  river.rotation.z = 0.12;
  scene.add(river);

  // a couple of roads (thin dark strips)
  for (let i=0;i<3;i++){
    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(9, WORLD*2, 1, 1),
      new THREE.MeshStandardMaterial({ color:0x6b6f78 })
    );
    road.rotation.x = -Math.PI/2;
    road.position.set(-160 + i*160, 0.5, 0);
    scene.add(road);
  }
}

const HOUSE_COLORS = [0xff7a59,0xffd24a,0x6ec6ff,0x9b7bff,0x66d6a6,0xff9ac1,0xff6b6b,0x7ee081];

function buildTown() {
  const rng = mulberry(1337);
  let placed = 0, guard = 0;
  while (placed < CFG.numHouses && guard++ < 2000) {
    const x = (rng()*2-1)*WORLD*0.82;
    const z = (rng()*2-1)*WORLD*0.82;
    if (Math.hypot(x,z) < 40) continue;                 // keep spawn clear
    if (houses.some(h => Math.hypot(h.pos.x-x, h.pos.z-z) < 46)) continue;
    const color = HOUSE_COLORS[placed % HOUSE_COLORS.length];
    houses.push(makeHouse(x, z, color, rng));
    placed++;
  }
}

function makeHouse(x, z, color, rng) {
  const g = new THREE.Group();
  const w = 12 + rng()*8, d = 12 + rng()*8, h = 10 + rng()*10;

  const body = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshStandardMaterial({ color:0xf2ede2, flatShading:true })
  );
  body.position.y = h/2; body.castShadow = body.receiveShadow = true; g.add(body);

  const roof = new THREE.Mesh(
    new THREE.ConeGeometry(Math.max(w,d)*0.8, 8, 4),
    new THREE.MeshStandardMaterial({ color, flatShading:true })
  );
  roof.position.y = h + 4; roof.rotation.y = Math.PI/4; roof.castShadow = true; g.add(roof);

  // door + windows accents in the house color
  const door = new THREE.Mesh(new THREE.BoxGeometry(3,5,0.5),
    new THREE.MeshStandardMaterial({ color }));
  door.position.set(0, 2.5, d/2+0.1); g.add(door);

  // Mailbox out front (this is the delivery target)
  const mailbox = new THREE.Group();
  const post = new THREE.Mesh(new THREE.CylinderGeometry(0.5,0.5,7,8),
    new THREE.MeshStandardMaterial({ color:0x6b4f34 }));
  post.position.y = 3.5; mailbox.add(post);
  const boxMesh = new THREE.Mesh(new THREE.BoxGeometry(4,3,6),
    new THREE.MeshStandardMaterial({ color, flatShading:true, emissive:color, emissiveIntensity:0 }));
  boxMesh.position.y = 7; boxMesh.castShadow = true; mailbox.add(boxMesh);
  const flag = new THREE.Mesh(new THREE.BoxGeometry(0.4,2,2),
    new THREE.MeshStandardMaterial({ color:0xff3b3b }));
  flag.position.set(-2.2, 7.6, 0); mailbox.add(flag);
  mailbox.position.set(w/2 + 8, 0, d/2 + 6);
  mailbox.userData.boxMesh = boxMesh;
  mailbox.userData.flag = flag;
  g.add(mailbox);

  g.position.set(x, 0, z);
  g.rotation.y = rng()*Math.PI*2;
  scene.add(g);

  const worldMailPos = new THREE.Vector3();
  mailbox.getWorldPosition(worldMailPos);

  return { group:g, mailbox, boxMesh, flag, color,
           pos:new THREE.Vector3(x,0,z),
           mailPos:worldMailPos, active:false };
}

function buildTrees() {
  const rng = mulberry(55);
  const trunkMat = new THREE.MeshStandardMaterial({ color:0x7a5230, flatShading:true });
  const leafMats = [0x3f9d54,0x4fb266,0x2f8a48].map(c =>
    new THREE.MeshStandardMaterial({ color:c, flatShading:true }));
  for (let i=0;i<CFG.numTrees;i++){
    const x = (rng()*2-1)*WORLD*0.95, z=(rng()*2-1)*WORLD*0.95;
    if (Math.hypot(x,z) < 30) continue;
    if (houses.some(h => Math.hypot(h.pos.x-x,h.pos.z-z) < 20)) continue;
    const t = new THREE.Group();
    const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.8,1.1,6,6), trunkMat);
    trunk.position.y=3; trunk.castShadow=true; t.add(trunk);
    const foliage = new THREE.Mesh(new THREE.IcosahedronGeometry(4+rng()*2,0),
      leafMats[i%3]);
    foliage.position.y = 8+rng()*2; foliage.castShadow=true; t.add(foliage);
    t.position.set(x,0,z);
    t.scale.setScalar(0.8+rng()*0.9);
    scene.add(t);
  }
}

function buildClouds() {
  const mat = new THREE.MeshStandardMaterial({ color:0xffffff, flatShading:true,
    transparent:true, opacity:0.92 });
  const rng = mulberry(9);
  for (let i=0;i<24;i++){
    const c = new THREE.Group();
    const puffs = 3+Math.floor(rng()*4);
    for (let p=0;p<puffs;p++){
      const s = 6+rng()*8;
      const m = new THREE.Mesh(new THREE.IcosahedronGeometry(s,0), mat);
      m.position.set((rng()*2-1)*14, (rng()*2-1)*4, (rng()*2-1)*10);
      c.add(m);
    }
    c.position.set((rng()*2-1)*WORLD, 80+rng()*70, (rng()*2-1)*WORLD);
    c.userData.drift = 2+rng()*4;
    scene.add(c); clouds.push(c);
  }
}

function buildPlane() {
  plane = new THREE.Group();

  const bodyMat = new THREE.MeshStandardMaterial({ color:0xff5a4d, flatShading:true });
  const accentMat= new THREE.MeshStandardMaterial({ color:0xffd24a, flatShading:true });
  const glassMat = new THREE.MeshStandardMaterial({ color:0x203040, metalness:.2, roughness:.2 });

  const fuselage = new THREE.Mesh(new THREE.CylinderGeometry(1.4,0.6,10,10), bodyMat);
  fuselage.rotation.z = Math.PI/2; fuselage.castShadow=true; plane.add(fuselage);

  const nose = new THREE.Mesh(new THREE.ConeGeometry(1.4,3,10), bodyMat);
  nose.rotation.z = -Math.PI/2; nose.position.x = 6.4; plane.add(nose);

  const cockpit = new THREE.Mesh(new THREE.SphereGeometry(1.3,10,8,0,Math.PI*2,0,Math.PI/2), glassMat);
  cockpit.position.set(0.5,1.1,0); plane.add(cockpit);

  const wing = new THREE.Mesh(new THREE.BoxGeometry(3.4,0.4,16), accentMat);
  wing.position.set(0.5,0.4,0); wing.castShadow=true; plane.add(wing);

  const tailWing = new THREE.Mesh(new THREE.BoxGeometry(2,0.3,6), accentMat);
  tailWing.position.set(-4.5,0.6,0); plane.add(tailWing);
  const fin = new THREE.Mesh(new THREE.BoxGeometry(2,3,0.3), bodyMat);
  fin.position.set(-4.5,1.8,0); plane.add(fin);

  // propeller
  propeller = new THREE.Group();
  const hub = new THREE.Mesh(new THREE.SphereGeometry(0.6,8,8), accentMat); propeller.add(hub);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.3,6,0.8), glassMat);
  propeller.add(blade);
  const blade2 = blade.clone(); blade2.rotation.x = Math.PI/2; propeller.add(blade2);
  propeller.position.set(8,0,0); plane.add(propeller);

  plane.position.set(0, 60, 0);
  scene.add(plane);
}

/* ---------------- Game flow ---------------- */
function startGame() {
  el('start').classList.add('hidden');
  state.running = true;
  state.time = CFG.gameTime;
  state.score = 0;
  state.speed = 42;
  plane.position.set(0,60,0);
  spawnLetter();          // first delivery target
  tickTimer();
}

function spawnLetter() {
  // choose a random house without a letter, that isn't the delivery target
  const candidates = houses.filter(h => !h.active);
  const target = candidates[Math.floor(Math.random()*candidates.length)];
  target.active = 'pending';

  // place a glowing letter somewhere over town to pick up
  const letter = makeLetterMesh(target.color);
  const lx = (Math.random()*2-1)*WORLD*0.7;
  const lz = (Math.random()*2-1)*WORLD*0.7;
  letter.position.set(lx, 34 + Math.random()*26, lz);
  letter.userData.target = target;
  scene.add(letter);
  activeLetter = letter;
  letters.push(letter);
  updateObjective(`Fly to the glowing ${colorName(target.color)} letter to pick it up`);
  el('carry').textContent = '—';
}

function makeLetterMesh(color) {
  const g = new THREE.Group();
  const env = new THREE.Mesh(new THREE.BoxGeometry(5,3.4,0.7),
    new THREE.MeshStandardMaterial({ color:0xfff6e0, emissive:0xffef99, emissiveIntensity:0.5, flatShading:true }));
  g.add(env);
  // colored wax-seal / stripe so it maps to a mailbox color
  const seal = new THREE.Mesh(new THREE.CylinderGeometry(0.9,0.9,0.4,10),
    new THREE.MeshStandardMaterial({ color, emissive:color, emissiveIntensity:0.6 }));
  seal.rotation.x = Math.PI/2; seal.position.z = 0.45; g.add(seal);
  // glow ring
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4.4,0.35,8,24),
    new THREE.MeshBasicMaterial({ color, transparent:true, opacity:0.85 }));
  g.add(ring);
  g.userData.ring = ring;
  g.userData.color = color;
  return g;
}

function pickUp(letter) {
  scene.remove(letter);
  letters.splice(letters.indexOf(letter),1);
  state.carrying = letter.userData;
  activeLetter = null;
  const target = letter.userData.target;
  target.active = true;
  // light the mailbox
  target.boxMesh.material.emissiveIntensity = 0.9;
  el('carry').textContent = colorName(letter.userData.color) + ' letter';
  updateObjective(`Deliver it to the glowing ${colorName(letter.userData.color)} mailbox`);
  ding(660);
}

function deliver(house) {
  house.boxMesh.material.emissiveIntensity = 0;
  house.active = false;
  state.carrying = null;
  state.score++;
  el('score').textContent = state.score;
  state.time = Math.min(CFG.gameTime, state.time + CFG.bonusPerDelivery);
  flashBonus();
  ding(880);
  spawnLetter();
}

function tickTimer() {
  if (!state.running) return;
  state.time -= 1;
  el('time').textContent = Math.max(0, Math.ceil(state.time));
  if (state.time <= 0) { endGame(); return; }
  setTimeout(tickTimer, 1000);
}

function endGame() {
  state.running = false;
  el('end').classList.remove('hidden');
  el('end-score').textContent = state.score;
  const msgs = state.score>=15 ? 'Legendary courier! The whole town got their mail. 🏆'
             : state.score>=8 ? 'Great flying! Neighbours are smiling. ⭐'
             : state.score>=3 ? 'Nice work — the mail is moving. ✈'
             : 'Rough shift. Give it another go!';
  el('end-msg').textContent = msgs;
  el('end-sub').textContent = `You delivered ${state.score} letter${state.score===1?'':'s'}.`;
}

/* ---------------- Update loop ---------------- */
function animate() {
  requestAnimationFrame(animate);
  const dt = Math.min(clock.getDelta(), 0.05);
  const t = clock.elapsedTime;

  if (propeller) propeller.rotation.x += dt * 40;
  clouds.forEach(c => { c.position.x += c.userData.drift*dt;
    if (c.position.x > WORLD) c.position.x = -WORLD; });
  letters.forEach(l => { l.rotation.y += dt*1.4; l.position.y += Math.sin(t*2)*0.04;
    l.userData.ring.rotation.z += dt*2; });
  houses.forEach(h => { if (h.active===true){
    h.flag.rotation.z = Math.sin(t*6)*0.3; h.boxMesh.position.y = 7 + Math.sin(t*4)*0.3; }});

  if (state.running) updatePlane(dt);
  updateCamera(dt);
  drawMinimap();

  renderer.render(scene, camera);
}

function updatePlane(dt) {
  // ---- steering input ----
  let turn = 0, climb = 0, throttle = 0;
  if (keys['KeyA']||keys['ArrowLeft'])  turn += 1;
  if (keys['KeyD']||keys['ArrowRight']) turn -= 1;
  if (keys['KeyW']||keys['ArrowUp'])    climb -= 1;   // nose down
  if (keys['KeyS']||keys['ArrowDown'])  climb += 1;   // nose up
  const boosting = keys['ShiftLeft']||keys['ShiftRight']||touch.boost;
  const braking  = keys['Space'];

  if (touch.active) { turn += -touch.dx; climb += touch.dy; }

  // mouse gives subtle steering assist
  turn  += -mouse.x * 0.4;
  climb +=  mouse.y * 0.4;

  // ---- speed ----
  const targetSpeed = braking ? 18 : (boosting ? 78 : 46);
  state.speed += (targetSpeed - state.speed) * Math.min(1, dt*2);

  // ---- orientation ----
  state.yaw   += turn  * dt * 1.3;
  state.pitch += climb * dt * 1.1;
  state.pitch = THREE.MathUtils.clamp(state.pitch, -0.7, 0.7);
  // bank into turns, auto-level
  const targetRoll = turn * 0.5;
  state.roll += (targetRoll - state.roll) * Math.min(1, dt*4);
  // pitch auto-levels slightly when no input
  if (climb === 0) state.pitch *= (1 - dt*0.8);

  plane.rotation.set(0,0,0);
  plane.rotateY(state.yaw);
  plane.rotateZ(state.pitch);     // note: local X is forward, so Z tilt = pitch
  plane.rotateX(-state.roll);

  // ---- move along forward (local +X) ----
  const forward = new THREE.Vector3(1,0,0).applyQuaternion(plane.quaternion);
  plane.position.addScaledVector(forward, state.speed*dt);

  // keep inside world & above ground
  const p = plane.position;
  const lim = WORLD*0.98;
  if (Math.abs(p.x)>lim){ p.x = THREE.MathUtils.clamp(p.x,-lim,lim); state.yaw += Math.PI*dt; }
  if (Math.abs(p.z)>lim){ p.z = THREE.MathUtils.clamp(p.z,-lim,lim); state.yaw += Math.PI*dt; }
  if (p.y < 14){ p.y = 14; state.pitch = Math.max(state.pitch, 0.05); }
  if (p.y > 150) p.y = 150;

  // ---- pickups & deliveries ----
  if (activeLetter && !state.carrying) {
    if (plane.position.distanceTo(activeLetter.position) < CFG.pickupRadius)
      pickUp(activeLetter);
  }
  if (state.carrying) {
    const h = state.carrying.target;
    h.mailbox.getWorldPosition(_v);
    if (plane.position.distanceTo(_v) < CFG.deliverRadius) deliver(h);
  }
}
const _v = new THREE.Vector3();

function updateCamera(dt) {
  // chase camera behind & above the plane
  const back = new THREE.Vector3(-1,0,0).applyQuaternion(plane.quaternion);
  const up   = new THREE.Vector3(0,1,0).applyQuaternion(plane.quaternion);
  const desired = plane.position.clone()
    .addScaledVector(back, 26)
    .addScaledVector(up, 9);
  camera.position.lerp(desired, Math.min(1, dt*3));
  const look = plane.position.clone().addScaledVector(back, -6);
  camera.lookAt(look);
}

/* ---------------- Minimap ---------------- */
const mm = el('minimap').getContext('2d');
function drawMinimap() {
  const W=150,H=150, sc = W/(WORLD*2);
  mm.clearRect(0,0,W,H);
  mm.fillStyle = 'rgba(120,190,110,.55)'; mm.fillRect(0,0,W,H);
  const toMap = (x,z)=>[ (x+WORLD)*sc, (z+WORLD)*sc ];
  // houses
  houses.forEach(h=>{
    const [mx,my]=toMap(h.pos.x,h.pos.z);
    mm.fillStyle = h.active ? '#ffffff' : 'rgba(255,255,255,.5)';
    mm.beginPath(); mm.arc(mx,my, h.active?4:2.2,0,7); mm.fill();
    if (h.active===true){ mm.strokeStyle='#ff7a59'; mm.lineWidth=2; mm.stroke(); }
  });
  // active letter
  if (activeLetter){
    const [lx,ly]=toMap(activeLetter.position.x,activeLetter.position.z);
    mm.fillStyle='#ffd24a'; mm.beginPath(); mm.arc(lx,ly,4,0,7); mm.fill();
    mm.strokeStyle='#fff'; mm.lineWidth=1.5; mm.stroke();
  }
  // plane
  const [px,py]=toMap(plane.position.x,plane.position.z);
  mm.save(); mm.translate(px,py); mm.rotate(-state.yaw+Math.PI/2);
  mm.fillStyle='#ff3b3b'; mm.beginPath();
  mm.moveTo(0,-6); mm.lineTo(4,5); mm.lineTo(-4,5); mm.closePath(); mm.fill();
  mm.restore();
}

/* ---------------- UI helpers ---------------- */
function updateObjective(text){ el('obj-text').textContent = text; }
function flashBonus(){
  const o = el('objective');
  o.style.transition='none'; o.style.background='rgba(255,210,74,.95)';
  requestAnimationFrame(()=>{ o.style.transition='background .6s'; o.style.background=''; });
}
const COLOR_NAMES = {
  0xff7a59:'orange',0xffd24a:'yellow',0x6ec6ff:'blue',0x9b7bff:'purple',
  0x66d6a6:'green',0xff9ac1:'pink',0xff6b6b:'red',0x7ee081:'lime'
};
function colorName(c){ return COLOR_NAMES[c] || 'glowing'; }

/* ---------------- Audio (tiny beeps) ---------------- */
let actx;
function ding(freq){
  try{
    actx = actx || new (window.AudioContext||window.webkitAudioContext)();
    const o=actx.createOscillator(), g=actx.createGain();
    o.frequency.value=freq; o.type='triangle';
    g.gain.value=0.08; o.connect(g); g.connect(actx.destination);
    o.start(); g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime+0.25);
    o.stop(actx.currentTime+0.26);
  }catch(e){}
}

/* ---------------- Touch controls ---------------- */
function setupTouch(){
  const stick=el('stick'), nub=el('nub'), boost=el('boostBtn');
  let cx=0,cy=0,tracking=false;
  const start=e=>{ tracking=true; touch.active=true; const r=stick.getBoundingClientRect();
    cx=r.left+r.width/2; cy=r.top+r.height/2; move(e); };
  const move=e=>{ if(!tracking)return; const tt=e.touches?e.touches[0]:e;
    let dx=(tt.clientX-cx)/55, dy=(tt.clientY-cy)/55;
    dx=Math.max(-1,Math.min(1,dx)); dy=Math.max(-1,Math.min(1,dy));
    touch.dx=dx; touch.dy=dy;
    nub.style.transform=`translate(${dx*35}px,${dy*35}px)`; };
  const end=()=>{ tracking=false; touch.dx=touch.dy=0; nub.style.transform=''; };
  stick.addEventListener('touchstart',start,{passive:false});
  stick.addEventListener('touchmove',move,{passive:false});
  stick.addEventListener('touchend',end);
  boost.addEventListener('touchstart',e=>{e.preventDefault();touch.boost=true;});
  boost.addEventListener('touchend',()=>touch.boost=false);
}

/* ---------------- utils ---------------- */
function onResize(){
  camera.aspect = innerWidth/innerHeight; camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
}
// deterministic PRNG so the town layout is stable
function mulberry(a){ return function(){ a|=0; a=a+0x6D2B79F5|0;
  let t=Math.imul(a^a>>>15,1|a); t=t+Math.imul(t^t>>>7,61|t)^t;
  return ((t^t>>>14)>>>0)/4294967296; }; }

/* ---------------- boot ----------------
   Everything the render loop needs is now initialized above. */
init();
