// DOM overlay: letterbox bars, vignette/grade, animated logo, captions, score tally.
import { clamp01, lerp, Ease } from './tween.js';

const FONT_DISPLAY = `"Liberation Sans Narrow","Arial Narrow",Impact,"Helvetica Neue",Arial,sans-serif`;
const FONT_UI = `"Liberation Sans","Helvetica Neue",Arial,sans-serif`;

export class Overlay {
  constructor(ui) {
    this.ui = ui;
    this.root = el('div', `position:absolute;inset:0;overflow:hidden;pointer-events:none;`);
    ui.appendChild(this.root);

    // (vignette + grain live in the lookdev grade pass; full-screen DOM layers are
    // expensive in software compositing so we keep the overlay to bars/text only)

    // letterbox
    this.barTop = el('div', `position:absolute;left:0;right:0;top:0;height:12%;background:#000;transform:translateY(-100%);`);
    this.barBot = el('div', `position:absolute;left:0;right:0;bottom:0;height:12%;background:#000;transform:translateY(100%);`);
    this.root.appendChild(this.barTop); this.root.appendChild(this.barBot);

    // fade / flash
    this.fade = el('div', `position:absolute;inset:0;background:#000;opacity:1;`);
    this.flash = el('div', `position:absolute;inset:0;background:#fff;opacity:0;`);
    this.root.appendChild(this.fade); this.root.appendChild(this.flash);

    // logo
    this.logoWrap = el('div', `position:absolute;left:50%;top:26%;transform:translate(-50%,-50%);width:min(70vw,900px);opacity:0;`);
    this.logo = document.createElement('canvas'); this.logo.style.cssText = 'width:100%;display:block;';
    this.logoGlow = document.createElement('canvas'); this.logoGlow.style.cssText = 'position:absolute;inset:0;width:100%;display:block;opacity:0;';
    this.logoWrap.appendChild(this.logoGlow);
    this.logoWrap.appendChild(this.logo);
    this.root.appendChild(this.logoWrap);
    drawLogo(this.logo, 'STARWING');
    drawLogo(this.logoGlow, 'STARWING', true);
    this.sub = el('div', `position:absolute;left:50%;top:41%;transform:translateX(-50%);font:600 clamp(11px,1.3vw,18px) ${FONT_UI};letter-spacing:.55em;color:#cfe4ff;opacity:0;text-shadow:0 0 12px rgba(120,180,255,.8);white-space:nowrap;`);
    this.sub.textContent = 'LYLAT SYSTEM DEFENSE FORCE';
    this.root.appendChild(this.sub);
    this.press = el('div', `position:absolute;left:50%;top:78%;transform:translateX(-50%);font:700 clamp(14px,1.9vw,26px) ${FONT_UI};letter-spacing:.35em;color:#fff;opacity:0;text-shadow:0 0 14px rgba(120,200,255,.9),0 2px 4px #000;white-space:nowrap;`);
    this.press.textContent = 'PRESS START';
    this.root.appendChild(this.press);
    this.copy = el('div', `position:absolute;left:50%;bottom:5%;transform:translateX(-50%);font:500 clamp(9px,1vw,13px) ${FONT_UI};letter-spacing:.2em;color:rgba(200,215,240,.6);opacity:0;white-space:nowrap;`);
    this.copy.textContent = '© STARWING TEAM · PROCEDURAL BUILD';
    this.root.appendChild(this.copy);

    // caption (level start lower third)
    this.capWrap = el('div', `position:absolute;left:8%;bottom:20%;opacity:0;`);
    this.capKicker = el('div', `font:700 clamp(11px,1.3vw,18px) ${FONT_UI};letter-spacing:.5em;color:#8fd0ff;text-shadow:0 0 10px rgba(80,160,255,.9);margin-bottom:.4em;`);
    this.capTitle = el('div', `font:italic 900 clamp(40px,7vw,96px) ${FONT_DISPLAY};letter-spacing:.04em;line-height:.95;color:#fff;
      text-shadow:0 0 30px rgba(120,190,255,.55),0 4px 0 #1c3f8a,0 8px 18px rgba(0,0,0,.7);`);
    this.capLine = el('div', `height:3px;width:0;margin-top:.5em;background:linear-gradient(90deg,#8fd0ff,#2f66e0 60%,transparent);box-shadow:0 0 12px rgba(120,190,255,.8);`);
    this.capWrap.append(this.capKicker, this.capTitle, this.capLine);
    this.root.appendChild(this.capWrap);

    // big centre title (MISSION COMPLETE)
    this.big = el('div', `position:absolute;left:50%;top:22%;transform:translate(-50%,-50%) scale(1);font:italic 900 clamp(44px,8vw,110px) ${FONT_DISPLAY};letter-spacing:.06em;color:#fff;opacity:0;white-space:nowrap;
      color:#fff1d6;text-shadow:0 0 34px rgba(255,190,110,.6),0 4px 0 #a8561a,0 8px 20px rgba(0,0,0,.7);`);
    this.big.textContent = 'MISSION COMPLETE';
    this.root.appendChild(this.big);

    // score tally
    this.tally = el('div', `position:absolute;left:50%;top:38%;transform:translateX(-50%);width:min(44vw,560px);opacity:0;font:700 clamp(14px,1.8vw,24px) ${FONT_UI};letter-spacing:.2em;color:#e8f1ff;`);
    this.root.appendChild(this.tally);
    this.rows = [];

    this.time = 0;
    this._letter = 0; this._letterT = 0;
    window.__ov = this; // debug hook
  }

