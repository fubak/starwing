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
  // per-panel tone variation so the white reads as painted panels, not plastic
  const rings0 = [0.11, 0.2, 0.34, 0.43, 0.55, 0.62, 0.74, 0.83, 0.905];
  const seams0 = [0, 0.125, 0.25, 0.375, 0.5, 0.625, 0.75, 0.875, 1];
  for (let i = 0; i < rings0.length - 1; i++) for (let j = 0; j < seams0.length - 1; j++) {
    const k = Math.random();
    g.fillStyle = k < 0.3 ? 'rgba(170,185,205,0.18)' : k < 0.45 ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0)';
    g.fillRect(W * seams0[j], H * rings0[i], W * (seams0[j + 1] - seams0[j]), H * (rings0[i + 1] - rings0[i]));
  }
  // panel lines (dark thin lines) — rings along the hull and longitudinal seams
  g.strokeStyle = 'rgba(24,30,46,0.9)'; g.lineWidth = 4;
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
  for (let i = 0; i < 24; i++) { g.fillStyle = Math.random() < 0.5 ? 'rgba(170,185,205,0.16)' : 'rgba(0,0,0,0)'; g.fillRect(W * (i % 6) / 6, H * Math.floor(i / 6) / 4, W / 6, H / 4); }
  g.strokeStyle = 'rgba(24,30,46,0.8)'; g.lineWidth = 3;
  g.strokeStyle = 'rgba(24,30,46,0.8)'; g.lineWidth = 3;
  for (let i = 1; i < 5; i++) { g.beginPath(); g.moveTo(W * i / 5, 0); g.lineTo(W * i / 5, H); g.stroke(); }
  for (let i = 1; i < 3; i++) { g.beginPath(); g.moveTo(0, H * i / 3); g.lineTo(W, H * i / 3); g.stroke(); }
  g.fillStyle = 'rgba(30,38,55,0.5)'; for (let i = 0; i < 5; i++) g.fillRect(W * 0.3, H * (0.4 + i * 0.03), 80, 3);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace; tex.anisotropy = 8; tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
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
  for (let i = 0; i < p.count; i++) { uvs[i * 2] = p.getX(i) * 0.3; uvs[i * 2 + 1] = p.getZ(i) * 0.3; }
  g.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  return g;
}

/** Mirror a polygon across x for side s (-1/+1), keeping consistent winding. */
function poly(pts, s) { const p = pts.map(([x, z]) => [x * s, z]); return s < 0 ? p.reverse() : p; }

