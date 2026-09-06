/**
 * Procedural Venomian-style enemy fighters.
 * Three distinct designs, all built from merged primitives with 5 shared
 * material slots (hull / accent / trim / glass / glow). Craft face +Z.
 *
 *   buildEnemyCraft('vulture' | 'hornet' | 'mantis') -> Group
 *     group.userData = { kind, radius, hp, engines:[Vector3], glowMeshes:[Mesh], flashMats:[Material] }
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------- textures
let _panelTex = null, _glowTex = null;
function panelTexture() {
  if (_panelTex) return _panelTex;
  const c = document.createElement('canvas'); c.width = c.height = 512;
  const g = c.getContext('2d');
  g.fillStyle = '#8c8c8c'; g.fillRect(0, 0, 512, 512);
  // subtle noise / grime
  for (let i = 0; i < 6000; i++) {
    const v = 110 + Math.random() * 60;
    g.fillStyle = `rgba(${v},${v},${v},0.25)`;
    g.fillRect(Math.random() * 512, Math.random() * 512, 3 + Math.random() * 8, 1 + Math.random() * 3);
  }
  // panel lines (rough = darker in roughness map -> we invert: lines brighter = rougher edges)
  g.strokeStyle = 'rgba(230,230,230,0.9)'; g.lineWidth = 2;
  const cells = 6, s = 512 / cells;
  for (let i = 0; i <= cells; i++) {
    g.beginPath(); g.moveTo(i * s + (Math.random() - 0.5) * 10, 0); g.lineTo(i * s + (Math.random() - 0.5) * 10, 512); g.stroke();
    g.beginPath(); g.moveTo(0, i * s + (Math.random() - 0.5) * 10); g.lineTo(512, i * s + (Math.random() - 0.5) * 10); g.stroke();
  }
  // rivets & hatches
  for (let i = 0; i < 90; i++) {
    const x = Math.random() * 512, y = Math.random() * 512, w = 12 + Math.random() * 40, h = 6 + Math.random() * 20;
    g.strokeStyle = 'rgba(210,210,210,0.7)'; g.lineWidth = 1.5; g.strokeRect(x, y, w, h);
    g.fillStyle = 'rgba(60,60,60,0.35)'; g.fillRect(x + 2, y + 2, w - 4, h - 4);
  }
  _panelTex = new THREE.CanvasTexture(c);
  _panelTex.wrapS = _panelTex.wrapT = THREE.RepeatWrapping;
  _panelTex.colorSpace = THREE.NoColorSpace;
  return _panelTex;
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
  hull: 0x2a4a33,      // dark venom green
  hullDark: 0x1a2d22,
  accent: 0x4b1e78,    // imperial purple
  trim: 0x2c3038,      // gunmetal
  glow: 0xc45cff,      // violet plasma
  eye: 0xb6ff3c,       // acid green
};

export function makeCraftMaterials(glowColor = PALETTE.glow) {
  const tex = panelTexture();
  const hull = new THREE.MeshPhysicalMaterial({
    color: PALETTE.hull, metalness: 0.55, roughness: 0.5, roughnessMap: tex,
    clearcoat: 0.55, clearcoatRoughness: 0.25, envMapIntensity: 1.1,
  });
  const accent = new THREE.MeshPhysicalMaterial({
    color: PALETTE.accent, metalness: 0.65, roughness: 0.32, roughnessMap: tex,
    clearcoat: 0.9, clearcoatRoughness: 0.12, envMapIntensity: 1.3,
  });
  const trim = new THREE.MeshStandardMaterial({ color: PALETTE.trim, metalness: 0.95, roughness: 0.38, envMapIntensity: 1.2 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x0c0616, metalness: 0.9, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.03,
    emissive: new THREE.Color(glowColor).multiplyScalar(0.12), envMapIntensity: 2,
  });
  const glow = new THREE.MeshStandardMaterial({
    color: 0x000000, emissive: glowColor, emissiveIntensity: 5, roughness: 1, metalness: 0,
  });
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
    // add part and its X-mirror
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
      const merged = mergeGeometries(geoms, false);
      geoms.forEach((g) => g.dispose());
      const mesh = new THREE.Mesh(merged, mats[slot]);
      mesh.userData.slot = slot;
      mesh.castShadow = mesh.receiveShadow = false;
      group.add(mesh);
      if (slot === 'glow') glowMeshes.push(mesh);
    }
    // engine glow sprites
    const tex = glowSpriteTexture();
    for (const e of this.engines) {
      const sm = new THREE.SpriteMaterial({ map: tex, color: mats.glow.emissive, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.9 });
      const sp = new THREE.Sprite(sm);
      sp.position.copy(e.p); sp.scale.setScalar(e.size * 3.2);
      sp.userData.slot = 'engineGlow'; sp.userData.baseScale = e.size * 3.2;
      group.add(sp);
    }
    group.userData.engines = this.engines.map((e) => e.p);
    group.userData.glowMeshes = glowMeshes;
    return group;
  }
}

const cyl = (rt, rb, h, n = 8) => new THREE.CylinderGeometry(rt, rb, h, n);
const cone = (r, h, n = 8) => new THREE.ConeGeometry(r, h, n);
const box = (w, h, d) => new THREE.BoxGeometry(w, h, d);
const sph = (r, w = 16, h = 12) => new THREE.SphereGeometry(r, w, h);
const torus = (R, r, arc = Math.PI * 2, seg = 24) => new THREE.TorusGeometry(R, r, 8, seg, arc);
const HX = Math.PI / 2;

// ---------------------------------------------------------------- designs
/** VULTURE — fast interceptor. Arrowhead fuselage, forward-swept blade wings, twin plasma pods. */
function vulture(k) {
  // fuselage (axis +Z)
  k.add('hull', cyl(0.28, 0.62, 3.0, 6), { p: [0, 0, 0.4], r: [HX, 0, 0] });
  k.add('hull', cone(0.28, 1.6, 6), { p: [0, 0, 2.7], r: [HX, 0, 0] });
  k.add('accent', cyl(0.62, 0.45, 1.1, 6), { p: [0, 0, -1.6], r: [HX, 0, 0] });
  // spine ridge
  k.add('accent', box(0.18, 0.28, 2.6), { p: [0, 0.5, 0.3] });
  // canopy
  k.add('glass', sph(0.36, 14, 10), { p: [0, 0.42, 1.25], s: [0.8, 0.7, 1.6] });
  // forward-swept wings
  k.mirror('hull', () => box(2.6, 0.07, 0.9), { p: [1.55, -0.05, 0.35], r: [0, -0.5, -0.12] });
  k.mirror('accent', () => box(2.4, 0.11, 0.22), { p: [1.5, -0.03, 0.9], r: [0, -0.5, -0.12] });
  // wingtip pods + glow caps
  k.mirror('trim', () => cyl(0.16, 0.2, 1.4, 8), { p: [2.75, -0.2, 1.05], r: [HX, 0, 0] });
  k.mirror('glow', () => cyl(0.1, 0.16, 0.25, 8), { p: [2.75, -0.2, 1.8], r: [HX, 0, 0] });
  k.mirror('glow', () => box(1.7, 0.035, 0.08), { p: [1.6, 0.02, 1.02], r: [0, -0.5, -0.12] });
  // tail fins
  k.mirror('hull', () => box(0.06, 0.9, 0.8), { p: [0.35, 0.55, -1.5], r: [0, 0, 0.5] });
  // engines
  k.mirror('trim', () => cyl(0.24, 0.3, 0.5, 8), { p: [0.32, -0.05, -2.25], r: [HX, 0, 0] });
  k.mirror('glow', () => cyl(0.14, 0.14, 0.1, 8), { p: [0.32, -0.05, -2.48], r: [HX, 0, 0] });
  k.engine(0.32, -0.05, -2.6, 0.32).engine(-0.32, -0.05, -2.6, 0.32);
  return { radius: 2.4, hp: 3 };
}

