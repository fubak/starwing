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

export function makeFloorTexture(rng, size = 1024) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d');
  g.fillStyle = '#2a3140'; g.fillRect(0, 0, size, size);
  const n = 8, cs = size / n;
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const v = 0.7 + rng.next() * 0.3;
    g.fillStyle = `rgb(${Math.round(46 * v)},${Math.round(54 * v)},${Math.round(70 * v)})`;
    g.fillRect(x * cs + 3, y * cs + 3, cs - 6, cs - 6);
  }
  g.strokeStyle = 'rgba(10,14,22,0.9)'; g.lineWidth = 6;
  for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(0, i * cs); g.lineTo(size, i * cs); g.stroke(); g.beginPath(); g.moveTo(i * cs, 0); g.lineTo(i * cs, size); g.stroke(); }
  // hazard chevrons down the middle lane
  g.fillStyle = 'rgba(255,196,60,0.55)';
  for (let y = 0; y < size; y += 96) { g.beginPath(); g.moveTo(size * 0.5 - 40, y); g.lineTo(size * 0.5 + 40, y); g.lineTo(size * 0.5 + 40, y + 14); g.lineTo(size * 0.5 - 40, y + 14); g.fill(); }
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
  const floor = makeFloorTexture(rng);
  const mats = {
    hull: new THREE.MeshPhysicalMaterial({ color: 0xf2f5f8, map: panels, metalness: 0.1, roughness: 0.42, clearcoat: 0.8, clearcoatRoughness: 0.15, envMapIntensity: 1.0 }),
    hullBlue: new THREE.MeshPhysicalMaterial({ color: 0x2458c8, metalness: 0.5, roughness: 0.3, clearcoat: 0.5, clearcoatRoughness: 0.2, envMapIntensity: 1.2 }),
    hullDark: new THREE.MeshStandardMaterial({ color: 0x5c6677, map: panelsDark, metalness: 0.7, roughness: 0.45, envMapIntensity: 1.0 }),
    hullRed: new THREE.MeshPhysicalMaterial({ color: 0xd8342a, metalness: 0.3, roughness: 0.35, clearcoat: 0.6, envMapIntensity: 1.1 }),
    gunmetal: new THREE.MeshStandardMaterial({ color: 0x1e222b, metalness: 0.9, roughness: 0.35, envMapIntensity: 1.3 }),
    glow: new THREE.MeshStandardMaterial({ color: 0x8fe4ff, emissive: 0x5fd0ff, emissiveIntensity: 4.0, roughness: 1, metalness: 0 }),
    glowOrange: new THREE.MeshStandardMaterial({ color: 0xffb060, emissive: 0xff9040, emissiveIntensity: 3.0 }),
    glowWhite: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff4e0, emissiveIntensity: 3.5 }),
    windows: new THREE.MeshStandardMaterial({ color: 0x0a0c10, emissive: 0xffffff, emissiveMap: makeWindowTexture(rng), emissiveIntensity: 2.2, metalness: 0.6, roughness: 0.4 }),
    hangarFloor: new THREE.MeshStandardMaterial({ color: 0xffffff, map: floor, metalness: 0.55, roughness: 0.5, envMapIntensity: 0.7 }),
    hangarWall: new THREE.MeshStandardMaterial({ color: 0x8a94a6, map: panelsDark, metalness: 0.6, roughness: 0.55, envMapIntensity: 0.6 }),
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
  const W = 26, H = 12, L = 70;
  const wall = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); m.receiveShadow = true; h.add(m); return m; };
  mats.hangarFloor.map.repeat.set(2, 6);
  wall(new THREE.BoxGeometry(W, 1, L), mats.hangarFloor, 0, -H / 2, 0);
  wall(new THREE.BoxGeometry(W, 1, L), mats.hangarWall, 0, H / 2, 0);
  wall(new THREE.BoxGeometry(1, H, L), mats.hangarWall, -W / 2, 0, 0);
  wall(new THREE.BoxGeometry(1, H, L), mats.hangarWall, W / 2, 0, 0);
  wall(new THREE.BoxGeometry(W, H, 1), mats.hangarWall, 0, 0, L / 2); // back wall
  // ribs + ceiling light bars + side conduits
  for (let i = 0; i < 9; i++) {
    const z = -L / 2 + 6 + i * 7;
    const rib = new THREE.Mesh(new THREE.BoxGeometry(W - 0.5, 0.9, 0.9), mats.hullDark); rib.position.set(0, H / 2 - 0.95, z); h.add(rib);
    for (const s of [-1, 1]) {
      const r2 = new THREE.Mesh(new THREE.BoxGeometry(0.9, H - 0.5, 0.9), mats.hullDark); r2.position.set(s * (W / 2 - 0.95), 0, z); h.add(r2);
      const pipe = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 7, 10), mats.gunmetal); pipe.rotation.x = Math.PI / 2; pipe.position.set(s * (W / 2 - 1.2), 2.5, z + 3.5); h.add(pipe);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.5, 0.2), mats.glowOrange); lamp.position.set(s * (W / 2 - 1.2), -1, z); h.add(lamp);
    }
    const lt = new THREE.Mesh(new THREE.BoxGeometry(W * 0.55, 0.15, 0.4), mats.glowWhite); lt.position.set(0, H / 2 - 0.55, z + 3.5); h.add(lt);
  }
  // floor guide strips + launch rails + wheel chocks
  for (const x of [-6.5, 6.5]) {
    for (let i = 0; i < 12; i++) { const g = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.08, 3), mats.glow); g.position.set(x, -H / 2 + 0.56, -L / 2 + 2 + i * 6); h.add(g); }
    const rail = new THREE.Mesh(new THREE.BoxGeometry(1.4, 0.5, L - 4), mats.gunmetal); rail.position.set(x, -H / 2 + 0.75, 0); rail.receiveShadow = true; h.add(rail);
    for (const z of [12, 24]) { const chock = new THREE.Mesh(new THREE.BoxGeometry(5, 0.6, 1.6), mats.hullDark); chock.position.set(x, -H / 2 + 0.8, z + 3); chock.receiveShadow = true; h.add(chock); }
  }
  // gantry over the centre aisle
  const gantry = new THREE.Mesh(new THREE.BoxGeometry(2, 0.6, L - 10), mats.hullDark); gantry.position.set(0, H / 2 - 2.2, 4); h.add(gantry);
  // bay mouth frame
  const frame = new THREE.Mesh(holeBox(W + 2, H + 2, 2, W - 1.5, H - 1.5), mats.gunmetal); frame.position.set(0, 0, -L / 2 - 0.5); h.add(frame);
  for (const s of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.3, H - 2, 0.3), mats.glowOrange); l.position.set(s * (W / 2 - 0.6), 0, -L / 2 - 1.6); h.add(l); }
  // interior lights
  const l1 = new THREE.PointLight(0xbfe4ff, 140, 70, 1.7); l1.position.set(0, 4.5, 4); h.add(l1);
  const l2 = new THREE.PointLight(0xffb070, 60, 60, 1.7); l2.position.set(0, -3, -16); h.add(l2);
  const l3 = new THREE.PointLight(0x9fd8ff, 80, 60, 1.7); l3.position.set(0, 4, 24); h.add(l3);
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
