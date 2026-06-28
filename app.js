/* ==========================================================
   Light Snake — Chance IT Studio
   Neon dragon snake. Score = orbs eaten. Vanilla canvas, no deps.

   Layout: the play area FILLS the stage (everything below the header
   strip). The grid is computed to fit whatever size it's given, so
   fullscreen on mobile gets a tall field, desktop gets a wide one.
   Fixed-timestep movement; rendering runs every frame so the aura /
   orb / particles animate between moves.
   ========================================================== */

const stage = document.getElementById("stage");
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");

/* ---- palette ---- */
const C = {
  bg:"#08080a", grid:"rgba(0,255,157,0.06)",
  green:"#00ff9d", emerald:"#00995c", orange:"#ff6a2c", red:"#ff2d4f",
  gold:"#ffcf3a", white:"#eafff6",
};

/* ---- grid (dynamic — fills the stage) ---- */
let viewW, viewH, CELL, COLS, ROWS, offX, offY, SCALE;
const pxX = (cx) => offX + cx * CELL + CELL / 2;
const pxY = (cy) => offY + cy * CELL + CELL / 2;

/* ---- state ---- */
const LS_BEST = "lightsnake_best_v1";
let snake, dir, nextDir, orb, score, state;
let moveInterval, accMs, lastTs;
let particles, flash, auraBoost, t0;
let best = Number(localStorage.getItem(LS_BEST) || 0);

/* ---- sizing ---- */
function layoutCanvas() {
  viewW = stage.clientWidth;
  viewH = stage.clientHeight;
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = Math.round(viewW * dpr);
  canvas.height = Math.round(viewH * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const gridW = COLS * CELL, gridH = ROWS * CELL;
  offX = Math.floor((viewW - gridW) / 2);
  offY = Math.floor((viewH - gridH) / 2);
}
function computeGrid() {
  const w = stage.clientWidth, h = stage.clientHeight;
  CELL = Math.max(20, Math.min(34, Math.round(Math.min(w, h) / 20)));
  COLS = Math.max(8, Math.floor(w / CELL));
  ROWS = Math.max(8, Math.floor(h / CELL));
  SCALE = CELL / 25;
  layoutCanvas();
}

/* ---- helpers ---- */
const DIRV = { LEFT:{x:-1,y:0}, RIGHT:{x:1,y:0}, UP:{x:0,y:-1}, DOWN:{x:0,y:1} };
const OPP = { LEFT:"RIGHT", RIGHT:"LEFT", UP:"DOWN", DOWN:"UP" };

function resetState() {
  const cx = Math.floor(COLS / 2), cy = Math.floor(ROWS / 2);
  snake = [{x:cx,y:cy},{x:cx-1,y:cy},{x:cx-2,y:cy},{x:cx-3,y:cy}];
  dir = "RIGHT"; nextDir = "RIGHT";
  score = 0; moveInterval = 135; accMs = 0;
  particles = []; flash = 0; auraBoost = 0;
  spawnOrb(); updateHUD();
}
function spawnOrb() {
  const free = [];
  for (let x=0;x<COLS;x++) for (let y=0;y<ROWS;y++)
    if (!snake.some(s=>s.x===x&&s.y===y)) free.push({x,y});
  orb = free.length ? free[(Math.random()*free.length)|0] : null;
}
function updateHUD() { scoreEl.textContent = String(score); bestEl.textContent = String(best); }

/* ---- overlays (device-aware hint) ---- */
function showOverlay(html){ overlay.innerHTML = html; overlay.style.display = "grid"; }
function hideOverlay(){ overlay.style.display = "none"; }
const HINT_START = `
  <span class="hint--desktop"><kbd>WASD</kbd> / <kbd>&#8593;&#8595;&#8592;&#8594;</kbd> move &middot; <kbd>Space</kbd> start &middot; <kbd>P</kbd> pause</span>
  <span class="hint--mobile">Use the on-screen D&#8209;pad &middot; tap to start</span>`;
const HINT_AGAIN = `
  <span class="hint--desktop"><kbd>Space</kbd> go again</span>
  <span class="hint--mobile">Tap to go again</span>`;

function idleScreen() {
  showOverlay(`<div class="card">
    <div class="eyebrow">Chance IT Studio</div>
    <h1 class="title">LIGHT&nbsp;SNAKE</h1>
    <p class="lead">Pilot the dragon. Devour the orbs. Don't bite your tail or hit the wall.</p>
    <p class="keys">${HINT_START}</p>
  </div>`);
}
function overScreen() {
  const nb = score>0 && score>=best ? `<div class="best-flag">NEW BEST</div>` : "";
  showOverlay(`<div class="card">
    ${nb}<h1 class="title ko">K.O.</h1>
    <p class="lead">Orbs devoured: <strong>${score}</strong> &middot; Best: <strong>${best}</strong></p>
    <p class="keys">${HINT_AGAIN}</p>
  </div>`);
}
function pauseScreen() {
  showOverlay(`<div class="card">
    <h1 class="title">PAUSED</h1>
    <p class="keys"><span class="hint--desktop"><kbd>P</kbd> resume</span><span class="hint--mobile">Tap to resume</span></p>
  </div>`);
}

/* ---- flow ---- */
function startGame(){ computeGrid(); resetState(); hideOverlay(); state="running"; lastTs=performance.now(); }
function gameOver(){
  state="over";
  if (score>best){ best=score; localStorage.setItem(LS_BEST,String(best)); }
  updateHUD();
  burst(pxX(snake[0].x), pxY(snake[0].y), C.red, 22);
  window.HubBridge?.score({ mode:"classic", points:score });
  window.HubBridge?.event("run_finished", { mode:"classic" });
  overScreen();
}
function togglePause(){
  if (state==="running"){ state="paused"; pauseScreen(); }
  else if (state==="paused"){ state="running"; hideOverlay(); lastTs=performance.now(); }
}

/* ---- tick ---- */
function step(){
  if (nextDir !== OPP[dir]) dir = nextDir;
  const d = DIRV[dir];
  const head = { x:snake[0].x+d.x, y:snake[0].y+d.y };
  if (head.x<0||head.x>=COLS||head.y<0||head.y>=ROWS ||
      snake.some(s=>s.x===head.x&&s.y===head.y)){ gameOver(); return; }
  snake.unshift(head);
  if (orb && head.x===orb.x && head.y===orb.y){
    score+=1; moveInterval=Math.max(70,135-score*3);
    flash=0.5; auraBoost=1;
    burst(pxX(orb.x),pxY(orb.y),C.gold,14); ring(pxX(orb.x),pxY(orb.y),C.orange);
    spawnOrb(); updateHUD();
  } else snake.pop();
}

/* ---- particles ---- */
function burst(x,y,color,n){ for(let i=0;i<n;i++){ const a=Math.random()*Math.PI*2, sp=(1.4+Math.random()*2.6)*SCALE;
  particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:1,kind:"dot",color}); } }
