// Procedural assets for the cinematics: materials, Great Fox mothership, hangar
// interior set, exhaust plumes, and a wrapper around the ship piece's Arwing.
// Sky / planet / lighting come from the lookdev piece (see index.js).
import * as THREE from 'three';
import { buildArwing } from '../ship/index.js';

/* ------------------------------------------------------------------ */
/* Arwing (ship piece) wrapped with the small API the sequences use     */
/* ------------------------------------------------------------------ */
export function makeArwing() {
  const s = buildArwing({ THREE });
  const g = s.group;
  s.setHover(0);
  g.userData.api = s;
  g.userData.setPower = (p) => s.setThrust(Math.min(1, p / 2.2));
  g.userData.tick = (dt, t, cam) => s.update(dt, t, cam);
  return g;
}

/* ------------------------------------------------------------------ */
/* Textures: hull panels                                               */
/* ------------------------------------------------------------------ */
export function makePanelTexture(rng, base = '#e4eaf0', line = 'rgba(40,52,74,0.35)', size = 1024) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = base; g.fillRect(0, 0, size, size);
  // large panel plates with subtle tone variation
  const cols = 6, rows = 10, cw = size / cols, rh = size / rows;
  for (let y = 0; y < rows; y++) for (let x = 0; x < cols; x++) {
    if (rng.next() < 0.35) continue;
    const v = (rng.next() - 0.5) * 16;
    g.fillStyle = `rgba(${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${v > 0 ? 255 : 0},${Math.abs(v) / 255})`;
    const w = cw * (1 + Math.floor(rng.next() * 2)), h = rh * (1 + Math.floor(rng.next() * 1.5));
    g.fillRect(x * cw, y * rh, w, h);
  }
  // seams
  g.strokeStyle = line; g.lineWidth = 2;
  for (let y = 0; y <= rows; y++) { g.beginPath(); g.moveTo(0, y * rh + 0.5); g.lineTo(size, y * rh + 0.5); g.stroke(); }
  for (let x = 0; x <= cols; x++) { const jitter = (rng.next() - 0.5) * 20; g.beginPath(); g.moveTo(x * cw + jitter, 0); g.lineTo(x * cw + jitter, size); g.stroke(); }
  // hatches / vents / rivets
  g.strokeStyle = line; g.lineWidth = 1.5;
  for (let i = 0; i < 40; i++) { const x = rng.next() * size, y = rng.next() * size, w = 20 + rng.next() * 60, h = 12 + rng.next() * 30; g.beginPath(); g.roundRect(x, y, w, h, 4); g.stroke(); }
  g.fillStyle = 'rgba(20,28,40,0.45)';
  for (let i = 0; i < 90; i++) { const x = rng.next() * size, y = rng.next() * size; for (let k = 0; k < 5; k++) g.fillRect(x, y + k * 4, 14, 1.5); }
  // grime streaks along the flow direction
  for (let i = 0; i < 300; i++) { g.fillStyle = `rgba(${rng.next() < 0.5 ? '40,50,70' : '255,255,255'},${rng.next() * 0.06})`; g.fillRect(rng.next() * size, rng.next() * size, 2 + rng.next() * 6, 10 + rng.next() * 80); }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}

