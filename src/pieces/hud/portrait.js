// Procedural animated wingman portraits (canvas 2D) in a CEL-SHADED, INKED
// style: every form is a flat base colour with ONE hard-edged shadow crescent
// on the side away from the key light (upper-left), a thin cool rim sliver on
// the far edge, a hard highlight chip, and a coloured ink outline whose weight
// is heavier on the silhouette than on interior lines. Heads are built as
// proper models — wedge skull, defined jaw, protruding muzzle, almond eyes
// with thick upper lids — rather than stacked ellipses.
// Animation: blinking, mouth flaps w/ teeth+tongue, brow emotes, head bob /
// tilt, gaze drift, CRT-ish comm signal (scanlines, open-glitch, flash).

export const CHARACTERS = {
  fox:    { kind: 'fox',  fur: '#e9812c', furDark: '#a8481a', furLight: '#ffb35a', muzzle: '#fbf3e6', muzzleDark: '#cfb59a', eye: '#3fcf7a', eyeDark: '#125a32', accent: '#d4392c', jacket: '#3f7a4e', jacketDark: '#224230', ink: '#3a1408', name: 'FOX' },
  peppy:  { kind: 'hare', fur: '#b8ab98', furDark: '#7a6a58', furLight: '#e6dccb', muzzle: '#f6f1e8', muzzleDark: '#c8bcad', eye: '#8a5a34', eyeDark: '#3a2010', accent: '#c43a2e', jacket: '#8a3a2e', jacketDark: '#4a1c16', ink: '#2e2018', name: 'PEPPY' },
  falco:  { kind: 'bird', fur: '#3d86ea', furDark: '#1e4aa6', furLight: '#8ec2ff', muzzle: '#f4c541', muzzleDark: '#b07a14', eye: '#eef2f8', eyeDark: '#8ea0b8', accent: '#d83a2e', jacket: '#9a2e26', jacketDark: '#4c1410', ink: '#101a40', name: 'FALCO' },
  slippy: { kind: 'frog', fur: '#5fcd5c', furDark: '#2f8a3a', furLight: '#a9f08e', muzzle: '#e2f5be', muzzleDark: '#a6c47e', eye: '#3a2a1a', eyeDark: '#140c04', accent: '#d83a2e', jacket: '#d1a63c', jacketDark: '#6e4c12', ink: '#0f3a1a', name: 'SLIPPY' },
  // ROB 64: gunmetal trapezoid head, single amber visor, cheek bolts, antenna
  rob:    { kind: 'rob',  fur: '#aeb8c8', furDark: '#5c6674', furLight: '#e8eef8', muzzle: '#3a4352', muzzleDark: '#222933', eye: '#ffc93a', eyeDark: '#8a4a10', accent: '#d83a2e', jacket: '#2a3550', jacketDark: '#141c30', ink: '#14181f', name: 'ROB 64' },
};

