// Studio / "hangar in orbit" reflection environment for the Arwing's painted-metal
// materials. The lookdev space sky is nearly black, so a clear-coat has nothing to
// reflect and white panels read as matte cardboard. This builds a small HDR
// environment (big warm key card, cool wide fill card, blue planet bounce from
// below, dark navy zenith) and PMREM-filters it. Assign to material.envMap.
import * as THREE from 'three';

const vert = /* glsl */`
  varying vec3 vDir;
  void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

const frag = /* glsl */`
  varying vec3 vDir;
  uniform vec3 uKeyDir; uniform vec3 uFillDir; uniform vec3 uRimDir;
  uniform float uKey; uniform float uFill; uniform float uRim;
  float blob(vec3 d, vec3 c, float size, float soft){
    float a = acos(clamp(dot(d, c), -1.0, 1.0));
    return smoothstep(size + soft, size, a) + 0.35 * exp(-a * a / (soft * soft * 6.0));
  }
  void main(){
    vec3 d = normalize(vDir);
    // base: navy zenith -> ink horizon -> planet-lit floor
    vec3 zen = vec3(0.05, 0.08, 0.16);
    vec3 hor = vec3(0.02, 0.03, 0.07);
    vec3 col = mix(hor, zen, smoothstep(0.0, 0.8, d.y));
    // planet bounce: broad cool-blue glow from below, brighter toward the terminator
    float below = smoothstep(0.05, -0.55, d.y);
    col += vec3(0.16, 0.36, 0.95) * below * (0.9 + 0.4 * smoothstep(-0.9, -0.2, d.y));
    // thin bright horizon line (atmosphere limb) — a crisp reflection line across the hull
    col += vec3(0.5, 0.75, 1.1) * exp(-pow((d.y + 0.08) * 22.0, 2.0)) * 1.2;
    // key card (warm white, large, soft edge)
    col += vec3(1.0, 0.96, 0.9) * uKey * blob(d, uKeyDir, 0.28, 0.16);
    // fill card (cool, very wide)
    col += vec3(0.55, 0.7, 1.0) * uFill * blob(d, uFillDir, 0.55, 0.35);
    // rim card (behind-left, thin)
    col += vec3(0.7, 0.85, 1.0) * uRim * blob(d, uRimDir, 0.12, 0.1);
    gl_FragColor = vec4(col, 1.0);
  }`;

/**
 * makeStudioEnv(renderer, { key, fill, rim, keyDir, fillDir, rimDir }) -> { texture, dispose() }
 */
export function makeStudioEnv(renderer, o = {}) {
  const mat = new THREE.ShaderMaterial({
    vertexShader: vert, fragmentShader: frag, side: THREE.BackSide, depthWrite: false,
    uniforms: {
      uKeyDir: { value: new THREE.Vector3(...(o.keyDir ?? [0.42, 0.78, -0.46])).normalize() },
      uFillDir: { value: new THREE.Vector3(...(o.fillDir ?? [-0.7, 0.15, 0.7])).normalize() },
      uRimDir: { value: new THREE.Vector3(...(o.rimDir ?? [0.2, 0.1, 1.0])).normalize() },
      uKey: { value: o.key ?? 5.0 }, uFill: { value: o.fill ?? 1.2 }, uRim: { value: o.rim ?? 2.0 },
    },
  });
  const scene = new THREE.Scene();
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(10, 48, 24), mat);
  scene.add(mesh);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const rt = pmrem.fromScene(scene, 0.04);
  return {
    texture: rt.texture,
    dispose() { rt.dispose(); pmrem.dispose(); mat.dispose(); mesh.geometry.dispose(); },
  };
}
