/* ==========================================================
   Light Snake — Chance IT Studio
   Neon dragon snake. Score = orbs eaten. Vanilla canvas, no deps.

   Screens (body[data-screen]): menu owns mode / speed / best; play is
   a full-bleed field under the minimal strip. Game-over shows a run
   summary with Play again / Main menu. Same shell as the hub games.

   Modes:  classic   — open field.
           obstacles — static rock blocks litter the field; clipping
                       one ends the run.
   Speed:  segmented tier sets the starting pace + ramp + floor; the
           dragon still accelerates as it eats.
   ========================================================== */

/* ---- DOM ---- */
const stage = document.getElementById("stage");
const canvas = document.getElementById("game");
const ctx = canvas.getContext("2d");
const overlay = document.getElementById("overlay");
const scoreEl = document.getElementById("score");
const bestEl = document.getElementById("best");

const menuHint = document.getElementById("menuHint");
const bestMode = document.getElementById("bestMode");
const bestValue = document.getElementById("bestValue");
const startBtn = document.getElementById("startBtn");
const muteBtn = document.getElementById("muteBtn");
const modeRadios = [...document.querySelectorAll('input[name="mode"]')];
const speedRadios = [...document.querySelectorAll('input[name="speed"]')];

/* ---- palette ---- */
const C = {
  bg:"#08080a", grid:"rgba(0,255,157,0.06)",
  green:"#00ff9d", emerald:"#00995c", orange:"#ff6a2c", red:"#ff2d4f",
  gold:"#ffcf3a", white:"#eafff6", rock:"#16242a",
};

/* ---- mode / speed config ---- */
const MODES = {
  classic:   { label:"Classic",   hint:"Pilot the dragon, devour the orbs. Don't bite your tail or hit the wall." },
  obstacles: { label:"Obstacles", hint:"Same hunt — now the field is littered with rock. Clip a wall and it's over." },
};
const SPEEDS = {
  cruise:  { label:"Cruise",  base:165, step:2.5, floor:95 },
  classic: { label:"Classic", base:135, step:3,   floor:70 },
  blitz:   { label:"Blitz",   base:110, step:3.5, floor:55 },
};
const bestKey = (m) => `lightsnake_best_${m}_v1`;
const LS_SETTINGS = "lightsnake_settings_v1";
const LS_BEST_OLD = "lightsnake_best_v1";   // migrate prior single best → classic

/* ---- grid (dynamic — fills the stage) ---- */
let viewW, viewH, CELL, COLS, ROWS, offX, offY, SCALE;
const pxX = (cx) => offX + cx * CELL + CELL / 2;
const pxY = (cy) => offY + cy * CELL + CELL / 2;

/* ---- state ---- */
let snake, dir, nextDir, orb, obstacles, score, best, state;
let mode = "classic", speedCfg = SPEEDS.classic;
let moveInterval, accMs, lastTs;
let particles, flash, auraBoost, t0;
let muted = false;

/* ---- helpers ---- */
const DIRV = { LEFT:{x:-1,y:0}, RIGHT:{x:1,y:0}, UP:{x:0,y:-1}, DOWN:{x:0,y:1} };
const OPP = { LEFT:"RIGHT", RIGHT:"LEFT", UP:"DOWN", DOWN:"UP" };
const selMode = () => (modeRadios.find((r) => r.checked) || modeRadios[0]).value;
const selSpeed = () => (speedRadios.find((r) => r.checked) || speedRadios[1]).value;

/* ---- sizing ---- */
function layoutCanvas() {
  viewW = stage.clientWidth;
  viewH = stage.clientHeight;
  if (!viewW || !viewH) return;
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
  if (!w || !h) return;
  CELL = Math.max(20, Math.min(34, Math.round(Math.min(w, h) / 20)));
  COLS = Math.max(8, Math.floor(w / CELL));
  ROWS = Math.max(8, Math.floor(h / CELL));
  SCALE = CELL / 25;
  layoutCanvas();
}

