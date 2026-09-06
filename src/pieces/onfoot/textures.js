// Procedural canvas textures for the hangar (no external assets).
import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  return [c, c.getContext('2d')];
}

function hash(x, y, s = 0) {
  let h = (x * 374761393 + y * 668265263 + s * 1274126177) | 0;
  h = (h ^ (h >>> 13)) * 1274126177;
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function grain(ctx, w, h, amount, seed = 1) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (hash((i >> 2) % w, (i >> 2) / w | 0, seed) - 0.5) * amount;
    d[i] += n; d[i + 1] += n; d[i + 2] += n;
  }
  ctx.putImageData(img, 0, 0);
}

function tex(c, repeat = 1, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Floor: dark blue-steel plates with seams, bolts, hazard stripe and painted deck markings. */
export function makeFloorTextures() {
  const S = 1024;
  const [c, g] = canvas(S, S);
  const [rc, rg] = canvas(S, S);
  // base
  g.fillStyle = '#2a3140'; g.fillRect(0, 0, S, S);
  rg.fillStyle = '#7a7a7a'; rg.fillRect(0, 0, S, S);
  const N = 4, P = S / N;
  for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
    const x = i * P, y = j * P;
    const v = 0.9 + hash(i, j, 7) * 0.2;
    g.fillStyle = `rgb(${38 * v | 0},${45 * v | 0},${58 * v | 0})`;
    g.fillRect(x + 4, y + 4, P - 8, P - 8);
    // brushed streaks
    for (let k = 0; k < 40; k++) {
      const yy = y + 6 + hash(i * 7 + k, j, 3) * (P - 12);
      g.fillStyle = `rgba(255,255,255,${0.02 + hash(k, i + j, 4) * 0.03})`;
      g.fillRect(x + 6, yy, P - 12, 1 + hash(k, j, 5) * 2);
    }
    // seams
    g.fillStyle = '#0d1018'; g.fillRect(x, y, P, 4); g.fillRect(x, y, 4, P);
    g.fillStyle = 'rgba(120,150,190,0.35)'; g.fillRect(x + 4, y + 4, P - 8, 1); g.fillRect(x + 4, y + 4, 1, P - 8);
    rg.fillStyle = '#b0b0b0'; rg.fillRect(x, y, P, 4); rg.fillRect(x, y, 4, P);
    // bolts
    for (const [bx, by] of [[14, 14], [P - 14, 14], [14, P - 14], [P - 14, P - 14]]) {
      g.fillStyle = '#12161f'; g.beginPath(); g.arc(x + bx, y + by, 6, 0, 7); g.fill();
      g.fillStyle = '#5a6a80'; g.beginPath(); g.arc(x + bx - 1, y + by - 1, 4, 0, 7); g.fill();
      rg.fillStyle = '#404040'; rg.beginPath(); rg.arc(x + bx, y + by, 6, 0, 7); rg.fill();
    }
    // vent grille on some tiles
    if (hash(i, j, 9) > 0.7) {
      g.fillStyle = '#151a24';
      for (let k = 0; k < 6; k++) g.fillRect(x + P * 0.3, y + P * 0.3 + k * 12, P * 0.4, 5);
      rg.fillStyle = '#c8c8c8'; rg.fillRect(x + P * 0.3, y + P * 0.3, P * 0.4, 70);
    }
  }
  // painted center line + hazard stripes (one row of tiles)
  g.fillStyle = 'rgba(255,196,40,0.85)';
  g.fillRect(0, S * 0.5 - 6, S, 12);
  rg.fillStyle = '#505050'; rg.fillRect(0, S * 0.5 - 6, S, 12);
  grain(g, S, S, 14, 1);
  return { map: tex(c, 1), roughnessMap: tex(rc, 1, false) };
}