const TAU = Math.PI * 2;
const hex2rgb = (h) => {
  if (h[0] !== '#') return h.match(/[\d.]+/g).slice(0, 3).map(Number);
  if (h.length === 4) h = '#' + h[1] + h[1] + h[2] + h[2] + h[3] + h[3];
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
};
const rgba = (h, a) => { const [r, g, b] = hex2rgb(h); return `rgba(${r},${g},${b},${a})`; };
const mix = (a, b, t) => { const A = hex2rgb(a), B = hex2rgb(b); return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * t)).join(',')})`; };
// key light direction (screen space, y down): upper-left
const LX = -0.62, LY = -0.78;
const SHADOW_TINT = '#4a2a6a'; // cool violet shadows, warm light

export function createPortrait(size = 164, dpr = Math.min(devicePixelRatio || 1, 2)) {
  const cv = document.createElement('canvas');
  cv.width = size * dpr; cv.height = size * dpr;
  cv.style.width = size + 'px'; cv.style.height = size + 'px';
  const g = cv.getContext('2d');
  const S = size / 100; // draw in a 100x100 space

  const st = {
    char: CHARACTERS.fox, talking: false, mouth: 0, mouthTarget: 0,
    blink: 0, nextBlink: 1.5, brow: 0, browTarget: 0, glitch: 0, t: 0, bob: 0, look: 0, lookT: 0, lookY: 0,
    mood: 'calm', pulse: 0, tilt: 0, nod: 0,
  };
  const rnd = () => Math.random();

  function update(dt) {
    st.t += dt;
    st.nextBlink -= dt;
    if (st.nextBlink <= 0) { st.blink = 1; st.nextBlink = 1.4 + rnd() * 3; if (rnd() < 0.25) st.nextBlink = 0.22; }
    st.blink = Math.max(0, st.blink - dt * 8);
    if (st.talking) {
      st.lookT -= dt;
      if (st.lookT <= 0) { st.mouthTarget = rnd() < 0.2 ? 0.06 : 0.25 + rnd() * 0.75; st.lookT = 0.06 + rnd() * 0.1; }
    } else st.mouthTarget = 0;
    st.mouth += (st.mouthTarget - st.mouth) * Math.min(1, dt * 26);
    st.browTarget = st.mood === 'alarm' ? 1 : st.mood === 'happy' ? -0.6 : st.talking ? Math.sin(st.t * 3.1) * 0.35 : 0;
    st.brow += (st.browTarget - st.brow) * Math.min(1, dt * 8);
    st.bob = Math.sin(st.t * 2.2) * 0.7 + (st.talking ? Math.sin(st.t * 9.7) * 0.6 : 0);
    st.nod = st.talking ? Math.sin(st.t * 4.3) * 0.6 : 0;
    st.tilt += ((st.talking ? Math.sin(st.t * 1.7) * 0.05 : Math.sin(st.t * 0.8) * 0.02) - st.tilt) * Math.min(1, dt * 3);
    st.look += ((Math.sin(st.t * 0.7) * 0.6 + Math.sin(st.t * 1.9) * 0.4) * 1.6 - st.look) * dt * 2;
    st.lookY += ((Math.sin(st.t * 0.5 + 1) * 0.5) - st.lookY) * dt * 2;
    st.glitch = Math.max(0, st.glitch - dt * 2.2);
    st.pulse = Math.max(0, st.pulse - dt * 3);
  }

  // ------------------------------------------------------------------ path helpers
  const BIG = () => g.fillRect(-200, -200, 400, 400);
  const ellipse = (x, y, rx, ry, rot = 0) => () => { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, TAU); g.closePath(); };
  const poly = (pts) => () => { g.beginPath(); pts.forEach((p, i) => (i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1]))); g.closePath(); };
  /** mirror-symmetric closed path: right half from (0,y0) as segments ['L',x,y] | ['C',x1,y1,x2,y2,x,y] ending on x=0 */
  function sym(y0, segs, sx = 1) {
    const end = (s) => [s[s.length - 2], s[s.length - 1]];
    return () => {
      g.beginPath(); g.moveTo(0, y0);
      for (const s of segs) s[0] === 'L' ? g.lineTo(s[1] * sx, s[2]) : g.bezierCurveTo(s[1] * sx, s[2], s[3] * sx, s[4], s[5] * sx, s[6]);
      for (let i = segs.length - 1; i >= 0; i--) {
        const s = segs[i], p = i > 0 ? end(segs[i - 1]) : [0, y0];
        if (s[0] === 'L') g.lineTo(-p[0] * sx, p[1]); else g.bezierCurveTo(-s[3] * sx, s[4], -s[1] * sx, s[2], -p[0] * sx, p[1]);
      }
      g.closePath();
    };
  }
  function fill(path, style) { path(); g.fillStyle = style; g.fill(); }
  /** coloured ink outline. `w` silhouette weight. */
  function ink(path, w = 1.6, col = st.char.ink, alpha = 1) {
    g.save(); g.globalAlpha = alpha; path(); g.lineWidth = w; g.strokeStyle = col; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); g.restore();
  }
  function stroke(fn, w, col = st.char.ink, alpha = 1) { g.save(); g.globalAlpha = alpha; g.beginPath(); fn(); g.lineWidth = w; g.strokeStyle = col; g.lineJoin = 'round'; g.lineCap = 'round'; g.stroke(); g.restore(); }

  /**
   * Cel-shade a closed path: flat base; hard shadow crescent on the side away
   * from the light (depth px); thin cool rim sliver on the far edge; hard
   * highlight chip near the lit edge (a shrunk copy of the path pushed toward
   * the light). Everything is clipped to the path.
   */
  function cel(path, base, opts = {}) {
    const {
      cx = 0, cy = 0, r = 10, depth = Math.max(1.6, r * 0.24), shadow = mix(base, SHADOW_TINT, 0.38), light = mix(base, '#ffffff', 0.32),
      rim = mix(shadow, '#a8d8ff', 0.5), rimW = 1.15, hi = 0.55, hiPush = 0.55, hiAlpha = 1, dx = 0, dy = 0, shadowOnly = false,
    } = opts;
    g.save(); path(); g.clip();
    g.fillStyle = rim; BIG();
    g.save(); g.translate(LX * rimW, LY * rimW); path(); g.fillStyle = shadow; g.fill(); g.restore();
    g.save(); g.translate(LX * depth + dx, LY * depth + dy); path(); g.fillStyle = base; g.fill(); g.restore();
    if (hi > 0 && !shadowOnly) {
      g.save(); g.globalAlpha = hiAlpha;
      const px = cx + LX * r * hiPush, py = cy + LY * r * hiPush;
      g.translate(px, py); g.scale(hi, hi); g.translate(-cx, -cy); path(); g.fillStyle = light; g.fill(); g.restore();
    }
    g.restore();
  }

  // ------------------------------------------------------------------ frame
  function draw() {
    const c = st.char;
    g.setTransform(dpr * S, 0, 0, dpr * S, 0, 0);
    g.filter = 'none';
    // background: cockpit-blue comm screen, soft key from upper-left, faint grid, halo
    const bg = g.createRadialGradient(30, 22, 4, 50, 50, 84);
    bg.addColorStop(0, '#1d4f96'); bg.addColorStop(0.45, '#0b2556'); bg.addColorStop(1, '#03081c');
    g.fillStyle = bg; g.fillRect(0, 0, 100, 100);
    g.strokeStyle = 'rgba(90,170,255,.09)'; g.lineWidth = 0.5;
    for (let i = 0; i <= 100; i += 10) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 100); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(100, i); g.stroke(); }
    // diagonal hatch band (transmission carrier)
    g.strokeStyle = 'rgba(120,200,255,.028)'; g.lineWidth = 1.5;
    for (let i = -100; i < 100; i += 7) { g.beginPath(); g.moveTo(i, 100); g.lineTo(i + 100, 0); g.stroke(); }
    const halo = g.createRadialGradient(52, 56, 6, 52, 56, 48);
    halo.addColorStop(0, rgba(c.furLight, 0.32)); halo.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = halo; g.fillRect(0, 0, 100, 100);
    const sb = ((st.t * 16) % 130) - 15;
    const sbg = g.createLinearGradient(0, sb - 7, 0, sb + 7); sbg.addColorStop(0, 'rgba(120,200,255,0)'); sbg.addColorStop(0.5, 'rgba(120,200,255,.10)'); sbg.addColorStop(1, 'rgba(120,200,255,0)');
    g.fillStyle = sbg; g.fillRect(0, sb - 7, 100, 14);

    // drop shadow of the whole character on the screen glass
    g.save(); g.translate(50 + st.look * 0.4 + 3, 54 + st.bob + 4); g.rotate(st.tilt); g.globalAlpha = 0.45; g.fillStyle = '#020616';
    headSilhouette(c)(); g.fill(); g.restore();

    drawTorso(c);

    g.save();
    g.translate(50 + st.look * 0.4, 54 + st.bob);
    g.rotate(st.tilt);
    drawHead(c);
    g.restore();

    // comm signal: fine scanlines, vignette, glitch, flash
    g.fillStyle = 'rgba(0,0,0,.075)';
    for (let y = 0; y < 100; y += 2) g.fillRect(0, y, 100, 0.7);
    const vg = g.createRadialGradient(50, 50, 40, 50, 50, 76);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.5)');
    g.fillStyle = vg; g.fillRect(0, 0, 100, 100);
    const gl = g.createLinearGradient(0, 0, 100, 100); gl.addColorStop(0, 'rgba(255,255,255,.09)'); gl.addColorStop(0.25, 'rgba(255,255,255,0)'); gl.addColorStop(0.8, 'rgba(120,180,255,0)'); gl.addColorStop(1, 'rgba(120,180,255,.08)');
    g.fillStyle = gl; g.fillRect(0, 0, 100, 100);
    if (st.glitch > 0) {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (let i = 0; i < 6; i++) {
        const y = Math.floor(rnd() * size), h = 2 + rnd() * 10 * st.glitch, dx = (rnd() - 0.5) * 30 * st.glitch;
        g.drawImage(cv, 0, y * dpr, cv.width, h * dpr, dx, y, size, h);
      }
      g.fillStyle = `rgba(120,220,255,${0.22 * st.glitch})`; g.fillRect(0, 0, size, size);
    }
    if (st.pulse > 0) { g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = `rgba(255,255,255,${st.pulse * 0.5})`; g.fillRect(0, 0, size, size); }
  }

  // ------------------------------------------------------------------ torso: flight jacket + collar
  function drawTorso(c) {
    const body = () => { g.beginPath(); g.moveTo(-8, 104); g.lineTo(10, 84); g.bezierCurveTo(24, 76, 40, 74, 50, 74); g.bezierCurveTo(60, 74, 76, 76, 90, 84); g.lineTo(108, 104); g.closePath(); };
    cel(body, c.jacket, { cx: 50, cy: 96, r: 40, depth: 6, hi: 0.5, hiPush: 0.7 });
    // seams + shoulder pads
    stroke(() => { g.moveTo(24, 102); g.quadraticCurveTo(30, 86, 40, 80); g.moveTo(76, 102); g.quadraticCurveTo(70, 86, 60, 80); }, 1.1, c.ink, 0.8);
    ink(body, 1.8, c.ink);
    // white scarf / collar (two lapels meeting under the chin)
    const collar = () => { g.beginPath(); g.moveTo(31, 80); g.quadraticCurveTo(50, 92, 69, 80); g.lineTo(72, 87); g.quadraticCurveTo(50, 101, 28, 87); g.closePath(); };
    cel(collar, '#f2f5fa', { cx: 50, cy: 88, r: 18, depth: 3.5, hi: 0.5, shadow: '#a9b7d2' });
    ink(collar, 1.3, '#3a4a6a');
    stroke(() => { g.moveTo(50, 90); g.lineTo(50, 100); }, 1, '#3a4a6a', 0.7);
    // accent band
    const band = () => { g.beginPath(); g.moveTo(40, 92); g.quadraticCurveTo(50, 98, 60, 92); g.lineTo(60, 95.5); g.quadraticCurveTo(50, 101.5, 40, 95.5); g.closePath(); };
    cel(band, c.accent, { cx: 50, cy: 95, r: 10, depth: 2, hi: 0.4 });
    ink(band, 1, c.ink);
    // rank pin
    fill(ellipse(70, 92, 1.6, 1.6), '#f0d070'); ink(ellipse(70, 92, 1.6, 1.6), 0.7, '#5a3a08'); fill(ellipse(69.5, 91.5, 0.55, 0.55), '#fffbe0');
  }

  // ------------------------------------------------------------------ eyes
  /** almond eye path: inner corner lower, outer corner higher, thick straight-ish upper lid */
  function eyePath(s, ex, ey, w, h, tilt = 0.25) {
    return () => {
      g.beginPath();
      g.moveTo(ex - s * w, ey + h * 0.25);
      g.bezierCurveTo(ex - s * w * 0.55, ey - h * 1.05 - tilt, ex + s * w * 0.55, ey - h * 1.05 - tilt * 2, ex + s * w * 1.02, ey - h * 0.15 - tilt * 2);
      g.bezierCurveTo(ex + s * w * 0.8, ey + h * 0.65, ex - s * w * 0.35, ey + h * 0.8, ex - s * w, ey + h * 0.25);
      g.closePath();
    };
  }
  function eye(c, ex, ey, s, w, h, lidClose, b, opts = {}) {
    const { tilt = 0.25, irisScale = 0.78, lidCol = c.fur, lidBase = 0, inkCol = c.ink, irisCol = c.eye, irisDark = c.eyeDark, shade = 0.42 } = opts;
    const p = eyePath(s, ex, ey, w, h, tilt);
    // eye white with hard shadow band under the upper lid
    g.save(); p(); g.clip();
    g.fillStyle = '#b9c8de'; BIG();
    g.save(); g.translate(0, h * shade); p(); g.fillStyle = '#f9fbff'; g.fill(); g.restore();
    // iris: large, flat, dark ring, hard highlight chip
    const px = ex + st.look * 0.9 + s * 0.4, py = ey + h * 0.05 + st.lookY * 0.6;
    const ir = h * irisScale;
    g.fillStyle = irisDark; g.beginPath(); g.ellipse(px, py, ir * 1.02, ir * 1.12, 0, 0, TAU); g.fill();
    g.fillStyle = irisCol; g.beginPath(); g.ellipse(px, py + ir * 0.12, ir * 0.82, ir * 0.9, 0, 0, TAU); g.fill();
    g.fillStyle = mix(irisCol, '#ffffff', 0.35); g.beginPath(); g.ellipse(px, py + ir * 0.45, ir * 0.5, ir * 0.42, 0, 0, TAU); g.fill();
    const pr = ir * (st.mood === 'alarm' ? 0.36 : 0.46);
    g.fillStyle = '#0a0608'; g.beginPath(); g.ellipse(px, py, pr, pr * 1.15, 0, 0, TAU); g.fill();
    g.fillStyle = '#ffffff'; g.beginPath(); g.ellipse(px + LX * ir * 0.5, py + LY * ir * 0.5, ir * 0.3, ir * 0.22, -0.55, 0, TAU); g.fill();
    g.fillStyle = 'rgba(255,255,255,.7)'; g.beginPath(); g.ellipse(px + ir * 0.45, py + ir * 0.45, ir * 0.1, ir * 0.1, 0, 0, TAU); g.fill();
    // lower lid shadow line inside the white
    g.restore();
    // eyelid (fur-coloured) - blink from top; alarm narrows; some characters rest half-lidded
    // angry brows narrow the eye a touch; ALARM widens instead (no lid)
    const lid = Math.max(lidClose, st.mood === 'alarm' ? 0 : Math.max(0, b) * 0.22, st.mood === 'alarm' ? lidBase * 0.4 : lidBase);
    if (lid > 0.01) {
      g.save(); p(); g.clip();
      const top = ey - h * 1.1 - tilt * 2 - 1, lh = (h * 2.4 + 2) * lid;
      g.fillStyle = lidCol; g.fillRect(ex - w - 2, top, w * 2 + 4, lh);
      g.fillStyle = mix(lidCol, SHADOW_TINT, 0.35); g.fillRect(ex - w - 2, top + lh - 1.3, w * 2 + 4, 1.3);
      g.strokeStyle = inkCol; g.lineWidth = 1.2; g.beginPath(); g.moveTo(ex - w - 2, top + lh - 0.2); g.lineTo(ex + w + 2, top + lh - 0.2); g.stroke();
      g.restore();
    }
    // ink: thick upper lid, thin lower lid
    g.save(); g.lineCap = 'round';
    g.strokeStyle = inkCol; g.lineWidth = 1.9; g.beginPath();
    g.moveTo(ex - s * w, ey + h * 0.25);
    g.bezierCurveTo(ex - s * w * 0.55, ey - h * 1.05 - tilt, ex + s * w * 0.55, ey - h * 1.05 - tilt * 2, ex + s * w * 1.02, ey - h * 0.15 - tilt * 2); g.stroke();
    g.lineWidth = 0.9; g.beginPath();
    g.moveTo(ex + s * w * 1.02, ey - h * 0.15 - tilt * 2);
    g.bezierCurveTo(ex + s * w * 0.8, ey + h * 0.65, ex - s * w * 0.35, ey + h * 0.8, ex - s * w, ey + h * 0.25); g.stroke();
    // outer-corner lash flick
    g.lineWidth = 1.6; g.beginPath(); g.moveTo(ex + s * w * 1.0, ey - h * 0.15 - tilt * 2); g.lineTo(ex + s * (w * 1.0 + 1.6), ey - h * 0.35 - tilt * 2 - 1.2); g.stroke();
    g.restore();
  }

  /** brow: tapered wedge, cel-shaded, inked. b>0 = angry/alarm (inner down), b<0 = raised */
  function brow(c, ex, ey, s, b, opts = {}) {
    const { w = 2.4, col = c.furDark, lift = 0, len = 6.5, inkCol = c.ink } = opts;
    const inner = ey - 8 - lift + b * 1.4, outer = ey - 9.2 - lift - b * 1.6;
    const path = () => {
      g.beginPath(); g.moveTo(ex - s * len * 0.95, inner + 0.4);
      g.quadraticCurveTo(ex, inner - w * 0.9 - Math.max(0, -b) * 1.2, ex + s * len, outer - w * 0.35);
      g.quadraticCurveTo(ex + s * len * 1.02, outer + w * 0.6, ex + s * len * 0.15, outer + w * 0.55);
      g.quadraticCurveTo(ex - s * len * 0.5, inner + w * 0.7, ex - s * len * 0.95, inner + 0.4); g.closePath();
    };
    cel(path, col, { cx: ex, cy: inner, r: 6, depth: 1.6, hi: 0.4 });
    ink(path, 1.1, inkCol);
  }

  /** generic mammal mouth: lip line, dark interior, teeth strip, tongue; opens by `open` */
  function mouth(c, mw, my, open, nod, opts = {}) {
    const { aged = false, frog = false, philtrum = true, inkCol = c.ink } = opts;
    const smile = st.mood === 'happy' ? 2.4 : st.mood === 'alarm' ? -0.8 : 0.7;
    if (open > 0.3) {
      const cav = () => { g.beginPath(); g.moveTo(-mw, my); g.quadraticCurveTo(0, my + 1.2 + open * 2.1, mw, my); g.quadraticCurveTo(0, my - open * 0.2 - 0.4, -mw, my); g.closePath(); };
      g.save(); cav(); g.clip();
      g.fillStyle = '#3a0c14'; BIG();
      g.fillStyle = '#6a1a26'; g.beginPath(); g.moveTo(-mw, my + 1); g.quadraticCurveTo(0, my + 1.4 + open * 2.2, mw, my + 1); g.lineTo(mw, my + 30); g.lineTo(-mw, my + 30); g.fill();
      // tongue
      const tongue = ellipse(0, my + 1.6 + open * 1.35, mw * 0.55, open * 0.55 + 0.8);
      cel(tongue, '#e0606c', { cx: 0, cy: my + open, r: mw * 0.5, depth: 1.5, hi: 0.4, shadow: '#8a2a38' });
      // teeth strip
      if (!frog && open > 1.6) {
        const th = Math.min(2.4, (open - 1.6) * 0.6);
        g.fillStyle = '#f4efe4'; g.fillRect(-mw * 0.8, my - 0.5, mw * 1.6, th);
        g.strokeStyle = 'rgba(60,20,30,.5)'; g.lineWidth = 0.4; g.beginPath(); for (let i = -2; i <= 2; i++) { g.moveTo(i * 2.2, my - 0.5); g.lineTo(i * 2.2, my - 0.5 + th); } g.stroke();
        // canines
        g.fillStyle = '#f4efe4'; for (const s of [-1, 1]) { g.beginPath(); g.moveTo(s * 4.4, my - 0.5 + th - 0.2); g.lineTo(s * 5.6, my - 0.5 + th - 0.2); g.lineTo(s * 5, my + th + 1.2); g.closePath(); g.fill(); }
      }
      g.restore();
      ink(cav, 1.1, inkCol);
    }
    // lip line
    stroke(() => { g.moveTo(-mw, my - smile * 0.45); g.quadraticCurveTo(0, my + 1.1 + smile * 0.35 + open * 0.15, mw, my - smile * 0.45); }, frog ? 1.4 : 1.3, inkCol);
    if (philtrum) stroke(() => { g.moveTo(0, my - 5); g.lineTo(0, my - 0.2 + open * 0.1); }, 1.0, inkCol, 0.85);
    // mouth corners (aged: deeper folds)
    if (aged) stroke(() => { g.moveTo(-mw, my - 1); g.quadraticCurveTo(-mw - 1.5, my + 2, -mw - 0.5, my + 4.5); g.moveTo(mw, my - 1); g.quadraticCurveTo(mw + 1.5, my + 2, mw + 0.5, my + 4.5); }, 0.8, inkCol, 0.6);
  }

  // ------------------------------------------------------------------ head silhouettes (for drop shadow)
  function headSilhouette(c) {
    if (c.kind === 'fox') return FOX.head;
    if (c.kind === 'hare') return HARE.head;
    if (c.kind === 'bird') return BIRD.head;
    if (c.kind === 'rob') return ROB.head;
    return FROG.head;
  }

  // ---------- FOX: wedge skull, wide cheek ruff, narrow chin, tall ears
  const FOX = {
    head: sym(-27, [
      ['C', 12, -27, 21, -20, 23.5, -10],   // temple
      ['C', 25, -4, 27.5, 1, 27.5, 5],      // cheek bulge
      ['L', 31.5, 9.5], ['L', 25, 11.5], ['L', 28, 17.5], ['L', 19, 17.5], // ruff spikes
      ['C', 14, 24, 6, 27.5, 0, 27.5],      // jaw to chin
    ]),
    // white mask: cheeks up under the eyes, dip at the bridge, down to the chin
    mask: sym(-1, [
      ['C', 5, -3, 10, -3.5, 14, -1],
      ['C', 20, 2, 21, 9, 19, 14],
      ['C', 16, 22, 8, 26, 0, 26.5],
    ]),
    blaze: sym(-27, [['C', 3.5, -27, 5, -22, 4.5, -18], ['C', 3, -11, 1.5, -8, 0, -6]]),
    ear: (s) => () => { g.beginPath(); g.moveTo(s * 8, -20); g.bezierCurveTo(s * 11, -33, s * 15, -44, s * 19, -51); g.bezierCurveTo(s * 25, -41, s * 28, -27, s * 28.5, -12); g.closePath(); },
    earIn: (s) => () => { g.beginPath(); g.moveTo(s * 13, -19); g.bezierCurveTo(s * 15, -30, s * 17, -38, s * 19.5, -43); g.bezierCurveTo(s * 23, -35, s * 25, -25, s * 25.5, -14); g.closePath(); },
  };
  function drawFox(c, m, b, lidClose, open, nod) {
    headsetBand();
    // ears (behind)
    for (const s of [-1, 1]) {
      cel(FOX.ear(s), c.fur, { cx: s * 19, cy: -30, r: 16, depth: 3.5, hi: 0.4, hiPush: 0.45 });
      cel(FOX.earIn(s), '#3a1a1e', { cx: s * 19, cy: -28, r: 12, depth: 3, hi: 0, shadow: '#1e0a10' });
      fill(() => { g.beginPath(); g.moveTo(s * 15, -18); g.bezierCurveTo(s * 16.5, -27, s * 18, -32, s * 19.5, -36); g.bezierCurveTo(s * 22, -30, s * 23, -23, s * 23.5, -15); g.closePath(); }, '#c88a92');
      ink(FOX.earIn(s), 1.0, c.ink);
      ink(FOX.ear(s), 1.8, c.ink);
    }
    // skull + ruff
    cel(FOX.head, c.fur, { cx: 0, cy: -2, r: 26, depth: 5.5, hi: 0.5, hiPush: 0.5 });
    // white mask & blaze (clipped to head)
    g.save(); FOX.head(); g.clip();
    cel(FOX.mask, c.muzzle, { cx: 0, cy: 12, r: 18, depth: 4, hi: 0.5, hiPush: 0.45, shadow: mix(c.muzzle, SHADOW_TINT, 0.3) });
    cel(FOX.blaze, c.muzzle, { cx: 0, cy: -18, r: 8, depth: 2, hi: 0, shadow: mix(c.muzzle, SHADOW_TINT, 0.3) });
    g.restore();
    ink(FOX.mask, 0.9, c.ink, 0.55); ink(FOX.blaze, 0.8, c.ink, 0.4);
    // dark eye markings (subtle triangular wedge out from each outer corner)
    for (const s of [-1, 1]) fill(poly([[s * 15, -6], [s * 22, -9], [s * 21, -3]]), rgba(c.furDark, 0.55));
    // cheek fur strokes (a few decisive ink hairs)
    for (const s of [-1, 1]) stroke(() => { g.moveTo(s * 22, 5); g.lineTo(s * 26, 3.5); g.moveTo(s * 21, 9); g.lineTo(s * 25.5, 8.5); }, 0.9, c.ink, 0.55);
    // brow ridge shadow into the sockets (hard)
    for (const s of [-1, 1]) fill(poly([[s * 3, -9], [s * 17, -11.5], [s * 16, -7], [s * 4, -5]]), rgba(c.furDark, 0.35));
    // mouth, nose
    mouth(c, 8.5, 15, open, nod);
    const nose = () => { g.beginPath(); g.moveTo(-3.8, 8.6); g.quadraticCurveTo(0, 7, 3.8, 8.6); g.quadraticCurveTo(3, 12.6, 0, 13.6); g.quadraticCurveTo(-3, 12.6, -3.8, 8.6); g.closePath(); };
    cel(nose, '#2a1216', { cx: 0, cy: 10.5, r: 4, depth: 1.3, hi: 0, shadow: '#120608' });
    fill(ellipse(-1.5, 9.2, 1.2, 0.65, -0.3), '#ffffff'); ink(nose, 1.0, c.ink);
    // whiskers
    for (const s of [-1, 1]) stroke(() => { g.moveTo(s * 9, 13.5); g.lineTo(s * 17, 12); g.moveTo(s * 9.5, 16); g.lineTo(s * 17, 16.5); }, 0.6, c.ink, 0.45);
    // eyes & brows
    for (const s of [-1, 1]) eye(c, s * 10, -3.5, s, 6.6, 4.6, lidClose, b, { tilt: 0.35, irisScale: 0.82 });
    for (const s of [-1, 1]) brow(c, s * 10, -3.5, s, b, { w: 2.2, len: 6.8, lift: 0.2 });
    ink(FOX.head, 1.9, c.ink);
    headset(-1, c);
  }

  // ---------- HARE (Peppy): broad, older face; long upright ears; huge white brows; mutton chops
  const HARE = {
    head: sym(-25, [
      ['C', 14, -25, 22, -18, 24, -8],
      ['C', 25.5, -1, 26, 6, 25, 11],
      ['C', 24.5, 17, 20, 22, 13, 25],
      ['C', 8, 27.5, 3, 28, 0, 28],
    ]),
    muzzle: sym(1, [['C', 6, 0.5, 12, 2, 15, 7], ['C', 18, 13, 14, 22, 8, 25.5], ['C', 5, 27, 2, 27.5, 0, 27.5]]),
    ear: (s) => () => { g.beginPath(); g.moveTo(s * 6, -20); g.bezierCurveTo(s * 5, -36, s * 8, -52, s * 13, -58); g.bezierCurveTo(s * 20, -52, s * 21, -34, s * 18, -16); g.closePath(); },
    earIn: (s) => () => { g.beginPath(); g.moveTo(s * 9, -22); g.bezierCurveTo(s * 8.5, -34, s * 10, -46, s * 13, -51); g.bezierCurveTo(s * 17, -46, s * 17.5, -33, s * 15.5, -19); g.closePath(); },
    chop: (s) => () => { g.beginPath(); g.moveTo(s * 15, 2); g.bezierCurveTo(s * 22, 3, s * 27, 8, s * 25, 15); g.lineTo(s * 28, 20); g.lineTo(s * 22, 20); g.lineTo(s * 23, 25); g.bezierCurveTo(s * 16, 24, s * 12, 19, s * 12, 12); g.closePath(); },
  };
  function drawHare(c, m, b, lidClose, open, nod) {
    headsetBand();
    for (const s of [-1, 1]) {
      g.save(); g.translate(0, 0); g.rotate(s * (0.06 + Math.sin(st.t * 1.3 + s) * 0.015));
      cel(HARE.ear(s), c.fur, { cx: s * 12, cy: -36, r: 20, depth: 3.5, hi: 0.35, hiPush: 0.4 });
      cel(HARE.earIn(s), '#d8a4ae', { cx: s * 12, cy: -36, r: 14, depth: 3, hi: 0, shadow: '#8a5a68' });
      ink(HARE.earIn(s), 1.0, c.ink); ink(HARE.ear(s), 1.8, c.ink);
      g.restore();
    }
    cel(HARE.head, c.fur, { cx: 0, cy: 0, r: 26, depth: 5.5, hi: 0.5, hiPush: 0.5 });
    g.save(); HARE.head(); g.clip();
    cel(HARE.muzzle, c.muzzle, { cx: 0, cy: 14, r: 15, depth: 3.5, hi: 0.5, hiPush: 0.45, shadow: mix(c.muzzle, SHADOW_TINT, 0.3) });
    for (const s of [-1, 1]) { cel(HARE.chop(s), '#e8e2d6', { cx: s * 19, cy: 13, r: 9, depth: 2.5, hi: 0.4, shadow: '#a8a096' }); ink(HARE.chop(s), 1.1, c.ink, 0.8); }
    g.restore();
    ink(HARE.muzzle, 0.9, c.ink, 0.5);
    // age: crow's feet, cheek folds, brow furrows
    for (const s of [-1, 1]) stroke(() => { g.moveTo(s * 17.5, -5); g.lineTo(s * 21.5, -7); g.moveTo(s * 17.5, -2); g.lineTo(s * 22, -1.5); g.moveTo(s * 13, 7); g.quadraticCurveTo(s * 15.5, 13, s * 11.5, 18); }, 0.9, c.ink, 0.6);
    stroke(() => { g.moveTo(-2.5, -13); g.lineTo(-2, -9); g.moveTo(2.5, -13); g.lineTo(2, -9); }, 0.8, c.ink, 0.45);
    for (const s of [-1, 1]) fill(poly([[s * 3, -8], [s * 17, -10], [s * 16, -6], [s * 4, -4]]), rgba(c.furDark, 0.3));
    // whisker dots
    g.fillStyle = rgba(c.ink, 0.5); for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(s * (4.5 + i * 3), 13.5 + i * 1.2, 0.6, 0, TAU); g.fill(); }
    mouth(c, 8.5, 15.5, open, nod, { aged: true });
    // split-lip + pink nose
    const nose = () => { g.beginPath(); g.moveTo(-3.4, 8.6); g.quadraticCurveTo(0, 7.2, 3.4, 8.6); g.quadraticCurveTo(2.6, 12.4, 0, 13.4); g.quadraticCurveTo(-2.6, 12.4, -3.4, 8.6); g.closePath(); };
    cel(nose, '#c8707c', { cx: 0, cy: 10.5, r: 4, depth: 1.4, hi: 0.5, shadow: '#7a3a48' }); ink(nose, 1.0, c.ink);
    // eyes: smaller, half-lidded (wise)
    for (const s of [-1, 1]) eye(c, s * 10, -3.5, s, 6.0, 4.3, lidClose, b, { tilt: 0.1, irisScale: 0.78, lidBase: 0.16 });
    // massive white brows (Peppy signature) with tuft spikes
    for (const s of [-1, 1]) {
      const bp = () => {
        const inner = -12 - 0 + b * 1.4, outer = -14 - b * 1.6;
        g.beginPath(); g.moveTo(s * 2.5, inner + 1.5); g.quadraticCurveTo(s * 6, inner - 5, s * 12, outer - 4); g.lineTo(s * 15, outer - 6.5); g.lineTo(s * 16, outer - 1.5); g.lineTo(s * 19.5, outer - 2.5);
        g.quadraticCurveTo(s * 17, outer + 3, s * 11, outer + 2.5); g.quadraticCurveTo(s * 6, inner + 3.5, s * 2.5, inner + 1.5); g.closePath();
      };
      cel(bp, '#f2eee6', { cx: s * 10, cy: -14, r: 8, depth: 2.4, hi: 0.4, shadow: '#b8b0a4' });
      ink(bp, 1.2, c.ink);
    }
    ink(HARE.head, 1.9, c.ink);
    headset(-1, c);
  }

  // ---------- BIRD (Falco): blue plumage, red eye-mask, long hooked yellow beak, swept crest
  const BIRD = {
    head: sym(-25, [
      ['C', 14, -25, 23, -17, 24, -6],
      ['C', 25, 2, 23, 10, 17, 15],
      ['L', 20, 19], ['L', 13, 19], ['L', 14, 23.5],
      ['C', 9, 24, 4, 24.5, 0, 24.5],
    ]),
    mask: () => { g.beginPath(); g.moveTo(-24, -10); g.quadraticCurveTo(-12, -20, 0, -9); g.quadraticCurveTo(12, -20, 24, -10); g.quadraticCurveTo(22, 0, 13, 1.5); g.quadraticCurveTo(0, -3, -13, 1.5); g.quadraticCurveTo(-22, 0, -24, -10); g.closePath(); },
  };
  function drawBird(c, m, b, lidClose, open, nod) {
    headsetBand();
    // crest feathers (behind), swept up-back
    for (let i = 0; i < 4; i++) {
      const x = -9 + i * 6, len = 20 + (i === 1 ? 8 : 0) + (i === 2 ? 5 : 0), sway = Math.sin(st.t * 2.4 + i) * 0.6;
      const f = () => { g.beginPath(); g.moveTo(x - 3, -20); g.bezierCurveTo(x + 2 + sway, -30 - len * 0.5, x + 8 + sway, -22 - len, x + 18 + i * 2 + sway, -22 - len * 0.7); g.bezierCurveTo(x + 12, -26, x + 7, -22, x + 5, -18); g.closePath(); };
      cel(f, i % 2 ? c.furDark : c.fur, { cx: x + 6, cy: -32, r: 12, depth: 2.5, hi: 0.4 });
      ink(f, 1.5, c.ink);
    }
    cel(BIRD.head, c.fur, { cx: 0, cy: -2, r: 24, depth: 5, hi: 0.5, hiPush: 0.5 });
    // feather scallops (ink, sparse)
    g.save(); BIRD.head(); g.clip();
    stroke(() => { for (let r = 0; r < 3; r++) for (let i = -3; i <= 3; i++) { const cx = i * 6.5 + (r % 2) * 3.2, cy = 6 + r * 6; g.moveTo(cx - 3, cy); g.quadraticCurveTo(cx, cy + 3.5, cx + 3, cy); } }, 0.8, c.ink, 0.35);
    // red mask around the eyes
    cel(BIRD.mask, c.accent, { cx: 0, cy: -7, r: 20, depth: 3.5, hi: 0.4, hiPush: 0.5 });
    // paler throat
    const throat = sym(12, [['C', 8, 12, 12, 16, 10, 20], ['C', 7, 24, 3, 25, 0, 25]]);
    cel(throat, mix(c.fur, '#ffffff', 0.4), { cx: 0, cy: 18, r: 9, depth: 2, hi: 0 });
    g.restore();
    ink(BIRD.mask, 1.0, c.ink, 0.8);
    // eyes: small, fierce, pale iris; lids are the red mask
    for (const s of [-1, 1]) eye(c, s * 10, -5, s, 5.6, 3.8, lidClose, b + 0.3, { tilt: 0.5, irisScale: 0.8, lidCol: c.accent, lidBase: 0.12, irisCol: '#dfe8f4', irisDark: '#6a7a9a' });
    for (const s of [-1, 1]) brow(c, s * 10, -5, s, b + 0.3, { w: 2.0, len: 6.5, col: c.furDark, lift: -1.2 });
    // beak: upper mandible (long, hooked), lower hinges open
    const upper = () => { g.beginPath(); g.moveTo(-9.5, 1); g.quadraticCurveTo(-3, -1, 0, -1.5); g.quadraticCurveTo(3, -1, 9.5, 1); g.quadraticCurveTo(7, 9, 1.5, 15 + nod * 0.2); g.lineTo(0.2, 17); g.quadraticCurveTo(-3, 12, -9.5, 1); g.closePath(); };
    cel(upper, c.muzzle, { cx: 0, cy: 6, r: 9, depth: 3, hi: 0.5, hiPush: 0.5, shadow: c.muzzleDark });
    stroke(() => { g.moveTo(-1.2, 1); g.quadraticCurveTo(-0.5, 8, 0.3, 13); }, 0.8, '#fff6c0', 0.7);
    fill(ellipse(-2.8, 3.2, 1.0, 0.6, 0.4), '#5a3608');
    ink(upper, 1.4, c.ink);
    const oy = 9.5 + open * 0.6;
    if (open > 0.4) {
      const cav = () => { g.beginPath(); g.moveTo(-6.5, oy - 1); g.quadraticCurveTo(0, oy + open * 1.2, 6.5, oy - 1); g.quadraticCurveTo(0, oy + 1, -6.5, oy - 1); g.closePath(); };
      fill(cav, '#3a0c14'); fill(ellipse(0, oy + open * 0.55, 3, open * 0.35), '#d8606a');
    }
    const lower = () => { g.beginPath(); g.moveTo(-8, oy); g.quadraticCurveTo(0, oy + 7.5 + open * 0.6, 8, oy); g.quadraticCurveTo(0, oy + 2.5, -8, oy); g.closePath(); };
    cel(lower, c.muzzleDark, { cx: 0, cy: oy + 3, r: 7, depth: 2, hi: 0.4, light: c.muzzle, shadow: mix(c.muzzleDark, '#000', 0.4) });
    ink(lower, 1.3, c.ink);
    ink(BIRD.head, 1.9, c.ink);
    headset(-1, c);
  }

  // ---------- FROG (Slippy): wide flat head, eye domes on top, red cap, huge grin
  const FROG = {
    head: sym(-20, [['C', 14, -20, 27, -14, 28, 0], ['C', 29, 12, 22, 24, 10, 25.5], ['C', 6, 26.5, 3, 27, 0, 27]]),
    dome: (s) => ellipse(s * 16, -15, 10.5, 9.5),
    cap: sym(-37, [['C', 10, -37, 22, -30, 25, -17], ['L', 26, -13], ['C', 16, -21, 6, -23, 0, -23]]),
    brim: () => { g.beginPath(); g.moveTo(-29, -15.5); g.quadraticCurveTo(0, -25, 29, -15.5); g.lineTo(29, -11.5); g.quadraticCurveTo(0, -21, -29, -11.5); g.closePath(); },
  };
  function drawFrog(c, m, b, lidClose, open, nod) {
    headsetBand();
    cel(FROG.cap, '#d63c2c', { cx: 0, cy: -26, r: 22, depth: 4.5, hi: 0.5, hiPush: 0.5, shadow: '#7a1a16' });
    ink(FROG.cap, 1.8, '#2a0806');
    cel(FROG.brim, '#a8281e', { cx: 0, cy: -15, r: 28, depth: 2, hi: 0.3, shadow: '#4a0e0a' });
    ink(FROG.brim, 1.4, '#2a0806');
    const badge = ellipse(0, -30.5, 3.6, 3.6);
    cel(badge, '#f4c840', { cx: 0, cy: -30.5, r: 3.6, depth: 1.2, hi: 0.5, shadow: '#a07010' }); ink(badge, 0.9, '#5a3808'); fill(ellipse(0, -30.5, 1.3, 1.3), '#8a5a10');
    for (const s of [-1, 1]) { cel(FROG.dome(s), c.fur, { cx: s * 16, cy: -15, r: 10, depth: 3, hi: 0.5, hiPush: 0.5 }); }
    cel(FROG.head, c.fur, { cx: 0, cy: 2, r: 28, depth: 5.5, hi: 0.5, hiPush: 0.5 });
    // skin speckles (hard dots)
    g.fillStyle = rgba(c.furDark, 0.5); for (let i = 0; i < 14; i++) { const a = i * 2.4, r = 11 + (i % 5) * 3; g.beginPath(); g.arc(Math.cos(a) * r, 1 + Math.sin(a) * r * 0.65, 0.7 + (i % 3) * 0.25, 0, TAU); g.fill(); }
    g.save(); FROG.head(); g.clip();
    const belly = ellipse(0, 13, 21, 10.5);
    cel(belly, c.muzzle, { cx: 0, cy: 12, r: 17, depth: 3.5, hi: 0.4, shadow: c.muzzleDark });
    g.restore();
    ink(belly, 0.9, c.ink, 0.4);
    // blush
    fill(ellipse(-15, 7, 4.6, 2.6), 'rgba(255,110,110,.35)'); fill(ellipse(15, 7, 4.6, 2.6), 'rgba(255,110,110,.35)');
    // nostrils
    fill(ellipse(-3.5, 3, 1.1, 0.7), '#0e3a14'); fill(ellipse(3.5, 3, 1.1, 0.7), '#0e3a14');
    mouth(c, 15, 15.5, open * 1.15, nod, { frog: true, philtrum: false });
    // eyes on the domes (big, glossy), frog lids in skin colour
    for (const s of [-1, 1]) ink(FROG.dome(s), 1.6, c.ink);
    ink(FROG.head, 1.9, c.ink);
    // eyes sit ON the domes, drawn over the head/dome outlines so no ink cuts across them
    for (const s of [-1, 1]) cel(FROG.dome(s), c.fur, { cx: s * 16, cy: -15, r: 10, depth: 3, hi: 0.5, hiPush: 0.5 });
    for (const s of [-1, 1]) eye(c, s * 16, -15.5, s, 8.4, 7.8, lidClose, b, { tilt: 0.05, irisScale: 0.78, shade: 0.16 });
    for (const s of [-1, 1]) ink(FROG.dome(s), 1.6, c.ink);
    headset(-1, c);
  }

  // ---------- ROBOT (ROB 64): slab head, glowing visor band, jaw grille, antenna
  const ROB = {
    // slightly tapering box, chamfered bottom corners
    head: sym(-26, [
      ['C', 18, -26, 24, -18, 24, -8],       // crown -> temple
      ['C', 25, 2, 24, 10, 22, 14],          // cheek slab
      ['L', 20, 18], ['L', 14, 18],          // jaw chamfer
      ['C', 10, 24, 5, 25.5, 0, 25.5],       // chin
    ]),
    visor: sym(0, [
      ['L', 19, -2], ['L', 19, 3],
      ['C', 14, 6, 7, 7, 0, 7],
    ]),
  };
  function drawRob(c, m, b, lidClose, open, nod) {
    headsetBand();
    // ear bolts (behind the head)
    for (const s of [-1, 1]) {
      const bolt = () => { g.beginPath(); g.rect(s * 22 - (s < 0 ? 6 : 0), -6, 6, 10); g.closePath(); };
      cel(bolt, c.furDark, { cx: s * 24, cy: -1, r: 6, depth: 1.6, hi: 0.35 });
      ink(bolt, 1.2, c.ink);
    }
    cel(ROB.head, c.fur, { cx: 0, cy: -2, r: 26, depth: 5, hi: 0.55, hiPush: 0.5 });
    // brushed-metal plate seams + a warm specular chip
    g.save(); ROB.head(); g.clip();
    stroke(() => { g.moveTo(-16, -20); g.lineTo(16, -20); g.moveTo(-20, 8); g.lineTo(20, 8); }, 0.8, rgba(c.ink, 0.5));
    for (const s of [-1, 1]) fill(ellipse(s * 21, -21, 1.2, 1.2), rgba(c.ink, 0.6)); // rivets
    g.restore();
    ink(ROB.head, 1.9, c.ink);
    // visor: inset dark band with a single amber eye that bobs and pulses while talking
    cel(ROB.visor, c.muzzleDark, { cx: 0, cy: 1, r: 20, depth: 2.2, hi: 0, shadow: '#0c1018' });
    ink(ROB.visor, 1.4, c.ink);
    const glow = 0.45 + 0.55 * Math.min(1, st.mouth * 2.2 + 0.25) + Math.sin(st.t * 6.1) * 0.08;
    const er = 4.6 + open * 0.35, ey = 0.5 + nod * 0.4 + Math.sin(st.t * 0.9) * 0.5;
    fill(ellipse(st.look * 0.6, ey, er + 3.5, er * 0.8 + 1.6), rgba(c.eye, 0.22 * glow));
    fill(ellipse(st.look * 0.6, ey, er, Math.max(0.8, er * 0.62 * (1 - lidClose * 0.85))), rgba(c.eye, 0.55 + 0.4 * glow));
    fill(ellipse(st.look * 0.6 - 1.2, ey - 1, er * 0.4, er * 0.25), 'rgba(255,244,200,.85)');
    // jaw grille: vents that open while talking
    for (let i = -2; i <= 2; i++) {
      const h = 1.4 + Math.min(4.5, open * (1 - Math.abs(i) * 0.22));
      fill(() => { g.beginPath(); g.rect(i * 5 - 1.5, 14.5 - h / 2, 3, h); g.closePath(); }, rgba(c.muzzleDark, 0.9));
    }
    // antenna + tip light (breathes; bright when talking)
    stroke(() => { g.moveTo(8, -25); g.lineTo(12 + Math.sin(st.t * 1.8) * 1.2, -38); }, 1.6, c.ink);
    const tipR = 2.2 + (st.talking ? Math.abs(Math.sin(st.t * 8)) * 0.8 : 0);
    fill(ellipse(12 + Math.sin(st.t * 1.8) * 1.2, -39.5, tipR, tipR), rgba(c.accent, 0.5 + 0.4 * glow));
    headset(-1, c);
  }

  // ------------------------------------------------------------------ head dispatch
  function drawHead(c) {
    const m = st.mouth, b = st.brow, blink = st.blink;
    const lidClose = Math.min(1, Math.sin(Math.min(1, blink) * Math.PI) * 1.4);
    const open = m * 7, nod = st.nod;
    if (c.kind === 'fox') drawFox(c, m, b, lidClose, open, nod);
    else if (c.kind === 'hare') drawHare(c, m, b, lidClose, open, nod);
    else if (c.kind === 'bird') drawBird(c, m, b, lidClose, open, nod);
    else if (c.kind === 'rob') drawRob(c, m, b, lidClose, open, nod);
    else drawFrog(c, m, b, lidClose, open, nod);
  }

  /** headset: dark band over the crown, earcup w/ LED, mic boom */
  function headsetBand() {
    stroke(() => { g.arc(0, -2, 29, Math.PI * 1.05, Math.PI * 1.95); }, 4.2, '#0a1020');
    stroke(() => { g.arc(0, -2, 29, Math.PI * 1.05, Math.PI * 1.95); }, 2.6, '#22304a');
    stroke(() => { g.arc(0, -2, 29.4, Math.PI * 1.16, Math.PI * 1.45); }, 1.0, 'rgba(255,255,255,.4)');
  }
  function headset(side, c) {
    const sx = side;
    // earcup
    const cup = ellipse(sx * 25.5, 2, 5.4, 7.4);
    cel(cup, '#2c3a55', { cx: sx * 25.5, cy: 2, r: 7, depth: 2.2, hi: 0.45, shadow: '#0e1626', light: '#6a80a8' });
    ink(cup, 1.4, '#0a1020');
    const lens = ellipse(sx * 25.5, 2, 2.6, 3.8);
    cel(lens, '#3aa9ff', { cx: sx * 25.5, cy: 2, r: 3.5, depth: 1.2, hi: 0.5, shadow: '#0b3a7a', light: '#d8f2ff' });
    ink(lens, 0.7, '#0a1020');
    // mic boom
    stroke(() => { g.moveTo(sx * 25, 8); g.quadraticCurveTo(sx * 24, 21, sx * 8, 20); }, 2.0, '#1a2233');
    stroke(() => { g.moveTo(sx * 24.4, 8.5); g.quadraticCurveTo(sx * 23.5, 20, sx * 9, 19.2); }, 0.5, 'rgba(255,255,255,.3)');
    const mic = ellipse(sx * 8, 20, 3.3, 2.1);
    cel(mic, '#22304a', { cx: sx * 8, cy: 20, r: 3, depth: 1.2, hi: 0.4, shadow: '#0a0f1a', light: '#5a6e90' });
    ink(mic, 1.0, '#0a1020');
    g.fillStyle = 'rgba(0,0,0,.55)'; for (let i = -1; i <= 1; i++) g.fillRect(sx * 8 + i * 1.3 - 0.3, 19.1, 0.6, 1.8);
    // status LED
    const on = st.talking && (Math.floor(st.t * 10) % 2);
    fill(ellipse(sx * 25.5, -6.4, 1.1, 1.1), on ? '#ff6a58' : '#6a2a2a');
    if (on) { const lg = g.createRadialGradient(sx * 25.5, -6.4, 0, sx * 25.5, -6.4, 3.5); lg.addColorStop(0, 'rgba(255,110,90,.6)'); lg.addColorStop(1, 'rgba(255,110,90,0)'); g.fillStyle = lg; g.beginPath(); g.arc(sx * 25.5, -6.4, 3.5, 0, TAU); g.fill(); }
  }

  return {
    canvas: cv, state: st,
    setCharacter(id) { st.char = CHARACTERS[id] ?? CHARACTERS.fox; st.glitch = 1; },
    setTalking(v) { st.talking = v; },
    setMood(mm) { st.mood = mm; },
    open() { st.glitch = 1; st.pulse = 1; },
    update(dt) { update(dt); draw(); },
  };
}
