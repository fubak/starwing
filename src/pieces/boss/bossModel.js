// The GORGON — Venomian dreadnought. Hero form: large clean plated volumes
// (lofted armour with big chamfers), painted panel lines, a raised bridge with
// the iris-guarded core, twin heavy cannon arms with recessed lenses, swept
// delta wings with shield-generator pylons and real glowing engine cones.
// Materials: low-metal painted armour w/ fresnel rim light so silhouettes read.

export const PALETTE = {
  plate: 0x8f9db5,      // painted light slate armour
  plateDark: 0x3a4152,  // underbody / mechanical
  accent: 0xc8242c,     // Venom crimson
  gold: 0xe6a63a,       // hazard / trim
  trim: 0x1b1e28,
  weak: 0xffb347,
  core: 0xff3020,
  engine: 0x6fd0ff,
};

// ---------------------------------------------------------------- textures
function makeHullTextures(THREE, rng) {
  const S = 1024;
  const cv = document.createElement('canvas'); cv.width = cv.height = S; const c = cv.getContext('2d');
  const ev = document.createElement('canvas'); ev.width = ev.height = S; const e = ev.getContext('2d');
  const rv = document.createElement('canvas'); rv.width = rv.height = S; const r = rv.getContext('2d');
  // base: near-white so material.color drives the hue; panels vary +-6%
  c.fillStyle = '#e4e8ef'; c.fillRect(0, 0, S, S);
  e.fillStyle = '#000'; e.fillRect(0, 0, S, S);
  r.fillStyle = '#8c8c8c'; r.fillRect(0, 0, S, S);
  // big clean plates (4x4) with a few subdivided
  const cols = 4, rows = 4;
  const xs = [0]; for (let i = 1; i < cols; i++) xs.push((i / cols + (rng.next() - 0.5) * 0.08) * S); xs.push(S);
  const ys = [0]; for (let i = 1; i < rows; i++) ys.push((i / rows + (rng.next() - 0.5) * 0.08) * S); ys.push(S);
  const plates = [];
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const x0 = xs[i], x1 = xs[i + 1], y0 = ys[j], y1 = ys[j + 1];
    if (rng.next() < 0.35) { // split into two
      if (rng.next() < 0.5) { const m = (x0 + x1) / 2 + (rng.next() - 0.5) * 30; plates.push([x0, y0, m, y1], [m, y0, x1, y1]); }
      else { const m = (y0 + y1) / 2 + (rng.next() - 0.5) * 30; plates.push([x0, y0, x1, m], [x0, m, x1, y1]); }
    } else plates.push([x0, y0, x1, y1]);
  }
  for (const [x0, y0, x1, y1] of plates) {
    const t = rng.next();
    const shade = 216 + Math.floor(t * 30);
    c.fillStyle = `rgb(${shade - 4},${shade},${shade + 6})`;
    c.fillRect(x0, y0, x1 - x0, y1 - y0);
    const rough = 120 + Math.floor(rng.next() * 50); r.fillStyle = `rgb(${rough},${rough},${rough})`; r.fillRect(x0, y0, x1 - x0, y1 - y0);
    // bevel highlight (top/left) & shadow (bottom/right) -> painted edge read
    c.fillStyle = 'rgba(255,255,255,0.35)'; c.fillRect(x0 + 3, y0 + 3, x1 - x0 - 6, 3); c.fillRect(x0 + 3, y0 + 3, 3, y1 - y0 - 6);
    c.fillStyle = 'rgba(40,46,64,0.35)'; c.fillRect(x0 + 3, y1 - 6, x1 - x0 - 6, 3); c.fillRect(x1 - 6, y0 + 3, 3, y1 - y0 - 6);
    // painted accent: crimson band or gold hazard chevrons
    const pick = rng.next();
    if (pick < 0.16) { c.fillStyle = '#b8202a'; c.fillRect(x0 + 10, y0 + 12, x1 - x0 - 20, Math.min(26, (y1 - y0) * 0.22)); }
    else if (pick < 0.24) {
      c.save(); c.beginPath(); c.rect(x0 + 10, y1 - 34, Math.min(120, x1 - x0 - 20), 22); c.clip();
      for (let k = -2; k < 12; k++) { c.fillStyle = k % 2 ? '#e0a232' : '#1c1f2a'; c.beginPath(); c.moveTo(x0 + 10 + k * 16, y1 - 34); c.lineTo(x0 + 26 + k * 16, y1 - 34); c.lineTo(x0 + 14 + k * 16, y1 - 12); c.lineTo(x0 - 2 + k * 16, y1 - 12); c.fill(); }
      c.restore();
    }
    // stencil marking
    if (rng.next() < 0.3) { c.fillStyle = 'rgba(30,34,48,0.75)'; c.font = 'bold 26px monospace'; c.fillText(`${String(Math.floor(rng.next() * 90)).padStart(2, '0')}-${['V', 'A', 'G', 'K'][Math.floor(rng.next() * 4)]}`, x0 + 16, y0 + 50); }
    // recessed vent slots
    if (rng.next() < 0.22) { c.fillStyle = 'rgba(28,32,44,0.9)'; for (let k = 0; k < 5; k++) c.fillRect(x1 - 70, y0 + 20 + k * 11, 50, 5); }
    // windows (emissive)
    if (rng.next() < 0.3) {
      const n = 4 + Math.floor(rng.next() * 10); const wy = y0 + 20 + rng.next() * (y1 - y0 - 40);
      for (let k = 0; k < n; k++) { const wx = x0 + 14 + k * 11; if (wx > x1 - 14) break; e.fillStyle = rng.next() < 0.85 ? '#ffd9a0' : '#000'; e.fillRect(wx, wy, 5, 3); c.fillStyle = '#1a1c26'; c.fillRect(wx - 1, wy - 1, 7, 5); }
    }
    // bolts at corners
    c.fillStyle = 'rgba(60,66,84,0.9)';
    for (let k = 0; k < 4; k++) { const rx = k % 2 ? x1 - 12 : x0 + 8; const ry = k < 2 ? y0 + 8 : y1 - 12; c.beginPath(); c.arc(rx + 2, ry + 2, 2.2, 0, 7); c.fill(); }
  }
  // painted panel lines (dark, crisp) with a soft AO halo
  c.lineWidth = 9; c.strokeStyle = 'rgba(70,78,100,0.35)';
  for (const [x0, y0, x1, y1] of plates) c.strokeRect(x0, y0, x1 - x0, y1 - y0);
  c.lineWidth = 3; c.strokeStyle = 'rgba(34,38,52,0.95)';
  for (const [x0, y0, x1, y1] of plates) c.strokeRect(x0, y0, x1 - x0, y1 - y0);
  // light wear: scratches + soot streaks (subtle)
  for (let i = 0; i < 60; i++) {
    c.strokeStyle = `rgba(255,255,255,${0.15 + rng.next() * 0.2})`; c.lineWidth = 1; c.beginPath();
    const x = rng.next() * S, y = rng.next() * S; c.moveTo(x, y); c.lineTo(x + (rng.next() - 0.5) * 60, y + (rng.next() - 0.5) * 12); c.stroke();
  }
  for (let i = 0; i < 40; i++) {
    const g = c.createLinearGradient(0, 0, 0, 50 + rng.next() * 90); g.addColorStop(0, 'rgba(40,44,60,0.22)'); g.addColorStop(1, 'rgba(40,44,60,0)');
    c.save(); c.translate(rng.next() * S, rng.next() * S); c.fillStyle = g; c.fillRect(-3, 0, 5 + rng.next() * 8, 50 + rng.next() * 90); c.restore();
  }
  const mk = (canvas, srgb) => { const t = new THREE.CanvasTexture(canvas); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 8; if (srgb) t.colorSpace = THREE.SRGBColorSpace; return t; };
  return { map: mk(cv, true), emissiveMap: mk(ev, true), roughnessMap: mk(rv, false) };
}