export function makeWindowTexture(rng, size = 512) {
  const c = document.createElement('canvas'); c.width = size; c.height = size / 8;
  const g = c.getContext('2d');
  g.fillStyle = '#000'; g.fillRect(0, 0, c.width, c.height);
  for (let x = 6; x < c.width - 6; x += 10) for (let y = 10; y < c.height - 10; y += 14) {
    if (rng.next() < 0.72) { g.fillStyle = rng.next() < 0.8 ? '#ffd9a0' : '#a8d8ff'; g.fillRect(x, y, 5, 8); }
  }
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/** Hangar wall plating: one bay-length strip (u along the bay). Large armour plates in two
 *  horizontal bands, a recessed cobalt service trunk, vent grilles, bolt rows, stencilled bay
 *  numbers and grime — designed NOT to read as a repeating box grid. */
export function makeHangarWallTexture(rng, size = 2048) {
  const c = document.createElement('canvas'); c.width = size; c.height = size / 2;
  const W = size, H = size / 2;
  const g = c.getContext('2d');
  g.fillStyle = '#9aa6b6'; g.fillRect(0, 0, W, H);
  // horizontal bands: upper plates (H*0..0.42), trunk (0.42..0.55), lower plates (0.55..0.86), skirting (0.86..1)
  const plate = (x, y, w, h, tone) => {
    g.fillStyle = `rgb(${Math.round(148 * tone)},${Math.round(160 * tone)},${Math.round(176 * tone)})`;
    g.fillRect(x, y, w, h);
    g.fillStyle = 'rgba(255,255,255,0.22)'; g.fillRect(x, y, w, 4); g.fillRect(x, y, 3, h);
    g.fillStyle = 'rgba(12,18,30,0.55)'; g.fillRect(x, y + h - 5, w, 5); g.fillRect(x + w - 4, y, 4, h);
    // bolts
    g.fillStyle = 'rgba(20,26,38,0.7)';
    for (const [bx, by] of [[x + 12, y + 12], [x + w - 14, y + 12], [x + 12, y + h - 14], [x + w - 14, y + h - 14]]) { g.beginPath(); g.arc(bx, by, 3.5, 0, Math.PI * 2); g.fill(); }
  };
  const band = (y0, y1) => {
    let x = 0; const h = y1 - y0;
    while (x < W) {
      const w = Math.min(W - x, (160 + Math.floor(rng.next() * 3) * 120));
      const tone = 0.92 + rng.next() * 0.16;
      plate(x + 3, y0 + 3, w - 6, h - 6, tone);
      const r = rng.next();
      if (r < 0.22) { // vent grille
        g.fillStyle = 'rgba(14,20,32,0.75)';
        const gw = w * 0.5, gh = h * 0.36, gx = x + (w - gw) / 2, gy = y0 + (h - gh) / 2;
        g.fillRect(gx, gy, gw, gh); g.fillStyle = 'rgba(150,165,190,0.55)';
        for (let k = gy + 6; k < gy + gh - 4; k += 9) g.fillRect(gx + 5, k, gw - 10, 3);
      } else if (r < 0.34) { // stencil
        g.fillStyle = 'rgba(28,36,54,0.75)'; g.font = `900 ${Math.floor(h * 0.34)}px sans-serif`; g.textBaseline = 'middle';
        g.fillText(`${String.fromCharCode(65 + Math.floor(rng.next() * 5))}${Math.floor(rng.next() * 9) + 1}`, x + w * 0.18, y0 + h * 0.5);
      } else if (r < 0.46) { // access hatch
        g.strokeStyle = 'rgba(20,26,40,0.7)'; g.lineWidth = 5; g.beginPath(); g.roundRect(x + w * 0.25, y0 + h * 0.22, w * 0.5, h * 0.56, 10); g.stroke();
        g.fillStyle = '#e2b53a'; g.fillRect(x + w * 0.25, y0 + h * 0.22 - 10, w * 0.5, 6);
      } else if (r < 0.54) { // warning chevron block
        g.fillStyle = '#d8342a'; g.fillRect(x + w * 0.3, y0 + h * 0.4, w * 0.4, h * 0.2);
        g.fillStyle = '#f2f4f8'; for (let k = 0; k < 4; k++) g.fillRect(x + w * 0.3 + k * w * 0.1 + 6, y0 + h * 0.4, w * 0.03, h * 0.2);
      }
      x += w;
    }
  };
  band(0, H * 0.42); band(H * 0.55, H * 0.86);
  // recessed cobalt service trunk with conduits and running light slots
  g.fillStyle = '#0d1422'; g.fillRect(0, H * 0.42, W, H * 0.13);
  g.fillStyle = '#1e4fd8'; g.fillRect(0, H * 0.435, W, H * 0.045);
  g.fillStyle = 'rgba(255,255,255,0.18)'; g.fillRect(0, H * 0.435, W, 4);
  g.fillStyle = '#3a4456'; g.fillRect(0, H * 0.495, W, 10); g.fillRect(0, H * 0.52, W, 6);
  for (let x = 40; x < W; x += 180) { g.fillStyle = '#ffb060'; g.fillRect(x, H * 0.532, 28, 6); }
  // skirting: dark with hazard stripe
  g.fillStyle = '#1c2230'; g.fillRect(0, H * 0.86, W, H * 0.14);
  g.fillStyle = '#e2b53a'; for (let x = 0; x < W; x += 64) { g.beginPath(); g.moveTo(x, H * 0.905); g.lineTo(x + 26, H * 0.905); g.lineTo(x + 26 + 22, H * 0.955); g.lineTo(x + 22, H * 0.955); g.fill(); }
  // grime: vertical streaks + soot near skirting
  for (let i = 0; i < 700; i++) { g.fillStyle = `rgba(${rng.next() < 0.6 ? '20,26,40' : '255,255,255'},${rng.next() * 0.07})`; g.fillRect(rng.next() * W, rng.next() * H, 2 + rng.next() * 6, 20 + rng.next() * 160); }
  const soot = g.createLinearGradient(0, H * 0.7, 0, H); soot.addColorStop(0, 'rgba(0,0,0,0)'); soot.addColorStop(1, 'rgba(0,0,0,0.35)'); g.fillStyle = soot; g.fillRect(0, 0, W, H);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}

/** Deck plating: dark matte blue-grey plates with tread texture, bolt rows, worn paint
 *  and a centre lane with hazard chevrons. Dark and rough by design so light sources read as
 *  soft pools instead of a blown-out specular smear. */
export function makeFloorTexture(rng, size = 1024) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#242b38'; g.fillRect(0, 0, size, size);
  const n = 4, cs = size / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const v = 0.82 + rng.next() * 0.28;
    g.fillStyle = `rgb(${Math.round(40 * v)},${Math.round(47 * v)},${Math.round(62 * v)})`;
    g.fillRect(x * cs + 5, y * cs + 5, cs - 10, cs - 10);
    // tread: fine diagonal hatch
    g.strokeStyle = 'rgba(255,255,255,0.045)'; g.lineWidth = 2;
    for (let k = -cs; k < cs; k += 14) { g.beginPath(); g.moveTo(x * cs + k, y * cs); g.lineTo(x * cs + k + cs, y * cs + cs); g.stroke(); }
    // bolt rows along edges
    g.fillStyle = 'rgba(120,135,160,0.5)';
    for (let k = 24; k < cs - 20; k += 40) { g.beginPath(); g.arc(x * cs + 14, y * cs + k, 3, 0, 7); g.fill(); g.beginPath(); g.arc(x * cs + cs - 14, y * cs + k, 3, 0, 7); g.fill(); g.beginPath(); g.arc(x * cs + k, y * cs + 14, 3, 0, 7); g.fill(); g.beginPath(); g.arc(x * cs + k, y * cs + cs - 14, 3, 0, 7); g.fill(); }
    // plate edge bevel
    g.fillStyle = 'rgba(255,255,255,0.10)'; g.fillRect(x * cs + 5, y * cs + 5, cs - 10, 3);
    g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(x * cs + 5, y * cs + cs - 9, cs - 10, 4);
  }
  g.strokeStyle = 'rgba(8,11,18,0.95)'; g.lineWidth = 8;
  for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(0, i * cs); g.lineTo(size, i * cs); g.stroke(); g.beginPath(); g.moveTo(i * cs, 0); g.lineTo(i * cs, size); g.stroke(); }
  // scuffs / worn paint / oil
  for (let i = 0; i < 260; i++) { g.fillStyle = `rgba(${rng.next() < 0.5 ? '0,0,0' : '160,175,200'},${rng.next() * 0.08})`; g.fillRect(rng.next() * size, rng.next() * size, 3 + rng.next() * 30, 40 + rng.next() * 220); }
  for (let i = 0; i < 14; i++) { const x = rng.next() * size, y = rng.next() * size, r = 20 + rng.next() * 60; const o = g.createRadialGradient(x, y, 0, x, y, r); o.addColorStop(0, 'rgba(0,0,0,0.35)'); o.addColorStop(1, 'rgba(0,0,0,0)'); g.fillStyle = o; g.fillRect(x - r, y - r, r * 2, r * 2); }
  // centre lane: painted yellow edge lines + chevrons (worn)
  g.fillStyle = 'rgba(226,181,58,0.75)'; g.fillRect(size * 0.5 - 70, 0, 6, size); g.fillRect(size * 0.5 + 64, 0, 6, size);
  g.fillStyle = 'rgba(226,181,58,0.5)';
  for (let y = 0; y < size; y += 128) { g.beginPath(); g.moveTo(size * 0.5 - 40, y + 30); g.lineTo(size * 0.5, y); g.lineTo(size * 0.5 + 40, y + 30); g.lineTo(size * 0.5 + 40, y + 46); g.lineTo(size * 0.5, y + 16); g.lineTo(size * 0.5 - 40, y + 46); g.fill(); }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}

