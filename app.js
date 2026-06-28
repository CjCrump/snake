/* ==========================================================
   Light Snake — Chance IT Studio
   Classic snake, repainted as a glowing neon dragon (DBZ ki-aura +
   UV spray-paint). Score = orbs eaten. Vanilla canvas, no deps.

   Fixed-timestep movement (rendering stays smooth at rAF rate so the
   aura / orb / particles animate continuously between moves).
   ========================================================== */

const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");

/* ---- grid ---- */
const COLS = 24, ROWS = 24, CELL = 25;
const LOGICAL = COLS * CELL;            // 600 logical px, square
const px = (c) => c * CELL + CELL / 2;  // grid cell -> center pixel

/* ---- palette ---- */
const C = {
  bg: "#08080a",
  grid: "rgba(0,255,157,0.06)",
  green: "#00ff9d",
  emerald: "#00995c",
  orange: "#ff6a2c",
  red: "#ff2d4f",
  gold: "#ffcf3a",
  white: "#eafff6",
};

/* ---- state ---- */
const LS_BEST = "lightsnake_best_v1";
let snake, dir, nextDir, orb, score, best, state;
let moveInterval, accMs, lastTs;
let particles, flash, auraBoost, t0;

best = Number(localStorage.getItem(LS_BEST) || 0);

/* ---- canvas sizing (crisp on HiDPI) ---- */
function sizeCanvas() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  canvas.width = LOGICAL * dpr;
  canvas.height = LOGICAL * dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

/* ---- helpers ---- */
const DIRV = { LEFT:{x:-1,y:0}, RIGHT:{x:1,y:0}, UP:{x:0,y:-1}, DOWN:{x:0,y:1} };
const OPP = { LEFT:"RIGHT", RIGHT:"LEFT", UP:"DOWN", DOWN:"UP" };

function reset() {
  snake = [{x:11,y:12},{x:10,y:12},{x:9,y:12},{x:8,y:12}]; // head first
  dir = "RIGHT"; nextDir = "RIGHT";
  score = 0;
  moveInterval = 135;
  accMs = 0;
  particles = [];
  flash = 0; auraBoost = 0;
  spawnOrb();
  updateHUD();
}

function spawnOrb() {
  const free = [];
  for (let x=0;x<COLS;x++) for (let y=0;y<ROWS;y++) {
    if (!snake.some(s=>s.x===x&&s.y===y)) free.push({x,y});
  }
  orb = free.length ? free[(Math.random()*free.length)|0] : null;
}

function updateHUD() {
  scoreEl.textContent = String(score);
  bestEl.textContent = String(best);
}

/* ---- overlays ---- */
function showOverlay(html) { overlay.innerHTML = html; overlay.style.display = "grid"; }
function hideOverlay() { overlay.style.display = "none"; }

function idleScreen() {
  showOverlay(`
    <div class="card">
      <div class="eyebrow">Chance IT Studio</div>
      <h1 class="title">LIGHT&nbsp;SNAKE</h1>
      <p class="lead">Pilot the dragon. Devour the orbs. Don't bite your own tail or hit the wall.</p>
      <p class="keys"><kbd>WASD</kbd> / <kbd>↑↓←→</kbd> move · <kbd>Space</kbd> start · <kbd>P</kbd> pause</p>
    </div>`);
}
function overScreen() {
  const nb = score > 0 && score >= best ? `<div class="best-flag">NEW BEST</div>` : "";
  showOverlay(`
    <div class="card">
      ${nb}
      <h1 class="title ko">K.O.</h1>
      <p class="lead">Orbs devoured: <strong>${score}</strong> &nbsp;·&nbsp; Best: <strong>${best}</strong></p>
      <p class="keys"><kbd>Space</kbd> go again</p>
    </div>`);
}
function pauseScreen() {
  showOverlay(`
    <div class="card">
      <h1 class="title">PAUSED</h1>
      <p class="keys"><kbd>P</kbd> resume</p>
    </div>`);
}