/** Wall panels: darker steel with horizontal grooves + emissive strip mask. */
export function makeWallTextures() {
  const W = 1024, H = 512;
  const [c, g] = canvas(W, H);
  const [ec, eg] = canvas(W, H);
  g.fillStyle = '#1e2430'; g.fillRect(0, 0, W, H);
  eg.fillStyle = '#000'; eg.fillRect(0, 0, W, H);
  const rows = 4, cols = 6;
  for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
    const x = i * W / cols, y = j * H / rows, w = W / cols, h = H / rows;
    const v = 0.9 + hash(i, j, 11) * 0.25;
    g.fillStyle = `rgb(${34 * v | 0},${42 * v | 0},${56 * v | 0})`;
    g.fillRect(x + 3, y + 3, w - 6, h - 6);
    g.fillStyle = 'rgba(0,0,0,0.6)'; g.fillRect(x, y, w, 3); g.fillRect(x, y, 3, h);
    g.fillStyle = 'rgba(140,170,210,0.25)'; g.fillRect(x + 3, y + 3, w - 6, 1);
    if (j === 1 && hash(i, 0, 3) > 0.35) {
      // light strip
      g.fillStyle = '#9fe8ff'; g.fillRect(x + 14, y + h * 0.45, w - 28, 8);
      eg.fillStyle = '#7fd8ff'; eg.fillRect(x + 14, y + h * 0.45, w - 28, 8);
    }
    if (j === 3 && hash(i, 1, 5) > 0.5) {
      // warning stripe block
      for (let k = 0; k < w; k += 32) {
        g.fillStyle = (k / 32) % 2 ? '#e0a020' : '#151820';
        g.fillRect(x + k, y + h - 30, 32, 18);
      }
    }
  }
  grain(g, W, H, 10, 2);
  return { map: tex(c, 1), emissiveMap: tex(ec, 1) };
}

/** Holographic panel screen: schematic lines, bars, Arwing silhouette. */
export function makeHoloTexture(variant = 0) {
  const W = 512, H = 320;
  const [c, g] = canvas(W, H);
  g.fillStyle = 'rgba(0,0,0,1)'; g.fillRect(0, 0, W, H);
  g.strokeStyle = 'rgba(90,200,255,0.35)'; g.lineWidth = 1;
  for (let x = 0; x < W; x += 24) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, H); g.stroke(); }
  for (let y = 0; y < H; y += 24) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); }
  g.strokeStyle = '#8ff0ff'; g.lineWidth = 3; g.strokeRect(6, 6, W - 12, H - 12);
  g.fillStyle = '#bff6ff'; g.font = 'bold 26px system-ui'; g.fillText(['GREAT FOX // HANGAR 01', 'ARWING STATUS', 'CORNERIA ORBIT'][variant % 3], 20, 40);
  g.font = '16px monospace'; g.fillStyle = '#7fe0ff';
  for (let i = 0; i < 5; i++) g.fillText(`SYS ${i + 1}  ${'▮'.repeat(3 + ((i * 7 + variant) % 6))}  ${(72 + ((i * 13 + variant * 5) % 27))}%`, 20, 78 + i * 26);
  if (variant % 3 === 1) {
    // Arwing silhouette
    g.strokeStyle = '#c8ffff'; g.lineWidth = 3; g.beginPath();
    const cx = 370, cy = 190;
    g.moveTo(cx, cy - 90); g.lineTo(cx + 22, cy + 20); g.lineTo(cx + 110, cy + 60); g.lineTo(cx + 40, cy + 70); g.lineTo(cx + 18, cy + 90);
    g.lineTo(cx - 18, cy + 90); g.lineTo(cx - 40, cy + 70); g.lineTo(cx - 110, cy + 60); g.lineTo(cx - 22, cy + 20); g.closePath(); g.stroke();
    g.fillStyle = 'rgba(120,220,255,0.25)'; g.fill();
  } else {
    // planet
    g.strokeStyle = '#c8ffff'; g.lineWidth = 2;
    g.beginPath(); g.arc(380, 200, 70, 0, 7); g.stroke();
    g.beginPath(); g.ellipse(380, 200, 110, 26, -0.4, 0, 7); g.stroke();
    g.fillStyle = 'rgba(120,220,255,0.2)'; g.beginPath(); g.arc(380, 200, 70, 0, 7); g.fill();
  }
  // scanline bars
  g.fillStyle = 'rgba(160,240,255,0.08)';
  for (let y = 0; y < H; y += 4) g.fillRect(0, y, W, 2);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Large painted end-wall decal: Star Fox style winged emblem, stencil text, hazard chevrons. */
