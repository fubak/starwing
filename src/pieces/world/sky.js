import * as THREE from 'three';
import { fbm, makeNoiseTexture } from './noise.js';

let _noiseTex = null;
export function noiseTexture() { return (_noiseTex ??= makeNoiseTexture(THREE, 512)); }

// Corneria day palette (sRGB picks -> converted to linear for shaders)
const L = (hex) => new THREE.Color(hex).convertSRGBToLinear();
export const PALETTE = {
  zenith: L(0x1a52c8),     // deep cobalt
  mid: L(0x4f9fe6),        // cyan-blue
  horizon: L(0xd7ecfb),    // pale, slightly warm haze
  fog: L(0xb9d6ee),        // aerial-perspective colour
  sunWarm: L(0xffd39a),
  sunCore: L(0xfff4e2),
};

/** Sun ahead-left, ~28 deg elevation: long shadows, glitter path on water, disc peeks into frame on climbs. */
export const SUN_DIR = new THREE.Vector3(-0.44, 0.47, -0.72).normalize();

export function skyUniforms() {
  return {
    uSunDir: { value: SUN_DIR.clone() },
    uZenith: { value: PALETTE.zenith.clone() },
    uMid: { value: PALETTE.mid.clone() },
    uHorizon: { value: PALETTE.horizon.clone() },
    uFogColor: { value: PALETTE.fog.clone() },
    uSunWarm: { value: PALETTE.sunWarm.clone() },
  };
}

/** Shared GLSL: sky colour for a world direction + aerial-perspective fog colour. */
export const GLSL_SKY = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uZenith, uMid, uHorizon, uFogColor, uSunWarm;
vec3 skyColor(vec3 d){
  float h = clamp(d.y, -1.0, 1.0);
  float hp = max(h, 0.0);
  vec3 col = mix(uHorizon, uMid, smoothstep(0.0, 0.22, hp));
  col = mix(col, uZenith, smoothstep(0.12, 0.85, pow(hp, 0.8)));
  float sd = max(dot(d, uSunDir), 0.0);
  // Mie forward-scatter lobe around the sun, strongest low in the sky
  col += uSunWarm * pow(sd, 5.0) * 0.22 * (1.0 - smoothstep(0.0, 0.5, hp));
  col += vec3(1.0, 0.88, 0.70) * pow(sd, 32.0) * 0.4;
  // below the horizon: dense haze
  col = mix(col, uFogColor * 0.92, smoothstep(0.0, -0.06, h));
  return col;
}
/** colour that distance fog converges to, for a view direction */
vec3 atmosColor(vec3 d){
  vec3 hz = skyColor(vec3(d.x, max(d.y, 0.0) * 0.35, d.z));
  float sd = max(dot(d, uSunDir), 0.0);
  vec3 c = mix(uFogColor, hz, 0.55);
  c += uSunWarm * pow(sd, 6.0) * 0.30;
  return c;
}
`;

/**
 * Patch a MeshStandardMaterial so its exponential fog converges to the sky
 * colour in the view direction (sun-tinted aerial perspective) instead of a
 * single flat colour. Also injects `vWorldPos`.
 */
export function patchAtmosphere(material, shared = skyUniforms(), extraFrag = '') {
  const prev = material.onBeforeCompile;
  material.onBeforeCompile = (sh, renderer) => {
    Object.assign(sh.uniforms, shared);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vWorldPos;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvWorldPos = (modelMatrix * vec4(transformed, 1.0)).xyz;\n#ifdef USE_INSTANCING\nvWorldPos = (modelMatrix * instanceMatrix * vec4(position, 1.0)).xyz;\n#endif');
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying vec3 vWorldPos;\n${GLSL_SKY}`)
      .replace('#include <fog_fragment>', /* glsl */ `
        #ifdef USE_FOG
          float fogDepth = vFogDepth;
          float fogFactor = 1.0 - exp(-fogDensity * fogDensity * fogDepth * fogDepth);
          // altitude thins the haze a little (mountain tops stay crisper)
          fogFactor *= mix(1.0, 0.72, smoothstep(40.0, 260.0, vWorldPos.y));
          vec3 wdir = normalize(vWorldPos - cameraPosition);
          gl_FragColor.rgb = mix(gl_FragColor.rgb, atmosColor(wdir), clamp(fogFactor, 0.0, 1.0));
        #endif
        ${extraFrag}`);
    prev?.(sh, renderer);
  };
  material.customProgramCacheKey = () => 'atmos' + (extraFrag.length) + (prev ? 'p' : '');
  return material;
}

