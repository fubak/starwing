// Procedural Arwing-class fighter. Everything is built from lofted / extruded /
// lathe geometry with canvas-painted livery + panel lines and custom shaders for
// the canopy fresnel, G-diffuser rings and engine plume.
//
//   const ship = buildArwing({ THREE });
//   scene.add(ship.group);
//   ship.update(dt, t); ship.setThrust(0..1); ship.setBank(-1..1); ship.flap(-1..1)
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// ---------------------------------------------------------------------------
// Livery / panel-line textures (canvas)
// ---------------------------------------------------------------------------
function hullTexture() {
  const W = 1024, H = 1024;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  // u (x) goes around the hull: 0 = top-centre, .25 = right, .5 = belly, .75 = left
  // v (y) goes along the hull: 0 = nose, 1 = tail
  g.fillStyle = '#eef1f5'; g.fillRect(0, 0, W, H);
  // grey belly band (u .33..67)
  const belly = g.createLinearGradient(0, 0, W, 0);
  belly.addColorStop(0.28, 'rgba(120,132,150,0)');
  belly.addColorStop(0.36, 'rgba(120,132,150,1)');
  belly.addColorStop(0.64, 'rgba(120,132,150,1)');
  belly.addColorStop(0.72, 'rgba(120,132,150,0)');
  g.fillStyle = belly; g.fillRect(0, 0, W, H);
  // blue nose cap + blue spine stripe
  g.fillStyle = '#2458c8';
  g.fillRect(0, 0, W, H * 0.11);
  g.fillStyle = '#1c47a8'; g.fillRect(0, H * 0.11, W, 6);
  // spine stripe (top centre) with a break behind the canopy
  g.fillStyle = '#2f63d6';
  g.fillRect(W * 0.47, H * 0.13, W * 0.06, H * 0.2);
  g.fillRect(W * 0.465, H * 0.62, W * 0.07, H * 0.34);
  g.fillRect(0, H * 0.13, W * 0.03, H * 0.2); g.fillRect(W * 0.97, H * 0.13, W * 0.03, H * 0.2);
  g.fillRect(0, H * 0.62, W * 0.035, H * 0.34); g.fillRect(W * 0.965, H * 0.62, W * 0.035, H * 0.34);
  // red trim rings
  g.fillStyle = '#d8342a';
  g.fillRect(0, H * 0.34, W, 5); g.fillRect(0, H * 0.905, W, 6);
  // subtle dirt / tone variation
  for (let i = 0; i < 2600; i++) {
    const x = Math.random() * W, y = Math.random() * H;
    const a = Math.random() * 0.05;
    g.fillStyle = `rgba(${Math.random() < 0.5 ? '40,50,70' : '255,255,255'},${a})`;
    g.fillRect(x, y, 2 + Math.random() * 30, 1 + Math.random() * 3);
  }
  // panel lines (dark thin lines) — rings along the hull and longitudinal seams
  g.strokeStyle = 'rgba(30,38,55,0.75)'; g.lineWidth = 3;
  const rings = [0.11, 0.2, 0.34, 0.43, 0.55, 0.62, 0.74, 0.83, 0.905];
  for (const r of rings) { g.beginPath(); g.moveTo(0, H * r); g.lineTo(W, H * r); g.stroke(); }
  const seams = [0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875];
  for (const s of seams) {
    const y0 = H * (0.12 + Math.random() * 0.1), y1 = H * (0.9 - Math.random() * 0.1);
    g.beginPath(); g.moveTo(W * s, y0); g.lineTo(W * s, y1); g.stroke();
  }
  // hatches / vents
  g.strokeStyle = 'rgba(30,38,55,0.6)'; g.lineWidth = 2;
  const hatch = (u, v, w, h, r = 6) => { g.beginPath(); g.roundRect(W * u - w / 2, H * v - h / 2, w, h, r); g.stroke(); };
  hatch(0.16, 0.5, 60, 90); hatch(0.84, 0.5, 60, 90); hatch(0.5, 0.45, 80, 50);
  hatch(0.12, 0.7, 40, 120); hatch(0.88, 0.7, 40, 120);
  g.fillStyle = 'rgba(30,38,55,0.5)';
  for (let i = 0; i < 6; i++) { g.fillRect(W * 0.2 - 30, H * (0.66 + i * 0.02), 60, 3); g.fillRect(W * 0.8 - 30, H * (0.66 + i * 0.02), 60, 3); }
  // tiny text decals
  g.fillStyle = 'rgba(30,38,55,0.7)'; g.font = 'bold 26px system-ui';
  g.fillText('SF-01', W * 0.19, H * 0.395); g.fillText('SF-01', W * 0.77, H * 0.395);
  g.font = 'bold 14px system-ui'; g.fillStyle = 'rgba(200,40,30,0.8)';
  g.fillText('NO STEP', W * 0.13, H * 0.58); g.fillText('NO STEP', W * 0.82, H * 0.58);

  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = THREE.RepeatWrapping; tex.anisotropy = 8;
  return tex;
}