  /* ----- letterbox ----- */
  letterbox(on, dur = 0.8) { this._letterT = on ? 1 : 0; this._letterDur = dur; }
  _tickLetter(dt) {
    const target = this._letterT;
    this._letter = lerp(this._letter, target, 1 - Math.exp(-dt * (5.5 / (this._letterDur || 0.8))));
    const e = Ease.outCubic(clamp01(this._letter));
    this.barTop.style.transform = `translateY(${(-100 + 100 * e).toFixed(2)}%)`;
    this.barBot.style.transform = `translateY(${(100 - 100 * e).toFixed(2)}%)`;
  }

  setFade(a) { this.fade.style.opacity = clamp01(a).toFixed(3); }
  setFlash(a) { this.flash.style.opacity = clamp01(a).toFixed(3); }

  /* ----- title ----- */
  setLogo(vis, scale = 1, y = 26, glow = 1) {
    this.logoWrap.style.opacity = clamp01(vis).toFixed(3);
    this.logoWrap.style.top = `${y}%`;
    this.logoWrap.style.transform = `translate(-50%,-50%) scale(${scale.toFixed(4)})`;
    this.logoGlow.style.opacity = clamp01((glow - 1) * 0.9).toFixed(3);
  }
  setSub(a) { this.sub.style.opacity = clamp01(a).toFixed(3); }
  setPress(a) { this.press.style.opacity = clamp01(a).toFixed(3); }
  setCopy(a) { this.copy.style.opacity = clamp01(a).toFixed(3); }

  /* ----- caption ----- */
  caption(kicker, title) { this.capKicker.textContent = kicker; this.capTitle.textContent = title; }
  setCaption(a, slide = 0, line = 1) {
    this.capWrap.style.opacity = clamp01(a).toFixed(3);
    this.capWrap.style.transform = `translateX(${(slide * -60).toFixed(1)}px)`;
    this.capLine.style.width = `${(clamp01(line) * 100).toFixed(1)}%`;
  }

  /* ----- mission complete ----- */
  setBig(a, scale = 1, text) {
    if (text !== undefined) this.big.textContent = text;
    this.big.style.opacity = clamp01(a).toFixed(3);
    this.big.style.transform = `translate(-50%,-50%) scale(${scale.toFixed(4)})`;
  }
  buildTally(rows) {
    this.tally.innerHTML = '';
    this.rows = rows.map((r) => {
      const row = el('div', `display:flex;justify-content:space-between;align-items:baseline;padding:.35em 0;border-bottom:1px solid rgba(140,180,255,.25);opacity:0;transform:translateX(40px);`);
      const k = el('span', `color:#9ecbff;font-size:.8em;letter-spacing:.35em;`); k.textContent = r.label;
      const v = el('span', `font-family:${FONT_DISPLAY};font-style:italic;font-weight:900;font-size:1.45em;letter-spacing:.05em;color:#fff;text-shadow:0 0 12px rgba(120,190,255,.6);font-variant-numeric:tabular-nums;`);
      v.textContent = r.format ? r.format(0) : '0';
      row.append(k, v);
      if (r.total) { row.style.borderBottom = 'none'; row.style.borderTop = '2px solid rgba(255,200,120,.6)'; row.style.marginTop = '.4em'; k.style.color = '#ffd9a0'; v.style.color = '#ffe6b8'; v.style.fontSize = '1.9em'; v.style.textShadow = '0 0 18px rgba(255,200,120,.7)'; }
      this.tally.appendChild(row);
      return { ...r, row, v, shown: 0 };
    });
  }
  setTally(a) { this.tally.style.opacity = clamp01(a).toFixed(3); }
  /** progress p in [0,1] over whole tally; rows reveal staggered and count up. */
  tickTally(p) {
    const n = this.rows.length;
    this.rows.forEach((r, i) => {
      const start = i / (n + 0.6), end = start + 1 / (n + 0.6) * 1.3;
      const u = clamp01((p - start) / (end - start));
      const eIn = Ease.outBack(clamp01(u * 2.2));
      r.row.style.opacity = clamp01(u * 4).toFixed(3);
      r.row.style.transform = `translateX(${(40 * (1 - eIn)).toFixed(1)}px)`;
      const val = Math.round(r.value * Ease.outQuart(u));
      const txt = r.format ? r.format(val) : String(val);
      if (r.v.textContent !== txt) { r.v.textContent = txt; r.lastChange = this.time; }
      const pop = r.lastChange !== undefined ? clamp01(1 - (this.time - r.lastChange) / 0.12) : 0;
      r.v.style.transform = `scale(${(1 + pop * 0.08).toFixed(3)})`;
      r.v.style.display = 'inline-block';
    });
  }

