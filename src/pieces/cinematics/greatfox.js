// Great Fox — hero capital ship for the cinematics. Nose at -Z, ~130 units long.
//
// Built from lofted, chamfered cross-sections (crisp bevel facets across the
// ring, smooth along the hull), lathed engine nacelles, bevelled extruded wings
// and a scatter of raised panel greebles. Materials are lookdev's hero language
// (clear-coated white hull, cobalt, gunmetal) with a canvas panel-line map and a
// view-dependent fresnel rim injected into the shader so the silhouette always
// reads against space.
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { makeExhaust } from './assets.js';

/* ------------------------------------------------------------------ */
/* Textures                                                            */
/* ------------------------------------------------------------------ */
function seeded(seed) { let s = seed >>> 0 || 1; return () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

/** Capital-ship hull plating: big plates, recessed seams, vents, hatches, faint grime. */
export function makeCapitalPanelTexture(seed = 3, size = 2048, { base = '#eef1f5', accent = '#1f4fd0' } = {}) {
  const rnd = seeded(seed);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  // irregular plate subdivision (binary split)
  const plates = [];
  const split = (x, y, w, h, d) => {
    if (d === 0 || (w < size / 14 && h < size / 14) || (d < 3 && rnd() < 0.18)) { plates.push([x, y, w, h]); return; }
    if (w > h * 1.2 || (Math.abs(w - h) < h * 0.2 && rnd() < 0.5)) { const k = 0.35 + rnd() * 0.3; split(x, y, w * k, h, d - 1); split(x + w * k, y, w * (1 - k), h, d - 1); }
    else { const k = 0.35 + rnd() * 0.3; split(x, y, w, h * k, d - 1); split(x, y + h * k, w, h * (1 - k), d - 1); }
  };
  split(0, 0, size, size, 7);
  for (const [x, y, w, h] of plates) {
    const v = (rnd() - 0.5) * 22;
    g.fillStyle = `rgba(${v > 0 ? '255,255,255' : '30,40,60'},${Math.abs(v) / 255})`;
    g.fillRect(x, y, w, h);
    // plate edge: light bevel top-left, dark seam bottom-right
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x + 1, y + h - 1); g.lineTo(x + 1, y + 1); g.lineTo(x + w - 1, y + 1); g.stroke();
    g.strokeStyle = 'rgba(28,36,54,0.55)'; g.lineWidth = 3; g.beginPath(); g.moveTo(x + w - 1, y + 1); g.lineTo(x + w - 1, y + h - 1); g.lineTo(x + 1, y + h - 1); g.stroke();
    // occasional details inside a plate
    const r = rnd();
    if (r < 0.14 && w > 60 && h > 40) { // vent slats
      g.fillStyle = 'rgba(24,30,44,0.6)';
      const n = 3 + Math.floor(rnd() * 4), sw = Math.min(w * 0.5, 60), sh = 3;
      for (let k = 0; k < n; k++) g.fillRect(x + w * 0.5 - sw / 2, y + h * 0.5 - n * 4 + k * 8, sw, sh);
    } else if (r < 0.24 && w > 50 && h > 50) { // round hatch
      g.strokeStyle = 'rgba(28,36,54,0.6)'; g.lineWidth = 3; g.beginPath(); g.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.22, 0, Math.PI * 2); g.stroke();
      g.fillStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.arc(x + w / 2, y + h / 2, Math.min(w, h) * 0.19, 0, Math.PI * 2); g.fill();
    } else if (r < 0.32 && w > 80) { // accent stripe
      g.fillStyle = accent; g.globalAlpha = 0.85; g.fillRect(x + 6, y + h * 0.5 - 4, w - 12, 8); g.globalAlpha = 1;
    } else if (r < 0.42) { // rivet row
      g.fillStyle = 'rgba(20,28,40,0.5)';
      for (let k = 8; k < w - 8; k += 12) g.fillRect(x + k, y + 6, 3, 3);
    } else if (r < 0.48 && w > 40 && h > 24) { // stencil marks
      g.fillStyle = 'rgba(30,38,56,0.55)'; g.font = `${Math.floor(10 + rnd() * 8)}px monospace`; g.fillText(`${Math.floor(rnd() * 90 + 10)}-${String.fromCharCode(65 + Math.floor(rnd() * 26))}`, x + 8, y + 18);
    }
  }
  // long streaks along flow (v axis) and soft grime
  for (let i = 0; i < 500; i++) { g.fillStyle = `rgba(${rnd() < 0.5 ? '40,50,70' : '255,255,255'},${rnd() * 0.05})`; g.fillRect(rnd() * size, rnd() * size, 2 + rnd() * 5, 30 + rnd() * 200); }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}