/** HORNET — insectoid drone. Segmented body, dragonfly blade wings, dangling legs, acid-green eyes. */
function hornet(k) {
  // thorax / abdomen / head
  k.add('hull', sph(0.7, 16, 12), { p: [0, 0, 0.2], s: [1, 0.8, 1.15] });
  k.add('accent', sph(0.55, 14, 10), { p: [0, -0.15, -1.35], s: [1, 0.85, 1.9] });
  k.add('hull', sph(0.42, 14, 10), { p: [0, 0.05, 1.25], s: [1.1, 0.85, 1] });
  // abdomen glow rings
  for (let i = 0; i < 3; i++) k.add('glow', torus(0.5 - i * 0.08, 0.035, Math.PI * 2, 20), { p: [0, -0.15, -1.2 - i * 0.55] });
  // eyes
  k.mirror('glow', () => sph(0.16, 10, 8), { p: [0.26, 0.15, 1.55], s: [1, 0.8, 1.2] });
  // mandibles
  k.mirror('trim', () => cone(0.07, 1.1, 6), { p: [0.32, -0.15, 2.0], r: [HX + 0.15, 0, 0.28] });
  // dragonfly blade wings (2 pairs)
  k.mirror('accent', () => box(2.9, 0.05, 0.42), { p: [1.55, 0.35, 0.35], r: [0, 0.32, 0.18] });
  k.mirror('accent', () => box(2.5, 0.05, 0.36), { p: [1.35, 0.32, -0.35], r: [0, -0.42, 0.14] });
  k.mirror('glow', () => box(2.6, 0.03, 0.06), { p: [1.5, 0.37, 0.52], r: [0, 0.32, 0.18] });
  k.mirror('glow', () => box(2.2, 0.03, 0.06), { p: [1.3, 0.34, -0.5], r: [0, -0.42, 0.14] });
  // legs
  for (let i = 0; i < 3; i++) {
    k.mirror('trim', () => cyl(0.03, 0.05, 0.9, 5), { p: [0.55, -0.55, 0.7 - i * 0.5], r: [0.35, 0, 0.75] });
  }
  // stinger engine
  k.add('trim', cone(0.18, 0.7, 8), { p: [0, -0.2, -2.6], r: [-HX, 0, 0] });
  k.add('glow', sph(0.12, 8, 6), { p: [0, -0.2, -2.55] });
  k.engine(0, -0.2, -2.7, 0.3);
  return { radius: 2.3, hp: 2 };
}