/* ---- sound (synth, no assets) ---- */
let actx = null;
function ensureAudio() {
  if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch { actx = null; } }
  if (actx && actx.state === "suspended") actx.resume();
}
function tone({ freq, dur = 0.08, type = "triangle", gain = 0.14, slideTo = null }) {
  if (muted || !actx) return;
  const t = actx.currentTime, o = actx.createOscillator(), a = actx.createGain();
  o.type = type; o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t + dur);
  a.gain.setValueAtTime(0.0001, t);
  a.gain.exponentialRampToValueAtTime(gain, t + 0.008);
  a.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(a).connect(actx.destination); o.start(t); o.stop(t + dur + 0.02);
}
const sfx = {
  eat:  () => tone({ freq: 660, slideTo: 990, dur: 0.09, type: "triangle", gain: 0.14 }),
  die:  () => tone({ freq: 220, slideTo: 70,  dur: 0.45, type: "sawtooth", gain: 0.16 }),
  best: () => [660, 990, 1320].forEach((f, i) => setTimeout(() => tone({ freq: f, dur: 0.13, type: "triangle", gain: 0.15 }), i * 110)),
};

/* ---- settings + best ---- */
function loadSettings() {
  try {
    const s = JSON.parse(localStorage.getItem(LS_SETTINGS) || "{}");
    muted = !!s.muted;
    if (s.mode && MODES[s.mode]) (modeRadios.find((r) => r.value === s.mode) || {}).checked = true;
    if (s.speed && SPEEDS[s.speed]) (speedRadios.find((r) => r.value === s.speed) || {}).checked = true;
  } catch {}
}
function saveSettings() {
  try { localStorage.setItem(LS_SETTINGS, JSON.stringify({ mode: selMode(), speed: selSpeed(), muted })); } catch {}
}
function loadBest(m) {
  let v = Number(localStorage.getItem(bestKey(m)) || 0);
  if (!v && m === "classic") v = Number(localStorage.getItem(LS_BEST_OLD) || 0);
  return v;
}
function saveBest(m, v) { try { localStorage.setItem(bestKey(m), String(v)); } catch {} }
function refreshMenuBest() {
  const m = selMode(), b = loadBest(m);
  bestMode.textContent = MODES[m].label;
  bestValue.innerHTML = b > 0 ? `${b} orb${b === 1 ? "" : "s"}` : `<span class="dim">no run yet</span>`;
  menuHint.textContent = MODES[m].hint;
}

/* ---- field setup ---- */
function buildObstacles() {
  obstacles = [];
  if (mode !== "obstacles") return;
  const cx = Math.floor(COLS / 2), cy = Math.floor(ROWS / 2);
  const inLane = (x, y) => Math.abs(y - cy) <= 1 && x >= cx - 6 && x <= cx + 3;  // keep the start corridor clear
  const count = Math.max(6, Math.min(18, Math.round(COLS * ROWS * 0.012)));
  let tries = 0;
  while (obstacles.length < count && tries < count * 50) {
    tries++;
    const x = 2 + ((Math.random() * (COLS - 4)) | 0);
    const y = 2 + ((Math.random() * (ROWS - 4)) | 0);
    if (inLane(x, y)) continue;
    if (obstacles.some((o) => o.x === x && o.y === y)) continue;
    obstacles.push({ x, y });
  }
}
function spawnOrb() {
  const free = [];
  for (let x = 0; x < COLS; x++) for (let y = 0; y < ROWS; y++)
    if (!snake.some((s) => s.x === x && s.y === y) && !obstacles.some((o) => o.x === x && o.y === y))
      free.push({ x, y });
  orb = free.length ? free[(Math.random() * free.length) | 0] : null;
}
function resetState() {
  mode = selMode(); speedCfg = SPEEDS[selSpeed()];
  const cx = Math.floor(COLS / 2), cy = Math.floor(ROWS / 2);
  snake = [{ x:cx, y:cy }, { x:cx-1, y:cy }, { x:cx-2, y:cy }, { x:cx-3, y:cy }];
  dir = "RIGHT"; nextDir = "RIGHT";
  score = 0; moveInterval = speedCfg.base; accMs = 0;
  particles = []; flash = 0; auraBoost = 0;
  buildObstacles(); spawnOrb(); updateHUD();
}
function updateHUD() {
  scoreEl.textContent = String(score);
  bestEl.textContent = String(Math.max(best, score));
}

/* ==========================================================
   Flow
   ========================================================== */
function setScreen(s) { document.body.dataset.screen = s; }