export function createSky() {
  const uniforms = { ...skyUniforms(), uTime: { value: 0 }, uNoise: { value: noiseTexture() } };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main(){
        vDir = normalize(position);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_SKY}
      uniform float uTime; uniform sampler2D uNoise;
      varying vec3 vDir;
      void main(){
        vec3 d = normalize(vDir);
        vec3 col = skyColor(d);
        float sd = dot(d, uSunDir);
        // sun disc + corona (bloom lifts it)
        float disc = smoothstep(0.99930, 0.99975, sd);
        col += vec3(1.0, 0.95, 0.86) * disc * 7.0;
        col += vec3(1.0, 0.82, 0.58) * pow(max(sd, 0.0), 220.0) * 1.6;
        col += vec3(1.0, 0.75, 0.50) * pow(max(sd, 0.0), 24.0) * 0.16;
        // high cirrus sheet: two octaves of the baked tileable noise, faded near zenith & horizon
        if (d.y > 0.015) {
          vec2 p = d.xz / (d.y + 0.18);
          float n = texture2D(uNoise, p * 0.16 + vec2(uTime * 0.0009, uTime * 0.0003)).r;
          float n2 = texture2D(uNoise, p * 0.47 - vec2(uTime * 0.0016, uTime * 0.0005)).g;
          float n3 = texture2D(uNoise, p * 1.30 + vec2(uTime * 0.0021, 0.0)).r;
          float c = smoothstep(0.58, 0.84, n * 0.62 + n2 * 0.30 + n3 * 0.18);
          c = c * c * (3.0 - 2.0 * c);
          float fade = smoothstep(0.015, 0.16, d.y) * (1.0 - smoothstep(0.45, 0.92, d.y));
          float lit = 0.55 + 0.45 * pow(max(sd, 0.0), 2.0);
          vec3 cloudCol = mix(vec3(0.80, 0.86, 0.97), vec3(1.10, 1.04, 0.98), lit);
          col = mix(col, cloudCol, c * fade * 0.52);
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(3800, 36, 20), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}

/** Distant mountain silhouette ring that follows the camera (backdrop layer). Two ridges for parallax depth. */
export function createMountains(rng) {
  const build = (seg, R, base, hMul, seedA, seedB) => {
    const pos = [], idx = [], hgt = [];
    for (let i = 0; i <= seg; i++) {
      const a = (i / seg) * Math.PI * 2;
      const c = Math.cos(a), s = Math.sin(a);
      let h = 0.5 + 0.5 * fbm(c * 3.1 + seedA, s * 3.1 + seedA, 4);
      h = Math.pow(h, 1.7) * 560 * hMul + 30 + 140 * hMul * Math.max(0, fbm(c * 9.3 + seedB, s * 9.3, 3));
      // a couple of hero peaks
      h += 260 * hMul * Math.max(0, Math.pow(0.5 + 0.5 * Math.cos(a * 1.0 - 2.2 - seedB * 0.1), 30.0));
      pos.push(R * c, base, R * s, R * c, base + h, R * s);
      hgt.push(0, h / (700 * hMul));
    }
    for (let i = 0; i < seg; i++) { const a = i * 2; idx.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute('aH', new THREE.Float32BufferAttribute(hgt, 1));
    g.setIndex(idx);
    return g;
  };
  const mk = (geo, far) => new THREE.ShaderMaterial({
    uniforms: { ...skyUniforms(), uFar: { value: far }, uNoise: { value: noiseTexture() } },
    side: THREE.DoubleSide,
    fog: false,
    vertexShader: /* glsl */ `
      attribute float aH; varying float vH; varying vec3 vDir; varying vec3 vPos;
      void main(){ vH = aH; vDir = normalize(position); vPos = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      ${GLSL_SKY}
      uniform float uFar; uniform sampler2D uNoise;
      varying float vH; varying vec3 vDir; varying vec3 vPos;
      void main(){
        vec3 fl = normalize(vec3(vDir.x, 0.0, vDir.z));
        vec3 haze = atmosColor(fl);
        float strata = texture2D(uNoise, vec2(atan(vPos.z, vPos.x) * 3.0, vPos.y * 0.004)).r;
        vec3 rock = mix(vec3(0.16, 0.22, 0.36), vec3(0.34, 0.40, 0.52), smoothstep(0.2, 0.95, vH) * (0.7 + 0.6 * strata));
        float sunSide = 0.5 + 0.5 * dot(fl, -uSunDir);
        rock = mix(rock, rock * vec3(1.25, 1.1, 0.9), sunSide * 0.5);
        rock = mix(rock, vec3(0.90, 0.94, 1.0), smoothstep(0.55, 0.85, vH + 0.15 * strata));
        vec3 col = mix(rock, haze, uFar);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const g1 = build(360, 3000, -260, 1.0, 10, 0), g2 = build(300, 2400, -240, 0.62, 47, 3);
  const far = new THREE.Mesh(g1, mk(g1, 0.78)); far.renderOrder = -9;
  const near = new THREE.Mesh(g2, mk(g2, 0.62)); near.renderOrder = -8;
  const grp = new THREE.Group(); grp.add(far, near);
  grp.frustumCulled = false; far.frustumCulled = false; near.frustumCulled = false;
  grp.geometry = g1; grp.material = far.material; // dispose convenience
  grp.userData.dispose = () => { g1.dispose(); g2.dispose(); far.material.dispose(); near.material.dispose(); };
  return grp;
}
