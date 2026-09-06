// Procedural animated wingman portraits (canvas 2D). Blinking, mouth flaps,
// head bob, eyebrow emotes, CRT scanlines + open-glitch.

export const CHARACTERS = {
  fox:    { kind: 'fox',  fur: '#e8842c', furDark: '#b85f16', muzzle: '#fff3e0', ear: 'fox',  eye: '#3cc26a', accent: '#d8342a', name: 'FOX' },
  peppy:  { kind: 'hare', fur: '#a9a9b8', furDark: '#7d7d90', muzzle: '#f2f2f6', ear: 'hare', eye: '#5a86d8', accent: '#3d5fbf', name: 'PEPPY' },
  falco:  { kind: 'bird', fur: '#3d7fe0', furDark: '#26509a', muzzle: '#ffcf58', ear: 'crest', eye: '#e04a3a', accent: '#c93b30', name: 'FALCO' },
  slippy: { kind: 'frog', fur: '#5fc85a', furDark: '#3d8f3c', muzzle: '#d8f5b0', ear: 'none', eye: '#e8b83c', accent: '#e05a2a', name: 'SLIPPY' },
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
    mood: 'calm', pulse: 0,
  };

  const rnd = () => Math.random();

  function update(dt) {
    st.t += dt;
    // blink
    st.nextBlink -= dt;
    if (st.nextBlink <= 0) { st.blink = 1; st.nextBlink = 1.2 + rnd() * 3; if (rnd() < 0.25) st.nextBlink = 0.25; }
    st.blink = Math.max(0, st.blink - dt * 9);
    // mouth: while talking, pick new openness on a fast irregular clock
    if (st.talking) {
      st.lookT -= dt;
      if (st.lookT <= 0) { st.mouthTarget = 0.15 + rnd() * 0.85; st.lookT = 0.06 + rnd() * 0.09; }
    } else st.mouthTarget = 0;
    st.mouth += (st.mouthTarget - st.mouth) * Math.min(1, dt * 26);
    // brows
    st.browTarget = st.mood === 'alarm' ? 1 : st.mood === 'happy' ? -0.6 : st.talking ? Math.sin(st.t * 3.1) * 0.35 : 0;
    st.brow += (st.browTarget - st.brow) * Math.min(1, dt * 8);
    // subtle head bob, stronger while talking
    st.bob = Math.sin(st.t * 2.2) * 0.8 + (st.talking ? Math.sin(st.t * 9.7) * 0.7 : 0);
    st.look += ((Math.sin(st.t * 0.7) * 0.6 + Math.sin(st.t * 1.9) * 0.4) * 1.6 - st.look) * dt * 2;
    st.glitch = Math.max(0, st.glitch - dt * 2.2);
    st.pulse = Math.max(0, st.pulse - dt * 3);
  }

  function draw() {
    const c = st.char;
    g.setTransform(dpr * S, 0, 0, dpr * S, 0, 0);
    // background: deep blue vignette + hex grid
    const bg = g.createRadialGradient(50, 45, 8, 50, 50, 70);
    bg.addColorStop(0, '#12386e'); bg.addColorStop(0.6, '#0a1d44'); bg.addColorStop(1, '#040a1c');
    g.fillStyle = bg; g.fillRect(0, 0, 100, 100);
    g.strokeStyle = 'rgba(90,170,255,.13)'; g.lineWidth = 0.5;
    for (let i = -20; i < 120; i += 9) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + 25, 100); g.stroke(); g.beginPath(); g.moveTo(i, 0); g.lineTo(i - 25, 100); g.stroke(); }
    // radial sweep highlight behind the head
    const halo = g.createRadialGradient(50, 55, 5, 50, 55, 40);
    halo.addColorStop(0, `rgba(${c.kind === 'bird' ? '90,140,255' : '255,180,90'},.35)`); halo.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = halo; g.fillRect(0, 0, 100, 100);

    g.save();
    g.translate(50 + st.look * 0.4, 56 + st.bob);
    drawHead(c);
    g.restore();

    // flight suit collar / shoulders
    g.fillStyle = '#2a3a55'; g.beginPath(); g.moveTo(-5, 100); g.lineTo(18, 84); g.quadraticCurveTo(50, 78, 82, 84); g.lineTo(105, 100); g.closePath(); g.fill();
    g.fillStyle = '#3a5078'; g.beginPath(); g.moveTo(20, 100); g.lineTo(32, 86); g.quadraticCurveTo(50, 82, 68, 86); g.lineTo(80, 100); g.closePath(); g.fill();
    g.fillStyle = c.accent; g.fillRect(44, 90, 12, 10);
    g.fillStyle = '#e8eef8'; g.fillRect(47, 92, 6, 2); g.fillRect(47, 95.5, 6, 2);

    // scanlines & vignette & glitch
    g.fillStyle = 'rgba(0,0,0,.18)';
    for (let y = 0; y < 100; y += 2) g.fillRect(0, y, 100, 0.8);
    const vg = g.createRadialGradient(50, 50, 35, 50, 50, 75);
    vg.addColorStop(0, 'rgba(0,0,0,0)'); vg.addColorStop(1, 'rgba(0,0,0,.6)');
    g.fillStyle = vg; g.fillRect(0, 0, 100, 100);
    if (st.glitch > 0) {
      g.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = 6;
      for (let i = 0; i < n; i++) {
        const y = Math.floor(rnd() * size), h = 2 + rnd() * 10 * st.glitch, dx = (rnd() - 0.5) * 30 * st.glitch;
        g.drawImage(cv, 0, y * dpr, cv.width, h * dpr, dx, y, size, h);
      }
      g.fillStyle = `rgba(120,220,255,${0.25 * st.glitch})`; g.fillRect(0, 0, size, size);
    }
    if (st.pulse > 0) { g.setTransform(dpr, 0, 0, dpr, 0, 0); g.fillStyle = `rgba(255,255,255,${st.pulse * 0.5})`; g.fillRect(0, 0, size, size); }
  }

  function drawHead(c) {
    const m = st.mouth, b = st.brow, blink = st.blink;
    const lidClose = Math.min(1, Math.sin(Math.min(1, blink) * Math.PI) * 1.4);
    // ears / crest (behind head)
    g.fillStyle = c.fur;
    if (c.ear === 'fox') {
      for (const s of [-1, 1]) {
        g.beginPath(); g.moveTo(s * 10, -12); g.lineTo(s * 24, -40); g.lineTo(s * 26, -6); g.closePath(); g.fill();
        g.fillStyle = '#f4c9c0'; g.beginPath(); g.moveTo(s * 14, -14); g.lineTo(s * 22, -32); g.lineTo(s * 23, -10); g.closePath(); g.fill();
        g.fillStyle = c.fur;
      }
    } else if (c.ear === 'hare') {
      for (const s of [-1, 1]) {
        g.save(); g.translate(s * 13, -22); g.rotate(s * 0.28);
        g.beginPath(); g.ellipse(0, -14, 6.5, 22, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#e9c6c9'; g.beginPath(); g.ellipse(0, -14, 3.2, 16, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = c.fur; g.restore();
      }
    } else if (c.ear === 'crest') {
      for (let i = 0; i < 4; i++) {
        g.beginPath(); g.moveTo(-6 + i * 4, -22); g.quadraticCurveTo(-2 + i * 7, -48 - i * 2, 12 + i * 6, -30); g.lineTo(6 + i * 4, -18); g.closePath(); g.fill();
      }
    }
    // head
    g.fillStyle = c.fur;
    g.beginPath(); g.ellipse(0, 0, 25, 26, 0, 0, Math.PI * 2); g.fill();
    // cheek fur shading
    const sh = g.createLinearGradient(-25, 0, 25, 0); sh.addColorStop(0, 'rgba(0,0,0,.28)'); sh.addColorStop(0.5, 'rgba(0,0,0,0)'); sh.addColorStop(1, 'rgba(255,255,255,.08)');
    g.fillStyle = sh; g.beginPath(); g.ellipse(0, 0, 25, 26, 0, 0, Math.PI * 2); g.fill();
    if (c.kind === 'frog') { g.fillStyle = c.fur; for (const s of [-1, 1]) { g.beginPath(); g.ellipse(s * 15, -20, 9, 8, 0, 0, Math.PI * 2); g.fill(); } }

    // muzzle / beak
    if (c.kind === 'bird') {
      g.fillStyle = c.muzzle; g.beginPath(); g.moveTo(-9, 4); g.quadraticCurveTo(0, 22 + m * 2, 12, 8); g.lineTo(0, 2); g.closePath(); g.fill();
      g.fillStyle = '#d9a83a'; g.beginPath(); g.moveTo(-8, 9 + m * 4); g.quadraticCurveTo(0, 20 + m * 8, 11, 9 + m * 3); g.quadraticCurveTo(0, 12 + m * 4, -8, 9 + m * 4); g.fill();
      g.fillStyle = '#3a1418'; g.beginPath(); g.moveTo(-7, 9 + m * 3); g.quadraticCurveTo(0, 11 + m * 6, 10, 9 + m * 2); g.quadraticCurveTo(0, 12 + m * 4, -7, 9 + m * 3); g.fill();
    } else {
      g.fillStyle = c.muzzle; g.beginPath(); g.ellipse(0, 10, 15, 12, 0, 0, Math.PI * 2); g.fill();
      // nose
      g.fillStyle = '#2b1a1a'; g.beginPath(); g.ellipse(0, 5, 4, 2.6, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.ellipse(-1.2, 4.2, 1.2, 0.7, 0, 0, Math.PI * 2); g.fill();
      // mouth: closed line -> open shape with teeth + tongue
      const open = m * 7;
      g.fillStyle = '#4a1418'; g.beginPath();
      g.moveTo(-9, 12); g.quadraticCurveTo(0, 13 + open * 1.8, 9, 12); g.quadraticCurveTo(0, 12 - open * 0.2, -9, 12); g.fill();
      if (open > 1.5) {
        g.fillStyle = '#e46a6a'; g.beginPath(); g.ellipse(0, 13 + open * 1.2, 5, open * 0.5, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = '#fff'; g.fillRect(-6, 12.2, 12, Math.min(1.6, open * 0.3));
      }
      g.strokeStyle = 'rgba(60,20,20,.7)'; g.lineWidth = 0.8; g.beginPath(); g.moveTo(-9, 12); g.quadraticCurveTo(0, 12.5, 9, 12); g.stroke();
    }

    // eyes
    for (const s of [-1, 1]) {
      const ex = s * 9.5, ey = -5;
      g.fillStyle = '#fff'; g.beginPath(); g.ellipse(ex, ey, 6, 6.5, 0, 0, Math.PI * 2); g.fill();
      const px = ex + st.look * 0.9, py = ey + 0.6;
      g.fillStyle = c.eye; g.beginPath(); g.arc(px, py, 3.6, 0, Math.PI * 2); g.fill();
      g.fillStyle = '#111'; g.beginPath(); g.arc(px, py, 2, 0, Math.PI * 2); g.fill();
      g.fillStyle = 'rgba(255,255,255,.9)'; g.beginPath(); g.arc(px - 1.3, py - 1.5, 1, 0, Math.PI * 2); g.fill();
      // eyelid (fur colour) closing from top; also angry lid from brow
      const lid = Math.max(lidClose, Math.max(0, b) * 0.35);
      if (lid > 0) {
        g.fillStyle = c.furDark; g.beginPath();
        g.ellipse(ex, ey - 7 + lid * 7.5, 6.6, 7, 0, 0, Math.PI * 2); g.fill();
        g.fillStyle = c.fur; g.beginPath(); g.rect(ex - 7, ey - 15, 14, 8 - 0.5); g.fill();
      }
      // brow
      g.strokeStyle = c.furDark; g.lineWidth = 2.2; g.lineCap = 'round';
      g.beginPath(); g.moveTo(ex - 5.5 * s, ey - 9 - b * 0.5 * (s > 0 ? -1 : 1) * -1); g.lineTo(ex + 5 * s, ey - 9.5 - b * 2.5); g.stroke();
    }

    // headset: band, earcup, mic boom
    g.strokeStyle = '#1d2636'; g.lineWidth = 3; g.beginPath(); g.arc(0, -4, 27, Math.PI * 1.08, Math.PI * 1.92); g.stroke();
    g.fillStyle = '#242f45'; g.beginPath(); g.ellipse(-25, 2, 5, 7, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = '#5dc6ff'; g.beginPath(); g.ellipse(-25, 2, 2, 3.2, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = '#242f45'; g.lineWidth = 1.6; g.beginPath(); g.moveTo(-25, 7); g.quadraticCurveTo(-24, 20, -8, 19); g.stroke();
    g.fillStyle = '#1d2636'; g.beginPath(); g.ellipse(-8, 19, 3, 1.8, 0, 0, Math.PI * 2); g.fill();
    g.fillStyle = st.talking && (Math.floor(st.t * 10) % 2) ? '#ff5a4a' : '#7a2a2a'; g.beginPath(); g.arc(-25, -5.5, 1, 0, Math.PI * 2); g.fill();
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
