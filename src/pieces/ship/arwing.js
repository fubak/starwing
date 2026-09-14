// Procedural Arwing-class fighter. Faceted wedge fuselage, thick tapered delta
// wings, G-diffuser nacelles with big blue-glowing wingtip fins, canvas-painted
// livery + panel lines and custom shaders for the canopy fresnel, glow rings and
// engine plume. Hard edges everywhere (per-facet normals) so the white livery
// reads as painted metal panels under a clear-coat, not clay.
//
//   const ship = buildArwing({ THREE });
//   scene.add(ship.group);
//   ship.update(dt, t, camera); ship.setThrust(0..1); ship.setBank(-1..1); ship.flap(-1..1)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------
// Livery / panel-line textures (canvas)
// ---------------------------------------------------------------------------
// Deterministic rng so the colour map, roughness map and normal map all agree on
// where every seam / hatch / rivet is.
let _seed = 1337;
const rnd = () => { _seed = (_seed * 1664525 + 1013904223) >>> 0; return _seed / 4294967296; };
const reseed = (s) => { _seed = s >>> 0; };

function grainDirt(g, W, H, n, a = 0.05) {
  for (let i = 0; i < n; i++) {
    const x = rnd() * W, y = rnd() * H;
    g.fillStyle = `rgba(${rnd() < 0.5 ? '40,50,70' : '255,255,255'},${rnd() * a})`;
    g.fillRect(x, y, 2 + rnd() * 30, 1 + rnd() * 3);
  }
}

// Module-level texture cache: all Arwings share identical skin canvases.
let _arwingTex = null;
export function arwingTextures() {
  if (_arwingTex) return _arwingTex;
  _arwingTex = {
    hull: hullTexture(),
    rough: hullRoughnessTexture(),
    wing: wingTexture(),
    hullNrm: normalFromHeight(hullHeightCanvas(), 2.2),
    wingNrm: normalFromHeight(wingHeightCanvas(), 2.2),
  };
  return _arwingTex;
}

/** Sobel a greyscale height canvas into a tangent-space normal map. */
function normalFromHeight(hc, strength = 2.0) {
  const W = hc.width, H = hc.height;
  const src = hc.getContext('2d').getImageData(0, 0, W, H).data;
  const out = document.createElement('canvas'); out.width = W; out.height = H;
  const og = out.getContext('2d'); const img = og.createImageData(W, H); const d = img.data;
  const h = (x, y) => src[(((y + H) % H) * W + ((x + W) % W)) * 4] / 255;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = (h(x + 1, y - 1) + 2 * h(x + 1, y) + h(x + 1, y + 1)) - (h(x - 1, y - 1) + 2 * h(x - 1, y) + h(x - 1, y + 1));
    const dy = (h(x - 1, y + 1) + 2 * h(x, y + 1) + h(x + 1, y + 1)) - (h(x - 1, y - 1) + 2 * h(x, y - 1) + h(x + 1, y - 1));
    let nx = -dx * strength, ny = -dy * strength, nz = 1;
    const l = Math.hypot(nx, ny, nz); nx /= l; ny /= l; nz /= l;
    const i = (y * W + x) * 4;
    d[i] = (nx * 0.5 + 0.5) * 255; d[i + 1] = (ny * 0.5 + 0.5) * 255; d[i + 2] = (nz * 0.5 + 0.5) * 255; d[i + 3] = 255;
  }
  og.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(out);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.anisotropy = 8;
  return tex;
}

// Shared hull panel layout (v rings nose->tail, u seams around).
const HULL_RINGS = [0.14, 0.22, 0.33, 0.42, 0.53, 0.62, 0.72, 0.82, 0.905];
const HULL_SEAMS = [0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1];
function hullSeamSpans() { reseed(4242); return HULL_SEAMS.slice(1, -1).map(() => [0.16 + rnd() * 0.1, 0.9 - rnd() * 0.1]); }

function grooveLine(g, x0, y0, x1, y1, w) {
  g.lineCap = 'round';
  g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = w * 2.2; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
  g.strokeStyle = 'rgba(0,0,0,0.8)'; g.lineWidth = w; g.beginPath(); g.moveTo(x0, y0); g.lineTo(x1, y1); g.stroke();
}

/** Height canvas for the hull: recessed panel grooves, hatches, vent louvres, rivets, plate offsets. */
function hullHeightCanvas() {
  const W = 1024, H = 1024;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, W, H);
  reseed(99);
  for (let i = 0; i < HULL_RINGS.length - 1; i++) for (let j = 0; j < HULL_SEAMS.length - 1; j++) {
    const v = 120 + Math.floor(rnd() * 16);
    g.fillStyle = `rgb(${v},${v},${v})`;
    g.fillRect(W * HULL_SEAMS[j], H * HULL_RINGS[i], W * (HULL_SEAMS[j + 1] - HULL_SEAMS[j]), H * (HULL_RINGS[i + 1] - HULL_RINGS[i]));
  }
  for (const r of HULL_RINGS) grooveLine(g, 0, H * r, W, H * r, 5);
  hullSeamSpans().forEach(([a, b], i) => { const s = HULL_SEAMS[i + 1]; grooveLine(g, W * s, H * a, W * s, H * b, 4); });
  const hatch = (u, v, w, h, r = 6) => { g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = 3; g.beginPath(); g.roundRect(W * u - w / 2, H * v - h / 2, w, h, r); g.stroke(); };
  hatch(0.25, 0.5, 60, 90); hatch(0.75, 0.5, 60, 90); hatch(0.5, 0.45, 80, 50);
  hatch(0.27, 0.7, 40, 120); hatch(0.73, 0.7, 40, 120);
  g.fillStyle = 'rgba(0,0,0,0.6)';
  for (let i = 0; i < 6; i++) { g.fillRect(W * 0.3 - 30, H * (0.66 + i * 0.02), 60, 4); g.fillRect(W * 0.7 - 30, H * (0.66 + i * 0.02), 60, 4); }
  g.fillStyle = 'rgba(255,255,255,0.55)';
  for (const r of HULL_RINGS) for (let x = 12; x < W; x += 26) { g.beginPath(); g.arc(x, H * r + 12, 2.2, 0, 6.283); g.fill(); }
  return c;
}

/** Height canvas for wings (planar uv tiles). */
function wingHeightCanvas() {
  const W = 512, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#808080'; g.fillRect(0, 0, W, H);
  reseed(7);
  for (let i = 0; i < 24; i++) { const v = 122 + Math.floor(rnd() * 12); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(W * (i % 6) / 6, H * Math.floor(i / 6) / 4, W / 6, H / 4); }
  for (let i = 1; i < 6; i++) grooveLine(g, W * i / 6, 0, W * i / 6, H, 4);
  for (let i = 1; i < 4; i++) grooveLine(g, 0, H * i / 4, W, H * i / 4, 4);
  g.fillStyle = 'rgba(0,0,0,0.6)'; for (let i = 0; i < 5; i++) g.fillRect(W * 0.3, H * (0.4 + i * 0.03), 80, 4);
  g.strokeStyle = 'rgba(0,0,0,0.7)'; g.lineWidth = 3; g.beginPath(); g.roundRect(W * 0.55, H * 0.55, 90, 60, 6); g.stroke();
  g.fillStyle = 'rgba(255,255,255,0.5)';
  for (let i = 1; i < 4; i++) for (let x = 10; x < W; x += 28) { g.beginPath(); g.arc(x, H * i / 4 + 10, 2, 0, 6.283); g.fill(); }
  return c;
}

