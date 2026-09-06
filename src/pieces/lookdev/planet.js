import * as THREE from 'three';

/**
 * Procedural planet: seamless equirect height/biome texture (3D value noise
 * sampled on the sphere), custom-lit surface shader (wrap diffuse, ocean
 * specular, night-side city lights, limb fresnel), a drifting cloud shell and
 * an additive atmosphere halo. Colours come from preset.planet so the planet
 * re-tints with the look.
 */

// ---- tiny seeded 3D value noise (JS side, for texture baking)
function makeNoise(seed = 1) {
  const perm = new Uint8Array(512);
  let s = seed >>> 0 || 1;
  const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grad = new Float32Array(256);
  for (let i = 0; i < 256; i++) grad[i] = rnd();
  const h = (x, y, z) => grad[perm[perm[perm[x & 255] + (y & 255)] + (z & 255)]];
  const sm = (t) => t * t * (3 - 2 * t);
  const noise = (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
    const fx = sm(x - xi), fy = sm(y - yi), fz = sm(z - zi);
    const l = (a, b, t) => a + (b - a) * t;
    return l(
      l(l(h(xi, yi, zi), h(xi + 1, yi, zi), fx), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), fx), fy),
      l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), fx), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), fx), fy),
      fz);
  };
  const fbm = (x, y, z, oct = 6, lac = 2.1, gain = 0.5) => {
    let a = 0.5, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) { sum += a * noise(x, y, z); norm += a; x = x * lac + 13.1; y = y * lac + 7.7; z = z * lac + 3.3; a *= gain; }
    return sum / norm;
  };
  return { noise, fbm, rnd };
}

