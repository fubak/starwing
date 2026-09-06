/**
 * Showcase environment for the enemies piece: Corneria-style late-afternoon
 * sky dome, procedural ocean, sun/sky lighting, PMREM environment for real
 * specular response, and a light grade/vignette pass.
 */
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

const NOISE_GLSL = /* glsl */`
  float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
  float vnoise(vec2 p){
    vec2 i = floor(p), f = fract(p); vec2 u = f*f*(3.0-2.0*f);
    return mix(mix(hash(i), hash(i+vec2(1,0)), u.x), mix(hash(i+vec2(0,1)), hash(i+vec2(1,1)), u.x), u.y);
  }
  float fbm(vec2 p){
    float v = 0.0, a = 0.5; mat2 m = mat2(1.6,1.2,-1.2,1.6);
    for(int i=0;i<5;i++){ v += a*vnoise(p); p = m*p; a *= 0.5; }
    return v;
  }
`;

export const SKY = {
  zenith: new THREE.Color(0x0f2f7a),
  mid: new THREE.Color(0x4c8fe0),
  horizon: new THREE.Color(0xf2c9a4),
  ground: new THREE.Color(0x14313f),
  sunDir: new THREE.Vector3(0.45, 0.62, 0.55).normalize(), // behind-right-above camera: key light on approaching craft
  sunColor: new THREE.Color(0xffe6c4),
};