export function makeWallDecal() {
  const W = 1024, H = 384;
  const [c, g] = canvas(W, H);
  g.clearRect(0, 0, W, H);
  // hazard chevron band along the bottom
  for (let x = -40; x < W; x += 80) {
    g.fillStyle = '#e8a728'; g.beginPath(); g.moveTo(x, H); g.lineTo(x + 40, H); g.lineTo(x + 80, H - 40); g.lineTo(x + 40, H - 40); g.closePath(); g.fill();
  }
  g.fillStyle = 'rgba(232,167,40,0.9)'; g.fillRect(0, H - 48, W, 6);
  // emblem: circle + wings
  const cx = W / 2, cy = 150;
  g.strokeStyle = '#dfe9f5'; g.lineWidth = 14; g.beginPath(); g.arc(cx, cy, 78, 0, Math.PI * 2); g.stroke();
  g.fillStyle = '#dfe9f5';
  for (const s of [-1, 1]) {
    g.beginPath(); g.moveTo(cx + s * 95, cy - 10); g.lineTo(cx + s * 330, cy - 70); g.lineTo(cx + s * 300, cy - 20); g.lineTo(cx + s * 380, cy + 10); g.lineTo(cx + s * 110, cy + 40); g.closePath(); g.fill();
  }
  // fox head silhouette (ears + snout) inside ring
  g.beginPath(); g.moveTo(cx - 48, cy - 62); g.lineTo(cx - 30, cy - 6); g.lineTo(cx - 8, cy + 46); g.lineTo(cx, cy + 62); g.lineTo(cx + 8, cy + 46); g.lineTo(cx + 30, cy - 6); g.lineTo(cx + 48, cy - 62); g.lineTo(cx + 26, cy - 30); g.lineTo(cx, cy - 22); g.lineTo(cx - 26, cy - 30); g.closePath(); g.fill();
  g.fillStyle = '#d8342c'; g.beginPath(); g.arc(cx - 13, cy - 2, 5, 0, 7); g.arc(cx + 13, cy - 2, 5, 0, 7); g.fill();
  // stencil text
  g.fillStyle = '#dfe9f5'; g.font = 'bold 54px system-ui, sans-serif'; g.textAlign = 'center';
  g.fillText('GREAT FOX  ·  HANGAR 01', cx, 290);
  g.font = 'bold 22px monospace'; g.fillStyle = '#8fdcff';
  g.fillText('CORNERIA DEFENSE FORCE  //  AUTHORIZED PILOTS ONLY', cx, 322);
  grain(g, W, H, 26, 5);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t;
}

/** Short directional fur: base colour with darker strands + lighter tips. */
export function makeFurTexture(base = '#d9782a', dark = '#a84e14') {
  const S = 256;
  const [c, g] = canvas(S, S);
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 2600; i++) {
    const x = hash(i, 1, 21) * S, y = hash(i, 2, 22) * S, len = 6 + hash(i, 3, 23) * 14;
    const a = hash(i, 4, 24);
    g.strokeStyle = a > 0.55 ? dark : 'rgba(255,245,225,0.35)'; g.globalAlpha = 0.25 + hash(i, 5, 25) * 0.4; g.lineWidth = 1 + hash(i, 6, 26);
    g.beginPath(); g.moveTo(x, y); g.lineTo(x + (hash(i, 7, 27) - 0.5) * 4, y + len); g.stroke();
  }
  g.globalAlpha = 1;
  grain(g, S, S, 12, 31);
  return tex(c, 1);
}

/** Woven flight-suit fabric with subtle quilting seams. */
export function makeFabricTexture() {
  const S = 256;
  const [c, g] = canvas(S, S);
  g.fillStyle = '#ffffff'; g.fillRect(0, 0, S, S);
  // fine weave only (no hard quilting grid — that read as voxels at play distance)
  g.fillStyle = 'rgba(0,0,0,0.07)';
  for (let y = 0; y < S; y += 3) g.fillRect(0, y, S, 1);
  for (let x = 0; x < S; x += 3) g.fillRect(x, 0, 1, S);
  // one soft diagonal stitch line per tile for a hint of tailoring
  g.strokeStyle = 'rgba(0,0,0,0.10)'; g.lineWidth = 2;
  g.beginPath(); g.moveTo(0, S * 0.5); g.lineTo(S, S * 0.5); g.stroke();
  grain(g, S, S, 10, 41);
  const t = tex(c, 1); t.repeat.set(1, 1); return t;
}

