import * as THREE from 'three';

/**
 * Procedural planet, round 3.
 *
 *  - GPU-baked 2048x1024 equirect data texture: R=height (domain-warped fbm
 *    continents + ridged mountains), G=city density, B=cloud deck (warped fbm
 *    + cyclones), A=tileable relief detail sampled at several scales.
 *  - Surface shader: tangent-space relief normals from the height gradient
 *    (macro + two tiling detail octaves), fractal coastlines, biome ramps,
 *    Blinn ocean glitter, cloud shadows projected along the sun, a sharp
 *    lit/shadow terminator with a warm band, night-side city lights, aerial
 *    perspective toward the horizon and an in-disc Rayleigh in-scatter term.
 *  - Cloud shell: scrolling two-layer deck with gradient-derived shading so
 *    puffs read as volume, back-lit orange at the terminator.
 *  - Atmosphere shell: analytic ray/shell optical depth so the limb rim is a
 *    thin bright Rayleigh ring fading outward (not a fresnel blob).
 *
 * Colours come from preset.planet so the planet re-tints with the look.
 */

// ---- shared GLSL noise
const NOISE_GLSL = /* glsl */ `
  float hash13(vec3 p) { p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p += dot(p, p.yzx + 19.19); return fract((p.x + p.y) * p.z); }
  float vnoise(vec3 p) {
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbmN(vec3 p, int oct, float lac, float gain) {
    float a = 0.5, s = 0.0, n = 0.0;
    for (int i = 0; i < 9; i++) { if (i >= oct) break; s += a * vnoise(p); n += a; p = p * lac + vec3(13.1, 7.7, 3.3); a *= gain; }
    return s / n;
  }
  // ridged multifractal: sharp mountain crests
  float ridged(vec3 p, int oct) {
    float a = 0.5, s = 0.0, n = 0.0, w = 1.0;
    for (int i = 0; i < 6; i++) { if (i >= oct) break; float v = 1.0 - abs(vnoise(p) * 2.0 - 1.0); v = v * v * w; w = clamp(v * 2.0, 0.0, 1.0); s += a * v; n += a; p = p * 2.1 + vec3(3.7, 1.9, 8.2); a *= 0.5; }
    return s / n;
  }
`;