/** Fuselage: u (x) goes around the hull (0 = top-centre spine, .5 = belly), v (y) nose -> tail. */
function hullTexture() {
  const W = 1024, H = 1024;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  reseed(2024);
  g.fillStyle = '#eef0f3'; g.fillRect(0, 0, W, H);
  // grey belly (u .38..62)
  g.fillStyle = '#8c97a8'; g.fillRect(W * 0.40, 0, W * 0.20, H);
  g.fillStyle = '#7a8595'; g.fillRect(W * 0.40, H * 0.55, W * 0.20, H * 0.45);
  // blue nose cap with a swept chevron edge
  g.fillStyle = '#2050c8';
  g.beginPath(); g.moveTo(0, 0); g.lineTo(W, 0); g.lineTo(W, H * 0.09); g.lineTo(W * 0.5, H * 0.14); g.lineTo(0, H * 0.09); g.closePath(); g.fill();
  // spine stripe (top centre) — broken by the canopy
  g.fillStyle = '#2a5cd8';
  g.fillRect(0, H * 0.58, W * 0.05, H * 0.36); g.fillRect(W * 0.95, H * 0.58, W * 0.05, H * 0.36);
  // flank blue cheat lines (upper chamfer facets, u ~.1..2 and .8..9)
  g.fillStyle = '#2458c8';
  g.beginPath(); g.moveTo(W * 0.10, H * 0.30); g.lineTo(W * 0.20, H * 0.30); g.lineTo(W * 0.20, H * 0.86); g.lineTo(W * 0.10, H * 0.84); g.closePath(); g.fill();
  g.beginPath(); g.moveTo(W * 0.80, H * 0.30); g.lineTo(W * 0.90, H * 0.30); g.lineTo(W * 0.90, H * 0.84); g.lineTo(W * 0.80, H * 0.86); g.closePath(); g.fill();
  // red trim
  g.fillStyle = '#d8342a';
  g.fillRect(0, H * 0.33, W, 7); g.fillRect(0, H * 0.905, W, 7);
  g.fillRect(W * 0.10, H * 0.28, W * 0.10, 8); g.fillRect(W * 0.80, H * 0.28, W * 0.10, 8);
  grainDirt(g, W, H, 2600, 0.04);
  // per-panel tone variation (very subtle: the normal map does the panel work now)
  const rings = HULL_RINGS, seams = HULL_SEAMS;
  for (let i = 0; i < rings.length - 1; i++) for (let j = 0; j < seams.length - 1; j++) {
    const k = rnd();
    g.fillStyle = k < 0.3 ? 'rgba(160,178,205,0.08)' : k < 0.45 ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0)';
    g.fillRect(W * seams[j], H * rings[i], W * (seams[j + 1] - seams[j]), H * (rings[i + 1] - rings[i]));
  }
  // panel lines: thin, soft shadow lines (the groove itself is in the normal map)
  g.strokeStyle = 'rgba(40,50,70,0.55)'; g.lineWidth = 2;
  for (const r of rings) { g.beginPath(); g.moveTo(0, H * r); g.lineTo(W, H * r); g.stroke(); }
  hullSeamSpans().forEach(([a, b], i) => { const s = seams[i + 1]; g.beginPath(); g.moveTo(W * s, H * a); g.lineTo(W * s, H * b); g.stroke(); });
  // grime shadow under each ring seam (weathering streaks trailing aft)
  for (const r of rings) { const gr = g.createLinearGradient(0, H * r, 0, H * r + 22); gr.addColorStop(0, 'rgba(60,70,90,0.22)'); gr.addColorStop(1, 'rgba(60,70,90,0)'); g.fillStyle = gr; g.fillRect(0, H * r, W, 22); }
  // hatches / vents
  g.strokeStyle = 'rgba(30,38,55,0.6)'; g.lineWidth = 2;
  const hatch = (u, v, w, h, r = 6) => { g.beginPath(); g.roundRect(W * u - w / 2, H * v - h / 2, w, h, r); g.stroke(); };
  hatch(0.25, 0.5, 60, 90); hatch(0.75, 0.5, 60, 90); hatch(0.5, 0.45, 80, 50);
  hatch(0.27, 0.7, 40, 120); hatch(0.73, 0.7, 40, 120);
  g.fillStyle = 'rgba(30,38,55,0.5)';
  for (let i = 0; i < 6; i++) { g.fillRect(W * 0.3 - 30, H * (0.66 + i * 0.02), 60, 3); g.fillRect(W * 0.7 - 30, H * (0.66 + i * 0.02), 60, 3); }
  g.fillStyle = 'rgba(30,38,55,0.7)'; g.font = 'bold 26px system-ui';
  g.fillText('SF-01', W * 0.24, H * 0.395); g.fillText('SF-01', W * 0.70, H * 0.395);
  g.font = 'bold 14px system-ui'; g.fillStyle = 'rgba(200,40,30,0.8)';
  g.fillText('NO STEP', W * 0.23, H * 0.58); g.fillText('NO STEP', W * 0.72, H * 0.58);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping; tex.anisotropy = 8;
  return tex;
}

function hullRoughnessTexture() {
  const W = 512, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  reseed(555);
  g.fillStyle = '#4a4a4a'; g.fillRect(0, 0, W, H); // glossy base, panel lines + belly rougher
  g.fillStyle = '#7a7a7a'; g.fillRect(W * 0.40, 0, W * 0.20, H);
  for (let i = 0; i < 4000; i++) {
    g.fillStyle = `rgba(${rnd() < 0.5 ? 0 : 255},255,255,${rnd() * 0.08})`;
    g.fillRect(rnd() * W, rnd() * H, 1 + rnd() * 40, 1 + rnd() * 2);
  }
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2;
  for (const r of HULL_RINGS) { g.beginPath(); g.moveTo(0, H * r); g.lineTo(W, H * r); g.stroke(); }
  // grime under seams is rougher
  for (const r of HULL_RINGS) { const gr = g.createLinearGradient(0, H * r, 0, H * r + 12); gr.addColorStop(0, 'rgba(255,255,255,0.5)'); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.fillRect(0, H * r, W, 12); }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

/** Wing skin (planar uv: 1 unit = ~3.3 world units). */
function wingTexture() {
  const W = 512, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  reseed(31);
  g.fillStyle = '#eef0f3'; g.fillRect(0, 0, W, H);
  grainDirt(g, W, H, 1200, 0.035);
  for (let i = 0; i < 24; i++) { g.fillStyle = rnd() < 0.45 ? 'rgba(160,178,205,0.07)' : rnd() < 0.5 ? 'rgba(255,255,255,0.18)' : 'rgba(0,0,0,0)'; g.fillRect(W * (i % 6) / 6, H * Math.floor(i / 6) / 4, W / 6, H / 4); }
  g.strokeStyle = 'rgba(40,50,70,0.5)'; g.lineWidth = 2;
  for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(W * i / 6, 0); g.lineTo(W * i / 6, H); g.stroke(); }
  for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, H * i / 4); g.lineTo(W, H * i / 4); g.stroke(); }
  g.fillStyle = 'rgba(30,38,55,0.5)'; for (let i = 0; i < 5; i++) g.fillRect(W * 0.3, H * (0.4 + i * 0.03), 80, 3);
  g.strokeStyle = 'rgba(30,38,55,0.5)'; g.lineWidth = 2; g.beginPath(); g.roundRect(W * 0.55, H * 0.55, 90, 60, 6); g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------
/**
 * Faceted loft: `rings` is an array of closed polygons (array of [x,y,z]) with the
 * SAME corner count. Each facet strip (corner k -> k+1) gets its own vertices so
 * normals are hard across corners and smooth along the length. uv: u around, v along.
 */