function ring(x,y,color){ particles.push({x,y,r:6*SCALE,life:1,kind:"ring",color}); }
function updateParticles(dt){
  for(let i=particles.length-1;i>=0;i--){ const p=particles[i]; p.life-=dt/520;
    if(p.kind==="dot"){ p.x+=p.vx; p.y+=p.vy; p.vx*=0.94; p.vy*=0.94; } else p.r+=dt*0.09*SCALE;
    if(p.life<=0) particles.splice(i,1); }
}

/* ==========================================================
   Render
   ========================================================== */
function render(now){
  const t=(now-t0)/1000;
  ctx.clearRect(0,0,viewW,viewH);
  ctx.fillStyle=C.bg; ctx.fillRect(0,0,viewW,viewH);
  const glow=ctx.createRadialGradient(viewW/2,viewH*0.4,30,viewW/2,viewH/2,Math.max(viewW,viewH)*0.6);
  glow.addColorStop(0,"rgba(0,255,157,0.05)"); glow.addColorStop(1,"rgba(0,0,0,0)");
  ctx.fillStyle=glow; ctx.fillRect(0,0,viewW,viewH);

  // grid (only across the play grid)
  const gx0=offX, gy0=offY, gx1=offX+COLS*CELL, gy1=offY+ROWS*CELL;
  ctx.strokeStyle=C.grid; ctx.lineWidth=1; ctx.beginPath();
  for(let i=0;i<=COLS;i++){ ctx.moveTo(gx0+i*CELL,gy0); ctx.lineTo(gx0+i*CELL,gy1); }
  for(let j=0;j<=ROWS;j++){ ctx.moveTo(gx0,gy0+j*CELL); ctx.lineTo(gx1,gy0+j*CELL); }
  ctx.stroke();

  if (orb) drawOrb(pxX(orb.x),pxY(orb.y),t);
  drawDragon(t);
  drawParticles();
  if (flash>0){ ctx.fillStyle=`rgba(0,255,157,${flash*0.18})`; ctx.fillRect(0,0,viewW,viewH); }
  drawFrame(gx0,gy0,gx1,gy1);
}