/** Bake R=height, G=city density, B=cloud coverage into one texture. */
export function bakePlanetTexture(seed = 7, W = 1024, H = 512) {
  const { fbm, noise } = makeNoise(seed);
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const img = g.createImageData(W, H);
  const d = img.data;
  for (let j = 0; j < H; j++) {
    const v = j / H, lat = (0.5 - v) * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
    for (let i = 0; i < W; i++) {
      const u = i / W, lon = u * Math.PI * 2;
      const x = cl * Math.cos(lon), y = sl, z = cl * Math.sin(lon);
      // continents: low-frequency fbm with ridged detail
      let hgt = fbm(x * 1.6, y * 1.6, z * 1.6, 6, 2.05, 0.52);
      const ridge = 1 - Math.abs(fbm(x * 5 + 4, y * 5, z * 5, 4) * 2 - 1);
      hgt = hgt * 0.8 + ridge * 0.2 * hgt;
      hgt = Math.min(1, Math.max(0, (hgt - 0.35) * 2.2 + 0.28));
      // city density: cells of noise on lowland coast
      const land = hgt > 0.5 ? Math.min(1, (hgt - 0.5) * 20) : 0;
      const coast = land * (1 - Math.min(1, Math.max(0, (hgt - 0.6) * 8)));
      const cn = noise(x * 60, y * 60, z * 60) * 0.6 + noise(x * 180, y * 180, z * 180) * 0.4;
      const city = coast * Math.max(0, cn - 0.55) * 2.6;
      // clouds: swirly fbm bands, more at mid-latitudes
      let cloud = fbm(x * 3.2 + 20, y * 4.5, z * 3.2, 5, 2.3, 0.55);
      cloud += 0.15 * Math.sin(lat * 6 + noise(x * 2, y * 2, z * 2) * 4);
      cloud = Math.min(1, Math.max(0, (cloud - 0.48) * 3.2));
      // tileable detail (sampled at 8x in the shader) — plain 2D-periodic noise
      const du = (i / W) * 16, dv = (j / H) * 8;
      const det = fbm(du, dv, 3.7, 4, 2.0, 0.55);
      const o = (j * W + i) * 4;
      d[o] = hgt * 255; d[o + 1] = Math.min(255, city * 255); d[o + 2] = cloud * 255; d[o + 3] = det * 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace;
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.RepeatWrapping;
  tex.premultiplyAlpha = false;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.anisotropy = 1;
  return tex;
}

// ---- GPU bake (same channel layout as bakePlanetTexture, at 2048x1024). Used
// when makePlanet gets { gpu: true }: the JS bake is ~1 s at 1024 and would be
// ~4 s at 2048; the shader version is effectively free.
const BAKE_VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const BAKE_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform vec3 uSeed;
  float hash13(vec3 p) { p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p += dot(p, p.yzx + 19.19); return fract((p.x + p.y) * p.z); }
  float vnoise(vec3 p) {
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  // periodic in x/y with integer period so the detail layer tiles seamlessly
  float vnoiseT(vec3 p, vec2 per) {
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    vec3 i1 = vec3(mod(i.x + 1.0, per.x), i.y, i.z), i2 = vec3(i.x, mod(i.y + 1.0, per.y), i.z), i3 = vec3(i1.x, i2.y, i.z);
    i.x = mod(i.x, per.x); i.y = mod(i.y, per.y); i1.y = i.y; i2.x = i.x;
    return mix(mix(hash13(i), hash13(i1), f.x), mix(hash13(i2), hash13(i3), f.x), f.y);
  }
  float fbmN(vec3 p, int oct, float lac, float gain) {
    float a = 0.5, s = 0.0, n = 0.0;
    for (int i = 0; i < 8; i++) { if (i >= oct) break; s += a * vnoise(p); n += a; p = p * lac + vec3(13.1, 7.7, 3.3); a *= gain; }
    return s / n;
  }
  void main() {
    float lat = (0.5 - vUv.y) * 3.1415926, lon = vUv.x * 6.2831853;
    vec3 d = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon)) + uSeed;
    float hgt = fbmN(d * 1.6, 6, 2.05, 0.52);
    float ridge = 1.0 - abs(fbmN(d * 5.0 + vec3(4.0, 0.0, 0.0), 4, 2.1, 0.5) * 2.0 - 1.0);
    hgt = hgt * 0.8 + ridge * 0.2 * hgt;
    hgt = clamp((hgt - 0.35) * 2.2 + 0.28, 0.0, 1.0);
    float land = hgt > 0.5 ? min(1.0, (hgt - 0.5) * 20.0) : 0.0;
    float coast = land * (1.0 - clamp((hgt - 0.6) * 8.0, 0.0, 1.0));
    float cn = vnoise(d * 60.0) * 0.6 + vnoise(d * 180.0) * 0.4;
    float city = coast * max(0.0, cn - 0.55) * 2.6;
    float cloud = fbmN(vec3(d.x * 3.2 + 20.0, d.y * 4.5, d.z * 3.2), 5, 2.3, 0.55);
    cloud += 0.15 * sin(lat * 6.0 + vnoise(d * 2.0) * 4.0);
    cloud = clamp((cloud - 0.48) * 3.2, 0.0, 1.0);
    vec2 duv = vec2(vUv.x * 16.0, vUv.y * 8.0);
    float det = 0.0, a = 0.5, n = 0.0; vec2 per = vec2(16.0, 8.0);
    for (int i = 0; i < 4; i++) { det += a * vnoiseT(vec3(duv, 3.7), per); n += a; duv *= 2.0; per *= 2.0; a *= 0.55; }
    det /= n;
    gl_FragColor = vec4(hgt, min(1.0, city), cloud, det);
  }
`;

/** GPU bake of the planet data texture (R=height, G=cities, B=clouds, A=tiling detail). */
export function bakePlanetTextureGPU(renderer, seed = 7, W = 2048, H = 1024) {
  const rt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: false, stencilBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping });
  const s = (seed * 0.61803398875) % 1;
  const mat = new THREE.ShaderMaterial({ vertexShader: BAKE_VERT, fragmentShader: BAKE_FRAG, depthTest: false, depthWrite: false, uniforms: { uSeed: { value: new THREE.Vector3(s * 7.3 + 1.1, seed * 0.37 + 2.9, s * 3.1 + 5.7) } } });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  const sc = new THREE.Scene(); sc.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt); renderer.render(sc, cam); renderer.setRenderTarget(prev);
  quad.geometry.dispose(); mat.dispose();
  rt.texture.colorSpace = THREE.NoColorSpace;
  rt.texture.userData.rt = rt;
  return rt.texture;
}

const SURF_VERT = /* glsl */ `
  varying vec3 vN, vWP; varying vec2 vUv;
  void main() {
    vUv = uv;
    vN = normalize(mat3(modelMatrix) * normal);
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vWP = wp.xyz;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const SURF_FRAG = /* glsl */ `
  varying vec3 vN, vWP; varying vec2 vUv;
  uniform sampler2D uMap; uniform vec2 uPx;
  uniform vec3 uSunDir, uSunColor, uAmbient;
  uniform vec3 uOcean, uOceanDeep, uLand, uLandHigh, uIce, uAtmo, uAtmoWarm, uNight;
  uniform float uIceLat, uTime;
  void main() {
    vec4 tex = texture2D(uMap, vUv);
    float det = texture2D(uMap, vUv * vec2(8.0, 8.0)).a;
    float det2 = texture2D(uMap, vUv * vec2(37.0, 37.0) + vec2(0.13, 0.41)).a;
    float h = tex.r + (det - 0.5) * 0.13 + (det2 - 0.5) * 0.05;
    vec3 N = normalize(vN);
    vec3 V = normalize(cameraPosition - vWP);
    vec3 L = normalize(uSunDir);
    float NdL = dot(N, L);

    // biomes
    float land = smoothstep(0.495, 0.515, h);
    float shelf = smoothstep(0.42, 0.5, h);
    vec3 ocean = mix(uOceanDeep, uOcean, shelf);
    ocean *= 0.9 + 0.2 * det2 + 0.12 * (det - 0.5); // swell / current texture so open water is not a flat fill
    vec3 lowland = mix(uLand, uLand * vec3(1.15, 1.05, 0.7), smoothstep(0.5, 0.56, h)); // beach tint
    vec3 landCol = mix(uLand * 0.85, uLandHigh, smoothstep(0.58, 0.8, h));
    landCol = mix(lowland, landCol, smoothstep(0.52, 0.62, h));
    // snow caps on high ground + polar ice
    float lat = abs(vUv.y - 0.5) * 2.0;
    float ice = smoothstep(uIceLat - 0.08 + (h - 0.5) * 0.3, uIceLat + 0.05, lat) + smoothstep(0.82, 0.9, h) * land;
    vec3 albedo = mix(ocean, landCol, land);
    albedo = mix(albedo, uIce, clamp(ice, 0.0, 1.0));

    // lighting: wrapped lambert so the terminator is soft, warm at the edge
    float wrap = clamp((NdL + 0.15) / 1.15, 0.0, 1.0);
    float diff = pow(wrap, 1.4);
    // terrain shading: fake slope lighting from the height gradient
    vec2 px = uPx;
    vec2 hxy = vec2(texture2D(uMap, vUv + vec2(px.x, 0.0)).r, texture2D(uMap, vUv + vec2(0.0, px.y)).r) - tex.r;
    float slope = clamp(1.0 + (hxy.x * 12.0 - hxy.y * 8.0) * land * 2.5, 0.5, 1.5);
    slope *= 1.0 + (det - 0.5) * 0.5 * land; // close-range terrain relief
    diff *= slope;
    float term = smoothstep(0.0, 0.35, wrap) * (1.0 - smoothstep(0.35, 0.8, wrap));
    vec3 light = uSunColor * diff + uAtmoWarm * term * 0.2;
    // ocean gloss
    vec3 Hv = normalize(L + V);
    float spec = pow(max(dot(N, Hv), 0.0), 140.0) * (1.0 - land) * (1.0 - ice) * 1.6
               + pow(max(dot(N, Hv), 0.0), 12.0) * (1.0 - land) * 0.12;
    // limb fresnel (in-atmosphere scattering seen through the air column)
    float NdV = max(dot(N, V), 0.0);
    float fres = pow(1.0 - NdV, 3.0);
    float rim = pow(1.0 - NdV, 7.0);
    vec3 atmoCol = mix(uAtmo, uAtmoWarm, smoothstep(0.3, -0.1, NdL) * 0.8);
    vec3 atmo = atmoCol * rim * (0.04 + 0.96 * clamp(NdL * 1.6 + 0.3, 0.0, 1.0)) * 1.4;
    // thin haze over the disc lifts shadows toward atmosphere colour; the limb
    // itself gets the strong in-scatter term so the edge reads as a crisp blue rim
    vec3 col = albedo * (light + uAmbient * 0.35) + uSunColor * spec * clamp(NdL * 4.0, 0.0, 1.0);
    col = mix(col, atmoCol * (0.08 + 0.92 * diff), fres * 0.22);
    col += atmo;
    // night-side city lights, flickering ever so slightly
    float night = smoothstep(0.12, -0.15, NdL);
    float cities = tex.g * (0.9 + 0.1 * sin(uTime * 3.0 + h * 90.0));
    col += uNight * cities * night * 2.2;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const CLOUD_FRAG = /* glsl */ `
  varying vec3 vN, vWP; varying vec2 vUv;
  uniform sampler2D uMap;
  uniform vec3 uSunDir, uSunColor, uCloud, uAtmoWarm, uAmbient;
  uniform float uTime;
  void main() {
    vec2 uv = vUv + vec2(uTime * 0.0012, 0.0);
    float c = texture2D(uMap, uv).b;
    float c2 = texture2D(uMap, uv * 2.0 + vec2(0.31, 0.12) + vec2(uTime * 0.002, 0.0)).b;
    float cov = clamp(c * 0.8 + c2 * 0.45 - 0.15, 0.0, 1.0);
    vec3 N = normalize(vN);
    vec3 V = normalize(cameraPosition - vWP);
    float NdL = dot(N, uSunDir);
    float wrap = clamp((NdL + 0.2) / 1.2, 0.0, 1.0);
    float term = smoothstep(0.0, 0.3, wrap) * (1.0 - smoothstep(0.3, 0.7, wrap));
    vec3 col = uCloud * (uSunColor * wrap * wrap * 1.1 + uAmbient * 0.25) + uAtmoWarm * term * 0.35;
    float rim = pow(1.0 - max(dot(N, V), 0.0), 2.0);
    float alpha = cov * (1.0 - rim * 0.7) * (0.35 + 0.65 * smoothstep(-0.25, 0.1, NdL));
    gl_FragColor = vec4(col, alpha * 0.85);
  }
`;

const HALO_FRAG = /* glsl */ `
  varying vec3 vN, vWP;
  uniform vec3 uSunDir, uAtmo, uAtmoWarm;
  uniform float uStrength;
  void main() {
    vec3 N = normalize(vN);
    vec3 V = normalize(cameraPosition - vWP);
    // back faces: centre of disc is occluded by the planet, so the visible part
    // falls off outward from the limb.
    float t = clamp(-dot(N, V), 0.0, 1.0);
    // tight bright edge + softer outer skirt so the limb reads as a crisp glowing rim
    float glow = pow(t, 6.0) * 1.3 + pow(t, 2.5) * 0.25;
    float NdL = dot(N, uSunDir);
    float lit = clamp(NdL * 1.6 + 0.3, 0.0, 1.0);
    vec3 col = mix(uAtmo, uAtmoWarm, smoothstep(0.1, -0.25, NdL) * 0.8) * glow * lit * uStrength;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/**
 * makePlanet({ radius, seed, preset }) -> Group with .setPreset(resolved),
 * .update(dt, t). Preset is a resolved preset (see presets.resolvePreset).
 */
export function makePlanet({ radius = 640, seed = 7, preset, haloScale = 1.075, gpu = false } = {}) {
  const group = new THREE.Group();
  group.name = 'lookdev-planet';
  let map = gpu ? null : bakePlanetTexture(seed);
  const shared = {
    uMap: { value: map },
    uPx: { value: new THREE.Vector2(1 / (gpu ? 2048 : 1024), 1 / (gpu ? 1024 : 512)) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(1, 1, 1) },
    uAmbient: { value: new THREE.Color(0.2, 0.3, 0.5) },
    uTime: { value: 0 },
  };
  const surfMat = new THREE.ShaderMaterial({
    vertexShader: SURF_VERT, fragmentShader: SURF_FRAG,
    uniforms: {
      ...shared,
      uOcean: { value: new THREE.Color() }, uOceanDeep: { value: new THREE.Color() },
      uLand: { value: new THREE.Color() }, uLandHigh: { value: new THREE.Color() },
      uIce: { value: new THREE.Color() }, uAtmo: { value: new THREE.Color() },
      uAtmoWarm: { value: new THREE.Color() }, uNight: { value: new THREE.Color() },
      uIceLat: { value: 0.8 },
    },
  });
  const surface = new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 48), surfMat);
  if (gpu) {
    // lazy GPU bake on first render (needs the renderer); happens before the
    // first draw so there is no black frame
    surface.onBeforeRender = (renderer) => {
      if (map) return;
      map = bakePlanetTextureGPU(renderer, seed);
      shared.uMap.value = map;
    };
  }
  const cloudMat = new THREE.ShaderMaterial({
    vertexShader: SURF_VERT, fragmentShader: CLOUD_FRAG, transparent: true, depthWrite: false,
    uniforms: { ...shared, uCloud: { value: new THREE.Color() }, uAtmoWarm: { value: new THREE.Color() } },
  });
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.012, 64, 32), cloudMat);
  clouds.renderOrder = 1;
  const haloMat = new THREE.ShaderMaterial({
    vertexShader: SURF_VERT, fragmentShader: HALO_FRAG, side: THREE.BackSide, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
    uniforms: { uSunDir: shared.uSunDir, uAtmo: { value: new THREE.Color() }, uAtmoWarm: { value: new THREE.Color() }, uStrength: { value: 2.2 } },
  });
  const halo = new THREE.Mesh(new THREE.SphereGeometry(radius * haloScale, 64, 32), haloMat);
  halo.renderOrder = 2;
  for (const m of [surfMat, cloudMat, haloMat]) m.toneMapped = false;
  group.add(surface, clouds, halo);

  /** Optional art-direction cheat: light the planet from a direction other than the sky's sun. */
  group.lightDir = null;
  group.setPreset = (p) => {
    const q = p.planet;
    shared.uSunDir.value.copy(group.lightDir ?? p.sun.dir).normalize();
    shared.uSunColor.value.copy(p.sun.color);
    shared.uAmbient.value.copy(p.sky.zenith).lerp(p.sky.horizon, 0.5);
    const su = surfMat.uniforms;
    su.uOcean.value.copy(q.ocean); su.uOceanDeep.value.copy(q.oceanDeep);
    su.uLand.value.copy(q.land); su.uLandHigh.value.copy(q.landHigh);
    su.uIce.value.copy(q.ice); su.uAtmo.value.copy(q.atmo); su.uAtmoWarm.value.copy(q.atmoWarm);
    su.uNight.value.copy(q.night); su.uIceLat.value = q.iceLat;
    cloudMat.uniforms.uCloud.value.copy(q.cloud); cloudMat.uniforms.uAtmoWarm.value.copy(q.atmoWarm);
    haloMat.uniforms.uAtmo.value.copy(q.atmo); haloMat.uniforms.uAtmoWarm.value.copy(q.atmoWarm);
  };
  group.update = (dt, t) => {
    shared.uTime.value = t;
    surface.rotation.y = t * 0.004;
    clouds.rotation.y = t * 0.0055;
  };
  group.disposePlanet = () => {
    map?.userData.rt?.dispose(); map?.dispose();
    for (const m of [surface, clouds, halo]) { m.geometry.dispose(); m.material.dispose(); }
  };
  if (preset) group.setPreset(preset);
  return group;
}