/** Roughness variation so the clearcoat highlight breaks up across plates. */
function makeRoughTexture(seed = 5, size = 512) {
  const rnd = seeded(seed);
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'); g.fillStyle = '#8a8a8a'; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 260; i++) { const v = 110 + Math.floor(rnd() * 80); g.fillStyle = `rgb(${v},${v},${v})`; g.fillRect(rnd() * size, rnd() * size, 20 + rnd() * 120, 20 + rnd() * 120); }
  const tex = new THREE.CanvasTexture(c); tex.wrapS = tex.wrapT = THREE.RepeatWrapping; return tex;
}

/** Bridge / hull window strip (emissive): warm lit windows, some dark. */
function makeWindowStrip(seed = 9, w = 1024, h = 64) {
  const rnd = seeded(seed);
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d'); g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
  for (let x = 8; x < w - 8; x += 14) for (let y = 12; y < h - 12; y += 18) {
    if (rnd() < 0.78) { g.fillStyle = rnd() < 0.75 ? '#ffd9a6' : '#b8e4ff'; g.fillRect(x, y, 7, 10); }
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; return tex;
}

/* ------------------------------------------------------------------ */
/* Fresnel rim injection                                               */
/* ------------------------------------------------------------------ */
/** Adds a view-dependent rim term (uRimColor * fresnel^power * uRimStrength) to a Standard/Physical material. */
export function patchRim(mat, { color = 0x8fc2ff, strength = 0.6, power = 3.5 } = {}) {
  const u = { uRimColor: { value: new THREE.Color(color) }, uRimStrength: { value: strength }, uRimPower: { value: power } };
  mat.userData.rim = u;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRimColor; uniform float uRimStrength; uniform float uRimPower;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { vec3 rimV = normalize(vViewPosition); float rimF = pow(1.0 - clamp(dot(normal, rimV), 0.0, 1.0), uRimPower);
          totalEmissiveRadiance += uRimColor * rimF * uRimStrength; }`);
  };
  mat.customProgramCacheKey = () => `rim${power}`;
  return mat;
}

/* ------------------------------------------------------------------ */
/* Geometry: lofted chamfered hull                                     */
/* ------------------------------------------------------------------ */
/**
 * Chamfered hull ring at (w, h) with corner bevel r (fraction). Points CCW
 * starting at top-left. Shape: flat top, chamfered shoulders, vertical sides,
 * chamfered lower hull, flat belly.
 */
function hullRing(w, h, { top = 0.42, shoulder = 0.18, side = -0.1, belly = 0.36, bevel = 0.08 } = {}) {
  const raw = [
    [-top * w, 0.5 * h], [top * w, 0.5 * h],
    [0.6 * w, shoulder * h], [0.6 * w, side * h],
    [belly * w, -0.5 * h], [-belly * w, -0.5 * h],
    [-0.6 * w, side * h], [-0.6 * w, shoulder * h],
  ];
  // bevel each corner: replace point with two points pulled toward neighbours
  const out = [];
  const n = raw.length;
  for (let i = 0; i < n; i++) {
    const p = raw[i], a = raw[(i + n - 1) % n], b = raw[(i + 1) % n];
    const la = Math.hypot(a[0] - p[0], a[1] - p[1]), lb = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const r = Math.min(bevel * Math.min(w, h), la * 0.45, lb * 0.45);
    out.push([p[0] + (a[0] - p[0]) / la * r, p[1] + (a[1] - p[1]) / la * r]);
    out.push([p[0] + (b[0] - p[0]) / lb * r, p[1] + (b[1] - p[1]) / lb * r]);
  }
  return out;
}

/**
 * Loft rings along Z. rings: [{ z, pts:[[x,y]...], (same count) }]. Each ring
 * edge gets its own vertex strip -> flat facets around, smooth along Z.
 * UV: u = perimeter distance / uvScale, v = z / uvScale. Optional end caps.
 */
export function loft(rings, { uvScale = 12, capStart = true, capEnd = true } = {}) {
  const N = rings[0].pts.length, R = rings.length;
  const pos = [], uv = [], idx = [];
  // perimeter param per ring (use the largest ring so seams line up)
  const per = (pts) => { const d = [0]; for (let j = 0; j < N; j++) { const a = pts[j], b = pts[(j + 1) % N]; d.push(d[j] + Math.hypot(b[0] - a[0], b[1] - a[1])); } return d; };
  const perim = per(rings.reduce((m, r) => (per(r.pts)[N] > per(m.pts)[N] ? r : m), rings[0]).pts);
  for (let j = 0; j < N; j++) {
    const base = pos.length / 3;
    for (let i = 0; i < R; i++) {
      const r = rings[i], a = r.pts[j], b = r.pts[(j + 1) % N], oy = r.oy ?? 0, ox = r.ox ?? 0;
      pos.push(a[0] + ox, a[1] + oy, r.z, b[0] + ox, b[1] + oy, r.z);
      uv.push(perim[j] / uvScale, r.z / uvScale, perim[j + 1] / uvScale, r.z / uvScale);
    }
    for (let i = 0; i < R - 1; i++) {
      const k = base + i * 2;
      idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3);
    }
  }
  const cap = (ring, flip) => {
    const base = pos.length / 3, oy = ring.oy ?? 0, ox = ring.ox ?? 0;
    let cx = 0, cy = 0; for (const p of ring.pts) { cx += p[0]; cy += p[1]; } cx /= N; cy /= N;
    pos.push(cx + ox, cy + oy, ring.z); uv.push(0.5, 0.5);
    for (let j = 0; j < N; j++) { const p = ring.pts[j]; pos.push(p[0] + ox, p[1] + oy, ring.z); uv.push(p[0] / uvScale, p[1] / uvScale); }
    for (let j = 0; j < N; j++) { const a = base + 1 + j, b = base + 1 + ((j + 1) % N); if (flip) idx.push(base, b, a); else idx.push(base, a, b); }
  };
  if (capStart) cap(rings[0], false);
  if (capEnd) cap(rings[R - 1], true);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Convenience: loft a hull along z in [z0, z1] with per-u width/height/offset. */
function hullLoft(z0, z1, fn, segs = 24, ringOpts, loftOpts) {
  const rings = [];
  for (let i = 0; i <= segs; i++) {
    const u = i / segs, z = z0 + (z1 - z0) * u;
    const [w, h, oy = 0, ox = 0, ro] = fn(u);
    rings.push({ z, oy, ox, pts: hullRing(Math.max(w, 0.02), Math.max(h, 0.02), { ...ringOpts, ...(ro || {}) }) });
  }
  return loft(rings, loftOpts);
}

function extrudeShape(points, depth, bevel = 0.1) {
  const s = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */
export function makeGreatFoxMaterials() {
  const panels = makeCapitalPanelTexture(3);
  const rough = makeRoughTexture(5);
  const windows = makeWindowStrip(9);
  const M = {
    hull: patchRim(new THREE.MeshPhysicalMaterial({ color: 0xe6ebf1, map: panels, roughnessMap: rough, roughness: 0.5, metalness: 0.06, clearcoat: 0.7, clearcoatRoughness: 0.3, envMapIntensity: 0.9 }), { color: 0x9cc8ff, strength: 0.55 }),
    hullGrey: patchRim(new THREE.MeshPhysicalMaterial({ color: 0xb9c2cf, map: panels, roughnessMap: rough, roughness: 0.5, metalness: 0.2, clearcoat: 0.6, clearcoatRoughness: 0.3, envMapIntensity: 1.0 }), { color: 0x9cc8ff, strength: 0.5 }),
    cobalt: patchRim(new THREE.MeshStandardMaterial({ color: 0x1e4fd8, roughness: 0.36, metalness: 0.85, roughnessMap: rough }), { color: 0x8fb8ff, strength: 0.45 }),
    red: patchRim(new THREE.MeshStandardMaterial({ color: 0xd8342a, roughness: 0.4, metalness: 0.3 }), { color: 0xffb0a0, strength: 0.35 }),
    dark: patchRim(new THREE.MeshStandardMaterial({ color: 0x2a3140, roughness: 0.5, metalness: 0.75, roughnessMap: rough }), { color: 0x7fb0ff, strength: 0.7 }),
    gunmetal: new THREE.MeshStandardMaterial({ color: 0x151a22, roughness: 0.32, metalness: 1.0 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.28, metalness: 1.0 }),
    windows: new THREE.MeshStandardMaterial({ color: 0x0a0c12, emissive: 0xffffff, emissiveMap: windows, emissiveIntensity: 1.6, roughness: 0.3, metalness: 0.6 }),
    glowCyan: new THREE.MeshStandardMaterial({ color: 0x0b2a40, emissive: 0x4fc8ff, emissiveIntensity: 2.2, roughness: 0.4 }),
    glowAmber: new THREE.MeshStandardMaterial({ color: 0x402008, emissive: 0xffa040, emissiveIntensity: 2.0, roughness: 0.4 }),
    navRed: new THREE.MeshBasicMaterial({ color: new THREE.Color(3.0, 0.35, 0.3) }),
    navGreen: new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 3.0, 0.9) }),
    bayInner: new THREE.MeshStandardMaterial({ color: 0x0c1018, side: THREE.BackSide, roughness: 0.9, metalness: 0.2 }),
    // nozzle interior: radial gradient, hot core -> dark rim (no blown white disc)
    nozzle: new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uPower: { value: 1 }, uCol: { value: new THREE.Color(0x4fd0ff) } },
      vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: `uniform float uTime, uPower; uniform vec3 uCol; varying vec2 vUv;
        void main(){ float r = length(vUv - 0.5) * 2.0; float ring = smoothstep(1.0, 0.75, r);
          float core = pow(max(0.0, 1.0 - r * 1.15), 2.0); float flick = 0.9 + 0.1 * sin(uTime * 37.0 + r * 12.0);
          vec3 c = uCol * ring * (0.35 + 0.65 * (1.0 - r)) * 1.6 + vec3(1.0, 0.97, 0.9) * core * 2.2;
          gl_FragColor = vec4(c * uPower * flick, 1.0); }`,
    }),
  };
  return M;
}

/* ------------------------------------------------------------------ */
/* Great Fox                                                           */
/* ------------------------------------------------------------------ */
/** Build the Great Fox. Returns Group with userData.tick(t), userData.setPower(p), userData.bay (bay mouth local pos). */
export function buildGreatFox(mats) {
  const M = mats?.gf ?? makeGreatFoxMaterials();
  const gf = new THREE.Group(); gf.name = 'great-fox';
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0, parent = gf) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; parent.add(m); return m;
  };
  const exhausts = [];
  const nozzles = [];
  const blinkers = [];

  // ---- main hull: needle nose -> broad shoulders -> tapered stern (z -56 .. 52)
  const NOSE = -56, STERN = 52;
  const hullProf = (u) => {
    const grow = Math.pow(Math.min(1, u / 0.55), 0.62);              // fast widen after the nose
    const tail = 1 - 0.18 * Math.pow(Math.max(0, (u - 0.75) / 0.25), 1.5);
    const w = (0.5 + 17.5 * grow) * tail;
    const h = (0.4 + 9.6 * grow) * tail * (0.78 + 0.22 * u);
    const oy = 1.6 * (1 - grow) + 0.6 * u;
    return { w, h, oy, top: oy + h / 2, bot: oy - h / 2, half: 0.6 * w, shoulder: oy + 0.18 * h };
  };
  const uOf = (z) => (z - NOSE) / (STERN - NOSE);
  add(hullLoft(NOSE, STERN, (u) => { const p = hullProf(u); return [p.w, p.h, p.oy]; }, 40), M.hull);
  // hull side chines: cobalt blades riding the shoulder line, following the hull taper
  for (const s of [-1, 1]) {
    add(hullLoft(-34, 48, (u) => { const p = hullProf(uOf(-34 + 82 * u)); return [1.5 * (0.3 + 0.7 * Math.min(1, u * 2.5)), 1.3, p.shoulder - 0.5, s * (p.half + 0.15)]; }, 16, { bevel: 0.2 }), M.cobalt);
    // red racing stripe on the upper chamfer (hull is at full width here)
    add(new THREE.BoxGeometry(0.5, 0.35, 44), M.red, s * 9.4, 4.75, 20, 0, 0, s * -0.55);
    // long window ribbon
    add(new THREE.BoxGeometry(0.25, 0.9, 36), M.windows, s * 10.9, 3.0, 20);
  }
  // ---- dorsal spine + bridge superstructure (rear top)
  add(hullLoft(-6, 46, (u) => [5.5 + 2.5 * Math.sin(u * Math.PI) , 2.2 + 1.6 * u, 5.6 + 0.4 * u], 14, { bevel: 0.15 }), M.hull);
  const bridge = new THREE.Group(); bridge.position.set(0, 8.0, 28); gf.add(bridge);
  add(hullLoft(-9, 12, (u) => [3.2 + 5.2 * Math.pow(Math.min(1, u / 0.35), 0.8), 2.4 + 2.2 * Math.min(1, u / 0.35), 1.4 + 0.2 * u], 12, { bevel: 0.14, top: 0.36 }), M.hull, 0, 0, 0, 0, 0, 0, bridge);
  // bridge visor: dark canopy band + windows on the leading slope
  add(new THREE.BoxGeometry(6.4, 1.1, 4.5), M.gunmetal, 0, 3.05, -5.2, -0.22, 0, 0, bridge);
  add(new THREE.BoxGeometry(6.0, 0.62, 0.3), M.windows, 0, 3.15, -7.45, -0.22, 0, 0, bridge);
  add(new THREE.BoxGeometry(0.3, 0.62, 4.0), M.windows, -3.15, 3.0, -5.2, 0, 0, 0, bridge);
  add(new THREE.BoxGeometry(0.3, 0.62, 4.0), M.windows, 3.15, 3.0, -5.2, 0, 0, 0, bridge);
  // sensor mast + dish
  add(new THREE.CylinderGeometry(0.12, 0.2, 5.5, 10), M.gunmetal, 0, 6.3, 6, 0, 0, 0, bridge);
  add(new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), M.chrome, 0, 8.3, 6, 0, 0, Math.PI / 2, bridge);
  const dish = add(new THREE.SphereGeometry(1.1, 16, 8, 0, Math.PI * 2, 0, Math.PI * 0.45), M.hullGrey, -3.6, 3.2, 9, -0.9, 0, 0.5, bridge);
  dish.scale.set(1, 0.5, 1);
  const beacon = add(new THREE.SphereGeometry(0.28, 10, 8), M.glowAmber, 0, 9.2, 6, 0, 0, 0, bridge); blinkers.push({ m: beacon, base: 2.0, f: 1.3, mat: M.glowAmber });
  // ---- tail fin (vertical, swept) with cobalt tip and red stripe
  {
    // shapes are drawn in (length, height); rotateY(-90deg) maps length -> +z, thickness -> x
    const fin = extrudeShape([[0, 0], [16, 0], [22, 11], [20, 14], [16, 14], [6, 3.5]], 1.2, 0.12); fin.rotateY(-Math.PI / 2);
    add(fin, M.hull, 0, 6.6, 26);
    const tip = extrudeShape([[16, 14], [20, 14], [22, 11], [17.6, 11]], 1.25, 0.05); tip.rotateY(-Math.PI / 2);
    add(tip, M.cobalt, 0, 6.6, 26);
    const str = extrudeShape([[5, 3.2], [17, 3.2], [17.6, 5.2], [5.6, 5.2]], 1.26, 0); str.rotateY(-Math.PI / 2);
    add(str, M.red, 0, 6.6, 26);
    const b = add(new THREE.SphereGeometry(0.22, 8, 8), M.glowAmber, 0, 6.6 + 14.3, 26 + 18); blinkers.push({ m: b, base: 2.0, f: 1.3, mat: M.glowAmber });
  }
  // ---- wings: bevelled slabs swept back + down from the lower hull, cobalt leading edge, red stripe, tip fin
  for (const s of [-1, 1]) {
    const W = new THREE.Group(); W.position.set(s * 9, -2.2, 22); W.rotation.z = s * -0.16; W.scale.x = s; gf.add(W);
    const planform = [[0, -12], [12, -4], [30, 12], [34, 20], [34, 26], [28, 27], [12, 20], [0, 12]];
    const wing = extrudeShape(planform, 2.2, 0.25); wing.rotateX(Math.PI / 2);
    add(wing, M.hull, 0, 0, 0, 0, 0, 0, W);
    const lead = extrudeShape([[1, -11], [12.5, -3.5], [31, 12.5], [29, 13.5], [11, -1.5], [1, -8]], 2.35, 0); lead.rotateX(Math.PI / 2);
    add(lead, M.cobalt, 0, 0, 0, 0, 0, 0, W);
    const stripe = extrudeShape([[6, 16], [30, 20.5], [30, 22.5], [6, 18]], 2.3, 0); stripe.rotateX(Math.PI / 2);
    add(stripe, M.red, 0, 0, 0, 0, 0, 0, W);
    // wingtip fin canted outward
    const fin = extrudeShape([[0, 0], [7, 0], [5, 9], [3.2, 10], [1.5, 9]], 1.0, 0.1); fin.rotateY(-Math.PI / 2);
    add(fin, M.hull, 33.5, 0, 20, 0, 0, -0.3, W);
    const fintip = extrudeShape([[1.5, 9], [3.2, 10], [5, 9], [4.4, 6.5], [2.1, 6.5]], 1.05, 0); fintip.rotateY(-Math.PI / 2);
    add(fintip, M.cobalt, 33.5, 0, 20, 0, 0, -0.3, W);
    const nav = add(new THREE.SphereGeometry(0.3, 8, 8), s < 0 ? M.navRed : M.navGreen, 33.5, 10.2, 23.2, 0, 0, 0, W); blinkers.push({ m: nav, base: 1, f: 2.0, nav: true });
    // raised wing panels (greebles)
    add(new RoundedBoxGeometry(6, 0.5, 5, 2, 0.18), M.hullGrey, 14, 1.3, 8, 0, 0.5, 0, W);
    add(new RoundedBoxGeometry(4, 0.45, 6, 2, 0.18), M.hullGrey, 22, 1.25, 16, 0, 0.35, 0, W);
    add(new RoundedBoxGeometry(6, 0.5, 5, 2, 0.18), M.hullGrey, 14, -1.3, 8, 0, 0.5, 0, W);
    // outboard engine nacelle under the wing root
    engine(s * 15.5, -4.4, 40, 3.0, 18);
  }
  // ---- rear engine cluster: big centre nacelle + belly pair
  engine(0, -1.6, 50, 4.2, 20);
  engine(-7.5, -6.2, 46, 2.6, 15);
  engine(7.5, -6.2, 46, 2.6, 15);
  function engine(x, y, z, r, len) {
    const E = new THREE.Group(); E.position.set(x, y, z); gf.add(E);
    // lathed nacelle: intake ring -> belly bulge -> nozzle throat
    const pts = [];
    const prof = [[0.0, 0.62], [0.06, 0.8], [0.18, 0.96], [0.45, 1.0], [0.72, 0.94], [0.86, 0.8], [0.93, 0.78], [1.0, 0.86]];
    for (const [t, k] of prof) pts.push(new THREE.Vector2(r * k, (t - 0.5) * len));
    const body = new THREE.LatheGeometry(pts, 28); body.rotateX(Math.PI / 2); // axis along z, front at -z
    add(body, M.hullGrey, 0, 0, 0, 0, 0, 0, E);
    add(new THREE.CylinderGeometry(r * 0.72, r * 0.86, len * 0.16, 28, 1, true), M.gunmetal, 0, 0, len * 0.44, Math.PI / 2, 0, 0, E);
    add(new THREE.TorusGeometry(r * 0.88, r * 0.08, 8, 28), M.chrome, 0, 0, len * 0.5, 0, 0, 0, E);
    add(new THREE.TorusGeometry(r * 0.98, r * 0.06, 8, 28), M.cobalt, 0, 0, -len * 0.42, 0, 0, 0, E);
    // cooling fins
    for (let k = 0; k < 4; k++) add(new THREE.BoxGeometry(r * 0.14, r * 2.3, len * 0.3), M.dark, 0, 0, len * 0.18, 0, 0, k * Math.PI / 4, E);
    const noz = add(new THREE.CircleGeometry(r * 0.7, 32), M.nozzle, 0, 0, len * 0.5 - 0.6, 0, 0, 0, E); noz.castShadow = noz.receiveShadow = false; nozzles.push(noz);
    const ex = makeExhaust(len * 1.3, r * 0.78, 0x5fd0ff); ex.position.set(0, 0, len * 0.5); E.add(ex); exhausts.push(ex);
  }
  // ---- twin forward cannon prongs (the icon)
  for (const s of [-1, 1]) {
    const P = new THREE.Group(); P.position.set(s * 8.2, -2.4, -34); gf.add(P);
    const prof = [[0, 0.55], [0.03, 0.8], [0.12, 0.9], [0.5, 1.0], [0.62, 1.15], [0.66, 1.15], [0.7, 1.0], [0.9, 1.0], [1.0, 0.9]];
    const pts = prof.map(([t, k]) => new THREE.Vector2(1.7 * k, (t - 0.5) * 62));
    const g = new THREE.LatheGeometry(pts, 24); g.rotateX(Math.PI / 2); // tip (t=0) toward -z
    add(g, M.hullGrey, 0, 0, 0, 0, 0, 0, P);
    add(new THREE.CylinderGeometry(2.05, 2.05, 2.6, 24), M.cobalt, 0, 0, 6, Math.PI / 2, 0, 0, P);
    add(new THREE.CylinderGeometry(1.95, 1.95, 1.2, 24), M.cobalt, 0, 0, -10, Math.PI / 2, 0, 0, P);
    add(new THREE.CylinderGeometry(1.12, 1.15, 3.0, 24, 1, true), M.gunmetal, 0, 0, -30.4, Math.PI / 2, 0, 0, P);
    const tip = add(new THREE.CircleGeometry(0.8, 20), M.glowCyan, 0, 0, -31.9, 0, Math.PI, 0, P); blinkers.push({ m: tip, base: 2.2, f: 0.7, mat: M.glowCyan });
    // pylon joining prong to hull
    add(new RoundedBoxGeometry(2.6, 3.4, 20, 2, 0.4), M.hull, 0, 2.6, 16, 0, 0, 0, P);
    add(new RoundedBoxGeometry(2.0, 1.2, 14, 2, 0.3), M.cobalt, 0, 4.2, 18, 0, 0, 0, P);
  }
  // ---- chin hangar bay under the forward hull: open mouth facing -z, lit interior, guide lights
  const BAY = { x: 0, y: -4.2, z: -26 };
  {
    const chin = hullLoft(-28, -2, (u) => [9.2 + 2.2 * u, 5.0 + 0.8 * u, 0.3 * u], 8, { bevel: 0.15, top: 0.5, belly: 0.42 }, { capStart: false });
    add(chin, M.hull, BAY.x, BAY.y, 0);
    const mouth = new THREE.Mesh(new THREE.BoxGeometry(9.2, 4.0, 26), M.bayInner); mouth.position.set(BAY.x, BAY.y - 0.2, -14.5); gf.add(mouth);
    // bevelled door frame around the mouth + amber guide light bars
    {
      const s = new THREE.Shape(); s.moveTo(-6.4, -3.3); s.lineTo(6.4, -3.3); s.lineTo(6.4, 3.3); s.lineTo(-6.4, 3.3); s.closePath();
      const hole = new THREE.Path(); hole.moveTo(-4.7, -2.1); hole.lineTo(4.7, -2.1); hole.lineTo(4.7, 2.1); hole.lineTo(-4.7, 2.1); hole.closePath(); s.holes.push(hole);
      const fg = new THREE.ExtrudeGeometry(s, { depth: 2.2, bevelEnabled: true, bevelThickness: 0.3, bevelSize: 0.3, bevelSegments: 2 }); fg.translate(0, 0, -1.1);
      add(fg, M.dark, BAY.x, BAY.y - 0.1, -27.4);
      add(new THREE.BoxGeometry(9.4, 0.14, 0.14), M.glowAmber, BAY.x, BAY.y + 2.2, -28.6);
      add(new THREE.BoxGeometry(9.4, 0.14, 0.14), M.glowAmber, BAY.x, BAY.y - 2.4, -28.6);
    }
    for (let i = 0; i < 6; i++) {
      add(new THREE.BoxGeometry(0.16, 0.16, 1.6), M.glowAmber, BAY.x - 4.6, BAY.y - 2.3, -25 + i * 3.6);
      add(new THREE.BoxGeometry(0.16, 0.16, 1.6), M.glowAmber, BAY.x + 4.6, BAY.y - 2.3, -25 + i * 3.6);
      add(new THREE.BoxGeometry(8.6, 0.12, 0.12), M.glowCyan, BAY.x, BAY.y + 2.05, -25 + i * 3.6);
    }
    const l = new THREE.PointLight(0xffb060, 30, 30, 1.8); l.position.set(BAY.x, BAY.y, -18); gf.add(l);
  }
  // ---- hull greebles: raised plates, hatches, antenna, cooling ridges
  const rnd = seeded(11);
  for (let i = 0; i < 26; i++) {
    const z = -24 + rnd() * 70, w = 1.6 + rnd() * 3.5, d = 2 + rnd() * 6;
    const p = hullProf(uOf(z));
    const side = rnd() < 0.5 ? -1 : 1;
    const x = side * (3.6 + rnd() * Math.max(0.5, 0.4 * p.w - 3.6 - w / 2));
    add(new RoundedBoxGeometry(w, 0.5, d, 2, 0.15), rnd() < 0.7 ? M.hullGrey : M.hull, x, p.top - 0.05, z);
  }
  // side vents along the lower chamfer
  for (let i = 0; i < 10; i++) { const z = -6 + i * 5.5, p = hullProf(uOf(z)); add(new THREE.BoxGeometry(0.4, 0.6, 3.5), M.dark, (i % 2 ? -1 : 1) * (p.half - 0.05), p.oy - 0.1 * p.h, z); }
  // belly sensor blister + keel
  add(new THREE.SphereGeometry(2.4, 24, 14), M.gunmetal, 0, -6.1, 14).scale.set(1, 0.6, 1.4);
  add(new RoundedBoxGeometry(3.2, 1.6, 40, 2, 0.4), M.dark, 0, -5.6, 22);
  // running lights along the belly
  for (let i = 0; i < 5; i++) { const b = add(new THREE.SphereGeometry(0.22, 8, 8), M.glowAmber, (i % 2 ? -1 : 1) * 6, -5.4, -10 + i * 12); blinkers.push({ m: b, base: 2.0, f: 1.3 + i * 0.13, mat: M.glowAmber }); }

  gf.userData.bay = new THREE.Vector3(BAY.x, BAY.y - 0.2, -27);
  gf.userData.exhausts = exhausts;
  gf.userData.setPower = (p) => { exhausts.forEach((e) => e.userData.setPower(p)); nozzles.forEach((n) => (n.material.uniforms.uPower.value = 0.6 + 0.5 * p)); };
  gf.userData.tick = (t) => {
    exhausts.forEach((e) => e.userData.tick(t));
    M.nozzle.uniforms.uTime.value = t;
    for (const b of blinkers) {
      const k = 0.5 + 0.5 * Math.sin(t * b.f * Math.PI * 2);
      if (b.nav) { const on = (t * 1.2) % 1 < 0.12 ? 1 : 0.25; b.m.scale.setScalar(on); }
      else b.m.scale.setScalar(0.8 + 0.3 * k);
    }
  };
  gf.userData.setPower(1);
  return gf;
}
