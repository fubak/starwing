import * as THREE from 'three';
import { resolvePreset } from './presets.js';

/**
 * Procedural sky dome: atmosphere gradient + sun disc/glow + hashed starfield
 * + fbm nebula + milky-way band. Rendered on the inside of a big sphere that
 * follows the camera. Also used (at small radius) to build the PMREM
 * environment map so materials reflect the same sky.
 */

export const SKY_NOISE_GLSL = /* glsl */ `
  float hash13(vec3 p) {
    p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3));
    p += dot(p, p.yzx + 19.19);
    return fract((p.x + p.y) * p.z);
  }
  vec3 hash33(vec3 p) {
    p = fract(p * vec3(0.1031, 0.1030, 0.0973));
    p += dot(p, p.yxz + 33.33);
    return fract((p.xxy + p.yxx) * p.zyx);
  }
  float vnoise(vec3 p) {
    vec3 i = floor(p), f = fract(p);
    f = f * f * (3.0 - 2.0 * f);
    return mix(
      mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
      mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y),
      f.z);
  }
  float fbm(vec3 p) {
    float a = 0.5, s = 0.0;
    for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.02 + 7.7; a *= 0.5; }
    return s;
  }
`;

// ---- baked nebula field (equirect). fbm is far too expensive to run per pixel
// per frame on software GL, and nebula is soft anyway, so it's rendered once.
const BAKE_FRAG = /* glsl */ `
  varying vec2 vUv;
  ${SKY_NOISE_GLSL}
  void main() {
    float lon = (vUv.x - 0.5) * 6.2831853, lat = (vUv.y - 0.5) * 3.1415926;
    vec3 d = vec3(cos(lat) * cos(lon), sin(lat), cos(lat) * sin(lon));
    float n1 = fbm(d * 2.3 + vec3(1.7, 9.2, 3.1));
    float n2 = fbm(d * 4.1 - vec3(5.2, 1.3, 8.8));
    float n3 = fbm(d * 9.0 + vec3(2.2, 5.1, 7.3));
    gl_FragColor = vec4(n1, n2, n3, 1.0);
  }
`;
const BAKE_VERT = /* glsl */ `
  varying vec2 vUv;
  void main() { vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }
`;

let _noiseTex = null;
/** Bake (once per renderer) the 1024x512 equirect nebula noise field. */
export function getSkyNoiseTexture(renderer) {
  if (_noiseTex) return _noiseTex;
  const W = 1024, H = 512;
  const rt = new THREE.WebGLRenderTarget(W, H, { depthBuffer: false, stencilBuffer: false, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, wrapS: THREE.RepeatWrapping, wrapT: THREE.ClampToEdgeWrapping });
  const mat = new THREE.ShaderMaterial({ vertexShader: BAKE_VERT, fragmentShader: BAKE_FRAG, depthTest: false, depthWrite: false });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  const sc = new THREE.Scene(); sc.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const prevRT = renderer.getRenderTarget();
  renderer.setRenderTarget(rt);
  renderer.render(sc, cam);
  renderer.setRenderTarget(prevRT);
  quad.geometry.dispose(); mat.dispose();
  _noiseTex = rt.texture;
  _noiseTex.userData.rt = rt;
  return _noiseTex;
}

const VERT = /* glsl */ `
  varying vec3 vDir;
  void main() {
    vec4 wp = modelMatrix * vec4(position, 1.0);
    vDir = wp.xyz - cameraPosition;
    gl_Position = projectionMatrix * viewMatrix * wp;
  }
`;