function enterPlay() {
  ensureAudio();
  best = loadBest(selMode());
  setScreen("play");
  computeGrid();
  resetState();
  state = "ready";
  showReady();
}
function startRun() {
  hideOverlay();
  state = "running";
  lastTs = performance.now();
}
function againRun() {
  resetState();
  hideOverlay();
  state = "running";
  lastTs = performance.now();
}
function gameOver() {
  state = "over";
  sfx.die();
  burst(pxX(snake[0].x), pxY(snake[0].y), C.red, 22);
  flash = 0.6;
  const newBest = score > best;
  if (newBest) { best = score; saveBest(mode, best); sfx.best(); }
  updateHUD();
  window.HubBridge?.score({ mode, points: score });
  window.HubBridge?.event("run_finished", { mode });
  showOver(newBest);
}
function togglePause() {
  if (state === "running") { state = "paused"; showPause(); }
  else if (state === "paused") { hideOverlay(); state = "running"; lastTs = performance.now(); }
}
function goMenu() {
  state = "menu";
  hideOverlay();
  setScreen("menu");
  refreshMenuBest();
}

/* ---- overlays ---- */
function showOverlay(html, ready) {
  overlay.className = "overlay" + (ready ? " is-ready" : "");
  overlay.innerHTML = html;
  overlay.style.display = "grid";
}
function hideOverlay() { overlay.style.display = "none"; }

const HINT_START = `
  <span class="hint--desktop"><kbd>WASD</kbd> / <kbd>&#8593;&#8595;&#8592;&#8594;</kbd> to launch &middot; <kbd>P</kbd> pause</span>
  <span class="hint--mobile">D&#8209;pad or tap to launch</span>`;

function showReady() {
  showOverlay(`<div class="card">
    <div class="eyebrow">${MODES[mode].label} &middot; ${speedCfg.label}</div>
    <p class="keys">${HINT_START}</p>
  </div>`, true);
}
function showPause() {
  showOverlay(`<div class="card">
    <h1 class="title">PAUSED</h1>
    <div class="actions">
      <button class="btn btn--primary" data-action="resume">Resume</button>
      <button class="btn btn--ghost" data-action="menu">Main menu</button>
    </div>
    <p class="keys"><span class="hint--desktop"><kbd>P</kbd> resume &middot; <kbd>Esc</kbd> menu</span><span class="hint--mobile">Tap to resume</span></p>
  </div>`);
}
function showOver(newBest) {
  const flag = newBest ? `<div class="best-flag">NEW BEST</div>` : "";
  showOverlay(`<div class="card">
    ${flag}<h1 class="title ko">K.O.</h1>
    <div class="results">
      <div class="results__cell"><div class="results__k">Orbs</div><div class="results__v">${score}</div></div>
      <div class="results__cell"><div class="results__k">Best · ${MODES[mode].label}</div><div class="results__v">${best}</div></div>
    </div>
    <div class="actions">
      <button class="btn btn--primary" data-action="again">Play again</button>
      <button class="btn btn--ghost" data-action="menu">Main menu</button>
    </div>
    <p class="keys"><span class="hint--desktop"><kbd>Space</kbd> again &middot; <kbd>Esc</kbd> menu</span><span class="hint--mobile">Tap to go again</span></p>
  </div>`);
}

/* ---- tick ---- */
function step() {
  if (nextDir !== OPP[dir]) dir = nextDir;
  const d = DIRV[dir];
  const head = { x: snake[0].x + d.x, y: snake[0].y + d.y };
  if (head.x < 0 || head.x >= COLS || head.y < 0 || head.y >= ROWS ||
      snake.some((s) => s.x === head.x && s.y === head.y) ||
      obstacles.some((o) => o.x === head.x && o.y === head.y)) { gameOver(); return; }
  snake.unshift(head);
  if (orb && head.x === orb.x && head.y === orb.y) {
    score += 1;
    moveInterval = Math.max(speedCfg.floor, speedCfg.base - score * speedCfg.step);
    flash = 0.5; auraBoost = 1;
    burst(pxX(orb.x), pxY(orb.y), C.gold, 14); ring(pxX(orb.x), pxY(orb.y), C.orange);
    sfx.eat(); spawnOrb(); updateHUD();
  } else snake.pop();
}

/* ---- particles ---- */
function burst(x, y, color, n) {
  for (let i = 0; i < n; i++) {
    const a = Math.random() * Math.PI * 2, sp = (1.4 + Math.random() * 2.6) * SCALE;
    particles.push({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: 1, kind: "dot", color });
  }
}
function ring(x, y, color) { particles.push({ x, y, r: 6 * SCALE, life: 1, kind: "ring", color }); }
function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i]; p.life -= dt / 520;
    if (p.kind === "dot") { p.x += p.vx; p.y += p.vy; p.vx *= 0.94; p.vy *= 0.94; } else p.r += dt * 0.09 * SCALE;
    if (p.life <= 0) particles.splice(i, 1);
  }
}

