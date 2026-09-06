import * as THREE from 'three';
import { makeWaterNormalTexture } from './noise.js';
import { GLSL_SKY, SUN_DIR, PALETTE, noiseTexture } from './sky.js';

/** Large water plane following the camera; reflective/fresnel shader with animated ripples. */
export function createWater() {
  const uniforms = {
    uSunDir: { value: SUN_DIR.clone() },
    uZenith: { value: PALETTE.zenith.clone() },
    uHorizon: { value: PALETTE.horizon.clone() },
    uFogColor: { value: PALETTE.fog.clone() },
    uTime: { value: 0 },
    uScroll: { value: 0 },
    uFogDensity: { value: 0.0006 },
    uCamPos: { value: new THREE.Vector3() },
    uNormal: { value: makeWaterNormalTexture(THREE, 256) },
    uNoise: { value: noiseTexture() },
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
      uniform float uTime, uScroll, uFogDensity; uniform vec3 uCamPos; uniform sampler2D uNormal, uNoise;
      varying vec3 vWorld;
      void main(){
        vec2 p = vec2(vWorld.x, vWorld.z - uScroll);
        float t = uTime;
        vec3 n1 = texture2D(uNormal, p * 0.011 + vec2(t * 0.012, t * 0.006)).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(uNormal, p * 0.031 - vec2(t * 0.02, t * 0.014)).xyz * 2.0 - 1.0;
        float dist0 = length(uCamPos - vWorld);
        float detail = 1.0 - smoothstep(300.0, 1600.0, dist0); // flatten far ripples (anti-alias)
        vec3 n = normalize(vec3((n1.x * 0.7 + n2.x * 0.45) * detail, 1.0, (n1.y * 0.7 + n2.y * 0.45) * detail));
        float h0 = texture2D(uNoise, p * 0.004 + vec2(t * 0.003)).g;
        vec3 V = normalize(uCamPos - vWorld);
        float ndv = max(dot(n, V), 0.0);
        float F = 0.03 + 0.97 * pow(1.0 - ndv, 5.0);
        vec3 R = reflect(-V, n); R.y = abs(R.y) + 0.02;
        vec3 refl = skyColor(normalize(R));
        vec3 deep = vec3(0.012, 0.11, 0.17);
        vec3 shallow = vec3(0.05, 0.36, 0.42);
        vec3 body = mix(deep, shallow, texture2D(uNoise, p * 0.0015).r);
        // sun-lit subsurface tint
        body += vec3(0.02, 0.09, 0.08) * pow(max(dot(n, uSunDir), 0.0), 2.0);
        vec3 col = mix(body, refl, clamp(F * 1.35, 0.0, 1.0));
        // specular sun glint
        vec3 H = normalize(V + uSunDir);
        float spec = pow(max(dot(n, H), 0.0), 380.0) * 5.0 + pow(max(dot(n, H), 0.0), 40.0) * 0.25;
        col += vec3(1.0, 0.9, 0.75) * spec;
        // foam-ish sparkle on crests
        float crest = smoothstep(0.62, 0.8, h0);
        col += vec3(0.25, 0.3, 0.32) * crest * 0.35;
        float alpha = mix(0.82, 1.0, F);
        // distance fog (matches FogExp2)
        float dist = length(uCamPos - vWorld);
        float fogF = 1.0 - exp(-pow(dist * uFogDensity, 2.0));
        col = mix(col, uFogColor, fogF);
        gl_FragColor = vec4(col, mix(alpha, 1.0, fogF));
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(7000, 7000, 1, 1), mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.frustumCulled = false;
  mesh.renderOrder = 2;
  return { mesh, uniforms };
}
