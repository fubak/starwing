// Space backdrop for the boss arena: nebula sky dome, Venom planet with
// atmosphere rim, procedural PMREM environment for real specular response.

const NOISE_GLSL = /* glsl */ `
  float hash13(vec3 p) { p = fract(p * 0.3183099 + vec3(0.1, 0.2, 0.3)); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
  float vnoise(vec3 p) {
    vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
    return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
               mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
  }
  float fbm(vec3 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
`;

export function buildSky(THREE, scene, renderer, sunDir) {
  const group = new THREE.Group();
  group.name = 'sky';

  // ---------- dome
  const dome = new THREE.Mesh(
    new THREE.SphereGeometry(3500, 48, 32),
    new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { uSun: { value: sunDir.clone() } },
      vertexShader: /* glsl */ `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        precision highp float; varying vec3 vDir; uniform vec3 uSun; ${NOISE_GLSL}
        void main(){
          vec3 d = normalize(vDir);
          // base gradient: deep navy up, dusty violet toward the planet side (down-left)
          vec3 col = mix(vec3(0.020, 0.024, 0.060), vec3(0.055, 0.030, 0.085), smoothstep(0.4, -0.6, d.y));
          // nebula lobes
          float n1 = fbm(d * 2.2 + vec3(3.1, 0.0, 1.7));
          float n2 = fbm(d * 4.5 + vec3(-1.0, 5.0, 2.0));
          float band = exp(-pow((d.y * 0.8 + d.x * 0.45 + 0.15) * 3.2, 2.0));
          float neb = smoothstep(0.42, 0.78, n1) * band;
          col += vec3(0.42, 0.14, 0.62) * neb * 0.9;
          col += vec3(0.05, 0.35, 0.45) * smoothstep(0.55, 0.85, n2) * band * 0.7;
          col += vec3(0.30, 0.06, 0.10) * smoothstep(0.6, 0.9, fbm(d * 3.0 + 9.0)) * (1.0 - band) * 0.35;
          // stars: two cell layers
          for (int l = 0; l < 2; l++) {
            float sc = l == 0 ? 160.0 : 420.0;
            vec3 p = d * sc; vec3 c = floor(p); vec3 f = fract(p) - 0.5;
            float h = hash13(c);
            vec3 off = vec3(hash13(c + 1.3), hash13(c + 2.7), hash13(c + 4.1)) - 0.5;
            float dist = length(f - off * 0.6);
            float br = smoothstep(0.996 - float(l) * 0.03, 1.0, h);
            float star = br * smoothstep(0.09, 0.0, dist) * (l == 0 ? 1.6 : 0.7);
            vec3 tint = mix(vec3(0.75, 0.85, 1.0), vec3(1.0, 0.85, 0.7), hash13(c + 7.7));
            col += tint * star;
          }
          // sun glare
          float s = max(dot(d, normalize(uSun)), 0.0);
          col += vec3(1.0, 0.85, 0.65) * (pow(s, 600.0) * 6.0 + pow(s, 24.0) * 0.35 + pow(s, 4.0) * 0.05);
          gl_FragColor = vec4(col, 1.0);
        }`,
    })
  );
  dome.frustumCulled = false;
  group.add(dome);

  // ---------- Venom planet (toxic ochre/green), lower-left, huge
  const planetPos = new THREE.Vector3(-1500, -1150, -2300);
  const planet = new THREE.Mesh(
    new THREE.SphereGeometry(1000, 64, 48),
    new THREE.ShaderMaterial({
      uniforms: { uSun: { value: sunDir.clone() } },
      vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vP; varying vec3 vV;
        void main(){ vN = normalize(mat3(modelMatrix) * normal); vP = position * 0.004; vec4 wp = modelMatrix * vec4(position,1.0); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */ `precision highp float; varying vec3 vN; varying vec3 vP; varying vec3 vV; uniform vec3 uSun; ${NOISE_GLSL}
        void main(){
          vec3 n = normalize(vN); vec3 s = normalize(uSun);
          float bands = fbm(vec3(vP.x * 0.6, vP.y * 2.5, vP.z * 0.6) + fbm(vP * 1.5) * 0.8);
          float storms = fbm(vP * 4.0 + 3.0);
          vec3 a = vec3(0.55, 0.52, 0.18), b = vec3(0.22, 0.30, 0.12), c = vec3(0.75, 0.68, 0.35);
          vec3 alb = mix(a, b, smoothstep(0.35, 0.65, bands));
          alb = mix(alb, c, smoothstep(0.62, 0.8, storms) * 0.7);
          float ndl = max(dot(n, s), 0.0);
          float wrap = smoothstep(-0.25, 0.6, dot(n, s));
          vec3 col = alb * (ndl * 1.3 + 0.03) + alb * wrap * 0.15;
          float fres = pow(1.0 - max(dot(n, normalize(vV)), 0.0), 3.0);
          col += vec3(0.55, 0.85, 0.35) * fres * (0.25 + 0.9 * wrap);
          gl_FragColor = vec4(col, 1.0);
        }`,
    })
  );
  planet.position.copy(planetPos);
  group.add(planet);
  const halo = new THREE.Mesh(
    new THREE.SphereGeometry(1060, 48, 32),
    new THREE.ShaderMaterial({
      transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.BackSide,
      uniforms: { uSun: { value: sunDir.clone() } },
      vertexShader: /* glsl */ `varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 wp = modelMatrix * vec4(position,1.0); vV = normalize(cameraPosition - wp.xyz); gl_Position = projectionMatrix * viewMatrix * wp; }`,
      fragmentShader: /* glsl */ `precision highp float; varying vec3 vN; varying vec3 vV; uniform vec3 uSun;
        void main(){ vec3 n = normalize(vN); float f = pow(max(dot(n, normalize(vV)), 0.0), 4.0); float lit = smoothstep(-0.4, 0.5, dot(-n, normalize(uSun))); gl_FragColor = vec4(vec3(0.5, 0.95, 0.4) * f * (0.2 + lit) * 0.8, 1.0); }`,
    })
  );
  halo.position.copy(planetPos);
  group.add(halo);
  scene.add(group);

  // ---------- environment (PMREM of a tiny synthetic scene: warm sun, violet nebula, green planet bounce)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const env = new THREE.Scene();
  env.background = new THREE.Color(0x0a0c1c);
  const add = (geo, color, pos, scale = 1) => { const m = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color })); m.position.copy(pos); m.scale.setScalar(scale); env.add(m); return m; };
  add(new THREE.SphereGeometry(1, 16, 8), new THREE.Color(28, 22, 16), sunDir.clone().multiplyScalar(12), 1.2);
  add(new THREE.SphereGeometry(1, 16, 8), new THREE.Color(0.9, 0.35, 1.2), new THREE.Vector3(-8, 6, -6), 4);
  add(new THREE.SphereGeometry(1, 16, 8), new THREE.Color(0.25, 0.6, 0.9), new THREE.Vector3(9, 2, -10), 3);
  add(new THREE.SphereGeometry(1, 16, 8), new THREE.Color(0.7, 0.9, 0.3), new THREE.Vector3(-10, -9, -8), 6);
  add(new THREE.SphereGeometry(1, 16, 8), new THREE.Color(0.15, 0.15, 0.25), new THREE.Vector3(0, -12, 4), 6);
  const envTex = pmrem.fromScene(env, 0.02).texture;
  scene.environment = envTex;
  if ('environmentIntensity' in scene) scene.environmentIntensity = 0.55;
  pmrem.dispose();

  return {
    group,
    dispose() {
      scene.remove(group);
      group.traverse((o) => { o.geometry?.dispose?.(); o.material?.dispose?.(); });
      envTex.dispose(); scene.environment = null;
    },
  };
}
