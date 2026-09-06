// Star Fox style HUD. DOM for typography, canvas for gauges / radar / reticles.
import { injectStyles, FONT } from './styles.js';
import { createPortrait } from './portrait.js';

const W = 1280, H = 720;
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const el = (tag, cls, parent, html) => { const e = document.createElement(tag); if (cls) e.className = cls; if (html != null) e.innerHTML = html; parent?.appendChild(e); return e; };
const mkCanvas = (w, h, dpr) => { const c = document.createElement('canvas'); c.width = w * dpr; c.height = h * dpr; c.style.width = w + 'px'; c.style.height = h + 'px'; return c; };

// easing: overshoot (back-out) and smooth in
const easeOutBack = (t, s = 1.7) => { t = clamp(t, 0, 1) - 1; return t * t * ((s + 1) * t + s) + 1; };
const easeInCubic = (t) => { t = clamp(t, 0, 1); return t * t * t; };
const easeOutCubic = (t) => { t = clamp(t, 0, 1); return 1 - Math.pow(1 - t, 3); };

// critically-damped-ish spring helper
function spring(s, target, dt, k = 120, d = 14) {
  const a = (target - s.v) * k - s.vel * d;
  s.vel += a * dt; s.v += s.vel * dt; return s.v;
}

/**
 * createHud(ctx) -> { setShield, setBoost, addScore, addHit, say, banner, setLock, setRadar, setLives, setBombs, damage, update, dispose, root }
 */
