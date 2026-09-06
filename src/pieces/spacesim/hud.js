// Canvas HUD: reticle, target markers, radar, speed/boost gauges, maneuver callouts.
import * as THREE from 'three';

const FONT = '"Segoe UI", "Helvetica Neue", Arial, system-ui, sans-serif';
const _v = new THREE.Vector3();

export function createHud(ui) {
  const cv = document.createElement('canvas');
  cv.style.cssText = 'position:absolute;inset:0;width:100%;height:100%;pointer-events:none';
  ui.appendChild(cv);
  const g = cv.getContext('2d');
  let W = 0, H = 0, dpr = 1;
  const callouts = []; // {text, t0, dur}
  const state = { targets: [], boost: 0, speed: 0, maxSpeed: 1, shipQuat: new THREE.Quaternion(), shipPos: new THREE.Vector3(), lockedId: -1, flash: 0 };

  function resize(w, h) {
    dpr = Math.min(devicePixelRatio || 1, 2);
    W = w; H = h; cv.width = Math.floor(w * dpr); cv.height = Math.floor(h * dpr);
  }

  function callout(text, dur = 1.6, style = 'major') {
    // a new major callout replaces any live one so they never stack over each other
    if (style === 'major') for (let i = callouts.length - 1; i >= 0; i--) if (callouts[i].style === 'major') callouts.splice(i, 1);
    callouts.push({ text, t0: state.time ?? 0, dur, style });
  }

  function project(pos, camera) {
    _v.copy(pos).project(camera);
    const behind = _v.z > 1;
    return { x: (_v.x * 0.5 + 0.5) * W, y: (-_v.y * 0.5 + 0.5) * H, behind, nx: _v.x, ny: _v.y };
  }

  function drawBracket(x, y, s, col, lw = 2, rot = 0) {
    g.save(); g.translate(x, y); g.rotate(rot); g.strokeStyle = col; g.lineWidth = lw; g.lineCap = 'round';
    const c = s * 0.35;
    for (const [sx, sy] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
      g.beginPath(); g.moveTo(sx * s, sy * (s - c)); g.lineTo(sx * s, sy * s); g.lineTo(sx * (s - c), sy * s); g.stroke();
    }
    g.restore();
  }

  function draw(camera, t, dt) {
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, W, H);
    const cx = W / 2, cy = H / 2;
    const accent = '#7fe0ff', warn = '#ff5e5e', gold = '#ffd35a';

    // ---- lens flare ghosts (sun on screen and in front of the camera)
    if (state.sunPos) {
      const sp = project(state.sunPos, camera);
      if (!sp.behind && sp.x > -W * 0.3 && sp.x < W * 1.3 && sp.y > -H * 0.3 && sp.y < H * 1.3) {
        const inside = Math.max(0, 1 - Math.hypot((sp.x - cx) / (W * 0.75), (sp.y - cy) / (H * 0.75)));
        const dx = cx - sp.x, dy = cy - sp.y;
        g.save(); g.globalCompositeOperation = 'lighter';
        // anamorphic streak
        const sg = g.createLinearGradient(sp.x - W * 0.3, sp.y, sp.x + W * 0.3, sp.y);
        sg.addColorStop(0, 'rgba(120,180,255,0)'); sg.addColorStop(0.5, `rgba(180,215,255,${0.22 * inside})`); sg.addColorStop(1, 'rgba(120,180,255,0)');
        const vg = g.createLinearGradient(0, sp.y - 8, 0, sp.y + 8); vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(0.5, 'rgba(0,0,0,1)'); vg.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = sg; g.fillRect(sp.x - W * 0.3, sp.y - 8, W * 0.6, 16);
        g.globalCompositeOperation = 'destination-in'; g.fillStyle = vg; g.fillRect(sp.x - W * 0.3, sp.y - 8, W * 0.6, 16); g.globalCompositeOperation = 'lighter';
        for (const [k, r, col, a] of [[0.35, 26, '255,190,120', 0.10], [0.62, 12, '160,220,255', 0.16], [0.95, 48, '255,140,180', 0.06], [1.3, 18, '160,255,200', 0.12], [1.75, 70, '120,170,255', 0.05]]) {
          const x = sp.x + dx * k, y = sp.y + dy * k;
          const rg = g.createRadialGradient(x, y, 0, x, y, r); rg.addColorStop(0, `rgba(${col},${a * inside})`); rg.addColorStop(0.7, `rgba(${col},${a * inside * 0.6})`); rg.addColorStop(1, `rgba(${col},0)`);
          g.fillStyle = rg; g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
        }
        g.restore();
      }
    }

    // ---- reticle (two-stage, Star Fox style) projected along the ship's real aim line
    const b = state.boost;
    let rn = { x: cx, y: cy, behind: false }, rf = { x: cx, y: cy, behind: false };
    if (state.aimNear && state.aimFar) { rn = project(state.aimNear, camera); rf = project(state.aimFar, camera); }
    if (!state.maneuver && !rn.behind && !rf.behind) {
      g.save();
      g.strokeStyle = accent; g.lineWidth = 2; g.lineCap = 'round';
      // near stage: open ring with four ticks
      g.globalAlpha = 0.85;
      const R1 = 30 + b * 6;
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2; g.beginPath(); g.arc(rn.x, rn.y, R1, a + 0.22, a + Math.PI / 2 - 0.22); g.stroke(); }
      for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + Math.PI / 4; g.beginPath(); g.moveTo(rn.x + Math.cos(a) * (R1 + 6), rn.y + Math.sin(a) * (R1 + 6)); g.lineTo(rn.x + Math.cos(a) * (R1 + 16), rn.y + Math.sin(a) * (R1 + 16)); g.stroke(); }
      // far stage: small crosshair dot with a leader line back to the near ring
      g.globalAlpha = 0.55; g.lineWidth = 1.2;
      g.beginPath(); g.moveTo(rn.x, rn.y); g.lineTo(rf.x, rf.y); g.stroke();
      g.globalAlpha = 0.95; g.lineWidth = 1.6;
      g.beginPath(); g.arc(rf.x, rf.y, 9, 0, Math.PI * 2); g.stroke();
      g.fillStyle = accent; g.beginPath(); g.arc(rf.x, rf.y, 1.8, 0, Math.PI * 2); g.fill();
      g.restore();
    }

    // ---- target markers
    for (const tg of state.targets) {
      const p = project(tg.pos, camera);
      const dist = tg.dist;
      if (p.behind || p.x < -40 || p.x > W + 40 || p.y < -40 || p.y > H + 40) {
        // off-screen: edge arrow
        let ax = p.nx, ay = -p.ny;
        if (p.behind) { ax = -ax; ay = -ay; }
        const ang = Math.atan2(ay, ax);
        const m = Math.max(Math.abs(Math.cos(ang)) / (W / 2 - 40), Math.abs(Math.sin(ang)) / (H / 2 - 40));
        const ex = cx + Math.cos(ang) / m, ey = cy + Math.sin(ang) / m;
        g.save(); g.translate(ex, ey); g.rotate(ang); g.fillStyle = tg.locked ? warn : accent; g.globalAlpha = 0.85;
        g.beginPath(); g.moveTo(12, 0); g.lineTo(-6, -8); g.lineTo(-2, 0); g.lineTo(-6, 8); g.closePath(); g.fill(); g.restore();
        continue;
      }
      const s = THREE.MathUtils.clamp(900 / Math.max(dist, 1), 10, 46);
      const col = tg.locked ? warn : accent;
      if (!tg.locked) {
        // unlocked: a quiet rotating diamond of four dots (no text clutter)
        g.save(); g.fillStyle = accent; g.globalAlpha = 0.75;
        for (let i = 0; i < 4; i++) { const a = t * 0.9 + i * Math.PI / 2; g.beginPath(); g.arc(p.x + Math.cos(a) * s, p.y + Math.sin(a) * s, 1.8, 0, Math.PI * 2); g.fill(); }
        g.restore();
        continue;
      }
      // locked: solid bracket, pulsing ring, and a proper target tag with a leader line
      drawBracket(p.x, p.y, s, col, 2.4, 0);
      g.save(); g.strokeStyle = warn; g.globalAlpha = 0.55; g.lineWidth = 1.4;
      const rr = s + 9 + 3 * Math.sin(t * 8);
      g.beginPath(); g.arc(p.x, p.y, rr, 0, Math.PI * 2); g.stroke(); g.restore();
      // tag: to the upper-right of the bracket, flipped near the edges; suppressed over the gauges and radar
      const right = p.x + s + 150 < W - 30;
      const dirx = right ? 1 : -1;
      const ax0 = p.x + dirx * (s + 4), ay0 = p.y - s - 4;
      const ax1 = ax0 + dirx * 18, ay1 = ay0 - 14;
      const tagW = 118, tagH = 30;
      const tx = right ? ax1 : ax1 - tagW, ty = Math.max(84, ay1 - tagH);
      const overGauges = tx < 280 && ty + tagH > H - 130, overRadar = tx + tagW > W - 200 && ty + tagH > H - 200;
      if (!overGauges && !overRadar) {
        g.save();
        g.strokeStyle = warn; g.lineWidth = 1.4; g.globalAlpha = 0.85;
        g.beginPath(); g.moveTo(ax0, ay0); g.lineTo(ax1, ay1); g.lineTo(ax1 + dirx * tagW, ay1); g.stroke();
        g.globalAlpha = 0.55; g.fillStyle = '#0a0410'; roundRect(g, tx, ty, tagW, tagH, 3); g.fill();
        g.globalAlpha = 0.95; g.fillStyle = warn; g.fillRect(right ? tx : tx + tagW - 3, ty, 3, tagH);
        g.fillStyle = '#ffffff'; g.font = `800 12px ${FONT}`; g.letterSpacing = '0.16em'; g.textAlign = 'left';
        g.fillText(tg.name, tx + (right ? 10 : 8), ty + 13);
        g.font = `600 10px ${FONT}`; g.fillStyle = warn; g.letterSpacing = '0.12em';
        g.fillText('LOCK', tx + (right ? 10 : 8), ty + 25);
        g.textAlign = 'right'; g.fillStyle = '#ffffff'; g.font = `700 12px ${FONT}`; g.letterSpacing = '0.04em';
        g.fillText(`${Math.round(dist)}`, tx + tagW - (right ? 8 : 10) - 12, ty + 25);
        g.font = `600 9px ${FONT}`; g.globalAlpha = 0.7; g.fillText('m', tx + tagW - (right ? 8 : 10), ty + 25);
        g.restore();
      }
    }

    // ---- top-left mode label
    g.save();
    g.font = `800 15px ${FONT}`; g.fillStyle = '#ffffff'; g.globalAlpha = 0.92;
    g.letterSpacing = '0.28em';
    g.fillText('ALL-RANGE MODE', 34, 46);
    g.font = `600 11px ${FONT}`; g.fillStyle = accent; g.letterSpacing = '0.2em';
    g.fillText('SECTOR X  ·  METEO BELT', 34, 66);
    // targets remaining: a row of pips (filled = still alive)
    if (state.total) {
      g.font = `700 10px ${FONT}`; g.fillStyle = '#fff'; g.globalAlpha = 0.75; g.letterSpacing = '0.2em';
      g.fillText('TARGETS', 34, 90);
      for (let i = 0; i < state.total; i++) {
        const alive = i < state.remaining;
        g.globalAlpha = alive ? 0.95 : 0.3; g.fillStyle = alive ? '#ff5e5e' : '#7fe0ff';
        g.beginPath(); g.moveTo(102 + i * 14, 82); g.lineTo(107 + i * 14, 87); g.lineTo(102 + i * 14, 92); g.lineTo(97 + i * 14, 87); g.closePath();
        if (alive) g.fill(); else { g.lineWidth = 1; g.strokeStyle = '#7fe0ff'; g.stroke(); }
      }
    }
    g.restore();

    // ---- speed / boost gauge (bottom-left)
    {
      const x = 34, y = H - 60, w = 220, h = 10;
      g.save();
      g.font = `700 11px ${FONT}`; g.fillStyle = '#fff'; g.globalAlpha = 0.85; g.letterSpacing = '0.2em';
      g.fillText('VELOCITY', x, y - 12);
      g.textAlign = 'right'; g.fillStyle = accent; g.fillText(`${Math.round(state.speed * 12)} km/h`, x + w, y - 12);
      g.textAlign = 'left';
      g.globalAlpha = 0.35; g.fillStyle = '#000'; roundRect(g, x - 2, y - 2, w + 4, h + 4, 5); g.fill();
      g.globalAlpha = 0.25; g.fillStyle = '#7fe0ff'; roundRect(g, x, y, w, h, 4); g.fill();
      const f = THREE.MathUtils.clamp(state.speed / state.maxSpeed, 0, 1);
      const grad = g.createLinearGradient(x, 0, x + w, 0); grad.addColorStop(0, '#39a9ff'); grad.addColorStop(0.7, '#7fe0ff'); grad.addColorStop(1, '#ffffff');
      g.globalAlpha = 0.95; g.fillStyle = grad; roundRect(g, x, y, w * f, h, 4); g.fill();
      // boost meter
      const by = y + 22;
      g.font = `700 11px ${FONT}`; g.fillStyle = '#fff'; g.globalAlpha = 0.85; g.fillText('BOOST', x, by + 9 + 12 + 2);
      g.globalAlpha = 0.25; g.fillStyle = gold; roundRect(g, x, by, w, 6, 3); g.fill();
      g.globalAlpha = 0.95; g.fillStyle = state.boostMeter < 0.25 ? warn : gold; roundRect(g, x, by, w * THREE.MathUtils.clamp(state.boostMeter, 0, 1), 6, 3); g.fill();
      g.restore();
    }

    // ---- radar (bottom-right)
    {
      const R = 62, x = W - 34 - R, y = H - 34 - R;
      g.save();
      g.globalAlpha = 0.45; g.fillStyle = '#04101c'; g.beginPath(); g.arc(x, y, R + 6, 0, Math.PI * 2); g.fill();
      g.globalAlpha = 0.8; g.strokeStyle = accent; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.stroke();
      g.globalAlpha = 0.35; g.lineWidth = 1; g.beginPath(); g.arc(x, y, R * 0.5, 0, Math.PI * 2); g.stroke();
      g.beginPath(); g.moveTo(x - R, y); g.lineTo(x + R, y); g.moveTo(x, y - R); g.lineTo(x, y + R); g.stroke();
      // sweep
      const sa = (t * 1.6) % (Math.PI * 2);
      const sw = g.createConicGradient ? g.createConicGradient(sa, x, y) : null;
      if (sw) { sw.addColorStop(0, 'rgba(127,224,255,0.35)'); sw.addColorStop(0.15, 'rgba(127,224,255,0)'); sw.addColorStop(1, 'rgba(127,224,255,0)'); g.globalAlpha = 1; g.fillStyle = sw; g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.fill(); }
      // ship (centre)
      g.globalAlpha = 1; g.fillStyle = '#fff'; g.beginPath(); g.moveTo(x, y - 6); g.lineTo(x + 4, y + 4); g.lineTo(x, y + 2); g.lineTo(x - 4, y + 4); g.closePath(); g.fill();
      // blips: project into ship frame (forward = -z -> up on radar)
      const inv = state.shipQuat.clone().invert();
      const range = 700;
      for (const tg of state.targets) {
        _v.copy(tg.pos).sub(state.shipPos).applyQuaternion(inv);
        const rx = _v.x / range, rz = _v.z / range;
        const len = Math.hypot(rx, rz);
        const k = len > 1 ? 1 / len : 1;
        const px = x + rx * k * R, py = y + rz * k * R;
        const above = _v.y > 15, below = _v.y < -15;
        g.fillStyle = tg.locked ? warn : accent; g.globalAlpha = len > 1 ? 0.45 : 1;
        g.beginPath(); g.arc(px, py, tg.locked ? 4 : 3, 0, Math.PI * 2); g.fill();
        if (above || below) { g.beginPath(); g.moveTo(px, py + (above ? -6 : 6)); g.lineTo(px - 3, py + (above ? -3 : 3)); g.lineTo(px + 3, py + (above ? -3 : 3)); g.closePath(); g.fill(); }
      }
      if (state.planetPos) {
        _v.copy(state.planetPos).sub(state.shipPos).applyQuaternion(inv);
        const a = Math.atan2(_v.z, _v.x);
        g.globalAlpha = 0.9; g.fillStyle = '#6fd1ff';
        g.beginPath(); g.arc(x + Math.cos(a) * (R - 4), y + Math.sin(a) * (R - 4), 5, 0, Math.PI * 2); g.fill();
      }
      g.restore();
    }

    // ---- maneuver callouts
    for (let i = callouts.length - 1; i >= 0; i--) {
      const c = callouts[i];
      const age = (state.time ?? 0) - c.t0;
      if (age > c.dur) { callouts.splice(i, 1); continue; }
      const k = age / c.dur;
      const pop = k < 0.12 ? easeOutBack(k / 0.12) : 1;
      const fade = k > 0.75 ? 1 - (k - 0.75) / 0.25 : 1;
      const minor = c.style === 'minor';
      g.save();
      g.translate(cx, minor ? cy + 92 : cy - 120); g.scale(pop, pop);
      g.globalAlpha = fade * (minor ? 0.9 : 1);
      g.font = minor ? `800 16px ${FONT}` : `900 38px ${FONT}`; g.textAlign = 'center'; g.letterSpacing = minor ? '0.3em' : '0.18em';
      g.lineWidth = minor ? 3 : 6; g.strokeStyle = 'rgba(0,20,40,0.7)'; g.strokeText(c.text, 0, 0);
      if (minor) { g.fillStyle = warn; } else { const gr = g.createLinearGradient(0, -30, 0, 10); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, gold); g.fillStyle = gr; }
      g.fillText(c.text, 0, 0);
      if (!minor) { g.globalAlpha = fade * 0.8; g.fillStyle = gold; const tw = g.measureText(c.text).width; g.fillRect(-tw / 2, 10, tw * Math.min(1, k * 3), 2); }
      g.restore();
    }

    // boost vignette tint / hit flash
    if (b > 0.01) {
      g.save(); const grd = g.createRadialGradient(cx, cy, H * 0.35, cx, cy, H * 0.85);
      grd.addColorStop(0, 'rgba(120,200,255,0)'); grd.addColorStop(1, `rgba(120,200,255,${0.22 * b})`);
      g.fillStyle = grd; g.fillRect(0, 0, W, H); g.restore();
    }
  }

  function dispose() { cv.remove(); }
  return { state, resize, draw, callout, dispose, canvas: cv };
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
}
function easeOutBack(x) { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(x - 1, 3) + c1 * Math.pow(x - 1, 2); }
