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

  function callout(text, dur = 1.6) { callouts.push({ text, t0: state.time ?? 0, dur }); }

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

    // ---- reticle (two-stage, Star Fox style)
    const b = state.boost;
    g.save();
    g.globalAlpha = 0.9;
    g.strokeStyle = accent; g.lineWidth = 2;
    // near ring
    g.beginPath(); g.arc(cx, cy, 34 + b * 6, 0, Math.PI * 2); g.stroke();
    // far reticle
    g.lineWidth = 1.5; g.globalAlpha = 0.6;
    g.beginPath(); g.arc(cx, cy, 12, 0, Math.PI * 2); g.stroke();
    g.globalAlpha = 0.9;
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + Math.PI / 4;
      g.beginPath(); g.moveTo(cx + Math.cos(a) * 42, cy + Math.sin(a) * 42); g.lineTo(cx + Math.cos(a) * 56, cy + Math.sin(a) * 56); g.stroke();
    }
    g.restore();

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
      drawBracket(p.x, p.y, s, col, tg.locked ? 2.5 : 1.6, tg.locked ? 0 : Math.PI / 4 * 0 + t * 0.6);
      if (tg.locked) {
        g.save(); g.strokeStyle = warn; g.globalAlpha = 0.6; g.lineWidth = 1.5;
        const rr = s + 10 + 4 * Math.sin(t * 8);
        g.beginPath(); g.arc(p.x, p.y, rr, 0, Math.PI * 2); g.stroke(); g.restore();
      }
      g.save(); g.fillStyle = col; g.font = `600 ${11}px ${FONT}`; g.textAlign = 'left'; g.globalAlpha = 0.9;
      g.fillText(`${tg.name}  ${Math.round(dist)}m`, p.x + s + 6, p.y - s + 4); g.restore();
    }

    // ---- top-left mode label
    g.save();
    g.font = `800 15px ${FONT}`; g.fillStyle = '#ffffff'; g.globalAlpha = 0.92;
    g.letterSpacing = '0.28em';
    g.fillText('ALL-RANGE MODE', 34, 46);
    g.font = `600 11px ${FONT}`; g.fillStyle = accent; g.letterSpacing = '0.2em';
    g.fillText('SECTOR X  ·  METEO BELT', 34, 66);
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
      g.save();
      g.translate(cx, cy - 120); g.scale(pop, pop);
      g.globalAlpha = fade;
      g.font = `900 38px ${FONT}`; g.textAlign = 'center'; g.letterSpacing = '0.18em';
      g.lineWidth = 6; g.strokeStyle = 'rgba(0,20,40,0.7)'; g.strokeText(c.text, 0, 0);
      const gr = g.createLinearGradient(0, -30, 0, 10); gr.addColorStop(0, '#ffffff'); gr.addColorStop(1, gold);
      g.fillStyle = gr; g.fillText(c.text, 0, 0);
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
