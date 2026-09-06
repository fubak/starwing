import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';

/**
 * Display-space colour grade, applied AFTER the engine's OutputPass (which
 * does ACES + sRGB). Lift/gain split-toning, contrast, saturation, a soft
 * cinematic vignette, fine film grain and a hit/flash uniform pieces can kick.
 */
export function makeGradePass() {
  const pass = new ShaderPass({
    uniforms: {
      tDiffuse: { value: null },
      uContrast: { value: 1.0 },
      uSaturation: { value: 1.0 },
      uLift: { value: new THREE.Color(0, 0, 0) },
      uGain: { value: new THREE.Color(1, 1, 1) },
      uGamma: { value: 1.0 },
      uVignette: { value: 0.3 },
      uGrain: { value: 0.02 },
      uFlash: { value: 0.0 },
      uTime: { value: 0.0 },
      uAspect: { value: 16 / 9 },
    },
    vertexShader: /* glsl */ `
      varying vec2 vUv;
      void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }
    `,
    fragmentShader: /* glsl */ `
      varying vec2 vUv;
      uniform sampler2D tDiffuse;
      uniform float uContrast, uSaturation, uGamma, uVignette, uGrain, uFlash, uTime, uAspect;
      uniform vec3 uLift, uGain;
      float hash(vec2 p) { p = fract(p * vec2(123.34, 456.21)); p += dot(p, p + 45.32); return fract(p.x * p.y); }
      void main() {
        vec3 c = texture2D(tDiffuse, vUv).rgb;
        // lift / gain (split toning): lift raises shadows, gain tints highlights
        c = c * uGain + uLift * (1.0 - c);
        c = pow(max(c, 0.0), vec3(1.0 / uGamma));
        // filmic S-curve around mid grey
        c = (c - 0.5) * uContrast + 0.5;
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        c = mix(vec3(l), c, uSaturation);
        // vignette (elliptical, soft)
        vec2 q = vUv - 0.5; q.x *= 1.0 + 0.15 * (uAspect - 1.0);
        float v = 1.0 - smoothstep(0.25, 1.0, dot(q, q) * 2.6) * uVignette;
        c *= v;
        // grain: luminance-weighted so highlights stay clean
        float g = hash(vUv * vec2(1920.0, 1080.0) + fract(uTime * 7.31) * 100.0) - 0.5;
        c += g * uGrain * (1.0 - l * 0.7);
        c += uFlash;
        gl_FragColor = vec4(clamp(c, 0.0, 1.0), 1.0);
      }
    `,
  });
  pass.isLookGrade = true;
  pass.material.toneMapped = false;
  return pass;
}

/** Push a resolved preset's grade block into the pass. */
export function applyGradePreset(pass, p) {
  const u = pass.uniforms;
  u.uContrast.value = p.grade.contrast;
  u.uSaturation.value = p.grade.saturation;
  u.uLift.value.copy(p.grade.lift);
  u.uGain.value.copy(p.grade.gain);
  u.uGamma.value = p.grade.gamma;
  u.uVignette.value = p.grade.vignette;
  u.uGrain.value = p.grade.grain;
}