const BAKE_VERT = /* glsl */ `varying vec2 vUv; void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`;
const BAKE_FRAG = /* glsl */ `
  varying vec2 vUv;
  uniform vec3 uSeed;
  ${NOISE_GLSL}
  // periodic in x/y with integer period so the detail layer tiles seamlessly
  float vnoiseT(vec3 p, vec2 per) {
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    vec3 i1 = vec3(mod(i.x + 1.0, per.x), i.y, i.z), i2 = vec3(i.x, mod(i.y + 1.0, per.y), i.z), i3 = vec3(i1.x, i2.y, i.z);
    i.x = mod(i.x, per.x); i.y = mod(i.y, per.y); i1.y = i.y; i2.x = i.x;
    return mix(mix(hash13(i), hash13(i1), f.x), mix(hash13(i2), hash13(i3), f.x), f.y);
  }
  void main() {
    float lat = (0.5 - vUv.y) * 3.1415926, lon = vUv.x * 6.2831853;
    vec3 d0 = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
    vec3 d = d0 + uSeed;
    // ---- continents: domain-warped fbm so coasts get fjords/peninsulas
    vec3 warp = vec3(fbmN(d * 1.7, 3, 2.0, 0.5), fbmN(d * 1.7 + 9.1, 3, 2.0, 0.5), fbmN(d * 1.7 + 17.3, 3, 2.0, 0.5)) - 0.5;
    vec3 dw = d + warp * 0.55;
    float cont = fbmN(dw * 2.3, 7, 2.05, 0.52);
    float mtn = ridged(dw * 6.0 + vec3(4.0, 0.0, 0.0), 4);
    float hgt = cont + mtn * 0.22 * smoothstep(0.42, 0.6, cont);
    hgt = clamp((hgt - 0.42) * 2.4 + 0.42, 0.0, 1.0);
    // ---- cities: on coastal lowland, clustered
    float land = smoothstep(0.5, 0.52, hgt);
    float coast = land * (1.0 - smoothstep(0.55, 0.66, hgt));
    float cn = vnoise(d * 70.0) * 0.55 + vnoise(d * 210.0) * 0.45;
    float cluster = smoothstep(0.5, 0.75, fbmN(d * 9.0 + 31.0, 2, 2.0, 0.5));
    float city = coast * cluster * max(0.0, cn - 0.5) * 3.0;
    // ---- clouds: warped fbm deck + a few cyclone swirls + trade-wind bands
    vec3 cw = vec3(fbmN(d * 3.1 + 40.0, 2, 2.0, 0.5), fbmN(d * 3.1 + 51.0, 2, 2.0, 0.5), fbmN(d * 3.1 + 62.0, 2, 2.0, 0.5)) - 0.5;
    vec3 dc = d + cw * 0.5;
    float cloud = fbmN(vec3(dc.x * 4.5 + 20.0, dc.y * 7.0, dc.z * 4.5), 6, 2.2, 0.55);
    cloud += 0.10 * sin(lat * 9.0 + cw.x * 6.0);
    // cyclones: spiral bands around 3 fixed seeds
    for (int k = 0; k < 3; k++) {
      vec3 c = normalize(vec3(sin(float(k) * 2.1 + 0.7), sin(float(k) * 1.3) * 0.6, cos(float(k) * 2.1 + 0.7)));
      vec3 rel = d0 - c * dot(d0, c);
      float r = length(rel);
      if (r < 0.28 && dot(d0, c) > 0.0) {
        vec3 e1 = normalize(cross(c, vec3(0.0, 1.0, 0.01))), e2 = cross(c, e1);
        float ang = atan(dot(rel, e2), dot(rel, e1));
        float arm = sin(ang * 2.0 + r * 34.0) * 0.5 + 0.5;
        float body = smoothstep(0.28, 0.05, r) * (0.55 + 0.45 * arm) * smoothstep(0.0, 0.03, r);
        cloud = max(cloud, body * 0.95);
      }
    }
    cloud = clamp((cloud - 0.5) * 3.6 + 0.02, 0.0, 1.0);
    // ---- tiling relief detail (period 16x8 in uv)
    vec2 duv = vec2(vUv.x * 16.0, vUv.y * 8.0);
    float det = 0.0, a = 0.5, n = 0.0; vec2 per = vec2(16.0, 8.0);
    for (int i = 0; i < 4; i++) { det += a * vnoiseT(vec3(duv, 3.7), per); n += a; duv *= 2.0; per *= 2.0; a *= 0.55; }
    det /= n;
    gl_FragColor = vec4(hgt, min(1.0, city), cloud, det);
  }
`;

// Second pass: gradients of the height (RG) and of the tiling detail (BA),
// encoded 0..1 around 0.5, so the surface shader gets relief normals in one tap.
const GRAD_FRAG = /* glsl */ `
  varying vec2 vUv; uniform sampler2D uSrc; uniform vec2 uPx;
  void main() {
    vec4 xp = texture2D(uSrc, vUv + vec2(uPx.x, 0.0)), xm = texture2D(uSrc, vUv - vec2(uPx.x, 0.0));
    vec4 yp = texture2D(uSrc, vUv + vec2(0.0, uPx.y)), ym = texture2D(uSrc, vUv - vec2(0.0, uPx.y));
    vec2 gh = vec2(xp.r - xm.r, yp.r - ym.r) * 6.0;
    vec2 gd = vec2(xp.a - xm.a, yp.a - ym.a) * 4.0;
    gl_FragColor = vec4(clamp(gh, -0.5, 0.5) + 0.5, clamp(gd, -0.5, 0.5) + 0.5);
  }
`;

function bakeRT(renderer, W, H, frag, uniforms) {
  const rt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: false, stencilBuffer: false, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.RepeatWrapping });
  const mat = new THREE.ShaderMaterial({ vertexShader: BAKE_VERT, fragmentShader: frag, depthTest: false, depthWrite: false, uniforms });
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

