/**
 * Procedural Venomian-style enemy fighters.
 * Three distinct chunky designs, all built from merged primitives with 5 shared
 * material slots (hull / accent / trim / glass / glow). Craft face +Z.
 *
 *   buildEnemyCraft('vulture' | 'hornet' | 'mantis') -> Group
 *     group.userData = { kind, radius, hp, engines:[Vector3], glowMeshes:[Mesh], flashMats:[Material] }
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------- textures
let _albedoTex = null, _roughTex = null, _glowTex = null;

/** Panelled albedo: light plates with dark seams, hatches and stripes. Tinted by material.color. */
function albedoTexture() {
  if (_albedoTex) return _albedoTex;
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#d9d9d9'; g.fillRect(0, 0, S, S);
  // plate tone variation (big soft patches)
  for (let i = 0; i < 40; i++) {
    const v = 195 + Math.random() * 60;
    g.fillStyle = `rgba(${v},${v},${v},0.55)`;
    g.fillRect(Math.random() * S, Math.random() * S, 60 + Math.random() * 160, 40 + Math.random() * 120);
  }
  // panel seams
  const cells = 5, s = S / cells;
  g.strokeStyle = 'rgba(40,40,45,0.85)'; g.lineWidth = 3;
  for (let i = 0; i <= cells; i++) {
    const j = (Math.random() - 0.5) * 14;
    g.beginPath(); g.moveTo(i * s + j, 0); g.lineTo(i * s + j, S); g.stroke();
    g.beginPath(); g.moveTo(0, i * s + j); g.lineTo(S, i * s + j); g.stroke();
  }
  // seam highlight (bevel)
  g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 1;
  for (let i = 0; i <= cells; i++) { g.beginPath(); g.moveTo(i * s + 3, 0); g.lineTo(i * s + 3, S); g.stroke(); }
  // hatches / vents
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * S, y = Math.random() * S, w = 14 + Math.random() * 44, h = 8 + Math.random() * 22;
    g.fillStyle = 'rgba(70,70,80,0.5)'; g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(30,30,36,0.8)'; g.lineWidth = 1.5; g.strokeRect(x, y, w, h);
    if (Math.random() < 0.4) { g.fillStyle = 'rgba(25,25,30,0.7)'; for (let k = 2; k < h - 2; k += 4) g.fillRect(x + 3, y + k, w - 6, 1.5); }
  }
  // scuffs
  for (let i = 0; i < 2500; i++) {
    const v = 120 + Math.random() * 90;
    g.fillStyle = `rgba(${v},${v},${v},0.18)`;
    g.fillRect(Math.random() * S, Math.random() * S, 2 + Math.random() * 10, 1 + Math.random() * 2);
  }
  _albedoTex = new THREE.CanvasTexture(c);
  _albedoTex.wrapS = _albedoTex.wrapT = THREE.RepeatWrapping;
  _albedoTex.colorSpace = THREE.SRGBColorSpace;
  _albedoTex.anisotropy = 4;
  return _albedoTex;
}

function roughnessTexture() {
  if (_roughTex) return _roughTex;
  const S = 512, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.fillStyle = '#8c8c8c'; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 6000; i++) {
    const v = 100 + Math.random() * 90;
    g.fillStyle = `rgba(${v},${v},${v},0.3)`;
    g.fillRect(Math.random() * S, Math.random() * S, 3 + Math.random() * 8, 1 + Math.random() * 3);
  }
  g.strokeStyle = 'rgba(235,235,235,0.9)'; g.lineWidth = 3;
  const cells = 5, s = S / cells;
  for (let i = 0; i <= cells; i++) {
    g.beginPath(); g.moveTo(i * s, 0); g.lineTo(i * s, S); g.stroke();
    g.beginPath(); g.moveTo(0, i * s); g.lineTo(S, i * s); g.stroke();
  }
  _roughTex = new THREE.CanvasTexture(c);
  _roughTex.wrapS = _roughTex.wrapT = THREE.RepeatWrapping;
  _roughTex.colorSpace = THREE.NoColorSpace;
  return _roughTex;
}