/* ---- game flow ---- */
function startGame() {
  reset();
  hideOverlay();
  state = "running";
  lastTs = performance.now();
}
function gameOver() {
  state = "over";
  if (score > best) { best = score; localStorage.setItem(LS_BEST, String(best)); }
  updateHUD();
  burst(px(snake[0].x), px(snake[0].y), C.red, 22); // death pop
  // Report to the games hub (no-op when not embedded).
  window.HubBridge?.score({ mode: "classic", points: score });
  window.HubBridge?.event("run_finished", { mode: "classic" });
  overScreen();
}
function togglePause() {
  if (state === "running") { state = "paused"; pauseScreen(); }
  else if (state === "paused") { state = "running"; hideOverlay(); lastTs = performance.now(); }
}

/* ---- one movement tick ---- */
function step() {
  if (nextDir !== OPP[dir]) dir = nextDir;           // commit at most one turn/tick
  const d = DIRV[dir];
  const head = { x: snake[0].x + d.x, y: snake[0].y + d.y };

  // wall or self collision
  if (head.x<0 || head.x>=COLS || head.y<0 || head.y>=ROWS ||
      snake.some(s=>s.x===head.x&&s.y===head.y)) {
    gameOver();
    return;
  }

  snake.unshift(head);

  if (orb && head.x===orb.x && head.y===orb.y) {
    score += 1;
    moveInterval = Math.max(70, 135 - score*3);      // ramp speed
    flash = 0.5; auraBoost = 1;                       // ki charge
    burst(px(orb.x), px(orb.y), C.gold, 14);
    ring(px(orb.x), px(orb.y), C.orange);
    spawnOrb();
    updateHUD();
  } else {
    snake.pop();
  }
}

/* ---- particles ---- */
function burst(x,y,color,n){
  for (let i=0;i<n;i++){
    const a=Math.random()*Math.PI*2, sp=1.4+Math.random()*2.6;
    particles.push({x,y,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp,life:1,kind:"dot",color});
  }
}
function ring(x,y,color){ particles.push({x,y,r:6,life:1,kind:"ring",color}); }
function updateParticles(dt){
  for (let i=particles.length-1;i>=0;i--){
    const p=particles[i];
    p.life -= dt/520;
    if (p.kind==="dot"){ p.x+=p.vx; p.y+=p.vy; p.vx*=0.94; p.vy*=0.94; }
    else { p.r += dt*0.09; }
    if (p.life<=0) particles.splice(i,1);
  }
}

/* ==========================================================
   Rendering
   ========================================================== */
function render(now) {
  const t = (now - t0) / 1000;
  ctx.clearRect(0,0,LOGICAL,LOGICAL);

  // background + UV grid + vignette
  ctx.fillStyle = C.bg; ctx.fillRect(0,0,LOGICAL,LOGICAL);
  const glow = ctx.createRadialGradient(LOGICAL/2,LOGICAL*0.42,40,LOGICAL/2,LOGICAL/2,LOGICAL*0.7);
  glow.addColorStop(0,"rgba(0,255,157,0.06)"); glow.addColorStop(1,"rgba(0,0,0,0)");
  ctx.fillStyle = glow; ctx.fillRect(0,0,LOGICAL,LOGICAL);
  ctx.strokeStyle = C.grid; ctx.lineWidth = 1;
  ctx.beginPath();
  for (let i=1;i<COLS;i++){ ctx.moveTo(i*CELL,0); ctx.lineTo(i*CELL,LOGICAL); ctx.moveTo(0,i*CELL); ctx.lineTo(LOGICAL,i*CELL); }
  ctx.stroke();

  if (orb) drawOrb(px(orb.x), px(orb.y), t);
  drawDragon(t);
  drawParticles();

  // ki flash on eat
  if (flash>0){ ctx.fillStyle=`rgba(0,255,157,${flash*0.18})`; ctx.fillRect(0,0,LOGICAL,LOGICAL); }

  drawFrame();
}

function drawOrb(x,y,t){
  const pulse = 1 + Math.sin(t*3.4)*0.12;
  const r = 9 * pulse;
  ctx.save();
  ctx.shadowColor = C.red; ctx.shadowBlur = 34;
  ctx.fillStyle = "rgba(255,45,79,0.55)"; circle(x,y,r*1.5);
  ctx.shadowColor = C.orange; ctx.shadowBlur = 22;
  ctx.fillStyle = C.orange; circle(x,y,r);
  ctx.shadowBlur = 10;
  const g = ctx.createRadialGradient(x-r*0.3,y-r*0.3,1,x,y,r);
  g.addColorStop(0,C.white); g.addColorStop(0.4,C.gold); g.addColorStop(1,C.orange);
  ctx.fillStyle = g; circle(x,y,r*0.74);
  ctx.shadowBlur = 0; ctx.fillStyle = C.white; circle(x-r*0.28,y-r*0.28,r*0.18);
  ctx.restore();
}

