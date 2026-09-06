// Nebula backdrop, starfield, sun disc, planet with atmosphere + moon.
import * as THREE from 'three';
import { NOISE_GLSL } from './glsl.js';
import { bakeTexture } from './bake.js';

export const SUN_DIR = new THREE.Vector3(-0.55, 0.42, -0.72).normalize();

export function buildNebula() {
  const geo = new THREE.SphereGeometry(4200, 48, 32);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    uniforms: { uSun: { value: SUN_DIR } },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      ${NOISE_GLSL}
      varying vec3 vDir;
      uniform vec3 uSun;
      void main() {
        vec3 d = vDir;
        // deep space base: cold navy with a faint violet tilt
        vec3 col = vec3(0.012, 0.016, 0.040);
        // primary nebula lobe: magenta/teal cloud swirl along a tilted band
        vec3 band = d + 0.25 * vec3(snoise(d * 1.6), snoise(d * 1.6 + 7.0), 0.0);
        float lane = exp(-4.5 * pow(abs(band.y * 0.85 + band.x * 0.35 + 0.15), 1.4));
        float n1 = fbm(d * 2.4 + vec3(1.0, 3.0, 2.0));
        float n2 = fbm(d * 5.5 + vec3(9.0, 1.0, 4.0));
        float cloud = smoothstep(-0.15, 0.55, n1 + 0.5 * n2) * lane;
        vec3 teal = vec3(0.10, 0.45, 0.62);
        vec3 magenta = vec3(0.62, 0.18, 0.55);
        vec3 amber = vec3(0.95, 0.55, 0.30);
        float mixT = smoothstep(-0.3, 0.4, snoise(d * 1.3 + 4.0));
        vec3 neb = mix(teal, magenta, mixT);
        col += neb * cloud * 0.55;
        // bright filaments
        float fil = pow(ridged(d * 6.0 + 2.0), 3.0) * lane;
        col += amber * fil * 0.35 * smoothstep(0.1, 0.6, cloud + 0.2);
        // dust lane darkening
        float dust = smoothstep(0.2, 0.8, fbm4(d * 3.3 + 11.0)) * lane;
        col *= 1.0 - 0.45 * dust;
        // sun glow halo
        float s = max(dot(d, uSun), 0.0);
        col += vec3(1.0, 0.85, 0.65) * (pow(s, 40.0) * 0.6 + pow(s, 400.0) * 3.0);
        // fine star dust speckle
        float sp = smoothstep(0.86, 1.0, snoise(d * 220.0)) * 0.12;
        col += vec3(sp);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.frustumCulled = false;
  mesh.renderOrder = -10;
  return mesh;
}

export function buildStars(rng, count = 2600) {
  const pos = new Float32Array(count * 3);
  const col = new Float32Array(count * 3);
  const size = new Float32Array(count);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const u = rng.next() * 2 - 1, th = rng.next() * Math.PI * 2;
    const r = Math.sqrt(1 - u * u);
    pos[i * 3] = r * Math.cos(th) * 4000;
    pos[i * 3 + 1] = u * 4000;
    pos[i * 3 + 2] = r * Math.sin(th) * 4000;
    const temp = rng.next();
    if (temp < 0.15) c.setHSL(0.6, 0.6, 0.85); // blue-white
    else if (temp < 0.3) c.setHSL(0.08, 0.7, 0.75); // amber
    else c.setHSL(0.12, 0.1, 0.92);
    const br = 0.35 + Math.pow(rng.next(), 3) * 1.4;
    col[i * 3] = c.r * br; col[i * 3 + 1] = c.g * br; col[i * 3 + 2] = c.b * br;
    size[i] = 1.2 + Math.pow(rng.next(), 4) * 3.2;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  geo.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
  const mat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uPR: { value: 1 } },
    vertexShader: /* glsl */ `
      attribute float aSize; attribute vec3 color; varying vec3 vC; uniform float uPR;
      void main() { vC = color; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); gl_PointSize = aSize * uPR; }`,
    fragmentShader: /* glsl */ `
      varying vec3 vC;
      void main() { vec2 q = gl_PointCoord - 0.5; float d = length(q); float a = smoothstep(0.5, 0.05, d); gl_FragColor = vec4(vC * a, a); }`,
  });
  const pts = new THREE.Points(geo, mat);
  pts.frustumCulled = false;
  pts.renderOrder = -9;
  return pts;
}

export function buildSun() {
  const tex = radialTexture(256, [[0, 'rgba(255,250,235,1)'], [0.18, 'rgba(255,235,190,1)'], [0.3, 'rgba(255,190,110,0.5)'], [1, 'rgba(255,150,80,0)']]);
  const mat = new THREE.SpriteMaterial({ map: tex, blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false, transparent: true, toneMapped: false });
  const s = new THREE.Sprite(mat);
  s.position.copy(SUN_DIR).multiplyScalar(3900);
  s.scale.setScalar(520);
  s.renderOrder = -8;
  return s;
}

function radialTexture(size, stops) {
  const cv = document.createElement('canvas'); cv.width = cv.height = size;
  const g = cv.getContext('2d');
  const grad = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, c] of stops) grad.addColorStop(o, c);
  g.fillStyle = grad; g.fillRect(0, 0, size, size);
  const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
}

/** Corneria-like planet. Surface detail is baked once to equirect textures (GPU), shaded cheaply per frame. */
export function buildPlanet(renderer, { radius = 1050, position = new THREE.Vector3(1500, -700, -2600) } = {}) {
  const group = new THREE.Group();
  group.position.copy(position);
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
          gl_FragColor = vec4(alb * (ndl * vec3(1.0, 0.95, 0.88) + vec3(0.015, 0.02, 0.04)), 1.0);
        }`,
    }),
  );
  moon.position.set(-radius * 1.9, radius * 0.75, radius * 0.6);
  group.add(moon);
  return {
    group, surf, atmo, moon,
    update(t) { surf.material.uniforms.uTime.value = t; surf.rotation.y = t * 0.002; },
    dispose() { albedoRT.dispose(); dataRT.dispose(); moonRT.dispose(); },
  };
}