export function makeSkyMaterial(withClouds = true) {
  return new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: {
      uZenith: { value: SKY.zenith }, uMid: { value: SKY.mid }, uHorizon: { value: SKY.horizon },
      uGround: { value: SKY.ground }, uSun: { value: SKY.sunDir }, uTime: { value: 0 }, uClouds: { value: withClouds ? 1 : 0 },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main(){ vec4 wp = modelMatrix * vec4(position,1.0); vDir = normalize(wp.xyz - cameraPosition);
        gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */`
      varying vec3 vDir; uniform vec3 uZenith,uMid,uHorizon,uGround,uSun; uniform float uTime, uClouds;
      ${NOISE_GLSL}
      void main(){
        vec3 d = normalize(vDir); float y = d.y;
        vec3 sky = mix(uMid, uZenith, smoothstep(0.05, 0.75, y));
        sky = mix(uHorizon, sky, smoothstep(-0.02, 0.22, y));
        // sun glow + disc
        float sd = max(dot(d, uSun), 0.0);
        sky += vec3(1.0,0.85,0.6) * pow(sd, 6.0) * 0.35 + vec3(1.0,0.95,0.85) * pow(sd, 300.0) * 3.0;
        // clouds: stratus band projected onto a plane above the viewer
        if (uClouds > 0.5 && y > 0.005) {
          vec2 uv = d.xz / (y + 0.08) * 1.6 + vec2(uTime*0.004, 0.0);
          float c = fbm(uv * 0.9);
          float cov = smoothstep(0.48, 0.72, c) * smoothstep(0.0, 0.08, y) * (1.0 - smoothstep(0.35, 0.8, y));
          vec3 cloudCol = mix(vec3(0.55,0.62,0.78), vec3(1.05,0.98,0.93), smoothstep(0.5, 0.9, c) * 0.8 + sd*0.3);
          sky = mix(sky, cloudCol, cov * 0.85);
        }
        // below horizon (only seen by env-map capture & through gaps)
        vec3 g = mix(uHorizon, uGround, smoothstep(0.0, 0.25, -y));
        vec3 col = y < 0.0 ? g : sky;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

export function makeOceanMaterial(fogColor) {
  return new THREE.ShaderMaterial({
    uniforms: {
      uTime: { value: 0 }, uSun: { value: SKY.sunDir }, uSunColor: { value: SKY.sunColor },
      uDeep: { value: new THREE.Color(0x0a2e4a) }, uShallow: { value: new THREE.Color(0x1d7a8c) },
      uSky: { value: SKY.mid }, uHorizon: { value: fogColor }, uFogNear: { value: 120 }, uFogFar: { value: 1100 },
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
        // chain rule: dh/dp via screen-space derivatives
        float det = dpx.x*dpz.y - dpx.y*dpz.x; det = abs(det) < 1e-7 ? 1e-7 : det;
        float hx = ( dh.x*dpz.y - dh.y*dpz.x) / det;
        float hz = (-dh.x*dpx.y + dh.y*dpx.x) / det;
        vec3 n = normalize(vec3(-hx*0.09, 1.0, -hz*0.09));
        vec3 v = normalize(cameraPosition - vW);
        float fres = pow(1.0 - max(dot(n, v), 0.0), 3.0);
        vec3 base = mix(uDeep, uShallow, smoothstep(0.3, 1.2, h));
        vec3 col = mix(base, uSky, 0.35 + 0.55*fres);
        vec3 hv = normalize(uSun + v);
        float spec = pow(max(dot(n, hv), 0.0), 220.0) * 2.5 + pow(max(dot(n,hv),0.0), 24.0) * 0.25;
        col += uSunColor * spec;
        // foam-ish caps
        col += vec3(0.6,0.75,0.8) * smoothstep(1.25, 1.5, h) * 0.5;
        float dist = length(cameraPosition - vW);
        float f = smoothstep(uFogNear, uFogFar, dist);
        col = mix(col, uHorizon, f);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
}

/** Grade + vignette pass inserted before the OutputPass. */
export function makeGradePass() {
  return new ShaderPass(new THREE.ShaderMaterial({
    uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uFlash: { value: 0 } },
    vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: /* glsl */`
      varying vec2 vUv; uniform sampler2D tDiffuse; uniform float uTime, uFlash;
      void main(){
        vec3 c = texture2D(tDiffuse, vUv).rgb;
        // gentle saturation + warm/cool split toning (linear space, pre-ACES)
        float l = dot(c, vec3(0.2126,0.7152,0.0722));
        c = mix(vec3(l), c, 1.12);
        c += (vec3(0.03,0.0,-0.02) * smoothstep(0.2,0.9,l) + vec3(-0.01,0.0,0.03)*(1.0-smoothstep(0.0,0.35,l))) * 0.6;
        // vignette
        vec2 q = vUv - 0.5; float v = 1.0 - dot(q,q) * 0.9;
        c *= smoothstep(0.0, 1.0, v) * 0.35 + 0.65;
        c += uFlash;
        gl_FragColor = vec4(max(c, 0.0), 1.0);
      }`,
  }));
}

/**
 * Build the whole environment into ctx.scene. Returns { update(dt,t), dispose() , fogColor }.
 */
export function createEnvironment(ctx) {
  const { scene, renderer, composer } = ctx;
  const fogColor = new THREE.Color(0xd9bfae);
  scene.fog = new THREE.FogExp2(fogColor, 0.0018);
  scene.background = null;

  // sky dome
  const skyMat = makeSkyMaterial(true);
  const sky = new THREE.Mesh(new THREE.SphereGeometry(2500, 48, 24), skyMat);
  sky.frustumCulled = false;
  scene.add(sky);

  // ocean
  const oceanMat = makeOceanMaterial(fogColor);
  const ocean = new THREE.Mesh(new THREE.PlaneGeometry(7000, 7000, 1, 1), oceanMat);
  ocean.rotation.x = -Math.PI / 2; ocean.position.y = -42;
  scene.add(ocean);

  // distant moon
  const moonMat = new THREE.MeshStandardMaterial({ color: 0xd8c8c0, roughness: 1, metalness: 0, fog: false });
  const moon = new THREE.Mesh(new THREE.SphereGeometry(140, 32, 24), moonMat);
  moon.position.set(-620, 380, -2100);
  scene.add(moon);
  const ringMat = new THREE.MeshBasicMaterial({ color: 0xf4e1d0, transparent: true, opacity: 0.45, side: THREE.DoubleSide, fog: false });
  const ring = new THREE.Mesh(new THREE.RingGeometry(190, 300, 64), ringMat);
  ring.position.copy(moon.position); ring.rotation.set(1.25, 0.2, 0.35);
  scene.add(ring);

  // lights
  const sun = new THREE.DirectionalLight(SKY.sunColor, 3.2);
  sun.position.copy(SKY.sunDir).multiplyScalar(200);
  scene.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0x8fb8ff, 0x24343c, 1.1);
  scene.add(hemi);
  const rim = new THREE.DirectionalLight(0xc070ff, 0.9); // violet rim from front-left to catch silhouettes
  rim.position.set(-120, 30, -200);
  scene.add(rim, rim.target);

  // environment map from the sky itself (real specular/fresnel on hulls)
  const pm = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(100, 32, 16), makeSkyMaterial(false)));
  const envRT = pm.fromScene(envScene, 0.02);
  scene.environment = envRT.texture;
  pm.dispose();

  // grade pass
  const grade = makeGradePass();
  const outIdx = composer.passes.length - 1;
  composer.insertPass(grade, outIdx);
  ctx.bloom.strength = 0.75; ctx.bloom.radius = 0.55; ctx.bloom.threshold = 0.82;

  return {
    fogColor, sun, grade,
    update(dt, t) { skyMat.uniforms.uTime.value = t; oceanMat.uniforms.uTime.value = t; grade.uniforms.uTime.value = t; },
    flash(v) { grade.uniforms.uFlash.value = v; },
    dispose() {
      composer.removePass(grade); grade.dispose?.();
      [sky, ocean, moon, ring].forEach((m) => { scene.remove(m); m.geometry.dispose(); m.material.dispose(); });
      scene.remove(sun, sun.target, hemi, rim, rim.target);
      envRT.dispose(); scene.environment = null; scene.fog = null;
    },
  };
}
