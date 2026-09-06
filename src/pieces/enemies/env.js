/**
 * Showcase environment for the enemies piece.
 * Uses the shared lookdev rig (sky, sun/hemi/fill, PMREM env, ACES exposure,
 * bloom, grade) with a custom "Venom sunset" preset, plus a procedural ocean
 * and a lookdev planet on the horizon.
 */
import * as THREE from 'three';
import { applyLook, makePlanet, PRESETS } from '../lookdev/index.js';

const NOISE_GLSL = /* glsl */`
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
  }
  float fbm(vec2 p){
    float v = 0.0, a = 0.5; mat2 m = mat2(1.6,1.2,-1.2,1.6);
    for(int i=0;i<4;i++){ v += a*vnoise(p); p = m*p; a *= 0.5; }
    return v;
  }
`;

/** Custom look: late golden hour over the Venom sea. Sun low, in frame (upper-right),
 *  warm key + violet fill from behind the camera so approaching hulls read. */
export const ENEMY_LOOK = {
  ...PRESETS.sunset,
  name: 'venomSunset',
  label: 'VENOM SEA · DUSK',
  exposure: 1.05,
  envIntensity: 0.75,
  bloom: { strength: 0.34, radius: 0.5, threshold: 0.9 },
  sun: { dir: [0.5, 0.3, -0.6], color: 0xffb870, intensity: 3.4, size: 0.035, glow: 0.6 },
  hemi: { sky: 0x8a6cd0, ground: 0x6a4a52, intensity: 1.0 },
  fill: { dir: [-0.45, 0.4, 0.8], color: 0xd8c0ff, intensity: 1.6 },
  fog: { color: 0xf09456, density: 0.0007 },
  sky: { zenith: 0x2a1a60, horizon: 0xff9a44, ground: 0x2a1a30, haze: 5.0, stars: 0.25, nebula: 0.3, nebulaA: 0x3a1e6a, nebulaB: 0xb0326e, milky: 0.0 },
  grade: { contrast: 1.1, saturation: 1.18, lift: 0x06020a, gain: 0xfff0e2, gamma: 1.0, vignette: 0.38, grain: 0.02 },
};

