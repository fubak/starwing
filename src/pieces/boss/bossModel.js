// The GORGON — Venomian dreadnought. Procedural lofted hull, panel textures,
// weak points per phase, iris-guarded core, engines, hatches, greebles.

export const PALETTE = {
  hull: 0x4b5666,
  hullDark: 0x262b36,
  accent: 0x8e1d24,
  trim: 0x14171f,
  weak: 0xffb347,
  core: 0xff3020,
  engine: 0x6fd0ff,
};

// ---------------------------------------------------------------- textures
function makeHullTextures(THREE, rng) {
  const S = 1024;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const c = cv.getContext('2d');
  const ev = document.createElement('canvas'); ev.width = ev.height = S;
  const e = ev.getContext('2d');
  const rv = document.createElement('canvas'); rv.width = rv.height = S;
  const r = rv.getContext('2d');
  c.fillStyle = '#5b6678'; c.fillRect(0, 0, S, S);
  e.fillStyle = '#000'; e.fillRect(0, 0, S, S);
  r.fillStyle = '#7a7a7a'; r.fillRect(0, 0, S, S);
  // irregular panel grid
  const cols = 10, rows = 10;
  const xs = [0]; for (let i = 1; i < cols; i++) xs.push((i / cols + (rng.next() - 0.5) * 0.05) * S); xs.push(S);
  const ys = [0]; for (let i = 1; i < rows; i++) ys.push((i / rows + (rng.next() - 0.5) * 0.05) * S); ys.push(S);
  for (let i = 0; i < cols; i++) for (let j = 0; j < rows; j++) {
    const x0 = xs[i], x1 = xs[i + 1], y0 = ys[j], y1 = ys[j + 1];
    const t = rng.next();
    const shade = 78 + Math.floor(t * 34);
    c.fillStyle = `rgb(${shade - 6},${shade},${shade + 14})`;
    c.fillRect(x0 + 2, y0 + 2, x1 - x0 - 4, y1 - y0 - 4);
    r.fillStyle = `rgb(${110 + Math.floor(rng.next() * 60)},0,0)`; r.fillStyle = r.fillStyle.replace(/,0,0\)/, (m) => m); // roughness in R (we use grayscale)
    const rough = 100 + Math.floor(rng.next() * 80); r.fillStyle = `rgb(${rough},${rough},${rough})`;
    r.fillRect(x0 + 2, y0 + 2, x1 - x0 - 4, y1 - y0 - 4);
    // sub-panel lines
    if (rng.next() < 0.5) {
      c.strokeStyle = 'rgba(20,24,32,0.7)'; c.lineWidth = 2;
      const my = (y0 + y1) / 2; c.beginPath(); c.moveTo(x0 + 6, my); c.lineTo(x1 - 6, my); c.stroke();
    }
    // hazard / accent stripe
    if (rng.next() < 0.09) {
      c.fillStyle = '#8e1d24'; c.fillRect(x0 + 6, y0 + 6, x1 - x0 - 12, Math.min(18, (y1 - y0) * 0.3));
    }
    // vents
    if (rng.next() < 0.18) {
      c.fillStyle = 'rgba(15,18,24,0.9)';
      const n = 4; for (let k = 0; k < n; k++) c.fillRect(x0 + 10, y0 + 12 + k * 9, Math.min(40, x1 - x0 - 20), 4);
    }
    // windows: rows of small warm lights
    if (rng.next() < 0.22) {
      const n = 3 + Math.floor(rng.next() * 8); const wy = y0 + 8 + rng.next() * (y1 - y0 - 16);
      for (let k = 0; k < n; k++) {
        const wx = x0 + 8 + k * 9; if (wx > x1 - 8) break;
        const on = rng.next() < 0.85;
        e.fillStyle = on ? (rng.next() < 0.15 ? '#ff4a2a' : '#ffd9a0') : '#000';
        e.fillRect(wx, wy, 4, 3);
      }
    }
    // rivets
    c.fillStyle = 'rgba(30,34,44,0.8)';
    for (let k = 0; k < 4; k++) { const rx = k % 2 ? x1 - 7 : x0 + 5; const ry = k < 2 ? y0 + 5 : y1 - 7; c.fillRect(rx, ry, 3, 3); }
  }
  // seams
  c.strokeStyle = 'rgba(14,16,22,0.95)'; c.lineWidth = 4;
  for (const x of xs) { c.beginPath(); c.moveTo(x, 0); c.lineTo(x, S); c.stroke(); }
  for (const y of ys) { c.beginPath(); c.moveTo(0, y); c.lineTo(S, y); c.stroke(); }
  // grime streaks
  for (let i = 0; i < 90; i++) {
    const g = c.createLinearGradient(0, 0, 0, 60 + rng.next() * 120);
    g.addColorStop(0, 'rgba(10,12,18,0.35)'); g.addColorStop(1, 'rgba(10,12,18,0)');
    c.save(); c.translate(rng.next() * S, rng.next() * S); c.fillStyle = g; c.fillRect(-3, 0, 6 + rng.next() * 8, 60 + rng.next() * 120); c.restore();
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
  // perimeter lengths for u
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
        vec3 col = uColor * 0.35 + hot * (0.9 + plasma * 1.4) * pulse + uColor * fres * 3.0;
        col = mix(col, vec3(2.5), uFlash);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

// ---------------------------------------------------------------- engine glow
function makeEngineGlowMaterial(THREE) {
  return new THREE.ShaderMaterial({
    transparent: true, blending: THREE.AdditiveBlending, depthWrite: false,
    uniforms: { uTime: { value: 0 }, uPower: { value: 1 } },
    vertexShader: /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `precision highp float; varying vec2 vUv; uniform float uTime; uniform float uPower;
      void main(){ vec2 p = vUv - 0.5; float r = length(p) * 2.0; float ring = smoothstep(1.0, 0.2, r); float core = smoothstep(0.7, 0.0, r);
        float flick = 0.9 + 0.1 * sin(uTime * 37.0 + r * 12.0) * sin(uTime * 23.0);
        vec3 col = (vec3(0.25, 0.65, 1.0) * ring * 1.2 + vec3(0.9, 0.97, 1.0) * core * 2.0) * flick * uPower;
        gl_FragColor = vec4(col, ring); }`,
  });
}

// ---------------------------------------------------------------- build
export function buildBoss(THREE, rng) {
  const root = new THREE.Group(); root.name = 'GORGON';
  const tex = makeHullTextures(THREE, rng);
  const hullMat = new THREE.MeshStandardMaterial({ map: tex.map, roughnessMap: tex.roughnessMap, emissiveMap: tex.emissiveMap, emissive: new THREE.Color(0xffc890), emissiveIntensity: 1.4, metalness: 0.72, roughness: 0.55, color: 0xb9c3d3 });
  const darkMat = new THREE.MeshStandardMaterial({ color: PALETTE.hullDark, metalness: 0.85, roughness: 0.4 });
  const trimMat = new THREE.MeshStandardMaterial({ color: PALETTE.trim, metalness: 0.9, roughness: 0.35 });
  const accentMat = new THREE.MeshStandardMaterial({ color: PALETTE.accent, metalness: 0.6, roughness: 0.42 });
  const redLightMat = new THREE.MeshBasicMaterial({ color: 0xff2a1a });
  const engineRimMat = new THREE.MeshStandardMaterial({ color: 0x1a2a44, metalness: 0.9, roughness: 0.3, emissive: 0x1b64c8, emissiveIntensity: 1.2 });

  const parts = {}; // separable chunks for the final break-up
  const mk = (name, parent = root) => { const g = new THREE.Group(); g.name = name; parent.add(g); parts[name] = g; return g; };
  const hullFront = mk('hullFront'), hullRear = mk('hullRear'), wingL = mk('wingL'), wingR = mk('wingR'), tower = mk('tower');
  const armL = mk('armL'), armR = mk('armR');

  // ---- main hull (rear + front halves share a profile; split at z=0)
  const prof = chamferRect(16, 9, 4.5);
  hullRear.add(new THREE.Mesh(loft(THREE, prof, [
    { z: -62, sx: 0.7, sy: 0.7, oy: 1 }, { z: -52, sx: 0.95, sy: 0.95 }, { z: -20, sx: 1.0, sy: 1.0 }, { z: 0.5, sx: 1.0, sy: 1.0 },
  ]), hullMat));
  hullFront.add(new THREE.Mesh(loft(THREE, prof, [
    { z: -0.5, sx: 1.0, sy: 1.0 }, { z: 22, sx: 1.0, sy: 1.0 }, { z: 44, sx: 0.86, sy: 0.8, oy: 1.2 }, { z: 60, sx: 0.55, sy: 0.5, oy: 1.5 }, { z: 70, sx: 0.28, sy: 0.3, oy: 2 },
  ]), hullMat));
  // dorsal spine
  const spineProf = chamferRect(6, 4, 1.8);
  hullRear.add(new THREE.Mesh(loft(THREE, spineProf, [{ z: -58, sx: 0.5, sy: 0.6, oy: 9 }, { z: -40, sx: 1, sy: 1, oy: 10.5 }, { z: 0.5, sx: 1, sy: 1, oy: 10.5 }]), darkMat));
  // ventral keel
  const keel = new THREE.Mesh(loft(THREE, chamferRect(5, 3.5, 1.5), [{ z: -50, sx: 0.6, sy: 0.6, oy: -9 }, { z: -30, sx: 1, sy: 1, oy: -10.5 }, { z: 30, sx: 1, sy: 1, oy: -10.5 }, { z: 48, sx: 0.5, sy: 0.5, oy: -9 }]), accentMat);
  hullFront.add(keel);
  // side accent stripes (thin red panels)
  for (const s of [-1, 1]) {
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.6, 60), accentMat); stripe.position.set(s * 16.2, 2.5, -20); hullRear.add(stripe);
    const stripe2 = new THREE.Mesh(new THREE.BoxGeometry(0.6, 1.6, 34), accentMat); stripe2.position.set(s * 16.0, 2.5, 20); hullFront.add(stripe2);
  }

  // ---- wings (lofted along local z then rotated to span ±x)
  const wingProf = [[-15, 0], [-6, 2.6], [6, 2.2], [15, 0.4], [16, 0], [15, -0.6], [6, -2.4], [-6, -2.8]];
  const wingGeo = loft(THREE, wingProf, [
    { z: 0, sx: 1.0, sy: 1.0 }, { z: 28, sx: 0.95, sy: 0.9, ox: 4 }, { z: 58, sx: 0.78, sy: 0.7, ox: 11 }, { z: 84, sx: 0.5, sy: 0.45, ox: 20 },
  ], { uvScale: 14 });
  const wings = { L: wingL, R: wingR };
  const weakPoints = [];
  const runningLights = [];
  for (const side of [-1, 1]) {
    const wg = side < 0 ? wingL : wingR;
    const wm = new THREE.Mesh(wingGeo, hullMat);
    wm.rotation.y = Math.PI / 2; // local +z -> world +x, local -x -> world +z (leading edge forward)
    wm.scale.z = side; // mirror span for the left wing
    wm.position.set(side * 12, 2, 4);
    wg.add(wm);
    // wing tip fin (vertical) w/ red light
    const fin = new THREE.Mesh(new THREE.BoxGeometry(1.2, 14, 10), darkMat); fin.position.set(side * 96, 6, -14); wg.add(fin);
    const finStripe = new THREE.Mesh(new THREE.BoxGeometry(1.4, 3, 8), accentMat); finStripe.position.set(side * 96, 10.5, -14); wg.add(finStripe);
    const tipLight = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 6), redLightMat); tipLight.position.set(side * 96, 13.4, -12); wg.add(tipLight); runningLights.push(tipLight);
    // underslung wing engines
    const wEng = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 4.8, 22, 20), darkMat); wEng.rotation.x = Math.PI / 2; wEng.position.set(side * 62, -1.5, -14); wg.add(wEng);
    const wEngRim = new THREE.Mesh(new THREE.TorusGeometry(4.6, 0.5, 8, 24), engineRimMat); wEngRim.position.set(side * 62, -1.5, -25.2); wg.add(wEngRim);
    // shield generator nodes (phase 1)
    for (const [wx, wz] of [[40, -2], [76, -8]]) {
      const base = new THREE.Group(); base.position.set(side * wx, 4.5 + (wx > 60 ? -0.8 : 0), wz); wg.add(base);
      const ped = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 4.4, 2.6, 12), trimMat); ped.position.y = 0.6; base.add(ped);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(4.3, 0.42, 8, 32), trimMat); ring.rotation.x = Math.PI / 2; ring.position.y = 4.6; base.add(ring);
      for (let k = 0; k < 4; k++) {
        const strut = new THREE.Mesh(new THREE.BoxGeometry(0.7, 5.2, 1.2), darkMat);
        const a = k * Math.PI / 2 + Math.PI / 4; strut.position.set(Math.cos(a) * 4.1, 3.2, Math.sin(a) * 4.1); strut.rotation.y = -a; strut.rotation.z = Math.cos(a) * 0.25; strut.rotation.x = -Math.sin(a) * 0.25; base.add(strut);
      }
      const wpMat = makeWeakPointMaterial(THREE, PALETTE.weak);
      const orb = new THREE.Mesh(new THREE.SphereGeometry(3.0, 24, 18), wpMat); orb.position.y = 4.6; base.add(orb);
      weakPoints.push({ name: 'shield generator', phase: 1, mesh: orb, group: base, hp: 100, maxHp: 100, alive: true, radius: 4.2, mat: wpMat, flash: 0 });
    }
    // wing-top greeble slabs
    for (let i = 0; i < 5; i++) {
      const slab = new THREE.Mesh(new THREE.BoxGeometry(6 + rng.next() * 8, 1.2 + rng.next() * 1.4, 4 + rng.next() * 6), i % 2 ? darkMat : hullMat);
      slab.position.set(side * (22 + i * 13 + rng.next() * 4), 2.5 + rng.next(), -6 + rng.next() * 6 - i * 1.5); wg.add(slab);
    }
  }

  // ---- command tower + core
  const towerGeo = loft(THREE, chamferRect(9, 7, 2.5), [{ z: 6, sx: 0.85, sy: 0.7 }, { z: 20, sx: 1, sy: 1 }, { z: 38, sx: 1, sy: 1 }, { z: 46, sx: 0.8, sy: 0.85, oy: 0.4 }]);
  const towerMesh = new THREE.Mesh(towerGeo, hullMat); towerMesh.position.y = 15; tower.add(towerMesh);
  const towerBrow = new THREE.Mesh(new THREE.BoxGeometry(22, 2.2, 12), darkMat); towerBrow.position.set(0, 23, 40); tower.add(towerBrow);
  const antenna = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.5, 16, 6), trimMat); antenna.position.set(0, 30, 14); tower.add(antenna);
  const antLight = new THREE.Mesh(new THREE.SphereGeometry(0.6, 8, 6), redLightMat); antLight.position.set(0, 38.3, 14); tower.add(antLight); runningLights.push(antLight);
  // core eye: recessed red lens inside an iris of 6 armored petals
  const coreMat = makeWeakPointMaterial(THREE, PALETTE.core);
  const core = new THREE.Mesh(new THREE.SphereGeometry(4.6, 32, 24), coreMat); core.position.set(0, 15, 42.4); tower.add(core);
  const socket = new THREE.Mesh(new THREE.TorusGeometry(6.2, 1.1, 10, 36), trimMat); socket.position.set(0, 15, 46.8); tower.add(socket);
  const petals = [];
  for (let k = 0; k < 6; k++) {
    const hinge = new THREE.Group(); const a = (k / 6) * Math.PI * 2;
    hinge.position.set(Math.cos(a) * 5.6, 15 + Math.sin(a) * 5.6, 47.6); hinge.rotation.z = a;
    // wedge whose apex sits at the eye centre (hinge-local x = -5.6) and points outward to the hinge
    const petal = new THREE.Mesh(new THREE.CylinderGeometry(6.6, 6.6, 1.0, 6, 1, false, Math.PI / 3, Math.PI / 3), k % 2 ? darkMat : accentMat);
    petal.rotation.x = Math.PI / 2;
    petal.position.set(-5.6, 0, 0);
    hinge.add(petal); tower.add(hinge); petals.push(hinge);
  }
  weakPoints.push({ name: 'reactor core', phase: 3, mesh: core, group: tower, hp: 220, maxHp: 220, alive: true, radius: 5.5, mat: coreMat, flash: 0 });

  // ---- cannon arms (phase 2 weak points + laser emitters)
  const emitters = [];
  for (const side of [-1, 1]) {
    const ag = side < 0 ? armL : armR;
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 4.2, 64, 16), hullMat); barrel.rotation.x = Math.PI / 2; barrel.position.set(side * 20, -6, 36); ag.add(barrel);
    const pylon = new THREE.Mesh(new THREE.BoxGeometry(6, 8, 26), darkMat); pylon.position.set(side * 17, -3, 14); ag.add(pylon);
    const muzzle = new THREE.Mesh(new THREE.CylinderGeometry(4.8, 4.0, 9, 16, 1, true), trimMat); muzzle.rotation.x = Math.PI / 2; muzzle.position.set(side * 20, -6, 70); ag.add(muzzle);
    for (let k = 0; k < 3; k++) { const ring = new THREE.Mesh(new THREE.TorusGeometry(4.2, 0.35, 8, 28), accentMat); ring.position.set(side * 20, -6, 54 + k * 5); ag.add(ring); }
    const emitter = new THREE.Mesh(new THREE.SphereGeometry(2.1, 16, 12), new THREE.MeshBasicMaterial({ color: 0xff5030 })); emitter.position.set(side * 20, -6, 72.5); emitter.scale.z = 0.5; ag.add(emitter);
    emitters.push({ mesh: emitter, side });
    // power cell (weak point) on the outside of the arm
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(3.6, 3.6, 5, 8), trimMat); housing.rotation.z = Math.PI / 2; housing.position.set(side * 26, -6, 30); ag.add(housing);
    const cellMat = makeWeakPointMaterial(THREE, PALETTE.weak);
    const cell = new THREE.Mesh(new THREE.SphereGeometry(2.7, 20, 16), cellMat); cell.position.set(side * 28.6, -6, 30); ag.add(cell);
    weakPoints.push({ name: 'cannon power cell', phase: 2, mesh: cell, group: ag, hp: 130, maxHp: 130, alive: true, radius: 3.8, mat: cellMat, flash: 0 });
  }

  // ---- rear engines
  const engineGlowMat = makeEngineGlowMaterial(THREE);
  const engines = [];
  for (const [ex, ey, r] of [[0, 3, 6.5], [-11, -3, 5], [11, -3, 5]]) {
    const noz = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.8, 10, 20, 1, true), darkMat); noz.rotation.x = Math.PI / 2; noz.position.set(ex, ey, -66); noz.material.side = THREE.DoubleSide; hullRear.add(noz);
    const rim = new THREE.Mesh(new THREE.TorusGeometry(r, 0.6, 8, 28), engineRimMat); rim.position.set(ex, ey, -71); hullRear.add(rim);
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(r * 2.2, r * 2.2), engineGlowMat); glow.position.set(ex, ey, -70.5); glow.rotation.y = Math.PI; hullRear.add(glow);
    engines.push(glow);
  }
  // wing engine glows
  for (const side of [-1, 1]) {
    const glow = new THREE.Mesh(new THREE.PlaneGeometry(9.5, 9.5), engineGlowMat); glow.position.set(side * 62, -1.5, -25.6); glow.rotation.y = Math.PI; (side < 0 ? wingL : wingR).add(glow); engines.push(glow);
  }

  // ---- missile hatches (dorsal, ahead of the tower)
  const hatches = [];
  for (let i = 0; i < 6; i++) {
    const side = i % 2 ? 1 : -1, row = Math.floor(i / 2);
    const g = new THREE.Group(); g.position.set(side * 9.5, 9.4, -18 - row * 9); hullRear.add(g);
    const frame = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.8, 6.4), trimMat); g.add(frame);
    const glowPlane = new THREE.Mesh(new THREE.PlaneGeometry(5.2, 5.2), new THREE.MeshBasicMaterial({ color: 0xff3a1a, transparent: true, opacity: 0, depthWrite: false })); glowPlane.rotation.x = -Math.PI / 2; glowPlane.position.y = 0.42; g.add(glowPlane);
    const lid = new THREE.Group(); lid.position.set(side * -2.6, 0.5, 0); g.add(lid);
    const lidMesh = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.5, 5.2), accentMat); lidMesh.position.x = side * 2.6; lid.add(lidMesh);
    hatches.push({ group: g, lid, glow: glowPlane.material, side, open: 0 });
  }

  // ---- turrets (decorative, track the player)
  const turrets = [];
  const turretBase = new THREE.CylinderGeometry(1.6, 1.9, 1.2, 10), turretHead = new THREE.SphereGeometry(1.3, 12, 8), barrelGeo = new THREE.CylinderGeometry(0.22, 0.22, 4.2, 6);
  for (const [tx, ty, tz, parent] of [[-12, 10.5, 10, hullFront], [12, 10.5, 10, hullFront], [-15, -9.5, -20, hullRear], [15, -9.5, -20, hullRear], [-50, 5.8, -16, wingL], [50, 5.8, -16, wingR], [0, 11, -50, hullRear]]) {
    const g = new THREE.Group(); g.position.set(tx, ty, tz); parent.add(g);
    g.add(new THREE.Mesh(turretBase, trimMat));
    const head = new THREE.Group(); head.position.y = 0.9; g.add(head);
    head.add(new THREE.Mesh(turretHead, darkMat));
    for (const bx of [-0.6, 0.6]) { const b = new THREE.Mesh(barrelGeo, trimMat); b.rotation.x = Math.PI / 2; b.position.set(bx, 0.2, 2.2); head.add(b); }
    turrets.push(head);
  }

  // ---- greebles (instanced boxes over hull top/sides)
  const greebleGeo = new THREE.BoxGeometry(1, 1, 1);
  const greebles = new THREE.InstancedMesh(greebleGeo, darkMat, 220);
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  for (let i = 0; i < 220; i++) {
    const onTop = rng.next() < 0.55;
    const z = rng.range(-58, 40);
    const w = 16 * (z > 22 ? 0.9 : 1);
    if (onTop) v.set(rng.range(-w + 2, w - 2), 9.6 + (Math.abs(v.x) < 6 ? 0 : 0), z); else v.set(rng.sign() * (w + 0.4), rng.range(-6, 6), z);
    if (onTop && Math.abs(v.x) < 7 && z < 2) v.x = rng.sign() * rng.range(7, w - 2); // keep off the spine
    sc.set(rng.range(0.8, 3.5), rng.range(0.4, 1.6), rng.range(1, 5));
    if (!onTop) { const t = sc.x; sc.x = sc.y; sc.y = t; }
    q.identity();
    m4.compose(v, q, sc); greebles.setMatrixAt(i, m4);
  }
  greebles.instanceMatrix.needsUpdate = true; hullRear.add(greebles);

  // ---- running lights along hull edges
  const lightGeo = new THREE.SphereGeometry(0.45, 8, 6);
  const lights = new THREE.InstancedMesh(lightGeo, redLightMat, 40);
  for (let i = 0; i < 40; i++) {
    const side = i % 2 ? 1 : -1; const z = -58 + (i >> 1) * 6;
    v.set(side * (z > 44 ? 12 : 16.3), z > 44 ? 8 : 9.2, z); m4.compose(v, q, sc.set(1, 1, 1)); lights.setMatrixAt(i, m4);
  }
  lights.instanceMatrix.needsUpdate = true; hullRear.add(lights);

  root.traverse((o) => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });

  // damage anchor points (where fires/smoke spawn as HP drops), in root-local space
  const damageAnchors = [
    new THREE.Vector3(-14, 9, -30), new THREE.Vector3(15, 6, 10), new THREE.Vector3(-8, -9, 20), new THREE.Vector3(10, 10, -50),
    new THREE.Vector3(-45, 5, -4), new THREE.Vector3(48, 4, -6), new THREE.Vector3(-20, -8, 50), new THREE.Vector3(22, -4, 44),
    new THREE.Vector3(0, 22, 30), new THREE.Vector3(-16, 3, -10), new THREE.Vector3(70, 2, -10), new THREE.Vector3(-70, 2, -10),
  ];

  return {
    root, parts, weakPoints, emitters, hatches, engines, engineGlowMat, turrets, petals, runningLights, redLightMat, damageAnchors,
    materials: [hullMat, darkMat, trimMat, accentMat, redLightMat, engineRimMat, engineGlowMat],
    textures: Object.values(tex),
  };
}
