import * as THREE from 'three';
import { fbm, makeNoiseTexture } from './noise.js';

let _noiseTex = null;
export function noiseTexture() { return (_noiseTex ??= makeNoiseTexture(THREE, 512)); }

// Palette (linear-space values are produced from these sRGB picks in shaders via pow 2.2 approximations baked below)
export const PALETTE = {
  zenith: new THREE.Color(0x1846a8),
  horizon: new THREE.Color(0x9fc2ec),
  fog: new THREE.Color(0x9ab8dc),
  sunWarm: new THREE.Color(0xffd9a6),
};

export const SUN_DIR = new THREE.Vector3(-0.62, 0.56, 0.22).normalize();

/** Shared GLSL: sky colour for a world direction. Expects uSunDir uniform. */
export const GLSL_SKY = /* glsl */ `
uniform vec3 uSunDir;
uniform vec3 uZenith, uHorizon, uFogColor;
vec3 skyColor(vec3 d){
  float h = clamp(d.y, -1.0, 1.0);
  float t = pow(max(h, 0.0), 0.45);
  vec3 col = mix(uHorizon, uZenith, t);
  float sd = max(dot(d, uSunDir), 0.0);
  // warm scatter lobe around the sun, strongest near horizon
  col += vec3(1.0, 0.62, 0.30) * pow(sd, 6.0) * 0.28 * (1.0 - t);
  col += vec3(1.0, 0.85, 0.65) * pow(sd, 40.0) * 0.45;
  // below horizon fade to fog/haze
  col = mix(col, uFogColor * 0.9, smoothstep(0.0, -0.08, h));
  return col;
}
`;

export function createSky() {
  const uniforms = {
    uSunDir: { value: SUN_DIR.clone() },
    uZenith: { value: PALETTE.zenith.clone() },
    uHorizon: { value: PALETTE.horizon.clone() },
    uFogColor: { value: PALETTE.fog.clone() },
    uTime: { value: 0 },
    uNoise: { value: noiseTexture() },
  };
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
        // sun disc
        float sd = dot(d, uSunDir);
        float disc = smoothstep(0.99955, 0.99985, sd);
        col += vec3(1.0, 0.93, 0.80) * disc * 6.0;
        col += vec3(1.0, 0.8, 0.55) * smoothstep(0.996, 0.9998, sd) * 0.8;
        // high cirrus / cloud sheet
        if (d.y > 0.02) {
          vec2 p = d.xz / (d.y + 0.12);
          float n = texture2D(uNoise, p * 0.22 + vec2(uTime * 0.0012, uTime * 0.0004)).r;
          float n2 = texture2D(uNoise, p * 0.55 - vec2(uTime * 0.002, 0.0)).g;
          float c = smoothstep(0.56, 0.78, n * 0.75 + n2 * 0.35);
          float fade = smoothstep(0.02, 0.22, d.y) * (1.0 - smoothstep(0.55, 0.95, d.y));
          vec3 cloudCol = mix(vec3(0.78, 0.84, 0.95), vec3(1.05, 1.0, 0.96), pow(max(sd, 0.0), 3.0));
          col = mix(col, cloudCol, c * fade * 0.75);
        }
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(3600, 48, 24), mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return { mesh, uniforms };
}

/** Distant mountain silhouette ring that follows the camera (backdrop layer). */
export function createMountains(rng) {
  const seg = 320, R = 2700, base = -220;
  const pos = [], idx = [], hgt = [];
  for (let i = 0; i <= seg; i++) {
    const a = (i / seg) * Math.PI * 2;
    const c = Math.cos(a), s = Math.sin(a);
    let h = 0.5 + 0.5 * fbm(c * 3.1 + 10, s * 3.1 + 10, 4);
    h = Math.pow(h, 1.6) * 520 + 40 + 120 * Math.max(0, fbm(c * 9.3, s * 9.3, 3));
    pos.push(R * c, base, R * s, R * c, base + h, R * s);
    hgt.push(0, h / 600);
  }
  for (let i = 0; i < seg; i++) {
    const a = i * 2, b = a + 1, c = a + 2, d = a + 3;
    idx.push(a, c, b, b, c, d);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('aH', new THREE.Float32BufferAttribute(hgt, 1));
  g.setIndex(idx);
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      uSunDir: { value: SUN_DIR.clone() },
      uZenith: { value: PALETTE.zenith.clone() },
      uHorizon: { value: PALETTE.horizon.clone() },
      uFogColor: { value: PALETTE.fog.clone() },
    },
    side: THREE.DoubleSide,
    fog: false,
    vertexShader: /* glsl */ `
      attribute float aH; varying float vH; varying vec3 vDir;
      void main(){ vH = aH; vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      ${GLSL_SKY}
      varying float vH; varying vec3 vDir;
      void main(){
        vec3 haze = skyColor(vec3(vDir.x, 0.0, vDir.z));
        vec3 rock = mix(vec3(0.36, 0.44, 0.62), vec3(0.55, 0.60, 0.72), smoothstep(0.35, 0.9, vH));
        float sunSide = 0.5 + 0.5 * dot(normalize(vec3(vDir.x, 0.0, vDir.z)), -uSunDir);
        rock = mix(rock, rock * vec3(1.15, 1.05, 0.9), sunSide * 0.5);
        // snow caps
        rock = mix(rock, vec3(0.85, 0.9, 1.0), smoothstep(0.62, 0.85, vH));
        vec3 col = mix(rock, haze, 0.62 + 0.25 * (1.0 - vH));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(g, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -9;
  return mesh;
}