export function makeOceanMaterial(p) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uSun: { value: new THREE.Vector3(...ENEMY_LOOK.sun.dir).normalize() }, uSunColor: { value: new THREE.Color(ENEMY_LOOK.sun.color) },
      uDeep: { value: new THREE.Color(0x071a30) }, uShallow: { value: new THREE.Color(0x14586a) },
      uSky: { value: new THREE.Color(0x3a4a8a) }, uHorizon: { value: new THREE.Color(ENEMY_LOOK.fog.color) }, uFogNear: { value: 120 }, uFogFar: { value: 1600 },
    },
    vertexShader: /* glsl */`
      varying vec3 vW; void main(){ vec4 wp = modelMatrix*vec4(position,1.0); vW = wp.xyz; gl_Position = projectionMatrix*viewMatrix*wp; }`,
    fragmentShader: /* glsl */`
      varying vec3 vW; uniform float uTime,uFogNear,uFogFar; uniform vec3 uSun,uSunColor,uDeep,uShallow,uSky,uHorizon;
      ${NOISE_GLSL}
      void main(){
        vec2 p = vW.xz * 0.02;
        float t = uTime*0.35;
        float h  = fbm(p + vec2(t, t*0.6)) + 0.5*vnoise(p*3.1 - vec2(t*1.3, 0.0));
        vec2 dh = vec2(dFdx(h), dFdy(h));
        vec2 dpx = vec2(dFdx(p.x), dFdy(p.x)), dpz = vec2(dFdx(p.y), dFdy(p.y));
        float det = dpx.x*dpz.y - dpx.y*dpz.x; det = abs(det) < 1e-7 ? 1e-7 : det;
        float hx = ( dh.x*dpz.y - dh.y*dpz.x) / det;
        float hz = (-dh.x*dpx.y + dh.y*dpx.x) / det;
        vec3 n = normalize(vec3(-hx*0.09, 1.0, -hz*0.09));
        vec3 v = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
        vec3 base = mix(uDeep, uShallow, smoothstep(0.3, 1.2, h));
        vec3 col = mix(base, uSky, 0.2 + 0.6*fres);
        vec3 hv = normalize(uSun + v);
        // long sun glitter lane toward the sun
        float spec = pow(max(dot(n, hv), 0.0), 180.0) * 3.0 + pow(max(dot(n,hv),0.0), 16.0) * 0.35;
        col += uSunColor * spec;
        col += vec3(0.7,0.7,0.8) * smoothstep(1.25, 1.5, h) * 0.4;
        float dist = length(cameraPosition - vW);
        float f = smoothstep(uFogNear, uFogFar, dist);
        col = mix(col, uHorizon, f);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

let _cloudTex = null;
function cloudTexture() {
  if (_cloudTex) return _cloudTex;
  const S = 256, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  // puffy cluster of soft radial blobs
  const R = (a, b) => a + Math.random() * (b - a);
  for (let i = 0; i < 26; i++) {
    const x = R(60, S - 60), y = R(90, S - 70), r = R(28, 62);
    const gr = g.createRadialGradient(x, y, 0, x, y, r);
    gr.addColorStop(0, 'rgba(255,255,255,0.55)'); gr.addColorStop(0.6, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
  }
  _cloudTex = new THREE.CanvasTexture(c); _cloudTex.colorSpace = THREE.SRGBColorSpace;
  return _cloudTex;
}

/** Sprite cloud field: warm-lit on the sun side, cool violet in shadow. */
function makeClouds(scene, rng, n = 34) {
  const tex = cloudTexture();
  const group = new THREE.Group();
  const sunX = Math.sign(ENEMY_LOOK.sun.dir[0]);
  for (let i = 0; i < n; i++) {
    const z = -rng.range(350, 1900), x = rng.range(-1400, 1400), y = rng.range(40, 240) + (-z) * 0.06;
    const near = 1 - THREE.MathUtils.clamp((-z - 350) / 1600, 0, 1);
    const sunSide = THREE.MathUtils.clamp(0.5 + (x * sunX) / 2000, 0, 1);
    const col = new THREE.Color(0x6a4a90).lerp(new THREE.Color(0xffc090), 0.35 + sunSide * 0.55);
    const m = new THREE.SpriteMaterial({ map: tex, color: col, transparent: true, depthWrite: false, opacity: 0.5 + near * 0.3, fog: true });
    const s = new THREE.Sprite(m);
    s.position.set(x, y, z);
    const w = rng.range(260, 520) * (0.6 + near * 0.6);
    s.scale.set(w, w * rng.range(0.32, 0.5), 1);
    s.material.rotation = rng.range(-0.1, 0.1);
    s.userData.drift = rng.range(0.4, 1.2);
    group.add(s);
  }
  scene.add(group);
  return {
    group,
    update(dt) { for (const s of group.children) s.position.x += s.userData.drift * dt; },
    dispose() { scene.remove(group); group.children.forEach((s) => s.material.dispose()); },
  };
}

/**
 * Build the whole environment into ctx.scene. Returns { update(dt,t), flash(v), dispose() }.
 */
export function createEnvironment(ctx) {
  const { scene, camera, rng } = ctx;
  const look = applyLook(ctx, ENEMY_LOOK, { shadowSize: 30, shadowMap: 512 });
  look.sun.castShadow = false;
  look.setFocus(new THREE.Vector3(0, 4, -60));
  // ocean bounce: warm light from below so undersides of banking hulls never go to black
  const bounce = new THREE.DirectionalLight(0xff9a5a, 1.1);
  bounce.position.set(20, -60, 30); bounce.target.position.set(0, 10, -60);
  scene.add(bounce, bounce.target);

  // ocean
  const oceanMat = makeOceanMaterial();
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(9000, 9000, 1, 1), oceanMat);
  ocean.rotation.x = -Math.PI / 2; ocean.position.y = -48;
  scene.add(ocean);

  // moon hanging fully above the horizon haze on the left (so it reads as a sphere, not a dome)
  const planet = makePlanet({ radius: 380, seed: 11, preset: look.preset });
  planet.position.set(-1500, 640, -2800);
  if (planet.lightDir) planet.lightDir.set(0.6, 0.35, -0.5).normalize();
  scene.add(planet);

  // low haze bank: a wide additive gradient card just above the horizon, sells depth
  const hazeMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, fog: false, blending: THREE.NormalBlending,
    uniforms: { uColor: { value: new THREE.Color(0xffa060) }, uTime: { value: 0 } },
    vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; uniform vec3 uColor; uniform float uTime;
      ${NOISE_GLSL}
      void main(){
        float band = smoothstep(0.0, 0.35, vUv.y) * (1.0 - smoothstep(0.45, 1.0, vUv.y));
        float n = fbm(vec2(vUv.x*9.0 + uTime*0.01, vUv.y*3.0));
        float a = band * (0.35 + 0.45*n) * 0.55;
        gl_FragColor = vec4(uColor, a);
      }`,
  });
  const haze = new THREE.Mesh(new THREE.PlaneGeometry(6000, 260), hazeMat);
  haze.position.set(0, 40, -2400); scene.add(haze);

  const clouds = makeClouds(scene, rng);

  // Harness friendliness: in deterministic (fixed-step) mode keep the GL queue drained
  // so stepping N frames doesn't build a backlog the screenshot has to wait out on software GL.
  const gl = ctx.renderer.getContext();
  const syncGL = !!ctx.engine?.fixedStep;
  const syncPx = new Uint8Array(4);

  return {
    look, sun: look.sun,
    update(dt, t) {
      dt = Math.max(0, dt); // guard: lookdev's flash decay would grow on a negative dt
      if (syncGL) { ctx.renderer.setRenderTarget(null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, syncPx); }
      oceanMat.uniforms.uTime.value = t; hazeMat.uniforms.uTime.value = t;
      look.update(dt, t);
      planet.update(dt, t);
      clouds.update(dt);
    },
    flash(v) { look.flash(v); },
    dispose() {
      [ocean, haze].forEach((m) => { scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
      scene.remove(planet); planet.disposePlanet?.();
      scene.remove(bounce, bounce.target);
      clouds.dispose();
      look.dispose();
    },
  };
}