function facetLoft(rings, { closed = true, uvScale = [1, 1] } = {}) {
  const pos = [], uv = [], idx = [];
  const rows = rings.length, C = rings[0].length, F = closed ? C : C - 1;
  let vi = 0;
  for (let k = 0; k < F; k++) {
    const k1 = (k + 1) % C;
    const base = vi;
    for (let i = 0; i < rows; i++) {
      const a = rings[i][k], b = rings[i][k1];
      pos.push(a[0], a[1], a[2], b[0], b[1], b[2]);
      uv.push((k / F) * uvScale[0], (i / (rows - 1)) * uvScale[1], ((k + 1) / F) * uvScale[0], (i / (rows - 1)) * uvScale[1]);
      vi += 2;
    }
    for (let i = 0; i < rows - 1; i++) {
      const a = base + i * 2, b = a + 1, c = a + 2, d = a + 3;
      idx.push(a, b, c, b, d, c);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  // auto-orient: make normals point away from the centroid (mirrored rings flip winding)
  const cx = pos.filter((_, i) => i % 3 === 0).reduce((a, b) => a + b, 0) / (pos.length / 3);
  const cy = pos.filter((_, i) => i % 3 === 1).reduce((a, b) => a + b, 0) / (pos.length / 3);
  const cz = pos.filter((_, i) => i % 3 === 2).reduce((a, b) => a + b, 0) / (pos.length / 3);
  const n = g.attributes.normal.array; let dot = 0;
  for (let i = 0; i < pos.length; i += 3) dot += n[i] * (pos[i] - cx) + n[i + 1] * (pos[i + 1] - cy) + n[i + 2] * (pos[i + 2] - cz);
  if (dot < 0) { for (let i = 0; i < idx.length; i += 3) { const t = idx[i + 1]; idx[i + 1] = idx[i + 2]; idx[i + 2] = t; } g.setIndex(idx); g.computeVertexNormals(); }
  return g;
}

/** Flat polygon cap (fan) with a given normal direction sign. */
function cap(ring, flip = false) {
  const shape = new THREE.Shape();
  ring.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();
  const g = new THREE.ShapeGeometry(shape);
  if (flip) g.scale(1, 1, -1);
  return g;
}

/** Overwrite uvs with a planar projection (axes 'xz' | 'xy' | 'zy'). */
function planarUV(g, scale = 0.3, axes = 'xz') {
  const p = g.attributes.position, uvs = new Float32Array(p.count * 2);
  const ix = axes[0] === 'x' ? 0 : axes[0] === 'y' ? 1 : 2, iy = axes[1] === 'x' ? 0 : axes[1] === 'y' ? 1 : 2;
  for (let i = 0; i < p.count; i++) { uvs[i * 2] = p.array[i * 3 + ix] * scale; uvs[i * 2 + 1] = p.array[i * 3 + iy] * scale; }
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return g;
}

/**
 * Fuselage cross-section: 14-gon wedge — spine ridge, flat upper deck chamfers,
 * near-vertical flanks, lower chamfers, keel. Extra mid-points soften the two
 * lower chamfer transitions so the silhouette is less faceted but stays a wedge.
 * (w half-width, ht top, hb bottom)
 */
function hullRing(z, w, ht, hb, { deck = 0.55, flank = 0.25, belly = 0.6, y = 0 } = {}) {
  const r = [
    [0, ht], [w * deck, ht * 0.86], [w * 0.985, ht * (flank + (0.86 - flank) * 0.55)], [w, ht * flank],
    [w, -hb * 0.35], [w * (0.5 + belly * 0.5), -hb * 0.78], [w * belly, -hb], [0, -hb * 1.05],
  ];
  const full = [...r, ...r.slice(1, -1).reverse().map(([x, yy]) => [-x, yy])];
  return full.map(([x, yy]) => [x, yy + y, z]);
}

/**
 * Wing section: 8-gon airfoil at span-station x. le/te chord in z, t thickness,
 * ridge at 35% chord, extra leading-edge midpoints so the camber reads smooth.
 * Returns ring (closed) in CCW order looking from +x.
 */
function wingRing(x, y, le, te, t, ridge = 0.35, camber = 0) {
  const zr = le + (te - le) * ridge, zr2 = le + (te - le) * (ridge + 0.4), lm = le + (te - le) * 0.1;
  return [
    [x, y, le], [x, y + t * 0.32 + camber, lm], [x, y + t * 0.5 + camber, zr], [x, y + t * 0.34 + camber, zr2], [x, y + t * 0.05, te],
    [x, y - t * 0.30, zr2], [x, y - t * 0.5, zr], [x, y - t * 0.28, lm],
  ];
}

/** Build a wing from span stations. Each station { x, y, le, te, t }. Caps the root & tip. */
function wingGeo(stations, s = 1) {
  const rings = stations.map((st) => wingRing(st.x * s, st.y, st.le, st.te, st.t, st.ridge ?? 0.35, st.camber ?? 0));
  const g = facetLoft(rings);
  planarUV(g, 0.21, 'xz');
  return g;
}

/** Faceted nacelle / pod: n-gon cross-section along z. */
function podRing(z, r, y = 0, x = 0, n = 8, squash = 1) {
  const out = [];
  for (let i = 0; i < n; i++) { const a = (i / n) * Math.PI * 2 + Math.PI / n; out.push([x + Math.cos(a) * r, y + Math.sin(a) * r * squash, z]); }
  return out;
}

/** Fin / plate: 2D outline (a = span-ish, b = chord-ish) in a local plane with hex thickness. */
function finGeo(points, thickness) {
  // points: [[u, v], ...] outline in the fin plane (u along height, v along chord); thickness along w.
  // Build as two lofted sections (root/tip) is not general; instead: extrude with bevel then flatten normals.
  const shape = new THREE.Shape();
  points.forEach(([x, y], i) => (i ? shape.lineTo(x, y) : shape.moveTo(x, y)));
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelThickness: thickness * 0.45, bevelSize: thickness * 0.45, bevelSegments: 3, curveSegments: 10 });
  g.translate(0, 0, -thickness / 2);
  return g;
}