function drawOrb(x,y,t){
  const r=9*SCALE*(1+Math.sin(t*3.4)*0.12);
  ctx.save();
  ctx.shadowColor=C.red; ctx.shadowBlur=34; ctx.fillStyle="rgba(255,45,79,0.55)"; circle(x,y,r*1.5);
  ctx.shadowColor=C.orange; ctx.shadowBlur=22; ctx.fillStyle=C.orange; circle(x,y,r);
  ctx.shadowBlur=10;
  const g=ctx.createRadialGradient(x-r*0.3,y-r*0.3,1,x,y,r);
  g.addColorStop(0,C.white); g.addColorStop(0.4,C.gold); g.addColorStop(1,C.orange);
  ctx.fillStyle=g; circle(x,y,r*0.74);
  ctx.shadowBlur=0; ctx.fillStyle=C.white; circle(x-r*0.28,y-r*0.28,r*0.18);
  ctx.restore();
}

function drawDragon(t){
  const n=snake.length;
  const aura=0.6+0.4*Math.sin(t*6)+auraBoost;
  const pts=snake.map(s=>({x:pxX(s.x),y:pxY(s.y)}));
  const rAt=(i)=>(12.5-(i/(n-1||1))*6.5)*SCALE;
  // aura envelope
  ctx.save(); ctx.lineJoin="round"; ctx.lineCap="round";
  ctx.shadowColor=C.orange; ctx.shadowBlur=(18+10*aura)*SCALE/1;
  ctx.strokeStyle=`rgba(255,106,44,${0.16+0.12*aura})`;
  for(let i=0;i<n-1;i++){ ctx.lineWidth=(rAt(i)+3*SCALE)*2; segLine(pts[i],pts[i+1]); }
  ctx.restore();
  // green body
  ctx.save(); ctx.lineJoin="round"; ctx.lineCap="round";
  ctx.shadowColor=C.green; ctx.shadowBlur=14;
  for(let i=0;i<n-1;i++){
    const grad=ctx.createLinearGradient(pts[i].x,pts[i].y,pts[i+1].x,pts[i+1].y);
    grad.addColorStop(0,C.green); grad.addColorStop(1,C.emerald);
    ctx.strokeStyle=grad; ctx.lineWidth=rAt(i)*2; segLine(pts[i],pts[i+1]);
  }
  ctx.restore();
  // cores + mane
  for(let i=n-1;i>=1;i--){
    const p=pts[i], r=rAt(i);
    ctx.save(); ctx.shadowColor=C.green; ctx.shadowBlur=8;
    ctx.fillStyle="rgba(234,255,246,0.5)"; circle(p.x,p.y,r*0.42); ctx.restore();
    if(i<5) drawSpike(p.x,p.y,r);
  }
  drawHead(t);
}
function drawSpike(x,y,r){
  ctx.save(); ctx.fillStyle="rgba(255,207,58,0.55)"; ctx.shadowColor=C.gold; ctx.shadowBlur=8;
  ctx.beginPath(); ctx.moveTo(x,y-r-3*SCALE); ctx.lineTo(x-3*SCALE,y-r+2*SCALE); ctx.lineTo(x+3*SCALE,y-r+2*SCALE);
  ctx.closePath(); ctx.fill(); ctx.restore();
}
function drawHead(t){
  const h=snake[0], x=pxX(h.x), y=pxY(h.y), d=DIRV[dir], perp={x:-d.y,y:d.x}, s=SCALE;
  ctx.save();
  ctx.shadowColor=C.green; ctx.shadowBlur=22;
  const g=ctx.createRadialGradient(x-3*s,y-3*s,1,x,y,13*s);
  g.addColorStop(0,C.white); g.addColorStop(0.5,C.green); g.addColorStop(1,C.emerald);
  ctx.fillStyle=g; circle(x,y,12.5*s);
  ctx.shadowColor=C.red; ctx.shadowBlur=10; ctx.fillStyle=C.gold;
  const ex=x+d.x*3*s, ey=y+d.y*3*s, off=4.5*s;
  circle(ex+perp.x*off,ey+perp.y*off,2.4*s); circle(ex-perp.x*off,ey-perp.y*off,2.4*s);
  ctx.shadowBlur=6; ctx.strokeStyle=C.gold; ctx.lineWidth=2*s; ctx.lineCap="round";
  line(x-d.x*7*s+perp.x*4*s,y-d.y*7*s+perp.y*4*s, x-d.x*13*s+perp.x*7*s,y-d.y*13*s+perp.y*7*s);
  line(x-d.x*7*s-perp.x*4*s,y-d.y*7*s-perp.y*4*s, x-d.x*13*s-perp.x*7*s,y-d.y*13*s-perp.y*7*s);
  ctx.strokeStyle="rgba(234,255,246,0.8)"; ctx.lineWidth=1.5*s;
  line(x+d.x*9*s+perp.x*5*s,y+d.y*9*s+perp.y*5*s, x+d.x*16*s+perp.x*9*s,y+d.y*16*s+perp.y*9*s);
  line(x+d.x*9*s-perp.x*5*s,y+d.y*9*s-perp.y*5*s, x+d.x*16*s-perp.x*9*s,y+d.y*16*s-perp.y*9*s);
  ctx.restore();
}
function drawParticles(){
  for(const p of particles){
    ctx.save();
    if(p.kind==="dot"){ ctx.globalAlpha=Math.max(0,p.life); ctx.shadowColor=p.color; ctx.shadowBlur=12;
      ctx.fillStyle=p.color; circle(p.x,p.y,2.2*SCALE); }
    else { ctx.globalAlpha=Math.max(0,p.life*0.7); ctx.strokeStyle=p.color; ctx.lineWidth=2*SCALE;
      ctx.shadowColor=p.color; ctx.shadowBlur=12; ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.stroke(); }
    ctx.restore();
  }
}
function drawFrame(x0,y0,x1,y1){
  ctx.save(); ctx.strokeStyle=C.green; ctx.lineWidth=2; ctx.shadowColor=C.green; ctx.shadowBlur=12; ctx.globalAlpha=0.5;
  const L=26;
  const corners=[[x0,y0+L,x0,y0,x0+L,y0],[x1-L,y0,x1,y0,x1,y0+L],[x1,y1-L,x1,y1,x1-L,y1],[x0+L,y1,x0,y1,x0,y1-L]];
  ctx.beginPath(); for(const c of corners){ ctx.moveTo(c[0],c[1]); ctx.lineTo(c[2],c[3]); ctx.lineTo(c[4],c[5]); } ctx.stroke();
  ctx.restore();
}
function circle(x,y,r){ ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); }
function line(x1,y1,x2,y2){ ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); }
function segLine(a,b){ ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke(); }