function drawDragon(t){
  const n = snake.length;
  const aura = 0.6 + 0.4*Math.sin(t*6) + auraBoost; // DBZ flicker
  const pts = snake.map(s => ({ x: px(s.x), y: px(s.y) }));
  const rAt = (i) => 12.5 - (i/(n-1||1))*6.5;        // head .. tail taper

  // pass 1 — ki aura envelope (orange/red), thick + blurred
  ctx.save();
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.shadowColor = C.orange; ctx.shadowBlur = 18 + 10*aura;
  ctx.strokeStyle = `rgba(255,106,44,${0.16+0.12*aura})`;
  for (let i=0;i<n-1;i++){ ctx.lineWidth = (rAt(i)+3)*2; segLine(pts[i],pts[i+1]); }
  ctx.restore();

  // pass 2 — green body core, tapering
  ctx.save();
  ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.shadowColor = C.green; ctx.shadowBlur = 14;
  for (let i=0;i<n-1;i++){
    const grad = ctx.createLinearGradient(pts[i].x,pts[i].y,pts[i+1].x,pts[i+1].y);
    grad.addColorStop(0, C.green); grad.addColorStop(1, C.emerald);
    ctx.strokeStyle = grad; ctx.lineWidth = rAt(i)*2;
    segLine(pts[i],pts[i+1]);
  }
  ctx.restore();

  // pass 3 — bright cores + mane
  for (let i=n-1;i>=1;i--){
    const p = pts[i], r = rAt(i);
    ctx.save();
    ctx.shadowColor = C.green; ctx.shadowBlur = 8;
    ctx.fillStyle = "rgba(234,255,246,0.5)"; circle(p.x,p.y,r*0.42);
    ctx.restore();
    if (i<5) drawSpike(p.x,p.y,r);
  }
  drawHead(t, aura);
}
function segLine(a,b){ ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke(); }

function drawSpike(x,y,r){
  ctx.save();
  ctx.fillStyle = "rgba(255,207,58,0.55)";
  ctx.shadowColor = C.gold; ctx.shadowBlur = 8;
  ctx.beginPath();
  ctx.moveTo(x, y-r-3); ctx.lineTo(x-3, y-r+2); ctx.lineTo(x+3, y-r+2); ctx.closePath();
  ctx.fill(); ctx.restore();
}

function drawHead(t, aura){
  const h = snake[0]; const x = px(h.x), y = px(h.y);
  const d = DIRV[dir];
  const perp = { x:-d.y, y:d.x };
  ctx.save();
  // brighter head aura
  ctx.shadowColor = C.green; ctx.shadowBlur = 22;
  const g = ctx.createRadialGradient(x-3,y-3,1,x,y,13);
  g.addColorStop(0,C.white); g.addColorStop(0.5,C.green); g.addColorStop(1,C.emerald);
  ctx.fillStyle = g; circle(x,y,12.5);
  // eyes
  ctx.shadowColor = C.red; ctx.shadowBlur = 10; ctx.fillStyle = C.gold;
  const ex = x + d.x*3, ey = y + d.y*3, off = 4.5;
  circle(ex+perp.x*off, ey+perp.y*off, 2.4);
  circle(ex-perp.x*off, ey-perp.y*off, 2.4);
  // horns (back) + whiskers (forward)
  ctx.shadowBlur = 6; ctx.strokeStyle = C.gold; ctx.lineWidth = 2; ctx.lineCap="round";
  line(x-d.x*7+perp.x*4, y-d.y*7+perp.y*4, x-d.x*13+perp.x*7, y-d.y*13+perp.y*7);
  line(x-d.x*7-perp.x*4, y-d.y*7-perp.y*4, x-d.x*13-perp.x*7, y-d.y*13-perp.y*7);
  ctx.strokeStyle = "rgba(234,255,246,0.8)"; ctx.lineWidth = 1.5;
  line(x+d.x*9+perp.x*5, y+d.y*9+perp.y*5, x+d.x*16+perp.x*9, y+d.y*16+perp.y*9);
  line(x+d.x*9-perp.x*5, y+d.y*9-perp.y*5, x+d.x*16-perp.x*9, y+d.y*16-perp.y*9);
  ctx.restore();
}