export function createHud(ctx) {
  injectStyles();
  const { ui, size } = ctx;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const root = el('div', 'sw-hud', ui);
  el('div', 'sw-vig', root);
  const dmg = el('div', 'sw-dmg', root);
  const reticleCv = mkCanvas(W, H, dpr); reticleCv.style.position = 'absolute'; reticleCv.style.inset = '0'; root.appendChild(reticleCv);
  const rg = reticleCv.getContext('2d');

  // ---- shield module
  const shieldMod = el('div', 'sw-mod sw-shield', root); shieldMod.dataset.dir = '0,-1';
  el('div', 'sw-label', shieldMod, 'SHIELD');
  const shieldRow = el('div', 'sw-row', shieldMod);
  const shieldCv = mkCanvas(330, 30, dpr); shieldRow.appendChild(shieldCv);
  const sg = shieldCv.getContext('2d');
  const lives = el('div', 'sw-lives', shieldMod);
  el('div', 'sw-label', lives, 'ARWING');
  const livesCv = mkCanvas(120, 18, dpr); lives.appendChild(livesCv);
  const bombLbl = el('div', 'sw-label', lives, 'BOMB'); bombLbl.style.marginLeft = '14px';
  const bombCv = mkCanvas(80, 18, dpr); lives.appendChild(bombCv);

  // ---- right: hits & score
  const rightMod = el('div', 'sw-mod sw-right', root); rightMod.dataset.dir = '1,0';
  const hitsRow = el('div', 'sw-hits', rightMod);
  el('div', 'sw-label', hitsRow, 'HIT');
  const hitsNum = el('div', 'sw-num', hitsRow, '0');
  const scoreEl = el('div', 'sw-score', rightMod, '<span>SCORE</span>000000');

  // ---- boost gauge
  const boostMod = el('div', 'sw-mod sw-boost', root); boostMod.dataset.dir = '0,1';
  const boostCv = mkCanvas(300, 34, dpr); boostMod.appendChild(boostCv);
  const bg = boostCv.getContext('2d');
  const boostLbl = el('div', 'sw-label', boostMod, 'BOOST');

  // ---- radar
  const radarMod = el('div', 'sw-mod sw-radar', root); radarMod.dataset.dir = '1,0';
  const mods = [shieldMod, rightMod, boostMod, radarMod];
  for (const m of mods) { m.style.opacity = '0'; }
  el('div', 'sw-label', radarMod, 'RADAR');
  const radarCv = mkCanvas(170, 170, dpr); radarMod.appendChild(radarCv);
  const rdg = radarCv.getContext('2d');

  // ---- comm window
  const comm = el('div', 'sw-comm', root);
  const port = el('div', 'sw-port', comm);
  const portrait = createPortrait(172, dpr);
  port.appendChild(portrait.canvas);
  el('div', 'sw-frame', port);
  for (const c of ['c1', 'c2', 'c3', 'c4']) el('div', 'sw-corner ' + c, port);
  const bubble = el('div', 'sw-bubble', comm); el('div', 'sw-tab', bubble);
  comm.style.opacity = '0';
  const nameEl = el('div', 'sw-name', bubble, 'FOX');
  const textEl = el('div', 'sw-text', bubble, '');

  // ---- banner + warning
  const banner = el('div', 'sw-banner', root);
  el('div', 'sw-bg', banner); el('div', 'sw-bl', banner);
  const bannerCv = mkCanvas(W, 240, dpr); bannerCv.style.cssText = 'position:absolute;left:0;top:-120px'; banner.appendChild(bannerCv);
  const bnG = bannerCv.getContext('2d');
  const warn = el('div', 'sw-warn', root, 'SHIELD CRITICAL');

  // ---- state
  const st = {
    t: 0,
    shield: { v: 1, vel: 0 }, shieldTarget: 1, shieldGhost: 1, shieldFlash: 0, glintT: -1, glintNext: 1.5,
    boost: { v: 1, vel: 0 }, boostTarget: 1, boostMode: 'idle', boostGlow: 0,
    score: 0, scoreShown: 0, hits: 0,
    lives: 3, bombs: 3,
    aim: { x: 0, y: 0 }, aimS: { x: { v: 0, vel: 0 }, y: { v: 0, vel: 0 } },
    lock: null, lockAmt: 0, lockPos: { x: W / 2, y: H / 2 }, lockAge: 0,
    radar: [], radarSweep: 0,
    say: null, // { text, name, i, timer, done, hold }
    dmg: 0, introT: -0.2, commAge: -1, commOut: -1, hitPop: -1,
    banner: null, // { age, dur, spans }
  };
  portrait.setTalking(false);

  // ---- API
  const api = {
    root,
    setShield(v) { st.shieldTarget = clamp(v, 0, 1); if (v < st.shield.v - 0.001) { st.shieldFlash = 1; } },
    setBoost(v, mode = null) { st.boostTarget = clamp(v, 0, 1); if (mode) st.boostMode = mode; },
    setBoostMode(mode) { st.boostMode = mode; },
    addScore(n) { st.score += n; },
    addHit(n = 1) { st.hits += n; hitsNum.textContent = String(st.hits); st.hitPop = 0; st.score += 10 * n; },
    setLives(n) { st.lives = n; }, setBombs(n) { st.bombs = n; },
    say(name, text, opts = {}) {
      const id = String(name).toLowerCase();
      portrait.setCharacter(id); portrait.open(); portrait.setMood(opts.mood ?? 'calm');
      nameEl.textContent = (opts.label ?? name).toUpperCase();
      st.say = { text, i: 0, timer: 0, done: false, hold: opts.hold ?? 2.8, speed: opts.speed ?? 0.032 };
      textEl.innerHTML = '<span class="sw-cur"></span>';
      if (st.commAge < 0 || st.commOut >= 0) st.commAge = 0;
      st.commOut = -1;
    },
    hideComm() { if (st.commAge >= 0 && st.commOut < 0) st.commOut = 0; st.say = null; portrait.setTalking(false); },
    banner(text, sub = '', dur = 2.6) {
      st.banner = { age: 0, dur, text: String(text).toUpperCase(), sub: String(sub).toUpperCase() };
    },
    /** aim in NDC-ish (-1..1) for the twin reticles */
    setAim(x, y) { st.aim.x = x; st.aim.y = y; },
    /** lock target in screen px, or null */
    setLock(pos) { if (pos && !st.lock) st.lockAge = 0; st.lock = pos ? { x: pos.x, y: pos.y, dist: pos.dist ?? 0 } : null; },
    /** radar blips: [{x,y,kind:'enemy'|'ally'|'boss'}] with x,y in -1..1 */
    setRadar(blips) { st.radar = blips; },
    damage(amount = 0.1) { api.setShield(st.shieldTarget - amount); st.dmg = 1; },
    show() { if (st.introT < 0) st.introT = 0; },
    update, dispose,
  };

  // ---- drawing
  function drawShield(dt) {
    const s = spring(st.shield, st.shieldTarget, dt, 90, 12);
    st.shieldGhost = st.shieldGhost > s ? Math.max(s, st.shieldGhost - dt * 0.35) : s;
    st.shieldFlash = Math.max(0, st.shieldFlash - dt * 3);
    st.glintT += dt * 1.1; if (st.glintT > 1.6) { st.glintNext -= dt; if (st.glintNext <= 0) { st.glintT = -0.2; st.glintNext = 2.5 + Math.random() * 2; } }
    const g = sg, w = 330, h = 30; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const x0 = 4, y0 = 4, bw = w - 8, bh = h - 8, skew = 8;
    const shape = (x, ww, yy = y0, hh = bh) => { g.beginPath(); g.moveTo(x + skew, yy); g.lineTo(x + ww + skew, yy); g.lineTo(x + ww, yy + hh); g.lineTo(x, yy + hh); g.closePath(); };
    // housing
    shape(x0, bw - skew); g.fillStyle = 'rgba(4,14,34,.78)'; g.fill();
    g.lineWidth = 1.5; g.strokeStyle = 'rgba(150,220,255,.75)'; g.stroke();
    // ghost (damage trail)
    const low = s < 0.3;
    g.save(); shape(x0 + 2, bw - skew - 4, y0 + 2, bh - 4); g.clip();
    const inner = bw - skew - 4;
    if (st.shieldGhost > s + 0.002) { g.fillStyle = 'rgba(255,90,60,.7)'; g.fillRect(x0 + 2, y0, inner * st.shieldGhost + skew, bh); }
    // fill gradient
    const fw = inner * s;
    const grad = g.createLinearGradient(x0, 0, x0 + inner, 0);
    if (low) { grad.addColorStop(0, '#ff5a3c'); grad.addColorStop(1, '#ffb347'); }
    else { grad.addColorStop(0, '#22d3a0'); grad.addColorStop(0.55, '#5ee8ff'); grad.addColorStop(1, '#a8f6ff'); }
    g.fillStyle = grad; g.fillRect(x0 + 2, y0, fw + skew, bh);
    // vertical sheen
    const sheen = g.createLinearGradient(0, y0, 0, y0 + bh); sheen.addColorStop(0, 'rgba(255,255,255,.55)'); sheen.addColorStop(0.35, 'rgba(255,255,255,.08)'); sheen.addColorStop(0.6, 'rgba(0,0,0,.05)'); sheen.addColorStop(1, 'rgba(0,0,0,.35)');
    g.fillStyle = sheen; g.fillRect(x0 + 2, y0, fw + skew, bh);
    // segments
    const n = 20, segW = inner / n;
    for (let i = 1; i < n; i++) { const x = x0 + 2 + i * segW; g.fillStyle = 'rgba(4,14,34,.85)'; g.beginPath(); g.moveTo(x + skew - 1, y0); g.lineTo(x + skew + 1, y0); g.lineTo(x + 1, y0 + bh); g.lineTo(x - 1, y0 + bh); g.closePath(); g.fill(); }
    // moving glint over filled part
    if (st.glintT >= -0.2 && st.glintT <= 1.2) {
      const gx = x0 + 2 + (fw + skew) * st.glintT;
      const gl = g.createLinearGradient(gx - 22, 0, gx + 22, 0); gl.addColorStop(0, 'rgba(255,255,255,0)'); gl.addColorStop(0.5, 'rgba(255,255,255,.85)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gl; g.fillRect(Math.max(x0, gx - 24), y0, Math.min(48, fw + skew - (gx - 24 - x0)), bh);
    }
    // low flash / damage flash
    if (low && Math.sin(st.t * 14) > 0) { g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(x0 + 2, y0, fw + skew, bh); }
    if (st.shieldFlash > 0) { g.fillStyle = `rgba(255,255,255,${st.shieldFlash * 0.7})`; g.fillRect(x0, y0, w, bh); }
    g.restore();
    // end caps ticks
    g.fillStyle = '#cfefff'; g.fillRect(x0 + skew + inner * 0.5 + 2, y0 - 3, 2, 4); g.fillRect(x0 + skew + inner * 0.5 - 1, y0 + bh - 1, 2, 4);
    warn.style.opacity = low ? String(0.6 + 0.4 * Math.sin(st.t * 10)) : '0';

    // lives & bombs
    const lg = livesCv.getContext('2d'); lg.setTransform(dpr, 0, 0, dpr, 0, 0); lg.clearRect(0, 0, 120, 18);
    for (let i = 0; i < 3; i++) {
      const x = 12 + i * 28, on = i < st.lives; lg.fillStyle = on ? '#cfefff' : 'rgba(120,180,220,.25)'; lg.shadowColor = 'rgba(120,220,255,.9)'; lg.shadowBlur = on ? 6 : 0;
      lg.beginPath(); lg.moveTo(x, 2); lg.lineTo(x + 10, 15); lg.lineTo(x, 11); lg.lineTo(x - 10, 15); lg.closePath(); lg.fill();
    }
    const bgc = bombCv.getContext('2d'); bgc.setTransform(dpr, 0, 0, dpr, 0, 0); bgc.clearRect(0, 0, 80, 18);
    for (let i = 0; i < 3; i++) { const on = i < st.bombs; bgc.fillStyle = on ? '#ffd75e' : 'rgba(255,215,94,.2)'; bgc.shadowColor = 'rgba(255,190,60,.9)'; bgc.shadowBlur = on ? 6 : 0; bgc.beginPath(); bgc.arc(10 + i * 24, 9, 5.5, 0, Math.PI * 2); bgc.fill(); if (on) { bgc.fillStyle = '#fff'; bgc.fillRect(9 + i * 24, 1, 2, 4); } }
  }

  function drawBoost(dt) {
    const v = spring(st.boost, st.boostTarget, dt, 110, 14);
    const active = st.boostMode === 'boost' || st.boostMode === 'brake';
    st.boostGlow += ((active ? 1 : 0) - st.boostGlow) * Math.min(1, dt * 8);
    const g = bg, w = 300, h = 34; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const cx = w / 2, y = 8, bh = 14, bw = 240;
    // trapezoid housing (wider at top)
    const shape = (pad) => { g.beginPath(); g.moveTo(cx - bw / 2 - pad, y - pad); g.lineTo(cx + bw / 2 + pad, y - pad); g.lineTo(cx + bw / 2 - 10 + pad, y + bh + pad); g.lineTo(cx - bw / 2 + 10 - pad, y + bh + pad); g.closePath(); };
    shape(0); g.fillStyle = 'rgba(4,14,34,.78)'; g.fill(); g.strokeStyle = `rgba(150,220,255,${0.5 + st.boostGlow * 0.4})`; g.lineWidth = 1.5; g.stroke();
    g.save(); shape(-2); g.clip();
    const brake = st.boostMode === 'brake';
    const c0 = brake ? '#ff5a3c' : '#2f7dff', c1 = brake ? '#ffb347' : '#8ff4ff';
    const grad = g.createLinearGradient(cx - bw / 2, 0, cx + bw / 2, 0); grad.addColorStop(0, c0); grad.addColorStop(1, c1);
    g.fillStyle = grad; g.fillRect(cx - bw / 2, y, bw * v, bh);
    const sheen = g.createLinearGradient(0, y, 0, y + bh); sheen.addColorStop(0, 'rgba(255,255,255,.5)'); sheen.addColorStop(0.4, 'rgba(255,255,255,.05)'); sheen.addColorStop(1, 'rgba(0,0,0,.3)');
    g.fillStyle = sheen; g.fillRect(cx - bw / 2, y, bw * v, bh);
    // energy chevrons scrolling while active
    if (st.boostGlow > 0.02) {
      g.fillStyle = `rgba(255,255,255,${0.35 * st.boostGlow})`;
      const off = (st.t * 220) % 24;
      for (let x = cx - bw / 2 - 24 + off; x < cx - bw / 2 + bw * v; x += 24) { g.beginPath(); g.moveTo(x, y); g.lineTo(x + 6, y); g.lineTo(x + 14, y + bh); g.lineTo(x + 8, y + bh); g.closePath(); g.fill(); }
    }
    for (let i = 1; i < 8; i++) { const x = cx - bw / 2 + (bw / 8) * i; g.fillStyle = 'rgba(4,14,34,.8)'; g.fillRect(x - 0.75, y, 1.5, bh); }
    g.restore();
    // glow under bar
    if (st.boostGlow > 0.02) { const gl = g.createLinearGradient(0, y + bh, 0, y + bh + 10); gl.addColorStop(0, brake ? `rgba(255,90,60,${0.45 * st.boostGlow})` : `rgba(90,180,255,${0.45 * st.boostGlow})`); gl.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gl; g.fillRect(cx - bw / 2 + 10, y + bh, bw * v - 10, 10); }
    boostLbl.textContent = brake ? 'BRAKE' : 'BOOST';
    boostLbl.className = 'sw-label' + (st.boostMode === 'boost' ? ' hot' : brake ? ' brake' : '');
  }

  function drawRadar(dt) {
    st.radarSweep = (st.radarSweep + dt * 1.6) % (Math.PI * 2);
    const g = rdg, S = 170, c = S / 2, R = 76; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, S, S);
    g.save(); g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.clip();
    const bgg = g.createRadialGradient(c, c, 10, c, c, R); bgg.addColorStop(0, 'rgba(10,40,90,.85)'); bgg.addColorStop(1, 'rgba(2,10,28,.9)');
    g.fillStyle = bgg; g.fillRect(0, 0, S, S);
    g.strokeStyle = 'rgba(90,190,255,.28)'; g.lineWidth = 1;
    for (const r of [R * 0.33, R * 0.66]) { g.beginPath(); g.arc(c, c, r, 0, Math.PI * 2); g.stroke(); }
    g.beginPath(); g.moveTo(c, c - R); g.lineTo(c, c + R); g.moveTo(c - R, c); g.lineTo(c + R, c); g.stroke();
    g.strokeStyle = 'rgba(90,190,255,.14)'; for (let i = -R; i <= R; i += 12) { g.beginPath(); g.moveTo(c + i, c - R); g.lineTo(c + i, c + R); g.moveTo(c - R, c + i); g.lineTo(c + R, c + i); g.stroke(); }
    // sweep
    const a = st.radarSweep;
    const sw = g.createConicGradient ? g.createConicGradient(a - Math.PI / 2, c, c) : null;
    if (sw) { sw.addColorStop(0, 'rgba(120,230,255,.55)'); sw.addColorStop(0.18, 'rgba(120,230,255,0)'); sw.addColorStop(1, 'rgba(120,230,255,0)'); g.fillStyle = sw; g.fillRect(0, 0, S, S); }
    g.strokeStyle = 'rgba(200,245,255,.9)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(c, c); g.lineTo(c + Math.cos(a - Math.PI / 2) * R, c + Math.sin(a - Math.PI / 2) * R); g.stroke();
    // blips
    for (const b of st.radar) {
      const x = c + b.x * R * 0.92, y = c + b.y * R * 0.92;
      const col = b.kind === 'ally' ? '#5eff9a' : b.kind === 'boss' ? '#ffd75e' : '#ff5a4a';
      g.fillStyle = col; g.shadowColor = col; g.shadowBlur = 8;
      if (b.kind === 'boss') { g.beginPath(); g.rect(x - 4, y - 4, 8, 8); g.fill(); }
      else { g.beginPath(); g.arc(x, y, b.kind === 'ally' ? 2.6 : 3.2, 0, Math.PI * 2); g.fill(); }
      g.shadowBlur = 0;
      if (b.kind === 'enemy') { g.strokeStyle = 'rgba(255,90,74,.5)'; g.beginPath(); g.arc(x, y, 6 + 3 * Math.sin(st.t * 6 + x), 0, Math.PI * 2); g.stroke(); }
    }
    // player
    g.fillStyle = '#fff'; g.shadowColor = '#9fdcff'; g.shadowBlur = 10; g.beginPath(); g.moveTo(c, c - 7); g.lineTo(c + 5, c + 5); g.lineTo(c, c + 2); g.lineTo(c - 5, c + 5); g.closePath(); g.fill(); g.shadowBlur = 0;
    g.restore();
    // rim
    g.lineWidth = 2; g.strokeStyle = 'rgba(160,225,255,.85)'; g.beginPath(); g.arc(c, c, R, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 4; g.strokeStyle = 'rgba(10,30,60,.9)'; g.beginPath(); g.arc(c, c, R + 3.5, 0, Math.PI * 2); g.stroke();
    g.lineWidth = 1; g.strokeStyle = 'rgba(160,225,255,.5)'; g.beginPath(); g.arc(c, c, R + 6, 0, Math.PI * 2); g.stroke();
    // compass ticks
    g.fillStyle = '#cfefff'; for (let i = 0; i < 4; i++) { const an = i * Math.PI / 2; g.beginPath(); g.arc(c + Math.cos(an) * (R + 6), c + Math.sin(an) * (R + 6), 2, 0, Math.PI * 2); g.fill(); }
  }

  function drawReticle(dt) {
    const g = rg; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    const ax = spring(st.aimS.x, st.aim.x, dt, 140, 13), ay = spring(st.aimS.y, st.aim.y, dt, 140, 13);
    const cx = W / 2, cy = H / 2 - 20;
    // near reticle (large, follows aim strongly), far reticle (small, follows more)
    const nx = cx + ax * 150, ny = cy - ay * 95, fx = cx + ax * 260, fy = cy - ay * 165;
    const locked = st.lockAmt > 0.01;
    const col = locked ? `rgba(255,${Math.round(lerp(220, 90, st.lockAmt))},${Math.round(lerp(120, 70, st.lockAmt))},.95)` : 'rgba(120,255,170,.95)';
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.shadowColor = locked ? 'rgba(255,80,60,.9)' : 'rgba(80,255,160,.8)'; g.shadowBlur = 8;
    // near: bracket square with gaps
    const s = 42, k = 14;
    g.strokeStyle = col; g.lineWidth = 3;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      g.beginPath(); g.moveTo(nx + sx * s, ny + sy * (s - k)); g.lineTo(nx + sx * s, ny + sy * s); g.lineTo(nx + sx * (s - k), ny + sy * s); g.stroke();
    }
    g.lineWidth = 2; g.beginPath(); g.moveTo(nx - 8, ny); g.lineTo(nx - 3, ny); g.moveTo(nx + 3, ny); g.lineTo(nx + 8, ny); g.moveTo(nx, ny - 8); g.lineTo(nx, ny - 3); g.moveTo(nx, ny + 3); g.lineTo(nx, ny + 8); g.stroke();
    // far: small diamond + dot
    g.lineWidth = 2.5; g.beginPath(); g.moveTo(fx, fy - 14); g.lineTo(fx + 14, fy); g.lineTo(fx, fy + 14); g.lineTo(fx - 14, fy); g.closePath(); g.stroke();
    g.fillStyle = col; g.beginPath(); g.arc(fx, fy, 2.5, 0, Math.PI * 2); g.fill();
    // connecting line near->far (faint)
    g.shadowBlur = 0; g.strokeStyle = locked ? 'rgba(255,120,90,.35)' : 'rgba(120,255,170,.3)'; g.lineWidth = 1.5; g.setLineDash([4, 6]); g.beginPath(); g.moveTo(nx, ny); g.lineTo(fx, fy); g.stroke(); g.setLineDash([]);

    // lock-on
    const target = st.lock;
    st.lockAmt += (((target ? 1 : 0)) - st.lockAmt) * Math.min(1, dt * 7);
    if (target) { st.lockAge += dt; st.lockPos.x += (target.x - st.lockPos.x) * Math.min(1, dt * 18); st.lockPos.y += (target.y - st.lockPos.y) * Math.min(1, dt * 18); }
    if (st.lockAmt > 0.01) {
      const la = st.lockAmt, lx = st.lockPos.x, ly = st.lockPos.y;
      const acquired = st.lockAge > 0.55;
      const rad = lerp(150, 34, Math.min(1, st.lockAge / 0.55) ** 0.6) * (acquired ? 1 + Math.sin(st.t * 12) * 0.04 : 1);
      const rot = acquired ? st.t * 1.6 : st.t * 7;
      g.save(); g.translate(lx, ly); g.rotate(rot); g.globalAlpha = la;
      g.shadowColor = 'rgba(255,60,40,.9)'; g.shadowBlur = 10;
      g.strokeStyle = acquired ? '#ff4a3a' : '#ffd75e'; g.lineWidth = 3;
      for (let i = 0; i < 4; i++) { g.rotate(Math.PI / 2); g.beginPath(); g.moveTo(rad, rad - 14); g.lineTo(rad, rad); g.lineTo(rad - 14, rad); g.stroke(); }
      g.restore();
      if (acquired) {
        g.save(); g.globalAlpha = la; g.translate(lx, ly); g.rotate(-st.t * 2.4); g.strokeStyle = 'rgba(255,120,90,.8)'; g.lineWidth = 2; g.setLineDash([10, 8]); g.beginPath(); g.arc(0, 0, rad * 1.35, 0, Math.PI * 2); g.stroke(); g.setLineDash([]); g.restore();
        g.save(); g.globalAlpha = la; g.fillStyle = '#ff4a3a'; g.shadowColor = 'rgba(255,60,40,.9)'; g.shadowBlur = 8;
        g.font = `italic 700 15px "Liberation Sans Narrow","Arial Narrow",sans-serif`; g.textAlign = 'left';
        const tx = lx + rad + 14, ty = ly - rad + 4;
        g.fillText('LOCK', tx, ty);
        g.fillStyle = '#ffd75e'; g.font = `italic 700 12px "Liberation Sans Narrow","Arial Narrow",sans-serif`;
        g.fillText(`${Math.round(target ? target.dist : 0).toString().padStart(4, '0')} M`, tx, ty + 15);
        g.restore();
        // bar under
        g.save(); g.globalAlpha = la; g.strokeStyle = 'rgba(255,74,58,.9)'; g.lineWidth = 2; g.beginPath(); g.moveTo(lx + rad + 12, ly - rad - 6); g.lineTo(lx + rad + 60, ly - rad - 6); g.stroke(); g.restore();
      }
    }
  }

  function drawBanner(b, tin, tout, pout) {
    const g = bnG; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, 240);
    const cy = 120;
    // title letters, staggered overshoot in, skew-slide out
    const size = 92; g.font = `italic 700 ${size}px ${FONT}`; g.textBaseline = 'middle'; g.textAlign = 'center';
    const chars = [...b.text]; const gap = size * 0.16;
    const widths = chars.map((c) => g.measureText(c).width);
    const total = widths.reduce((a, w) => a + w, 0) + gap * (chars.length - 1);
    let x = W / 2 - total / 2;
    chars.forEach((ch, i) => {
      const w = widths[i]; const cx = x + w / 2; x += w + gap;
      if (ch === ' ') return;
      const p = clamp((tin - 0.1 - i * 0.045) / 0.5, 0, 1); const e = easeOutBack(p, 1.6);
      const po = clamp((tout - i * 0.02) / 0.25, 0, 1);
      const a = Math.min(easeOutCubic(p * 3), 1 - po); if (a <= 0) return;
      g.save(); g.globalAlpha = a;
      g.translate(cx + 60 * easeInCubic(po), cy + 40 * (1 - e));
      const sc = 1.6 - 0.6 * e; g.transform(sc, 0, -Math.tan(0.44 * easeInCubic(po)) * sc, sc, 0, 0);
      g.fillStyle = 'rgba(0,30,70,.95)'; g.fillText(ch, 0, 6);
      g.fillStyle = 'rgba(255,70,60,.6)'; g.fillText(ch, 3, 0);
      g.fillStyle = 'rgba(60,200,255,.65)'; g.fillText(ch, -3, 0);
      const grad = g.createLinearGradient(0, -size / 2, 0, size / 2); grad.addColorStop(0, '#ffffff'); grad.addColorStop(0.55, '#f4fbff'); grad.addColorStop(0.56, '#cfe9ff'); grad.addColorStop(1, '#9fd3ff');
      g.fillStyle = grad; g.fillText(ch, 0, 0);
      g.restore();
    });
    // subtitle
    const ps = clamp((tin - 0.5) / 0.3, 0, 1); const sa = Math.min(ps, 1 - pout);
    if (sa > 0 && b.sub) {
      g.save(); g.globalAlpha = sa; g.font = `italic 700 18px ${FONT}`; g.textAlign = 'center';
      const sub = b.sub;
      const y = cy + 62 + 10 * (1 - easeOutCubic(ps));
      g.letterSpacing = '0.5em';
      g.fillStyle = 'rgba(60,30,0,.9)'; g.fillText(sub, W / 2 + 4, y + 2);
      g.fillStyle = '#ffd75e'; g.fillText(sub, W / 2 + 4, y);
      g.restore();
    }
  }

  function updateSay(dt) {
    const s = st.say; if (!s) return;
    if (!s.done) {
      s.timer += dt;
      const target = Math.min(s.text.length, Math.floor(s.timer / s.speed));
      if (target !== s.i) { s.i = target; textEl.innerHTML = s.text.slice(0, s.i).replace(/\n/g, '<br>') + '<span class="sw-cur"></span>'; }
      portrait.setTalking(true);
      if (s.i >= s.text.length) { s.done = true; s.timer = 0; portrait.setTalking(false); }
    } else {
      s.timer += dt;
      if (s.timer > s.hold) { api.hideComm(); }
    }
  }

  const bannerBg = banner.querySelector('.sw-bg'), bannerLine = banner.querySelector('.sw-bl');
  function animate(dt) {
    // module intro: slide in with overshoot, staggered
    if (st.introT >= 0) {
      st.introT += dt;
      mods.forEach((m, i) => {
        const p = clamp((st.introT - i * 0.08) / 0.6, 0, 1);
        if (p >= 1 && m.dataset.done) return;
        const [dx, dy] = m.dataset.dir.split(',').map(Number); const e = easeOutBack(p, 1.4);
        m.style.opacity = String(easeOutCubic(p * 2));
        m.style.transform = `translate(${dx * 50 * (1 - e)}px, ${dy * 40 * (1 - e)}px)`;
        if (p >= 1) { m.dataset.done = '1'; m.style.transform = 'none'; }
      });
    }
    // comm window in/out
    if (st.commAge >= 0) {
      st.commAge += dt;
      let e, o;
      if (st.commOut >= 0) { st.commOut += dt; const p = clamp(st.commOut / 0.3, 0, 1); e = 1 - easeInCubic(p); o = 1 - p; if (p >= 1) { st.commAge = -1; st.commOut = -1; } }
      else { const p = clamp(st.commAge / 0.5, 0, 1); e = easeOutBack(p, 1.6); o = easeOutCubic(p * 3); }
      comm.style.opacity = String(o);
      comm.style.transform = `translate(${-80 * (1 - e)}px, 0) scale(${0.9 + 0.1 * e})`;
      comm.style.transformOrigin = 'left bottom';
    }
    // hit counter pop
    if (st.hitPop >= 0) {
      st.hitPop += dt; const p = clamp(st.hitPop / 0.4, 0, 1); const e = easeOutBack(p, 2.2);
      const s = 1.4 - 0.4 * e; hitsNum.style.transform = `scale(${s}) translateY(${-6 * (1 - e)}px)`;
      hitsNum.style.color = p < 0.5 ? '#ffe27a' : '#fff';
      if (p >= 1) { st.hitPop = -1; hitsNum.style.transform = 'none'; }
    }
    // banner
    const b = st.banner;
    if (b) {
      b.age += dt;
      const tin = b.age, tout = b.age - b.dur;
      const pin = clamp(tin / 0.35, 0, 1), pout = clamp(tout / 0.3, 0, 1);
      bannerBg.style.transform = `translate(-50%,-50%) scaleY(${easeOutBack(pin, 1.3) * (1 - easeInCubic(pout))})`;
      bannerLine.style.transform = `scaleX(${easeOutCubic(pin) * (1 - easeInCubic(pout))})`;
      drawBanner(b, tin, tout, pout);
      if (pout >= 1) { st.banner = null; bnG.setTransform(1, 0, 0, 1, 0, 0); bnG.clearRect(0, 0, bannerCv.width, bannerCv.height); }
    }
    // cursor blink (JS-driven)
    const cur = textEl.querySelector('.sw-cur'); if (cur) cur.style.opacity = Math.floor(st.t * 4) % 2 ? '0' : '1';
  }

  function update(dt) {
    dt = Math.min(dt, 0.05); st.t += dt;
    const sc = Math.min(size.x / W, size.y / H) || 1;
    root.style.setProperty('--s', sc.toFixed(4));
    if (st.introT < 0) { st.introT += dt; if (st.introT >= 0) st.introT = 0; }
    drawShield(dt); drawBoost(dt); drawRadar(dt); drawReticle(dt);
    portrait.update(dt);
    updateSay(dt);
    animate(dt);
    // score roll-up
    if (st.scoreShown !== st.score) { st.scoreShown = Math.abs(st.score - st.scoreShown) < 3 ? st.score : Math.round(lerp(st.scoreShown, st.score, Math.min(1, dt * 10))); scoreEl.innerHTML = '<span>SCORE</span>' + String(st.scoreShown).padStart(6, '0'); }
    // damage vignette
    st.dmg = Math.max(0, st.dmg - dt * 2.5); dmg.style.opacity = String(st.dmg);
  }

  function dispose() { root.remove(); }
  return api;
}