/* ==========================================================
   Loop
   ========================================================== */
function loop(now){
  if(t0===undefined) t0=now;
  const dt=now-(lastTs||now); lastTs=now;
  if(state==="running"){ accMs+=dt; while(accMs>=moveInterval){ step(); accMs-=moveInterval; if(state!=="running") break; } }
  if(flash>0) flash=Math.max(0,flash-dt/600);
  if(auraBoost>0) auraBoost=Math.max(0,auraBoost-dt/500);
  updateParticles(dt);
  render(now);
  requestAnimationFrame(loop);
}

/* ==========================================================
   Input
   ========================================================== */
function setDir(d){
  if(state==="idle"||state==="over"){ startGame(); return; }
  if(state!=="running") return;
  if(d!==OPP[dir]) nextDir=d;
}
const KEY={ArrowLeft:"LEFT",a:"LEFT",A:"LEFT",ArrowRight:"RIGHT",d:"RIGHT",D:"RIGHT",
           ArrowUp:"UP",w:"UP",W:"UP",ArrowDown:"DOWN",s:"DOWN",S:"DOWN"};
window.addEventListener("keydown",(e)=>{
  if(e.key in KEY){ e.preventDefault(); setDir(KEY[e.key]); return; }
  if(e.code==="Space"||e.code==="Enter"){ e.preventDefault(); if(state==="idle"||state==="over") startGame(); return; }
  if(e.key==="p"||e.key==="P") togglePause();
});
// on-screen D-pad
document.querySelectorAll("[data-dir]").forEach(btn=>{
  const fire=(e)=>{ e.preventDefault(); setDir(btn.dataset.dir); };
  btn.addEventListener("click",fire);
  btn.addEventListener("touchstart",fire,{passive:false});
});
// tap overlay to start/resume (mobile-friendly)
overlay.addEventListener("click",()=>{
  if(state==="idle"||state==="over") startGame();
  else if(state==="paused") togglePause();
});

/* ==========================================================
   Boot + resize
   ========================================================== */
window.addEventListener("resize",()=>{
  if(state==="running"||state==="paused") layoutCanvas();   // keep the round, just refit canvas
  else { computeGrid(); resetState(); (state==="over"?overScreen:idleScreen)(); }
});
computeGrid();
resetState();
state="idle";
idleScreen();
requestAnimationFrame(loop);
