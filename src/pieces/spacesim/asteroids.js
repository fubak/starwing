// Instanced, varied asteroid belt that wraps around the player so it never runs out.
import * as THREE from 'three';

const _m = new THREE.Matrix4(), _q = new THREE.Quaternion(), _s = new THREE.Vector3(), _p = new THREE.Vector3();

function hashNoise(x, y, z) {
  // cheap value noise for vertex displacement (deterministic)
  const s = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return s - Math.floor(s);
}
function smoothNoise3(x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const f = (t) => t * t * (3 - 2 * t);
  const u = f(xf), v = f(yf), w = f(zf);
  const l = (a, b, t) => a + (b - a) * t;
  const n = (dx, dy, dz) => hashNoise(xi + dx, yi + dy, zi + dz);
  return l(l(l(n(0, 0, 0), n(1, 0, 0), u), l(n(0, 1, 0), n(1, 1, 0), u), v), l(l(n(0, 0, 1), n(1, 0, 1), u), l(n(0, 1, 1), n(1, 1, 1), u), v), w);
}
function fbm(x, y, z, oct = 4) {
  let v = 0, a = 0.5, f = 1;
  for (let i = 0; i < oct; i++) { v += a * (smoothNoise3(x * f, y * f, z * f) * 2 - 1); a *= 0.5; f *= 2.1; }
  return v;
}

function rockGeometry(seed, detail = 3) {
  const g = new THREE.IcosahedronGeometry(1, detail);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  // squash to a random ellipsoid then displace with noise for a chunky, cratered look
  const sx = 0.75 + hashNoise(seed, 1, 2) * 0.6, sy = 0.7 + hashNoise(seed, 3, 4) * 0.6, sz = 0.8 + hashNoise(seed, 5, 6) * 0.5;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = fbm(v.x * 1.6 + seed * 7.1, v.y * 1.6 + seed * 3.3, v.z * 1.6, 4);
    const big = fbm(v.x * 0.7 + seed, v.y * 0.7, v.z * 0.7 + seed * 2, 2);
    const crater = Math.max(0, smoothNoise3(v.x * 2.5 + seed * 11, v.y * 2.5, v.z * 2.5) - 0.62) * 2.2;
    const r = 1 + 0.32 * big + 0.16 * n - crater;
    v.multiplyScalar(r);
    v.x *= sx; v.y *= sy; v.z *= sz;
    pos.setXYZ(i, v.x, v.y, v.z);
  }
  g.computeVertexNormals();
  return g;
}

function rockTextures() {
  const S = 512;
  const cv = document.createElement('canvas'); cv.width = cv.height = S;
  const g = cv.getContext('2d');
  const img = g.createImageData(S, S);
  const height = new Float32Array(S * S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const u = x / S, v = y / S;
    // tileable-ish via periodic domain
    const a = u * Math.PI * 2, b = v * Math.PI * 2;
    const px = Math.cos(a) * 2, py = Math.sin(a) * 2, pz = Math.cos(b) * 2, pw = Math.sin(b) * 2;
    let h = 0.5 + 0.25 * fbm(px + pz, py + pw, px * 0.5 - pw, 5) + 0.12 * fbm(px * 4 + pw, py * 4, pz * 4, 3);
    const spec = smoothNoise3(px * 12, py * 12 + pz * 12, pw * 12);
    h += (spec - 0.5) * 0.1;
    height[y * S + x] = h;
    const i = (y * S + x) * 4;
    const base = 0.55 + (h - 0.5) * 1.2;
    const warm = smoothNoise3(px * 0.7, pw * 0.7, pz);
    img.data[i] = 255 * Math.min(1, base * (0.62 + 0.25 * warm));
    img.data[i + 1] = 255 * Math.min(1, base * (0.56 + 0.12 * warm));
    img.data[i + 2] = 255 * Math.min(1, base * (0.50 + 0.02 * warm));
    img.data[i + 3] = 255;
  }
  g.putImageData(img, 0, 0);
  const map = new THREE.CanvasTexture(cv);
  map.colorSpace = THREE.SRGBColorSpace; map.wrapS = map.wrapT = THREE.RepeatWrapping;
  // normal map from height
  const cv2 = document.createElement('canvas'); cv2.width = cv2.height = S;
  const g2 = cv2.getContext('2d');
  const img2 = g2.createImageData(S, S);
  for (let y = 0; y < S; y++) for (let x = 0; x < S; x++) {
    const l = height[y * S + ((x - 1 + S) % S)], r = height[y * S + ((x + 1) % S)];
    const d = height[((y - 1 + S) % S) * S + x], u = height[((y + 1) % S) * S + x];
    const nx = (l - r) * 3.0, ny = (d - u) * 3.0;
    const len = Math.hypot(nx, ny, 1);
    const i = (y * S + x) * 4;
    img2.data[i] = 128 + 127 * (nx / len); img2.data[i + 1] = 128 + 127 * (ny / len); img2.data[i + 2] = 128 + 127 * (1 / len); img2.data[i + 3] = 255;
  }
  g2.putImageData(img2, 0, 0);
  const normalMap = new THREE.CanvasTexture(cv2);
  normalMap.wrapS = normalMap.wrapT = THREE.RepeatWrapping;
  return { map, normalMap };
}