function drawParticles(){
  for (const p of particles){
    ctx.save();
    if (p.kind==="dot"){
      ctx.globalAlpha = Math.max(0,p.life);
      ctx.shadowColor = p.color; ctx.shadowBlur = 12;
      ctx.fillStyle = p.color; circle(p.x,p.y,2.2);
    } else {
      ctx.globalAlpha = Math.max(0,p.life*0.7);
      ctx.strokeStyle = p.color; ctx.lineWidth = 2;
      ctx.shadowColor = p.color; ctx.shadowBlur = 12;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.r,0,Math.PI*2); ctx.stroke();
    }
    ctx.restore();
  }
}

function drawFrame(){
  ctx.save();
  ctx.strokeStyle = C.green; ctx.lineWidth = 2;
  ctx.shadowColor = C.green; ctx.shadowBlur = 12;
  ctx.globalAlpha = 0.5;
  const m = 4, L = 26, S = LOGICAL;
  const seg = [[m,m+L,m,m,m+L,m],[S-m-L,m,S-m,m,S-m,m+L],
               [S-m,S-m-L,S-m,S-m,S-m-L,S-m],[m+L,S-m,m,S-m,m,S-m-L]];
  ctx.beginPath();
  for (const s of seg){ ctx.moveTo(s[0],s[1]); ctx.lineTo(s[2],s[3]); ctx.lineTo(s[4],s[5]); }
  ctx.stroke();
  ctx.restore();
}

/* tiny canvas helpers */
function circle(x,y,r){ ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill(); }
function line(x1,y1,x2,y2){ ctx.beginPath(); ctx.moveTo(x1,y1); ctx.lineTo(x2,y2); ctx.stroke(); }

/* ==========================================================
   Main loop
   ========================================================== */
function loop(now){
  if (t0===undefined) t0 = now;
  const dt = now - (lastTs||now);
  lastTs = now;

  if (state==="running"){
    accMs += dt;
    while (accMs >= moveInterval){ step(); accMs -= moveInterval; if (state!=="running") break; }
  }
  // decay fx
  if (flash>0) flash = Math.max(0, flash - dt/600);
  if (auraBoost>0) auraBoost = Math.max(0, auraBoost - dt/500);
  updateParticles(dt);

  render(now);
  requestAnimationFrame(loop);
}

/* ==========================================================
   Input
   ========================================================== */
function setDir(d){
  if (state==="idle" || state==="over"){ startGame(); }
  if (state!=="running") return;
  if (d !== OPP[dir]) nextDir = d;
}
const KEY = { ArrowLeft:"LEFT", a:"LEFT", A:"LEFT", ArrowRight:"RIGHT", d:"RIGHT", D:"RIGHT",
              ArrowUp:"UP", w:"UP", W:"UP", ArrowDown:"DOWN", s:"DOWN", S:"DOWN" };

window.addEventListener("keydown",(e)=>{
  if (e.key in KEY){ e.preventDefault(); setDir(KEY[e.key]); return; }
  if (e.code==="Space" || e.code==="Enter"){
    e.preventDefault();
    if (state==="idle" || state==="over") startGame();
    return;
  }
  if (e.key==="p" || e.key==="P"){ togglePause(); }
});

// on-screen D-pad (mobile) — wired in index.html via data-dir
document.querySelectorAll("[data-dir]").forEach(btn=>{
  const fire = (e)=>{ e.preventDefault(); setDir(btn.dataset.dir); };
  btn.addEventListener("click", fire);
  btn.addEventListener("touchstart", fire, {passive:false});
});

/* ==========================================================
   Boot
   ========================================================== */
window.addEventListener("resize", sizeCanvas);
sizeCanvas();
reset();
state = "idle";
idleScreen();
requestAnimationFrame(loop);
