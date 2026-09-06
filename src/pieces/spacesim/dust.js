// Volumetric dressing for the belt: sun-lit dust motes, big soft haze sheets that
// forward-scatter into warm god-ray glow when looking toward the sun, and a crisp sun disc.
import * as THREE from 'three';
import { NOISE_GLSL } from './glsl.js';

const _v = new THREE.Vector3();

export function buildDust(rng, { sunDir, sunColor, motes = 1600, sheets = 34, moteExtent = 110, sheetExtent = 420 } = {}) {
  const group = new THREE.Group();
  const shared = { uSunDir: { value: sunDir }, uSunCol: { value: sunColor }, uTime: { value: 0 } };

  // ---------------- motes (Points)
  const mp = new Float32Array(motes * 3), ms = new Float32Array(motes);
  for (let i = 0; i < motes; i++) { mp[i * 3] = rng.range(-moteExtent, moteExtent); mp[i * 3 + 1] = rng.range(-moteExtent, moteExtent); mp[i * 3 + 2] = rng.range(-moteExtent, moteExtent); ms[i] = rng.range(0.5, 1.6); }
  const mgeo = new THREE.BufferGeometry();
  mgeo.setAttribute('position', new THREE.BufferAttribute(mp, 3).setUsage(THREE.DynamicDrawUsage));
  mgeo.setAttribute('aSize', new THREE.BufferAttribute(ms, 1));
  const mmat = new THREE.ShaderMaterial({
    uniforms: shared, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */ `
      attribute float aSize; varying float vScat; varying float vFade;
      uniform vec3 uSunDir;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vec3 W = (modelMatrix * vec4(position, 1.0)).xyz;
        vec3 toP = normalize(W - cameraPosition);
        float mu = dot(toP, uSunDir);
        vScat = 0.25 + 1.6 * pow(max(mu, 0.0), 6.0);
        float d = -mv.z;
        vFade = smoothstep(2.0, 12.0, d) * (1.0 - smoothstep(60.0, 110.0, d));
        gl_PointSize = aSize * 240.0 / max(d, 1.0);
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 uSunCol; varying float vScat; varying float vFade;
      void main() {
        vec2 c = gl_PointCoord - 0.5; float r = length(c);
        float a = smoothstep(0.5, 0.05, r) * vFade;
        vec3 col = mix(vec3(0.55, 0.65, 0.9), uSunCol * 1.3, clamp(vScat - 0.25, 0.0, 1.0)) * vScat;
        gl_FragColor = vec4(col * a * 0.55, a * 0.5);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const motePts = new THREE.Points(mgeo, mmat); motePts.frustumCulled = false;
  group.add(motePts);

  // ---------------- haze sheets (instanced billboards)
  const sgeo = new THREE.InstancedBufferGeometry();
  const plane = new THREE.PlaneGeometry(1, 1);
  sgeo.index = plane.index; sgeo.attributes.position = plane.attributes.position; sgeo.attributes.uv = plane.attributes.uv;
  const sOff = new Float32Array(sheets * 3), sData = new Float32Array(sheets * 4);
  const sheetList = [];
  for (let i = 0; i < sheets; i++) {
    const p = new THREE.Vector3(rng.range(-sheetExtent, sheetExtent), rng.range(-90, 90), rng.range(-sheetExtent, sheetExtent));
    sheetList.push(p);
    sData.set([rng.range(90, 220), rng.range(0, 100), rng.range(0.6, 1.0), rng.range(-1, 1)], i * 4);
  }
  sgeo.setAttribute('aOff', new THREE.InstancedBufferAttribute(sOff, 3).setUsage(THREE.DynamicDrawUsage));
  sgeo.setAttribute('aData', new THREE.InstancedBufferAttribute(sData, 4));
  sgeo.instanceCount = sheets;
  const smat = new THREE.ShaderMaterial({
    uniforms: shared, transparent: true, depthWrite: false, depthTest: true, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    vertexShader: /* glsl */ `
      attribute vec3 aOff; attribute vec4 aData;
      varying vec2 vUv; varying float vScat; varying float vSeed; varying float vFade; varying float vRot;
      uniform vec3 uSunDir;
      void main() {
        vUv = uv; vSeed = aData.y; vRot = aData.w;
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        vec3 up = vec3(viewMatrix[0][1], viewMatrix[1][1], viewMatrix[2][1]);
        vec3 W = aOff + (right * position.x + up * position.y) * aData.x;
        vec3 toP = normalize(aOff - cameraPosition);
        float mu = dot(toP, uSunDir);
        vScat = (0.35 + 2.2 * pow(max(mu, 0.0), 8.0)) * aData.z;
        float d = length(aOff - cameraPosition);
        vFade = smoothstep(20.0, 120.0, d) * (1.0 - smoothstep(380.0, 520.0, d));
        gl_Position = projectionMatrix * viewMatrix * vec4(W, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      ${NOISE_GLSL}
      uniform vec3 uSunCol; uniform float uTime;
      varying vec2 vUv; varying float vScat; varying float vSeed; varying float vFade; varying float vRot;
      void main() {
        vec2 c = vUv - 0.5;
        float ca = cos(vRot), sa = sin(vRot); c = mat2(ca, -sa, sa, ca) * c;
        float r = length(c) * 2.0;
        float soft = smoothstep(1.0, 0.15, r);
        if (soft * vFade < 0.003) discard;
        vec3 np = vec3(c * 3.5, vSeed + uTime * 0.02);
        float n = (0.5 * snoise(np) + 0.25 * snoise(np * 2.03 + 1.7)) * 0.5 + 0.5;
        float wisps = smoothstep(0.25, 0.85, n);
        float a = soft * soft * mix(0.35, 1.0, wisps) * vFade;
        vec3 cool = vec3(0.22, 0.30, 0.55);
        vec3 col = mix(cool, uSunCol * 1.2, clamp((vScat - 0.35) * 0.6, 0.0, 1.0)) * vScat;
        gl_FragColor = vec4(col * a * 0.26, a * 0.16);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sheetMesh = new THREE.Mesh(sgeo, smat); sheetMesh.frustumCulled = false;
  group.add(sheetMesh);

  // ---------------- sun disc + corona (crisp, occluded by rocks)
  const sunTex = (() => {
    const S = 256, cv = document.createElement('canvas'); cv.width = cv.height = S; const g = cv.getContext('2d');
    const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.16, 'rgba(255,250,235,1)'); gr.addColorStop(0.19, 'rgba(255,225,170,0.55)');
    gr.addColorStop(0.32, 'rgba(255,190,120,0.16)'); gr.addColorStop(0.6, 'rgba(255,150,90,0.04)'); gr.addColorStop(1, 'rgba(255,120,60,0)');
    g.fillStyle = gr; g.fillRect(0, 0, S, S);
    // subtle anisotropic streaks
    g.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI; g.save(); g.translate(S / 2, S / 2); g.rotate(a);
      const lg = g.createLinearGradient(-S / 2, 0, S / 2, 0); lg.addColorStop(0, 'rgba(255,200,140,0)'); lg.addColorStop(0.5, 'rgba(255,230,190,0.28)'); lg.addColorStop(1, 'rgba(255,200,140,0)');
      g.fillStyle = lg; g.fillRect(-S / 2, -1.2, S, 2.4); g.restore();
    }
    const t = new THREE.CanvasTexture(cv); t.colorSpace = THREE.SRGBColorSpace; return t;
  })();
  const sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: sunTex, color: new THREE.Color(2.2, 2.0, 1.7), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, toneMapped: false }));
  sun.scale.setScalar(1500);
  group.add(sun);

  function update(dt, t, camera, center) {
    shared.uTime.value = t;
    // wrap motes around the camera
    const pos = mgeo.attributes.position.array;
    const cx = camera.position.x, cy = camera.position.y, cz = camera.position.z, E = moteExtent;
    for (let i = 0; i < motes; i++) {
      let x = pos[i * 3] - cx, y = pos[i * 3 + 1] - cy, z = pos[i * 3 + 2] - cz;
      if (x > E) pos[i * 3] -= 2 * E; else if (x < -E) pos[i * 3] += 2 * E;
      if (y > E) pos[i * 3 + 1] -= 2 * E; else if (y < -E) pos[i * 3 + 1] += 2 * E;
      if (z > E) pos[i * 3 + 2] -= 2 * E; else if (z < -E) pos[i * 3 + 2] += 2 * E;
    }
    mgeo.attributes.position.needsUpdate = true;
    // wrap sheets around the ship
    for (let i = 0; i < sheets; i++) {
      const p = sheetList[i];
      for (const k of ['x', 'z']) { const d = p[k] - center[k]; if (d > sheetExtent) p[k] -= 2 * sheetExtent; else if (d < -sheetExtent) p[k] += 2 * sheetExtent; }
      const dy = p.y - center.y; if (dy > 140) p.y -= 280; else if (dy < -140) p.y += 280;
      sOff[i * 3] = p.x; sOff[i * 3 + 1] = p.y; sOff[i * 3 + 2] = p.z;
    }
    sgeo.attributes.aOff.needsUpdate = true;
    // sun sits at the far plane along the sun direction
    sun.position.copy(camera.position).addScaledVector(_v.copy(sunDir).normalize(), 9500);
  }
  function dispose() { mgeo.dispose(); mmat.dispose(); sgeo.dispose(); plane.dispose(); smat.dispose(); sun.material.dispose(); sunTex.dispose(); }
  return { group, update, dispose, sun };
}