function hullRoughnessTexture() {
  const W = 512, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#8a8a8a'; g.fillRect(0, 0, W, H); // rough ~0.54 base, panel lines rougher
  for (let i = 0; i < 4000; i++) {
    g.fillStyle = `rgba(${Math.random() < 0.5 ? 0 : 255},255,255,${Math.random() * 0.08})`;
    g.fillRect(Math.random() * W, Math.random() * H, 1 + Math.random() * 40, 1 + Math.random() * 2);
  }
  g.strokeStyle = 'rgba(255,255,255,0.9)'; g.lineWidth = 2;
  for (const r of [0.11, 0.2, 0.34, 0.43, 0.55, 0.62, 0.74, 0.83, 0.905]) { g.beginPath(); g.moveTo(0, H * r); g.lineTo(W, H * r); g.stroke(); }
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = THREE.RepeatWrapping;
  return tex;
}

function wingTexture() {
  const W = 512, H = 512;
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.fillStyle = '#eef1f5'; g.fillRect(0, 0, W, H);
  for (let i = 0; i < 1200; i++) {
    g.fillStyle = `rgba(40,50,70,${Math.random() * 0.05})`;
    g.fillRect(Math.random() * W, Math.random() * H, 2 + Math.random() * 40, 1 + Math.random() * 3);
  }
  g.strokeStyle = 'rgba(30,38,55,0.55)'; g.lineWidth = 2;
  for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(W * i / 6, 0); g.lineTo(W * i / 6, H); g.stroke(); }
  for (let i = 1; i < 4; i++) { g.beginPath(); g.moveTo(0, H * i / 4); g.lineTo(W, H * i / 4); g.stroke(); }
  g.fillStyle = 'rgba(30,38,55,0.5)'; for (let i = 0; i < 5; i++) g.fillRect(W * 0.3, H * (0.4 + i * 0.03), 80, 3);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8;
  return tex;
}

