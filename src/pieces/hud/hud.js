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
  const shieldCv = mkCanvas(340, 40, dpr); shieldRow.appendChild(shieldCv);
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
  const boostCv = mkCanvas(300, 40, dpr); boostMod.appendChild(boostCv);
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
  const screen = el('div', 'sw-screen', port);
  const portrait = createPortrait(164, dpr);
  screen.appendChild(portrait.canvas);
  el('div', 'sw-glass', screen);
  for (const c of ['c1', 'c2', 'c3', 'c4']) el('div', 'sw-corner ' + c, port);
  for (const c of ['r1', 'r2', 'r3', 'r4']) el('div', 'sw-rivet ' + c, port);
  const sig = el('div', 'sw-sig', port); const sigBars = [3, 5, 7, 9, 10].map((h) => { const i = el('i', '', sig); i.style.height = h + 'px'; return i; });
  const idEl = el('div', 'sw-id', port, 'COMM 01');
  const bubble = el('div', 'sw-bubble', comm); el('div', 'sw-tab', bubble); el('div', 'sw-hl', bubble);
  comm.style.opacity = '0';
  const nameEl = el('div', 'sw-name', bubble, 'FOX');
  const textEl = el('div', 'sw-text', bubble, '');

  // ---- banner + warning
  const banner = el('div', 'sw-banner', root);
  el('div', 'sw-bg', banner); el('div', 'sw-bl', banner); el('div', 'sw-bl b2', banner); el('div', 'sw-bl b3', banner);
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
      nameEl.innerHTML = (opts.label ?? name).toUpperCase() + `<b>${opts.callsign ?? { fox: 'LEADER', peppy: 'WING 2', falco: 'WING 3', slippy: 'WING 4' }[id] ?? 'COMM'}</b>`;
      idEl.textContent = { fox: 'CH 01 · FOX', peppy: 'CH 02 · PEPPY', falco: 'CH 03 · FALCO', slippy: 'CH 04 · SLIPPY' }[id] ?? 'CH 00';
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
  /**
   * Chunky bevelled gauge housing: dark brushed-metal slab with a raised
   * outer lip (light top edge / dark bottom edge), an inset trough that the
   * liquid-glass fill sits in, and a soft drop shadow so it lifts off the
   * scene. `shape(pad)` must trace the housing outline expanded by `pad`.
   */
  function housing(g, shape, glow = 0, tint = '150,220,255') {
    // drop shadow
    g.save(); g.translate(0, 3); shape(1.5); g.fillStyle = 'rgba(0,4,16,.55)'; g.fill(); g.restore();
    // outer metal lip
    shape(3); const lip = g.createLinearGradient(0, 0, 0, 40); lip.addColorStop(0, '#8fa9cc'); lip.addColorStop(0.35, '#3a5275'); lip.addColorStop(0.7, '#1a2740'); lip.addColorStop(1, '#5a7499');
    g.fillStyle = lip; g.fill();
    g.lineWidth = 1; g.strokeStyle = `rgba(${tint},${0.45 + glow * 0.45})`; g.stroke();
    // inner trough
    shape(0); const tr = g.createLinearGradient(0, 0, 0, 40); tr.addColorStop(0, '#02060f'); tr.addColorStop(0.5, '#071427'); tr.addColorStop(1, '#0a1a30');
    g.fillStyle = tr; g.fill();
    g.save(); shape(0); g.clip();
    // inner shadow at top of trough + faint floor highlight
    const ish = g.createLinearGradient(0, 0, 0, 40); ish.addColorStop(0, 'rgba(0,0,0,.7)'); ish.addColorStop(0.25, 'rgba(0,0,0,0)'); ish.addColorStop(0.9, 'rgba(120,190,255,.06)'); ish.addColorStop(1, 'rgba(120,190,255,.14)');
    g.fillStyle = ish; g.fillRect(-10, -10, 400, 60);
    g.restore();
  }
  /** glassy liquid fill shading: bright top bead, core, dark base, bottom bounce */
  function glassFill(g, x, y, w, h, grad) {
    g.fillStyle = grad; g.fillRect(x, y, w, h);
    const sheen = g.createLinearGradient(0, y, 0, y + h);
    sheen.addColorStop(0, 'rgba(255,255,255,.75)'); sheen.addColorStop(0.12, 'rgba(255,255,255,.45)'); sheen.addColorStop(0.4, 'rgba(255,255,255,.04)');
    sheen.addColorStop(0.62, 'rgba(0,0,0,.08)'); sheen.addColorStop(0.9, 'rgba(0,0,0,.42)'); sheen.addColorStop(1, 'rgba(255,255,255,.18)');
    g.fillStyle = sheen; g.fillRect(x, y, w, h);
  }

  function drawShield(dt) {
    const s = spring(st.shield, st.shieldTarget, dt, 90, 12);
    st.shieldGhost = st.shieldGhost > s ? Math.max(s, st.shieldGhost - dt * 0.35) : s;
    st.shieldFlash = Math.max(0, st.shieldFlash - dt * 3);
    st.glintT += dt * 1.1; if (st.glintT > 1.6) { st.glintNext -= dt; if (st.glintNext <= 0) { st.glintT = -0.2; st.glintNext = 2.5 + Math.random() * 2; } }
    const g = sg, w = 340, h = 40; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const x0 = 8, y0 = 8, bw = w - 20, bh = 22, skew = 9;
    const shape = (pad = 0) => { g.beginPath(); g.moveTo(x0 + skew - pad * 0.4, y0 - pad); g.lineTo(x0 + bw + pad, y0 - pad); g.lineTo(x0 + bw - skew + pad * 0.4, y0 + bh + pad); g.lineTo(x0 - pad, y0 + bh + pad); g.closePath(); };
    const low = s < 0.3;
    housing(g, shape, low ? 0.5 + 0.5 * Math.sin(st.t * 14) : 0, low ? '255,120,90' : '150,220,255');
    g.save(); shape(-1.5); g.clip();
    const inner = bw - skew - 3;
    const fx = x0 + 1.5, fy = y0 + 1.5, fh = bh - 3;
    // ghost (damage trail)
    if (st.shieldGhost > s + 0.002) { g.fillStyle = 'rgba(255,90,60,.75)'; g.fillRect(fx, fy, inner * st.shieldGhost + skew, fh); }
    // fill
    const fw = inner * s;
    const grad = g.createLinearGradient(x0, 0, x0 + inner, 0);
    if (low) { grad.addColorStop(0, '#ff5a3c'); grad.addColorStop(1, '#ffb347'); }
    else { grad.addColorStop(0, '#12c48e'); grad.addColorStop(0.5, '#3fe0ff'); grad.addColorStop(1, '#b6f9ff'); }
    glassFill(g, fx, fy, fw + skew, fh, grad);
    // leading-edge bright cap
    if (fw > 2) { const cap = g.createLinearGradient(fx + fw + skew - 12, 0, fx + fw + skew, 0); cap.addColorStop(0, 'rgba(255,255,255,0)'); cap.addColorStop(1, 'rgba(255,255,255,.9)'); g.fillStyle = cap; g.fillRect(fx + fw + skew - 12, fy, 12, fh); }
    // segment dividers: bevelled (dark line + light line)
    const n = 16, segW = inner / n;
    for (let i = 1; i < n; i++) {
      const x = fx + i * segW;
      g.fillStyle = 'rgba(2,8,20,.9)'; g.beginPath(); g.moveTo(x + skew - 1.2, fy); g.lineTo(x + skew + 1.2, fy); g.lineTo(x + 1.2, fy + fh); g.lineTo(x - 1.2, fy + fh); g.closePath(); g.fill();
      g.fillStyle = 'rgba(255,255,255,.14)'; g.beginPath(); g.moveTo(x + skew + 1.2, fy); g.lineTo(x + skew + 1.9, fy); g.lineTo(x + 1.9, fy + fh); g.lineTo(x + 1.2, fy + fh); g.closePath(); g.fill();
    }
    // glint sweeping the filled part (skewed to match the segments)
    if (st.glintT >= -0.2 && st.glintT <= 1.2) {
      const gx = fx + (fw + skew) * st.glintT;
      g.save(); g.beginPath(); g.rect(fx, fy, fw + skew, fh); g.clip();
      g.transform(1, 0, -skew / fh, 1, 0, 0);
      const gl = g.createLinearGradient(gx - 26, 0, gx + 26, 0); gl.addColorStop(0, 'rgba(255,255,255,0)'); gl.addColorStop(0.45, 'rgba(255,255,255,.9)'); gl.addColorStop(0.55, 'rgba(255,255,255,.9)'); gl.addColorStop(1, 'rgba(255,255,255,0)');
      g.fillStyle = gl; g.fillRect(gx - 26 + skew, fy - 5, 52, fh + 10);
      g.restore();
    }
    if (low && Math.sin(st.t * 14) > 0) { g.fillStyle = 'rgba(255,255,255,.28)'; g.fillRect(fx, fy, fw + skew, fh); }
    if (st.shieldFlash > 0) { g.fillStyle = `rgba(255,255,255,${st.shieldFlash * 0.7})`; g.fillRect(x0, y0, w, bh); }
    g.restore();
    // half-way index mark on the lip
    g.fillStyle = '#e8f7ff'; g.beginPath(); g.moveTo(x0 + skew + inner * 0.5 + 2, y0 - 6); g.lineTo(x0 + skew + inner * 0.5 + 5, y0 - 3); g.lineTo(x0 + skew + inner * 0.5 - 1, y0 - 3); g.closePath(); g.fill();
    warn.style.opacity = low ? String(0.6 + 0.4 * Math.sin(st.t * 10)) : '0';

    // lives & bombs
    const lg = livesCv.getContext('2d'); lg.setTransform(dpr, 0, 0, dpr, 0, 0); lg.clearRect(0, 0, 120, 18);
    for (let i = 0; i < 3; i++) {
      const x = 12 + i * 28, on = i < st.lives;
      lg.shadowColor = 'rgba(120,220,255,.9)'; lg.shadowBlur = on ? 6 : 0;
      const gr = lg.createLinearGradient(0, 2, 0, 15); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, '#8fd0ff');
      lg.fillStyle = on ? gr : 'rgba(120,180,220,.25)';
      lg.beginPath(); lg.moveTo(x, 2); lg.lineTo(x + 10, 15); lg.lineTo(x, 11); lg.lineTo(x - 10, 15); lg.closePath(); lg.fill();
    }
    const bgc = bombCv.getContext('2d'); bgc.setTransform(dpr, 0, 0, dpr, 0, 0); bgc.clearRect(0, 0, 80, 18);
    for (let i = 0; i < 3; i++) {
      const on = i < st.bombs, cx = 10 + i * 24;
      const gr = bgc.createRadialGradient(cx - 2, 7, 0.5, cx, 9, 6); gr.addColorStop(0, '#fff6c8'); gr.addColorStop(0.5, '#ffd75e'); gr.addColorStop(1, '#b57a10');
      bgc.fillStyle = on ? gr : 'rgba(255,215,94,.2)'; bgc.shadowColor = 'rgba(255,190,60,.9)'; bgc.shadowBlur = on ? 6 : 0;
      bgc.beginPath(); bgc.arc(cx, 9, 5.5, 0, Math.PI * 2); bgc.fill(); bgc.shadowBlur = 0;
      if (on) { bgc.fillStyle = '#fff'; bgc.fillRect(cx - 1, 1, 2, 4); }
    }
  }

  function drawBoost(dt) {
    const v = spring(st.boost, st.boostTarget, dt, 110, 14);
    const active = st.boostMode === 'boost' || st.boostMode === 'brake';
    st.boostGlow += ((active ? 1 : 0) - st.boostGlow) * Math.min(1, dt * 8);
    const g = bg, w = 300, h = 40; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, w, h);
    const cx = w / 2, y = 8, bh = 18, bw = 250;
    const brake = st.boostMode === 'brake';
    // trapezoid housing (wider at top)
    const shape = (pad = 0) => { g.beginPath(); g.moveTo(cx - bw / 2 - pad, y - pad); g.lineTo(cx + bw / 2 + pad, y - pad); g.lineTo(cx + bw / 2 - 12 + pad * 0.6, y + bh + pad); g.lineTo(cx - bw / 2 + 12 - pad * 0.6, y + bh + pad); g.closePath(); };
    housing(g, shape, st.boostGlow, brake ? '255,120,90' : '150,220,255');
    g.save(); shape(-1.5); g.clip();
    const fx = cx - bw / 2, fy = y + 1.5, fh = bh - 3;
    const c0 = brake ? '#ff5a3c' : '#2f7dff', c1 = brake ? '#ffb347' : '#8ff4ff';
    const grad = g.createLinearGradient(fx, 0, fx + bw, 0); grad.addColorStop(0, c0); grad.addColorStop(1, c1);
    glassFill(g, fx, fy, bw * v, fh, grad);
    if (st.boostGlow > 0.02) {
      g.fillStyle = `rgba(255,255,255,${0.35 * st.boostGlow})`;
      const off = (st.t * 220) % 24;
      for (let x = fx - 24 + off; x < fx + bw * v; x += 24) { g.beginPath(); g.moveTo(x, fy); g.lineTo(x + 6, fy); g.lineTo(x + 14, fy + fh); g.lineTo(x + 8, fy + fh); g.closePath(); g.fill(); }
    }
    for (let i = 1; i < 10; i++) { const x = fx + (bw / 10) * i; g.fillStyle = 'rgba(2,8,20,.9)'; g.fillRect(x - 1, fy, 2, fh); g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(x + 1, fy, 0.7, fh); }
    g.restore();
    if (st.boostGlow > 0.02) { const gl = g.createLinearGradient(0, y + bh + 3, 0, y + bh + 14); gl.addColorStop(0, brake ? `rgba(255,90,60,${0.5 * st.boostGlow})` : `rgba(90,180,255,${0.5 * st.boostGlow})`); gl.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = gl; g.fillRect(fx + 12, y + bh + 3, bw * v - 12, 11); }
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
        // tag plate: leader line from the bracket corner to a dark plate that
        // carries LOCK + range, kept clear of the rotating bracket & ring
        const tagIn = clamp((st.lockAge - 0.55) / 0.25, 0, 1), te = easeOutBack(tagIn, 1.5);
        const ox = rad * 1.35 + 10, oy = -rad * 1.35 - 6;
        const px = lx + ox * te, py = ly + oy * te;
        g.save(); g.globalAlpha = la * easeOutCubic(tagIn * 2);
        g.strokeStyle = 'rgba(255,110,90,.9)'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(lx + rad * 0.72, ly - rad * 0.72); g.lineTo(px, py); g.lineTo(px + 90, py); g.stroke();
        const dist = `${Math.round(target ? target.dist : 0).toString().padStart(4, '0')}M`;
        g.font = `italic 700 19px ${FONT}`; g.textAlign = 'left'; g.textBaseline = 'alphabetic';
        const pw = 92, ph = 40;
        g.fillStyle = 'rgba(6,10,24,.9)'; g.beginPath(); g.moveTo(px, py - ph); g.lineTo(px + pw, py - ph); g.lineTo(px + pw, py); g.lineTo(px, py); g.closePath(); g.fill();
        g.fillStyle = '#ff4a3a'; g.fillRect(px, py - ph, 3, ph);
        g.shadowColor = 'rgba(255,60,40,.7)'; g.shadowBlur = 6;
        g.fillStyle = '#ff5a4a'; g.fillText('LOCK', px + 9, py - 21);
        g.shadowBlur = 0; g.fillStyle = '#ffd75e'; g.font = `italic 700 16px ${FONT}`; g.fillText(dist, px + 9, py - 5);
        // signal ticks on the right of the plate
        g.fillStyle = 'rgba(255,255,255,.85)'; for (let i = 0; i < 3; i++) { const on = Math.floor(st.t * 6 + i) % 3 === 0; g.globalAlpha = la * (on ? 1 : 0.3); g.fillRect(px + pw - 16 + i * 5, py - 12 - i * 3, 3, 8 + i * 3); }
        g.restore();
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

  const bannerBg = banner.querySelector('.sw-bg'), bannerLines = [...banner.querySelectorAll('.sw-bl')];
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
      bannerLines.forEach((l, i) => { const p = clamp((tin - i * 0.06) / 0.4, 0, 1); l.style.transform = `scaleX(${easeOutCubic(p) * (1 - easeInCubic(pout))})`; });
      drawBanner(b, tin, tout, pout);
      if (pout >= 1) { st.banner = null; bnG.setTransform(1, 0, 0, 1, 0, 0); bnG.clearRect(0, 0, bannerCv.width, bannerCv.height); }
    }
    // comm signal-strength bars flicker while a transmission is live
    if (st.commAge >= 0) { const lvl = st.say && !st.say.done ? 3 + Math.floor(Math.abs(Math.sin(st.t * 7)) * 2.99) : 5; sigBars.forEach((b, i) => { b.style.opacity = i < lvl ? '1' : '.22'; }); }
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