export function glowSpriteTexture() {
  if (_glowTex) return _glowTex;
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const g = c.getContext('2d');
  const r = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  r.addColorStop(0, 'rgba(255,255,255,1)');
  r.addColorStop(0.18, 'rgba(255,255,255,0.85)');
  r.addColorStop(0.45, 'rgba(255,255,255,0.22)');
  r.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = r; g.fillRect(0, 0, 128, 128);
  _glowTex = new THREE.CanvasTexture(c);
  _glowTex.colorSpace = THREE.SRGBColorSpace;
  return _glowTex;
}

// ---------------------------------------------------------------- materials
export const PALETTE = {
  hull: 0x3f9a4e,      // venom green (saturated, reads lit)
  hullDark: 0x2a5a36,
  accent: 0x7a34d8,    // imperial purple
  trim: 0x4a4f5e,      // gunmetal
  glow: 0xd06cff,      // violet plasma
  eye: 0xb6ff3c,       // acid green
  rim: 0xc070ff,       // fresnel rim
};

/** World scale of every craft (baked into geometry) so they read at rail-shooter distances. */
export const CRAFT_SCALE = 2.6;

/** Stylised fresnel rim (violet from the sky) + hemispheric wrap so backlit hulls still read. */
function addRim(mat, rimColor = PALETTE.rim, strength = 0.9) {
  mat.userData.rim = { value: new THREE.Color(rimColor).multiplyScalar(strength) };
  mat.onBeforeCompile = (shader) => {
    shader.uniforms.uRim = mat.userData.rim;
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform vec3 uRim;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 nv = normalize(vNormal);
          vec3 vv = normalize(vViewPosition);
          float fr = pow(1.0 - clamp(dot(nv, vv), 0.0, 1.0), 3.0);
          float up = clamp(nv.y * 0.5 + 0.5, 0.0, 1.0);
          totalEmissiveRadiance += uRim * fr * (0.55 + 0.45 * up);
          totalEmissiveRadiance += diffuseColor.rgb * 0.06 * (0.4 + 0.6 * up);
        }`);
  };
  mat.customProgramCacheKey = () => 'enemy-rim';
  return mat;
}

export function makeCraftMaterials(glowColor = PALETTE.glow) {
  const alb = albedoTexture(), rough = roughnessTexture();
  const hull = addRim(new THREE.MeshPhysicalMaterial({
    color: PALETTE.hull, map: alb, metalness: 0.3, roughness: 0.48, roughnessMap: rough,
    clearcoat: 0.55, clearcoatRoughness: 0.25, envMapIntensity: 1.1,
    sheen: 0.35, sheenColor: new THREE.Color(0x6a9cff), sheenRoughness: 0.6,
  }));
  const accent = addRim(new THREE.MeshPhysicalMaterial({
    color: PALETTE.accent, map: alb, metalness: 0.4, roughness: 0.32, roughnessMap: rough,
    clearcoat: 0.9, clearcoatRoughness: 0.12, envMapIntensity: 1.5,
  }), 0xd08aff, 0.6);
  const trim = addRim(new THREE.MeshStandardMaterial({ color: PALETTE.trim, map: alb, metalness: 0.85, roughness: 0.38, envMapIntensity: 1.4 }), 0xffc090, 0.5);
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x140a24, metalness: 0.7, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.03,
    emissive: new THREE.Color(glowColor).multiplyScalar(0.35), envMapIntensity: 2.2,
  });
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(glowColor).multiplyScalar(4.5), toneMapped: false });
  return { hull, accent, trim, glass, glow };
}

// ---------------------------------------------------------------- builder kit
class Kit {
  constructor() { this.parts = { hull: [], accent: [], trim: [], glass: [], glow: [] }; this.engines = []; }
  add(slot, geom, { p = [0, 0, 0], r = [0, 0, 0], s = [1, 1, 1] } = {}) {
    const m = new THREE.Matrix4().compose(
      new THREE.Vector3(...p),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(...r)),
      new THREE.Vector3(...s),
    );
    geom.applyMatrix4(m);
    this.parts[slot].push(geom);
    return this;
  }
  mirror(slot, geomFn, opts) {
    this.add(slot, geomFn(), opts);
    const o = { p: [-(opts.p?.[0] ?? 0), opts.p?.[1] ?? 0, opts.p?.[2] ?? 0], r: [opts.r?.[0] ?? 0, -(opts.r?.[1] ?? 0), -(opts.r?.[2] ?? 0)], s: opts.s };
    this.add(slot, geomFn(), o);
    return this;
  }
  engine(x, y, z, size = 0.35) { this.engines.push({ p: new THREE.Vector3(x, y, z), size }); return this; }
  build(mats) {
    const group = new THREE.Group();
    const glowMeshes = [];
    for (const slot of Object.keys(this.parts)) {
      if (!this.parts[slot].length) continue;
      const geoms = this.parts[slot].map((g) => g.index ? g.toNonIndexed() : g);
      for (const g of geoms) { if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2)); }
      const merged = mergeGeometries(geoms, false);
      merged.scale(CRAFT_SCALE, CRAFT_SCALE, CRAFT_SCALE);
      merged.computeVertexNormals();
      geoms.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, mats[slot]);
      mesh.userData.slot = slot;
      mesh.castShadow = mesh.receiveShadow = false;
      group.add(mesh);
      if (slot === 'glow') glowMeshes.push(mesh);
    }
    const tex = glowSpriteTexture();
    for (const e of this.engines) {
      const sm = new THREE.SpriteMaterial({ map: tex, color: mats.glow.color.clone().multiplyScalar(0.25), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 });
      const sp = new THREE.Sprite(sm);
      sp.position.copy(e.p).multiplyScalar(CRAFT_SCALE); sp.scale.setScalar(e.size * 3.6 * CRAFT_SCALE);
      sp.userData.slot = 'engineGlow'; sp.userData.baseScale = e.size * 3.6 * CRAFT_SCALE;
      group.add(sp);
    }
    group.userData.engines = this.engines.map((e) => e.p.clone().multiplyScalar(CRAFT_SCALE));
    group.userData.glowMeshes = glowMeshes;
    return group;
  }
}

const cyl = (rt, rb, h, n = 8) => new THREE.CylinderGeometry(rt, rb, h, n);
const cone = (r, h, n = 8) => new THREE.ConeGeometry(r, h, n);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const sph = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
const torus = (R, r, arc = Math.PI * 2, seg = 24) => new THREE.TorusGeometry(R, r, 8, seg, arc);
/** Tapered slab: a box whose far-X end is narrower/thinner (wing plank). */
function slab(len, rootChord, tipChord, rootT, tipT) {
  const g = new THREE.BoxGeometry(len, 1, 1, 1, 1, 1);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), u = (x + len / 2) / len;
    const ch = THREE.MathUtils.lerp(rootChord, tipChord, u), th = THREE.MathUtils.lerp(rootT, tipT, u);
    p.setY(i, p.getY(i) * th); p.setZ(i, p.getZ(i) * ch);
  }
  g.computeVertexNormals();
  return g;
}
const HX = Math.PI / 2;

// ---------------------------------------------------------------- designs
/** VULTURE — fast interceptor. Thick arrowhead fuselage, big down-swept delta wings, twin engine bells, eye-slit canopy. */
function vulture(k) {
  // fuselage: fat nose wedge -> body -> engine block
  k.add('hull', cyl(0.42, 0.85, 2.6, 6), { p: [0, 0, 0.6], r: [HX, 0, 0], s: [1.25, 1, 0.8] });
  k.add('accent', cone(0.42, 1.8, 6), { p: [0, 0, 2.8], r: [HX, 0, 0], s: [1.25, 1, 0.8] });
  k.add('trim', cyl(0.85, 0.7, 1.4, 6), { p: [0, 0, -1.4], r: [HX, 0, 0], s: [1.25, 1, 0.8] });
  // dorsal spine + intake
  k.add('accent', box(0.5, 0.42, 3.0), { p: [0, 0.6, 0.2] });
  k.add('glow', box(0.12, 0.08, 2.2), { p: [0, 0.83, 0.3] });
  // eye-slit canopy
  k.add('glass', sph(0.5, 14, 10), { p: [0, 0.55, 1.5], s: [1.1, 0.5, 1.6] });
  // big down-swept delta wings
  k.mirror('hull', () => slab(3.4, 2.2, 0.7, 0.34, 0.12), { p: [2.2, -0.35, -0.2], r: [0, -0.28, 0.22] });
  k.mirror('accent', () => slab(3.2, 0.5, 0.25, 0.4, 0.16), { p: [2.1, -0.3, 0.95], r: [0, -0.28, 0.22] });
  // leading-edge glow strips
  k.mirror('glow', () => box(3.0, 0.06, 0.1), { p: [2.1, -0.28, 1.14], r: [0, -0.28, 0.22] });
  // wingtip cannon pods
  k.mirror('trim', () => cyl(0.26, 0.32, 2.0, 8), { p: [3.7, -0.75, 0.4], r: [HX, 0, 0] });
  k.mirror('glow', () => cyl(0.16, 0.2, 0.3, 8), { p: [3.7, -0.75, 1.42], r: [HX, 0, 0] });
  // twin tail fins (canted)
  k.mirror('hull', () => slab(1.5, 1.4, 0.5, 0.12, 0.06), { p: [0.65, 0.9, -1.4], r: [0, 0, 1.05] });
  k.mirror('glow', () => box(0.04, 1.2, 0.08), { p: [0.9, 1.45, -1.9], r: [0, 0, -0.5] });
  // twin engine bells
  k.mirror('trim', () => cyl(0.36, 0.48, 0.8, 10), { p: [0.55, -0.05, -2.3], r: [HX, 0, 0] });
  k.mirror('glow', () => cyl(0.26, 0.26, 0.12, 10), { p: [0.55, -0.05, -2.68], r: [HX, 0, 0] });
  k.engine(0.55, -0.05, -2.8, 0.5).engine(-0.55, -0.05, -2.8, 0.5);
  return { radius: 3.0, hp: 3 };
}

/** HORNET — insectoid drone. Fat segmented body, bulbous head with big acid eyes, four blade wings, hanging legs, stinger engine. */
function hornet(k) {
  // thorax / abdomen / head
  k.add('hull', sph(0.95, 18, 14), { p: [0, 0, 0.2], s: [1, 0.85, 1.2] });
  k.add('accent', sph(0.8, 16, 12), { p: [0, -0.2, -1.7], s: [1, 0.85, 1.7] });
  k.add('hull', sph(0.68, 16, 12), { p: [0, 0.1, 1.5], s: [1.15, 0.9, 1] });
  // abdomen stripes (glow rings) + armour plates
  for (let i = 0; i < 3; i++) k.add('glow', torus(0.72 - i * 0.12, 0.06, Math.PI * 2, 24), { p: [0, -0.2, -1.3 - i * 0.65] });
  k.mirror('trim', () => box(0.5, 0.25, 1.2), { p: [0.6, 0.55, 0.1], r: [0, 0, -0.5] });
  // eyes (big, bulging)
  k.mirror('glow', () => sph(0.3, 12, 10), { p: [0.42, 0.28, 1.85], s: [1, 0.85, 1.1] });
  // mandibles / cannons
  k.mirror('trim', () => cone(0.13, 1.6, 6), { p: [0.5, -0.25, 2.6], r: [HX + 0.12, 0, 0.35] });
  k.mirror('glow', () => sph(0.1, 8, 6), { p: [0.35, -0.42, 3.3] });
  // blade wings (2 pairs), thick at root
  k.mirror('accent', () => slab(4.0, 0.7, 0.35, 0.16, 0.05), { p: [2.3, 0.5, 0.5], r: [0, 0.3, 0.2] });
  k.mirror('accent', () => slab(3.4, 0.6, 0.3, 0.14, 0.05), { p: [2.0, 0.45, -0.5], r: [0, -0.45, 0.16] });
  k.mirror('glow', () => box(3.6, 0.05, 0.1), { p: [2.2, 0.52, 0.8], r: [0, 0.3, 0.2] });
  k.mirror('glow', () => box(3.0, 0.05, 0.1), { p: [1.9, 0.47, -0.75], r: [0, -0.45, 0.16] });
  // legs
  for (let i = 0; i < 3; i++) {
    k.mirror('trim', () => cyl(0.06, 0.09, 1.3, 5), { p: [0.75, -0.8, 0.9 - i * 0.6], r: [0.35, 0, 0.8] });
  }
  // stinger engine
  k.add('trim', cone(0.3, 1.0, 8), { p: [0, -0.25, -3.3], r: [-HX, 0, 0] });
  k.add('glow', sph(0.2, 10, 8), { p: [0, -0.25, -3.35] });
  k.engine(0, -0.25, -3.5, 0.5);
  return { radius: 3.0, hp: 2 };
}

/** MANTIS — heavy gunship. Thick crescent wing, armoured pod, twin forward claws, triple thrusters. */
function mantis(k) {
  // central pod
  k.add('hull', cyl(0.8, 1.2, 3.0, 8), { p: [0, 0, 0], r: [HX, 0, 0], s: [1.2, 1, 0.9] });
  k.add('accent', cone(0.8, 1.8, 8), { p: [0, 0, 2.4], r: [HX, 0, 0], s: [1.2, 1, 0.9] });
  k.add('trim', cyl(1.2, 1.0, 1.0, 8), { p: [0, 0, -2.0], r: [HX, 0, 0], s: [1.2, 1, 0.9] });
  k.add('glass', sph(0.5, 14, 10), { p: [0, 0.75, 0.9], s: [1, 0.6, 1.6] });
  k.add('glow', box(1.4, 0.1, 0.1), { p: [0, 0.35, 3.0] });
  // thick crescent wing, opening rearward
  k.add('hull', torus(3.4, 0.55, Math.PI, 40), { p: [0, 0, -0.8], r: [HX, 0, 0], s: [1, 1, 0.5] });
  k.add('glow', torus(3.4, 0.09, Math.PI * 0.92, 40), { p: [0, 0.28, -0.8], r: [HX, 0, Math.PI * 0.04] });
  k.add('glow', torus(3.4, 0.09, Math.PI * 0.92, 40), { p: [0, -0.28, -0.8], r: [HX, 0, Math.PI * 0.04] });
  // armour plates on wing shoulders
  k.mirror('accent', () => box(1.4, 0.35, 1.2), { p: [2.1, 0.1, 1.2], r: [0, 0.6, 0] });
  k.mirror('trim', () => box(0.7, 0.5, 0.7), { p: [3.3, 0, 0.2] });
  // claws at wing tips
  k.mirror('trim', () => cone(0.22, 2.6, 6), { p: [3.55, -0.1, 1.2], r: [HX, 0, 0.08] });
  k.mirror('glow', () => sph(0.16, 8, 6), { p: [3.6, -0.1, 2.5] });
  // top + bottom fins
  k.add('hull', slab(1.6, 1.8, 0.7, 0.16, 0.06), { p: [0, 1.4, -1.4], r: [0, 0, HX] });
  k.add('accent', slab(1.0, 1.4, 0.6, 0.14, 0.06), { p: [0, -1.1, -1.4], r: [0, 0, -HX] });
  // thrusters
  const th = [[0, 0.45], [0.6, -0.35], [-0.6, -0.35]];
  for (const [x, y] of th) {
    k.add('trim', cyl(0.32, 0.4, 0.7, 10), { p: [x, y, -2.7], r: [HX, 0, 0] });
    k.add('glow', cyl(0.22, 0.22, 0.12, 10), { p: [x, y, -3.03], r: [HX, 0, 0] });
    k.engine(x, y, -3.15, 0.5);
  }
  return { radius: 3.8, hp: 5 };
}

export const CRAFT_KINDS = ['vulture', 'hornet', 'mantis'];
const BUILDERS = { vulture, hornet, mantis };

/**
 * Build a fresh craft with its own material set (so per-instance damage flash works).
 * @param {string} kind
 * @param {{ glowColor?: number, mats?: object }} opts
 */
export function buildEnemyCraft(kind = 'vulture', opts = {}) {
  const fn = BUILDERS[kind] ?? vulture;
  const glowColor = opts.glowColor ?? (kind === 'hornet' ? PALETTE.eye : kind === 'mantis' ? 0xffb040 : PALETTE.glow);
  const mats = opts.mats ?? makeCraftMaterials(glowColor);
  const kit = new Kit();
  const info = fn(kit);
  const group = kit.build(mats);
  Object.assign(group.userData, info, { kind, mats, glowColor, flashMats: [mats.hull, mats.accent, mats.trim] });
  group.userData.radius = info.radius * CRAFT_SCALE;
  return group;
}

export function disposeCraft(group) {
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.isSprite) o.material.dispose();
  });
  Object.values(group.userData.mats ?? {}).forEach((m) => m.dispose());
}
