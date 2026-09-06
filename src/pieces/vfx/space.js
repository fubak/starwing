// Showcase backdrop: procedural nebula sky dome, star field, planet with
// atmosphere shell, sun glare. Used only by the vfx demo scene.
import * as THREE from 'three';

const NOISE = /* glsl */ `
float hash(vec3 p) { p = fract(p * 0.3183099 + 0.1); p *= 17.0; return fract(p.x * p.y * p.z * (p.x + p.y + p.z)); }
float noise(vec3 x) { vec3 i = floor(x), f = fract(x); f = f*f*(3.0-2.0*f);
  return mix(mix(mix(hash(i), hash(i+vec3(1,0,0)), f.x), mix(hash(i+vec3(0,1,0)), hash(i+vec3(1,1,0)), f.x), f.y),
             mix(mix(hash(i+vec3(0,0,1)), hash(i+vec3(1,0,1)), f.x), mix(hash(i+vec3(0,1,1)), hash(i+vec3(1,1,1)), f.x), f.y), f.z); }
float fbm(vec3 p) { float v = 0.0, a = 0.5; for (int i = 0; i < 5; i++) { v += a * noise(p); p = p * 2.1 + 3.7; a *= 0.5; } return v; }
`;

export function makeSky(sunDir) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uSun: { value: sunDir.clone().normalize() } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: /* glsl */ `
      precision highp float; varying vec3 vDir; uniform vec3 uSun; ${NOISE}
      void main(){
        vec3 d = normalize(vDir);
        // deep space base: navy -> violet horizon
        vec3 base = mix(vec3(0.012, 0.018, 0.045), vec3(0.05, 0.03, 0.09), smoothstep(-0.3, 0.4, d.y));
        // nebula: two lobes, teal and magenta
        float n1 = fbm(d * 3.0 + vec3(2.0, 0.0, 1.0));
        float n2 = fbm(d * 5.0 - vec3(0.0, 4.0, 2.0));
        float lobeA = smoothstep(0.2, 0.9, dot(d, normalize(vec3(-0.6, 0.15, -0.7))));
        float lobeB = smoothstep(0.3, 0.95, dot(d, normalize(vec3(0.7, -0.2, -0.4))));
        vec3 neb = vec3(0.1, 0.45, 0.6) * pow(n1, 3.0) * lobeA * 0.7
                 + vec3(0.55, 0.15, 0.5) * pow(n2, 3.2) * lobeB * 0.6;
        // milky band
        float band = exp(-pow(dot(d, normalize(vec3(0.2, 1.0, 0.3))), 2.0) * 9.0);
        neb += vec3(0.25, 0.28, 0.4) * band * pow(fbm(d * 8.0), 2.0) * 0.35;
        // stars: cell hash on a cube projection
        vec3 ad = abs(d); vec2 uv; 
        if (ad.x >= ad.y && ad.x >= ad.z) uv = d.yz / ad.x + (d.x > 0.0 ? 10.0 : 20.0);
        else if (ad.y >= ad.z) uv = d.xz / ad.y + (d.y > 0.0 ? 30.0 : 40.0);
        else uv = d.xy / ad.z + (d.z > 0.0 ? 50.0 : 60.0);
        float stars = 0.0;
        for (int i = 0; i < 2; i++) {
          float sc = i == 0 ? 180.0 : 90.0;
          vec2 g = uv * sc; vec2 id = floor(g); vec2 f = fract(g) - 0.5;
          float h = hash(vec3(id, float(i) * 7.0));
          vec2 off = vec2(hash(vec3(id, 1.0)), hash(vec3(id, 2.0))) - 0.5;
          float dd = length(f - off * 0.6);
          float bright = step(0.965 - float(i) * 0.03, h) * (h - 0.95) * 14.0;
          stars += bright * smoothstep(0.08 + 0.05 * float(i), 0.0, dd) * (i == 0 ? 1.0 : 2.0);
        }
        vec3 starCol = mix(vec3(0.8, 0.9, 1.0), vec3(1.0, 0.85, 0.7), hash(vec3(floor(uv * 90.0), 3.0)));
        // sun glare
        float sd = max(dot(d, uSun), 0.0);
        vec3 sun = vec3(1.0, 0.9, 0.75) * (pow(sd, 1500.0) * 4.0 + pow(sd, 60.0) * 0.25 + pow(sd, 8.0) * 0.04);
        vec3 col = base + neb + stars * starCol + sun;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(2000, 48, 32), mat);
  mesh.frustumCulled = false;
  return mesh;
}

export function makePlanet(radius, sunDir) {
  const g = new THREE.Group();
  const surf = new THREE.ShaderMaterial({
    uniforms: { uSun: { value: sunDir.clone().normalize() } },
    vertexShader: `varying vec3 vN; varying vec3 vP; varying vec3 vV; void main(){ vN = normalize(mat3(modelMatrix) * normal); vP = position; vec4 wp = modelMatrix * vec4(position,1.0); vV = cameraPosition - wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */ `
      precision highp float; varying vec3 vN; varying vec3 vP; varying vec3 vV; uniform vec3 uSun; ${NOISE}
      void main(){
        vec3 n = normalize(vN); vec3 p = normalize(vP);
        float cont = fbm(p * 2.2 + 5.0);
        float detail = fbm(p * 9.0);
        float land = smoothstep(0.48, 0.56, cont + detail * 0.15);
        vec3 ocean = mix(vec3(0.02, 0.12, 0.35), vec3(0.05, 0.35, 0.55), detail);
        vec3 ground = mix(vec3(0.22, 0.32, 0.12), vec3(0.55, 0.45, 0.28), smoothstep(0.4, 0.7, detail));
        float ice = smoothstep(0.75, 0.9, abs(p.y));
        vec3 alb = mix(mix(ocean, ground, land), vec3(0.9), ice);
        float cloud = smoothstep(0.55, 0.75, fbm(p * 4.0 + vec3(1.0, 7.0, 3.0)));
        alb = mix(alb, vec3(1.0), cloud * 0.85);
        float ndl = max(dot(n, uSun), 0.0);
        vec3 v = normalize(vV); vec3 h = normalize(uSun + v);
        float spec = pow(max(dot(n, h), 0.0), 60.0) * (1.0 - land) * (1.0 - cloud) * 0.8;
        float rim = pow(1.0 - max(dot(n, v), 0.0), 3.0);
        vec3 col = alb * (ndl * 1.3 + 0.02) + vec3(1.0, 0.95, 0.85) * spec * ndl + vec3(0.3, 0.6, 1.0) * rim * (ndl * 0.8 + 0.1) * 1.5;
        // night side city glow
        col += vec3(1.0, 0.7, 0.35) * land * (1.0 - cloud) * smoothstep(0.7, 0.9, detail) * (1.0 - smoothstep(0.0, 0.15, ndl)) * 0.35;
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  g.add(new THREE.Mesh(new THREE.SphereGeometry(radius, 96, 64), surf));
  const atmo = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.AdditiveBlending,
    uniforms: { uSun: { value: sunDir.clone().normalize() } },
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(mat3(modelMatrix) * normal); vec4 wp = modelMatrix * vec4(position,1.0); vV = cameraPosition - wp.xyz; gl_Position = projectionMatrix * viewMatrix * wp; }`,
    fragmentShader: /* glsl */ `
      precision highp float; varying vec3 vN; varying vec3 vV; uniform vec3 uSun;
      void main(){ vec3 n = normalize(vN); vec3 v = normalize(vV);
        float rim = pow(max(dot(n, v), 0.0), 3.5);          // back side: thick at limb
        float lit = clamp(dot(-n, uSun) * 0.8 + 0.35, 0.0, 1.0);
        vec3 col = mix(vec3(0.2, 0.5, 1.0), vec3(1.0, 0.6, 0.35), pow(1.0 - lit, 4.0)) * rim * lit * 1.8;
        gl_FragColor = vec4(col, rim * lit); }`,
  });
  g.add(new THREE.Mesh(new THREE.SphereGeometry(radius * 1.045, 96, 64), atmo));
  return g;
}
