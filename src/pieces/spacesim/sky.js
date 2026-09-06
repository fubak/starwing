// Planet with atmosphere rim + moon (surface detail GPU-baked once). Sky/nebula come from lookdev.
import * as THREE from 'three';
import { NOISE_GLSL } from './glsl.js';
import { bakeTexture } from './bake.js';
import { makePlanet } from '../lookdev/index.js';

export const SUN_DIR = new THREE.Vector3(0.62, 0.3, -0.72).normalize(); // overwritten from the look preset

/** Corneria-like planet. Surface detail is baked once to equirect textures (GPU), shaded cheaply per frame. */
export function buildPlanet(renderer, { radius = 1050, position = new THREE.Vector3(1500, -700, -2600), preset = null } = {}) {
  const group = new THREE.Group();
  group.position.copy(position);
  if (preset) return buildLookdevPlanet(renderer, group, radius, preset);
  const dirFromUv = /* glsl */ `
    vec3 dirFromUv(vec2 uv) { float ph = (uv.x) * 6.2831853; float th = (1.0 - uv.y) * 3.14159265; return vec3(sin(th) * cos(ph), cos(th), sin(th) * sin(ph)); }`;
  // albedo.rgb + clouds.a
  const albedoRT = bakeTexture(renderer, /* glsl */ `
    ${NOISE_GLSL} ${dirFromUv}
    varying vec2 vUv;
    void main() {
      vec3 p = dirFromUv(vUv);
      float h = fbm(p * 2.2) + 0.45 * ridged(p * 5.0) - 0.35;
      float land = smoothstep(-0.02, 0.03, h);
      float ice = smoothstep(0.72, 0.9, abs(p.y) + 0.15 * snoise(p * 6.0));
      vec3 ocean = mix(vec3(0.02, 0.10, 0.32), vec3(0.05, 0.28, 0.55), smoothstep(-0.5, 0.0, h));
      float shelf = smoothstep(-0.12, 0.0, h);
      ocean = mix(ocean, vec3(0.08, 0.45, 0.55), shelf * 0.6);
      vec3 lowland = vec3(0.16, 0.42, 0.14);
      vec3 highland = vec3(0.48, 0.38, 0.22);
      vec3 peaks = vec3(0.85, 0.85, 0.82);
      vec3 terrain = mix(lowland, highland, smoothstep(0.05, 0.28, h));
      terrain = mix(terrain, peaks, smoothstep(0.32, 0.45, h));
      terrain *= 0.85 + 0.3 * snoise(p * 40.0);
      vec3 albedo = mix(ocean, terrain, land);
      albedo = mix(albedo, vec3(0.9, 0.93, 0.97), ice);
      vec3 cp = p * 3.4;
      float cl = fbm(cp) * 0.6 + 0.5 * fbm4(cp * 3.0 + 5.0);
      float clouds = smoothstep(0.18, 0.55, cl) * (0.6 + 0.4 * smoothstep(0.0, 0.4, cl));
      gl_FragColor = vec4(albedo, clouds);
    }`, 2048, 1024);
  // data: land, height, cities, ice
  const dataRT = bakeTexture(renderer, /* glsl */ `
    ${NOISE_GLSL} ${dirFromUv}
    varying vec2 vUv;
    void main() {
      vec3 p = dirFromUv(vUv);
      float h = fbm(p * 2.2) + 0.45 * ridged(p * 5.0) - 0.35;
      float land = smoothstep(-0.02, 0.03, h);
      float ice = smoothstep(0.72, 0.9, abs(p.y) + 0.15 * snoise(p * 6.0));
      float cities = smoothstep(0.75, 0.95, snoise(p * 60.0)) * land * (1.0 - ice) * smoothstep(0.0, 0.1, h);
      gl_FragColor = vec4(land, clamp(h * 0.5 + 0.5, 0.0, 1.0), cities, ice);
    }`, 1024, 512);
  const surf = new THREE.Mesh(
    new THREE.SphereGeometry(radius, 96, 64),
    new THREE.ShaderMaterial({
      uniforms: { uSun: { value: SUN_DIR }, uTime: { value: 0 }, tAlbedo: { value: albedoRT.texture }, tData: { value: dataRT.texture } },
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vW; varying vec2 vUv;
        void main() {
          vN = normalize(mat3(modelMatrix) * normal); vUv = uv;
          vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz;
          gl_Position = projectionMatrix * viewMatrix * w;
        }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSun; uniform float uTime; uniform sampler2D tAlbedo; uniform sampler2D tData;
        varying vec3 vN; varying vec3 vW; varying vec2 vUv;
        void main() {
          vec3 n = normalize(vN);
          vec3 V = normalize(cameraPosition - vW);
          vec4 A = texture2D(tAlbedo, vUv);
          vec4 D = texture2D(tData, vUv);
          float clouds = texture2D(tAlbedo, vUv + vec2(uTime * 0.0012, 0.0)).a;
          vec3 albedo = A.rgb; float land = D.r;
          float ndl = dot(n, uSun);
          float day = smoothstep(-0.08, 0.25, ndl);
          float terminator = smoothstep(-0.05, 0.12, ndl) * (1.0 - smoothstep(0.12, 0.5, ndl));
          vec3 sunCol = vec3(1.0, 0.95, 0.85);
          vec3 lit = albedo * sunCol * max(ndl, 0.0);
          vec3 H = normalize(uSun + V);
          float spec = pow(max(dot(n, H), 0.0), 120.0) * (1.0 - land) * (1.0 - clouds) * day;
          lit += sunCol * spec * 1.6;
          vec3 cloudCol = vec3(1.0) * max(ndl, 0.0) * sunCol;
          lit = mix(lit, cloudCol, clouds);
          vec3 nightAmb = vec3(0.02, 0.03, 0.06);
          vec3 night = albedo * nightAmb + vec3(1.0, 0.75, 0.4) * D.b * 0.9 * (1.0 - clouds);
          vec3 col = mix(night, lit, day);
          col += vec3(1.0, 0.45, 0.2) * terminator * 0.12 * (1.0 - clouds * 0.5);
          float fres = pow(1.0 - max(dot(n, V), 0.0), 3.0);
          vec3 atmo = mix(vec3(0.25, 0.55, 1.0), vec3(1.0, 0.6, 0.35), pow(terminator, 0.7));
          col = mix(col, atmo * (0.35 + 0.65 * day), fres * 0.85);
          gl_FragColor = vec4(col, 1.0);
        }`,
    }),
  );
  group.add(surf);
  // outer atmosphere shell
  const atmo = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 1.045, 64, 48),
    new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
      uniforms: { uSun: { value: SUN_DIR } },
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vW;
        void main() { vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSun; varying vec3 vN; varying vec3 vW;
        void main() {
          vec3 n = normalize(vN); vec3 V = normalize(cameraPosition - vW);
          float rim = max(dot(n, -V), 0.0);
          float day = smoothstep(-0.35, 0.4, dot(n, uSun));
          vec3 c = mix(vec3(0.30, 0.55, 1.0), vec3(1.0, 0.55, 0.30), pow(1.0 - day, 3.0) * smoothstep(-0.5, -0.1, dot(n, uSun)));
          float a = pow(rim, 3.5) * (0.25 + 0.9 * day);
          gl_FragColor = vec4(c * a * 1.4, a);
        }`,
    }),
  );
  group.add(atmo);
  // moon (baked albedo)
  const moonRT = bakeTexture(renderer, /* glsl */ `
    ${NOISE_GLSL} ${dirFromUv}
    varying vec2 vUv;
    void main() {
      vec3 p = dirFromUv(vUv);
      float cr = 0.0;
      for (int i = 0; i < 3; i++) { float s = 4.0 + float(i) * 5.0; float c = snoise(p * s + float(i) * 3.0); cr += smoothstep(0.55, 0.75, c) * (0.25 / (1.0 + float(i))); }
      float maria = smoothstep(0.1, 0.5, fbm4(p * 1.8 + 2.0));
      vec3 alb = mix(vec3(0.62, 0.60, 0.58), vec3(0.32, 0.31, 0.33), maria) * (1.0 - cr * 0.6) * (0.85 + 0.3 * snoise(p * 30.0));
      gl_FragColor = vec4(alb, 1.0);
    }`, 1024, 512);
  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(radius * 0.22, 48, 32),
    new THREE.ShaderMaterial({
      uniforms: { uSun: { value: SUN_DIR }, tAlbedo: { value: moonRT.texture } },
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec2 vUv;
        void main() { vN = normalize(mat3(modelMatrix) * normal); vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSun; uniform sampler2D tAlbedo; varying vec3 vN; varying vec2 vUv;
        void main() {
          vec3 n = normalize(vN); vec3 alb = texture2D(tAlbedo, vUv).rgb;
          float ndl = max(dot(n, uSun), 0.0);
          gl_FragColor = vec4(alb * (ndl * vec3(1.0, 0.95, 0.88) + vec3(0.03, 0.04, 0.08)), 1.0);
        }`,
    }),
  );
  const moonOrbit = new THREE.Group(); moonOrbit.rotation.x = 0.25; moonOrbit.add(moon);
  moon.position.set(radius * 2.0, radius * 0.35, radius * 0.4);
  group.add(moonOrbit);
  return {
    group, surf, atmo, moon,
    update(t) { surf.material.uniforms.uTime.value = t; surf.rotation.y = t * 0.002; moonOrbit.rotation.y = t * 0.006; moon.rotation.y = t * 0.01; },
    dispose() { albedoRT.dispose(); dataRT.dispose(); moonRT.dispose(); },
  };
}

/** Round 3: the shared lookdev planet (continents + drifting cloud shell + crisp limb halo, tinted by the
 *  look preset) replaces the local noise-splat sphere. Our moon (baked craters) stays. */
function buildLookdevPlanet(renderer, group, radius, preset) {
  const planet = makePlanet({ radius, seed: 11, haloScale: 1.055, gpu: true, preset });
  // tilt so the equator / continents face the belt rather than an ice cap, and spin a coastline into view
  planet.rotation.set(0.35, 2.2, 0.15);
  group.add(planet);
  const moonRT = bakeMoon(renderer);
  const moon = makeMoon(radius, moonRT.texture);
  const moonOrbit = new THREE.Group(); moonOrbit.rotation.x = 0.25; moonOrbit.add(moon);
  moon.position.set(radius * 2.0, radius * 0.35, radius * 0.4);
  group.add(moonOrbit);
  return {
    group, surf: planet, atmo: null, moon, planet,
    update(t, dt = 1 / 60) { planet.update(dt, t); moonOrbit.rotation.y = t * 0.006; moon.rotation.y = t * 0.01; },
    setPreset(p) { planet.setPreset(p); },
    dispose() { planet.disposePlanet(); moonRT.dispose(); moon.geometry.dispose(); moon.material.dispose(); },
  };
}

function bakeMoon(renderer) {
  const dirFromUv = /* glsl */ `
    vec3 dirFromUv(vec2 uv) { float ph = (uv.x) * 6.2831853; float th = (1.0 - uv.y) * 3.14159265; return vec3(sin(th) * cos(ph), cos(th), sin(th) * sin(ph)); }`;
  return bakeTexture(renderer, /* glsl */ `
    ${NOISE_GLSL} ${dirFromUv}
    varying vec2 vUv;
    void main() {
      vec3 p = dirFromUv(vUv);
      float cr = 0.0;
      for (int i = 0; i < 3; i++) { float s = 4.0 + float(i) * 5.0; float c = snoise(p * s + float(i) * 3.0); cr += smoothstep(0.55, 0.75, c) * (0.25 / (1.0 + float(i))); }
      float maria = smoothstep(0.1, 0.5, fbm4(p * 1.8 + 2.0));
      vec3 alb = mix(vec3(0.62, 0.60, 0.58), vec3(0.32, 0.31, 0.33), maria) * (1.0 - cr * 0.6) * (0.85 + 0.3 * snoise(p * 30.0));
      gl_FragColor = vec4(alb, 1.0);
    }`, 1024, 512);
}

function makeMoon(radius, tex) {
  return new THREE.Mesh(
    new THREE.SphereGeometry(radius * 0.22, 48, 32),
    new THREE.ShaderMaterial({
      uniforms: { uSun: { value: SUN_DIR }, tAlbedo: { value: tex } },
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec2 vUv; varying vec3 vW;
        void main() { vN = normalize(mat3(modelMatrix) * normal); vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
      fragmentShader: /* glsl */ `
        uniform vec3 uSun; uniform sampler2D tAlbedo; varying vec3 vN; varying vec2 vUv; varying vec3 vW;
        void main() {
          vec3 n = normalize(vN); vec3 alb = texture2D(tAlbedo, vUv).rgb;
          vec3 V = normalize(cameraPosition - vW);
          float ndl = dot(n, uSun);
          float wrap = clamp((ndl + 0.08) / 1.08, 0.0, 1.0);
          float rim = pow(1.0 - max(dot(n, V), 0.0), 4.0) * smoothstep(-0.2, 0.3, ndl);
          vec3 col = alb * (wrap * vec3(1.0, 0.95, 0.88) * 1.15 + vec3(0.03, 0.04, 0.08)) + rim * vec3(0.9, 0.85, 0.8) * 0.35;
          gl_FragColor = vec4(col, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    }),
  );
}