/** Cargo crate face: recessed panel, rivets, hazard stripe, stencil + scuffs. Colour + roughness. */
export function makeCrateTextures(variant = 0) {
  const S = 512;
  const [c, g] = canvas(S, S);
  const [rc, rg] = canvas(S, S);
  const base = ['#3d4a5e', '#4a5262', '#5a4a3a'][variant % 3];
  g.fillStyle = base; g.fillRect(0, 0, S, S);
  rg.fillStyle = '#8a8a8a'; rg.fillRect(0, 0, S, S);
  // frame + recessed panel
  g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(28, 28, S - 56, S - 56);
  g.fillStyle = 'rgba(255,255,255,0.06)'; g.fillRect(36, 36, S - 72, S - 72);
  g.fillStyle = 'rgba(0,0,0,0.25)'; g.fillRect(36, 36, S - 72, 6); g.fillRect(36, 36, 6, S - 72);
  g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(36, S - 42, S - 72, 6); g.fillRect(S - 42, 36, 6, S - 72);
  rg.fillStyle = '#b8b8b8'; rg.fillRect(36, 36, S - 72, S - 72);
  // cross brace ribs
  g.fillStyle = 'rgba(255,255,255,0.05)'; g.fillRect(36, S / 2 - 10, S - 72, 20); g.fillRect(S / 2 - 10, 36, 20, S - 72);
  // rivets
  for (const [x, y] of [[16, 16], [S - 16, 16], [16, S - 16], [S - 16, S - 16], [S / 2, 14], [S / 2, S - 14], [14, S / 2], [S - 14, S / 2]]) {
    g.fillStyle = '#10141c'; g.beginPath(); g.arc(x + 1, y + 1, 7, 0, 7); g.fill();
    g.fillStyle = '#aab6c8'; g.beginPath(); g.arc(x, y, 6, 0, 7); g.fill();
    g.fillStyle = '#e8f0ff'; g.beginPath(); g.arc(x - 2, y - 2, 2.5, 0, 7); g.fill();
    rg.fillStyle = '#404040'; rg.beginPath(); rg.arc(x, y, 7, 0, 7); rg.fill();
  }
  // hazard stripe band + stencil
  const bandY = variant % 2 ? 70 : S - 130;
  g.save(); g.beginPath(); g.rect(60, bandY, S - 120, 26); g.clip();
  for (let k = -48; k < S + 48; k += 48) { g.fillStyle = ((k / 48) & 1) ? '#e8a728' : '#1a1e26'; g.beginPath(); g.moveTo(k, bandY); g.lineTo(k + 48, bandY); g.lineTo(k + 24, bandY + 26); g.lineTo(k - 24, bandY + 26); g.closePath(); g.fill(); }
  g.restore();
  g.fillStyle = 'rgba(225,235,250,0.85)'; g.font = 'bold 44px system-ui, sans-serif'; g.textAlign = 'center';
  g.fillText(['CDF-0' + (variant + 1), 'ARWING PARTS', 'G-DIFFUSER'][variant % 3], S / 2, S / 2 + 16 + (variant % 2 ? 30 : -20));
  g.font = 'bold 18px monospace'; g.fillStyle = 'rgba(160,220,255,0.7)';
  g.fillText('CORNERIA DEFENSE FORCE // HANGAR SUPPLY', S / 2, S / 2 + 46 + (variant % 2 ? 30 : -20));
  // emblem ring
  g.strokeStyle = 'rgba(225,235,250,0.55)'; g.lineWidth = 5; g.beginPath(); g.arc(S / 2, S / 2 - 70 + (variant % 2 ? 30 : -20), 34, 0, 7); g.stroke();
  // scuffs / grime
  for (let i = 0; i < 60; i++) { g.fillStyle = `rgba(${hash(i, 1, 51) > 0.5 ? '0,0,0' : '255,255,255'},${0.04 + hash(i, 2, 52) * 0.08})`; const w = 10 + hash(i, 3, 53) * 90; g.fillRect(hash(i, 4, 54) * S, hash(i, 5, 55) * S, w, 2 + hash(i, 6, 56) * 4); }
  grain(g, S, S, 14, 61);
  return { map: tex(c, 1), roughnessMap: tex(rc, 1, false) };
}

/** Soft radial sprite for particles/glow. */
export function makeGlowTexture() {
  const [c, g] = canvas(128, 128);
  const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.3, 'rgba(255,255,255,0.6)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  return new THREE.CanvasTexture(c);
}

/** Grated catwalk mesh texture with alpha. */
export function makeGrateTexture() {
  const S = 256;
  const [c, g] = canvas(S, S);
  g.clearRect(0, 0, S, S);
  g.fillStyle = '#3a4352';
  const bar = 6, gap = 26;
  for (let y = 0; y < S; y += gap) g.fillRect(0, y, S, bar);
  for (let x = 0; x < S; x += gap) g.fillRect(x, 0, bar, S);
  g.fillStyle = 'rgba(255,255,255,0.15)';
  for (let y = 0; y < S; y += gap) g.fillRect(0, y, S, 1);
  const t = tex(c, 1); return t;
}
