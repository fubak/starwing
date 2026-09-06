// Showcase backdrop for the ship: starfield, baked nebula sky, a planet with an
// atmosphere rim, and a procedural PMREM environment for real reflections.
// Heavy procedural noise is baked ONCE into textures (equirect) so the per-frame
// cost is a texture lookup.
import * as THREE from 'three';

export function makeStarfield(rng, count = 5000) {
  const pos = new Float32Array(count * 3), col = new Float32Array(count * 3), sz = new Float32Array(count), ph = new Float32Array(count);
  const c = new THREE.Color();
  for (let i = 0; i < count; i++) {
    const v = new THREE.Vector3(rng.next() * 2 - 1, rng.next() * 2 - 1, rng.next() * 2 - 1).normalize().multiplyScalar(900 + rng.next() * 300);
    pos.set([v.x, v.y, v.z], i * 3);
    const k = rng.next();
    if (k < 0.12) c.setHSL(0.6, 0.6, 0.85); else if (k < 0.2) c.setHSL(0.08, 0.7, 0.8); else c.setHSL(0.6, 0.15, 0.95);
    col.set([c.r, c.g, c.b], i * 3);
    const k2 = rng.next();
    sz[i] = k2 < 0.02 ? 3.0 + rng.next() * 2.5 : k2 < 0.15 ? 1.4 + rng.next() * 1.0 : 0.5 + rng.next() * 0.7;
    ph[i] = rng.next() * 6.283;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  g.setAttribute('size', new THREE.BufferAttribute(sz, 1));
  g.setAttribute('phase', new THREE.BufferAttribute(ph, 1));
  const mat = new THREE.ShaderMaterial({
    uniforms: { uTime: { value: 0 }, uPR: { value: 1 } },
    vertexShader: `attribute float size; attribute float phase; varying vec3 vC; varying float vTw; uniform float uTime; uniform float uPR;
      void main(){ vC = color; vTw = 0.75 + 0.25 * sin(uTime * 2.0 + phase);
        vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = size * uPR * 1.15; gl_Position = projectionMatrix * mv; }`,
    fragmentShader: `varying vec3 vC; varying float vTw;
      void main(){ vec2 p = gl_PointCoord - 0.5; float d = length(p) * 2.0; float a = pow(max(0.0, 1.0 - d), 1.5);
        gl_FragColor = vec4(vC * (0.7 + 0.6 * vTw) * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, vertexColors: true,
  });
  const pts = new THREE.Points(g, mat);
  pts.frustumCulled = false;
  return pts;
}

const fbmGLSL = /* glsl */`
  vec3 hash3(vec3 p){ p = fract(p * vec3(443.897, 441.423, 437.195)); p += dot(p, p.yzx + 19.19); return fract((p.xxy + p.yzz) * p.zyx); }
  float vnoise(vec3 p){ vec3 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
    float n = 0.0;
    for (int x=0;x<2;x++) for (int y=0;y<2;y++) for (int z=0;z<2;z++){ vec3 o = vec3(x,y,z);
      float w = mix(1.0-f.x, f.x, o.x) * mix(1.0-f.y, f.y, o.y) * mix(1.0-f.z, f.z, o.z);
      n += w * hash3(i + o).x; }
    return n; }
  float fbm(vec3 p){ float a = 0.5, s = 0.0; for (int i=0;i<6;i++){ s += a * vnoise(p); p = p * 2.03 + 11.7; a *= 0.5; } return s; }
  // equirect uv -> direction
  vec3 dirFromUv(vec2 uv){ float phi = (uv.x - 0.5) * 6.2831853; float theta = (0.5 - uv.y) * 3.1415926;
    return vec3(cos(theta) * sin(phi), sin(theta), cos(theta) * cos(phi)); }
`;

/** Render a fullscreen shader once into an RGBA float-ish render target and return the texture. */
function bake(renderer, fragment, uniforms, w, h, opts = {}) {
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, ...opts });
  const scene = new THREE.Scene();
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }`, fragmentShader: fbmGLSL + fragment, depthTest: false, depthWrite: false });
  scene.add(new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat));
  const prevRT = renderer.getRenderTarget();
  renderer.setRenderTarget(rt); renderer.render(scene, cam); renderer.setRenderTarget(prevRT);
  mat.dispose();
  return rt;
}

/** Baked equirect nebula sky. Returns { texture, dispose }. */
export function makeNebulaSky(renderer, sunDir) {
  const rt = bake(renderer, `
    varying vec2 vUv; uniform vec3 uSun;
    void main(){
      vec3 d = dirFromUv(vUv);
      float n1 = fbm(d * 2.2 + vec3(3.1, 0.0, 1.7));
      float n2 = fbm(d * 5.0 + vec3(0.0, 9.0, 2.0));
      float band = exp(-pow((d.y * 0.9 + d.x * 0.35 + 0.05) * 3.2, 2.0));
      vec3 deep = vec3(0.012, 0.016, 0.045);
      vec3 blue = vec3(0.06, 0.14, 0.40);
      vec3 violet = vec3(0.30, 0.10, 0.42);
      vec3 warm = vec3(0.65, 0.32, 0.18);
      float cloud = smoothstep(0.35, 0.8, n1) * band;
      vec3 col = deep + blue * cloud * 1.6 + violet * smoothstep(0.5, 0.85, n2) * band * 0.9;
      col += warm * pow(smoothstep(0.55, 0.9, n1 * n2 * 2.0), 1.5) * band * 1.4;
      col *= 1.0 - 0.6 * smoothstep(0.6, 0.85, n2) * band;
      float s = max(0.0, dot(d, uSun));
      col += vec3(1.0, 0.75, 0.5) * pow(s, 40.0) * 1.2 + vec3(0.5, 0.35, 0.3) * pow(s, 6.0) * 0.15;
      // fine star dust baked in
      float dust = pow(hash3(floor(d * 900.0)).x, 40.0) * band;
      col += vec3(0.8, 0.85, 1.0) * dust * 0.6;
      gl_FragColor = vec4(col, 1.0);
    }`, { uSun: { value: sunDir.clone() } }, 2048, 1024);
  const tex = rt.texture;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.colorSpace = THREE.LinearSRGBColorSpace;
  return { texture: tex, dispose: () => rt.dispose() };
}

