import * as THREE from 'three';
import { makeWaterNormalTexture } from './noise.js';
import { GLSL_SKY, skyUniforms, noiseTexture } from './sky.js';

/** Large water plane following the camera; fresnel sky reflection, sun glitter path, animated ripples, aerial fog. */
export function createWater() {
  const uniforms = {
    ...skyUniforms(),
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
        float dist0 = length(uCamPos - vWorld);
        float detail = 1.0 - smoothstep(250.0, 1500.0, dist0); // flatten far ripples (anti-alias)
        vec3 n1 = texture2D(uNormal, p * 0.009 + vec2(t * 0.010, t * 0.005)).xyz * 2.0 - 1.0;
        vec3 n2 = texture2D(uNormal, p * 0.027 - vec2(t * 0.016, t * 0.011)).xyz * 2.0 - 1.0;
        vec3 n3 = texture2D(uNormal, p * 0.08 + vec2(-t * 0.03, t * 0.02)).xyz * 2.0 - 1.0;
        vec2 nxz = (n1.xy * 0.5 + n2.xy * 0.3 + n3.xy * 0.12 * detail) * detail;
        vec3 n = normalize(vec3(nxz.x, 1.0, nxz.y));
        float swell = texture2D(uNoise, p * 0.0018 + vec2(t * 0.004, t * 0.002)).g;
        vec3 V = normalize(uCamPos - vWorld);
        float ndv = max(dot(n, V), 0.0);
        float F = 0.025 + 0.975 * pow(1.0 - ndv, 5.0);
        vec3 R = reflect(-V, n); R.y = abs(R.y) + 0.03;
        vec3 refl = skyColor(normalize(R));
        // body colour: deep cobalt -> turquoise in the shallows/swell crests
        vec3 deep = vec3(0.010, 0.075, 0.20);
        vec3 shallow = vec3(0.04, 0.34, 0.42);
        vec3 body = mix(deep, shallow, smoothstep(0.35, 0.75, swell) * 0.7);
        body += vec3(0.02, 0.10, 0.10) * pow(max(dot(n, uSunDir), 0.0), 2.0);
        vec3 col = mix(body, refl, clamp(F * 1.25, 0.0, 1.0));
        // sun glitter: sharp + broad lobes, jittered by ripple normals
        vec3 H = normalize(V + uSunDir);
        float ndh = max(dot(n, H), 0.0);
        float spec = pow(ndh, 600.0) * 7.0 + pow(ndh, 60.0) * 0.35;
        col += vec3(1.0, 0.92, 0.78) * spec * (0.4 + 0.6 * detail);
        // crest foam sparkle
        float crest = smoothstep(0.66, 0.82, swell) * detail;
        col += vec3(0.22, 0.27, 0.30) * crest * 0.4;
        float alpha = mix(0.86, 1.0, F);
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
  return { mesh, uniforms };
}
