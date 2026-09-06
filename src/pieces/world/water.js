import * as THREE from 'three';
import { makeWaterNormalTexture } from './noise.js';
import { GLSL_SKY, skyUniforms, noiseTexture } from './sky.js';

/**
 * Large water plane following the camera.
 *  - real planar reflection: a low-res mirror pass (oblique near-plane clip) of the
 *    scene, sampled with ripple distortion and blended by fresnel
 *  - sun glitter path, long swell + fine ripples that flatten with distance
 *  - shallow turquoise near the banks (depth read from the terrain height passed in uniform)
 *  - aerial fog converging on the sky colour
 */
export function createWater({ width = 640, height = 360 } = {}) {
  const reflRT = new THREE.WebGLRenderTarget(width, height, {
    type: THREE.HalfFloatType, depthBuffer: true, stencilBuffer: false,
    minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter,
  });
  const uniforms = {
    ...skyUniforms(),
    uTime: { value: 0 },
    uScroll: { value: 0 },
    uFogDensity: { value: 0.0006 },
    uCamPos: { value: new THREE.Vector3() },
    uNormal: { value: makeWaterNormalTexture(THREE, 256) },
    uNoise: { value: noiseTexture() },
    uRefl: { value: reflRT.texture },
    uReflMatrix: { value: new THREE.Matrix4() },
    uReflOn: { value: 1 },
  };
  const mat = new THREE.ShaderMaterial({
    uniforms,
    transparent: true,
    depthWrite: false,
    fog: false,
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      void main(){
        vec4 w = modelMatrix * vec4(position, 1.0);
        vWorld = w.xyz;
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: /* glsl */ `
      ${GLSL_SKY}
      uniform float uTime, uScroll, uFogDensity, uReflOn; uniform vec3 uCamPos; uniform sampler2D uNormal, uNoise, uRefl;
      uniform mat4 uReflMatrix;
      varying vec3 vWorld;
      void main(){
        vec2 p = vec2(vWorld.x, vWorld.z - uScroll);
        float t = uTime;
        float dist0 = length(uCamPos - vWorld);
        float detail = 1.0 - smoothstep(200.0, 1400.0, dist0); // flatten far ripples (anti-alias)
        // long directional swell + two ripple octaves; small amplitude -> a glassy, readable mirror
        vec3 n1 = texture2D(uNormal, p * 0.0045 + vec2(t * 0.008, t * 0.004)).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(uNormal, p * 0.016 - vec2(t * 0.014, t * 0.009)).xyz * 2.0 - 1.0;
        vec3 n3 = texture2D(uNormal, p * 0.055 + vec2(-t * 0.028, t * 0.018)).xyz * 2.0 - 1.0;
        vec2 nxz = (n1.xy * 0.11 + n2.xy * 0.07 + n3.xy * 0.035 * detail) * (0.35 + 0.65 * detail);
        vec3 n = normalize(vec3(nxz.x, 1.0, nxz.y));
        float swell = texture2D(uNoise, p * 0.0018 + vec2(t * 0.004, t * 0.002)).g;
        vec3 V = normalize(uCamPos - vWorld);
        float ndv = max(dot(n, V), 0.0);
        float F = 0.03 + 0.97 * pow(1.0 - ndv, 5.0);
        // reflection: planar mirror pass, distorted by the ripple normal; sky fallback outside the target
        vec4 rp = uReflMatrix * vec4(vWorld, 1.0);
        vec2 ruv = rp.xy / rp.w;
        ruv += nxz * vec2(0.06, 0.16) * (1.0 - smoothstep(0.0, 900.0, dist0) * 0.6);
        float inside = step(0.0, ruv.x) * step(ruv.x, 1.0) * step(0.0, ruv.y) * step(ruv.y, 1.0) * uReflOn;
        vec3 R = reflect(-V, n); R.y = abs(R.y) + 0.03;
        vec3 skyRefl = skyColor(normalize(R));
        vec3 mirror = texture2D(uRefl, clamp(ruv, 0.001, 0.999)).rgb;
        vec3 refl = mix(skyRefl, mirror, inside);
        // body colour: deep cobalt -> turquoise in the shallows/swell crests
        vec3 deep = vec3(0.012, 0.085, 0.22);
        vec3 shallow = vec3(0.05, 0.36, 0.44);
        vec3 body = mix(deep, shallow, smoothstep(0.35, 0.75, swell) * 0.55);
        body += vec3(0.02, 0.10, 0.10) * pow(max(dot(n, uSunDir), 0.0), 2.0);
        // sub-surface glow where the sun is behind the wave face
        body += vec3(0.02, 0.16, 0.20) * pow(max(dot(-V, uSunDir), 0.0), 4.0) * 0.5;
        vec3 col = mix(body, refl, clamp(F * 1.15 + 0.10, 0.0, 1.0));
        // sun glitter: sharp + broad lobes, jittered by ripple normals
        vec3 H = normalize(V + uSunDir);
        float ndh = max(dot(n, H), 0.0);
        float spec = pow(ndh, 900.0) * 6.0 + pow(ndh, 80.0) * 0.30;
        col += vec3(1.0, 0.92, 0.78) * spec * (0.4 + 0.6 * detail);
        // faint crest foam lines on the swell
        float crest = smoothstep(0.70, 0.84, swell) * detail * smoothstep(0.7, 0.95, texture2D(uNoise, p * 0.03 + vec2(t * 0.02, 0.0)).r);
        col += vec3(0.30, 0.34, 0.36) * crest * 0.5;
        float alpha = mix(0.90, 1.0, F);
        // distance fog (matches FogExp2, converges on the sky in this direction)
        float fogF = 1.0 - exp(-pow(dist0 * uFogDensity, 2.0));
        col = mix(col, atmosColor(-V), fogF);
        gl_FragColor = vec4(col, mix(alpha, 1.0, fogF));
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(7600, 7600, 1, 1), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;

  // ---- mirror pass (Reflector-style oblique clipping)
  const mirrorCam = new THREE.PerspectiveCamera();
  const plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  const normal = new THREE.Vector3(0, 1, 0);
  const camWorldPos = new THREE.Vector3(), lookAt = new THREE.Vector3(), view = new THREE.Vector3(), target = new THREE.Vector3();
  const rotMat = new THREE.Matrix4(), clipPlane = new THREE.Plane(), q = new THREE.Vector4(), clip4 = new THREE.Vector4();
  const texMat = new THREE.Matrix4();

  /**
   * Render the mirrored scene into the reflection target. Call once per frame before the
   * main render. `hide` = list of objects to hide during the pass (the water itself, motes...).
   */
  function renderReflection(renderer, scene, camera, hide = []) {
    camera.getWorldPosition(camWorldPos);
    if (camWorldPos.y < 0.5) { uniforms.uReflOn.value = 0; renderer.shadowMap.needsUpdate = true; return; }  // camera under the surface: sky fallback
    uniforms.uReflOn.value = 1;
    const planeY = mesh.position.y;
    // mirrored camera position / orientation
    view.copy(camWorldPos); view.y = 2 * planeY - view.y;
    rotMat.extractRotation(camera.matrixWorld);
    lookAt.set(0, 0, -1).applyMatrix4(rotMat).add(camWorldPos);
    target.copy(lookAt); target.y = 2 * planeY - target.y;
    mirrorCam.position.copy(view);
    mirrorCam.up.set(0, 1, 0).applyMatrix4(rotMat);
    mirrorCam.up.y = -mirrorCam.up.y;   // mirror the up vector too
    mirrorCam.lookAt(target);
    mirrorCam.fov = camera.fov; mirrorCam.aspect = camera.aspect; mirrorCam.near = camera.near; mirrorCam.far = Math.min(camera.far, 3200);
    mirrorCam.updateProjectionMatrix();
    mirrorCam.updateMatrixWorld();
    // oblique near plane so only geometry above the water reflects
    plane.setFromNormalAndCoplanarPoint(normal, new THREE.Vector3(0, planeY, 0));
    clipPlane.copy(plane).applyMatrix4(mirrorCam.matrixWorldInverse);
    clip4.set(clipPlane.normal.x, clipPlane.normal.y, clipPlane.normal.z, clipPlane.constant);
    const pm = mirrorCam.projectionMatrix;
    q.x = (Math.sign(clip4.x) + pm.elements[8]) / pm.elements[0];
    q.y = (Math.sign(clip4.y) + pm.elements[9]) / pm.elements[5];
    q.z = -1.0;
    q.w = (1.0 + pm.elements[10]) / pm.elements[14];
    clip4.multiplyScalar(2.0 / clip4.dot(q));
    pm.elements[2] = clip4.x; pm.elements[6] = clip4.y; pm.elements[10] = clip4.z + 1.0; pm.elements[14] = clip4.w;
    // texture matrix: world -> [0,1] reflection uv
    texMat.set(0.5, 0, 0, 0.5, 0, 0.5, 0, 0.5, 0, 0, 0.5, 0.5, 0, 0, 0, 1);
    texMat.multiply(mirrorCam.projectionMatrix).multiply(mirrorCam.matrixWorldInverse);
    uniforms.uReflMatrix.value.copy(texMat);

    const vis = hide.map((o) => o.visible);
    for (const o of hide) o.visible = false;
    mesh.visible = false;
    const prevRT = renderer.getRenderTarget();
    const prevXR = renderer.xr.enabled;
    renderer.xr.enabled = false;
    // the mirror pass renders the shadow maps once; the main pass this frame re-uses them
    renderer.shadowMap.autoUpdate = false; renderer.shadowMap.needsUpdate = true;
    renderer.setRenderTarget(reflRT);
    renderer.state.buffers.depth.setMask(true);
    if (renderer.autoClear === false) renderer.clear();
    renderer.render(scene, mirrorCam);
    renderer.shadowMap.needsUpdate = false;
    renderer.setRenderTarget(prevRT);
    renderer.xr.enabled = prevXR;
    mesh.visible = true;
    hide.forEach((o, i) => { o.visible = vis[i]; });
  }

  return {
    mesh, uniforms, renderReflection, target: reflRT,
    dispose() { reflRT.dispose(); mesh.geometry.dispose(); mat.dispose(); },
  };
}
