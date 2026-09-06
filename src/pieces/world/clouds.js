import * as THREE from 'three';
import { SUN_DIR, PALETTE } from './sky.js';

function puffTexture() {
  const S = 256;
  const c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d');
  g.clearRect(0, 0, S, S);
  // several overlapping soft blobs -> lumpy cumulus silhouette
  const blobs = [[128, 140, 90], [80, 150, 62], [180, 150, 66], [110, 100, 58], [160, 105, 52], [128, 170, 70]];
  for (const [x, y, r] of blobs) {
    const rg = g.createRadialGradient(x, y, 0, x, y, r);
    rg.addColorStop(0, 'rgba(255,255,255,0.85)');
    rg.addColorStop(0.55, 'rgba(255,255,255,0.45)');
    rg.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = rg; g.fillRect(0, 0, S, S);
  }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** Camera-facing volumetric-ish cumulus billboards with sun shading + distance fade. */
export function createClouds(rng, count = 64) {
  const uniforms = {
    uMap: { value: puffTexture() },
    uSunDir: { value: SUN_DIR.clone() },
    uFogColor: { value: PALETTE.fog.clone() },
    uCamPos: { value: new THREE.Vector3() },
    uFogDensity: { value: 0.00045 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, fog: false,
    vertexShader: /* glsl */ `
      varying vec2 vUv; varying float vFog; varying vec3 vWorld; varying float vSeed;
      uniform vec3 uCamPos; uniform float uFogDensity;
      void main(){
        vUv = uv;
        vec4 c = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float sx = length(vec3(instanceMatrix[0])), sy = length(vec3(instanceMatrix[1]));
        vSeed = instanceMatrix[3][1];
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 up = vec3(0.0, 1.0, 0.0);
        vec3 w = c.xyz + right * position.x * sx + up * position.y * sy;
        vWorld = w;
        float dist = length(uCamPos - w);
        vFog = 1.0 - exp(-pow(dist * uFogDensity, 2.0));
        gl_Position = projectionMatrix * viewMatrix * vec4(w, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform sampler2D uMap; uniform vec3 uSunDir, uFogColor, uCamPos;
      varying vec2 vUv; varying float vFog; varying vec3 vWorld; varying float vSeed;
      void main(){
        vec4 t = texture2D(uMap, vUv);
        float a = t.a;
        if (a < 0.01) discard;
        // fake lighting: top-lit, sun-side brighter, dense core darker (silver lining)
        vec3 V = normalize(uCamPos - vWorld);
        float sunFacing = 0.5 + 0.5 * dot(-V, uSunDir);
        float topLight = smoothstep(0.15, 0.85, vUv.y);
        vec3 lit = vec3(1.08, 1.02, 0.96);
        vec3 shade = vec3(0.62, 0.70, 0.86);
        vec3 col = mix(shade, lit, topLight * 0.7 + 0.3 * sunFacing);
        col *= mix(1.0, 0.86, smoothstep(0.5, 0.9, a)); // denser core slightly darker
        col += vec3(0.5, 0.35, 0.15) * pow(sunFacing, 6.0) * (1.0 - a) * 0.6; // rim glow
        col = mix(col, uFogColor, vFog);
        gl_FragColor = vec4(col, a * (1.0 - vFog * 0.85) * 0.92);
      }`,
  });
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, count);
  mesh.frustumCulled = false;
  mesh.renderOrder = 5;
  const items = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion();
  const RANGE = 3400;
  for (let i = 0; i < count; i++) {
    const it = {
      x: rng.range(-2600, 2600), y: rng.range(260, 520), z: -rng.range(0, RANGE),
      sx: rng.range(180, 420), drift: rng.range(-3, 3),
    };
    it.sy = it.sx * rng.range(0.42, 0.6);
    items.push(it);
  }
  const write = () => {
    for (let i = 0; i < count; i++) {
      const it = items[i];
      m.compose(new THREE.Vector3(it.x, it.y, it.z), q, new THREE.Vector3(it.sx, it.sy, 1));
      mesh.setMatrixAt(i, m);
    }
    mesh.instanceMatrix.needsUpdate = true;
  };
  write();
  return {
    mesh, uniforms,
    /** advance: clouds are in camera-fixed z space, drift toward camera slower than ground (parallax) */
    update(dt, speed, camZ) {
      for (const it of items) {
        it.z += speed * dt * 0.55; it.x += it.drift * dt;
        if (it.z > camZ + 300) { it.z -= RANGE + 300; it.x = rng.range(-2600, 2600); }
      }
      write();
    },
  };
}