/* ------------------------------------------------------------------ */
/* Materials                                                           */
/* ------------------------------------------------------------------ */
export function makeMaterials(rng) {
  const panels = makePanelTexture(rng, '#e6ecf2');
  const panelsDark = makePanelTexture(rng, '#3a4250', 'rgba(10,14,22,0.6)');
  const floor = makeFloorTexture(rng, 2048);
  const hwall = makeHangarWallTexture(rng);
  const mats = {
    hull: new THREE.MeshPhysicalMaterial({ color: 0xf2f5f8, map: panels, metalness: 0.1, roughness: 0.42, clearcoat: 0.8, clearcoatRoughness: 0.15, envMapIntensity: 1.0 }),
    hullBlue: new THREE.MeshPhysicalMaterial({ color: 0x2458c8, metalness: 0.5, roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.2, envMapIntensity: 1.2 }),
    hullDark: new THREE.MeshStandardMaterial({ color: 0x5c6677, map: panelsDark, metalness: 0.7, roughness: 0.45, envMapIntensity: 1.0 }),
    hullRed: new THREE.MeshPhysicalMaterial({ color: 0xd8342a, metalness: 0.3, roughness: 0.35, clearcoat: 0.6, envMapIntensity: 1.1 }),
    gunmetal: new THREE.MeshStandardMaterial({ color: 0x1e222b, metalness: 0.9, roughness: 0.35, envMapIntensity: 1.3 }),
    glow: new THREE.MeshStandardMaterial({ color: 0x8fe4ff, emissive: 0x5fd0ff, emissiveIntensity: 4.0, roughness: 1, metalness: 0 }),
    glowOrange: new THREE.MeshStandardMaterial({ color: 0xffb060, emissive: 0xff9040, emissiveIntensity: 3.0 }),
    glowWhite: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4e0, emissiveIntensity: 1.8 }),
    windows: new THREE.MeshStandardMaterial({ color: 0x0a0c10, emissive: 0xffffff, emissiveMap: makeWindowTexture(rng), emissiveIntensity: 2.2, metalness: 0.6, roughness: 0.4 }),
    // deck: dark, matte, non-metal -> lights read as soft pools, no specular smear
    hangarFloor: new THREE.MeshStandardMaterial({ color: 0xcfd6e0, map: floor, metalness: 0.0, roughness: 0.94, envMapIntensity: 0.25 }),
    hangarWall: new THREE.MeshStandardMaterial({ color: 0xffffff, map: hwall, metalness: 0.15, roughness: 0.72, envMapIntensity: 0.35 }),
    hangarCeil: new THREE.MeshStandardMaterial({ color: 0x3a4250, map: panelsDark, metalness: 0.4, roughness: 0.8, envMapIntensity: 0.3 }),
    truss: new THREE.MeshStandardMaterial({ color: 0x6d7789, metalness: 0.7, roughness: 0.5, envMapIntensity: 0.6 }),
    crate: new THREE.MeshStandardMaterial({ color: 0x8b93a3, metalness: 0.3, roughness: 0.7 }),
    crateBlue: new THREE.MeshStandardMaterial({ color: 0x2456c8, metalness: 0.3, roughness: 0.6 }),
    drum: new THREE.MeshStandardMaterial({ color: 0xe0b23a, metalness: 0.4, roughness: 0.55 }),
    glowCyanStrip: new THREE.MeshStandardMaterial({ color: 0x0b2a40, emissive: 0x4fd8ff, emissiveIntensity: 1.1, roughness: 0.5 }),
    padDark: new THREE.MeshStandardMaterial({ color: 0x1a2130, metalness: 0.2, roughness: 0.85 }),
    bayInner: new THREE.MeshStandardMaterial({ color: 0x0b0e14, side: THREE.BackSide, roughness: 0.9 }),
  };
  panels.repeat.set(1, 1);
  return mats;
}