/* ==========================================================
   Render
   ========================================================== */
function roundRectPath(x, y, w, h, r) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
}
function render(now) {
  const t = (now - t0) / 1000;
  ctx.clearRect(0, 0, viewW, viewH);
  ctx.fillStyle = C.bg; ctx.fillRect(0, 0, viewW, viewH);
  const glow = ctx.createRadialGradient(viewW/2, viewH*0.4, 30, viewW/2, viewH/2, Math.max(viewW, viewH)*0.6);
  glow.addColorStop(0, "rgba(0,255,157,0.05)"); glow.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = glow; ctx.fillRect(0, 0, viewW, viewH);

  const gx0 = offX, gy0 = offY, gx1 = offX + COLS*CELL, gy1 = offY + ROWS*CELL;
  ctx.strokeStyle = C.grid; ctx.lineWidth = 1; ctx.beginPath();
  for (let i = 0; i <= COLS; i++) { ctx.moveTo(gx0 + i*CELL, gy0); ctx.lineTo(gx0 + i*CELL, gy1); }
  for (let j = 0; j <= ROWS; j++) { ctx.moveTo(gx0, gy0 + j*CELL); ctx.lineTo(gx1, gy0 + j*CELL); }
  ctx.stroke();

  drawObstacles();
  if (orb) drawOrb(pxX(orb.x), pxY(orb.y), t);
  drawDragon(t);
  drawParticles();
  if (flash > 0) { ctx.fillStyle = `rgba(0,255,157,${flash*0.18})`; ctx.fillRect(0, 0, viewW, viewH); }
  drawFrame(gx0, gy0, gx1, gy1);
}

function drawObstacles() {
  if (!obstacles || !obstacles.length) return;
  for (const o of obstacles) {
    const x = offX + o.x*CELL, y = offY + o.y*CELL, s = CELL;
    ctx.save();
    ctx.shadowColor = C.red; ctx.shadowBlur = 12;
    ctx.fillStyle = C.rock; roundRectPath(x + 2, y + 2, s - 4, s - 4, 4 * SCALE); ctx.fill();
    ctx.shadowBlur = 0; ctx.strokeStyle = C.orange; ctx.lineWidth = 2; ctx.globalAlpha = 0.85;
    roundRectPath(x + 2, y + 2, s - 4, s - 4, 4 * SCALE); ctx.stroke();
    ctx.globalAlpha = 0.5; ctx.strokeStyle = "rgba(255,106,44,0.6)"; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(x + 6, y + s - 7); ctx.lineTo(x + s - 7, y + 6); ctx.stroke();
    ctx.restore();
  }
}

function drawOrb(x, y, t) {
  const r = 9*SCALE*(1 + Math.sin(t*3.4)*0.12);
  ctx.save();
  ctx.shadowColor = C.red; ctx.shadowBlur = 34; ctx.fillStyle = "rgba(255,45,79,0.55)"; circle(x, y, r*1.5);
  ctx.shadowColor = C.orange; ctx.shadowBlur = 22; ctx.fillStyle = C.orange; circle(x, y, r);
  ctx.shadowBlur = 10;
  const g = ctx.createRadialGradient(x - r*0.3, y - r*0.3, 1, x, y, r);
  g.addColorStop(0, C.white); g.addColorStop(0.4, C.gold); g.addColorStop(1, C.orange);
  ctx.fillStyle = g; circle(x, y, r*0.74);
  ctx.shadowBlur = 0; ctx.fillStyle = C.white; circle(x - r*0.28, y - r*0.28, r*0.18);
  ctx.restore();
}