// ---------------------------------------------------------------- loft
/** Loft a closed 2D profile through stations along +Z. Flat-shaded, outward normals, panel UVs. */
function loft(THREE, profile, stations, { uvScale = 14, caps = true } = {}) {
  const pos = [], uv = [];
  const n = profile.length;
  const st = (s, p) => [p[0] * s.sx + (s.ox || 0), p[1] * s.sy + (s.oy || 0), s.z];
  const center = (s) => [(s.ox || 0), (s.oy || 0), s.z];
  const pushTri = (a, b, c, ua, ub, uc, cen) => {
    const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]], ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const nx = ab[1] * ac[2] - ab[2] * ac[1], ny = ab[2] * ac[0] - ab[0] * ac[2], nz = ab[0] * ac[1] - ab[1] * ac[0];
    const fc = [(a[0] + b[0] + c[0]) / 3 - cen[0], (a[1] + b[1] + c[1]) / 3 - cen[1], (a[2] + b[2] + c[2]) / 3 - cen[2]];
    const flip = nx * fc[0] + ny * fc[1] + nz * fc[2] < 0;
    if (flip) { pos.push(...a, ...c, ...b); uv.push(...ua, ...uc, ...ub); } else { pos.push(...a, ...b, ...c); uv.push(...ua, ...ub, ...uc); }
  };
  const per = [0]; for (let j = 0; j < n; j++) { const p = profile[j], q = profile[(j + 1) % n]; per.push(per[j] + Math.hypot(q[0] - p[0], q[1] - p[1])); }
  for (let i = 0; i < stations.length - 1; i++) {
    const s0 = stations[i], s1 = stations[i + 1];
    const cen = [(center(s0)[0] + center(s1)[0]) / 2, (center(s0)[1] + center(s1)[1]) / 2, (s0.z + s1.z) / 2];
    for (let j = 0; j < n; j++) {
      const p0 = profile[j], p1 = profile[(j + 1) % n];
      const A = st(s0, p0), B = st(s0, p1), C = st(s1, p1), D = st(s1, p0);
      const u0 = per[j] / uvScale, u1 = per[j + 1] / uvScale, v0 = s0.z / uvScale, v1 = s1.z / uvScale;
      pushTri(A, B, C, [u0, v0], [u1, v0], [u1, v1], cen);
      pushTri(A, C, D, [u0, v0], [u1, v1], [u0, v1], cen);
    }
  }
  if (caps) {
    for (const [s, dir] of [[stations[0], -1], [stations[stations.length - 1], 1]]) {
      const cen = center(s); const cc = [cen[0], cen[1], cen[2] - dir * 5];
      for (let j = 0; j < n; j++) {
        const A = st(s, profile[j]), B = st(s, profile[(j + 1) % n]);
        pushTri(cen, A, B, [0.5, 0.5], [A[0] / uvScale, A[1] / uvScale], [B[0] / uvScale, B[1] / uvScale], cc);
      }
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.computeVertexNormals();
  return g;
}

function chamferRect(w, h, ch) {
  return [[w - ch, -h], [w, -h + ch], [w, h - ch], [w - ch, h], [-(w - ch), h], [-w, h - ch], [-w, -h + ch], [-(w - ch), -h]];
}
/** Hexagonal-ish armour profile: wide flat top, angled cheeks, narrower belly. */
function armourProfile(w, h) {
  return [[w * 0.55, -h], [w, -h * 0.25], [w, h * 0.45], [w * 0.8, h], [-w * 0.8, h], [-w, h * 0.45], [-w, -h * 0.25], [-w * 0.55, -h]];
}

// ---------------------------------------------------------------- rim-lit standard material
function rimMaterial(THREE, params, rimColor = 0x7fb4ff, rimPower = 0.55) {
  const m = new THREE.MeshStandardMaterial(params);
  m.userData.uRim = { value: rimPower }; m.userData.uRimColor = { value: new THREE.Color(rimColor) };
  m.onBeforeCompile = (sh) => {
    sh.uniforms.uRim = m.userData.uRim; sh.uniforms.uRimColor = m.userData.uRimColor;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uRim; uniform vec3 uRimColor;')
      .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
        { float ndv = saturate(dot(normalize(vViewPosition), normal)); float fr = pow(1.0 - ndv, 3.0);
          totalEmissiveRadiance += uRimColor * fr * uRim * (0.35 + 0.65 * saturate(normal.y + 0.4)); }`);
  };
  return m;
}

// ---------------------------------------------------------------- weak point shader
export function makeWeakPointMaterial(THREE, color) {
  return new THREE.ShaderMaterial({
    uniforms: { uColor: { value: new THREE.Color(color) }, uTime: { value: 0 }, uFlash: { value: 0 }, uHeat: { value: 0 } },
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vV; varying vec3 vP;
      void main(){ vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); vP = position; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `precision highp float; varying vec3 vN; varying vec3 vV; varying vec3 vP;
      uniform vec3 uColor; uniform float uTime; uniform float uFlash; uniform float uHeat;
      float hash(vec3 p){ p = fract(p*0.3183099+0.1); p*=17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
      float noise(vec3 p){ vec3 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                   mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
      void main(){
        vec3 n = normalize(vN); float ndv = max(dot(n, normalize(vV)), 0.0);
        float fres = pow(1.0 - ndv, 2.5);
        float pulse = 0.75 + 0.25 * sin(uTime * (4.0 + uHeat * 6.0));
        float plasma = noise(vP * 0.9 + vec3(0.0, uTime * 0.7, uTime * 0.4)) * 0.6 + noise(vP * 2.2 - uTime * 0.9) * 0.4;
        vec3 hot = mix(uColor, vec3(1.0, 0.98, 0.9), smoothstep(0.55, 0.9, plasma) * 0.8);
        // glassy: dark core, bright plasma veins, hot fresnel rim, specular dot
        vec3 col = uColor * 0.25 + hot * (0.7 + plasma * 1.3) * pulse + uColor * fres * 3.0;
        vec3 h = normalize(normalize(vV) + normalize(vec3(0.5, 0.8, 0.6)));
        col += vec3(1.0) * pow(max(dot(n, h), 0.0), 60.0) * 1.5;
        col = mix(col, vec3(2.5), uFlash);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

// ---------------------------------------------------------------- engine cone shader
function makeEngineConeMaterial(THREE) {
  return new THREE.ShaderMaterial({
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: { value: 0 }, uPower: { value: 1 } },
    vertexShader: /* glsl */ `varying vec2 vUv; varying vec3 vN; varying vec3 vV;
      void main(){ vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `precision highp float; varying vec2 vUv; varying vec3 vN; varying vec3 vV; uniform float uTime; uniform float uPower;
      void main(){
        float along = vUv.y; // 1 at nozzle, 0 at tail
        float edge = abs(dot(normalize(vN), normalize(vV)));
        float body = pow(along, 1.6);
        float flick = 0.85 + 0.15 * sin(uTime * 41.0 + along * 18.0) * sin(uTime * 27.0 - along * 9.0);
        float a = body * (0.25 + 0.75 * pow(1.0 - edge, 1.5)) * flick * uPower;
        vec3 col = mix(vec3(0.15, 0.45, 1.0), vec3(0.85, 0.97, 1.0), pow(along, 3.0));
        gl_FragColor = vec4(col * a * 1.8, a);
      }`,
  });
}
function makeEngineDiscMaterial(THREE) {
  return new THREE.ShaderMaterial({
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uPower: { value: 1 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `precision highp float; varying vec2 vUv; uniform float uTime; uniform float uPower;
      void main(){ vec2 p = vUv - 0.5; float r = length(p) * 2.0; float ring = smoothstep(1.0, 0.55, r); float core = smoothstep(0.75, 0.0, r);
        float flick = 0.92 + 0.08 * sin(uTime * 37.0 + r * 12.0);
        vec3 col = (vec3(0.3, 0.7, 1.0) * ring * 1.6 + vec3(1.0) * core * 3.0) * flick * uPower;
        gl_FragColor = vec4(col, ring * uPower); }`,
  });
}
// cannon lens: dim ember idle, white-hot when charging
function makeLensMaterial(THREE) {
  return new THREE.ShaderMaterial({
    uniforms: { uCharge: { value: 0 }, uTime: { value: 0 } },
    vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vV; varying vec2 vUv;
      void main(){ vUv = uv; vN = normalize(normalMatrix * normal); vec4 mv = modelViewMatrix * vec4(position,1.0); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }`,
    fragmentShader: /* glsl */ `precision highp float; varying vec3 vN; varying vec3 vV; varying vec2 vUv; uniform float uCharge; uniform float uTime;
      void main(){ vec3 n = normalize(vN); float ndv = max(dot(n, normalize(vV)), 0.0); float fr = pow(1.0 - ndv, 2.0);
        float rings = 0.5 + 0.5 * sin(length(vUv - 0.5) * 60.0 - uTime * 8.0);
        vec3 base = vec3(0.05, 0.02, 0.03) + vec3(0.45, 0.08, 0.03) * fr * 0.6 + vec3(0.35, 0.05, 0.02) * (0.5 + 0.5 * sin(uTime * 2.0)) * pow(ndv, 4.0) * 0.4;
        vec3 hot = vec3(1.0, 0.35, 0.15) * (1.5 + rings * 1.5) + vec3(1.0) * pow(ndv, 3.0) * 2.0;
        vec3 col = mix(base, hot, uCharge);
        vec3 h = normalize(normalize(vV) + normalize(vec3(0.5, 0.8, 0.6))); col += vec3(0.9) * pow(max(dot(n, h), 0.0), 80.0);
        gl_FragColor = vec4(col, 1.0); }`,
  });
}

// ---------------------------------------------------------------- build
export function buildBoss(THREE, rng) {
  const root = new THREE.Group(); root.name = 'GORGON';
  const tex = makeHullTextures(THREE, rng);
  const plateMat = rimMaterial(THREE, { map: tex.map, roughnessMap: tex.roughnessMap, emissiveMap: tex.emissiveMap, emissive: new THREE.Color(0xffc890), emissiveIntensity: 1.6, metalness: 0.28, roughness: 0.5, color: PALETTE.plate, envMapIntensity: 0.7 }, 0x86b8ff, 0.6);
  const darkMat = rimMaterial(THREE, { color: PALETTE.plateDark, metalness: 0.55, roughness: 0.48, envMapIntensity: 0.8 }, 0x6fa0ff, 0.5);
  const trimMat = rimMaterial(THREE, { color: PALETTE.trim, metalness: 0.85, roughness: 0.35 }, 0x6fa0ff, 0.35);
  const accentMat = rimMaterial(THREE, { color: PALETTE.accent, metalness: 0.25, roughness: 0.38, envMapIntensity: 0.6 }, 0xff9a80, 0.45);
  const goldMat = rimMaterial(THREE, { color: PALETTE.gold, metalness: 0.4, roughness: 0.35 }, 0xffe0a0, 0.35);
  const glassMat = new THREE.MeshStandardMaterial({ color: 0x0a1a2a, metalness: 0.9, roughness: 0.15, emissive: 0x2bd8ff, emissiveIntensity: 0.9 });
  const redLightMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  const engineRimMat = new THREE.MeshStandardMaterial({ color: 0x1a2a44, metalness: 0.9, roughness: 0.3, emissive: 0x2b7fe0, emissiveIntensity: 1.6 });

  const parts = {};
  const mk = (name, parent = root) => { const g = new THREE.Group(); g.name = name; parent.add(g); parts[name] = g; return g; };
  const hullFront = mk('hullFront'), hullRear = mk('hullRear'), wingL = mk('wingL'), wingR = mk('wingR'), tower = mk('tower');
  const armL = mk('armL'), armR = mk('armR');

  // ---- main hull: hex armour profile, split at z=0 for the break-up
  const HW = 22, HH = 12;
  const prof = armourProfile(HW, HH);
  hullRear.add(new THREE.Mesh(loft(THREE, prof, [
    { z: -64, sx: 0.62, sy: 0.66, oy: 1.5 }, { z: -54, sx: 0.92, sy: 0.92 }, { z: -20, sx: 1.0, sy: 1.0 }, { z: 0.5, sx: 1.0, sy: 1.0 },
  ], { uvScale: 40 }), plateMat));
  hullFront.add(new THREE.Mesh(loft(THREE, prof, [
    { z: -0.5, sx: 1.0, sy: 1.0 }, { z: 22, sx: 1.0, sy: 1.0 }, { z: 46, sx: 0.84, sy: 0.8, oy: 1.2 }, { z: 64, sx: 0.5, sy: 0.5, oy: 1.6 }, { z: 78, sx: 0.2, sy: 0.24, oy: 2 },
  ], { uvScale: 40 }), plateMat));
  // dorsal armour plate: wide clean slab riding on top of the hull (the "hero" plane that catches key light)
  hullRear.add(new THREE.Mesh(loft(THREE, chamferRect(19, 1.6, 1.2), [{ z: -56, sx: 0.55, sy: 1, oy: HH + 1.2 }, { z: -44, sx: 1, sy: 1, oy: HH + 1.6 }, { z: 0.5, sx: 1, sy: 1, oy: HH + 1.6 }], { uvScale: 22 }), plateMat));
  hullFront.add(new THREE.Mesh(loft(THREE, chamferRect(19, 1.6, 1.2), [{ z: -0.5, sx: 1, sy: 1, oy: HH + 1.6 }, { z: 26, sx: 1, sy: 1, oy: HH + 1.6 }, { z: 46, sx: 0.55, sy: 1, oy: HH + 1.8 }], { uvScale: 22 }), plateMat));
  // crimson dorsal stripe down the centreline
  const box = (parent, mat, w, h, d, x, y, z, rx = 0, ry = 0, rz = 0) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); m.rotation.set(rx, ry, rz); parent.add(m); return m; };
  box(hullRear, accentMat, 3.2, 0.5, 56, 0, HH + 3.35, -28);
  box(hullFront, accentMat, 3.2, 0.5, 36, 0, HH + 3.35, 18);
  // armoured prow: chisel wedge, dark, with gold leading edge
  hullFront.add(new THREE.Mesh(loft(THREE, chamferRect(13, 5.5, 2.5), [{ z: 44, sx: 1, sy: 1, oy: -1.5 }, { z: 66, sx: 0.75, sy: 0.65, oy: -1 }, { z: 84, sx: 0.28, sy: 0.22, oy: -0.5 }], { uvScale: 20 }), darkMat));
  box(hullFront, goldMat, 1.6, 1.6, 30, 0, 4.6, 66, 0.06, 0, Math.PI / 4);
  // ventral keel (dark) + crimson belly stripe
  hullFront.add(new THREE.Mesh(loft(THREE, chamferRect(7, 4, 1.8), [{ z: -52, sx: 0.5, sy: 0.5, oy: -HH + 0.5 }, { z: -30, sx: 1, sy: 1, oy: -HH - 1.6 }, { z: 32, sx: 1, sy: 1, oy: -HH - 1.6 }, { z: 50, sx: 0.4, sy: 0.4, oy: -HH + 0.5 }], { uvScale: 20 }), darkMat));
  box(hullFront, accentMat, 2.6, 0.5, 60, 0, -HH - 5.8, 0);
  // flank cheek armour + long crimson side stripes with gold edge
  for (const s of [-1, 1]) {
    const cheek = new THREE.Mesh(loft(THREE, chamferRect(3.2, 7.5, 1.6), [{ z: -50, sx: 0.5, sy: 0.55 }, { z: -32, sx: 1, sy: 1 }, { z: 22, sx: 1, sy: 1 }, { z: 40, sx: 0.45, sy: 0.55 }], { uvScale: 18 }), plateMat);
    cheek.position.set(s * (HW + 1.8), -1.5, 0); hullRear.add(cheek);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.4, 92), accentMat); stripe.position.set(s * (HW + 5.2), -1.5, -5); hullRear.add(stripe);
    const gold = new THREE.Mesh(new THREE.BoxGeometry(0.75, 0.5, 92), goldMat); gold.position.set(s * (HW + 5.2), 0.1, -5); hullRear.add(gold);
    // shoulder blocks on the dorsal plate (clean modules)
    const shoulder = new THREE.Mesh(loft(THREE, chamferRect(4.5, 2.2, 1), [{ z: -40, sx: 0.6, sy: 0.6 }, { z: -30, sx: 1, sy: 1 }, { z: 6, sx: 1, sy: 1 }, { z: 14, sx: 0.6, sy: 0.7 }], { uvScale: 14 }), darkMat);
    shoulder.position.set(s * 13, HH + 4.6, 0); hullRear.add(shoulder);
  }

  // ---- wings: chunky swept delta, gold leading edge, crimson tip stripe
  const wingProf = [[-16, 0], [-8, 3.4], [6, 3.0], [16, 0.6], [17, 0], [16, -0.9], [6, -3.2], [-8, -3.6]];
  const wingGeo = loft(THREE, wingProf, [
    { z: 0, sx: 1.0, sy: 1.0 }, { z: 28, sx: 0.95, sy: 0.9, ox: 4 }, { z: 58, sx: 0.78, sy: 0.7, ox: 11 }, { z: 84, sx: 0.5, sy: 0.45, ox: 20 },
  ], { uvScale: 40 });
  const weakPoints = [];
  const runningLights = [];
  for (const side of [-1, 1]) {
    const wg = side < 0 ? wingL : wingR;
    const wm = new THREE.Mesh(wingGeo, plateMat);
    wm.rotation.y = Math.PI / 2; wm.scale.z = side; wm.position.set(side * 14, 2, 4); wg.add(wm);
    // leading-edge gold strip (follows the sweep)
    const le = new THREE.Mesh(new THREE.BoxGeometry(84, 1.0, 1.4), goldMat); le.position.set(side * 56, 2, -12.6 - 10); le.rotation.y = side * -0.235; wg.add(le);
    // tip fin
    const fin = new THREE.Mesh(loft(THREE, chamferRect(0.8, 7, 0.6), [{ z: -22, sx: 1, sy: 0.4, oy: 4 }, { z: -14, sx: 1, sy: 1, oy: 7 }, { z: -6, sx: 1, sy: 0.55, oy: 5 }], { uvScale: 12 }), plateMat);
    fin.position.set(side * 96, 2, 0); wg.add(fin);
    const finStripe = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.4, 9), accentMat); finStripe.position.set(side * 96, 12.6, -14); wg.add(finStripe);
    const tipLight = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), redLightMat); tipLight.position.set(side * 96, 14.4, -14); wg.add(tipLight); runningLights.push(tipLight);
    // underslung wing engine nacelle (clean cylinder + bell + rim)
    const nac = new THREE.Mesh(new THREE.CylinderGeometry(4.4, 4.9, 24, 24), plateMat); nac.rotation.x = Math.PI / 2; nac.position.set(side * 62, -1.8, -12); wg.add(nac);
    const nacBand = new THREE.Mesh(new THREE.TorusGeometry(4.55, 0.5, 8, 28), accentMat); nacBand.position.set(side * 62, -1.8, -4); wg.add(nacBand);
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(5.0, 4.0, 6, 24, 1, true), darkMat); bell.rotation.x = Math.PI / 2; bell.position.set(side * 62, -1.8, -26); bell.material = darkMat; wg.add(bell);
    const bellIn = new THREE.Mesh(new THREE.CylinderGeometry(4.6, 2.2, 6, 24, 1, true), trimMat); bellIn.rotation.x = Math.PI / 2; bellIn.position.set(side * 62, -1.8, -25.5); wg.add(bellIn);
    const wRim = new THREE.Mesh(new THREE.TorusGeometry(5.0, 0.45, 8, 28), engineRimMat); wRim.position.set(side * 62, -1.8, -29); wg.add(wRim);
    // shield generator pylons (phase 1)
    for (const [wx, wz] of [[60, -4], [84, -8]]) {
      const base = new THREE.Group(); base.position.set(side * wx, 4.5 + (wx > 70 ? -0.8 : 0), wz); wg.add(base);
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 4.6, 2.6, 8), darkMat); ped.position.y = 0.6; base.add(ped);
      const pedRing = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.35, 8, 8), goldMat); pedRing.rotation.x = Math.PI / 2; pedRing.position.y = 1.9; base.add(pedRing);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(4.3, 0.42, 8, 32), trimMat); ring.rotation.x = Math.PI / 2; ring.position.y = 4.6; base.add(ring);
      for (let k = 0; k < 4; k++) {
        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.8, 5.2, 1.4), plateMat);
        const a = k * Math.PI / 2 + Math.PI / 4; strut.position.set(Math.cos(a) * 4.1, 3.2, Math.sin(a) * 4.1); strut.rotation.y = -a; strut.rotation.z = Math.cos(a) * 0.25; strut.rotation.x = -Math.sin(a) * 0.25; base.add(strut);
      }
      const wpMat = makeWeakPointMaterial(THREE, PALETTE.weak);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(3.0, 24, 18), wpMat); orb.position.y = 4.6; base.add(orb);
      weakPoints.push({ name: 'shield generator', phase: 1, mesh: orb, group: base, hp: 100, maxHp: 100, alive: true, radius: 4.2, mat: wpMat, flash: 0 });
    }
    // wing-root fairing (clean blend block into the hull)
    const fair = new THREE.Mesh(loft(THREE, chamferRect(9, 3.2, 1.4), [{ z: -20, sx: 0.5, sy: 0.6 }, { z: -8, sx: 1, sy: 1 }, { z: 10, sx: 1, sy: 1 }, { z: 20, sx: 0.5, sy: 0.6 }], { uvScale: 16 }), darkMat);
    fair.position.set(side * 30, 3.2, -2); wg.add(fair);
    // two clean wing modules (instead of random greeble slabs)
    for (const [mx, mz, mw] of [[40, -10, 9], [52, -13, 7]]) { const mod = new THREE.Mesh(new THREE.BoxGeometry(mw, 1.6, 6), side < 0 ? plateMat : plateMat); mod.position.set(side * mx, 4.4, mz); wg.add(mod); }
  }

  // ---- command tower + core
  const towerGeo = loft(THREE, chamferRect(9.5, 7.5, 2.8), [{ z: 4, sx: 0.8, sy: 0.65 }, { z: 18, sx: 1, sy: 1 }, { z: 38, sx: 1, sy: 1 }, { z: 47, sx: 0.82, sy: 0.85, oy: 0.4 }], { uvScale: 20 });
  const towerMesh = new THREE.Mesh(towerGeo, plateMat); towerMesh.position.y = 15; tower.add(towerMesh);
  // bridge visor: recessed glass slot + brow
  const visor = new THREE.Mesh(new THREE.BoxGeometry(15, 1.6, 0.6), glassMat); visor.position.set(0, 20.2, 47.2); tower.add(visor);
  const brow = new THREE.Mesh(loft(THREE, chamferRect(11.5, 1.4, 0.8), [{ z: 34, sx: 0.8, sy: 1, oy: 22.6 }, { z: 46, sx: 1, sy: 1, oy: 22.8 }, { z: 50, sx: 0.9, sy: 0.7, oy: 22.4 }], { uvScale: 16 }), darkMat); tower.add(brow);
  const browStripe = new THREE.Mesh(new THREE.BoxGeometry(18, 0.6, 3), accentMat); browStripe.position.set(0, 24.3, 44); tower.add(browStripe);
  // sensor mast
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.6, 16, 6), trimMat); antenna.position.set(0, 30, 14); tower.add(antenna);
  const dish = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 0.4, 1.2, 12, 1, true), plateMat); dish.position.set(0, 27, 12); dish.rotation.x = -0.9; dish.material.side = THREE.DoubleSide; tower.add(dish);
  const antLight = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), redLightMat); antLight.position.set(0, 38.3, 14); tower.add(antLight); runningLights.push(antLight);
  // core eye inside an iris of 6 armour petals
  const coreMat = makeWeakPointMaterial(THREE, PALETTE.core);
  const core = new THREE.Mesh(new THREE.SphereGeometry(4.6, 32, 24), coreMat); core.position.set(0, 15, 42.4); tower.add(core);
  const socket = new THREE.Mesh(new THREE.TorusGeometry(6.4, 1.2, 10, 36), trimMat); socket.position.set(0, 15, 46.8); tower.add(socket);
  const socketGold = new THREE.Mesh(new THREE.TorusGeometry(7.4, 0.35, 8, 36), goldMat); socketGold.position.set(0, 15, 47.6); tower.add(socketGold);
  const petals = [];
  for (let k = 0; k < 6; k++) {
    const hinge = new THREE.Group(); const a = (k / 6) * Math.PI * 2;
    hinge.position.set(Math.cos(a) * 5.6, 15 + Math.sin(a) * 5.6, 47.6); hinge.rotation.z = a;
    const petal = new THREE.Mesh(new THREE.CylinderGeometry(6.6, 6.6, 1.0, 6, 1, false, Math.PI / 3, Math.PI / 3), k % 2 ? darkMat : accentMat);
    petal.rotation.x = Math.PI / 2; petal.position.set(-5.6, 0, 0);
    hinge.add(petal); tower.add(hinge); petals.push(hinge);
  }
  weakPoints.push({ name: 'reactor core', phase: 3, mesh: core, group: tower, hp: 220, maxHp: 220, alive: true, radius: 5.5, mat: coreMat, flash: 0 });

  // ---- heavy cannon arms (phase 2 weak points + laser emitters)
  const emitters = [];
  const lensMat = makeLensMaterial(THREE);
  for (const side of [-1, 1]) {
    const ag = side < 0 ? armL : armR;
    const AX = 31;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 4.6, 62, 24), plateMat); barrel.rotation.x = Math.PI / 2; barrel.position.set(side * AX, -6, 36); ag.add(barrel);
    const pylon = new THREE.Mesh(loft(THREE, chamferRect(5.5, 5, 1.6), [{ z: -2, sx: 0.6, sy: 0.7 }, { z: 8, sx: 1, sy: 1 }, { z: 24, sx: 1, sy: 1 }, { z: 32, sx: 0.6, sy: 0.7 }], { uvScale: 14 }), darkMat); pylon.position.set(side * (AX - 4.5), -3, 0); ag.add(pylon);
    // muzzle: flared bell + gold band + recessed dark throat + lens
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(5.4, 4.4, 10, 24, 1, true), darkMat); muzzle.rotation.x = Math.PI / 2; muzzle.position.set(side * AX, -6, 70); muzzle.material.side = THREE.DoubleSide; ag.add(muzzle);
    const throat = new THREE.Mesh(new THREE.CylinderGeometry(4.9, 2.6, 7, 24, 1, true), trimMat); throat.rotation.x = Math.PI / 2; throat.position.set(side * AX, -6, 71.5); ag.add(throat);
    const mband = new THREE.Mesh(new THREE.TorusGeometry(5.3, 0.45, 8, 32), trimMat); mband.position.set(side * AX, -6, 74.8); ag.add(mband);
    for (let k = 0; k < 3; k++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(4.5 - k * 0.1, 0.5, 8, 28), k === 1 ? accentMat : darkMat); ring.position.set(side * AX, -6, 46 + k * 6); ag.add(ring); }
    const armStripe = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.6, 30), goldMat); armStripe.position.set(side * (AX + 3.9), -6, 22); ag.add(armStripe);
    const emitter = new THREE.Mesh(new THREE.SphereGeometry(2.4, 20, 14), lensMat); emitter.position.set(side * AX, -6, 68.6); emitter.scale.z = 0.45; ag.add(emitter);
    emitters.push({ mesh: emitter, side });
    // power cell (weak point) housing on top of the arm
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(3.8, 4.4, 4, 8), darkMat); housing.position.set(side * AX, -1.2, 30); ag.add(housing);
    const hring = new THREE.Mesh(new THREE.TorusGeometry(3.9, 0.3, 8, 8), goldMat); hring.rotation.x = Math.PI / 2; hring.position.set(side * AX, 0.8, 30); ag.add(hring);
    const cellMat = makeWeakPointMaterial(THREE, PALETTE.weak);
    const cell = new THREE.Mesh(new THREE.SphereGeometry(2.7, 20, 16), cellMat); cell.position.set(side * AX, 1.6, 30); ag.add(cell);
    weakPoints.push({ name: 'cannon power cell', phase: 2, mesh: cell, group: ag, hp: 130, maxHp: 130, alive: true, radius: 3.8, mat: cellMat, flash: 0 });
  }

  // ---- engines: bell nozzles with real glowing cones
  const engineGlowMat = makeEngineConeMaterial(THREE);
  const engineDiscMat = makeEngineDiscMaterial(THREE);
  const engines = [];
  const addEngine = (parent, x, y, z, r) => {
    const bell = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.1, r * 0.85, r * 1.6, 24, 1, true), darkMat); bell.rotation.x = Math.PI / 2; bell.position.set(x, y, z + r * 0.6); bell.material.side = THREE.DoubleSide; parent.add(bell);
    const throat = new THREE.Mesh(new THREE.CylinderGeometry(r * 1.02, r * 0.45, r * 1.2, 24, 1, true), trimMat); throat.rotation.x = Math.PI / 2; throat.position.set(x, y, z + r * 0.7); parent.add(throat);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r * 1.1, r * 0.1, 8, 32), engineRimMat); rim.position.set(x, y, z - r * 0.15); parent.add(rim);
    const disc = new THREE.Mesh(new THREE.PlaneGeometry(r * 2.3, r * 2.3), engineDiscMat); disc.position.set(x, y, z - r * 0.2); disc.rotation.y = Math.PI; parent.add(disc);
    const coneGeo = new THREE.CylinderGeometry(r * 0.95, r * 0.15, r * 5.5, 24, 1, true); // uv.y: 1 at top (nozzle) -> 0 at tail
    const cone = new THREE.Mesh(coneGeo, engineGlowMat); cone.rotation.x = Math.PI / 2; cone.position.set(x, y, z - r * 2.9); parent.add(cone);
    engines.push(cone);
  };
  addEngine(hullRear, 0, 3, -66, 6.5); addEngine(hullRear, -11.5, -3, -66, 5); addEngine(hullRear, 11.5, -3, -66, 5);
  addEngine(wingL, -62, -1.8, -28.5, 4.4); addEngine(wingR, 62, -1.8, -28.5, 4.4);

  // ---- missile hatches (dorsal, either side of the stripe)
  const hatches = [];
  for (let i = 0; i < 6; i++) {
    const side = i % 2 ? 1 : -1, row = Math.floor(i / 2);
    const g = new THREE.Group(); g.position.set(side * 6.5, HH + 3.25, -18 - row * 9); hullRear.add(g);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.6, 6.4), trimMat); g.add(frame);
    const glowPlane = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2), new THREE.MeshBasicMaterial({ color: 0xff3a1a, transparent: true, opacity: 0, depthWrite: false })); glowPlane.rotation.x = -Math.PI / 2; glowPlane.position.y = 0.32; g.add(glowPlane);
    const lid = new THREE.Group(); lid.position.set(side * -2.6, 0.4, 0); g.add(lid);
    const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.5, 5.2), accentMat); lidMesh.position.x = side * 2.6; lid.add(lidMesh);
    const lidStripe = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.52, 0.8), goldMat); lidStripe.position.set(side * 2.6, 0.01, 0); lid.add(lidStripe);
    hatches.push({ group: g, lid, glow: glowPlane.material, side, open: 0 });
  }

  // ---- turrets (track the player)
  const turrets = [];
  const turretBase = new THREE.CylinderGeometry(1.7, 2.0, 1.2, 10), turretHead = new THREE.SphereGeometry(1.4, 12, 8), barrelGeo = new THREE.CylinderGeometry(0.24, 0.24, 4.4, 6);
  for (const [tx, ty, tz, parent] of [[-15, HH + 3.9, 22, hullFront], [15, HH + 3.9, 22, hullFront], [-18, -HH - 0.5, -20, hullRear], [18, -HH - 0.5, -20, hullRear], [-48, 6.0, -14, wingL], [48, 6.0, -14, wingR], [0, HH + 3.9, -50, hullRear]]) {
    const g = new THREE.Group(); g.position.set(tx, ty, tz); parent.add(g);
    g.add(new THREE.Mesh(turretBase, trimMat));
    const head = new THREE.Group(); head.position.y = 0.9; g.add(head);
    head.add(new THREE.Mesh(turretHead, plateMat));
    for (const bx of [-0.6, 0.6]) { const b = new THREE.Mesh(barrelGeo, trimMat); b.rotation.x = Math.PI / 2; b.position.set(bx, 0.2, 2.2); head.add(b); }
    turrets.push(head);
  }

  // ---- sparse mechanical detail in the flank trench (between cheek and dorsal plate), instanced
  const greebleGeo = new THREE.BoxGeometry(1, 1, 1);
  const NG = 70;
  const greebles = new THREE.InstancedMesh(greebleGeo, darkMat, NG);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  for (let i = 0; i < NG; i++) {
    const z = rng.range(-56, 36);
    const side = rng.sign();
    if (i % 3 === 0) { v.set(side * rng.range(4, 10), HH + 3.3, z); sc.set(rng.range(1.2, 2.6), rng.range(0.4, 0.9), rng.range(1.5, 4)); if (Math.abs(v.x) < 8.5 && v.x * side > 0) v.x = side * 8.5; }
    else { v.set(side * (HW * (z > 22 ? 0.9 : 1) + 0.3), rng.range(5, 8.5), z); sc.set(rng.range(0.6, 1.4), rng.range(0.8, 2.2), rng.range(1.5, 5)); }
    q.identity(); m4.compose(v, q, sc); greebles.setMatrixAt(i, m4);
  }
  greebles.instanceMatrix.needsUpdate = true; hullRear.add(greebles);

  // ---- running lights along the dorsal plate edge
  const lightGeo = new THREE.SphereGeometry(0.45, 8, 6);
  const lights = new THREE.InstancedMesh(lightGeo, redLightMat, 36);
  for (let i = 0; i < 36; i++) {
    const side = i % 2 ? 1 : -1; const z = -54 + (i >> 1) * 5.5;
    v.set(side * (z > 26 ? 12 : 18.6), HH + 3.4, z); m4.compose(v, q, sc.set(1, 1, 1)); lights.setMatrixAt(i, m4);
  }
  lights.instanceMatrix.needsUpdate = true; hullRear.add(lights);

  root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });

  const damageAnchors = [
    new THREE.Vector3(-16, 12, -30), new THREE.Vector3(18, 9, 10), new THREE.Vector3(-10, -12, 20), new THREE.Vector3(12, 13, -50),
    new THREE.Vector3(-50, 5, -4), new THREE.Vector3(52, 4, -6), new THREE.Vector3(-31, -8, 50), new THREE.Vector3(33, -4, 44),
    new THREE.Vector3(0, 22, 30), new THREE.Vector3(-22, 3, -10), new THREE.Vector3(74, 2, -10), new THREE.Vector3(-74, 2, -10),
  ];

  return {
    root, parts, weakPoints, emitters, hatches, engines, engineGlowMat, engineDiscMat, lensMat, turrets, petals, runningLights, redLightMat, damageAnchors, HW, HH,
    materials: [plateMat, darkMat, trimMat, accentMat, goldMat, glassMat, redLightMat, engineRimMat, engineGlowMat, engineDiscMat, lensMat],
    textures: Object.values(tex),
  };
}