/**
 * @param rng deterministic rng
 * @param opts.count total asteroids, opts.extent half-size of wrap box around the player
 */
export function buildAsteroidBelt(rng, { count = 900, extent = 520, thickness = 170, envMap = null } = {}) {
  const { map, normalMap } = rockTextures();
  const mat = new THREE.MeshStandardMaterial({
    map, normalMap, normalScale: new THREE.Vector2(0.9, 0.9), roughness: 0.82, metalness: 0.08, envMap, envMapIntensity: 0.6,
  });
  const variants = 4;
  const per = Math.ceil(count / variants);
  const meshes = [];
  const rocks = []; // {pos, rotAxis, rotSpeed, scale, quat, mesh, index}
  for (let v = 0; v < variants; v++) {
    // variants 0-1 are the medium/large rocks (more detail), 2-3 the small pebbles (cheap)
    const geo = rockGeometry(v * 13 + 1, v < 2 ? 2 : 1);
    const im = new THREE.InstancedMesh(geo, mat, per);
    im.castShadow = false; im.receiveShadow = false;
    im.frustumCulled = false;
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    const color = new THREE.Color();
    for (let i = 0; i < per; i++) {
      // belt: a wide slab in the y direction (thin), spread on x/z
      const pos = new THREE.Vector3(rng.range(-extent, extent), rng.range(-thickness, thickness) * Math.pow(rng.next(), 0.6), rng.range(-extent, extent));
      const sizeRoll = rng.next();
      const scale = v < 2 ? (sizeRoll < 0.12 ? rng.range(28, 60) : rng.range(9, 22)) : rng.range(2.5, 8);
      const quat = new THREE.Quaternion().setFromEuler(new THREE.Euler(rng.range(0, 6.28), rng.range(0, 6.28), rng.range(0, 6.28)));
      const axis = new THREE.Vector3(rng.range(-1, 1), rng.range(-1, 1), rng.range(-1, 1)).normalize();
      const rotSpeed = rng.range(0.05, 0.5) * (scale > 20 ? 0.25 : 1);
      const tint = rng.next();
      color.setHSL(0.06 + tint * 0.05, 0.25 + rng.next() * 0.25, 0.5 + rng.next() * 0.3);
      im.setColorAt(i, color);
      rocks.push({ pos, quat, axis, rotSpeed, scale, mesh: im, index: i });
    }
    meshes.push(im);
  }
  const group = new THREE.Group();
  for (const m of meshes) group.add(m);

  function update(dt, center) {
    for (const r of rocks) {
      // wrap around the player so the belt is endless
      for (const k of ['x', 'z']) {
        const d = r.pos[k] - center[k];
        if (d > extent) r.pos[k] -= extent * 2; else if (d < -extent) r.pos[k] += extent * 2;
      }
      const dy = r.pos.y - center.y;
      if (dy > thickness * 1.6) r.pos.y -= thickness * 3.2; else if (dy < -thickness * 1.6) r.pos.y += thickness * 3.2;
      _q.setFromAxisAngle(r.axis, r.rotSpeed * dt);
      r.quat.premultiply(_q);
      _s.setScalar(r.scale);
      _m.compose(r.pos, r.quat, _s);
      r.mesh.setMatrixAt(r.index, _m);
    }
    for (const m of meshes) m.instanceMatrix.needsUpdate = true;
  }
  function dispose() {
    for (const m of meshes) m.geometry.dispose();
    mat.dispose(); map.dispose(); normalMap.dispose();
  }
  return { group, rocks, update, dispose, material: mat };
}
