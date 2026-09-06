// Procedural animated wingman portraits (canvas 2D), rendered as *lit
// volumes* rather than flat vector shapes: every form (head, muzzle, ears,
// beak, eyes, nose, headset) is shaded with a key light from the upper-left,
// a cool rim light from the right, fresnel edge darkening, soft cast shadows
// (brows -> eye sockets, muzzle -> jaw, headset -> fur) and specular hits.
// Fur silhouettes are tufted, feathers are stroked, frog skin is glossy.
// Animation: blinking, mouth flaps w/ teeth+tongue, brow emotes, head bob,
// gaze drift, CRT-ish comm signal (scanlines, open-glitch, flash).

export const CHARACTERS = {
  fox:    { kind: 'fox',  fur: '#e07a2a', furDark: '#8e3f12', furLight: '#ffb063', muzzle: '#f6ead9', muzzleDark: '#c9ae92', eye: '#3fc06c', eyeDark: '#176a35', accent: '#c8362a', jacket: '#3b6a48', jacketDark: '#1f3a28', name: 'FOX' },
  peppy:  { kind: 'hare', fur: '#a89a86', furDark: '#5d5142', furLight: '#d9cdb9', muzzle: '#f2ece2', muzzleDark: '#c2b7a7', eye: '#6a4a2e', eyeDark: '#2e1c0e', accent: '#b8362c', jacket: '#7a3a2c', jacketDark: '#3d1c14', name: 'PEPPY' },
  falco:  { kind: 'bird', fur: '#3a7fe6', furDark: '#173f8f', furLight: '#7fb6ff', muzzle: '#f2c33c', muzzleDark: '#9a6f12', eye: '#e8ecf4', eyeDark: '#b0b8c8', accent: '#d8382c', jacket: '#8a2a24', jacketDark: '#3e1210', name: 'FALCO' },
  slippy: { kind: 'frog', fur: '#5cc45a', furDark: '#22672a', furLight: '#a6ee8c', muzzle: '#d8efb2', muzzleDark: '#9dbb7a', eye: '#3a2a1a', eyeDark: '#120a04', accent: '#d8382c', jacket: '#c9a13a', jacketDark: '#6a4c12', name: 'SLIPPY' },
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
const LX = -0.58, LY = -0.72;

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

  // ------------------------------------------------------------------ shading primitives
  const BIG = () => g.fillRect(-200, -200, 400, 400);
  function ellipsePath(x, y, rx, ry, rot = 0) { g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, TAU); g.closePath(); }
  function fill(path, style) { path(); g.fillStyle = style; g.fill(); }

  /** tufted fur silhouette. tufts: [{a0,a1,amp,n}] in radians (0=right, pi/2=down) */
  function furPath(cx, cy, rx, ry, tufts = [], N = 110) {
    return () => {
      g.beginPath();
      for (let i = 0; i <= N; i++) {
        const a = (i / N) * TAU; let k = 1;
        for (const t of tufts) {
          if (a >= t.a0 && a <= t.a1) { const u = (a - t.a0) / (t.a1 - t.a0); const saw = Math.abs(((u * t.n) % 1) * 2 - 1); k += t.amp * (1 - saw * saw) * Math.sin(u * Math.PI); }
        }
        const x = cx + Math.cos(a) * rx * k, y = cy + Math.sin(a) * ry * k;
        if (i) g.lineTo(x, y); else g.moveTo(x, y);
      }
      g.closePath();
    };
  }

  /**
   * Shade a closed path as a lit volume: key light (upper-left) with a soft
   * terminator into a cool shadow, fresnel edge darkening, rim light from the
   * right, small specular. `gloss` boosts the specular for skin/plastic.
   */
  function volume(path, cx, cy, r, base, light, dark, opts = {}) {
    const { gloss = 0.25, rim = 0.45, fresnel = 0.3, spread = 1.55, ry = 1 } = opts;
    g.save(); path(); g.clip();
    const kx = cx + LX * r * 0.45, ky = cy + LY * r * 0.45 * ry;
    const key = g.createRadialGradient(kx, ky, r * 0.02, kx, ky, r * spread);
    key.addColorStop(0, light); key.addColorStop(0.32, base); key.addColorStop(0.72, dark); key.addColorStop(1, mix(dark, '#1a1030', 0.45));
    g.fillStyle = key; BIG();
    // fresnel / edge falloff
    const fr = g.createRadialGradient(cx, cy, r * 0.55, cx, cy, r * 1.05);
    fr.addColorStop(0, 'rgba(10,0,30,0)'); fr.addColorStop(1, `rgba(10,0,30,${fresnel})`);
    g.fillStyle = fr; BIG();
    // cool rim from the right / bottom-right
    const rg = g.createLinearGradient(cx + r * 0.25, cy, cx + r * 1.0, cy + r * 0.3);
    rg.addColorStop(0, 'rgba(120,190,255,0)'); rg.addColorStop(0.7, `rgba(120,190,255,${rim * 0.35})`); rg.addColorStop(1, `rgba(170,215,255,${rim})`);
    g.fillStyle = rg; BIG();
    // specular
    const sp = g.createRadialGradient(kx, ky, 0, kx, ky, r * 0.55);
    sp.addColorStop(0, `rgba(255,250,240,${gloss})`); sp.addColorStop(1, 'rgba(255,250,240,0)');
    g.fillStyle = sp; BIG();
    g.restore();
  }

  /** soft cast shadow of `path` offset by (dx,dy), clipped to `onto` */
  function castShadow(path, dx, dy, alpha, onto, blur = 1.2) {
    g.save(); onto(); g.clip();
    g.filter = `blur(${blur}px)`;
    g.translate(dx, dy); path(); g.fillStyle = `rgba(20,8,40,${alpha})`; g.fill();
    g.filter = 'none';
    g.restore();
  }

  /** soft occlusion blob */
  function ao(x, y, rx, ry, a, rot = 0) {
    const gr = g.createRadialGradient(x, y, 0, x, y, Math.max(rx, ry));
    gr.addColorStop(0, `rgba(30,10,40,${a})`); gr.addColorStop(1, 'rgba(30,10,40,0)');
    g.save(); g.translate(x, y); g.rotate(rot); g.scale(rx / Math.max(rx, ry), ry / Math.max(rx, ry)); g.translate(-x, -y);
    g.fillStyle = gr; ellipsePath(x, y, Math.max(rx, ry), Math.max(rx, ry)); g.fill(); g.restore();
  }

  /** short fur strokes along a direction, used for cheeks/forehead texture */
  function furStrokes(x, y, w, h, n, col, seed, dir = -1) {
    g.strokeStyle = col; g.lineWidth = 0.5; g.lineCap = 'round';
    let s = seed;
    const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    g.beginPath();
    for (let i = 0; i < n; i++) {
      const px = x + (r() - 0.5) * w, py = y + (r() - 0.5) * h, l = 1.4 + r() * 2.2, a = dir * (0.9 + (r() - 0.5) * 0.9) + (px - x) / w * 0.8;
      g.moveTo(px, py); g.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l);
    }
    g.stroke();
  }

  // ------------------------------------------------------------------ frame
  function draw() {
    const c = st.char;
    g.setTransform(dpr * S, 0, 0, dpr * S, 0, 0);
    g.filter = 'none';
    // background: deep cockpit-blue with a soft top-left light source and a
    // faint transmission grid; tinted halo behind the character
    const bg = g.createRadialGradient(28, 18, 4, 50, 50, 84);
    bg.addColorStop(0, '#1b4b8c'); bg.addColorStop(0.45, '#0b2452'); bg.addColorStop(1, '#03091c');
    g.fillStyle = bg; g.fillRect(0, 0, 100, 100);
    g.strokeStyle = 'rgba(90,170,255,.08)'; g.lineWidth = 0.5;
    for (let i = 0; i <= 100; i += 10) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 100); g.stroke(); g.beginPath(); g.moveTo(0, i); g.lineTo(100, i); g.stroke(); }
    const halo = g.createRadialGradient(52, 58, 6, 52, 58, 46);
    halo.addColorStop(0, rgba(c.furLight, 0.28)); halo.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = halo; g.fillRect(0, 0, 100, 100);
    const sb = ((st.t * 16) % 130) - 15;
    const sbg = g.createLinearGradient(0, sb - 7, 0, sb + 7); sbg.addColorStop(0, 'rgba(120,200,255,0)'); sbg.addColorStop(0.5, 'rgba(120,200,255,.10)'); sbg.addColorStop(1, 'rgba(120,200,255,0)');
    g.fillStyle = sbg; g.fillRect(0, sb - 7, 100, 14);

    drawTorso(c);

    g.save();
    g.translate(50 + st.look * 0.4, 54 + st.bob);
    g.rotate(st.tilt);
    drawHead(c);
    g.restore();

    // comm signal: fine scanlines, vignette, glitch, flash
    g.fillStyle = 'rgba(0,0,0,.10)';
    for (let y = 0; y < 100; y += 2) g.fillRect(0, y, 100, 0.7);
    const vg = g.createRadialGradient(50, 50, 38, 50, 50, 76);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.55)');
    g.fillStyle = vg; g.fillRect(0, 0, 100, 100);
    // glass reflection streak on the comm screen
    const gl = g.createLinearGradient(0, 0, 100, 100); gl.addColorStop(0, 'rgba(255,255,255,.10)'); gl.addColorStop(0.25, 'rgba(255,255,255,0)'); gl.addColorStop(0.8, 'rgba(120,180,255,0)'); gl.addColorStop(1, 'rgba(120,180,255,.08)');
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
    const body = () => { g.beginPath(); g.moveTo(-6, 102); g.lineTo(12, 84); g.quadraticCurveTo(50, 72, 88, 84); g.lineTo(106, 102); g.closePath(); };
    volume(body, 50, 96, 46, c.jacket, mix(c.jacket, '#ffffff', 0.35), c.jacketDark, { gloss: 0.12, rim: 0.4, fresnel: 0.25, ry: 0.6 });
    // seams + shoulder pads
    g.strokeStyle = 'rgba(0,0,0,.35)'; g.lineWidth = 0.7;
    g.beginPath(); g.moveTo(22, 100); g.quadraticCurveTo(30, 84, 40, 82); g.moveTo(78, 100); g.quadraticCurveTo(70, 84, 60, 82); g.stroke();
    // white scarf / collar
    const collar = () => { g.beginPath(); g.moveTo(34, 83); g.quadraticCurveTo(50, 92, 66, 83); g.lineTo(66, 88); g.quadraticCurveTo(50, 99, 34, 88); g.closePath(); };
    volume(collar, 50, 88, 18, '#e9eef6', '#ffffff', '#93a4c2', { gloss: 0.2, rim: 0.2, ry: 0.5 });
    // accent band
    const band = () => { g.beginPath(); g.moveTo(40, 91); g.quadraticCurveTo(50, 97, 60, 91); g.lineTo(60, 94.5); g.quadraticCurveTo(50, 100.5, 40, 94.5); g.closePath(); };
    volume(band, 50, 94, 12, c.accent, mix(c.accent, '#ffffff', 0.4), mix(c.accent, '#000000', 0.5), { gloss: 0.3, ry: 0.5 });
    // rank pin
    g.fillStyle = '#e2c46a'; g.beginPath(); g.arc(70, 92, 1.4, 0, TAU); g.fill(); g.fillStyle = '#fff7d0'; g.beginPath(); g.arc(69.6, 91.6, 0.5, 0, TAU); g.fill();
  }

  // ------------------------------------------------------------------ eyes
  function eye(c, ex, ey, s, rx, ry, lidClose, b, opts = {}) {
    const { tilt = 0, irisScale = 0.6, lidCol = c.fur, lidDark = c.furDark } = opts;
    const socket = () => ellipsePath(ex, ey, rx, ry, tilt * s);
    // eyeball: white sphere, shaded (darker under upper lid, cool at bottom)
    fill(socket, '#f7f8fa');
    g.save(); socket(); g.clip();
    const eb = g.createRadialGradient(ex - rx * 0.2, ey + ry * 0.3, ry * 0.2, ex, ey, ry * 1.25);
    eb.addColorStop(0, '#ffffff'); eb.addColorStop(0.7, '#e3e8f0'); eb.addColorStop(1, '#9aa8c2');
    g.fillStyle = eb; BIG();
    // upper lid shadow
    const ls = g.createLinearGradient(0, ey - ry, 0, ey - ry * 0.1); ls.addColorStop(0, 'rgba(40,20,60,.55)'); ls.addColorStop(1, 'rgba(40,20,60,0)');
    g.fillStyle = ls; BIG();
    // iris
    const px = ex + st.look * 0.85, py = ey + 0.5 + st.lookY * 0.5;
    const ir = Math.min(rx, ry) * irisScale;
    const irg = g.createRadialGradient(px, py, ir * 0.15, px, py, ir);
    irg.addColorStop(0, mix(c.eye, '#ffffff', 0.15)); irg.addColorStop(0.55, c.eye); irg.addColorStop(0.85, c.eyeDark); irg.addColorStop(1, mix(c.eyeDark, '#000000', 0.6));
    g.fillStyle = irg; ellipsePath(px, py, ir, ir); g.fill();
    // iris fibres
    g.strokeStyle = 'rgba(0,0,0,.22)'; g.lineWidth = 0.25;
    g.beginPath(); for (let i = 0; i < 18; i++) { const a = i / 18 * TAU; g.moveTo(px + Math.cos(a) * ir * 0.45, py + Math.sin(a) * ir * 0.45); g.lineTo(px + Math.cos(a) * ir * 0.95, py + Math.sin(a) * ir * 0.95); } g.stroke();
    // pupil
    const pr = ir * (st.mood === 'alarm' ? 0.42 : 0.5);
    g.fillStyle = '#080508'; ellipsePath(px, py, pr, pr); g.fill();
    // spec: sharp key + soft rim reflection + wet lower arc
    g.fillStyle = 'rgba(255,255,255,.95)'; ellipsePath(px + LX * ir * 0.55, py + LY * ir * 0.55, ir * 0.3, ir * 0.24, -0.5); g.fill();
    g.fillStyle = 'rgba(170,215,255,.55)'; ellipsePath(px + ir * 0.45, py + ir * 0.4, ir * 0.14, ir * 0.14); g.fill();
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 0.5; g.beginPath(); g.arc(px, py, ir * 0.85, 0.25 * Math.PI, 0.75 * Math.PI); g.stroke();
    g.restore();
    // eyelids (fur-coloured, shaded) - blink from top, alarm narrows
    const lid = Math.max(lidClose, Math.max(0, b) * 0.28);
    if (lid > 0.01) {
      g.save(); ellipsePath(ex, ey, rx + 0.4, ry + 0.4, tilt * s); g.clip();
      const lh = (ry * 2 + 1) * lid;
      const lg = g.createLinearGradient(0, ey - ry - 1, 0, ey - ry - 1 + lh); lg.addColorStop(0, lidCol); lg.addColorStop(1, lidDark);
      g.fillStyle = lg; g.fillRect(ex - rx - 1, ey - ry - 1, rx * 2 + 2, lh);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(ex - rx - 1, ey - ry - 1 + lh - 0.7, rx * 2 + 2, 0.7);
      g.restore();
    }
    // lash line & lower lid crease
    g.strokeStyle = 'rgba(30,10,20,.85)'; g.lineWidth = 0.9; g.beginPath(); g.ellipse(ex, ey, rx, ry, tilt * s, Math.PI * 1.02, Math.PI * 1.98); g.stroke();
    g.strokeStyle = 'rgba(30,10,20,.3)'; g.lineWidth = 0.5; g.beginPath(); g.ellipse(ex, ey + 0.4, rx, ry, tilt * s, Math.PI * 0.15, Math.PI * 0.85); g.stroke();
  }

  /** thick brow as a shaded tapered wedge */
  function brow(c, ex, ey, s, b, opts = {}) {
    const { w = 2.6, col = c.furDark, light = c.fur, lift = 0 } = opts;
    const inner = ey - 8.5 - b * 2.6 - lift, outer = ey - 9.2 + b * 1.4 - lift;
    const path = () => {
      g.beginPath(); g.moveTo(ex - 6 * s, inner + 0.6); g.quadraticCurveTo(ex, inner - 1.8 - b - w * 0.4, ex + 6.5 * s, outer - w * 0.3);
      g.quadraticCurveTo(ex + 6.5 * s, outer + w * 0.7, ex + 1 * s, outer + w * 0.4); g.quadraticCurveTo(ex - 3 * s, inner + w * 0.6, ex - 6 * s, inner + 0.6); g.closePath();
    };
    volume(path, ex, inner, 7, col, light, mix(col, '#000000', 0.5), { gloss: 0.15, rim: 0.3, ry: 0.4 });
  }

  // ------------------------------------------------------------------ head
  function drawHead(c) {
    const m = st.mouth, b = st.brow, blink = st.blink;
    const lidClose = Math.min(1, Math.sin(Math.min(1, blink) * Math.PI) * 1.4);
    const k = c.kind;
    const open = m * 7;
    const nod = st.nod;

    // ---------- FOX
    if (k === 'fox') {
      // ears (behind)
      for (const s of [-1, 1]) {
        const ear = () => { g.beginPath(); g.moveTo(s * 7, -16); g.quadraticCurveTo(s * 17, -30, s * 20, -47); g.quadraticCurveTo(s * 29, -30, s * 27, -8); g.closePath(); };
        volume(ear, s * 19, -28, 16, c.fur, c.furLight, c.furDark, { gloss: 0.12, rim: s > 0 ? 0.5 : 0.2 });
        const inner = () => { g.beginPath(); g.moveTo(s * 13, -14); g.quadraticCurveTo(s * 19, -28, s * 20, -38); g.quadraticCurveTo(s * 25, -26, s * 24, -11); g.closePath(); };
        volume(inner, s * 19, -24, 12, '#2a1512', '#5a3028', '#150a08', { gloss: 0.05, rim: 0.2 });
        const pink = () => { g.beginPath(); g.moveTo(s * 15, -14); g.quadraticCurveTo(s * 19, -24, s * 20, -32); g.quadraticCurveTo(s * 23, -23, s * 22.5, -12); g.closePath(); };
        volume(pink, s * 19, -22, 10, '#d99a94', '#f2c3bc', '#8a4e4a', { gloss: 0.1, rim: 0.15 });
        // ear tuft fur
        furStrokes(s * 12, -16, 5, 5, 8, rgba(c.furLight, 0.6), 7 + s, -1.3);
      }
      // head with cheek tufts
      const head = furPath(0, 0, 23.5, 25.5, [
        { a0: 0.12 * Math.PI, a1: 0.42 * Math.PI, amp: 0.16, n: 4 }, { a0: 0.58 * Math.PI, a1: 0.88 * Math.PI, amp: 0.16, n: 4 },
        { a0: 1.15 * Math.PI, a1: 1.85 * Math.PI, amp: 0.03, n: 7 },
      ]);
      castShadow(head, 2.5, 4, 0.5, () => g.rect(-60, -60, 120, 140), 2);
      volume(head, 0, 0, 24.5, c.fur, c.furLight, c.furDark, { gloss: 0.18, rim: 0.5 });
      furStrokes(-10, -18, 18, 8, 26, rgba(c.furLight, 0.35), 3, -1.1);
      furStrokes(12, -12, 14, 12, 18, rgba(c.furDark, 0.35), 5, -0.8);
      // white cheek + muzzle mass (tufted), protruding => its own volume
      const muzzle = furPath(0, 12, 22, 14, [{ a0: 0.05 * Math.PI, a1: 0.5 * Math.PI, amp: 0.2, n: 5 }, { a0: 0.5 * Math.PI, a1: 0.95 * Math.PI, amp: 0.2, n: 5 }]);
      castShadow(muzzle, 1.5, 2.5, 0.45, head, 1.5);
      g.save(); head(); g.clip();
      volume(muzzle, 0, 10, 18, c.muzzle, '#ffffff', c.muzzleDark, { gloss: 0.15, rim: 0.4, ry: 0.8 });
      g.restore();
      // forehead blaze
      const blaze = () => { g.beginPath(); g.moveTo(-4.5, -26); g.quadraticCurveTo(0, -10, 4.5, -26); g.quadraticCurveTo(0, -30, -4.5, -26); g.closePath(); };
      g.save(); head(); g.clip(); volume(blaze, 0, -22, 8, c.muzzle, '#ffffff', c.muzzleDark, { gloss: 0.1, rim: 0.2 }); g.restore();
      // eye markings (darker fur around eyes)
      ao(-10, -4, 9, 7.5, 0.22); ao(10, -4, 9, 7.5, 0.22);
      // brow shadow into sockets
      ao(-9.5, -9, 8, 3.5, 0.28); ao(9.5, -9, 8, 3.5, 0.28);
      // nose bridge shading
      ao(0, 4, 4, 6, 0.18);
      // mouth
      mouthMammal(c, 15.5, 9.5, open, nod);
      // nose: glossy dark leather
      const nose = () => { g.beginPath(); g.moveTo(-4.6, 7.2); g.quadraticCurveTo(0, 5.4, 4.6, 7.2); g.quadraticCurveTo(3.2, 11.5, 0, 12.4); g.quadraticCurveTo(-3.2, 11.5, -4.6, 7.2); g.closePath(); };
      castShadow(nose, 0.8, 1.6, 0.4, muzzle, 1);
      volume(nose, 0, 9, 5, '#2b1616', '#6a4040', '#120808', { gloss: 0.9, rim: 0.5 });
      g.fillStyle = 'rgba(255,255,255,.85)'; ellipsePath(-1.6, 7.8, 1.3, 0.7, -0.3); g.fill();
      // eyes: slightly almond, tilted up-out
      for (const s of [-1, 1]) eye(c, s * 9.5, -3.5, s, 6.2, 6.4, lidClose, b, { tilt: -0.18, irisScale: 0.62 });
      for (const s of [-1, 1]) brow(c, s * 9.5, -3.5, s, b, { w: 2.4 });
      // whiskers
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 0.35; g.beginPath();
      for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { g.moveTo(s * 8, 12 + i * 2); g.lineTo(s * 24, 9 + i * 3.5); } g.stroke();
      headset(-1);
    }

    // ---------- HARE (Peppy): older, tan-grey, huge white eyebrows, long ears
    else if (k === 'hare') {
      for (const s of [-1, 1]) {
        g.save(); g.translate(s * 11, -22); g.rotate(s * 0.2 + Math.sin(st.t * 1.3 + s) * 0.02);
        const ear = () => ellipsePath(0, -17, 6.8, 24);
        volume(ear, 0, -17, 20, c.fur, c.furLight, c.furDark, { gloss: 0.1, rim: s > 0 ? 0.5 : 0.2, ry: 2.4 });
        const inner = () => ellipsePath(0.4 * s, -17, 3.6, 18);
        volume(inner, 0, -17, 15, '#caa0a8', '#eccbd0', '#6e474d', { gloss: 0.08, rim: 0.15, ry: 2.4 });
        g.restore();
      }
      const head = furPath(0, 0, 23.5, 27, [
        { a0: 0.1 * Math.PI, a1: 0.45 * Math.PI, amp: 0.13, n: 4 }, { a0: 0.55 * Math.PI, a1: 0.9 * Math.PI, amp: 0.13, n: 4 },
      ]);
      castShadow(head, 2.5, 4, 0.5, () => g.rect(-60, -60, 120, 140), 2);
      volume(head, 0, -1, 25.5, c.fur, c.furLight, c.furDark, { gloss: 0.15, rim: 0.5 });
      furStrokes(-8, -19, 20, 7, 12, rgba(c.furLight, 0.28), 11, -1.1);
      furStrokes(15, -4, 8, 14, 8, rgba(c.furDark, 0.3), 13, -0.7);
      // muzzle: white, drooping (age)
      const muzzle = furPath(0, 12, 17, 13, [{ a0: 0.1 * Math.PI, a1: 0.9 * Math.PI, amp: 0.15, n: 7 }]);
      castShadow(muzzle, 1.5, 2.5, 0.4, head, 1.5);
      g.save(); head(); g.clip(); volume(muzzle, 0, 10, 15, c.muzzle, '#ffffff', c.muzzleDark, { gloss: 0.12, rim: 0.35, ry: 0.8 }); g.restore();
      // age lines: crow's feet + cheek folds
      g.strokeStyle = rgba(c.furDark, 0.5); g.lineWidth = 0.6; g.lineCap = 'round';
      g.beginPath(); for (const s of [-1, 1]) { g.moveTo(s * 16, -4); g.lineTo(s * 20, -6); g.moveTo(s * 16, -1.5); g.lineTo(s * 20.5, -1); g.moveTo(s * 13, 6); g.quadraticCurveTo(s * 15, 12, s * 11, 17); } g.stroke();
      ao(-9.5, -9, 8, 3.5, 0.3); ao(9.5, -9, 8, 3.5, 0.3);
      // whisker dots
      g.fillStyle = 'rgba(60,50,60,.45)'; for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(s * (4.5 + i * 3), 12.5 + i * 1.3, 0.55, 0, TAU); g.fill(); }
      mouthMammal(c, 16.5, 8.5, open, nod, true);
      const nose = () => { g.beginPath(); g.moveTo(-3.6, 8); g.quadraticCurveTo(0, 6.4, 3.6, 8); g.quadraticCurveTo(2.4, 11.6, 0, 12.4); g.quadraticCurveTo(-2.4, 11.6, -3.6, 8); g.closePath(); };
      castShadow(nose, 0.8, 1.4, 0.35, muzzle, 1);
      volume(nose, 0, 9.5, 4, '#b06a74', '#e0a3aa', '#5a2c34', { gloss: 0.6, rim: 0.4 });
      // eyes: smaller, wiser; heavier lids
      for (const s of [-1, 1]) eye(c, s * 9.5, -3, s, 5.6, 5.4, Math.max(lidClose, 0.18), b, { tilt: 0.08, irisScale: 0.58 });
      // bushy white brows (Peppy signature)
      for (const s of [-1, 1]) {
        brow(c, s * 9.5, -3, s, b, { w: 4.6, col: '#e6e2d8', light: '#ffffff', lift: 1.2 });
        furStrokes(s * 10, -13.5 - b * 1.2, 10, 2, 6, 'rgba(255,255,255,.55)', 21 + s, s * -0.4 - 1.2);
      }
      // grey side-whisker tufts (mutton chops): soft shaded masses, not scribbles
      for (const s of [-1, 1]) {
        const chop = furPath(s * 19, 8, 6, 11, [{ a0: 0, a1: TAU, amp: 0.18, n: 9 }], 60);
        g.save(); head(); g.clip(); volume(chop, s * 19, 8, 9, '#d9d3c6', '#f7f4ee', '#8e857a', { gloss: 0.1, rim: s > 0 ? 0.4 : 0.15, ry: 1.4 }); g.restore();
      }
      headset(-1);
    }

    // ---------- BIRD (Falco): blue plumage, red eye-mask, long yellow beak, crest
    else if (k === 'bird') {
      // crest feathers (behind head) - tall, swept back-right
      for (let i = 0; i < 5; i++) {
        const x = -11 + i * 5.2, len = 22 + Math.sin(i * 1.3) * 4 + (i === 2 ? 7 : 0), sway = Math.sin(st.t * 2.4 + i) * 0.6;
        const f = () => { g.beginPath(); g.moveTo(x - 3, -22); g.quadraticCurveTo(x + 5 + sway, -30 - len, x + 15 + i + sway, -25 - len * 0.55); g.quadraticCurveTo(x + 8, -26, x + 5, -20); g.closePath(); };
        volume(f, x + 5, -34, 14, i % 2 ? c.furDark : c.fur, c.furLight, mix(c.furDark, '#000', 0.4), { gloss: 0.2, rim: 0.45 });
        g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 0.4; g.beginPath(); g.moveTo(x, -22); g.quadraticCurveTo(x + 5, -28 - len * 0.6, x + 10 + i, -27 - len * 0.5); g.stroke();
      }
      const head = furPath(0, -2, 22.5, 23.5, [{ a0: 0.15 * Math.PI, a1: 0.85 * Math.PI, amp: 0.1, n: 9 }]);
      castShadow(head, 2.5, 4, 0.5, () => g.rect(-60, -60, 120, 140), 2);
      volume(head, 0, -3, 23, c.fur, c.furLight, c.furDark, { gloss: 0.3, rim: 0.55 });
      // feather texture: overlapping scallops
      g.strokeStyle = 'rgba(0,0,40,.22)'; g.lineWidth = 0.45;
      g.save(); head(); g.clip();
      for (let r = 0; r < 5; r++) for (let i = -4; i <= 4; i++) { const cx = i * 5.5 + (r % 2) * 2.7, cy = 2 + r * 5; g.beginPath(); g.arc(cx, cy, 3, 0.15 * Math.PI, 0.85 * Math.PI); g.stroke(); }
      g.restore();
      // paler chin/throat feathers (subtle, under the beak)
      const throat = () => { g.beginPath(); g.moveTo(-10, 15); g.quadraticCurveTo(0, 26, 10, 15); g.quadraticCurveTo(0, 22, -10, 15); g.closePath(); };
      g.save(); head(); g.clip(); volume(throat, 0, 19, 9, mix(c.fur, '#ffffff', 0.35), mix(c.fur, '#ffffff', 0.6), c.fur, { gloss: 0.1, rim: 0.3, ry: 0.6 }); g.restore();
      // red mask around the eyes, sweeping back
      const mask = () => { g.beginPath(); g.moveTo(-23, -8); g.quadraticCurveTo(-12, -17, 0, -8); g.quadraticCurveTo(12, -17, 23, -8); g.quadraticCurveTo(20, -1, 12, 1); g.quadraticCurveTo(0, -3, -12, 1); g.quadraticCurveTo(-20, -1, -23, -8); g.closePath(); };
      g.save(); head(); g.clip(); volume(mask, 0, -6, 20, c.accent, mix(c.accent, '#fff', 0.35), mix(c.accent, '#200', 0.55), { gloss: 0.2, rim: 0.35, ry: 0.5 }); g.restore();
      ao(-9.5, -9, 8, 3.5, 0.3); ao(9.5, -9, 8, 3.5, 0.3);
      // eyes: small, fierce, pale iris w/ dark ring
      for (const s of [-1, 1]) eye(c, s * 9.5, -4.5, s, 5.2, 4.6, Math.max(lidClose, 0.12), b, { tilt: -0.28, irisScale: 0.7, lidCol: c.accent, lidDark: mix(c.accent, '#200', 0.55) });
      for (const s of [-1, 1]) brow(c, s * 9.5, -4.5, s, b + 0.25, { w: 2.2, col: c.furDark, light: c.fur, lift: -0.5 });
      // beak: long, hooked, glossy keratin; lower mandible hinges open
      const upper = () => { g.beginPath(); g.moveTo(-9, 1); g.quadraticCurveTo(-2, 0, 0, -1); g.quadraticCurveTo(2, 0, 9, 1); g.quadraticCurveTo(6, 8, 1, 15 + nod * 0.2); g.quadraticCurveTo(-3, 12, -9, 1); g.closePath(); };
      castShadow(upper, 1.2, 2.6, 0.5, head, 1.4);
      volume(upper, 0, 5, 9, c.muzzle, '#fff0a0', c.muzzleDark, { gloss: 0.7, rim: 0.4, ry: 1.3 });
      g.strokeStyle = 'rgba(255,250,200,.6)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(-1.5, 1.5); g.quadraticCurveTo(-0.5, 7, 0.4, 12); g.stroke(); // ridge highlight
      ellipsePath(-2.6, 3.4, 0.9, 0.55, 0.4); g.fillStyle = 'rgba(40,20,0,.55)'; g.fill(); // nostril
      // mouth interior + lower mandible
      const oy = 9 + open * 0.55;
      if (open > 0.4) {
        g.fillStyle = '#3a1218'; g.beginPath(); g.moveTo(-6, oy - 1); g.quadraticCurveTo(0, oy + open * 1.1, 6, oy - 1); g.quadraticCurveTo(0, oy + 1, -6, oy - 1); g.fill();
        g.fillStyle = '#d0626a'; ellipsePath(0, oy + open * 0.55, 3, open * 0.35); g.fill();
      }
      const lower = () => { g.beginPath(); g.moveTo(-7.5, oy); g.quadraticCurveTo(0, oy + 7 + open * 0.6, 7.5, oy); g.quadraticCurveTo(0, oy + 2.5, -7.5, oy); g.closePath(); };
      volume(lower, 0, oy + 3, 7, c.muzzleDark, c.muzzle, mix(c.muzzleDark, '#000', 0.5), { gloss: 0.4, rim: 0.4, ry: 0.5 });
      headset(-1);
    }

    // ---------- FROG (Slippy): glossy green skin, eyes on top, red cap
    else {
      const head = () => { g.beginPath(); g.moveTo(0, -21); g.bezierCurveTo(26, -21, 30, 0, 26, 12); g.bezierCurveTo(20, 26, -20, 26, -26, 12); g.bezierCurveTo(-30, 0, -26, -21, 0, -21); g.closePath(); };
      // eye domes (part of the head silhouette, drawn first)
      castShadow(head, 2.5, 4, 0.5, () => g.rect(-60, -60, 120, 140), 2);
      // red cap sits on the crown BEHIND the eye domes
      const cap = () => { g.beginPath(); g.moveTo(-25, -16); g.quadraticCurveTo(-12, -35, 0, -36); g.quadraticCurveTo(12, -35, 25, -16); g.lineTo(26, -12); g.quadraticCurveTo(0, -22, -26, -12); g.closePath(); };
      volume(cap, 0, -26, 24, '#cf3a2c', '#ff8a70', '#5a1410', { gloss: 0.25, rim: 0.4, ry: 0.7 });
      const brim = () => { g.beginPath(); g.moveTo(-28, -15); g.quadraticCurveTo(0, -24, 28, -15); g.lineTo(28, -11.5); g.quadraticCurveTo(0, -20, -28, -11.5); g.closePath(); };
      volume(brim, 0, -15, 28, '#a52820', '#e0503e', '#3c0c08', { gloss: 0.2, ry: 0.3 });
      const badge = () => ellipsePath(0, -30, 3.4, 3.4);
      volume(badge, 0, -30, 3.4, '#f0c840', '#fff3b0', '#8a6410', { gloss: 0.7, rim: 0.3 });
      g.fillStyle = '#8a6410'; ellipsePath(0, -30, 1.3, 1.3); g.fill();
      for (const s of [-1, 1]) { const dome = () => ellipsePath(s * 16, -15, 10.5, 9.5); castShadow(dome, 2, 3, 0.45, () => g.rect(-60, -60, 120, 140), 2); volume(dome, s * 16, -15, 10, c.fur, c.furLight, c.furDark, { gloss: 0.6, rim: s > 0 ? 0.55 : 0.25 }); }
      volume(head, 0, 2, 27, c.fur, c.furLight, c.furDark, { gloss: 0.55, rim: 0.55, ry: 0.9 });
      // skin speckles
      g.fillStyle = rgba(c.furDark, 0.35); for (let i = 0; i < 16; i++) { const a = i * 2.4, r = 10 + (i % 5) * 3; g.beginPath(); g.arc(Math.cos(a) * r, 2 + Math.sin(a) * r * 0.7, 0.6 + (i % 3) * 0.25, 0, TAU); g.fill(); }
      // pale belly/muzzle
      const muzzle = () => ellipsePath(0, 12, 20, 10);
      g.save(); head(); g.clip(); volume(muzzle, 0, 11, 17, c.muzzle, '#f2ffd8', c.muzzleDark, { gloss: 0.3, rim: 0.35, ry: 0.6 }); g.restore();
      // blush
      ao(-14, 6, 5, 3, 0.0); g.fillStyle = 'rgba(255,120,120,.28)'; ellipsePath(-15, 7, 4.5, 2.6); g.fill(); ellipsePath(15, 7, 4.5, 2.6); g.fill();
      // nostrils
      g.fillStyle = 'rgba(0,20,0,.55)'; ellipsePath(-3.5, 3, 1.1, 0.7); g.fill(); ellipsePath(3.5, 3, 1.1, 0.7); g.fill();
      // wide mouth
      mouthMammal(c, 14.5, 15, open * 1.15, nod, false, true);
      // eyes on the domes (big, glossy)
      for (const s of [-1, 1]) eye(c, s * 16, -16, s, 7.2, 6.6, lidClose, b, { tilt: 0.05, irisScale: 0.72 });
      // heavy upper lids in skin colour (frog lids)
      for (const s of [-1, 1]) { g.save(); ellipsePath(s * 16, -16, 7.6, 7); g.clip(); const lg = g.createLinearGradient(0, -23, 0, -17); lg.addColorStop(0, c.fur); lg.addColorStop(1, rgba(c.furDark, 0)); g.fillStyle = lg; g.fillRect(s * 16 - 8, -24, 16, 7 + b * 2); g.restore(); }
      headset(-1);
    }
  }

  /** generic mammal mouth: lips, dark interior, teeth, tongue; opens by `open` */
  function mouthMammal(c, mw, my, open, nod, aged = false, frog = false) {
    const lipCol = frog ? 'rgba(20,60,20,.85)' : 'rgba(60,20,24,.85)';
    const smile = st.mood === 'happy' ? 2.2 : st.mood === 'alarm' ? -0.6 : 0.6;
    // interior
    if (open > 0.3) {
      const cav = () => { g.beginPath(); g.moveTo(-mw, my); g.quadraticCurveTo(0, my + 1 + open * 1.9, mw, my); g.quadraticCurveTo(0, my - open * 0.25 - 0.5, -mw, my); g.closePath(); };
      g.save(); cav(); g.clip();
      const cg = g.createLinearGradient(0, my - 2, 0, my + open * 2); cg.addColorStop(0, '#120406'); cg.addColorStop(1, '#5a1a22');
      g.fillStyle = cg; BIG();
      // tongue
      const tongue = () => ellipsePath(0, my + 1.4 + open * 1.25, mw * 0.55, open * 0.55 + 0.6);
      volume(tongue, 0, my + open, mw * 0.5, '#d95a66', '#f79aa2', '#7a2030', { gloss: 0.5, rim: 0.2, ry: 0.5 });
      // upper teeth
      if (!frog && open > 2.2) { g.fillStyle = '#efe9dc'; const tw = 1.5, th = Math.min(2.2, (open - 2.2) * 0.5); for (let i = -3; i <= 3; i++) g.fillRect(i * tw * 1.15 - tw * 0.5, my - 0.4, tw - 0.25, th + (Math.abs(i) === 1 ? 0.9 : 0)); }
      g.restore();
    }
    // lip line + philtrum
    g.strokeStyle = lipCol; g.lineWidth = frog ? 1.0 : 0.9; g.lineCap = 'round';
    g.beginPath(); g.moveTo(-mw, my - smile * 0.4); g.quadraticCurveTo(0, my + 1 + smile * 0.3 + open * 0.15, mw, my - smile * 0.4); g.stroke();
    if (!frog) { g.beginPath(); g.moveTo(0, my - 5.5); g.lineTo(0, my - 0.2 + open * 0.1); g.stroke(); }
    // lower lip highlight
    g.strokeStyle = 'rgba(255,255,255,.22)'; g.lineWidth = 0.6; g.beginPath(); g.moveTo(-mw * 0.7, my + 1.6 + open * 1.9); g.quadraticCurveTo(0, my + 2.6 + open * 2.0, mw * 0.7, my + 1.6 + open * 1.9); g.stroke();
    // mouth-corner shadow (aged: deeper folds)
    ao(-mw, my, 2.5, 3.5, aged ? 0.35 : 0.2); ao(mw, my, 2.5, 3.5, aged ? 0.35 : 0.2);
  }

  /** headset: dark metallic band over the crown, earcup w/ LED, mic boom */
  function headset(side) {
    const sx = side;
    // band
    g.save();
    g.strokeStyle = '#1a2233'; g.lineWidth = 3.2; g.lineCap = 'round'; g.beginPath(); g.arc(0, -4, 27.5, Math.PI * 1.1, Math.PI * 1.9); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.28)'; g.lineWidth = 1; g.beginPath(); g.arc(0, -4, 28.2, Math.PI * 1.16, Math.PI * 1.45); g.stroke();
    g.strokeStyle = 'rgba(120,180,255,.35)'; g.lineWidth = 0.8; g.beginPath(); g.arc(0, -4, 26.6, Math.PI * 1.6, Math.PI * 1.86); g.stroke();
    g.restore();
    // earcup
    const cup = () => ellipsePath(sx * 25, 2, 5.2, 7.2);
    castShadow(cup, 1.2, 2, 0.45, () => g.rect(-60, -60, 120, 140), 1.2);
    volume(cup, sx * 25, 2, 6.5, '#26324a', '#5b6f92', '#0c1220', { gloss: 0.45, rim: 0.5, ry: 1.3 });
    const lens = () => ellipsePath(sx * 25, 2, 2.4, 3.6);
    volume(lens, sx * 25, 2, 3.2, '#3aa9ff', '#c8ecff', '#0b3a7a', { gloss: 0.8, rim: 0.3, ry: 1.4 });
    // mic boom
    g.strokeStyle = '#1a2233'; g.lineWidth = 1.7; g.lineCap = 'round'; g.beginPath(); g.moveTo(sx * 25, 8); g.quadraticCurveTo(sx * 24, 21, sx * 8, 20); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.25)'; g.lineWidth = 0.5; g.beginPath(); g.moveTo(sx * 24.4, 8.5); g.quadraticCurveTo(sx * 23.5, 20, sx * 9, 19.2); g.stroke();
    const mic = () => ellipsePath(sx * 8, 20, 3.2, 2);
    volume(mic, sx * 8, 20, 3, '#1f2a3d', '#55688a', '#0a0f1a', { gloss: 0.4, rim: 0.4, ry: 0.7 });
    g.fillStyle = 'rgba(0,0,0,.5)'; for (let i = -1; i <= 1; i++) g.fillRect(sx * 8 + i * 1.3 - 0.3, 19.1, 0.6, 1.8);
    // status LED
    const on = st.talking && (Math.floor(st.t * 10) % 2);
    g.fillStyle = on ? '#ff6a58' : '#6a2a2a'; ellipsePath(sx * 25, -6.2, 1, 1); g.fill();
    if (on) { const lg = g.createRadialGradient(sx * 25, -6.2, 0, sx * 25, -6.2, 3.5); lg.addColorStop(0, 'rgba(255,110,90,.6)'); lg.addColorStop(1, 'rgba(255,110,90,0)'); g.fillStyle = lg; ellipsePath(sx * 25, -6.2, 3.5, 3.5); g.fill(); }
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