/* ------------------------------------------------------------------ */
/* Geometry helpers                                                    */
/* ------------------------------------------------------------------ */
/** Box whose XY cross-section is scaled along Z by fn(z01) -> [sx, sy, yOffset]. Nose at -Z. */
export function taperBox(w, h, l, fn, segs = 12) {
  const g = new THREE.BoxGeometry(w, h, l, 1, 1, segs);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const z = p.getZ(i), u = Math.min(1, Math.max(0, (z + l / 2) / l)); // u = 0 at nose (-Z)
    const [sx, sy, oy = 0] = fn(u);
    p.setX(i, p.getX(i) * sx); p.setY(i, p.getY(i) * sy + oy);
  }
  g.computeVertexNormals();
  return g;
}

export function extrudeShape(points, depth, bevel = 0.02) {
  const s = new THREE.Shape(points.map(([x, y]) => new THREE.Vector2(x, y)));
  const g = new THREE.ExtrudeGeometry(s, { depth, bevelEnabled: bevel > 0, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2 });
  g.translate(0, 0, -depth / 2);
  return g;
}

/** Additive exhaust cone + flare sprite. Returns group with .setPower(p). */
export function makeExhaust(len = 4, rad = 0.35, color = 0x66d9ff) {
  const grp = new THREE.Group();
  const cone = new THREE.Mesh(new THREE.ConeGeometry(rad, len, 20, 1, true), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uPower: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `uniform vec3 uColor; uniform float uTime; uniform float uPower; varying vec2 vUv;
      void main(){ float t = vUv.y; // 1 at cone base (nozzle)
        float flick = 0.85 + 0.15*sin(uTime*40.0 + vUv.x*30.0) * sin(uTime*23.0 + vUv.y*12.0);
        float a = pow(t, 2.4) * flick * uPower;
        vec3 c = mix(uColor, vec3(1.0,0.98,0.9), pow(t, 5.0)*0.85);
        gl_FragColor = vec4(c*a*1.8, a); }`,
  }));
  cone.rotation.x = -Math.PI / 2; cone.position.z = len / 2; // points +Z (rearward)
  grp.add(cone);
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d'); const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.25, 'rgba(160,230,255,0.8)'); grd.addColorStop(1, 'rgba(80,160,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c); tex.colorSpace = THREE.SRGBColorSpace;
  const flare = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color }));
  flare.scale.setScalar(rad * 5); grp.add(flare);
  grp.userData.setPower = (p) => { cone.material.uniforms.uPower.value = p; cone.scale.set(0.6 + p * 0.5, 0.6 + p * 0.5, 0.35 + p * 0.9); flare.material.opacity = Math.min(1, 0.4 + p * 0.7); flare.scale.setScalar(rad * (3 + p * 3)); };
  grp.userData.tick = (t) => { cone.material.uniforms.uTime.value = t; };
  grp.userData.setPower(1);
  return grp;
}