function drawDragon(t) {
  const n = snake.length;
  const aura = 0.6 + 0.4*Math.sin(t*6) + auraBoost;
  const pts = snake.map((s) => ({ x: pxX(s.x), y: pxY(s.y) }));
  const rAt = (i) => (12.5 - (i / (n - 1 || 1)) * 6.5) * SCALE;
  ctx.save(); ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.shadowColor = C.orange; ctx.shadowBlur = (18 + 10*aura)*SCALE;
  ctx.strokeStyle = `rgba(255,106,44,${0.16 + 0.12*aura})`;
  for (let i = 0; i < n - 1; i++) { ctx.lineWidth = (rAt(i) + 3*SCALE)*2; segLine(pts[i], pts[i+1]); }
  ctx.restore();
  ctx.save(); ctx.lineJoin = "round"; ctx.lineCap = "round";
  ctx.shadowColor = C.green; ctx.shadowBlur = 14;
  for (let i = 0; i < n - 1; i++) {
    const grad = ctx.createLinearGradient(pts[i].x, pts[i].y, pts[i+1].x, pts[i+1].y);
    grad.addColorStop(0, C.green); grad.addColorStop(1, C.emerald);
    ctx.strokeStyle = grad; ctx.lineWidth = rAt(i)*2; segLine(pts[i], pts[i+1]);
  }
  ctx.restore();
  for (let i = n - 1; i >= 1; i--) {
    const p = pts[i], r = rAt(i);
    ctx.save(); ctx.shadowColor = C.green; ctx.shadowBlur = 8;
    ctx.fillStyle = "rgba(234,255,246,0.5)"; circle(p.x, p.y, r*0.42); ctx.restore();
    if (i < 5) drawSpike(p.x, p.y, r);
  }
  drawHead(t);
}
function drawSpike(x, y, r) {
  ctx.save(); ctx.fillStyle = "rgba(255,207,58,0.55)"; ctx.shadowColor = C.gold; ctx.shadowBlur = 8;
  ctx.beginPath(); ctx.moveTo(x, y - r - 3*SCALE); ctx.lineTo(x - 3*SCALE, y - r + 2*SCALE); ctx.lineTo(x + 3*SCALE, y - r + 2*SCALE);
  ctx.closePath(); ctx.fill(); ctx.restore();
}
function drawHead(t) {
  const h = snake[0], x = pxX(h.x), y = pxY(h.y), d = DIRV[dir], perp = { x:-d.y, y:d.x }, s = SCALE;
  ctx.save();
  ctx.shadowColor = C.green; ctx.shadowBlur = 22;
  const g = ctx.createRadialGradient(x - 3*s, y - 3*s, 1, x, y, 13*s);
  g.addColorStop(0, C.white); g.addColorStop(0.5, C.green); g.addColorStop(1, C.emerald);
  ctx.fillStyle = g; circle(x, y, 12.5*s);
  ctx.shadowColor = C.red; ctx.shadowBlur = 10; ctx.fillStyle = C.gold;
  const ex = x + d.x*3*s, ey = y + d.y*3*s, off = 4.5*s;
  circle(ex + perp.x*off, ey + perp.y*off, 2.4*s); circle(ex - perp.x*off, ey - perp.y*off, 2.4*s);
  ctx.shadowBlur = 6; ctx.strokeStyle = C.gold; ctx.lineWidth = 2*s; ctx.lineCap = "round";
  line(x - d.x*7*s + perp.x*4*s, y - d.y*7*s + perp.y*4*s, x - d.x*13*s + perp.x*7*s, y - d.y*13*s + perp.y*7*s);
  line(x - d.x*7*s - perp.x*4*s, y - d.y*7*s - perp.y*4*s, x - d.x*13*s - perp.x*7*s, y - d.y*13*s - perp.y*7*s);
  ctx.strokeStyle = "rgba(234,255,246,0.8)"; ctx.lineWidth = 1.5*s;
  line(x + d.x*9*s + perp.x*5*s, y + d.y*9*s + perp.y*5*s, x + d.x*16*s + perp.x*9*s, y + d.y*16*s + perp.y*9*s);
  line(x + d.x*9*s - perp.x*5*s, y + d.y*9*s - perp.y*5*s, x + d.x*16*s - perp.x*9*s, y + d.y*16*s - perp.y*9*s);
  ctx.restore();
}
function drawParticles() {
  for (const p of particles) {
    ctx.save();
    if (p.kind === "dot") { ctx.globalAlpha = Math.max(0, p.life); ctx.shadowColor = p.color; ctx.shadowBlur = 12;
      ctx.fillStyle = p.color; circle(p.x, p.y, 2.2*SCALE); }
    else { ctx.globalAlpha = Math.max(0, p.life*0.7); ctx.strokeStyle = p.color; ctx.lineWidth = 2*SCALE;
      ctx.shadowColor = p.color; ctx.shadowBlur = 12; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, Math.PI*2); ctx.stroke(); }
    ctx.restore();
  }
}
function drawFrame(x0, y0, x1, y1) {
  ctx.save(); ctx.strokeStyle = C.green; ctx.lineWidth = 2; ctx.shadowColor = C.green; ctx.shadowBlur = 12; ctx.globalAlpha = 0.5;
  const L = 26;
  const corners = [[x0,y0+L,x0,y0,x0+L,y0],[x1-L,y0,x1,y0,x1,y0+L],[x1,y1-L,x1,y1,x1-L,y1],[x0+L,y1,x0,y1,x0,y1-L]];
  ctx.beginPath(); for (const c of corners) { ctx.moveTo(c[0],c[1]); ctx.lineTo(c[2],c[3]); ctx.lineTo(c[4],c[5]); } ctx.stroke();
  ctx.restore();
}
function circle(x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI*2); ctx.fill(); }
function line(x1, y1, x2, y2) { ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke(); }
function segLine(a, b) { ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke(); }