  update(dt) {
    this.time += dt;
    this._tickLetter(dt);
  }

  dispose() { this.root.remove(); }
}

function el(tag, css) { const e = document.createElement(tag); e.style.cssText = css; return e; }

function grainDataUrl() {
  const c = document.createElement('canvas'); c.width = c.height = 180;
  const g = c.getContext('2d'); const img = g.createImageData(180, 180);
  for (let i = 0; i < img.data.length; i += 4) { const v = 128 + (Math.random() - 0.5) * 255; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
  g.putImageData(img, 0, 0);
  return c.toDataURL();
}

/** Chrome / bevelled logotype with wing emblem, rendered to canvas. */
export function drawLogo(canvas, text, glowOnly = false) {
  const W = 1800, H = 620; canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  g.clearRect(0, 0, W, H);
  if (glowOnly) {
    // additive-looking bloom pass drawn once (used as a fading overlay for the logo hit)
    g.save(); g.translate(W / 2, H * 0.5); g.transform(1, 0, -0.18, 1, 0, 0);
    g.font = `900 300px ${FONT_DISPLAY}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.letterSpacing = '14px';
    g.shadowColor = 'rgba(140,200,255,1)'; g.shadowBlur = 60; g.fillStyle = 'rgba(200,230,255,.9)';
    g.fillText(text, 0, 0); g.fillText(text, 0, 0);
    g.restore();
    return;
  }
  // soft drop glow + shadow baked in (no CSS filters)
  g.save(); g.translate(W / 2, H * 0.5); g.transform(1, 0, -0.18, 1, 0, 0);
  g.font = `900 300px ${FONT_DISPLAY}`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.letterSpacing = '14px';
  g.shadowColor = 'rgba(70,140,255,.75)'; g.shadowBlur = 48; g.fillStyle = 'rgba(0,0,0,0.01)'; g.fillText(text, 0, 0); g.fillText(text, 0, 0);
  g.shadowColor = 'rgba(0,0,0,.7)'; g.shadowBlur = 24; g.shadowOffsetY = 14; g.fillStyle = '#000'; g.fillText(text, 0, 0);
  g.restore();
  // wing emblem behind text: two swept chevrons
  g.save(); g.translate(W / 2, H * 0.47);
  const wing = (dir) => {
    g.beginPath(); g.moveTo(dir * 60, -30); g.lineTo(dir * 760, -190); g.lineTo(dir * 820, -150); g.lineTo(dir * 300, 10); g.lineTo(dir * 700, 120); g.lineTo(dir * 640, 165); g.lineTo(dir * 60, 60); g.closePath();
  };
  for (const dir of [-1, 1]) {
    const grd = g.createLinearGradient(0, -200, 0, 170);
    grd.addColorStop(0, '#6fb4ff'); grd.addColorStop(0.5, '#1f4fc4'); grd.addColorStop(1, '#0b2470');
    g.fillStyle = grd; wing(dir); g.fill();
    g.strokeStyle = 'rgba(190,225,255,.9)'; g.lineWidth = 4; wing(dir); g.stroke();
  }
  g.restore();
  // logotype
  g.save(); g.translate(W / 2, H * 0.5);
  g.transform(1, 0, -0.18, 1, 0, 0); // italic skew
  g.font = `900 300px ${FONT_DISPLAY}`; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.letterSpacing = '14px';
  // extrusion (depth)
  for (let i = 14; i > 0; i--) { g.fillStyle = i > 4 ? '#0a1a4a' : '#16307a'; g.fillText(text, i * 0.9, i * 1.4); }
  // dark outline
  g.lineJoin = 'round'; g.lineWidth = 22; g.strokeStyle = '#061033'; g.strokeText(text, 0, 0);
  // chrome fill
  const grd = g.createLinearGradient(0, -130, 0, 130);
  grd.addColorStop(0, '#ffffff'); grd.addColorStop(0.38, '#dbeeff'); grd.addColorStop(0.5, '#4f8fe8'); grd.addColorStop(0.52, '#1a4fc0'); grd.addColorStop(0.75, '#6fb0ff'); grd.addColorStop(1, '#ffffff');
  g.fillStyle = grd; g.fillText(text, 0, 0);
  // inner light stroke
  g.lineWidth = 4; g.strokeStyle = 'rgba(255,255,255,.55)'; g.strokeText(text, 0, -2);
  // red racing stripe accent under text
  g.restore();
  g.save(); g.translate(W / 2, H * 0.5 + 175);
  g.fillStyle = '#e63946'; g.beginPath(); g.moveTo(-520, 0); g.lineTo(560, 0); g.lineTo(540, 16); g.lineTo(-500, 16); g.closePath(); g.fill();
  g.fillStyle = '#fff'; g.fillRect(-500, 22, 980, 3);
  g.restore();
}