/* ------------------------------------------------------------------ */
/* Great Fox (nose -Z, length ≈ 120)                                  */
/* ------------------------------------------------------------------ */
export function buildGreatFox(mats) {
  const gf = new THREE.Group();
  const add = (geo, mat, x = 0, y = 0, z = 0, rx = 0, ry = 0, rz = 0) => {
    const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.castShadow = true; m.receiveShadow = true; gf.add(m); return m;
  };
  // main hull: long wedge, faceted; hangar mouth at nose
  add(taperBox(14, 9, 84, (u) => {
    const s = 0.55 + 0.45 * Math.pow(u, 0.7);
    return [s, s * (0.72 + 0.28 * u), 0.6 * (1 - u)];
  }, 20), mats.hull, 0, 0, 6);
  // side chines (blue)
  for (const side of [-1, 1]) add(taperBox(1.6, 1.4, 70, (u) => [0.5 + 0.5 * u, 1, 0], 10), mats.hullBlue, side * 7.2, 0.4, 12);
  // belly keel + sensor blister
  add(taperBox(6, 4.5, 64, (u) => [0.55 + 0.45 * u, 1, 0], 10), mats.hullDark, 0, -5.2, 14);
  add(new THREE.SphereGeometry(2.2, 20, 12), mats.gunmetal, 0, -7, 24);
  // dorsal spine + bridge tower
  add(taperBox(5, 3.5, 44, (u) => [0.7 + 0.3 * u, 1, 0], 8), mats.hull, 0, 5.6, 22);
  add(taperBox(8, 4, 12, (u) => [0.7 + 0.3 * u, 0.6 + 0.4 * u, 0], 4), mats.hull, 0, 8.6, 32);
  add(new THREE.BoxGeometry(8.4, 1.3, 5), mats.windows, 0, 8.9, 27.2);
  add(new THREE.BoxGeometry(0.3, 5, 0.3), mats.gunmetal, 0, 13, 36); // mast
  add(new THREE.SphereGeometry(0.35, 8, 8), mats.glowOrange, 0, 15.6, 36);
  add(new THREE.BoxGeometry(3.5, 0.3, 0.3), mats.gunmetal, 0, 14.5, 36);
  // hangar bay (open nose): dark interior box + lit frame + guide lights
  add(new THREE.BoxGeometry(10, 6.2, 3), mats.gunmetal, 0, -0.4, -34.5);
  const bay = new THREE.Mesh(new THREE.BoxGeometry(7.6, 4.2, 14), mats.bayInner); bay.position.set(0, -0.4, -29); gf.add(bay);
  for (let i = 0; i < 7; i++) { add(new THREE.BoxGeometry(7.0, 0.1, 0.1), mats.glowOrange, 0, -2.4, -35.5 + i * 2); add(new THREE.BoxGeometry(7.0, 0.1, 0.1), mats.glowOrange, 0, 1.55, -35.5 + i * 2); }
  add(new THREE.BoxGeometry(7.4, 0.15, 0.15), mats.glowWhite, 0, 1.8, -36.1);
  add(new THREE.BoxGeometry(7.4, 0.15, 0.15), mats.glowWhite, 0, -2.6, -36.1);
  // wings: broad, swept, with engine pods
  for (const side of [-1, 1]) {
    const wg = extrudeShape([[0, -8], [26, 8], [30, 14], [30, 20], [24, 21], [0, 14]], 1.6, 0.15);
    wg.rotateX(Math.PI / 2);
    const w = new THREE.Mesh(wg, mats.hull); w.scale.x = side; w.position.set(side * 5, -1.5, 18); w.castShadow = true; w.receiveShadow = true; gf.add(w);
    const stripe = new THREE.Mesh(extrudeShape([[6, -4], [24, 9], [24, 11.5], [6, -1]], 1.8, 0.0), mats.hullBlue);
    stripe.geometry.rotateX(Math.PI / 2); stripe.scale.x = side; stripe.position.set(side * 5, -1.5, 18); gf.add(stripe);
    const red = new THREE.Mesh(extrudeShape([[8, 13], [26, 13], [26, 14.5], [8, 14.5]], 1.75, 0.0), mats.hullRed);
    red.geometry.rotateX(Math.PI / 2); red.scale.x = side; red.position.set(side * 5, -1.5, 18); gf.add(red);
    // wingtip fins (blue, canted)
    const fin = new THREE.Mesh(extrudeShape([[0, 0], [0, 10], [6, 9], [11, 0]], 0.8, 0.1), mats.hullBlue);
    fin.geometry.rotateY(Math.PI / 2); fin.geometry.rotateZ(Math.PI / 2);
    fin.position.set(side * 34.6, -1, 32); fin.rotation.z = side * -0.25; fin.castShadow = true; gf.add(fin);
    add(new THREE.SphereGeometry(0.3, 8, 8), side < 0 ? mats.glowOrange : mats.glow, side * 34.6, 8.5, 33);
    // engines (2 per side)
    for (let k = 0; k < 2; k++) {
      const x = side * (11 + k * 8), z = 38 + k * 2;
      add(new THREE.CylinderGeometry(2.6, 3.0, 14, 24), mats.hullDark, x, -1.5, z, Math.PI / 2);
      add(new THREE.TorusGeometry(2.9, 0.25, 8, 24), mats.gunmetal, x, -1.5, z + 3);
      add(new THREE.CylinderGeometry(2.4, 2.2, 2.5, 24), mats.gunmetal, x, -1.5, z + 8, Math.PI / 2);
      add(new THREE.CircleGeometry(2.0, 24), mats.glow, x, -1.5, z + 9.3, 0, Math.PI);
      const ex = makeExhaust(30, 2.3, 0x6fd6ff); ex.position.set(x, -1.5, z + 9); gf.add(ex);
      (gf.userData.exhausts ??= []).push(ex);
    }
    // twin forward cannons
    add(new THREE.CylinderGeometry(0.9, 1.3, 48, 16), mats.gunmetal, side * 8.5, -3.5, -20, Math.PI / 2);
    add(new THREE.CylinderGeometry(1.5, 1.5, 6, 16), mats.hullBlue, side * 8.5, -3.5, -2, Math.PI / 2);
    add(new THREE.CylinderGeometry(1.1, 1.1, 1.2, 16), mats.gunmetal, side * 8.5, -3.5, -43.5, Math.PI / 2);
    // hull window strips
    add(new THREE.BoxGeometry(0.2, 0.7, 34), mats.windows, side * 6.9, 1.6, 14);
  }
  // red accents
  add(new THREE.BoxGeometry(14.6, 1.0, 4), mats.hullRed, 0, 1.9, -8);
  add(new THREE.BoxGeometry(5.2, 0.4, 16), mats.hullRed, 0, 7.4, 20);
  gf.userData.tick = (t) => gf.userData.exhausts.forEach((e) => e.userData.tick(t));
  gf.userData.setPower = (p) => gf.userData.exhausts.forEach((e) => e.userData.setPower(p));
  return gf;
}