const FRAG = /* glsl */ `
  varying vec3 vDir;
  uniform vec3 uSunDir, uSunColor;
  uniform float uSunSize, uSunGlow, uSunIntensity;
  uniform vec3 uZenith, uHorizon, uGround;
  uniform float uHaze, uStars, uNebula, uMilky, uTime;
  uniform vec3 uNebulaA, uNebulaB;
  uniform sampler2D uNoise;
  ${SKY_NOISE_GLSL}

  float stars(vec3 d, float scale, float density, float size) {
    vec3 p = d * scale;
    vec3 i = floor(p);
    vec3 f = fract(p) - 0.5;
    vec3 h = hash33(i);
    float keep = step(1.0 - density, h.z);
    vec3 pos = (h - 0.5) * 0.7;
    float dist = length(f - pos);
    float tw = 0.75 + 0.25 * sin(uTime * (1.5 + h.x * 3.0) + h.y * 6.2831);
    float s = keep * smoothstep(size, 0.0, dist) * tw;
    return s;
  }

  void main() {
    vec3 d = normalize(vDir);
    float y = d.y;
    float mu = dot(d, uSunDir);

    // ---- atmosphere gradient
    float h = exp(-max(y, 0.0) * uHaze);
    vec3 sky = mix(uZenith, uHorizon, h);
    float below = smoothstep(0.02, -0.3, y);
    vec3 ground = mix(uHorizon * 0.55, uGround, smoothstep(0.0, -0.45, y));
    vec3 col = mix(sky, ground, below);

    // ---- deep-space content, hidden by bright atmosphere
    float atmoMask = clamp(1.0 - dot(sky, vec3(0.6)) * 1.6, 0.0, 1.0) * (1.0 - below);

    // sun forward scatter: broad mie lobe (only where there is air to scatter
    // in) + tight corona, strongest near the horizon
    float m = max(mu, 0.0);
    float horizonBoost = 0.5 + 0.5 * h;
    float glow = pow(m, 6.0) * 0.22 * (1.0 - atmoMask * 0.85) + pow(m, 40.0) * 0.22 + pow(m, 300.0) * 0.7;
    col += uSunColor * glow * uSunGlow * horizonBoost * (1.0 - below * 0.8);

    // nebula: two-colour fbm with a tilted milky-way band
    vec2 euv = vec2(atan(d.z, d.x) / 6.2831853 + 0.5, asin(clamp(d.y, -1.0, 1.0)) / 3.1415926 + 0.5);
    vec3 nz = texture2D(uNoise, euv).rgb;
    float n1 = nz.r, n2 = nz.g, n3 = nz.b;
    float bandCoord = dot(d, normalize(vec3(0.35, 1.0, 0.25)));
    float band = exp(-bandCoord * bandCoord * 18.0);
    float neb = smoothstep(0.42, 0.78, n1) * (0.35 + 0.65 * band * uMilky + 0.4 * (1.0 - uMilky));
    // fine filaments carve dark lanes into the soft body so it reads as gas, not fog
    neb *= 0.55 + 0.45 * smoothstep(0.3, 0.7, n3);
    float wisp = smoothstep(0.5, 0.85, n2);
    vec3 nebCol = mix(uNebulaA, uNebulaB, smoothstep(0.35, 0.7, n2)) * neb * 1.4
                + uNebulaB * wisp * neb * 0.6
                + vec3(0.7, 0.8, 1.0) * band * uMilky * 0.11 * smoothstep(0.3, 0.6, n1) * (0.6 + 0.4 * n3);
    col += nebCol * uNebula * atmoMask;

    // stars: three layers of different scale/brightness
    float st = stars(d, 150.0, 0.07, 0.16) * 1.4
             + stars(d + 7.7, 55.0, 0.05, 0.10) * 3.6;
    vec3 starCol = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.9, 0.75), hash13(floor(d * 90.0)));
    col += starCol * st * uStars * atmoMask;

    // ---- sun disc (HDR; the bloom pass turns it into a flare)
    float ang = sqrt(max(0.0, 2.0 - 2.0 * mu)); // chord length ~ angle for small angles
    float disc = 1.0 - smoothstep(uSunSize * 0.85, uSunSize * 1.05, ang);
    float limb = 1.0 - 0.35 * smoothstep(0.0, uSunSize, ang);
    col += uSunColor * disc * limb * uSunIntensity * 3.0 * (1.0 - below);

    gl_FragColor = vec4(col, 1.0);
  }
`;

export function makeSkyMaterial(preset) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: VERT,
    fragmentShader: FRAG,
    side: THREE.BackSide,
    depthWrite: false,
    depthTest: true,
    fog: false,
    uniforms: {
      uSunDir: { value: new THREE.Vector3(0, 1, 0) },
      uSunColor: { value: new THREE.Color(1, 1, 1) },
      uSunSize: { value: 0.03 },
      uSunGlow: { value: 1 },
      uSunIntensity: { value: 1 },
      uZenith: { value: new THREE.Color() },
      uHorizon: { value: new THREE.Color() },
      uGround: { value: new THREE.Color() },
      uHaze: { value: 4 },
      uStars: { value: 1 },
      uNebula: { value: 1 },
      uMilky: { value: 0.5 },
      uTime: { value: 0 },
      uNebulaA: { value: new THREE.Color() },
      uNebulaB: { value: new THREE.Color() },
      uNoise: { value: null },
    },
  });
  mat.toneMapped = false;
  if (preset) applySkyPreset(mat, resolvePreset(THREE, preset));
  return mat;
}

/** Write a *resolved* preset into a sky material's uniforms. */
export function applySkyPreset(mat, p) {
  const u = mat.uniforms;
  u.uSunDir.value.copy(p.sun.dir).normalize();
  u.uSunColor.value.copy(p.sun.color);
  u.uSunSize.value = p.sun.size;
  u.uSunGlow.value = p.sun.glow;
  u.uSunIntensity.value = 1.0;
  u.uZenith.value.copy(p.sky.zenith);
  u.uHorizon.value.copy(p.sky.horizon);
  u.uGround.value.copy(p.sky.ground);
  u.uHaze.value = p.sky.haze;
  u.uStars.value = p.sky.stars;
  u.uNebula.value = p.sky.nebula;
  u.uMilky.value = p.sky.milky;
  u.uNebulaA.value.copy(p.sky.nebulaA);
  u.uNebulaB.value.copy(p.sky.nebulaB);
}

/**
 * makeSky(preset, { radius }) -> Mesh with .material (sky shader),
 * .setPreset(presetOrName), .update(t, camera). Add it to your scene; call
 * update each frame so it tracks the camera and twinkles.
 */
export function makeSky(preset = 'space', { radius = 3000 } = {}) {
  const geo = new THREE.SphereGeometry(radius, 48, 24);
  const mat = makeSkyMaterial(preset);
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'lookdev-sky';
  mesh.frustumCulled = false;
  mesh.renderOrder = -1000;
  mesh.matrixAutoUpdate = true;
  mesh.userData.isLookSky = true;
  mesh.onBeforeRender = (renderer) => { if (!mat.uniforms.uNoise.value) mat.uniforms.uNoise.value = getSkyNoiseTexture(renderer); };
  mesh.setPreset = (p) => applySkyPreset(mat, p instanceof Object && p.sun?.dir instanceof THREE.Vector3 ? p : resolvePreset(THREE, p));
  mesh.update = (t, camera) => {
    mat.uniforms.uTime.value = t;
    if (camera) mesh.position.copy(camera.getWorldPosition(_v));
  };
  mesh.disposeSky = () => { geo.dispose(); mat.dispose(); };
  return mesh;
}
const _v = new THREE.Vector3();
