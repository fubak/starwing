/**
 * Procedural Venomian-style enemy fighters.
 * Three distinct chunky designs, all built from merged primitives with shared
 * material slots (core / hull / accent / trim / glass / glow). Craft face +Z.
 *
 * Surfaces are NOT uv-textured (merged primitives have garbage uvs); instead every
 * hull material runs an object-space triplanar panel shader: recessed seams, plate
 * tone variation, rivets, colour-blocked stripes + wingtip bands, roughness breakup,
 * violet fresnel rim. This is what makes them read as sculpted metal, not blockout.
 *
 *   buildEnemyCraft('vulture' | 'hornet' | 'mantis') -> Group
 *     group.userData = { kind, radius, hp, engines:[Vector3], glowMeshes:[Mesh], flashMats:[Material] }
 */
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------- textures
let _glowTex = null;

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
  hull: 0x2b7a3c,      // venom green (deep, saturated)
  hullStripe: 0x5a22b8, // purple colour-block band on green
  accent: 0x4a1a9c,    // imperial purple
  accentStripe: 0xe8dcc0, // bone-white band on purple
  trim: 0x3a3e4c,      // gunmetal
  trimStripe: 0xe06a20, // hazard orange on gunmetal
  core: 0x1c1826,      // near-black violet fuselage core
  coreStripe: 0x3a1c5a,
  glow: 0xd06cff,      // violet plasma
  eye: 0xb6ff3c,       // acid green
  rim: 0xa070ff,       // fresnel rim
};

/** World scale of every craft (baked into geometry) so they read at rail-shooter distances. */
export const CRAFT_SCALE = 2.9;

const PANEL_GLSL = /* glsl */`
uniform vec3 uRim; uniform vec3 uStripe; uniform vec4 uStripeP; /* z-centre, half-width, tipX, panelScale */
uniform float uCoreDark;
varying vec3 vObj; varying vec3 vObjN;
float ehash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
/* returns (seam, plateTone, rivet) for one projection */
vec3 panelLayer(vec2 p){
  vec2 cell = floor(p);
  // per-cell jitter of the seam position so the grid does not read as graph paper
  vec2 j = (vec2(ehash(cell), ehash(cell+7.3)) - 0.5) * 0.18;
  vec2 f = fract(p) - j;
  vec2 g = abs(f - 0.5);
  float d = 0.5 - max(g.x, g.y);                // distance to nearest cell edge
  float w = fwidth(d) * 1.2 + 0.006;
  float seam = 1.0 - smoothstep(0.018, 0.018 + w, d);
  // some cells get a secondary sub-panel line
  float sub = step(0.55, ehash(cell + 3.1));
  float ds = abs(f.x - 0.5 - (ehash(cell+9.0)-0.5)*0.6);
  seam = max(seam, sub * (1.0 - smoothstep(0.008, 0.008 + w, ds)) * 0.7);
  float tone = ehash(cell + 1.7);
  // rivets at cell corners, inset
  vec2 rc = abs(fract(p + 0.5 + j) - 0.5);      // corner-centred cell
  float rd = length(rc) ;
  float rivet = 1.0 - smoothstep(0.035, 0.035 + w * 1.5, rd - 0.045);
  rivet *= step(0.3, ehash(cell + 5.5));
  return vec3(seam, tone, rivet);
}
`;

/**
 * Sculpted-panel shader injection for hull materials. Object-space triplanar:
 * seams darken albedo + raise roughness, plates vary tone, rivets catch spec,
 * stripes colour-block by z band + wingtip, violet fresnel rim.
 */