// ---------------------------------------------------------------------------
// Shaders
// ---------------------------------------------------------------------------
const canopyMaterial = () => new THREE.MeshPhysicalMaterial({
  color: 0x06142e, metalness: 0.0, roughness: 0.08, transparent: true, opacity: 0.78,
  clearcoat: 1, clearcoatRoughness: 0.05, envMapIntensity: 1.8, ior: 1.5,
  specularIntensity: 1, side: THREE.FrontSide,
  emissive: 0x0a2a55, emissiveIntensity: 0.35,
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
  uniform float uTime; uniform float uThrust; uniform vec3 uCore; uniform vec3 uEdge; uniform float uGain;
  varying vec2 vUv; varying vec3 vN; varying vec3 vV;
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
  void main(){
    float along = vUv.y;                 // 0 at nozzle, 1 at tip
    float rim = 1.0 - abs(dot(vN, vV));  // edge-on => transparent
    float n = noise(vec2(vUv.x * 6.0, along * 4.0 - uTime * 9.0)) * 0.6 + noise(vec2(vUv.x * 13.0, along * 9.0 - uTime * 14.0)) * 0.4;
    // shock diamonds
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
    vec3 c = uCol * (1.3 + 1.5 * uThrust) * pulse * (0.6 + 0.6 * f);
    c += uHot * pow(f, 6.0) * (0.5 + uThrust);
    gl_FragColor = vec4(c, 1.0);
  }`;

// Sprite glow disc (billboard) — soft radial falloff.
const discFrag = /* glsl */`
  uniform vec3 uCol; uniform float uIntensity; varying vec2 vUv;
  void main(){ float d = length(vUv - 0.5) * 2.0; float a = pow(max(0.0, 1.0 - d), 2.6);
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

  // White hull carries a clear-coat (same material language as lookdev's hero chart).
  const matHull = new THREE.MeshPhysicalMaterial({ map: hullTex, roughnessMap: roughTex, color: 0xffffff, metalness: 0.05, roughness: 0.5, clearcoat: 0.6, clearcoatRoughness: 0.4, envMapIntensity: 0.8 });
  const matWing = new THREE.MeshPhysicalMaterial({ map: wingTex, color: 0xffffff, metalness: 0.05, roughness: 0.62, clearcoat: 0.15, clearcoatRoughness: 0.5, envMapIntensity: 0.6 });
  const matBlue = new THREE.MeshStandardMaterial({ color: 0x1e4fd8, metalness: 0.85, roughness: 0.36, envMapIntensity: 1.0 });
  const matGrey = new THREE.MeshStandardMaterial({ color: 0x8e99ab, metalness: 0.6, roughness: 0.4 });
  const matDark = new THREE.MeshStandardMaterial({ color: 0x232a36, metalness: 0.7, roughness: 0.45 });
  const matRed = new THREE.MeshStandardMaterial({ color: 0xd8342a, metalness: 0.3, roughness: 0.4 });
  const matCanopy = canopyMaterial(); patchFresnel(matCanopy);

  const uTime = { value: 0 }, uThrust = { value: 0.5 };
  const ringMat = (col, hot) => new THREE.ShaderMaterial({ vertexShader: glowVert, fragmentShader: ringFrag, uniforms: { uTime, uThrust, uCol: { value: new THREE.Color(...col) }, uHot: { value: new THREE.Color(...hot) } } });
  const discMat = (col, intensity) => new THREE.ShaderMaterial({
    vertexShader: discVert, fragmentShader: discFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uCol: { value: new THREE.Color(col) }, uIntensity: { value: intensity } },
  });

  // --- Fuselage (nose -Z, tail +Z). Long needle nose, broad flat mid-body. Total length ~ 7.3.
  const fuselage = loft([
    { z: -3.95, w: 0.02, h: 0.02, y: -0.02, n: 2.0 },
    { z: -3.55, w: 0.11, ht: 0.09, hb: 0.08, y: -0.02, n: 2.2 },
    { z: -2.85, w: 0.22, ht: 0.15, hb: 0.13, y: -0.01, n: 2.5 },
    { z: -2.05, w: 0.36, ht: 0.21, hb: 0.19, y: 0.0, n: 2.9 },
    { z: -1.35, w: 0.50, ht: 0.27, hb: 0.25, y: 0.01, n: 3.2 },
    { z: -0.55, w: 0.64, ht: 0.31, hb: 0.30, y: 0.02, n: 3.5 },
    { z: 0.45, w: 0.72, ht: 0.32, hb: 0.32, y: 0.02, n: 3.6 },
    { z: 1.45, w: 0.70, ht: 0.30, hb: 0.32, y: 0.01, n: 3.5 },
    { z: 2.35, w: 0.58, ht: 0.28, hb: 0.30, y: 0.0, n: 3.1 },
    { z: 2.95, w: 0.44, ht: 0.26, hb: 0.26, y: -0.01, n: 2.6 },
    { z: 3.3, w: 0.34, ht: 0.24, hb: 0.24, y: -0.02, n: 2.4 },
  ], 56);
  rig.add(new THREE.Mesh(fuselage, matHull));
  // chin blade under the nose (Arwing has a distinct ventral keel line)
  const keel = new THREE.Mesh(plate([[0, -3.1], [0.14, -0.9], [0.14, 0.2], [0, 0.4]], 0.035, 0.006), matGrey);
  keel.rotation.z = -Math.PI / 2; keel.position.set(0, -0.16, 0); rig.add(keel);

  // --- Tail engine: dark housing, chrome lip, blue-white nozzle ring, dark throat
  const nozzleHousing = new THREE.Mesh(new THREE.CylinderGeometry(0.29, 0.33, 0.38, 40, 1, true), matDark);
  nozzleHousing.rotation.x = Math.PI / 2; nozzleHousing.position.set(0, -0.02, 3.4); rig.add(nozzleHousing);
  const nozzleLip = new THREE.Mesh(new THREE.TorusGeometry(0.30, 0.035, 12, 48), matGrey);
  nozzleLip.position.set(0, -0.02, 3.58); rig.add(nozzleLip);
  const throat = new THREE.Mesh(new THREE.CylinderGeometry(0.20, 0.27, 0.34, 40, 1, true), new THREE.MeshBasicMaterial({ color: 0x0a1630, side: THREE.BackSide }));
  throat.rotation.x = Math.PI / 2; throat.position.set(0, -0.02, 3.42); rig.add(throat);
  const nozzleRing = new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.045, 12, 48), ringMat([0.3, 0.6, 1.3], [1.0, 1.1, 1.3]));
  nozzleRing.position.set(0, -0.02, 3.56); rig.add(nozzleRing);
  const nozzleCore = new THREE.Mesh(new THREE.CircleGeometry(0.15, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.9, 1.3, 2.0) }));
  nozzleCore.position.set(0, -0.02, 3.3); rig.add(nozzleCore);

  // --- Canopy: forward on the deck (Arwing cockpit sits ahead of the wings)
  const canopy = new THREE.Mesh(loft([
    { z: -2.1, w: 0.02, h: 0.02, y: 0.20, n: 2 },
    { z: -1.7, w: 0.19, ht: 0.16, hb: 0.0, y: 0.23, n: 2.2 },
    { z: -1.2, w: 0.30, ht: 0.30, hb: 0.0, y: 0.26, n: 2.3 },
    { z: -0.6, w: 0.34, ht: 0.35, hb: 0.0, y: 0.29, n: 2.4 },
    { z: 0.0, w: 0.33, ht: 0.32, hb: 0.0, y: 0.30, n: 2.4 },
    { z: 0.5, w: 0.28, ht: 0.22, hb: 0.0, y: 0.31, n: 2.4 },
    { z: 0.8, w: 0.02, h: 0.02, y: 0.31, n: 2 },
  ], 40), matCanopy);
  canopy.renderOrder = 5; rig.add(canopy);
  // canopy frame rails
  const frame = new THREE.Mesh(new THREE.TorusGeometry(0.34, 0.022, 8, 40, Math.PI), matGrey);
  frame.position.set(0, 0.29, -0.6); frame.scale.set(1.02, 1.04, 1); rig.add(frame);
  const frame2 = frame.clone(); frame2.position.set(0, 0.30, 0.1); frame2.scale.set(0.98, 0.96, 1); rig.add(frame2);
  // cockpit interior: seat + pilot + dash
  const seat = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.28, 0.42), matDark); seat.position.set(0, 0.36, -0.1); rig.add(seat);
  const pilotBody = new THREE.Mesh(new THREE.CapsuleGeometry(0.10, 0.16, 4, 10), new THREE.MeshStandardMaterial({ color: 0x3a7d3a, roughness: 0.7 }));
  pilotBody.position.set(0, 0.42, -0.26); rig.add(pilotBody);
  const helmet = new THREE.Mesh(new THREE.SphereGeometry(0.105, 16, 12), new THREE.MeshStandardMaterial({ color: 0xf3f3f5, roughness: 0.25, metalness: 0.1 }));
  helmet.position.set(0, 0.58, -0.28); rig.add(helmet);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.09, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.55), new THREE.MeshStandardMaterial({ color: 0x1a3a70, roughness: 0.1, metalness: 0.4 }));
  visor.position.set(0, 0.58, -0.32); visor.rotation.x = -Math.PI / 2; rig.add(visor);
  const dash = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.10, 0.26), matDark); dash.position.set(0, 0.34, -0.9); rig.add(dash);
  const dashGlow = new THREE.Mesh(new THREE.PlaneGeometry(0.30, 0.05), new THREE.MeshBasicMaterial({ color: 0x40d0ff })); dashGlow.position.set(0, 0.40, -0.8); dashGlow.rotation.x = -0.9; rig.add(dashGlow);

  // --- Dorsal: blue spine strake behind the canopy + antenna
  const spine = new THREE.Mesh(plate([[-0.10, 0.9], [0.10, 0.9], [0.06, 3.0], [-0.06, 3.0]], 0.08, 0.01), matBlue); spine.position.set(0, 0.30, 0); rig.add(spine);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.012, 0.45, 6), matDark); antenna.position.set(0, 0.52, 2.6); rig.add(antenna);
  const antennaLight = new THREE.Mesh(new THREE.SphereGeometry(0.022, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff4040 })); antennaLight.position.set(0, 0.75, 2.6); rig.add(antennaLight);

  // --- G-diffuser pods: low on each flank, pointed nose, glowing tail ring. Wings grow out of them.
  const PODX = 1.02, PODY = -0.16, PODZ = 0.55;
  const podProfile = [
    new THREE.Vector2(0.0, -1.55), new THREE.Vector2(0.07, -1.3), new THREE.Vector2(0.15, -0.8), new THREE.Vector2(0.20, -0.2),
    new THREE.Vector2(0.21, 0.6), new THREE.Vector2(0.20, 1.5), new THREE.Vector2(0.17, 2.1), new THREE.Vector2(0.15, 2.3), new THREE.Vector2(0.0, 2.3),
  ];
  const wings = [];
  const flapPivots = [];
  const gdDiscs = [];
  const DROOP = 0.30, FOLD = 0.62; // inner blade droops; outer blade kinks back up (the Arwing silhouette)
  for (const s of [-1, 1]) {
    const pod = new THREE.Mesh(new THREE.LatheGeometry(podProfile, 32), matWing);
    pod.rotation.x = Math.PI / 2; pod.position.set(s * PODX, PODY, PODZ); rig.add(pod); // lathe y -> +z
    const podCap = new THREE.Mesh(new THREE.LatheGeometry([new THREE.Vector2(0, -1.57), new THREE.Vector2(0.075, -1.3), new THREE.Vector2(0.12, -0.95), new THREE.Vector2(0.0, -0.95)], 32), matBlue);
    podCap.rotation.x = Math.PI / 2; podCap.position.copy(pod.position); rig.add(podCap);
    const podBand = new THREE.Mesh(new THREE.CylinderGeometry(0.215, 0.215, 0.10, 32, 1, true), matRed);
    podBand.rotation.x = Math.PI / 2; podBand.position.set(s * PODX, PODY, PODZ + 1.75); rig.add(podBand);
    const podRing = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.045, 12, 40), ringMat([1.0, 0.32, 0.08], [1.0, 0.85, 0.6]));
    podRing.position.set(s * PODX, PODY, PODZ + 2.33); rig.add(podRing);
    const podThroat = new THREE.Mesh(new THREE.CircleGeometry(0.12, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 0.9, 0.3) }));
    podThroat.position.set(s * PODX, PODY, PODZ + 2.30); rig.add(podThroat);
    const gdisc = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), discMat(0xff6a20, 0.8)); gdisc.position.set(s * PODX, PODY, PODZ + 2.45); gdisc.renderOrder = 12; rig.add(gdisc); gdDiscs.push(gdisc);
    // stub wing (thick) joining pod to fuselage
    const stub = new THREE.Mesh(plate(poly([[0.35, -0.3], [PODX, -0.7], [PODX, 1.5], [0.35, 1.7]], s), 0.16, 0.02), matHull);
    stub.position.set(0, PODY + 0.04, 0.5); rig.add(stub);
    // blue stripe along the stub leading edge
    const stubStripe = new THREE.Mesh(plate(poly([[0.4, -0.25], [PODX - 0.05, -0.65], [PODX - 0.05, -0.4], [0.4, 0.0]], s), 0.18, 0.005), matBlue);
    stubStripe.position.copy(stub.position); rig.add(stubStripe);

    // --- Wing blades. Root group sits on the pod's outboard flank.
    const wingRoot = new THREE.Group(); wingRoot.position.set(s * (PODX + 0.12), PODY + 0.02, 0.9); rig.add(wingRoot);
    // inner blade: short, drooping
    const inner = new THREE.Mesh(plate(poly([[0, -0.85], [0.7, -0.55], [0.7, 0.75], [0, 0.95]], s), 0.085, 0.015), matWing);
    inner.rotation.z = s * -DROOP; wingRoot.add(inner); wings.push(inner);
    const innerStripe = new THREE.Mesh(plate(poly([[0.02, -0.8], [0.68, -0.52], [0.68, -0.3], [0.02, -0.5]], s), 0.10, 0.005), matBlue);
    innerStripe.rotation.z = inner.rotation.z; wingRoot.add(innerStripe);
    // hinge at the end of the inner blade
    const pivot = new THREE.Group();
    pivot.position.set(0.7 * s * Math.cos(DROOP), -0.7 * Math.sin(DROOP), 0);
    wingRoot.add(pivot); flapPivots.push(pivot);
    const tipG = new THREE.Group(); pivot.add(tipG); pivot.userData.tipG = tipG;
    // outer blade: long, swept, thin — the sword
    const outer = new THREE.Mesh(plate(poly([[0, -0.55], [2.25, 0.62], [2.35, 0.78], [2.25, 1.0], [0, 0.75]], s), 0.075, 0.015), matWing);
    tipG.add(outer); wings.push(outer);
    const outerBlue = new THREE.Mesh(plate(poly([[1.35, 0.15], [2.25, 0.62], [2.35, 0.78], [2.25, 1.0], [1.35, 0.78]], s), 0.09, 0.008), matBlue);
    tipG.add(outerBlue);
    const outerEdge = new THREE.Mesh(plate(poly([[0.02, -0.5], [1.4, 0.2], [1.4, 0.4], [0.02, -0.2]], s), 0.085, 0.004), matBlue);
    tipG.add(outerEdge);
    // wingtip lamp housing + nav light
    const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.6, 12), matGrey);
    lamp.rotation.x = Math.PI / 2; lamp.position.set(2.3 * s, 0, 0.8); tipG.add(lamp);
    const nav = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 8), new THREE.MeshBasicMaterial({ color: s < 0 ? new THREE.Color(3, 0.3, 0.3) : new THREE.Color(0.3, 3, 0.8) }));
    nav.position.set(2.3 * s, 0, 0.48); tipG.add(nav);

    // --- Twin laser cannon under the pod nose
    const cannon = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 1.5, 12), matDark);
    cannon.rotation.x = Math.PI / 2; cannon.position.set(s * PODX, PODY - 0.22, -0.95); rig.add(cannon);
    const cannonTip = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.3, 10), matGrey);
    cannonTip.rotation.x = Math.PI / 2; cannonTip.position.set(s * PODX, PODY - 0.22, -1.8); rig.add(cannonTip);
    const cannonMount = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.2, 0.5), matGrey);
    cannonMount.position.set(s * PODX, PODY - 0.12, -0.6); rig.add(cannonMount);

    // --- Upper fins: canted well outward (no vertical tail), swept, blue tips
    const fin = new THREE.Mesh(plate(poly([[0, -0.1], [0, 0.95], [0.45, 0.9], [0.95, 0.35]], s), 0.06, 0.012), matWing);
    fin.rotation.set(0, 0, s * (Math.PI / 2 - 0.75));
    fin.position.set(s * 0.40, 0.24, 1.75);
    rig.add(fin);
    const finTip = new THREE.Mesh(plate(poly([[0.45, 0.9], [0.95, 0.35], [1.02, 0.5], [0.52, 1.05]], s), 0.07, 0.01), matBlue);
    finTip.rotation.copy(fin.rotation); finTip.position.copy(fin.position); rig.add(finTip);
  }

  // --- Engine plume + glow discs (blue-white, crisp; not a smear)
  const plumeGeo = new THREE.LatheGeometry([
    new THREE.Vector2(0.22, 0), new THREE.Vector2(0.25, 0.25), new THREE.Vector2(0.21, 0.8), new THREE.Vector2(0.12, 1.5), new THREE.Vector2(0.03, 2.2), new THREE.Vector2(0.0, 2.5),
  ], 32);
  const plumeMat = new THREE.ShaderMaterial({
    vertexShader: glowVert, fragmentShader: plumeFrag, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uTime, uThrust, uCore: { value: new THREE.Color(0.75, 0.9, 1.0) }, uEdge: { value: new THREE.Color(0.15, 0.35, 1.0) }, uGain: { value: 1.15 } },
  });
  const plume = new THREE.Mesh(plumeGeo, plumeMat);
  plume.rotation.x = Math.PI / 2; plume.position.set(0, -0.02, 3.5); plume.renderOrder = 10; rig.add(plume);
  const plume2 = new THREE.Mesh(plumeGeo, plumeMat.clone()); plume2.material.uniforms.uTime = uTime; plume2.material.uniforms.uThrust = uThrust;
  plume2.material.uniforms.uCore.value.set(1.0, 1.0, 1.0); plume2.material.uniforms.uEdge.value.set(0.5, 0.75, 1.0); plume2.material.uniforms.uGain.value = 1.0;
  plume2.rotation.x = Math.PI / 2; plume2.position.set(0, -0.02, 3.5); plume2.scale.set(0.5, 0.5, 0.65); plume2.renderOrder = 11; rig.add(plume2);
  const engineDisc = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2), discMat(0x5aa0ff, 0.45));
  engineDisc.position.set(0, -0.02, 3.62); engineDisc.renderOrder = 12; rig.add(engineDisc);
  // small orange G-diffuser plumes
  const gdPlumes = [];
  for (const s of [-1, 1]) {
    const gp = new THREE.Mesh(plumeGeo, plumeMat.clone()); gp.material.uniforms.uTime = uTime; gp.material.uniforms.uThrust = uThrust;
    gp.material.uniforms.uCore.value.set(1.0, 0.85, 0.6); gp.material.uniforms.uEdge.value.set(1.0, 0.35, 0.08); gp.material.uniforms.uGain.value = 1.3;
    gp.rotation.x = Math.PI / 2; gp.position.set(s * PODX, PODY, PODZ + 2.32); gp.scale.set(0.6, 0.6, 0.45); gp.renderOrder = 10; rig.add(gp); gdPlumes.push(gp);
  }
  const billboards = [engineDisc, ...gdDiscs];

  // point lights for local bounce (engine + diffusers)
  const engineLight = new THREE.PointLight(0x6aa8ff, 1.2, 6, 2); engineLight.position.set(0, 0, 4.6); rig.add(engineLight);
  const gdLight = new THREE.PointLight(0xff7a30, 0.8, 4, 2); gdLight.position.set(0, PODY, PODZ + 2.6); rig.add(gdLight);

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
    engineDisc.material.uniforms.uIntensity.value = 0.25 + state.thrust * 0.45 + Math.sin(t * 23) * 0.04;
    for (const d of gdDiscs) d.material.uniforms.uIntensity.value = 0.5 + state.thrust * 0.6 + Math.sin(t * 7 + d.position.x) * 0.08;
    // bank: spring with overshoot
    const bk = 90, bc = 11;
    state.bankVel += ((state.bankTarget - state.bank) * bk - state.bankVel * bc) * dt;
    state.bank += state.bankVel * dt;
    // flaps: spring with overshoot; couple to bank (outer blade dips into the turn)
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

  return {
    group,
    rig,
    update,
    setThrust(v) { state.thrustTarget = THREE.MathUtils.clamp(v, 0, 1); },
    setBank(v) { state.bankTarget = THREE.MathUtils.clamp(v, -1, 1); },
    flap(v) { state.flapTarget = THREE.MathUtils.clamp(v, -1, 1); },
    setHover(v) { state.hover = v; },
    state,
    /** local-space muzzle positions of the twin cannons (for other pieces) */
    muzzles: [new THREE.Vector3(-PODX, PODY - 0.22, -1.95), new THREE.Vector3(PODX, PODY - 0.22, -1.95)],
    nozzle: new THREE.Vector3(0, -0.02, 3.6),
    materials: { matHull, matWing, matBlue, matGrey, matDark, matRed, matCanopy },
    dispose() {
      group.traverse((o) => { if (o.isMesh) { o.geometry.dispose(); if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose()); else o.material.dispose(); } });
      hullTex.dispose(); roughTex.dispose(); wingTex.dispose();
    },
  };
}
