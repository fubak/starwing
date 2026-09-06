// Procedural animated wingman portraits (canvas 2D). Blinking, mouth flaps,
// head bob, eyebrow emotes, per-character head shapes, painted shading
// (key light top-left, cool rim right), CRT scanlines + open-glitch.

export const CHARACTERS = {
  fox:    { kind: 'fox',  fur: '#e8842c', furDark: '#b85f16', furLight: '#f7a54f', muzzle: '#fff3e0', eye: '#3cc26a', accent: '#d8342a', name: 'FOX' },
  peppy:  { kind: 'hare', fur: '#a9a9b8', furDark: '#7d7d90', furLight: '#c9c9d6', muzzle: '#f2f2f6', eye: '#5a86d8', accent: '#3d5fbf', name: 'PEPPY' },
  falco:  { kind: 'bird', fur: '#3d7fe0', furDark: '#26509a', furLight: '#6aa4ff', muzzle: '#ffcf58', eye: '#e04a3a', accent: '#c93b30', name: 'FALCO' },
  slippy: { kind: 'frog', fur: '#5fc85a', furDark: '#3d8f3c', furLight: '#8ee27f', muzzle: '#d8f5b0', eye: '#e8b83c', accent: '#e05a2a', name: 'SLIPPY' },
};

export function createPortrait(size = 172, dpr = Math.min(devicePixelRatio || 1, 2)) {
  const cv = document.createElement('canvas');
  cv.width = size * dpr; cv.height = size * dpr;
  cv.style.width = size + 'px'; cv.style.height = size + 'px';
  const g = cv.getContext('2d');
  const S = size / 100; // draw in a 100x100 space

  const st = {
    char: CHARACTERS.fox, talking: false, mouth: 0, mouthTarget: 0,
    blink: 0, nextBlink: 1.5, brow: 0, browTarget: 0, glitch: 0, t: 0, bob: 0, look: 0, lookT: 0,
    mood: 'calm', pulse: 0, tilt: 0,
  };
  const rnd = () => Math.random();
  const TAU = Math.PI * 2;

  function update(dt) {
    st.t += dt;
    st.nextBlink -= dt;
    if (st.nextBlink <= 0) { st.blink = 1; st.nextBlink = 1.2 + rnd() * 3; if (rnd() < 0.25) st.nextBlink = 0.25; }
    st.blink = Math.max(0, st.blink - dt * 9);
    if (st.talking) {
      st.lookT -= dt;
      if (st.lookT <= 0) { st.mouthTarget = rnd() < 0.2 ? 0.05 : 0.25 + rnd() * 0.75; st.lookT = 0.06 + rnd() * 0.1; }
    } else st.mouthTarget = 0;
    st.mouth += (st.mouthTarget - st.mouth) * Math.min(1, dt * 26);
    st.browTarget = st.mood === 'alarm' ? 1 : st.mood === 'happy' ? -0.6 : st.talking ? Math.sin(st.t * 3.1) * 0.35 : 0;
    st.brow += (st.browTarget - st.brow) * Math.min(1, dt * 8);
    st.bob = Math.sin(st.t * 2.2) * 0.8 + (st.talking ? Math.sin(st.t * 9.7) * 0.7 : 0);
    st.tilt += ((st.talking ? Math.sin(st.t * 1.7) * 0.05 : Math.sin(st.t * 0.8) * 0.02) - st.tilt) * Math.min(1, dt * 3);
    st.look += ((Math.sin(st.t * 0.7) * 0.6 + Math.sin(st.t * 1.9) * 0.4) * 1.6 - st.look) * dt * 2;
    st.glitch = Math.max(0, st.glitch - dt * 2.2);
    st.pulse = Math.max(0, st.pulse - dt * 3);
  }

  function ellipse(x, y, rx, ry, fill, rot = 0) { g.fillStyle = fill; g.beginPath(); g.ellipse(x, y, rx, ry, rot, 0, TAU); g.fill(); }

  function draw() {
    const c = st.char;
    g.setTransform(dpr * S, 0, 0, dpr * S, 0, 0);
    // background: deep blue vignette + hex-ish grid + character-tinted halo
    const bg = g.createRadialGradient(50, 45, 8, 50, 50, 70);
    bg.addColorStop(0, '#153f78'); bg.addColorStop(0.6, '#0a1d44'); bg.addColorStop(1, '#040a1c');
    g.fillStyle = bg; g.fillRect(0, 0, 100, 100);
    g.strokeStyle = 'rgba(90,170,255,.13)'; g.lineWidth = 0.5;
    for (let i = -20; i < 120; i += 9) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 25, 100); g.stroke(); g.beginPath(); g.moveTo(i, 0); g.lineTo(i - 25, 100); g.stroke(); }
    const halo = g.createRadialGradient(50, 55, 5, 50, 55, 42);
    halo.addColorStop(0, `${c.furLight}66`); halo.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = halo; g.fillRect(0, 0, 100, 100);
    // drifting scan bar
    const sb = ((st.t * 18) % 130) - 15;
    const sbg = g.createLinearGradient(0, sb - 6, 0, sb + 6); sbg.addColorStop(0, 'rgba(120,200,255,0)'); sbg.addColorStop(0.5, 'rgba(120,200,255,.12)'); sbg.addColorStop(1, 'rgba(120,200,255,0)');
    g.fillStyle = sbg; g.fillRect(0, sb - 6, 100, 12);

    // shoulders / flight suit (behind head)
    g.fillStyle = '#26364f'; g.beginPath(); g.moveTo(-5, 100); g.lineTo(16, 82); g.quadraticCurveTo(50, 74, 84, 82); g.lineTo(105, 100); g.closePath(); g.fill();
    const suitSh = g.createLinearGradient(0, 78, 0, 100); suitSh.addColorStop(0, 'rgba(255,255,255,.12)'); suitSh.addColorStop(1, 'rgba(0,0,0,.35)');
    g.fillStyle = suitSh; g.beginPath(); g.moveTo(-5, 100); g.lineTo(16, 82); g.quadraticCurveTo(50, 74, 84, 82); g.lineTo(105, 100); g.closePath(); g.fill();
    g.fillStyle = '#3a5078'; g.beginPath(); g.moveTo(22, 100); g.lineTo(34, 85); g.quadraticCurveTo(50, 80, 66, 85); g.lineTo(78, 100); g.closePath(); g.fill();
    // collar + scarf-ish neckband in accent
    g.fillStyle = c.accent; g.beginPath(); g.moveTo(38, 84); g.quadraticCurveTo(50, 90, 62, 84); g.lineTo(60, 90); g.quadraticCurveTo(50, 95, 40, 90); g.closePath(); g.fill();
    g.fillStyle = '#e8eef8'; g.fillRect(47, 93, 6, 1.6); g.fillRect(47, 96, 6, 1.6);

    g.save();
    g.translate(50 + st.look * 0.4, 54 + st.bob);
    g.rotate(st.tilt);
    drawHead(c);
    g.restore();

    // scanlines & vignette & glitch
    g.fillStyle = 'rgba(0,0,0,.16)';
    for (let y = 0; y < 100; y += 2) g.fillRect(0, y, 100, 0.8);
    const vg = g.createRadialGradient(50, 50, 35, 50, 50, 75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.6)');
    g.fillStyle = vg; g.fillRect(0, 0, 100, 100);
    if (st.glitch > 0) {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      for (let i = 0; i < 6; i++) {
        const y = Math.floor(rnd() * size), h = 2 + rnd() * 10 * st.glitch, dx = (rnd() - 0.5) * 30 * st.glitch;
        g.drawImage(cv, 0, y * dpr, cv.width, h * dpr, dx, y, size, h);
      }
      g.fillStyle = `rgba(120,220,255,${0.25 * st.glitch})`; g.fillRect(0, 0, size, size);
    }
    if (st.pulse > 0) { g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = `rgba(255,255,255,${st.pulse * 0.5})`; g.fillRect(0, 0, size, size); }
  }

  /** painted shading over a head-shaped path: key light top-left, cool rim right */
  function shadeHead(path) {
    g.save(); path(); g.clip();
    const key = g.createRadialGradient(-10, -14, 4, 0, 0, 34); key.addColorStop(0, 'rgba(255,245,220,.28)'); key.addColorStop(0.6, 'rgba(255,255,255,0)'); key.addColorStop(1, 'rgba(0,0,40,.35)');
    g.fillStyle = key; g.fillRect(-40, -50, 80, 100);
    const rim = g.createLinearGradient(14, 0, 28, 0); rim.addColorStop(0, 'rgba(90,170,255,0)'); rim.addColorStop(1, 'rgba(120,200,255,.35)');
    g.fillStyle = rim; g.fillRect(-40, -50, 80, 100);
    g.restore();
  }

  function eye(c, ex, ey, s, rx, ry, lidClose, b) {
    ellipse(ex, ey, rx, ry, '#fff');
    // eye socket shadow
    const sock = g.createLinearGradient(0, ey - ry, 0, ey); sock.addColorStop(0, 'rgba(0,0,40,.35)'); sock.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = sock; g.beginPath(); g.ellipse(ex, ey, rx, ry, 0, 0, TAU); g.fill();
    const px = ex + st.look * 0.9, py = ey + 0.6;
    const ir = Math.min(rx, ry) * 0.62;
    ellipse(px, py, ir, ir, c.eye);
    const irg = g.createRadialGradient(px, py + ir * 0.4, 0, px, py, ir); irg.addColorStop(0, 'rgba(255,255,255,.35)'); irg.addColorStop(1, 'rgba(0,0,0,.35)');
    ellipse(px, py, ir, ir, irg);
    ellipse(px, py, ir * 0.55, ir * 0.55, '#111');
    ellipse(px - ir * 0.35, py - ir * 0.4, ir * 0.28, ir * 0.28, 'rgba(255,255,255,.95)');
    ellipse(px + ir * 0.3, py + ir * 0.35, ir * 0.12, ir * 0.12, 'rgba(255,255,255,.6)');
    // eyelid (fur colour) from top; alarm narrows eyes
    const lid = Math.max(lidClose, Math.max(0, b) * 0.3);
    if (lid > 0) {
      g.save(); g.beginPath(); g.ellipse(ex, ey, rx + 0.3, ry + 0.3, 0, 0, TAU); g.clip();
      g.fillStyle = c.furDark; g.fillRect(ex - rx - 1, ey - ry - 1, rx * 2 + 2, (ry * 2 + 2) * lid);
      g.fillStyle = c.fur; g.fillRect(ex - rx - 1, ey - ry - 1, rx * 2 + 2, Math.max(0, (ry * 2 + 2) * lid - 1.2));
      g.restore();
    }
    // lash line
    g.strokeStyle = c.furDark; g.lineWidth = 0.9; g.beginPath(); g.ellipse(ex, ey, rx, ry, 0, Math.PI * 1.05, Math.PI * 1.95); g.stroke();
  }

  function brow(c, ex, ey, s, b, w = 2.4) {
    g.strokeStyle = c.furDark; g.lineWidth = w; g.lineCap = 'round';
    const inner = ey - 9 - b * 2.4, outer = ey - 9.5 + b * 1.2;
    g.beginPath(); g.moveTo(ex - 5.5 * s, inner); g.quadraticCurveTo(ex, inner - 1.5 - b, ex + 5.5 * s, outer); g.stroke();
  }

  function drawHead(c) {
    const m = st.mouth, b = st.brow, blink = st.blink;
    const lidClose = Math.min(1, Math.sin(Math.min(1, blink) * Math.PI) * 1.4);
    const k = c.kind;

    // ----- ears / crest (behind head)
    if (k === 'fox') {
      for (const s of [-1, 1]) {
        g.fillStyle = c.fur; g.beginPath(); g.moveTo(s * 8, -14); g.quadraticCurveTo(s * 20, -30, s * 22, -44); g.quadraticCurveTo(s * 30, -26, s * 27, -8); g.closePath(); g.fill();
        g.fillStyle = '#2b1a1a'; g.beginPath(); g.moveTo(s * 13, -14); g.quadraticCurveTo(s * 20, -26, s * 21, -36); g.quadraticCurveTo(s * 26, -24, s * 24, -11); g.closePath(); g.fill();
        g.fillStyle = '#f4c9c0'; g.beginPath(); g.moveTo(s * 15, -14); g.quadraticCurveTo(s * 20, -24, s * 21, -32); g.quadraticCurveTo(s * 24, -23, s * 23, -12); g.closePath(); g.fill();
      }
    } else if (k === 'hare') {
      for (const s of [-1, 1]) {
        g.save(); g.translate(s * 12, -22); g.rotate(s * 0.22);
        ellipse(0, -16, 6.5, 23, c.fur); ellipse(0, -16, 3.4, 17, '#e0b9c0'); ellipse(-1.2, -20, 1.2, 8, 'rgba(255,255,255,.35)');
        g.restore();
      }
    } else if (k === 'bird') {
      for (let i = 0; i < 5; i++) {
        const x = -10 + i * 5, len = 20 + Math.sin(i * 1.3) * 4 + (i === 2 ? 6 : 0);
        g.fillStyle = i % 2 ? c.furDark : c.fur; g.beginPath(); g.moveTo(x - 3, -22); g.quadraticCurveTo(x + 6, -30 - len, x + 14 + i, -26 - len * 0.6); g.lineTo(x + 5, -20); g.closePath(); g.fill();
      }
    }

    // ----- head shape
    const headPath = () => {
      g.beginPath();
      if (k === 'fox') { g.moveTo(0, -27); g.bezierCurveTo(22, -27, 28, -8, 20, 8); g.bezierCurveTo(14, 20, 5, 26, 0, 27); g.bezierCurveTo(-5, 26, -14, 20, -20, 8); g.bezierCurveTo(-28, -8, -22, -27, 0, -27); }
      else if (k === 'hare') { g.ellipse(0, 0, 23, 27, 0, 0, TAU); }
      else if (k === 'bird') { g.ellipse(0, -2, 23, 24, 0, 0, TAU); }
      else { g.moveTo(0, -20); g.bezierCurveTo(26, -20, 30, 0, 26, 12); g.bezierCurveTo(20, 26, -20, 26, -26, 12); g.bezierCurveTo(-30, 0, -26, -20, 0, -20); }
      g.closePath();
    };
    g.fillStyle = c.fur; headPath(); g.fill();
    if (k === 'frog') { ellipse(-16, -18, 10, 9, c.fur); ellipse(16, -18, 10, 9, c.fur); }
    shadeHead(headPath);

    // ----- face markings
    if (k === 'fox') {
      // white cheeks + forehead blaze
      g.fillStyle = c.muzzle; g.beginPath(); g.moveTo(-22, 2); g.quadraticCurveTo(-18, 22, 0, 26); g.quadraticCurveTo(18, 22, 22, 2); g.quadraticCurveTo(12, 10, 0, 6); g.quadraticCurveTo(-12, 10, -22, 2); g.fill();
      g.beginPath(); g.moveTo(-4, -26); g.quadraticCurveTo(0, -12, 4, -26); g.fill();
      // dark eye patches
      ellipse(-10, -6, 8.5, 8, 'rgba(80,35,10,.35)'); ellipse(10, -6, 8.5, 8, 'rgba(80,35,10,.35)');
    } else if (k === 'hare') {
      ellipse(0, 10, 14, 12, c.muzzle);
      ellipse(-10, -6, 8, 8.5, c.furDark + 'aa'); ellipse(10, -6, 8, 8.5, c.furDark + 'aa');
      // bushy grey brows drawn later; whisker dots
      g.fillStyle = 'rgba(60,60,80,.5)'; for (const s of [-1, 1]) for (let i = 0; i < 3; i++) { g.beginPath(); g.arc(s * (5 + i * 3), 12 + i * 1.5, 0.7, 0, TAU); g.fill(); }
    } else if (k === 'bird') {
      // red eye mask
      g.fillStyle = c.accent; g.beginPath(); g.moveTo(-24, -4); g.quadraticCurveTo(-12, -16, 0, -6); g.quadraticCurveTo(12, -16, 24, -4); g.quadraticCurveTo(12, 2, 0, -1); g.quadraticCurveTo(-12, 2, -24, -4); g.fill();
    } else {
      ellipse(0, 12, 20, 10, c.muzzle);
      // red cap
      g.fillStyle = '#d83a2a'; g.beginPath(); g.moveTo(-26, -14); g.quadraticCurveTo(0, -38, 26, -14); g.lineTo(28, -10); g.lineTo(-30, -10); g.closePath(); g.fill();
      g.fillStyle = '#b02a20'; g.fillRect(-30, -13, 62, 3.5);
      g.fillStyle = '#f2d24a'; g.beginPath(); g.arc(0, -22, 3.2, 0, TAU); g.fill();
    }

    // ----- muzzle / beak & mouth
    const open = m * 7;
    if (k === 'bird') {
      g.fillStyle = c.muzzle; g.beginPath(); g.moveTo(-11, 4); g.quadraticCurveTo(0, 26 + m * 2, 13, 6); g.quadraticCurveTo(0, 0, -11, 4); g.fill();
      const bk = g.createLinearGradient(-11, 0, 13, 0); bk.addColorStop(0, 'rgba(0,0,0,.15)'); bk.addColorStop(0.5, 'rgba(255,255,255,.15)'); bk.addColorStop(1, 'rgba(0,0,0,.25)');
      g.fillStyle = bk; g.beginPath(); g.moveTo(-11, 4); g.quadraticCurveTo(0, 26 + m * 2, 13, 6); g.quadraticCurveTo(0, 0, -11, 4); g.fill();
      // lower mandible opens
      g.fillStyle = '#3a1418'; g.beginPath(); g.moveTo(-8, 10 + m); g.quadraticCurveTo(0, 12 + open * 1.6, 10, 10 + m); g.quadraticCurveTo(0, 10 + m * 2, -8, 10 + m); g.fill();
      g.fillStyle = '#d9a83a'; g.beginPath(); g.moveTo(-8, 11 + open); g.quadraticCurveTo(0, 20 + open * 0.8, 10, 11 + open); g.quadraticCurveTo(0, 13 + open, -8, 11 + open); g.fill();
      // nostril
      ellipse(-3, 6, 1, 0.6, 'rgba(0,0,0,.4)');
    } else {
      // nose
      const ny = k === 'frog' ? 4 : 5;
      if (k !== 'frog') { ellipse(0, ny, 4.2, 2.8, '#2b1a1a'); ellipse(-1.3, ny - 0.9, 1.3, 0.7, 'rgba(255,255,255,.55)'); }
      else { ellipse(-4, 2, 1.2, 0.8, 'rgba(0,0,0,.5)'); ellipse(4, 2, 1.2, 0.8, 'rgba(0,0,0,.5)'); }
      const mw = k === 'frog' ? 14 : 9, my = k === 'frog' ? 13 : 12;
      g.fillStyle = '#4a1418'; g.beginPath();
      g.moveTo(-mw, my); g.quadraticCurveTo(0, my + 1 + open * 1.8, mw, my); g.quadraticCurveTo(0, my - open * 0.25, -mw, my); g.fill();
      if (open > 1.5) {
        ellipse(0, my + 1 + open * 1.2, mw * 0.5, open * 0.5, '#e46a6a');
        g.fillStyle = '#fff'; g.fillRect(-mw * 0.6, my + 0.2, mw * 1.2, Math.min(1.6, open * 0.3));
      }
      // smile line
      g.strokeStyle = 'rgba(60,20,20,.7)'; g.lineWidth = 0.9; g.beginPath(); g.moveTo(-mw, my); g.quadraticCurveTo(0, my + 0.8 - (st.mood === 'happy' ? -1.5 : 0), mw, my); g.stroke();
      if (k !== 'frog') { g.beginPath(); g.moveTo(0, ny + 2); g.lineTo(0, my); g.stroke(); }
    }

    // ----- eyes
    const ex = k === 'frog' ? 16 : 9.5, ey = k === 'frog' ? -18 : -5;
    const rx = k === 'frog' ? 7 : 6, ry = k === 'frog' ? 6.5 : 6.5;
    for (const s of [-1, 1]) eye(c, s * ex, ey, s, rx, ry, lidClose, b);
    for (const s of [-1, 1]) brow(c, s * ex, ey, s, b, k === 'hare' ? 3.4 : 2.4);

    // ----- headset: band, earcup, mic boom, status LED
    g.strokeStyle = '#1d2636'; g.lineWidth = 3; g.beginPath(); g.arc(0, -4, 27, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.18)'; g.lineWidth = 1; g.beginPath(); g.arc(0, -4, 27.6, Math.PI * 1.15, Math.PI * 1.5); g.stroke();
    ellipse(-25, 2, 5, 7, '#242f45'); ellipse(-25, 2, 2.2, 3.4, '#5dc6ff');
    ellipse(-25, 2, 1, 1.6, 'rgba(255,255,255,.7)');
    g.strokeStyle = '#242f45'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-25, 7); g.quadraticCurveTo(-24, 20, -8, 19); g.stroke();
    ellipse(-8, 19, 3, 1.8, '#1d2636');
    ellipse(-25, -5.5, 1, 1, st.talking && (Math.floor(st.t * 10) % 2) ? '#ff5a4a' : '#7a2a2a');
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