/* ------------------------------------------------------------------ */
/* Hangar interior set (camera looks out of the bay along -Z)          */
/* ------------------------------------------------------------------ */
export function buildHangar(mats) {
  const h = new THREE.Group();
  const W = 30, H = 14, L = 78, FLOOR = -H / 2 + 0.5; // floor top
  const add = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0, { cast = false, recv = true } = {}) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.receiveShadow = recv; m.castShadow = cast; h.add(m); return m; };
  mats.hangarFloor.map.repeat.set(1, L / W);
  mats.hangarWall.map.repeat.set(2.6, 1);
  mats.hangarCeil.map.repeat.set(2, 5);
  add(new THREE.BoxGeometry(W, 1, L), mats.hangarFloor, 0, -H / 2, 0);
  add(new THREE.BoxGeometry(W, 1, L), mats.hangarCeil, 0, H / 2, 0);
  // side walls as planes so the texture's UV runs along the bay (u along z)
  const sideGeo = new THREE.PlaneGeometry(L, H);
  add(sideGeo, mats.hangarWall, -W / 2 + 0.5, 0, 0, 0, Math.PI / 2, 0);
  add(sideGeo, mats.hangarWall, W / 2 - 0.5, 0, 0, 0, -Math.PI / 2, 0);
  const backGeo = new THREE.PlaneGeometry(W, H); backGeo.attributes.uv.array.forEach((v, i) => { if (i % 2 === 0) backGeo.attributes.uv.array[i] = v * (W / L) * 2.6; });
  add(backGeo, mats.hangarWall, 0, 0, L / 2 - 0.5, 0, Math.PI, 0); // back wall
  // atmosphere: faint additive haze sheets across the bay so the launch lights bloom in the air
  const hazeMat = new THREE.MeshBasicMaterial({ color: 0x3a5a90, transparent: true, opacity: 0.008, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
  for (let i = 0; i < 7; i++) { const s = new THREE.Mesh(new THREE.PlaneGeometry(W, H), hazeMat); s.position.set(0, 0, -L / 2 + 4 + i * 10); h.add(s); }

  // ---- structure: ribs (wall pillars + ceiling arch), trusses, gantry
  const ribGeo = new THREE.BoxGeometry(1.1, H - 0.5, 1.1), archGeo = new THREE.BoxGeometry(W - 0.6, 1.0, 1.1), bandGeo = new THREE.BoxGeometry(1.15, 1.4, 1.15);
  const trussGeo = new THREE.BoxGeometry(0.22, 0.22, 9.2), lampGeo = new THREE.BoxGeometry(0.22, 0.6, 0.22), ceilLightGeo = new THREE.BoxGeometry(W * 0.5, 0.14, 0.5);
  for (let i = 0; i < 8; i++) {
    const z = -L / 2 + 5 + i * 9.5;
    add(archGeo, mats.hull, 0, H / 2 - 1.0, z, 0, 0, 0, { cast: true });
    for (const s of [-1, 1]) {
      add(ribGeo, mats.hull, s * (W / 2 - 1.05), 0, z, 0, 0, 0, { cast: true });
      add(bandGeo, mats.hullBlue, s * (W / 2 - 1.05), 2.6, z);
      add(lampGeo, mats.glowOrange, s * (W / 2 - 1.3), FLOOR + 1.6, z);
      // diagonal roof trusses between arches
      if (i < 7) { add(trussGeo, mats.truss, s * (W * 0.25), H / 2 - 1.7, z + 4.75, 0, 0, 0); add(trussGeo, mats.truss, s * (W * 0.25), H / 2 - 1.7, z + 4.75, 0.55, 0, 0); }
    }
    // ceiling light bar (two half-bars leave the centre gantry dark)
    add(ceilLightGeo, mats.glowWhite, 0, H / 2 - 0.6, z + 4.75);
  }
  // centre gantry rail + hoist trolley
  add(new THREE.BoxGeometry(2.2, 0.7, L - 8), mats.hullDark, 0, H / 2 - 2.3, 2);
  add(new THREE.BoxGeometry(3.0, 1.2, 2.6), mats.crateBlue, 0, H / 2 - 3.2, 14, 0, 0, 0, { cast: true });
  add(new THREE.CylinderGeometry(0.05, 0.05, 3.5, 6), mats.gunmetal, 0, H / 2 - 5.5, 14);
  add(new THREE.BoxGeometry(1.2, 0.5, 0.4), mats.drum, 0, H / 2 - 7.4, 14);

  // ---- catwalks along both walls with railings, under-lit
  const deckGeo = new THREE.BoxGeometry(2.4, 0.25, L - 6), railGeo = new THREE.CylinderGeometry(0.05, 0.05, L - 6, 6), postGeo = new THREE.CylinderGeometry(0.05, 0.05, 1.1, 6);
  const underGeo = new THREE.BoxGeometry(0.12, 0.08, L - 8);
  for (const s of [-1, 1]) {
    const x = s * (W / 2 - 2.4);
    add(deckGeo, mats.truss, x, 1.2, 0);
    add(railGeo, mats.gunmetal, x - s * 1.1, 2.3, 0, Math.PI / 2);
    add(railGeo, mats.gunmetal, x - s * 1.1, 1.75, 0, Math.PI / 2);
    for (let k = 0; k < 13; k++) add(postGeo, mats.gunmetal, x - s * 1.1, 1.75, -L / 2 + 3 + k * 6);
    add(underGeo, mats.glowCyanStrip, x - s * 1.2, 1.05, 0);
    // stores under the catwalk: crates, drums, tool carts
    for (let k = 0; k < 9; k++) {
      const z = -L / 2 + 6 + k * 8.2 + (k % 3) * 1.1;
      const kind = (k + (s > 0 ? 1 : 0)) % 4;
      if (kind === 0) { add(new THREE.BoxGeometry(2.2, 1.6, 2.4), mats.crate, x + s * 0.2, FLOOR + 0.8, z, 0, 0, 0, { cast: true }); add(new THREE.BoxGeometry(1.6, 1.2, 1.7), mats.crateBlue, x + s * 0.3, FLOOR + 2.2, z + 0.2, 0, 0.2, 0, { cast: true }); }
      else if (kind === 1) { for (let d = 0; d < 3; d++) add(new THREE.CylinderGeometry(0.55, 0.55, 1.5, 14), d === 1 ? mats.drum : mats.hullDark, x + s * 0.4 + (d - 1) * 0.15, FLOOR + 0.75, z + (d - 1) * 1.25, 0, 0, 0, { cast: true }); }
      else if (kind === 2) { add(new THREE.BoxGeometry(2.6, 0.9, 1.4), mats.hullDark, x, FLOOR + 0.9, z, 0, 0, 0, { cast: true }); add(new THREE.BoxGeometry(2.4, 0.15, 1.2), mats.glowCyanStrip, x, FLOOR + 1.4, z); for (const w of [-1, 1]) add(new THREE.CylinderGeometry(0.3, 0.3, 0.2, 10), mats.gunmetal, x + w * 1.0, FLOOR + 0.3, z + 0.9, Math.PI / 2); }
      else { add(new THREE.BoxGeometry(1.4, 3.0, 1.2), mats.crateBlue, x + s * 0.4, FLOOR + 1.5, z, 0, 0, 0, { cast: true }); add(new THREE.BoxGeometry(1.0, 0.5, 0.05), mats.glowOrange, x - s * 0.2, FLOOR + 2.4, z - 0.62); }
    }
    // wall conduits (3 pipes) and running amber lights
    for (let p = 0; p < 3; p++) add(new THREE.CylinderGeometry(0.18 - p * 0.03, 0.18 - p * 0.03, L - 4, 10), mats.gunmetal, s * (W / 2 - 0.85), 4.6 + p * 0.45, 0, Math.PI / 2);
  }

  // ---- launch lanes: cradles, cyan guide strips, floodlights, chocks
  const lanes = [-6.2, 6.2];
  const cradleGeo = new THREE.BoxGeometry(4.8, 0.6, 5.6), clampGeo = new THREE.BoxGeometry(0.4, 1.0, 0.7), clampTipGeo = new THREE.BoxGeometry(0.42, 0.18, 0.72), padGeo = new THREE.BoxGeometry(4.4, 0.06, 5.2);
  const stripGeo = new THREE.BoxGeometry(0.16, 0.05, 3), edgeGeo = new THREE.BoxGeometry(0.1, 0.05, 5.2), edgeGeo2 = new THREE.BoxGeometry(4.4, 0.05, 0.1), lampGeo2 = new THREE.BoxGeometry(0.22, 0.1, 0.22);
  for (const x of lanes) {
    for (let i = 0; i < 12; i++) { add(stripGeo, mats.glowCyanStrip, x - 3.2, FLOOR + 0.04, -L / 2 + 3 + i * 6.3); add(stripGeo, mats.glowCyanStrip, x + 3.2, FLOOR + 0.04, -L / 2 + 3 + i * 6.3); }
    for (const z of [12, 24]) {
      add(cradleGeo, mats.hullDark, x, FLOOR + 0.3, z + 1.6, 0, 0, 0, { cast: true });
      add(padGeo, mats.padDark, x, FLOOR + 0.63, z + 1.6);
      // thin cyan edge lights around the pad instead of a glowing plate
      for (const s of [-1, 1]) { add(edgeGeo, mats.glowCyanStrip, x + s * 2.2, FLOOR + 0.67, z + 1.6); add(edgeGeo2, mats.glowCyanStrip, x, FLOOR + 0.67, z + 1.6 + s * 2.6); }
      // wheel clamps: dark posts with a hazard-yellow cap and a small amber lamp
      for (const s of [-1, 1]) { add(clampGeo, mats.hullDark, x + s * 2.1, FLOOR + 1.1, z + 3.4, 0, 0, s * 0.2, { cast: true }); add(clampTipGeo, mats.drum, x + s * 2.1 - s * 0.1, FLOOR + 1.62, z + 3.4, 0, 0, s * 0.2); add(lampGeo2, mats.glowOrange, x + s * 2.1 - s * 0.12, FLOOR + 1.76, z + 3.4); }
    }
  }
  // centre aisle: painted lane already in texture; add recessed floor lights down the middle
  for (let i = 0; i < 12; i++) add(new THREE.BoxGeometry(0.5, 0.05, 0.5), mats.glowOrange, 0, FLOOR + 0.03, -L / 2 + 3 + i * 6.3);

  // ---- bay mouth: heavy frame, hazard stripes, orange edge lights, chase lights
  add(holeBox(W + 2, H + 2, 2.4, W - 2.0, H - 2.0), mats.gunmetal, 0, 0, -L / 2 - 0.6);
  add(new THREE.BoxGeometry(W - 2, 0.6, 0.3), mats.drum, 0, -H / 2 + 1.3, -L / 2 - 0.1);
  add(new THREE.BoxGeometry(W - 2, 0.6, 0.3), mats.drum, 0, H / 2 - 1.3, -L / 2 - 0.1);
  for (const s of [-1, 1]) add(new THREE.BoxGeometry(0.3, H - 2.6, 0.3), mats.glowOrange, s * (W / 2 - 1.15), 0, -L / 2 - 1.85);
  for (let i = 0; i < 9; i++) add(new THREE.BoxGeometry(0.5, 0.2, 0.2), mats.glowWhite, -W / 2 + 3 + i * (W - 6) / 8, H / 2 - 1.5, -L / 2 - 1.85);

  // ---- lights: cool overheads high up (never near the deck), a soft warm bounce at the mouth kept
  // well above the floor so the deck shows lit pools, not a specular smear
  const l1 = new THREE.PointLight(0xbfe4ff, 30, 70, 1.8); l1.position.set(0, 5.5, 4); h.add(l1);
  const l2 = new THREE.PointLight(0xffb070, 10, 60, 2.0); l2.position.set(0, 2.5, -30); h.add(l2);
  const l3 = new THREE.PointLight(0x9fd8ff, 24, 60, 1.8); l3.position.set(0, 5.5, 26); h.add(l3);
  h.userData.dims = { W, H, L, FLOOR, lanes, cradleTop: FLOOR + 0.66 };
  return h;
}

/** Rectangular frame: box with a rectangular hole through Z. */
function holeBox(w, h, d, iw, ih) {
  const s = new THREE.Shape(); s.moveTo(-w / 2, -h / 2); s.lineTo(w / 2, -h / 2); s.lineTo(w / 2, h / 2); s.lineTo(-w / 2, h / 2); s.closePath();
  const hole = new THREE.Path(); hole.moveTo(-iw / 2, -ih / 2); hole.lineTo(iw / 2, -ih / 2); hole.lineTo(iw / 2, ih / 2); hole.lineTo(-iw / 2, ih / 2); hole.closePath();
  s.holes.push(hole);
  const g = new THREE.ExtrudeGeometry(s, { depth: d, bevelEnabled: false }); g.translate(0, 0, -d / 2);
  return g;
}