function addPanels(mat, { stripe, stripeZ = 0, stripeW = 0, tipX = 99, panel = 0.55, rim = PALETTE.rim, rimStrength = 0.6, coreDark = 0 } = {}) {
  const u = {
    uRim: { value: new THREE.Color(rim).multiplyScalar(rimStrength) },
    uStripe: { value: new THREE.Color(stripe ?? 0xffffff) },
    uStripeP: { value: new THREE.Vector4(stripeZ, stripeW, tipX, panel) },
    uCoreDark: { value: coreDark },
  };
  mat.userData.panels = u;
  mat.onBeforeCompile = (shader) => {
    Object.assign(shader.uniforms, u);
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vObj; varying vec3 vObjN;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position; vObjN = normal;');
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\n' + PANEL_GLSL + '\nfloat gSeam = 0.0; float gTone = 0.5; float gRivet = 0.0;')
      .replace('#include <map_fragment>', `#include <map_fragment>
        {
          vec3 an = abs(normalize(vObjN)); an = pow(an, vec3(6.0)); an /= (an.x + an.y + an.z);
          float ps = uStripeP.w;
          vec3 lx = panelLayer(vObj.zy * ps + 0.31), ly = panelLayer(vObj.xz * ps + 0.77), lz = panelLayer(vObj.xy * ps + 0.13);
          vec3 L = lx * an.x + ly * an.y + lz * an.z;
          gSeam = L.x; gTone = L.y; gRivet = L.z;
          vec3 col = diffuseColor.rgb;
          // colour blocking: band across z + wingtip band, both with a crisp aa edge
          float bw = fwidth(vObj.z) + 0.02;
          float band = (uStripeP.y > 0.0) ? 1.0 - smoothstep(uStripeP.y, uStripeP.y + bw, abs(vObj.z - uStripeP.x)) : 0.0;
          float tip = smoothstep(uStripeP.z, uStripeP.z + 0.25, abs(vObj.x));
          float blk = max(band, tip);
          col = mix(col, uStripe, blk);
          // plate tone: subtle per-panel value shift
          col *= 0.86 + 0.28 * gTone;
          // darker toward the belly / underside so the hull reads volumetric
          float up = clamp(normalize(vObjN).y * 0.5 + 0.5, 0.0, 1.0);
          col *= 0.84 + 0.16 * up;
          // recessed seams: dark, with a faint bevel highlight at the top edge
          col *= 1.0 - gSeam * 0.78;
          col += gRivet * 0.16;
          diffuseColor.rgb = col;
        }`)
      .replace('#include <roughnessmap_fragment>', `#include <roughnessmap_fragment>
        roughnessFactor = clamp(roughnessFactor + gSeam * 0.45 + (gTone - 0.5) * 0.18 - gRivet * 0.25, 0.04, 1.0);`)
      .replace('#include <metalnessmap_fragment>', `#include <metalnessmap_fragment>
        metalnessFactor = clamp(metalnessFactor - gSeam * 0.4, 0.0, 1.0);`)
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        {
          vec3 nv = normalize(vNormal);
          vec3 vv = normalize(vViewPosition);
          float fr = pow(1.0 - clamp(dot(nv, vv), 0.0, 1.0), 3.5);
          float up = clamp(nv.y * 0.5 + 0.5, 0.0, 1.0);
          totalEmissiveRadiance += uRim * fr * (0.5 + 0.5 * up) * (1.0 - gSeam);
        }`);
  };
  mat.customProgramCacheKey = () => 'enemy-panels';
  return mat;
}

export function makeCraftMaterials(glowColor = PALETTE.glow, style = {}) {
  const st = { stripeZ: 2.0, stripeW: 0.9, tipX: 9.5, ...style };
  const core = addPanels(new THREE.MeshPhysicalMaterial({
    color: PALETTE.core, metalness: 0.6, roughness: 0.34, clearcoat: 0.5, clearcoatRoughness: 0.2, envMapIntensity: 1.4,
  }), { stripe: PALETTE.coreStripe, stripeZ: st.stripeZ * 0.5, stripeW: 0.5, panel: 0.6, rim: 0x8a60ff, rimStrength: 0.5 });
  const hull = addPanels(new THREE.MeshPhysicalMaterial({
    color: PALETTE.hull, metalness: 0.55, roughness: 0.38, clearcoat: 0.45, clearcoatRoughness: 0.22, envMapIntensity: 1.1,
  }), { stripe: PALETTE.hullStripe, stripeZ: st.stripeZ, stripeW: st.stripeW, tipX: st.tipX, panel: 0.4 });
  const accent = addPanels(new THREE.MeshPhysicalMaterial({
    color: PALETTE.accent, metalness: 0.5, roughness: 0.3, clearcoat: 0.7, clearcoatRoughness: 0.15, envMapIntensity: 1.3,
  }), { stripe: PALETTE.accentStripe, stripeZ: st.stripeZ + 1.6, stripeW: 0.35, tipX: st.tipX + 0.8, panel: 0.45, rim: 0xd08aff, rimStrength: 0.5 });
  const trim = addPanels(new THREE.MeshStandardMaterial({
    color: PALETTE.trim, metalness: 0.9, roughness: 0.34, envMapIntensity: 1.4,
  }), { stripe: PALETTE.trimStripe, stripeZ: -99, stripeW: 0, tipX: 99, panel: 0.75, rim: 0xffb080, rimStrength: 0.45 });
  const glass = new THREE.MeshPhysicalMaterial({
    color: 0x0a0614, metalness: 0.6, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.03,
    emissive: new THREE.Color(glowColor).multiplyScalar(0.28), envMapIntensity: 2.4,
  });
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(glowColor).multiplyScalar(2.6), toneMapped: false });
  return { core, hull, accent, trim, glass, glow };
}

// ---------------------------------------------------------------- builder kit
class Kit {
  constructor() { this.parts = { core: [], hull: [], accent: [], trim: [], glass: [], glow: [] }; this.engines = []; }
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
      for (const g of geoms) {
        if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
        for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      }
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
      const sm = new THREE.SpriteMaterial({ map: tex, color: mats.glow.color.clone().multiplyScalar(0.3), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.85 });
      const sp = new THREE.Sprite(sm);
      sp.position.copy(e.p).multiplyScalar(CRAFT_SCALE); sp.scale.setScalar(e.size * 3.2 * CRAFT_SCALE);
      sp.userData.slot = 'engineGlow'; sp.userData.baseScale = e.size * 3.2 * CRAFT_SCALE;
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
/** Wing: a slab with a raised centre spar (diamond section) so it catches light on two planes. */
function wing(len, rootChord, tipChord, rootT, tipT) {
  const g = new THREE.BoxGeometry(len, 1, 1, 1, 2, 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const x = p.getX(i), u = (x + len / 2) / len, y = p.getY(i), z = p.getZ(i);
    const ch = THREE.MathUtils.lerp(rootChord, tipChord, u), th = THREE.MathUtils.lerp(rootT, tipT, u);
    // centre-line verts (z==0) bulge out to make a ridge
    const ridge = Math.abs(z) < 1e-4 ? 1.9 : 1.0;
    p.setY(i, y * th * ridge); p.setZ(i, z * ch);
  }
  g.computeVertexNormals();
  return g;
}
const HX = Math.PI / 2;

// ---------------------------------------------------------------- designs
/** VULTURE — fast interceptor. Dark armoured core, big down-swept green delta wings with purple bands, twin engine bells, eye-slit canopy. */
function vulture(k) {
  // fuselage core: dark, faceted, with a raised dorsal spine
  k.add('core', cyl(0.46, 0.9, 2.6, 6), { p: [0, 0, 0.6], r: [HX, 0, 0], s: [1.3, 1, 0.85] });
  k.add('core', cone(0.46, 1.9, 6), { p: [0, 0, 2.85], r: [HX, 0, 0], s: [1.3, 1, 0.85] });
  k.add('trim', cyl(0.9, 0.72, 1.4, 6), { p: [0, 0, -1.4], r: [HX, 0, 0], s: [1.3, 1, 0.85] });
  k.add('accent', cone(0.2, 0.9, 6), { p: [0, 0, 4.2], r: [HX, 0, 0] });                 // nose spike
  // dorsal spine + intake cheeks
  k.add('accent', box(0.55, 0.45, 3.2), { p: [0, 0.62, 0.1] });
  k.mirror('trim', () => box(0.4, 0.5, 1.6), { p: [0.62, 0.05, 0.9], r: [0, 0, 0.3] });    // intake cheeks
  k.mirror('core', () => box(0.28, 0.32, 0.1), { p: [0.66, 0.08, 1.72], r: [0, 0, 0.3] }); // intake mouths (dark)
  k.add('glow', box(0.12, 0.08, 2.2), { p: [0, 0.87, 0.3] });
  // eye-slit canopy
  k.add('glass', sph(0.5, 14, 10), { p: [0, 0.6, 1.5], s: [1.1, 0.5, 1.6] });
  // big down-swept delta wings (ridged) + leading edge armour
  k.mirror('hull', () => wing(3.5, 2.3, 0.7, 0.36, 0.12), { p: [2.25, -0.35, -0.2], r: [0, -0.28, 0.22] });
  k.mirror('accent', () => slab(3.3, 0.5, 0.25, 0.44, 0.16), { p: [2.15, -0.3, 0.98], r: [0, -0.28, 0.22] });
  k.mirror('trim', () => box(1.2, 0.18, 1.0), { p: [1.25, -0.02, -0.4], r: [0, -0.28, 0.22] });   // wing-root armour plate
  k.mirror('glow', () => box(3.0, 0.06, 0.1), { p: [2.1, -0.28, 1.18], r: [0, -0.28, 0.22] });
  // wingtip cannon pods
  k.mirror('trim', () => cyl(0.28, 0.34, 2.1, 8), { p: [3.8, -0.78, 0.4], r: [HX, 0, 0] });
  k.mirror('core', () => cyl(0.2, 0.3, 0.5, 8), { p: [3.8, -0.78, -0.75], r: [HX, 0, 0] });
  k.mirror('glow', () => cyl(0.16, 0.2, 0.3, 8), { p: [3.8, -0.78, 1.48], r: [HX, 0, 0] });
  // twin tail fins (canted)
  k.mirror('hull', () => slab(1.5, 1.4, 0.5, 0.14, 0.06), { p: [0.65, 0.92, -1.4], r: [0, 0, 1.05] });
  k.mirror('glow', () => box(0.04, 1.2, 0.08), { p: [0.9, 1.47, -1.9], r: [0, 0, -0.5] });
  // twin engine bells with dark throats
  k.mirror('trim', () => cyl(0.38, 0.5, 0.8, 10), { p: [0.58, -0.05, -2.3], r: [HX, 0, 0] });
  k.mirror('core', () => cyl(0.3, 0.42, 0.2, 10), { p: [0.58, -0.05, -2.62], r: [HX, 0, 0] });
  k.mirror('glow', () => cyl(0.24, 0.24, 0.12, 10), { p: [0.58, -0.05, -2.7], r: [HX, 0, 0] });
  k.engine(0.58, -0.05, -2.82, 0.5).engine(-0.58, -0.05, -2.82, 0.5);
  return { radius: 3.1, hp: 3, style: { stripeZ: -0.9, stripeW: 0.7, tipX: 9.6 } };
}

/** HORNET — insectoid drone. Dark segmented abdomen, armoured thorax, bulbous head with acid eyes, four blade wings, hanging legs, stinger engine. */
function hornet(k) {
  // thorax (green armour) / abdomen (dark core with glow rings) / head (purple)
  k.add('hull', sph(0.98, 18, 14), { p: [0, 0, 0.2], s: [1, 0.85, 1.2] });
  k.add('core', sph(0.82, 16, 12), { p: [0, -0.2, -1.7], s: [1, 0.85, 1.7] });
  k.add('accent', sph(0.7, 16, 12), { p: [0, 0.1, 1.5], s: [1.15, 0.9, 1] });
  // abdomen segment rings (trim bands) + glow between
  for (let i = 0; i < 3; i++) {
    k.add('trim', torus(0.74 - i * 0.12, 0.09, Math.PI * 2, 24), { p: [0, -0.2, -1.05 - i * 0.65] });
    k.add('glow', torus(0.7 - i * 0.12, 0.05, Math.PI * 2, 24), { p: [0, -0.2, -1.35 - i * 0.65] });
  }
  // thorax armour plates
  k.mirror('trim', () => box(0.55, 0.28, 1.3), { p: [0.62, 0.55, 0.1], r: [0, 0, -0.5] });
  k.add('trim', box(0.5, 0.2, 1.4), { p: [0, 0.85, 0.1] });
  k.add('glow', box(0.1, 0.06, 1.2), { p: [0, 0.96, 0.1] });
  // eyes (big, bulging) with dark sockets
  k.mirror('core', () => sph(0.36, 12, 10), { p: [0.42, 0.28, 1.78], s: [1, 0.9, 1] });
  k.mirror('glow', () => sph(0.3, 12, 10), { p: [0.44, 0.28, 1.88], s: [1, 0.85, 1.1] });
  // mandibles / cannons
  k.mirror('trim', () => cone(0.14, 1.7, 6), { p: [0.5, -0.25, 2.6], r: [HX + 0.12, 0, 0.35] });
  k.mirror('glow', () => sph(0.1, 8, 6), { p: [0.35, -0.42, 3.35] });
  // blade wings (2 pairs), thick at root, ridged, with dark wing roots
  k.mirror('accent', () => wing(4.0, 0.75, 0.35, 0.18, 0.05), { p: [2.3, 0.5, 0.5], r: [0, 0.3, 0.2] });
  k.mirror('accent', () => wing(3.4, 0.65, 0.3, 0.16, 0.05), { p: [2.0, 0.45, -0.5], r: [0, -0.45, 0.16] });
  k.mirror('core', () => box(0.6, 0.3, 0.8), { p: [0.9, 0.5, 0.45], r: [0, 0.3, 0.2] });
  k.mirror('core', () => box(0.6, 0.3, 0.7), { p: [0.85, 0.45, -0.5], r: [0, -0.45, 0.16] });
  k.mirror('glow', () => box(3.6, 0.05, 0.1), { p: [2.2, 0.52, 0.85], r: [0, 0.3, 0.2] });
  k.mirror('glow', () => box(3.0, 0.05, 0.1), { p: [1.9, 0.47, -0.78], r: [0, -0.45, 0.16] });
  // legs (jointed: femur + tibia)
  for (let i = 0; i < 3; i++) {
    k.mirror('trim', () => cyl(0.07, 0.1, 1.1, 5), { p: [0.7, -0.7, 0.9 - i * 0.6], r: [0.35, 0, 0.9] });
    k.mirror('trim', () => cyl(0.05, 0.07, 0.9, 5), { p: [1.25, -1.25, 0.75 - i * 0.6], r: [0.35, 0, -0.4] });
  }
  // stinger engine
  k.add('trim', cone(0.32, 1.0, 8), { p: [0, -0.25, -3.3], r: [-HX, 0, 0] });
  k.add('core', cyl(0.28, 0.2, 0.3, 8), { p: [0, -0.25, -3.35], r: [HX, 0, 0] });
  k.add('glow', sph(0.2, 10, 8), { p: [0, -0.25, -3.4] });
  k.engine(0, -0.25, -3.55, 0.5);
  return { radius: 3.1, hp: 2, style: { stripeZ: 0.2, stripeW: 0.35, tipX: 10.5 } };
}

/** MANTIS — heavy gunship. Thick armoured crescent wing, dark central pod, twin forward claws, triple thrusters. */
function mantis(k) {
  // central pod: dark core with green/purple armour
  k.add('core', cyl(0.85, 1.25, 3.0, 8), { p: [0, 0, 0], r: [HX, 0, 0], s: [1.2, 1, 0.9] });
  k.add('accent', cone(0.85, 1.9, 8), { p: [0, 0, 2.45], r: [HX, 0, 0], s: [1.2, 1, 0.9] });
  k.add('trim', cyl(1.25, 1.05, 1.0, 8), { p: [0, 0, -2.0], r: [HX, 0, 0], s: [1.2, 1, 0.9] });
  k.mirror('hull', () => box(0.7, 0.35, 2.6), { p: [0.9, 0.55, 0.1], r: [0, 0, -0.6] });   // shoulder armour
  k.add('hull', box(1.0, 0.3, 2.4), { p: [0, 0.95, 0.0] });
  k.add('glass', sph(0.5, 14, 10), { p: [0, 0.85, 1.0], s: [1, 0.6, 1.6] });
  k.add('glow', box(1.4, 0.1, 0.1), { p: [0, 0.35, 3.1] });
  k.mirror('core', () => box(0.35, 0.5, 0.1), { p: [0.55, -0.15, 3.15] });            // dark intake slots in the nose
  // thick armoured crescent wing, opening rearward — squashed tube + plating segments
  k.add('hull', torus(3.4, 0.85, Math.PI, 40), { p: [0, 0, -0.8], r: [HX, 0, 0], s: [1, 1, 0.45] });
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (0.08 + 0.84 * (i / 6)), x = Math.cos(a) * 3.4, z = -0.8 + Math.sin(a) * 3.4;
    k.add(i % 2 ? 'accent' : 'trim', box(0.9, 0.5, 0.6), { p: [x, 0.12, z], r: [0, -a + HX, 0] });
  }
  k.add('glow', torus(3.4, 0.08, Math.PI * 0.92, 40), { p: [0, 0.4, -0.8], r: [HX, 0, Math.PI * 0.04] });
  k.add('glow', torus(3.4, 0.08, Math.PI * 0.92, 40), { p: [0, -0.4, -0.8], r: [HX, 0, Math.PI * 0.04] });
  // armour plates on wing shoulders + tip blocks
  k.mirror('accent', () => box(1.5, 0.45, 1.3), { p: [2.1, 0.1, 1.2], r: [0, 0.6, 0] });
  k.mirror('core', () => box(0.85, 0.7, 0.9), { p: [3.35, 0, 0.2] });
  // claws at wing tips
  k.mirror('trim', () => cone(0.26, 2.8, 6), { p: [3.6, -0.1, 1.3], r: [HX, 0, 0.08] });
  k.mirror('glow', () => sph(0.16, 8, 6), { p: [3.65, -0.1, 2.7] });
  // top + bottom fins
  k.add('hull', wing(1.7, 1.9, 0.7, 0.18, 0.06), { p: [0, 1.5, -1.4], r: [0, 0, HX] });
  k.add('accent', slab(1.0, 1.4, 0.6, 0.16, 0.06), { p: [0, -1.15, -1.4], r: [0, 0, -HX] });
  // thrusters with dark throats
  const th = [[0, 0.45], [0.62, -0.35], [-0.62, -0.35]];
  for (const [x, y] of th) {
    k.add('trim', cyl(0.34, 0.42, 0.7, 10), { p: [x, y, -2.7], r: [HX, 0, 0] });
    k.add('core', cyl(0.28, 0.36, 0.18, 10), { p: [x, y, -3.0], r: [HX, 0, 0] });
    k.add('glow', cyl(0.22, 0.22, 0.12, 10), { p: [x, y, -3.08], r: [HX, 0, 0] });
    k.engine(x, y, -3.2, 0.5);
  }
  return { radius: 3.9, hp: 5, style: { stripeZ: 0.6, stripeW: 0.6, tipX: 8.4 } };
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
  const kit = new Kit();
  const info = fn(kit);
  // stripe params are in world (post-scale) units
  const style = Object.fromEntries(Object.entries(info.style ?? {}).map(([k, v]) => [k, v * CRAFT_SCALE]));
  const mats = opts.mats ?? makeCraftMaterials(glowColor, style);
  const group = kit.build(mats);
  Object.assign(group.userData, { kind, hp: info.hp, mats, glowColor, flashMats: [mats.core, mats.hull, mats.accent, mats.trim] });
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