// ---------------------------------------------------------------------------
// Geometry helpers
// ---------------------------------------------------------------------------
/** Loft a closed superellipse tube through sections along -Z (nose) .. +Z (tail). */
function loft(sections, radial = 40) {
  const pos = [], uv = [], idx = [];
  const rows = sections.length;
  for (let i = 0; i < rows; i++) {
    const s = sections[i];
    const n = s.n ?? 2.4;
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2 + Math.PI / 2; // start at top centre
      const ca = Math.cos(a), sa = Math.sin(a);
      const x = s.w * Math.sign(ca) * Math.pow(Math.abs(ca), 2 / n);
      const h = sa >= 0 ? (s.ht ?? s.h) : (s.hb ?? s.h);
      const y = (s.y ?? 0) + h * Math.sign(sa) * Math.pow(Math.abs(sa), 2 / n);
      pos.push(x, y, s.z);
      uv.push(j / radial, i / (rows - 1));
    }
  }
  for (let i = 0; i < rows - 1; i++) for (let j = 0; j < radial; j++) {
    const a = i * (radial + 1) + j, b = a + radial + 1;
    idx.push(a, a + 1, b, b, a + 1, b + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

/** Wing plate: a 2D outline (x = span, z = chord) extruded along Y with a bevel, then flattened. */
function plate(points, thickness, bevel = 0.02) {
  const shape = new THREE.Shape();
  points.forEach(([x, z], i) => (i ? shape.lineTo(x, z) : shape.moveTo(x, z)));
  shape.closePath();
  const g = new THREE.ExtrudeGeometry(shape, { depth: thickness, bevelEnabled: true, bevelThickness: bevel, bevelSize: bevel, bevelSegments: 2, curveSegments: 6 });
  g.rotateX(Math.PI / 2); // shape (x,y)->(x,z), extrusion along -y
  g.translate(0, thickness / 2, 0);
  // planar uvs along span/chord
  const p = g.attributes.position, uvs = new Float32Array(p.count * 2);
  for (let i = 0; i < p.count; i++) { uvs[i * 2] = p.getX(i) * 0.5; uvs[i * 2 + 1] = p.getZ(i) * 0.5; }
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return g;
}

/** Mirror a polygon across x for side s (-1/+1), keeping consistent winding. */
function poly(pts, s) { const p = pts.map(([x, z]) => [x * s, z]); return s < 0 ? p.reverse() : p; }

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------
const canopyMaterial = () => new THREE.MeshPhysicalMaterial({
  color: 0x0a1a3a, metalness: 0.0, roughness: 0.05, transparent: true, opacity: 0.82,
  clearcoat: 1, clearcoatRoughness: 0.03, envMapIntensity: 1.6, ior: 1.5,
  specularIntensity: 1, side: THREE.FrontSide,
  emissive: 0x08203f, emissiveIntensity: 0.4,
});
// Fresnel rim on the canopy: brighten edges toward a cool reflective blue.
function patchFresnel(mat) {
  mat.onBeforeCompile = (sh) => {
    sh.fragmentShader = sh.fragmentShader.replace(
      '#include <dithering_fragment>',
      `#include <dithering_fragment>
       {
         vec3 V = normalize(vViewPosition);
         float f = pow(1.0 - clamp(dot(normalize(vNormal), V), 0.0, 1.0), 3.0);
         gl_FragColor.rgb += vec3(0.55, 0.75, 1.0) * f * 0.9;
         gl_FragColor.a = clamp(gl_FragColor.a + f * 0.6, 0.0, 1.0);
       }`
    );
  };
}

const glowVert = /* glsl */`
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  void main(){ vUv = uv; vN = normalize(normalMatrix * normal);
    vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`;

// Engine plume: a lathe cone, additive, animated noise with soft fresnel edges.
const plumeFrag = /* glsl */`
  uniform float uTime; uniform float uThrust; uniform vec3 uCore; uniform vec3 uEdge;
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
  void main(){
    float along = vUv.y;                 // 0 at nozzle, 1 at tip
    float rim = 1.0 - abs(dot(vN, vV));  // edge-on => transparent
    float n = noise(vec2(vUv.x * 6.0, along * 4.0 - uTime * 9.0)) * 0.6 + noise(vec2(vUv.x * 13.0, along * 9.0 - uTime * 14.0)) * 0.4;
    float body = pow(1.0 - along, 1.6) * (0.75 + 0.5 * n);
    float a = body * (1.0 - rim * rim) * (0.35 + uThrust);
    vec3 col = mix(uEdge, uCore, pow(1.0 - along, 2.5) * (0.6 + 0.6 * n));
    gl_FragColor = vec4(col * a * 2.2, a);
  }`;

// G-diffuser ring: emissive pulsing torus with hot core.
const ringFrag = /* glsl */`
  uniform float uTime; uniform float uThrust; uniform vec3 uCol;
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  void main(){
    float pulse = 0.85 + 0.15 * sin(uTime * 7.0 + vUv.x * 12.566);
    float f = pow(clamp(dot(vN, vV), 0.0, 1.0), 0.6);
    vec3 c = uCol * (1.4 + 1.6 * uThrust) * pulse * (0.6 + 0.6 * f);
    c += vec3(1.0, 0.85, 0.6) * pow(f, 6.0) * (0.5 + uThrust);
    gl_FragColor = vec4(c, 1.0);
  }`;

// Sprite glow disc (billboard) — soft radial falloff.
const discFrag = /* glsl */`
  uniform vec3 uCol; uniform float uIntensity; varying vec2 vUv;
  void main(){ float d = length(vUv - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - d), 2.2);
    gl_FragColor = vec4(uCol * a * uIntensity, a * 0.9); }`;
const discVert = /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`;

// ---------------------------------------------------------------------------
// Build
// ---------------------------------------------------------------------------
export function buildArwing(opts = {}) {
  const group = new THREE.Group();
  group.name = 'arwing';
  const rig = new THREE.Group(); // idle hover / bank layer
  group.add(rig);

  const hullTex = hullTexture();
  const roughTex = hullRoughnessTexture();
  const wingTex = wingTexture();

  const matHull = new THREE.MeshStandardMaterial({ map: hullTex, roughnessMap: roughTex, metalness: 0.2, roughness: 0.5, envMapIntensity: 0.7 });
  const matWing = new THREE.MeshStandardMaterial({ map: wingTex, metalness: 0.2, roughness: 0.5, envMapIntensity: 0.7 });
  const matBlue = new THREE.MeshStandardMaterial({ color: 0x2458c8, metalness: 0.35, roughness: 0.4, envMapIntensity: 1.2 });
  const matGrey = new THREE.MeshStandardMaterial({ color: 0x8e99ab, metalness: 0.45, roughness: 0.4 });
  const matDark = new THREE.MeshStandardMaterial({ color: 0x222833, metalness: 0.7, roughness: 0.35 });
  const matRed = new THREE.MeshStandardMaterial({ color: 0xd8342a, metalness: 0.3, roughness: 0.4 });
  const matCanopy = canopyMaterial(); patchFresnel(matCanopy);

  const uTime = { value: 0 }, uThrust = { value: 0.5 };

  // --- Fuselage (nose -Z, tail +Z). Total length ~ 7.
  const fuselage = loft([
    { z: -3.7, w: 0.02, h: 0.02, y: -0.05, n: 2.0 },
    { z: -3.4, w: 0.14, h: 0.11, y: -0.04, n: 2.2 },
    { z: -3.0, w: 0.26, ht: 0.20, hb: 0.18, y: -0.02, n: 2.4 },
    { z: -2.2, w: 0.40, ht: 0.30, hb: 0.26, y: 0.0, n: 2.6 },
    { z: -1.4, w: 0.50, ht: 0.36, hb: 0.30, y: 0.02, n: 2.8 },
    { z: -0.6, w: 0.56, ht: 0.38, hb: 0.34, y: 0.03, n: 3.0 },
    { z: 0.4, w: 0.58, ht: 0.36, hb: 0.36, y: 0.03, n: 3.2 },
    { z: 1.4, w: 0.56, ht: 0.34, hb: 0.36, y: 0.02, n: 3.2 },
    { z: 2.3, w: 0.50, ht: 0.33, hb: 0.34, y: 0.0, n: 3.0 },
    { z: 2.9, w: 0.42, ht: 0.32, hb: 0.30, y: -0.02, n: 2.6 },
    { z: 3.1, w: 0.36, ht: 0.30, hb: 0.28, y: -0.03, n: 2.4 },
  ], 48);
  rig.add(new THREE.Mesh(fuselage, matHull));

  // tail engine housing (dark) + nozzle ring
  const nozzleHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.30, 0.34, 0.35, 32, 1, true), matDark);
  nozzleHousing.rotation.x = Math.PI / 2; nozzleHousing.position.set(0, -0.02, 3.2); rig.add(nozzleHousing);
  const nozzleLip = new THREE.Mesh(new THREE.TorusGeometry(0.31, 0.035, 10, 40), matGrey);
  nozzleLip.position.set(0, -0.02, 3.37); rig.add(nozzleLip);
  const nozzleInner = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.3, 32, 1, true), new THREE.MeshBasicMaterial({ color: 0xff7a20, side: THREE.BackSide }));
  nozzleInner.rotation.x = Math.PI / 2; nozzleInner.position.set(0, -0.02, 3.25); rig.add(nozzleInner);
  const nozzleCore = new THREE.Mesh(new THREE.CircleGeometry(0.22, 32), new THREE.MeshBasicMaterial({ color: 0xffd9a0 }));
  nozzleCore.position.set(0, -0.02, 3.12); rig.add(nozzleCore);

  // --- Canopy
  const canopy = new THREE.Mesh(loft([
    { z: -1.55, w: 0.02, h: 0.02, y: 0.36, n: 2 },
    { z: -1.2, w: 0.22, ht: 0.18, hb: 0.0, y: 0.36, n: 2.2 },
    { z: -0.7, w: 0.33, ht: 0.34, hb: 0.0, y: 0.36, n: 2.3 },
    { z: -0.1, w: 0.36, ht: 0.38, hb: 0.0, y: 0.36, n: 2.4 },
    { z: 0.5, w: 0.34, ht: 0.34, hb: 0.0, y: 0.36, n: 2.4 },
    { z: 1.0, w: 0.28, ht: 0.22, hb: 0.0, y: 0.36, n: 2.4 },
    { z: 1.25, w: 0.02, h: 0.02, y: 0.36, n: 2 },
  ], 36), matCanopy);
  canopy.renderOrder = 5; rig.add(canopy);
  // canopy frame rails
  const frame = new THREE.Mesh(new THREE.TorusGeometry(0.36, 0.025, 8, 40, Math.PI), matGrey);
  frame.position.set(0, 0.36, -0.1); frame.rotation.z = 0; frame.scale.set(1.02, 1.06, 1); rig.add(frame);
  const frame2 = frame.clone(); frame2.position.z = 0.55; frame2.scale.set(0.95, 0.95, 1); rig.add(frame2);
  // cockpit interior: seat + pilot
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 0.5), matDark); seat.position.set(0, 0.42, 0.3); rig.add(seat);
  const pilotBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.11, 0.18, 4, 10), new THREE.MeshStandardMaterial({ color: 0x3a7d3a, roughness: 0.7 }));
  pilotBody.position.set(0, 0.50, 0.12); rig.add(pilotBody);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.11, 16, 12), new THREE.MeshStandardMaterial({ color: 0xf3f3f5, roughness: 0.25, metalness: 0.1 }));
  helmet.position.set(0, 0.68, 0.1); rig.add(helmet);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.095, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshStandardMaterial({ color: 0x1a3a70, roughness: 0.1, metalness: 0.4 }));
  visor.position.set(0, 0.68, 0.06); visor.rotation.x = -Math.PI / 2; rig.add(visor);
  const dash = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.3), matDark); dash.position.set(0, 0.42, -0.5); rig.add(dash);
  const dashGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.34, 0.06), new THREE.MeshBasicMaterial({ color: 0x40d0ff })); dashGlow.position.set(0, 0.49, -0.4); dashGlow.rotation.x = -0.9; rig.add(dashGlow);

  // --- Intakes: two side pods beside the cockpit (grey) with dark mouths
  for (const s of [-1, 1]) {
    const pod = new THREE.Mesh(loft([
      { z: -1.6, w: 0.02, h: 0.02, n: 2 }, { z: -1.3, w: 0.16, h: 0.15, n: 2.6 }, { z: -0.4, w: 0.2, h: 0.2, n: 3 },
      { z: 1.2, w: 0.2, h: 0.2, n: 3 }, { z: 2.2, w: 0.16, h: 0.16, n: 2.6 }, { z: 2.5, w: 0.02, h: 0.02, n: 2 },
    ], 24), matGrey);
    pod.position.set(s * 0.62, 0.05, 0); rig.add(pod);
    const mouth = new THREE.Mesh(new THREE.CircleGeometry(0.11, 20), matDark); mouth.position.set(s * 0.62, 0.05, -1.31); mouth.rotation.y = Math.PI; rig.add(mouth);
  }

  // --- Wings. Main wings sweep back & down from mid-fuselage. Tips (flaps) hinge.
  const wings = [];
  const flapPivots = [];
  for (const s of [-1, 1]) {
    const wingRoot = new THREE.Group(); wingRoot.position.set(s * 0.5, -0.12, 0.9); rig.add(wingRoot);
    // main wing: root at x=0, spans to x=2.0 ; chord tapers
    const pts = poly([[0, -1.6], [2.0, -0.3], [2.0, 0.55], [0, 1.3]], s);
    const wing = new THREE.Mesh(plate(pts, 0.09, 0.02), matWing);
    wing.rotation.z = s * -0.22; // droop
    wingRoot.add(wing); wings.push(wing);
    // blue leading edge stripe
    const stripe = new THREE.Mesh(plate(poly([[0.05, -1.55], [1.95, -0.3], [1.95, -0.05], [0.05, -1.2]], s), 0.11, 0.01), matBlue);
    stripe.rotation.z = wing.rotation.z; wingRoot.add(stripe);
    // wing tip flap (outer segment), hinge at x = 2.0 of the wing
    const pivot = new THREE.Group();
    pivot.position.set(2.0 * s * Math.cos(0.22), -2.0 * Math.sin(0.22), 0);
    wingRoot.add(pivot); flapPivots.push(pivot);
    const tipPts = poly([[0, -0.3], [1.15, 0.1], [1.15, 0.5], [0, 0.55]], s);
    const tip = new THREE.Mesh(plate(tipPts, 0.08, 0.015), matBlue);
    const tipG = new THREE.Group(); tipG.rotation.z = wing.rotation.z; pivot.add(tipG); pivot.userData.tipG = tipG;
    tipG.add(tip);
    // G-diffuser pod on the tip: lathe pod with glowing ring
    const gd = new THREE.Mesh(new THREE.LatheGeometry([
      new THREE.Vector2(0.0, -0.9), new THREE.Vector2(0.09, -0.8), new THREE.Vector2(0.15, -0.5), new THREE.Vector2(0.17, 0.0),
      new THREE.Vector2(0.17, 0.5), new THREE.Vector2(0.14, 0.75), new THREE.Vector2(0.08, 0.85), new THREE.Vector2(0.0, 0.85),
    ], 28), matWing);
    gd.rotation.x = -Math.PI / 2; gd.position.set(1.15 * s, 0.05, 0.2); tipG.add(gd);
    const gdCap = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0, -0.92), new THREE.Vector2(0.08, -0.82), new THREE.Vector2(0.14, -0.55), new THREE.Vector2(0.0, -0.55)], 28), matBlue);
    const gdBand = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.175, 0.12, 28, 1, true), matRed);
    gdBand.rotation.x = Math.PI / 2; gdBand.position.set(1.15 * s, 0.05, 0.85); tipG.add(gdBand);
    gdCap.rotation.x = -Math.PI / 2; gdCap.position.copy(gd.position); gdCap.position.z -= 0.02; tipG.add(gdCap);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.04, 12, 40), new THREE.ShaderMaterial({
      vertexShader: glowVert, fragmentShader: ringFrag, uniforms: { uTime, uThrust, uCol: { value: new THREE.Color(1.0, 0.32, 0.08) } },
    }));
    ring.position.set(1.15 * s, 0.05, 0.4); tipG.add(ring);
    const ring2 = ring.clone(); ring2.position.z = -0.15; ring2.scale.setScalar(0.9); tipG.add(ring2);
    // laser cannon under the wing
    const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 1.6, 12), matDark);
    cannon.rotation.x = Math.PI / 2; cannon.position.set(1.2 * s, -0.55, -0.9); wingRoot.add(cannon);
    const cannonTip = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.25, 10), matGrey);
    cannonTip.rotation.x = Math.PI / 2; cannonTip.position.set(1.2 * s, -0.55, -1.8); wingRoot.add(cannonTip);
    const cannonMount = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.35, 0.5), matGrey);
    cannonMount.position.set(1.2 * s, -0.42, -0.6); cannonMount.rotation.z = s * -0.22; wingRoot.add(cannonMount);
    // navigation light
    const nav = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), new THREE.MeshBasicMaterial({ color: s < 0 ? 0xff3030 : 0x30ff60 }));
    nav.position.set(1.15 * s, 0.05, -0.72); tipG.add(nav);
  }

  // --- Upper tail fins (canted outward, blue tips)
  for (const s of [-1, 1]) {
    // plate spans x (out) and z (chord); rotate about z so span points up, canted outward
    const fin = new THREE.Mesh(plate(poly([[0, 0.0], [0, 1.0], [0.45, 0.95], [0.75, 0.35]], s), 0.06, 0.012), matWing);
    fin.rotation.set(0, 0, s * (Math.PI / 2 - 0.55));
    fin.position.set(s * 0.32, 0.28, 1.8);
    rig.add(fin);
    const finTip = new THREE.Mesh(plate(poly([[0.45, 0.95], [0.75, 0.35], [0.8, 0.55], [0.5, 1.12]], s), 0.07, 0.01), matBlue);
    finTip.rotation.copy(fin.rotation); finTip.position.copy(fin.position); rig.add(finTip);
  }
  // dorsal spine + antenna
  const spine = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.08, 1.8), matBlue); spine.position.set(0, 0.36, 2.2); rig.add(spine);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.5, 6), matDark); antenna.position.set(0, 0.6, 2.7); rig.add(antenna);
  const antennaLight = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff4040 })); antennaLight.position.set(0, 0.86, 2.7); rig.add(antennaLight);

  // --- Engine plume + glow discs
  const plumeGeo = new THREE.LatheGeometry([
    new THREE.Vector2(0.27, 0), new THREE.Vector2(0.30, 0.3), new THREE.Vector2(0.26, 0.9), new THREE.Vector2(0.16, 1.7), new THREE.Vector2(0.04, 2.6), new THREE.Vector2(0.0, 2.9),
  ], 32);
  // uv.y along the lathe runs 0..1 from first to last point — good.
  const plumeMat = new THREE.ShaderMaterial({
    vertexShader: glowVert, fragmentShader: plumeFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime, uThrust, uCore: { value: new THREE.Color(1.0, 0.72, 0.38) }, uEdge: { value: new THREE.Color(0.25, 0.45, 1.0) } },
  });
  const plume = new THREE.Mesh(plumeGeo, plumeMat);
  plume.rotation.x = Math.PI / 2; plume.position.set(0, -0.02, 3.25); plume.renderOrder = 10; rig.add(plume);
  // secondary hot core plume
  const plume2 = new THREE.Mesh(plumeGeo, plumeMat.clone()); plume2.material.uniforms.uTime = uTime; plume2.material.uniforms.uThrust = uThrust;
  plume2.material.uniforms.uCore.value.set(1.2, 1.0, 0.9); plume2.material.uniforms.uEdge.value.set(1.0, 0.5, 0.2);
  plume2.rotation.x = Math.PI / 2; plume2.position.set(0, -0.02, 3.25); plume2.scale.set(0.55, 0.55, 0.7); plume2.renderOrder = 11; rig.add(plume2);
  const discMat = (col, intensity) => new THREE.ShaderMaterial({
    vertexShader: discVert, fragmentShader: discFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uCol: { value: new THREE.Color(col) }, uIntensity: { value: intensity } },
  });
  const engineDisc = new THREE.Mesh(new THREE.PlaneGeometry(1.7, 1.7), discMat(0xff9a40, 0.8));
  engineDisc.position.set(0, -0.02, 3.35); engineDisc.renderOrder = 12; rig.add(engineDisc);
  const gdDiscs = [];
  for (const p of flapPivots) {
    const s = Math.sign(p.position.x);
    const d = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.7), discMat(0xff5a20, 0.9)); d.position.set(1.15 * s, 0.05, 0.4); d.renderOrder = 12; p.userData.tipG.add(d); gdDiscs.push(d);
    const d2 = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 0.55), discMat(0xff5a20, 0.7)); d2.position.set(1.15 * s, 0.05, -0.15); d2.renderOrder = 12; p.userData.tipG.add(d2); gdDiscs.push(d2);
  }
  const billboards = [engineDisc, ...gdDiscs];

  // point lights for local bounce (engine + diffusers)
  const engineLight = new THREE.PointLight(0xff9a40, 6, 8, 2); engineLight.position.set(0, 0, 3.6); rig.add(engineLight);

  // shadows
  rig.traverse((o) => { if (o.isMesh && !(o.material.isShaderMaterial) && o.material.transparent !== true) { o.castShadow = true; o.receiveShadow = true; } });

  // --- State / animation
  const state = { thrust: 0.5, thrustTarget: 0.5, bank: 0, bankTarget: 0, flap: 0, flapTarget: 0, flapVel: 0, bankVel: 0, hover: 1 };
  const tmpQ = new THREE.Quaternion(), camPos = new THREE.Vector3();

  function update(dt, t, camera) {
    uTime.value = t;
    // thrust: eased
    state.thrust += (state.thrustTarget - state.thrust) * Math.min(1, dt * 6);
    uThrust.value = state.thrust;
    engineLight.intensity = 3 + state.thrust * 8;
    const ps = 0.7 + state.thrust * 0.75 + Math.sin(t * 37) * 0.03;
    plume.scale.set(1, 1, ps); plume2.scale.set(0.55, 0.55, 0.7 * ps);
    engineDisc.material.uniforms.uIntensity.value = 0.5 + state.thrust * 0.9 + Math.sin(t * 23) * 0.05;
    for (const d of gdDiscs) d.material.uniforms.uIntensity.value = 0.6 + state.thrust * 0.7 + Math.sin(t * 7 + d.position.z) * 0.08;
    // bank: spring with overshoot
    const bk = 90, bc = 11;
    state.bankVel += ((state.bankTarget - state.bank) * bk - state.bankVel * bc) * dt;
    state.bank += state.bankVel * dt;
    // flaps: spring with overshoot; couple to bank (outer flap dips)
    const fk = 140, fc = 13;
    state.flapVel += ((state.flapTarget - state.flap) * fk - state.flapVel * fc) * dt;
    state.flap += state.flapVel * dt;
    for (let i = 0; i < flapPivots.length; i++) {
      const s = i === 0 ? -1 : 1;
      const f = state.flap * 0.75 + state.bank * s * 0.35;
      flapPivots[i].rotation.z = -s * f; // fold up/down around the hinge (span axis is x, so rotate about z)
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
        b.getWorldQuaternion(tmpQ);
        b.quaternion.copy(camera.quaternion);
        b.parent.getWorldQuaternion(tmpQ).invert();
        b.quaternion.premultiply(tmpQ);
      }
    }
  }

  return {
    group,
    rig,
    update,
    setThrust(v) { state.thrustTarget = THREE.MathUtils.clamp(v, 0, 1); },
    setBank(v) { state.bankTarget = THREE.MathUtils.clamp(v, -1, 1); },
    flap(v) { state.flapTarget = THREE.MathUtils.clamp(v, -1, 1); },
    setHover(v) { state.hover = v; },
    state,
    materials: { matHull, matWing, matBlue, matGrey, matDark, matRed, matCanopy },
    dispose() {
      group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose()); else o.material.dispose(); } });
      hullTex.dispose(); roughTex.dispose(); wingTex.dispose();
    },
  };
}