/** Mirror a polygon across x for side s (-1/+1), keeping consistent winding. */
function poly(pts, s) { const p = pts.map(([x, z]) => [x * s, z]); return s < 0 ? p.reverse() : p; }

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------
// Canopy glass: a tinted, near-black dielectric with a razor clear-coat. The studio
// env map supplies the reflections; the fresnel patch below drives both the rim
// colour and the opacity (glancing = mirror, head-on = see the pilot).
const canopyMaterial = (envMap) => new THREE.MeshPhysicalMaterial({
  color: 0x030812, metalness: 0.0, roughness: 0.04, transparent: true, opacity: 0.42,
  clearcoat: 1, clearcoatRoughness: 0.02, envMap, envMapIntensity: 2.6, ior: 1.52,
  specularIntensity: 1.2, specularColor: 0xcfe2ff, side: THREE.FrontSide,
  emissive: 0x0b2a60, emissiveIntensity: 0.12,
});
// Fresnel rim: brighten grazing edges toward a cool reflective blue and (for glass) raise alpha.
function patchFresnel(mat, col = [0.55, 0.75, 1.0], gain = 0.9, alpha = 0.6, pow = 3.0) {
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
       {
         vec3 V = normalize(vViewPosition);
         float f = pow(1.0 - clamp(dot(normalize(vNormal), V), 0.0, 1.0), ${pow.toFixed(1)});
         gl_FragColor.rgb += vec3(${col.map((v) => v.toFixed(3)).join(',')}) * f * ${gain.toFixed(3)};
         gl_FragColor.a = clamp(gl_FragColor.a + f * ${alpha.toFixed(3)}, 0.0, 1.0);
       }`
    );
  };
}

// Engine core disc: hot white/yellow centre -> saturated halo -> dark rim. Replaces
// the old flat MeshBasic discs that blew out to pure white under bloom.
const coreFrag = /* glsl */`
  uniform float uTime; uniform float uThrust; uniform vec3 uHot; uniform vec3 uMid; uniform vec3 uEdge;
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
  void main(){
    vec2 p = vUv - 0.5; float d = length(p) * 2.0; float ang = atan(p.y, p.x);
    float flick = 0.9 + 0.1 * noise(vec2(ang * 2.0, uTime * 6.0)) + 0.06 * sin(uTime * 41.0);
    float core = exp(-d * d * 14.0) * (0.5 + 0.7 * uThrust);
    float mid = smoothstep(1.0, 0.2, d);
    float ring = smoothstep(0.07, 0.0, abs(d - 0.8)) * 0.18;      // thin bright annulus at the nozzle wall
    vec3 c = uEdge * 0.4 + uMid * mid * (0.55 + 0.45 * uThrust) + uHot * core * 1.25 + uHot * ring;
    c *= flick;
    gl_FragColor = vec4(c, 1.0);
  }`;

const glowVert = /* glsl */`
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  void main(){ vUv = uv; vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;

// Engine plume: a lathe cone, additive, animated noise with soft fresnel edges.
const plumeFrag = /* glsl */`
  uniform float uTime; uniform float uThrust; uniform vec3 uCore; uniform vec3 uEdge; uniform float uGain;
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
  void main(){
    float along = vUv.y;                 // 0 at nozzle, 1 at tip
    float rim = 1.0 - abs(dot(vN, vV));  // edge-on => transparent
    float n = noise(vec2(vUv.x * 6.0, along * 4.0 - uTime * 9.0)) * 0.6 + noise(vec2(vUv.x * 13.0, along * 9.0 - uTime * 14.0)) * 0.4;
    float dia = 0.5 + 0.5 * sin(along * 28.0 - uTime * 3.0);
    float body = pow(1.0 - along, 1.7) * (0.7 + 0.45 * n + 0.25 * dia * (1.0 - along));
    float a = body * (1.0 - rim * rim) * (0.3 + uThrust);
    vec3 col = mix(uEdge, uCore, pow(1.0 - along, 2.2) * (0.55 + 0.6 * n));
    gl_FragColor = vec4(col * a * uGain, a);
  }`;

// Emissive pulsing ring (G-diffuser / engine nozzle) with hot fresnel core.
const ringFrag = /* glsl */`
  uniform float uTime; uniform float uThrust; uniform vec3 uCol; uniform vec3 uHot;
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  void main(){
    float pulse = 0.88 + 0.12 * sin(uTime * 7.0 + vUv.x * 12.566);
    float f = pow(clamp(dot(vN, vV), 0.0, 1.0), 0.6);
    vec3 c = uCol * (0.8 + 1.0 * uThrust) * pulse * (0.6 + 0.6 * f);
    c += uHot * pow(f, 6.0) * (0.3 + 0.6 * uThrust);
    gl_FragColor = vec4(c, 1.0);
  }`;

// G-diffuser fin energy strip: flowing plasma along v with a hot fresnel core.
const stripFrag = /* glsl */`
  uniform float uTime; uniform float uThrust; uniform vec3 uCol; uniform vec3 uHot;
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
  void main(){
    float flow = noise(vec2(vUv.x * 3.0, vUv.y * 6.0 - uTime * 4.0));
    float edge = smoothstep(0.0, 0.25, vUv.x) * smoothstep(1.0, 0.75, vUv.x);
    float f = pow(clamp(abs(dot(vN, vV)), 0.0, 1.0), 0.5);
    vec3 c = uCol * (0.6 + 1.0 * uThrust) * (0.7 + 0.6 * flow) * (0.5 + 0.7 * f) * (0.4 + 0.6 * edge);
    c += uHot * pow(f, 5.0) * edge * (0.15 + 0.5 * uThrust);
    gl_FragColor = vec4(c, 1.0);
  }`;

// Sprite glow disc (billboard) — hot core -> coloured halo, additive.
const discFrag = /* glsl */`
  uniform vec3 uCol; uniform vec3 uHot; uniform float uIntensity; varying vec2 vUv;
  void main(){ float d = length(vUv - 0.5) * 2.0;
    float halo = pow(max(0.0, 1.0 - d), 2.8);
    float core = exp(-d * d * 30.0);
    vec3 c = uCol * halo + uHot * core * 0.9;
    gl_FragColor = vec4(c * uIntensity, (halo + core) * 0.9); }`;
const discVert = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

// ---------------------------------------------------------------------------
// Static merge: the Arwing ships ~70 meshes for 30-odd PBR parts that share a
// handful of materials. Bucket every static child of `root` by material and
// merge each bucket into a single mesh (baking world transforms into geometry)
// so the ship draws in ~10 calls instead of ~70 — and the half-rate shadow pass
// re-renders ~10 casters instead of ~60. Animated sub-trees (flap pivots),
// shader/transparent/billboard meshes and unique materials are left alone.
// ---------------------------------------------------------------------------
const _bakeM = new THREE.Matrix4();
function bakeGeom(o, root) {
  _bakeM.copy(root.matrixWorld).invert().multiply(o.matrixWorld);
  const g = (o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone());
  g.applyMatrix4(_bakeM);
  // keep only the attribute set every source geometry shares, or mergeGeometries refuses
  for (const name of Object.keys(g.attributes)) if (name !== 'position' && name !== 'normal' && name !== 'uv') g.deleteAttribute(name);
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.Float32BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  return g;
}
function mergeStaticByMaterial(root, mats, { deep = false } = {}) {
  root.updateWorldMatrix(true, true);
  const buckets = new Map();
  const visit = (o) => {
    if (!o.isMesh) return;
    const m = o.material;
    if (!m || Array.isArray(m) || m.isShaderMaterial || m.transparent || !mats.has(m)) return;
    let list = buckets.get(m); if (!list) buckets.set(m, list = []);
    list.push(o);
  };
  // deep=false: direct children only (a pivot's parts must keep their hinge);
  // deep=true:  the whole subtree (safe once the pivot itself is the merge root)
  if (deep) root.traverse(visit); else for (const c of root.children) visit(c);
  for (const [m, list] of buckets) {
    if (list.length < 2) continue;
    const baked = list.map((o) => bakeGeom(o, root));
    const merged = mergeGeometries(baked, false);
    baked.forEach((g) => g.dispose());
    for (const o of list) { o.removeFromParent(); o.geometry.dispose(); }
    const mesh = new THREE.Mesh(merged, m);
    mesh.name = `merged-${list[0].name || 'part'}x${list.length}`;
    root.add(mesh);
  }
}

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
/**
 * buildArwing({ envMap }) — `envMap` (PMREM texture) is the reflection environment
 * for the painted-metal materials. Pass one from makeStudioEnv() (or any bright
 * PMREM); if omitted, materials fall back to scene.environment.
 */
export function buildArwing(opts = {}) {
  const group = new THREE.Group();
  group.name = 'arwing';
  const rig = new THREE.Group(); // idle hover / bank layer
  group.add(rig);
  const envMap = opts.envMap ?? null;

  // The five procedural textures are deterministic (seeded rng) and shared by
  // every Arwing instance — memoise them, otherwise each build burns ~a second
  // of canvas raster + Sobel normal-mapping (the 1024^2 hull pass is the
  // biggest single construction cost in the whole game).
  const T = arwingTextures();
  const hullTex = T.hull, roughTex = T.rough, wingTex = T.wing, hullNrm = T.hullNrm, wingNrm = T.wingNrm;

  // Painted metal under a clear-coat: low-ish base roughness so the key light forms
  // a real highlight, panel grooves in the normal map so seams catch specular, and
  // the studio env map for broad reflections across the white panels.
  const matHull = new THREE.MeshPhysicalMaterial({ map: hullTex, roughnessMap: roughTex, normalMap: hullNrm, normalScale: new THREE.Vector2(0.8, 0.8), color: 0xffffff, metalness: 0.2, roughness: 0.55, clearcoat: 1.0, clearcoatRoughness: 0.24, envMap, envMapIntensity: 0.75, specularIntensity: 0.8 });
  const matWing = new THREE.MeshPhysicalMaterial({ map: wingTex, normalMap: wingNrm, normalScale: new THREE.Vector2(0.8, 0.8), color: 0xffffff, metalness: 0.2, roughness: 0.4, clearcoat: 1.0, clearcoatRoughness: 0.24, envMap, envMapIntensity: 0.75, specularIntensity: 0.8 });
  patchFresnel(matHull, [0.45, 0.62, 1.0], 0.16, 0, 4.0);
  patchFresnel(matWing, [0.45, 0.62, 1.0], 0.16, 0, 4.0);
  const matBlue = new THREE.MeshPhysicalMaterial({ color: 0x1d4fe6, normalMap: wingNrm, normalScale: new THREE.Vector2(0.3, 0.3), metalness: 0.35, roughness: 0.3, clearcoat: 1.0, clearcoatRoughness: 0.18, envMap, envMapIntensity: 1.1, specularIntensity: 1.0 });
  const matBlueDeep = new THREE.MeshPhysicalMaterial({ color: 0x1236b8, normalMap: wingNrm, normalScale: new THREE.Vector2(0.3, 0.3), metalness: 0.4, roughness: 0.3, clearcoat: 1.0, clearcoatRoughness: 0.18, envMap, envMapIntensity: 1.1, specularIntensity: 1.0 });
  const matGrey = new THREE.MeshStandardMaterial({ color: 0x8e99ab, metalness: 0.85, roughness: 0.28, envMap, envMapIntensity: 1.1 });
  const matDark = new THREE.MeshStandardMaterial({ color: 0x1e242e, metalness: 0.85, roughness: 0.34, envMap, envMapIntensity: 1.0 });
  const matRed = new THREE.MeshPhysicalMaterial({ color: 0xe0362a, metalness: 0.3, roughness: 0.28, clearcoat: 1.0, clearcoatRoughness: 0.1, envMap, envMapIntensity: 1.0 });
  const matCanopy = canopyMaterial(envMap); patchFresnel(matCanopy, [0.6, 0.8, 1.1], 1.1, 0.58, 2.6);

  const uTime = { value: 0 }, uThrust = { value: 0.5 };
  const ringMat = (col, hot) => new THREE.ShaderMaterial({ vertexShader: glowVert, fragmentShader: ringFrag, uniforms: { uTime, uThrust, uCol: { value: new THREE.Color(...col) }, uHot: { value: new THREE.Color(...hot) } } });
  const stripMat = (col, hot) => new THREE.ShaderMaterial({ vertexShader: glowVert, fragmentShader: stripFrag, side: THREE.DoubleSide, uniforms: { uTime, uThrust, uCol: { value: new THREE.Color(...col) }, uHot: { value: new THREE.Color(...hot) } } });
  const coreMat = (hot, mid, edge) => new THREE.ShaderMaterial({ vertexShader: glowVert, fragmentShader: coreFrag, uniforms: { uTime, uThrust, uHot: { value: new THREE.Color(...hot) }, uMid: { value: new THREE.Color(...mid) }, uEdge: { value: new THREE.Color(...edge) } } });
  const discMat = (col, hot, intensity) => new THREE.ShaderMaterial({
    vertexShader: discVert, fragmentShader: discFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uCol: { value: new THREE.Color(...col) }, uHot: { value: new THREE.Color(...hot) }, uIntensity: { value: intensity } },
  });
  // Palette: main engine = white-hot core in a cobalt halo; G-diffusers = white/yellow core in a red-orange halo.
  const ENG_HOT = [1.3, 1.3, 1.25], ENG_MID = [0.35, 0.7, 1.7], ENG_EDGE = [0.06, 0.18, 0.7];
  const GD_HOT = [1.7, 1.3, 0.85], GD_MID = [1.6, 0.42, 0.08], GD_EDGE = [0.5, 0.06, 0.02];
  const GD_ORANGE = [1.7, 0.55, 0.12];

  // --- Fuselage: faceted wedge (nose -Z, tail +Z). Needle nose, broad flat mid-body, tapered tail. Length ~7.4
  const hullSections = [
    [-3.95, 0.02, 0.02, 0.02, { deck: 0.5, flank: 0.3 }],
    [-3.62, 0.075, 0.055, 0.045, { deck: 0.5, flank: 0.3 }],
    [-3.35, 0.15, 0.10, 0.08, { deck: 0.5, flank: 0.3 }],
    [-2.95, 0.24, 0.14, 0.11, { deck: 0.5, flank: 0.3 }],
    [-2.55, 0.32, 0.17, 0.14, { deck: 0.5, flank: 0.3 }],
    [-1.65, 0.52, 0.24, 0.22, { deck: 0.52, flank: 0.28 }],
    [-0.75, 0.68, 0.30, 0.30, { deck: 0.55, flank: 0.25 }],
    [-0.2, 0.75, 0.325, 0.33, { deck: 0.57, flank: 0.23 }],
    [0.25, 0.78, 0.33, 0.34, { deck: 0.58, flank: 0.22 }],
    [0.75, 0.78, 0.33, 0.345, { deck: 0.58, flank: 0.22 }],
    [1.25, 0.76, 0.32, 0.34, { deck: 0.58, flank: 0.22 }],
    [1.75, 0.70, 0.31, 0.32, { deck: 0.56, flank: 0.24 }],
    [2.25, 0.62, 0.30, 0.30, { deck: 0.55, flank: 0.25 }],
    [2.6, 0.52, 0.285, 0.28, { deck: 0.52, flank: 0.27 }],
    [2.95, 0.44, 0.27, 0.26, { deck: 0.5, flank: 0.3 }],
    [3.35, 0.34, 0.25, 0.24, { deck: 0.5, flank: 0.3 }],
  ];
  const fuselage = facetLoft(hullSections.map(([z, w, ht, hb, o]) => hullRing(z, w, ht, hb, o)));
  const hullMesh = new THREE.Mesh(fuselage, matHull); hullMesh.name = 'hull'; rig.add(hullMesh);
  // tail bulkhead cap
  const tailRing = hullRing(0, 0.34, 0.25, 0.24, { deck: 0.5, flank: 0.3 }).map(([x, y]) => [x, y]);
  const tailCap = new THREE.Mesh(cap(tailRing), matDark); tailCap.position.z = 3.35; rig.add(tailCap);
  // chin intake: dark faceted scoop under the nose
  const chin = facetLoft([
    podRing(-2.3, 0.05, -0.17, 0, 10, 0.6), podRing(-2.0, 0.105, -0.2, 0, 10, 0.6), podRing(-1.7, 0.16, -0.22, 0, 10, 0.6), podRing(-0.6, 0.20, -0.26, 0, 10, 0.6), podRing(0.5, 0.18, -0.26, 0, 10, 0.6), podRing(1.4, 0.10, -0.24, 0, 10, 0.6),
  ]);
  planarUV(chin, 0.3, 'zx'); rig.add(new THREE.Mesh(chin, matGrey));
  const intake = new THREE.Mesh(cap(podRing(0, 0.15, 0, 0, 10, 0.6).map(([x, y]) => [x, y]), true), matDark); intake.position.set(0, -0.22, -1.72); rig.add(intake);

  // --- Tail engine: dark housing, chrome lip, blue-white nozzle ring, dark throat
  const nozzleHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.36, 20, 1, true), matDark);
  nozzleHousing.rotation.x = Math.PI / 2; nozzleHousing.position.set(0, -0.0, 3.5); rig.add(nozzleHousing);
  const nozzleLip = new THREE.Mesh(new THREE.TorusGeometry(0.29, 0.035, 12, 28), matGrey);
  nozzleLip.position.set(0, 0, 3.66); rig.add(nozzleLip);
  const throat = new THREE.Mesh(new THREE.CylinderGeometry(0.19, 0.26, 0.34, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0x0a1630, side: THREE.BackSide }));
  throat.rotation.x = Math.PI / 2; throat.position.set(0, 0, 3.5); rig.add(throat);
  const nozzleRing = new THREE.Mesh(new THREE.TorusGeometry(0.225, 0.045, 12, 48), ringMat([0.25, 0.5, 1.3], [0.9, 1.0, 1.2]));
  nozzleRing.position.set(0, 0, 3.64); rig.add(nozzleRing);
  const nozzleCore = new THREE.Mesh(new THREE.CircleGeometry(0.19, 32), coreMat(ENG_HOT, ENG_MID, ENG_EDGE));
  nozzleCore.position.set(0, 0, 3.40); rig.add(nozzleCore);

  // --- Canopy: dark-blue bubble forward on the deck. 9-gon rings x 12 stations
  // (extra crown points + tighter station spacing) so the bubble reads smooth
  // against the fresnel, while the chamfered silhouette stays Arwing-faceted.
  const canopyRings = [
    [-2.05, 0.02, 0.02, 0.22], [-1.85, 0.11, 0.10, 0.235], [-1.65, 0.20, 0.17, 0.25], [-1.4, 0.27, 0.26, 0.26],
    [-1.15, 0.31, 0.32, 0.27], [-0.85, 0.345, 0.355, 0.285], [-0.55, 0.35, 0.37, 0.30], [-0.25, 0.35, 0.365, 0.305],
    [0.05, 0.34, 0.33, 0.31], [0.35, 0.315, 0.27, 0.315], [0.55, 0.28, 0.22, 0.32], [0.85, 0.02, 0.02, 0.32],
  ].map(([z, w, h, y]) => [
    [0, y + h, z], [w * 0.3, y + h * 0.99, z], [w * 0.6, y + h * 0.82, z], [w * 0.9, y + h * 0.55, z], [w, y, z],
    [-w, y, z], [-w * 0.9, y + h * 0.55, z], [-w * 0.6, y + h * 0.82, z], [-w * 0.3, y + h * 0.99, z],
  ]);
  const canopy = new THREE.Mesh(facetLoft(canopyRings), matCanopy);
  canopy.renderOrder = 5; rig.add(canopy);
  // canopy frame rails (faceted)
  const railPts = canopyRings[6].slice(0, 5);
  const railShape = [...railPts.map(([x, y]) => [x, y]), ...railPts.slice(1).reverse().map(([x, y]) => [x * 0.94 + 0.0, y * 0.94 + 0.017])];
  const frame = new THREE.Mesh(new THREE.ExtrudeGeometry((() => { const s = new THREE.Shape(); railShape.forEach(([x, y], i) => (i ? s.lineTo(x, y) : s.moveTo(x, y))); s.closePath(); return s; })(), { depth: 0.05, bevelEnabled: false }), matGrey);
  frame.position.set(0, 0, -0.58); rig.add(frame);
  const frameL = frame.clone(); frameL.scale.x = -1; rig.add(frameL);
  const frame2 = frame.clone(); frame2.position.set(0, 0.008, 0.08); frame2.scale.set(0.97, 0.92, 1); rig.add(frame2);
  const frame2L = frame2.clone(); frame2L.scale.x = -0.97; rig.add(frame2L);
  // cockpit interior: seat + pilot + dash
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.42), matDark); seat.position.set(0, 0.36, -0.1); rig.add(seat);
  const pilotBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.10, 0.16, 6, 14), new THREE.MeshStandardMaterial({ color: 0x3a7d3a, roughness: 0.7 }));
  pilotBody.position.set(0, 0.42, -0.26); rig.add(pilotBody);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.105, 20, 16), new THREE.MeshStandardMaterial({ color: 0xf3f3f5, roughness: 0.25, metalness: 0.1 }));
  helmet.position.set(0, 0.58, -0.28); rig.add(helmet);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.09, 20, 16, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshStandardMaterial({ color: 0x1a3a70, roughness: 0.1, metalness: 0.4 }));
  visor.position.set(0, 0.58, -0.32); visor.rotation.x = -Math.PI / 2; rig.add(visor);
  const dash = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.10, 0.26), matDark); dash.position.set(0, 0.34, -0.9); rig.add(dash);
  const dashGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.05), new THREE.MeshBasicMaterial({ color: 0x40d0ff })); dashGlow.position.set(0, 0.40, -0.8); dashGlow.rotation.x = -0.9; rig.add(dashGlow);

  // --- Dorsal: blue spine ridge behind the canopy + antenna
  const spine = new THREE.Mesh(facetLoft([
    [[-0.11, 0.30, 0.9], [0, 0.40, 0.9], [0.11, 0.30, 0.9]],
    [[-0.11, 0.305, 1.45], [0, 0.415, 1.45], [0.11, 0.305, 1.45]],
    [[-0.10, 0.31, 2.0], [0, 0.42, 2.0], [0.10, 0.31, 2.0]],
    [[-0.08, 0.29, 2.55], [0, 0.38, 2.55], [0.08, 0.29, 2.55]],
    [[-0.06, 0.27, 3.1], [0, 0.34, 3.1], [0.06, 0.27, 3.1]],
  ], { closed: false }), matBlue);
  rig.add(spine);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.45, 10), matDark); antenna.position.set(0, 0.55, 2.6); rig.add(antenna);
  const antennaLight = new THREE.Mesh(new THREE.SphereGeometry(0.022, 12, 10), new THREE.MeshBasicMaterial({ color: 0xff4040 })); antennaLight.position.set(0, 0.78, 2.6); rig.add(antennaLight);

  // --- G-diffuser nacelles: faceted pods low on each flank; thick delta wings grow from them.
  const PODX = 1.10, PODY = -0.12, PODZ = 0.55, PODR = 0.27;
  const wings = [];
  const flapPivots = [];
  const gdDiscs = [];
  const gdStrips = [];
  const DROOP = 0.10, FOLD = 0.14; // inner wing slight anhedral; outer wing kinks up (the Arwing silhouette)
  for (const s of [-1, 1]) {
    const px = s * PODX;
    // nacelle body (14-gon rings so the flank cylinders read round up close)
    const pod = facetLoft([
      podRing(PODZ - 1.75, 0.03, PODY, px, 14), podRing(PODZ - 1.45, 0.12, PODY, px, 14), podRing(PODZ - 0.9, 0.22, PODY, px, 14), podRing(PODZ - 0.2, PODR, PODY, px, 14),
      podRing(PODZ + 0.25, PODR * 1.01, PODY, px, 14), podRing(PODZ + 0.7, PODR, PODY, px, 14), podRing(PODZ + 1.1, PODR * 0.99, PODY, px, 14),
      podRing(PODZ + 1.5, PODR * 0.96, PODY, px, 14), podRing(PODZ + 2.05, PODR * 0.86, PODY, px, 14), podRing(PODZ + 2.3, PODR * 0.72, PODY, px, 14),
    ]);
    planarUV(pod, 0.3, 'zy');
    rig.add(new THREE.Mesh(pod, matHull));
    // blue nose cone on the nacelle
    const podCap = facetLoft([podRing(PODZ - 1.77, 0.02, PODY, px, 14), podRing(PODZ - 1.58, 0.085, PODY, px, 14), podRing(PODZ - 1.45, 0.125, PODY, px, 14), podRing(PODZ - 1.1, 0.19, PODY, px, 14), podRing(PODZ - 1.0, 0.0, PODY, px, 14)]);
    rig.add(new THREE.Mesh(podCap, matBlue));
    // red trim band + rear housing + blue glow ring
    const podBand = new THREE.Mesh(new THREE.CylinderGeometry(PODR * 0.98, PODR * 0.98, 0.10, 18, 1, true), matRed);
    podBand.rotation.x = Math.PI / 2; podBand.position.set(px, PODY, PODZ + 1.75); rig.add(podBand);
    const podHouse = new THREE.Mesh(new THREE.CylinderGeometry(PODR * 0.72, PODR * 0.8, 0.22, 18, 1, true), matDark);
    podHouse.rotation.x = Math.PI / 2; podHouse.position.set(px, PODY, PODZ + 2.38); rig.add(podHouse);
    const podRing_ = new THREE.Mesh(new THREE.TorusGeometry(0.155, 0.045, 12, 40), ringMat(GD_ORANGE, GD_HOT));
    podRing_.position.set(px, PODY, PODZ + 2.46); rig.add(podRing_);
    const podThroat = new THREE.Mesh(new THREE.CircleGeometry(0.13, 24), coreMat(GD_HOT, GD_MID, GD_EDGE));
    podThroat.position.set(px, PODY, PODZ + 2.42); rig.add(podThroat);
    const gdisc = new THREE.Mesh(new THREE.PlaneGeometry(1.0, 1.0), discMat([1.3, 0.34, 0.06], [1.4, 0.95, 0.6], 0.5)); gdisc.position.set(px, PODY, PODZ + 2.55); gdisc.renderOrder = 12; rig.add(gdisc); gdDiscs.push(gdisc);

    // inner wing: thick tapered delta from the hull flank to the nacelle (overlaps both)
    const inner = new THREE.Mesh(wingGeo([
      { x: 0.45, y: PODY + 0.06, le: -0.75, te: 2.05, t: 0.26, ridge: 0.3 },
      { x: PODX, y: PODY + 0.06 - (PODX - 0.45) * DROOP, le: -1.05, te: 1.8, t: 0.22, ridge: 0.3 },
    ], s), matWing);
    rig.add(inner); wings.push(inner);
    // blue leading edge strip on the inner wing
    const innerStripe = new THREE.Mesh(wingGeo([
      { x: 0.5, y: PODY + 0.065, le: -0.76, te: -0.2, t: 0.20, ridge: 0.6 },
      { x: PODX - 0.05, y: PODY + 0.065 - (PODX - 0.5) * DROOP, le: -1.03, te: -0.5, t: 0.17, ridge: 0.6 },
    ], s), matBlue);
    rig.add(innerStripe);

    // --- Outer wing: hinge on the nacelle's outboard flank. Thick root, sharp tip, swept.
    const pivot = new THREE.Group();
    pivot.position.set(s * (PODX + PODR * 0.9), PODY + 0.02 - (PODX - 0.45) * DROOP, PODZ + 0.4);
    rig.add(pivot); flapPivots.push(pivot);
    const outer = new THREE.Mesh(wingGeo([
      { x: -0.1, y: 0, le: -1.05, te: 1.45, t: 0.20, ridge: 0.32 },
      { x: 0.55, y: -0.01, le: -0.8, te: 1.42, t: 0.165, ridge: 0.32 },
      { x: 1.1, y: -0.02, le: -0.55, te: 1.35, t: 0.13, ridge: 0.32 },
      { x: 1.75, y: -0.035, le: -0.18, te: 1.32, t: 0.1, ridge: 0.32 },
      { x: 2.35, y: -0.05, le: 0.15, te: 1.3, t: 0.07, ridge: 0.32 },
    ], s), matWing);
    pivot.add(outer); wings.push(outer);
    // blue leading edge + deep-blue tip chevron
    const outerEdge = new THREE.Mesh(wingGeo([
      { x: 0.0, y: 0.004, le: -1.03, te: -0.55, t: 0.17, ridge: 0.6 },
      { x: 0.55, y: -0.006, le: -0.79, te: -0.32, t: 0.14, ridge: 0.6 },
      { x: 1.1, y: -0.016, le: -0.53, te: -0.05, t: 0.11, ridge: 0.6 },
      { x: 1.7, y: -0.032, le: -0.17, te: 0.24, t: 0.085, ridge: 0.6 },
      { x: 2.3, y: -0.046, le: 0.16, te: 0.5, t: 0.06, ridge: 0.6 },
    ], s), matBlue);
    pivot.add(outerEdge);
    const outerBlue = new THREE.Mesh(wingGeo([
      { x: 1.55, y: -0.03, le: -0.25, te: 1.34, t: 0.11, ridge: 0.32 },
      { x: 2.36, y: -0.052, le: 0.16, te: 1.31, t: 0.075, ridge: 0.32 },
    ], s), matBlueDeep);
    pivot.add(outerBlue);

    // --- Wingtip G-diffuser fin: tall, swept, canted outward; blue with an energy strip on its inner face.
    const finG = new THREE.Group(); finG.position.set(s * 2.36, -0.05, 0); finG.rotation.z = s * -0.5; pivot.add(finG);
    const finOutline = [[0, 0.0], [0.05, 0.0], [0.72, 0.62], [0.78, 1.32], [0.06, 1.32], [0, 1.28]]; // (height u, chord v)
    const fin = new THREE.Mesh(finGeo(finOutline, 0.08), matBlue);
    // finGeo shape plane is (x=u, y=v) extruded along z; we want u -> up (y), v -> chord (z), thickness -> x
    const finBasis = new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), new THREE.Vector3(1, 0, 0));
    fin.setRotationFromMatrix(finBasis); finG.add(fin);
    // white lower fin fairing (fin root blends into the wing tip)
    const finRoot = new THREE.Mesh(finGeo([[-0.3, 0.0], [0.07, 0.0], [0.07, 1.3], [-0.3, 1.3]], 0.12), matWing);
    finRoot.rotation.copy(fin.rotation); finRoot.position.set(0, 0, 0); finG.add(finRoot);
    // fin energy strip: a thin plate on the inboard face of the fin
    const stripH = 0.6, stripShape = new THREE.PlaneGeometry(0.09, stripH); // x = chord, y = up, normal z
    const strip = new THREE.Mesh(stripShape, stripMat(GD_ORANGE, GD_HOT));
    strip.setRotationFromMatrix(new THREE.Matrix4().makeBasis(new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 1, 0), new THREE.Vector3(-1, 0, 0))); // normal -> x
    strip.position.set(-s * 0.043, 0.4, 1.05); finG.add(strip); gdStrips.push(strip);
    const strip2 = strip.clone(); strip2.position.x = s * 0.043; finG.add(strip2); gdStrips.push(strip2);
    // fin tip lamp
    const nav = new THREE.Mesh(new THREE.SphereGeometry(0.035, 12, 10), new THREE.MeshBasicMaterial({ color: s < 0 ? new THREE.Color(3, 0.3, 0.3) : new THREE.Color(0.3, 3, 0.8) }));
    nav.position.set(0, 0.76, 1.33); finG.add(nav);
    const finDisc = new THREE.Mesh(new THREE.PlaneGeometry(1.3, 1.3), discMat([1.2, 0.36, 0.08], [1.2, 0.8, 0.5], 0.35)); finDisc.position.set(0, 0.4, 1.05); finDisc.renderOrder = 12; finG.add(finDisc); gdDiscs.push(finDisc);

    // --- Twin laser cannon under the nacelle nose
    const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 1.5, 14), matDark);
    cannon.rotation.x = Math.PI / 2; cannon.position.set(px, PODY - 0.26, -0.95); rig.add(cannon);
    const cannonTip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 12), matGrey);
    cannonTip.rotation.x = Math.PI / 2; cannonTip.position.set(px, PODY - 0.26, -1.8); rig.add(cannonTip);
    const cannonMount = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.22, 0.5), matGrey);
    cannonMount.position.set(px, PODY - 0.14, -0.6); rig.add(cannonMount);

    // --- Upper fins: canted well outward, swept, blue tips, thick faceted
    const upFin = new THREE.Mesh(wingGeo([
      { x: 0.0, y: 0, le: -0.15, te: 1.05, t: 0.10, ridge: 0.35 },
      { x: 0.28, y: 0, le: 0.12, te: 1.02, t: 0.08, ridge: 0.35 },
      { x: 0.55, y: 0, le: 0.35, te: 1.0, t: 0.06, ridge: 0.35 },
      { x: 0.8, y: 0, le: 0.55, te: 0.98, t: 0.045, ridge: 0.35 },
      { x: 1.05, y: 0, le: 0.72, te: 0.95, t: 0.03, ridge: 0.35 },
    ], s), matWing);
    upFin.rotation.set(0, 0, s * (Math.PI / 2 - 0.72)); upFin.position.set(s * 0.42, 0.22, 1.75); rig.add(upFin);
    const upFinTip = new THREE.Mesh(wingGeo([
      { x: 0.55, y: 0, le: 0.35, te: 1.0, t: 0.065, ridge: 0.35 },
      { x: 1.06, y: 0, le: 0.72, te: 0.95, t: 0.035, ridge: 0.35 },
    ], s), matBlue);
    upFinTip.rotation.copy(upFin.rotation); upFinTip.position.copy(upFin.position); rig.add(upFinTip);
  }

  // --- Engine plume + glow discs (blue-white, crisp; not a smear)
  const plumeGeo = new THREE.LatheGeometry([
    new THREE.Vector2(0.22, 0), new THREE.Vector2(0.25, 0.25), new THREE.Vector2(0.21, 0.8), new THREE.Vector2(0.12, 1.5), new THREE.Vector2(0.03, 2.2), new THREE.Vector2(0.0, 2.5),
  ], 32);
  const plumeMat = new THREE.ShaderMaterial({
    vertexShader: glowVert, fragmentShader: plumeFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime, uThrust, uCore: { value: new THREE.Color(0.7, 0.88, 1.0) }, uEdge: { value: new THREE.Color(0.1, 0.3, 1.0) }, uGain: { value: 0.9 } },
  });
  const plume = new THREE.Mesh(plumeGeo, plumeMat);
  plume.rotation.x = Math.PI / 2; plume.position.set(0, 0, 3.58); plume.renderOrder = 10; rig.add(plume);
  const plume2 = new THREE.Mesh(plumeGeo, plumeMat.clone()); plume2.material.uniforms.uTime = uTime; plume2.material.uniforms.uThrust = uThrust;
  plume2.material.uniforms.uCore.value.set(1.0, 0.98, 0.92); plume2.material.uniforms.uEdge.value.set(0.45, 0.7, 1.0); plume2.material.uniforms.uGain.value = 0.6;
  plume2.rotation.x = Math.PI / 2; plume2.position.set(0, 0, 3.58); plume2.scale.set(0.5, 0.5, 0.65); plume2.renderOrder = 11; rig.add(plume2);
  const engineDisc = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), discMat([0.3, 0.6, 1.5], [1.2, 1.15, 1.0], 0.45));
  engineDisc.position.set(0, 0, 3.7); engineDisc.renderOrder = 12; rig.add(engineDisc);
  // G-diffuser plumes: hot orange
  const gdPlumes = [];
  for (const s of [-1, 1]) {
    const gp = new THREE.Mesh(plumeGeo, plumeMat.clone()); gp.material.uniforms.uTime = uTime; gp.material.uniforms.uThrust = uThrust;
    gp.material.uniforms.uCore.value.set(1.0, 0.85, 0.6); gp.material.uniforms.uEdge.value.set(1.2, 0.35, 0.05); gp.material.uniforms.uGain.value = 1.0;
    gp.rotation.x = Math.PI / 2; gp.position.set(s * PODX, PODY, PODZ + 2.44); gp.scale.set(0.6, 0.6, 0.45); gp.renderOrder = 10; rig.add(gp); gdPlumes.push(gp);
  }
  const billboards = [engineDisc, ...gdDiscs];

  // point lights for local bounce (engine + diffusers)
  const engineLight = new THREE.PointLight(0x5a9aff, 1.2, 6, 2); engineLight.position.set(0, 0, 4.6); rig.add(engineLight);
  const gdLight = new THREE.PointLight(0xff7a2a, 1.0, 5, 2); gdLight.position.set(0, PODY, PODZ + 2.7); rig.add(gdLight);

  // ---- merge static parts by material: ~70 meshes -> ~30 (draw calls + shadow casters)
  const pbrMats = new Set([matHull, matWing, matBlue, matBlueDeep, matGrey, matDark, matRed]);
  mergeStaticByMaterial(rig, pbrMats);
  for (const pivot of flapPivots) mergeStaticByMaterial(pivot, pbrMats, { deep: true });

  // shadows
  rig.traverse((o) => { if (o.isMesh && !(o.material.isShaderMaterial) && o.material.transparent !== true) { o.castShadow = true; o.receiveShadow = true; } });

  // --- State / animation
  const state = { thrust: 0.5, thrustTarget: 0.5, bank: 0, bankTarget: 0, flap: 0, flapTarget: 0, flapVel: 0, bankVel: 0, hover: 1 };
  const tmpQ = new THREE.Quaternion();

  function update(dt, t, camera) {
    uTime.value = t;
    // thrust: eased
    state.thrust += (state.thrustTarget - state.thrust) * Math.min(1, dt * 6);
    uThrust.value = state.thrust;
    engineLight.intensity = 0.8 + state.thrust * 1.4;
    gdLight.intensity = 0.5 + state.thrust * 0.8;
    const ps = 0.65 + state.thrust * 0.85 + Math.sin(t * 37) * 0.03;
    plume.scale.set(1, 1, ps); plume2.scale.set(0.5, 0.5, 0.65 * ps);
    for (const gp of gdPlumes) gp.scale.set(0.6, 0.6, 0.3 + 0.3 * ps);
    engineDisc.material.uniforms.uIntensity.value = 0.16 + state.thrust * 0.3 + Math.sin(t * 23) * 0.03;
    for (const d of gdDiscs) d.material.uniforms.uIntensity.value = (d.geometry.parameters.width > 1.1 ? 0.08 : 0.26) + state.thrust * 0.3 + Math.sin(t * 7 + d.position.x) * 0.04;
    // bank: spring with overshoot
    const bk = 90, bc = 11;
    state.bankVel += ((state.bankTarget - state.bank) * bk - state.bankVel * bc) * dt;
    state.bank += state.bankVel * dt;
    // flaps: spring with overshoot; couple to bank (outer wing dips into the turn)
    const fk = 140, fc = 13;
    state.flapVel += ((state.flapTarget - state.flap) * fk - state.flapVel * fc) * dt;
    state.flap += state.flapVel * dt;
    for (let i = 0; i < flapPivots.length; i++) {
      const s = i === 0 ? -1 : 1;
      const f = FOLD + state.flap * 0.55 + state.bank * s * 0.3;
      flapPivots[i].rotation.z = s * f; // fold up around the hinge (span axis is x, so rotate about z)
    }
    // idle hover
    const h = state.hover;
    rig.position.y = Math.sin(t * 1.3) * 0.05 * h + Math.sin(t * 2.9) * 0.02 * h;
    rig.rotation.x = Math.sin(t * 1.1 + 1) * 0.012 * h;
    rig.rotation.z = -state.bank * 0.9 + Math.sin(t * 0.9) * 0.02 * h;
    rig.rotation.y = state.bank * 0.12;
    // billboards face camera
    if (camera) {
      for (const b of billboards) {
        b.quaternion.copy(camera.quaternion);
        b.parent.getWorldQuaternion(tmpQ).invert();
        b.quaternion.premultiply(tmpQ);
      }
    }
  }

  const envMats = [matHull, matWing, matBlue, matBlueDeep, matGrey, matDark, matRed, matCanopy];
  return {
    group,
    rig,
    update,
    /** Swap the reflection environment on all hull materials (e.g. when a stage changes). */
    setEnvMap(tex) { for (const m of envMats) { m.envMap = tex; m.needsUpdate = true; } },
    setThrust(v) { state.thrustTarget = THREE.MathUtils.clamp(v, 0, 1); },
    setBank(v) { state.bankTarget = THREE.MathUtils.clamp(v, -1, 1); },
    flap(v) { state.flapTarget = THREE.MathUtils.clamp(v, -1, 1); },
    setHover(v) { state.hover = v; },
    state,
    /** local-space muzzle positions of the twin cannons (for other pieces) */
    muzzles: [new THREE.Vector3(-PODX, PODY - 0.26, -1.95), new THREE.Vector3(PODX, PODY - 0.26, -1.95)],
    nozzle: new THREE.Vector3(0, 0, 3.7),
    materials: { matHull, matWing, matBlue, matGrey, matDark, matRed, matCanopy },
    dispose() {
      group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose()); else o.material.dispose(); } });
      // the five skin textures are the shared module cache (arwingTextures) —
      // leave them alive for the next Arwing instance.
    },
  };
}