/** GPU bake: { map (R=height, G=cities, B=clouds, A=tiling detail), grad (RG=dh, BA=ddetail) }. */
export function bakePlanetTextureGPU(renderer, seed = 7, W = 1536, H = 768) {
  const s = (seed * 0.61803398875) % 1;
  const map = bakeRT(renderer, W, H, BAKE_FRAG, { uSeed: { value: new THREE.Vector3(s * 7.3 + 1.1, seed * 0.37 + 2.9, s * 3.1 + 5.7) } });
  const grad = bakeRT(renderer, W, H, GRAD_FRAG, { uSrc: { value: map }, uPx: { value: new THREE.Vector2(1 / W, 1 / H) } });
  map.userData.grad = grad;
  return map;
}

/** CPU fallback (slow, 1024x512) kept for contexts without a renderer at build time. */
export function bakePlanetTexture(seed = 7, W = 1024, H = 512) {
  const canvas = document.createElement('canvas');
  canvas.width = W; canvas.height = H;
  const g = canvas.getContext('2d');
  const img = g.createImageData(W, H);
  const d = img.data;
  let s = seed >>> 0 || 1;
  const rnd = () => { s = (s + 0x6d2b79f5) >>> 0; let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const perm = new Uint8Array(512); const p = Array.from({ length: 256 }, (_, i) => i);
  for (let i = 255; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
  for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  const grad = new Float32Array(256); for (let i = 0; i < 256; i++) grad[i] = rnd();
  const h = (x, y, z) => grad[perm[perm[perm[x & 255] + (y & 255)] + (z & 255)]];
  const sm = (t) => t * t * (3 - 2 * t), l = (a, b, t) => a + (b - a) * t;
  const noise = (x, y, z) => {
    const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), fx = sm(x - xi), fy = sm(y - yi), fz = sm(z - zi);
    return l(l(l(h(xi, yi, zi), h(xi + 1, yi, zi), fx), l(h(xi, yi + 1, zi), h(xi + 1, yi + 1, zi), fx), fy),
      l(l(h(xi, yi, zi + 1), h(xi + 1, yi, zi + 1), fx), l(h(xi, yi + 1, zi + 1), h(xi + 1, yi + 1, zi + 1), fx), fy), fz);
  };
  const fbm = (x, y, z, oct = 6) => { let a = 0.5, sum = 0, norm = 0; for (let i = 0; i < oct; i++) { sum += a * noise(x, y, z); norm += a; x = x * 2.05 + 13.1; y = y * 2.05 + 7.7; z = z * 2.05 + 3.3; a *= 0.52; } return sum / norm; };
  for (let j = 0; j < H; j++) {
    const v = j / H, lat = (0.5 - v) * Math.PI, cl = Math.cos(lat), sl = Math.sin(lat);
    for (let i = 0; i < W; i++) {
      const lon = (i / W) * Math.PI * 2, x = cl * Math.cos(lon), y = sl, z = cl * Math.sin(lon);
      let hgt = fbm(x * 2.3, y * 2.3, z * 2.3, 8);
      hgt = Math.min(1, Math.max(0, (hgt - 0.42) * 2.4 + 0.42));
      const land = hgt > 0.5 ? 1 : 0;
      const city = land * (hgt < 0.62 ? 1 : 0) * Math.max(0, noise(x * 70, y * 70, z * 70) - 0.5) * 3;
      let cloud = fbm(x * 4.5 + 20, y * 7, z * 4.5, 6);
      cloud = Math.min(1, Math.max(0, (cloud - 0.5) * 3.6));
      const det = fbm((i / W) * 16, (j / H) * 8, 3.7, 4);
      const o = (j * W + i) * 4;
      d[o] = hgt * 255; d[o + 1] = Math.min(255, city * 255); d[o + 2] = cloud * 255; d[o + 3] = det * 255;
    }
  }
  g.putImageData(img, 0, 0);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.NoColorSpace; tex.wrapS = tex.wrapT = THREE.RepeatWrapping; tex.premultiplyAlpha = false;
  return tex;
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

// Shared atmosphere helpers: analytic optical depth through a spherical shell.
const ATMO_GLSL = /* glsl */ `
  uniform vec3 uCenter; uniform float uR, uRa;
  // Optical depth along ray o+t*v between the planet surface (or exit) and the
  // shell edge. b = closest-approach distance to the centre.
  float shellDepth(vec3 o, vec3 v, out float bOut) {
    vec3 oc = o - uCenter;
    float tca = -dot(oc, v);
    float b2 = dot(oc, oc) - tca * tca;
    float b = sqrt(max(b2, 0.0));
    bOut = b;
    float outer = sqrt(max(uRa * uRa - b2, 0.0));
    float inner = b < uR ? sqrt(max(uR * uR - b2, 0.0)) : -outer; // hit planet: front half only
    float path = outer - inner;
    // density falls off with altitude of the closest point
    float alt = clamp((b - uR) / (uRa - uR), 0.0, 1.0);
    float dens = exp(-alt * 4.5);
    return path / (uRa - uR) * dens;
  }
`;

const SURF_FRAG = /* glsl */ `
  varying vec3 vN, vWP; varying vec2 vUv;
  uniform sampler2D uMap, uGrad; uniform vec2 uPx;
  uniform vec3 uSunDir, uSunColor, uAmbient, uModelUp;
  uniform vec3 uOcean, uOceanDeep, uLand, uLandHigh, uIce, uAtmo, uAtmoWarm, uNight, uCloudShadow;
  uniform float uIceLat, uTime, uHorizonDist, uHazeK;
  ${ATMO_GLSL}

  void main() {
    vec2 uv1 = vUv * 9.0, uv2 = vUv * 41.0 + vec2(0.13, 0.41);
    vec4 tex = texture2D(uMap, vUv);
    vec4 g0 = texture2D(uGrad, vUv) - 0.5;
    vec4 g1 = texture2D(uGrad, uv1) - 0.5;
    vec4 g2 = texture2D(uGrad, uv2) - 0.5;
    float d1 = texture2D(uMap, uv1).a;
    float d2 = texture2D(uMap, uv2).a;
    float d3 = texture2D(uMap, vUv * 173.0 + vec2(0.71, 0.29)).a; // micro grain for very close range
    float land0 = smoothstep(0.47, 0.5, tex.r);
    // fractal coastline: detail perturbs height, but only weakly over open water
    float h = tex.r + ((d1 - 0.5) * 0.09 + (d2 - 0.5) * 0.035) * (0.35 + 0.65 * land0);
    vec3 Ng = normalize(vN);
    vec3 V = normalize(cameraPosition - vWP);
    vec3 L = normalize(uSunDir);
    float dist = length(cameraPosition - vWP);

    // ---- tangent frame (east / north) for relief normals from baked gradients
    vec3 T = normalize(cross(uModelUp, Ng));
    vec3 B = cross(Ng, T);
    float land = smoothstep(0.497, 0.503, h);
    vec2 grad = g0.xy / 6.0 * 1.0 + g1.zw / 4.0 * 0.09 * 9.0 + g2.zw / 4.0 * 0.035 * 41.0;
    float relief = 14.0 * land + 0.6 * (1.0 - land);
    vec3 N = normalize(Ng - T * grad.x * relief + B * grad.y * relief);

    // ---- biomes
    float shelf = smoothstep(0.40, 0.497, h);
    vec3 ocean = mix(uOceanDeep, uOcean, shelf);
    ocean *= 0.92 + 0.16 * d2 + 0.1 * (d1 - 0.5);
    float beach = smoothstep(0.503, 0.515, h);
    vec3 sand = uLand * vec3(1.35, 1.2, 0.8) + vec3(0.12, 0.1, 0.05);
    vec3 low = mix(uLand * 0.8, uLand * 1.1, d1); // field / forest mottling
    vec3 high = mix(uLandHigh * 0.85, uLandHigh, d2);
    vec3 landCol = mix(sand, low, beach);
    landCol = mix(landCol, high, smoothstep(0.6, 0.82, h + (d1 - 0.5) * 0.08));
    landCol *= 0.9 + 0.2 * d3;
    float lat = abs(vUv.y - 0.5) * 2.0;
    float ice = smoothstep(uIceLat - 0.06 + (h - 0.5) * 0.35, uIceLat + 0.04, lat + (d1 - 0.5) * 0.06)
              + smoothstep(0.84, 0.92, h + (d2 - 0.5) * 0.06) * land;
    ice = clamp(ice, 0.0, 1.0);
    vec3 albedo = mix(ocean, landCol, land);
    albedo = mix(albedo, uIce * (0.9 + 0.1 * d2), ice);

    // ---- cloud shadow: sample the deck offset along the sun's tangent direction
    vec2 lt = vec2(dot(L, T), dot(L, B)) * 0.012;
    float cs = texture2D(uMap, vUv + lt + vec2(uTime * 0.0012, 0.0)).b;
    float shadow = 1.0 - smoothstep(0.25, 0.75, cs) * 0.55;

    // ---- lighting: sharp-ish terminator with a warm band
    float NdL = dot(N, L), NdLg = dot(Ng, L);
    float diff = smoothstep(-0.04, 0.32, NdL) * (0.35 + 0.65 * smoothstep(-0.02, 0.5, NdLg));
    diff *= shadow;
    float term = smoothstep(-0.12, 0.05, NdLg) * (1.0 - smoothstep(0.05, 0.35, NdLg));
    vec3 light = uSunColor * diff + uAtmoWarm * term * 0.35;
    vec3 col = albedo * (light + uAmbient * 0.12 * (1.0 - smoothstep(0.0, 0.4, NdLg) * 0.5));

    // ---- ocean glitter (Blinn) + broad sheen, only where the sun is up
    vec3 Nw = normalize(Ng + (T * (d2 - 0.5) + B * (d3 - 0.5)) * 0.03);
    vec3 Hv = normalize(L + V);
    float sunUp = smoothstep(-0.05, 0.25, NdLg);
    float water = (1.0 - land) * (1.0 - ice);
    float spec = pow(max(dot(Nw, Hv), 0.0), 420.0) * 3.0 + pow(max(dot(Nw, Hv), 0.0), 40.0) * 0.35;
    // fresnel makes grazing water mirror the sky
    float fres = pow(1.0 - max(dot(Ng, V), 0.0), 4.0);
    col += uSunColor * spec * water * sunUp * shadow;
    col = mix(col, uAtmo * 0.35 * sunUp, water * fres * 0.5);
    // snow/ice sparkle: soft broad highlight
    col += uSunColor * pow(max(dot(N, Hv), 0.0), 24.0) * ice * 0.35 * sunUp;

    // ---- night side: city lights, faint moonlit blue
    float night = smoothstep(0.08, -0.12, NdLg);
    float cities = tex.g * (0.9 + 0.1 * sin(uTime * 3.0 + h * 90.0));
    col += uNight * cities * night * 2.6 * (1.0 - smoothstep(0.35, 0.75, cs) * 0.7);
    col += albedo * uAmbient * 0.05 * night;

    // ---- aerial perspective + Rayleigh in-scatter through the air column
    float b; float od = shellDepth(cameraPosition, -V, b);
    float lit = smoothstep(-0.25, 0.3, NdLg);
    vec3 atmoCol = mix(uAtmo, uAtmoWarm, term * 0.9);
    float dn = dist / uHorizonDist;
    float haze = 1.0 - exp(-dn * dn * 1.1);      // near ground stays crisp, horizon goes milky
    float inscat = 1.0 - exp(-od * 0.07);        // od ~1 looking straight down, ~7 at the limb
    float sc = clamp((haze * 0.45 + inscat * 0.6) * uHazeK, 0.0, 1.0);
    // extinction: distant ground desaturates and dims toward the sky colour
    col = mix(col, atmoCol * (0.12 + 0.88 * lit), sc * (0.3 + 0.7 * lit));
    // forward-scatter glow toward the sun (Mie) on the lit horizon
    float mie = pow(max(dot(-V, L), 0.0), 12.0);
    col += uSunColor * mie * haze * 0.25 * lit;
    gl_FragColor = vec4(col, 1.0);
  }
`;

const CLOUD_FRAG = /* glsl */ `
  varying vec3 vN, vWP; varying vec2 vUv;
  uniform sampler2D uMap; uniform vec2 uPx;
  uniform vec3 uSunDir, uSunColor, uCloud, uAtmoWarm, uAmbient, uModelUp, uAtmo;
  uniform float uTime, uHorizonDist;
  float cov(vec2 uv) {
    float c = texture2D(uMap, uv + vec2(uTime * 0.0012, 0.0)).b;
    float c2 = texture2D(uMap, uv * 2.3 + vec2(0.31, 0.12) + vec2(uTime * 0.0021, 0.0)).b;
    return c * 0.85 + c2 * 0.4 - 0.12;
  }
  void main() {
    vec3 Ng = normalize(vN);
    vec3 V = normalize(cameraPosition - vWP);
    vec3 L = normalize(uSunDir);
    float dist = length(cameraPosition - vWP);
    float d = texture2D(uMap, vUv * 13.0 + vec2(uTime * 0.004, 0.0)).a;
    float c0 = cov(vUv);
    float v0 = c0 + (d - 0.5) * 0.28;
    float alpha = smoothstep(0.28, 0.62, v0);
    if (alpha < 0.003) discard;
    // gradient of coverage -> pseudo normal so puffs are top-lit with shaded undersides
    vec3 T = normalize(cross(uModelUp, Ng));
    vec3 B = cross(Ng, T);
    vec2 px = uPx * 2.0;
    float gx = cov(vUv + vec2(px.x, 0.0)) - c0;
    float gy = cov(vUv + vec2(0.0, px.y)) - c0;
    vec3 N = normalize(Ng - (T * gx - B * gy) * 6.0);
    float NdL = dot(N, L), NdLg = dot(Ng, L);
    float lit = smoothstep(-0.05, 0.45, NdL) * smoothstep(-0.12, 0.2, NdLg);
    float term = smoothstep(-0.15, 0.02, NdLg) * (1.0 - smoothstep(0.02, 0.3, NdLg));
    // thick interior is denser -> darker base; edges are thin and bright
    float dense = smoothstep(0.5, 1.0, v0);
    vec3 col = uCloud * (uSunColor * lit * (1.05 - dense * 0.25) + uAmbient * 0.2 + uAtmo * 0.08)
             + uAtmoWarm * term * 0.6 * (1.0 - dense * 0.4);
    // silver lining: forward scatter through thin edges toward the sun
    float back = pow(max(dot(-V, L), 0.0), 6.0) * (1.0 - dense);
    col += uSunColor * back * 0.35 * smoothstep(-0.1, 0.1, NdLg);
    // distant deck fades into the horizon haze
    float haze = 1.0 - exp(-dist / uHorizonDist * 1.2);
    col = mix(col, uAtmo * (0.2 + 0.8 * smoothstep(-0.2, 0.3, NdLg)), haze * 0.55);
    float night = smoothstep(0.1, -0.2, NdLg);
    alpha *= 1.0 - night * 0.5;
    gl_FragColor = vec4(col, alpha * 0.96);
  }
`;

const HALO_FRAG = /* glsl */ `
  varying vec3 vN, vWP;
  uniform vec3 uSunDir, uAtmo, uAtmoWarm, uSunColor;
  uniform float uStrength;
  ${ATMO_GLSL}
  void main() {
    vec3 V = normalize(vWP - cameraPosition);
    float b; float od = shellDepth(cameraPosition, V, b);
    if (b < uR) discard; // over the disc the surface shader handles in-scatter
    // closest point on the ray to the centre -> how sunlit that column is
    vec3 oc = cameraPosition - uCenter;
    float tca = -dot(oc, V);
    vec3 P = normalize(oc + V * tca);
    float NdL = dot(P, uSunDir);
    float lit = smoothstep(-0.35, 0.25, NdL);
    float term = smoothstep(-0.3, 0.0, NdL) * (1.0 - smoothstep(0.0, 0.35, NdL));
    // thin bright Rayleigh ring hugging the limb + soft outer skirt
    float edge = clamp((b - uR) / (uRa - uR), 0.0, 1.0);
    float ring = exp(-edge * 9.0) * 1.6 + exp(-edge * 2.5) * 0.35;
    float glow = (1.0 - exp(-od * 0.9)) * ring;
    vec3 col = mix(uAtmo, uAtmoWarm, term * 0.85) * glow * lit * uStrength;
    // sun-side Mie brightening of the rim
    float mie = pow(max(dot(V, uSunDir), 0.0), 8.0);
    col += uSunColor * mie * glow * 0.35 * lit;
    gl_FragColor = vec4(col, 1.0);
  }
`;

/**
 * makePlanet({ radius, seed, preset, haloScale, gpu, renderer }) -> Group with
 * .setPreset(resolved), .update(dt, t), .lightDir (optional art cheat).
 * Pass `renderer` to bake eagerly at construction (no first-frame stall).
 */
export function makePlanet({ radius = 640, seed = 7, preset, haloScale = 1.05, gpu = true, renderer = null } = {}) {
  const group = new THREE.Group();
  group.name = 'lookdev-planet';
  let map = gpu ? (renderer ? bakePlanetTextureGPU(renderer, seed) : null) : bakePlanetTexture(seed);
  const shared = {
    uMap: { value: map },
    uGrad: { value: map?.userData.grad ?? null },
    uHazeK: { value: 0.55 },
    uPx: { value: new THREE.Vector2(1 / (gpu ? 1536 : 1024), 1 / (gpu ? 768 : 512)) },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunColor: { value: new THREE.Color(1, 1, 1) },
    uAmbient: { value: new THREE.Color(0.2, 0.3, 0.5) },
    uModelUp: { value: new THREE.Vector3(0, 1, 0) },
    uCenter: { value: new THREE.Vector3() },
    uR: { value: radius },
    uRa: { value: radius * haloScale },
    uHorizonDist: { value: radius * 0.4 },
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
      uCloudShadow: { value: new THREE.Color() },
      uIceLat: { value: 0.8 },
    },
  });
  const surface = new THREE.Mesh(new THREE.SphereGeometry(radius, 128, 64), surfMat);
  if (gpu && !map) {
    surface.onBeforeRender = (r) => { if (map) return; map = bakePlanetTextureGPU(r, seed); shared.uMap.value = map; shared.uGrad.value = map.userData.grad; };
  }
  const cloudMat = new THREE.ShaderMaterial({
    vertexShader: SURF_VERT, fragmentShader: CLOUD_FRAG, transparent: true, depthWrite: false,
    uniforms: { ...shared, uCloud: { value: new THREE.Color() }, uAtmoWarm: { value: new THREE.Color() }, uAtmo: { value: new THREE.Color() } },
  });
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.007, 96, 48), cloudMat);
  clouds.renderOrder = 1;
  const haloMat = new THREE.ShaderMaterial({
    vertexShader: SURF_VERT, fragmentShader: HALO_FRAG, side: THREE.BackSide, transparent: true,
    blending: THREE.AdditiveBlending, depthWrite: false,
    uniforms: {
      uSunDir: shared.uSunDir, uSunColor: shared.uSunColor, uCenter: shared.uCenter, uR: shared.uR, uRa: shared.uRa,
      uAtmo: { value: new THREE.Color() }, uAtmoWarm: { value: new THREE.Color() }, uStrength: { value: 1.6 },
    },
  });
  const halo = new THREE.Mesh(new THREE.SphereGeometry(radius * haloScale, 96, 48), haloMat);
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
    cloudMat.uniforms.uCloud.value.copy(q.cloud); cloudMat.uniforms.uAtmoWarm.value.copy(q.atmoWarm); cloudMat.uniforms.uAtmo.value.copy(q.atmo);
    haloMat.uniforms.uAtmo.value.copy(q.atmo); haloMat.uniforms.uAtmoWarm.value.copy(q.atmoWarm);
  };
  const _up = new THREE.Vector3();
  group.update = (dt, t, camera) => {
    shared.uTime.value = t;
    surface.rotation.y = t * 0.003;
    clouds.rotation.y = t * 0.0045;
    group.updateWorldMatrix(true, false);
    group.getWorldPosition(shared.uCenter.value);
    // pole axis in world space (for tangent frames); surface & clouds share it
    _up.set(0, 1, 0).applyQuaternion(group.getWorldQuaternion(_q));
    shared.uModelUp.value.copy(_up);
    if (camera) {
      const alt = Math.max(1, camera.position.distanceTo(shared.uCenter.value) - radius);
      shared.uHorizonDist.value = Math.sqrt(2 * radius * alt + alt * alt);
    }
  };
  group.disposePlanet = () => {
    map?.userData.grad?.userData.rt?.dispose(); map?.userData.grad?.dispose();
    map?.userData.rt?.dispose(); map?.dispose();
    for (const m of [surface, clouds, halo]) { m.geometry.dispose(); m.material.dispose(); }
  };
  if (preset) group.setPreset(preset);
  return group;
}
const _q = new THREE.Quaternion();
