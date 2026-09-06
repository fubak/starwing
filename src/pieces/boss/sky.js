// Space backdrop for the boss arena: nebula sky, Venom planet with atmosphere
// rim, sun glare. Everything is rendered ONCE into an HDR cubemap at startup
// (the planet is ~3000 units away so parallax over the arena is nil); that
// cube becomes scene.background and, via PMREM, the specular environment so
// hull reflections match the sky exactly. Per-frame cost: one cube sample.

const NOISE_GLSL = /* glsl */ `
  float hash13(vec3 p) { p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vnoise(vec3 p) {
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 6; i++) { s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
`;

export function buildSky(THREE, scene, renderer, sunDir, { size = 640 } = {}) {
  const bake = new THREE.Scene();

  // ---------- dome
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(4000, 32, 16),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false,
      uniforms: { uSun: { value: sunDir.clone() } },
      vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        precision highp float; varying vec3 vDir; uniform vec3 uSun; ${NOISE_GLSL}
        void main(){
          vec3 d = normalize(vDir);
          // base gradient: deep navy above, dusty violet toward the planet side
          vec3 col = mix(vec3(0.012, 0.016, 0.045), vec3(0.06, 0.028, 0.08), smoothstep(0.5, -0.7, d.y));
          // nebula: a broad diagonal band with two colour families + dark dust lanes
          float n1 = fbm(d * 2.2 + vec3(3.1, 0.0, 1.7));
          float n2 = fbm(d * 4.5 + vec3(-1.0, 5.0, 2.0));
          float dust = fbm(d * 6.0 + 21.0);
          float band = exp(-pow((d.y * 0.8 + d.x * 0.45 + 0.15) * 2.8, 2.0));
          float neb = smoothstep(0.40, 0.80, n1) * band;
          col += vec3(0.55, 0.16, 0.70) * neb * 0.42;
          col += vec3(0.95, 0.35, 0.45) * pow(neb, 2.5) * 0.45;
          col += vec3(0.06, 0.40, 0.55) * smoothstep(0.55, 0.85, n2) * band * 0.35;
          col *= 1.0 - smoothstep(0.55, 0.75, dust) * band * 0.7;
          col += vec3(0.30, 0.06, 0.10) * smoothstep(0.6, 0.9, fbm(d * 3.0 + 9.0)) * (1.0 - band) * 0.35;
          // stars: three cell layers, denser away from the nebula core
          for (int l = 0; l < 3; l++) {
            float sc = l == 0 ? 140.0 : (l == 1 ? 380.0 : 900.0);
            vec3 p = d * sc; vec3 c = floor(p); vec3 f = fract(p) - 0.5;
            float h = hash13(c);
            vec3 off = vec3(hash13(c + 1.3), hash13(c + 2.7), hash13(c + 4.1)) - 0.5;
            float dist = length(f - off * 0.6);
            float br = smoothstep(0.995 - float(l) * 0.02, 1.0, h);
            float star = br * smoothstep(0.10, 0.0, dist) * (l == 0 ? 2.4 : (l == 1 ? 0.9 : 0.35));
            vec3 tint = mix(vec3(0.72, 0.84, 1.0), vec3(1.0, 0.86, 0.68), hash13(c + 7.7));
            col += tint * star * (1.0 - neb * 0.6);
          }
          // sun glare (HDR)
          float s = max(dot(d, normalize(uSun)), 0.0);
          col += vec3(1.0, 0.86, 0.66) * (pow(s, 1200.0) * 40.0 + pow(s, 60.0) * 1.2 + pow(s, 6.0) * 0.08);
          gl_FragColor = vec4(col, 1.0);
        }`,
    })
  );
  bake.add(dome);

  // ---------- Venom planet (toxic ochre / acid green, banded, with storm cells), lower-left, huge
  const planetPos = new THREE.Vector3(-1500, -1150, -2300);
  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(760, 96, 64),
    new THREE.ShaderMaterial({
      uniforms: { uSun: { value: sunDir.clone() } },
      vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vP; varying vec3 vV;
        void main(){ vN = normalize(mat3(modelMatrix) * normal); vP = position * 0.004; vec4 wp = modelMatrix * vec4(position,1.0); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */ `precision highp float; varying vec3 vN; varying vec3 vP; varying vec3 vV; uniform vec3 uSun; ${NOISE_GLSL}
        void main(){
          vec3 n = normalize(vN); vec3 s = normalize(uSun);
          float warp = fbm(vP * 1.5) * 0.9;
          float bands = fbm(vec3(vP.x * 0.5, vP.y * 3.0, vP.z * 0.5) + warp);
          float storms = fbm(vP * 4.0 + 3.0 + warp * 0.5);
          float cont = fbm(vP * 1.1 + 40.0);
          vec3 sea = vec3(0.16, 0.22, 0.10), land = vec3(0.50, 0.44, 0.16), high = vec3(0.72, 0.62, 0.30), acid = vec3(0.45, 0.62, 0.18);
          vec3 alb = mix(sea, land, smoothstep(0.42, 0.58, cont));
          alb = mix(alb, high, smoothstep(0.62, 0.72, cont));
          alb = mix(alb, acid, smoothstep(0.55, 0.75, bands) * 0.55);
          // storm / cloud swirls
          float cloud = smoothstep(0.58, 0.78, storms);
          alb = mix(alb, vec3(0.85, 0.80, 0.62), cloud * 0.8);
          float ndl = dot(n, s);
          float day = smoothstep(-0.05, 0.35, ndl);
          float wrap = smoothstep(-0.30, 0.6, ndl);
          vec3 col = alb * (max(ndl, 0.0) * 1.05 + 0.012) + alb * wrap * 0.08;
          // night side: faint city/lava glow specks
          float night = 1.0 - day;
          col += vec3(1.0, 0.45, 0.15) * smoothstep(0.80, 0.95, fbm(vP * 9.0 + 77.0)) * night * 0.6;
          // atmosphere: fresnel rim tinted acid green, strongest toward the sun
          float fres = pow(1.0 - max(dot(n, normalize(vV)), 0.0), 3.5);
          col += vec3(0.55, 0.90, 0.35) * fres * (0.15 + 1.1 * wrap);
          // terminator warmth
          col += vec3(0.6, 0.35, 0.1) * exp(-pow(ndl * 6.0, 2.0)) * 0.25;
          gl_FragColor = vec4(col, 1.0);
        }`,
    })
  );
  planet.position.copy(planetPos);
  bake.add(planet);
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(826, 64, 32),
    new THREE.ShaderMaterial({
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
      uniforms: { uSun: { value: sunDir.clone() } },
      vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 wp = modelMatrix * vec4(position,1.0); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */ `precision highp float; varying vec3 vN; varying vec3 vV; uniform vec3 uSun;
        void main(){ vec3 n = normalize(vN); float f = pow(max(dot(n, normalize(vV)), 0.0), 3.0); float lit = smoothstep(-0.5, 0.6, dot(-n, normalize(uSun))); gl_FragColor = vec4(vec3(0.45, 0.95, 0.40) * f * (0.12 + lit) * 1.1, 1.0); }`,
    })
  );
  halo.position.copy(planetPos);
  bake.add(halo);

  // ---------- bake to an HDR cubemap
  const rt = new THREE.WebGLCubeRenderTarget(size, { type: THREE.HalfFloatType, generateMipmaps: true, minFilter: THREE.LinearMipmapLinearFilter });
  const cc = new THREE.CubeCamera(1, 20000, rt);
  cc.update(renderer, bake);
  bake.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });

  scene.background = rt.texture;
  scene.backgroundIntensity = 1.0;

  // ---------- environment: the baked sky itself (so specular matches), lifted a little
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envTex = pmrem.fromCubemap(rt.texture).texture;
  scene.environment = envTex;
  if ('environmentIntensity' in scene) scene.environmentIntensity = 1.0;
  pmrem.dispose();

  return {
    texture: rt.texture,
    dispose() {
      rt.dispose(); envTex.dispose();
      if (scene.background === rt.texture) scene.background = null;
      if (scene.environment === envTex) scene.environment = null;
    },
  };
}