/* ==========================================================
   Loop
   ========================================================== */
function loop(now) {
  if (t0 === undefined) t0 = now;
  requestAnimationFrame(loop);
  if (document.body.dataset.screen !== "play" || !viewW) { lastTs = now; return; }
  const dt = now - (lastTs || now); lastTs = now;
  if (state === "running") { accMs += dt; while (accMs >= moveInterval) { step(); accMs -= moveInterval; if (state !== "running") break; } }
  if (flash > 0) flash = Math.max(0, flash - dt/600);
  if (auraBoost > 0) auraBoost = Math.max(0, auraBoost - dt/500);
  updateParticles(dt);
  render(now);
}

/* ==========================================================
   Input
   ========================================================== */
function setDir(d) {
  if (state === "ready") { if (d !== OPP[dir]) { dir = d; nextDir = d; } startRun(); return; }
  if (state !== "running") return;
  if (d !== OPP[dir]) nextDir = d;
}
const KEY = { ArrowLeft:"LEFT", a:"LEFT", A:"LEFT", ArrowRight:"RIGHT", d:"RIGHT", D:"RIGHT",
              ArrowUp:"UP", w:"UP", W:"UP", ArrowDown:"DOWN", s:"DOWN", S:"DOWN" };
window.addEventListener("keydown", (e) => {
  if (document.body.dataset.screen !== "play") return;
  if (e.key in KEY) { e.preventDefault(); setDir(KEY[e.key]); return; }
  if (e.code === "Space" || e.code === "Enter") {
    e.preventDefault();
    if (state === "ready") startRun();
    else if (state === "over") againRun();
    return;
  }
  if (e.key === "p" || e.key === "P") { if (state === "running" || state === "paused") togglePause(); return; }
  if (e.key === "Escape") { e.preventDefault(); goMenu(); }
});

// on-screen D-pad
document.querySelectorAll("[data-dir]").forEach((btn) => {
  const fire = (e) => { e.preventDefault(); setDir(btn.dataset.dir); };
  btn.addEventListener("click", fire);
  btn.addEventListener("touchstart", fire, { passive: false });
});

// overlay: action buttons + tap-to-advance
overlay.addEventListener("click", (e) => {
  const b = e.target.closest("[data-action]");
  if (b) {
    const a = b.dataset.action;
    if (a === "again") againRun();
    else if (a === "resume") togglePause();
    else if (a === "menu") goMenu();
    return;
  }
  if (state === "ready") startRun();
  else if (state === "paused") togglePause();
  else if (state === "over") againRun();
});

// menu controls
startBtn.addEventListener("click", enterPlay);
muteBtn.addEventListener("click", () => {
  ensureAudio();
  muted = !muted;
  muteBtn.classList.toggle("is-muted", muted);
  muteBtn.setAttribute("aria-label", muted ? "Sound off" : "Sound on");
  if (!muted) sfx.eat();
  saveSettings();
});
modeRadios.forEach((r) => r.addEventListener("change", () => { refreshMenuBest(); saveSettings(); }));
speedRadios.forEach((r) => r.addEventListener("change", saveSettings));

/* ==========================================================
   Boot + resize
   ========================================================== */
window.addEventListener("resize", () => {
  if (document.body.dataset.screen !== "play") return;
  if (state === "running" || state === "paused") layoutCanvas();   // keep the round, just refit
  else { computeGrid(); resetState(); state === "over" ? null : showReady(); }
});

loadSettings();
muteBtn.classList.toggle("is-muted", muted);
refreshMenuBest();
requestAnimationFrame(loop);