/** MANTIS — heavy gunship. Crescent wing, armoured pod, twin forward claws, triple thrusters. */
function mantis(k) {
  // central pod
  k.add('hull', cyl(0.55, 0.9, 2.6, 8), { p: [0, 0, 0], r: [HX, 0, 0] });
  k.add('accent', cone(0.55, 1.4, 8), { p: [0, 0, 2.0], r: [HX, 0, 0] });
  k.add('accent', cyl(0.9, 0.7, 0.8, 8), { p: [0, 0, -1.7], r: [HX, 0, 0] });
  k.add('glass', sph(0.34, 14, 10), { p: [0, 0.55, 0.7], s: [1, 0.6, 1.5] });
  // crescent wing lying flat, opening rearward
  k.add('hull', torus(2.6, 0.3, Math.PI, 40), { p: [0, 0, -0.6], r: [HX, 0, 0], s: [1, 1, 0.55] });
  k.add('glow', torus(2.62, 0.06, Math.PI * 0.9, 40), { p: [0, 0.16, -0.6], r: [HX, 0, Math.PI * 0.05] });
  // armour plates on wing
  k.mirror('accent', () => box(0.9, 0.16, 0.7), { p: [1.7, 0.08, 1.05], r: [0, 0.6, 0] });
  // claws at wing tips
  k.mirror('trim', () => cone(0.13, 1.8, 6), { p: [2.75, 0, 0.3], r: [HX, 0, 0.1] });
  k.mirror('glow', () => sph(0.1, 8, 6), { p: [2.8, 0, 1.15] });
  // top fin
  k.add('hull', box(0.08, 0.9, 1.2), { p: [0, 0.9, -1.0], r: [0.25, 0, 0] });
  // thrusters
  const th = [[0, 0.35], [0.45, -0.25], [-0.45, -0.25]];
  for (const [x, y] of th) {
    k.add('trim', cyl(0.22, 0.28, 0.5, 8), { p: [x, y, -2.25], r: [HX, 0, 0] });
    k.add('glow', cyl(0.13, 0.13, 0.1, 8), { p: [x, y, -2.48], r: [HX, 0, 0] });
    k.engine(x, y, -2.6, 0.3);
  }
  return { radius: 3.0, hp: 5 };
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
  const glowColor = opts.glowColor ?? (kind === 'hornet' ? PALETTE.eye : PALETTE.glow);
  const mats = opts.mats ?? makeCraftMaterials(glowColor);
  const kit = new Kit();
  const info = fn(kit);
  const group = kit.build(mats);
  Object.assign(group.userData, info, { kind, mats, glowColor, flashMats: [mats.hull, mats.accent, mats.trim] });
  return group;
}

export function disposeCraft(group) {
  group.traverse((o) => {
    if (o.geometry) o.geometry.dispose();
    if (o.isSprite) o.material.dispose();
  });
  Object.values(group.userData.mats ?? {}).forEach((m) => m.dispose());
}