export function makePlanet(renderer, sunDir) {
  // bake surface albedo (rgb) + cloud coverage (a)
  const surf = bake(renderer, `
    varying vec2 vUv;
    void main(){
      vec3 p = dirFromUv(vUv);
      float cont = fbm(p * 3.0 + vec3(5.0));
      float detail = fbm(p * 12.0);
      float land = smoothstep(0.50, 0.56, cont + detail * 0.15);
      vec3 ocean = mix(vec3(0.02, 0.10, 0.30), vec3(0.05, 0.28, 0.55), smoothstep(0.3, 0.5, cont));
      vec3 grass = mix(vec3(0.10, 0.30, 0.10), vec3(0.45, 0.40, 0.22), smoothstep(0.5, 0.8, detail));
      float ice = smoothstep(0.75, 0.9, abs(p.y) + detail * 0.1);
      vec3 alb = mix(ocean, grass, land); alb = mix(alb, vec3(0.9, 0.93, 0.98), ice);
      float cl = fbm(p * 6.0 + vec3(20.0));
      float clouds = smoothstep(0.52, 0.72, cl);
      gl_FragColor = vec4(alb, clouds);
    }`, {}, 1024, 512, { wrapS: THREE.RepeatWrapping });
  surf.texture.wrapS = THREE.RepeatWrapping;
  const mat = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: sunDir.clone() }, uTime: { value: 0 }, tSurf: { value: surf.texture } },
    vertexShader: `varying vec3 vN; varying vec2 vUv; varying vec3 vW;
      void main(){ vN = normalize(mat3(modelMatrix) * normal); vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `
      varying vec3 vN; varying vec2 vUv; varying vec3 vW; uniform vec3 uSun; uniform float uTime; uniform sampler2D tSurf;
      void main(){
        vec4 s = texture2D(tSurf, vUv);
        float clouds = texture2D(tSurf, vUv + vec2(uTime * 0.002, 0.0)).a;
        vec3 alb = mix(s.rgb, vec3(0.85, 0.88, 0.92), clouds * 0.85);
        float land = step(0.2, s.g - s.b + 0.15);
        vec3 N = normalize(vN);
        float ndl = dot(N, uSun);
        float light = smoothstep(-0.15, 0.35, ndl);
        vec3 V = normalize(cameraPosition - vW);
        float spec = pow(max(0.0, dot(reflect(-uSun, N), V)), 60.0) * (1.0 - land) * (1.0 - clouds);
        vec3 col = alb * (light * vec3(1.0, 0.95, 0.9) * 0.75 + vec3(0.015, 0.02, 0.05)) + spec * 0.5 * light;
        float fres = pow(1.0 - max(0.0, dot(N, V)), 3.0);
        col += vec3(0.35, 0.6, 1.0) * fres * (0.25 + 0.8 * light);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const planet = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), mat);
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.06, 48, 32), new THREE.ShaderMaterial({
    uniforms: { uSun: { value: sunDir.clone() } }, transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    vertexShader: `varying vec3 vN; varying vec3 vW; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`,
    fragmentShader: `varying vec3 vN; varying vec3 vW; uniform vec3 uSun;
      void main(){ vec3 V = normalize(cameraPosition - vW); float f = pow(max(0.0, dot(normalize(vN), V)) , 2.5);
        float l = smoothstep(-0.3, 0.4, dot(normalize(vN), uSun));
        gl_FragColor = vec4(vec3(0.3, 0.55, 1.0) * f * (0.1 + 0.7 * l), f); }`,
  }));
  planet.add(atmo);
  planet.userData.dispose = () => { surf.dispose(); atmo.geometry.dispose(); atmo.material.dispose(); planet.geometry.dispose(); mat.dispose(); };
  return planet;
}

/** Build a PMREM environment from a small procedural sky so PBR materials get real reflections. */
export function makeEnvironment(renderer, sunDir) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const scene = new THREE.Scene();
  const sky = new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), new THREE.ShaderMaterial({
    side: THREE.BackSide, uniforms: { uSun: { value: sunDir.clone() } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `varying vec3 vDir; uniform vec3 uSun;
      void main(){ vec3 d = normalize(vDir);
        vec3 up = vec3(0.10, 0.18, 0.40) * 0.9;
        vec3 down = vec3(0.35, 0.22, 0.14) * 0.5;
        vec3 hor = vec3(0.18, 0.22, 0.34);
        float h = d.y;
        vec3 col = mix(hor, up, smoothstep(0.0, 0.7, h));
        col = mix(col, down, smoothstep(0.0, -0.6, h));
        float s = max(0.0, dot(d, uSun));
        col += vec3(1.0, 0.9, 0.75) * (pow(s, 600.0) * 40.0 + pow(s, 12.0) * 0.6);
        col += vec3(0.3, 0.5, 1.0) * pow(max(0.0, dot(d, -uSun)), 8.0) * 0.5;
        gl_FragColor = vec4(col, 1.0); }`,
  }));
  scene.add(sky);
  const rt = pmrem.fromScene(scene, 0.02);
  sky.geometry.dispose(); sky.material.dispose(); pmrem.dispose();
  return rt.texture;
}
