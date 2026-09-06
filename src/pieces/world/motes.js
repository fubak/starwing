import * as THREE from 'three';

/**
 * Speed motes: faint streaks of dust/pollen in the air around the camera that
 * stretch with airspeed. Camera-relative box, recycled as they pass. Additive, cheap.
 */
export function createMotes(rng, count = 220) {
  const uniforms = { uStretch: { value: 1 }, uAlpha: { value: 0.5 } };
  const mat = new THREE.ShaderMaterial({
    uniforms, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
    vertexShader: /* glsl */ `
      uniform float uStretch; varying vec2 vUv; varying float vFade;
      void main(){
        vUv = uv;
        vec4 c = modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0);
        float s = length(vec3(instanceMatrix[0]));
        vec3 right = vec3(viewMatrix[0][0], viewMatrix[1][0], viewMatrix[2][0]);
        // stretch along the travel axis (+z toward camera)
        vec3 w = c.xyz + right * position.x * s + vec3(0.0, 0.0, 1.0) * position.y * s * uStretch;
        vec4 mv = viewMatrix * vec4(w, 1.0);
        float d = -mv.z;
        vFade = smoothstep(4.0, 40.0, d) * (1.0 - smoothstep(180.0, 320.0, d));
        gl_Position = projectionMatrix * mv;
      }`,
    fragmentShader: /* glsl */ `
      uniform float uAlpha; varying vec2 vUv; varying float vFade;
      void main(){
        float r = length(vUv - 0.5) * 2.0;
        float a = (1.0 - smoothstep(0.2, 1.0, r)) * vFade * uAlpha;
        gl_FragColor = vec4(vec3(0.85, 0.92, 1.0) * a, a);
      }`,
  });
  const mesh = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1), mat, count);
  mesh.frustumCulled = false; mesh.renderOrder = 6;
  const items = [];
  const m = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), sc = new THREE.Vector3();
  // biased below the camera: streaks against the sky read as scratches, against the ground they read as speed
  const BOX = { x: 220, y: 120, z: 330 };
  const ry = () => rng.range(-BOX.y, BOX.y * 0.35);
  for (let i = 0; i < count; i++) items.push({ x: rng.range(-BOX.x, BOX.x), y: ry(), z: -rng.range(0, BOX.z), s: rng.range(0.2, 0.5) });
  return {
    mesh, uniforms,
    /** cam = camera world position; speed = world units/s */
    update(dt, speed, cam) {
      // only really visible when boosting: at cruise they were reading as white scratches on the sky
      const boost = Math.min(1, Math.max(0, (speed - 230) / 140));
      uniforms.uStretch.value = 4 + speed * 0.04;
      uniforms.uAlpha.value = 0.05 + boost * 0.5;
      for (let i = 0; i < count; i++) {
        const it = items[i];
        it.z += speed * dt;
        if (it.z > 20) { it.z -= BOX.z; it.x = rng.range(-BOX.x, BOX.x); it.y = ry(); }
        v.set(cam.x + it.x, cam.y + it.y, cam.z + it.z);
        m.compose(v, q, sc.set(it.s, it.s, it.s));
        mesh.setMatrixAt(i, m);
      }
      mesh.instanceMatrix.needsUpdate = true;
    },
  };
}
