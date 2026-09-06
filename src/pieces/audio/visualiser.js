/**
 * Audio Lab stage — a Cornerian hangar deck in orbit: nebula sky + lookdev
 * planet, an Arwing hovering over a holo-pedestal as the hero, a ring of
 * bevelled two-tone spectrum blades with a wet-deck reflection, waveform halo,
 * hex-panelled deck with real specular, particle bursts, camera kicks.
 *
 * Robustness: every audio-driven spring is integrated in AUDIO time with fixed
 * substeps and hard clamps; stale hits (whose moment already passed while the
 * renderer stalled) are dropped, so a slow frame can never inflate the scene.
 */
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import { buildHeroArwing } from './arwing.js';
import { makePlanet } from '../lookdev/planet.js';
import { resolvePreset } from '../lookdev/presets.js';
import { makeGradePass, applyGradePreset } from '../lookdev/grade.js';

const NOISE_GLSL = /* glsl */`
  vec3 hash3(vec3 p){ p=fract(p*vec3(443.897,441.423,437.195)); p+=dot(p,p.yzx+19.19); return fract((p.xxy+p.yzz)*p.zyx); }
  float hash(vec3 p){ return hash3(p).x; }
  float vnoise(vec3 p){ vec3 i=floor(p); vec3 f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
  float fbm(vec3 p){ float a=0.5,s=0.0; for(int i=0;i<5;i++){ s+=a*vnoise(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=0.5; } return s; }
`;

/** Per-song palettes (RGB, lerped in RGB so transitions never pass through off-brand hues). */
export const PALETTES = {
  main:   { song: 0x38dcff, accent: 0xffb648, nebA: [0.28, 0.48, 0.98], nebB: [0.95, 0.52, 0.34], ui: '#3ee6ff' },
  battle: { song: 0xff4a2e, accent: 0xffa33a, nebA: [0.92, 0.32, 0.26], nebB: [0.42, 0.34, 0.85], ui: '#ff6a2a' },
  idle:   { song: 0x38dcff, accent: 0xffb648, nebA: [0.28, 0.48, 0.98], nebB: [0.95, 0.52, 0.34], ui: '#3ee6ff' },
};

/** Damped spring integrated with fixed substeps + clamps. Unconditionally stable. */
function makeSpring(rest, { k = 140, c = 9, min = -Infinity, max = Infinity, vmax = 8 } = {}) {
  const sp = { s: rest, v: 0, rest, k, c, min, max, vmax };
  sp.kick = (dv) => { sp.v = Math.max(-vmax, Math.min(vmax, sp.v + dv)); };
  sp.step = (dt) => {
    dt = Math.max(0, Math.min(0.5, dt));
    const n = Math.max(1, Math.min(24, Math.ceil(dt / (1 / 120)))), h = dt / n;
    for (let i = 0; i < n; i++) {
      sp.v += (sp.rest - sp.s) * sp.k * h;
      sp.v *= Math.exp(-sp.c * h);
      sp.s += sp.v * h;
      if (sp.s > sp.max) { sp.s = sp.max; if (sp.v > 0) sp.v = 0; }
      if (sp.s < sp.min) { sp.s = sp.min; if (sp.v < 0) sp.v = 0; }
      if (sp.v > sp.vmax) sp.v = sp.vmax; else if (sp.v < -sp.vmax) sp.v = -sp.vmax;
    }
    if (!Number.isFinite(sp.s) || !Number.isFinite(sp.v)) { sp.s = sp.rest; sp.v = 0; }
    return sp.s;
  };
  return sp;
}

export function createStage(ctx, audio) {
  const { scene, camera, bloom, renderer, composer } = ctx;
  const group = new THREE.Group();
  scene.add(group);
  const disposables = [];
  const D = (o) => (disposables.push(o), o);

  scene.fog = null;
  // bloom is a garnish here, not the lighting model: tight radius, high threshold, and every emissive below is capped
  // so a tutti + explosion can never fuse ship, blades and ring into one white smear
  bloom.strength = 0.42; bloom.radius = 0.32; bloom.threshold = 0.86;
  renderer.toneMappingExposure = 0.95;

  // ---------------------------------------------------------------- look: grade pass from lookdev
  const preset = resolvePreset(THREE, 'space');
  let grade = composer.passes.find((p) => p.isLookGrade);
  const ownGrade = !grade;
  if (!grade) { grade = makeGradePass(); composer.addPass(grade); }
  grade.enabled = true;
  applyGradePreset(grade, preset);
  grade.uniforms.uContrast.value = 1.08; grade.uniforms.uSaturation.value = 1.1; grade.uniforms.uVignette.value = 0.38; grade.uniforms.uGrain.value = 0.015;
  grade.uniforms.uLift.value.set(0.01, 0.012, 0.03);
  const SUN_D = new THREE.Vector3(-0.7, 0.35, -0.6).normalize();

  // ---------------------------------------------------------------- sky
  const nebRT = new THREE.WebGLRenderTarget(1024, 512, { depthBuffer: false });
  nebRT.texture.wrapS = THREE.RepeatWrapping; nebRT.texture.wrapT = THREE.ClampToEdgeWrapping;
  {
    const bakeMat = new THREE.ShaderMaterial({
      vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=vec4(position.xy,0.0,1.0); }`,
      fragmentShader: NOISE_GLSL + `varying vec2 vUv;
        void main(){
          float lon=(vUv.x-0.5)*6.2831853, lat=(vUv.y-0.5)*3.14159265;
          vec3 d=vec3(cos(lat)*cos(lon), sin(lat), cos(lat)*sin(lon)); float up=d.y;
          float n = fbm(d*2.2); float n2 = fbm(d*5.0 + vec3(3.0,0.0,1.0));
          float band = smoothstep(0.45,0.75,n) * (1.0-smoothstep(0.0,0.55,abs(up-0.12)));
          float wisp = smoothstep(0.55,0.8,fbm(d*9.0+vec3(2.0,5.0,7.0)));
          gl_FragColor = vec4(band*(1.0-n2), band*n2, smoothstep(0.55,0.9,n2)*band, wisp*band);
        }`,
    });
    const q = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), bakeMat);
    const sc = new THREE.Scene(); sc.add(q);
    const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const prevRT = renderer.getRenderTarget();
    renderer.setRenderTarget(nebRT); renderer.render(sc, cam); renderer.setRenderTarget(prevRT);
    bakeMat.dispose(); q.geometry.dispose();
  }
  const skyMat = D(new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTime: { value: 0 }, uNebA: { value: new THREE.Vector3(0.28, 0.48, 0.98) }, uNebB: { value: new THREE.Vector3(0.95, 0.52, 0.34) }, uEnergy: { value: 0 }, uNeb: { value: nebRT.texture }, uSun: { value: SUN_D } },
    vertexShader: `varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      varying vec3 vDir; uniform float uTime; uniform vec3 uNebA, uNebB; uniform float uEnergy; uniform sampler2D uNeb; uniform vec3 uSun;
      vec3 hash3(vec3 p){ p=fract(p*vec3(443.897,441.423,437.195)); p+=dot(p,p.yzx+19.19); return fract((p.xxy+p.yzz)*p.zyx); }
      void main(){
        vec3 d=vDir; float up=d.y;
        vec3 col = mix(vec3(0.03,0.045,0.12), vec3(0.006,0.008,0.024), smoothstep(-0.1,0.7,up));
        vec2 uv = vec2(atan(d.z,d.x)/6.2831853+0.5 + uTime*0.0015, asin(clamp(up,-1.0,1.0))/3.14159265+0.5);
        vec4 m = texture2D(uNeb, uv);
        vec3 nebA = uNebA * vec3(0.55,0.6,0.8);
        vec3 nebB = uNebB * 0.75;
        col += (m.r*nebA + m.g*nebB) * 0.5;
        col += m.b * vec3(0.9,0.7,1.0) * 0.22 + m.a * vec3(1.0,0.9,0.8) * 0.12;
        // two star layers (fine + a few bright)
        vec3 sp = d*260.0; vec3 cell=floor(sp); vec3 h=hash3(cell);
        float star = smoothstep(0.985,1.0,1.0-length(fract(sp)-0.5-(h-0.5)*0.4));
        star *= step(0.93, h.y) * (0.6+0.4*sin(uTime*2.0+h.z*30.0));
        col += star * (1.1+uEnergy*1.5) * mix(vec3(0.7,0.8,1.0), vec3(1.0,0.85,0.7), h.z);
        vec3 sp2 = d*70.0; vec3 h2=hash3(floor(sp2)+7.0);
        float big = smoothstep(0.90,1.0,1.0-length(fract(sp2)-0.5-(h2-0.5)*0.5)*3.0) * step(0.965,h2.y);
        col += big * 2.5 * mix(vec3(0.8,0.9,1.0), vec3(1.0,0.9,0.75), h2.z);
        // sun: low, behind-left, warm
        float sd = max(0.0, dot(d, uSun));
        col += vec3(1.0,0.72,0.42) * (pow(sd, 1400.0)*8.0 + pow(sd, 40.0)*0.35 + pow(sd,5.0)*0.06);
        gl_FragColor=vec4(col,1.0);
      }`,
  }));
  const sky = new THREE.Mesh(D(new THREE.SphereGeometry(400, 48, 32)), skyMat);
  sky.renderOrder = -10; sky.name = 'sky';
  group.add(sky);

  // planet Corneria (lookdev's shaded planet: crisp continents, clouds, city lights, limb scattering)
  const planet = makePlanet({ radius: 150, seed: 7, preset, renderer });
  planet.position.set(0.25, -0.30, -1.0).normalize().multiplyScalar(385);
  planet.rotation.set(0.35, 0.6, -0.3); planet.name = 'planet';
  planet.lightDir = SUN_D.clone();
  planet.setPreset(preset);
  group.add(planet);

  // environment map from the sky for consistent specular
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene(); envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMat));
  const envRT = pmrem.fromScene(envScene, 0.04);
  scene.environment = envRT.texture;
  pmrem.dispose();

  // ---------------------------------------------------------------- deck
  const BINS = audio.synth.BINS;
  const specTex = D(new THREE.DataTexture(new Uint8Array(BINS * 4), BINS, 1, THREE.RGBAFormat));
  specTex.magFilter = THREE.LinearFilter; specTex.needsUpdate = true;
  const RING_R = 6.2, DECK_R = 12.5;
  const deckMat = D(new THREE.ShaderMaterial({
    depthWrite: false,
    uniforms: {
      uTime: { value: 0 }, uSpec: { value: specTex }, uRing: { value: RING_R }, uBeat: { value: 0 },
      uColA: { value: new THREE.Color(0xffb648) }, uColB: { value: new THREE.Color(0x38dcff) }, uShock: { value: [0, 0, 0, 0].map(() => new THREE.Vector4(-10, 0, 0, 0)) }, uShockCol: { value: [0, 0, 0, 0].map(() => new THREE.Color()) }, uCam: { value: new THREE.Vector3() },
      uSun: { value: SUN_D }, uShip: { value: new THREE.Vector3(0, 3, 0) }, uShipCol: { value: new THREE.Color(0x3ee6ff) },
    },
    vertexShader: `varying vec3 vW; void main(){ vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; gl_Position=projectionMatrix*viewMatrix*w; }`,
    fragmentShader: `
      varying vec3 vW; uniform float uTime,uRing,uBeat; uniform vec3 uColA,uColB; uniform sampler2D uSpec; uniform vec4 uShock[4]; uniform vec3 uShockCol[4]; uniform vec3 uCam,uSun,uShip,uShipCol;
      float hash21(vec2 p){ p=fract(p*vec2(123.34,456.21)); p+=dot(p,p+45.32); return fract(p.x*p.y); }
      // hex grid: returns (edge distance 0..1, cell id hash)
      vec2 hexInfo(vec2 p){
        const vec2 s = vec2(1.0, 1.7320508);
        vec4 hC = floor(vec4(p, p - vec2(0.5, 1.0)) / s.xyxy) + 0.5;
        vec4 h = vec4(p - hC.xy * s, p - (hC.zw + 0.5) * s);
        vec2 c = dot(h.xy, h.xy) < dot(h.zw, h.zw) ? h.xy : h.zw;
        vec2 id = dot(h.xy, h.xy) < dot(h.zw, h.zw) ? hC.xy : hC.zw + 0.5;
        c = abs(c);
        float e = max(dot(c, normalize(vec2(1.0, 1.7320508))), c.x);
        return vec2(e, hash21(id));
      }
      void main(){
        float r=length(vW.xz); float ang=atan(vW.z,vW.x);
        vec3 V=normalize(uCam-vW);
        // hex plating with bevelled seams -> fake normal for specular
        float hs = 0.72;
        vec2 hx = hexInfo(vW.xz / hs);
        float seam = smoothstep(0.42, 0.5, hx.x);
        float bevel = smoothstep(0.34, 0.5, hx.x);
        vec2 eps = vec2(0.02, 0.0);
        float ex = hexInfo((vW.xz+eps.xy)/hs).x - hx.x, ez = hexInfo((vW.xz+eps.yx)/hs).x - hx.x;
        vec3 N = normalize(vec3(-ex*bevel*6.0, 1.0, -ez*bevel*6.0));
        float tone = 0.8 + 0.4*hx.y;
        vec3 base = vec3(0.020,0.028,0.055) * tone;
        base = mix(base, vec3(0.008,0.010,0.02), seam);            // dark seams
        // painted markings: inner landing ring + spokes, cyan/gold decals
        float landing = smoothstep(0.04,0.0,abs(r-3.2)) + smoothstep(0.04,0.0,abs(r-3.35));
        float spokes = step(0.985, abs(fract(ang/6.2831853*12.0)-0.5)*2.0) * step(3.5, r) * step(r, uRing-0.7);
        float chev = step(0.5, fract(ang/6.2831853*24.0+uTime*0.05)) * smoothstep(9.3,9.4,r)*(1.0-smoothstep(9.7,9.8,r));
        vec3 gridCol = mix(uColB, vec3(1.0), 0.25);
        vec3 col = base;
        col += landing * gridCol * (0.35+0.35*uBeat);
        col += spokes * gridCol * 0.10;
        col += chev * uColA * 0.28;
        // edge caution band with dashes
        float edge = smoothstep(11.35,11.5,r)*(1.0-smoothstep(11.95,12.1,r));
        float dashes = step(0.5, fract(ang/6.2831853*48.0));
        col += edge * mix(vec3(0.95,0.6,0.15), gridCol, 0.25) * (0.45+0.3*uBeat) * (1.0-dashes*0.8);
        // spectrum footlight under the blades
        float u = fract((ang/6.2831853)+0.5);
        vec4 sp = texture2D(uSpec, vec2(u,0.5));
        float near = exp(-pow((r-uRing)/(0.6+sp.r*1.0),2.0));
        col += mix(uColA, uColB, sp.g) * near * sp.r * 0.35;
        // hero pool: ship light falls on the deck
        vec3 toShip = uShip - vW; float dS = length(toShip);
        col += uShipCol * (0.55/(1.0+dS*dS*0.35)) * max(0.0, toShip.y/dS) * (0.6+0.4*uBeat);
        // beat shockwaves
        for(int i=0;i<4;i++){ float age=uTime-uShock[i].x; if(age>0.0 && age<2.2){ float rr=age*9.0; float w=exp(-pow((r-rr)/0.35,2.0)); col += uShockCol[i]*w*uShock[i].y*(1.0-age/2.2)*0.45; } }
        // specular: sun + ship key on bevelled hex normals, plus horizon fresnel picking up nebula
        vec3 H = normalize(V + uSun);
        float spec = pow(max(0.0,dot(N,H)), 180.0) * 1.2 + pow(max(0.0,dot(N,H)), 12.0)*0.06;
        col += spec * vec3(1.0,0.8,0.55) * (1.0-seam*0.6);
        vec3 Ls = normalize(toShip); vec3 H2 = normalize(V + Ls);
        col += pow(max(0.0,dot(N,H2)), 90.0) * uShipCol * 0.8 / (1.0+dS*0.4);
        float fres = pow(1.0-max(0.0,dot(N,V)),4.0);
        col += fres * (vec3(0.10,0.08,0.07) + uColB*0.05) * (1.0-seam*0.5);
        // subtle clearcoat darkening of seams and a soft radial falloff toward the rim
        col *= 1.0 - smoothstep(9.0, 12.5, r)*0.25;
        gl_FragColor=vec4(col,1.0);
      }`,
  }));
  // Draw order trick for the wet-deck reflection: deck colour (no depth) -> mirrored blades (additive) -> depth-only disc.
  const deck = new THREE.Mesh(D(new THREE.CircleGeometry(DECK_R, 128)), deckMat);
  deck.rotation.x = -Math.PI / 2; deck.renderOrder = -3; deck.name = 'deck';
  group.add(deck);
  const depthDisc = new THREE.Mesh(deck.geometry, D(new THREE.MeshBasicMaterial({ colorWrite: false })));
  depthDisc.rotation.x = -Math.PI / 2; depthDisc.renderOrder = -1;
  group.add(depthDisc);
  // platform body: bevelled hull hanging below the deck, dark painted metal
  const hullMat = D(new THREE.MeshPhysicalMaterial({ color: 0x1b2540, metalness: 0.75, roughness: 0.42, clearcoat: 0.6, clearcoatRoughness: 0.3, envMapIntensity: 1.1 }));
  const hull = new THREE.Mesh(D(new THREE.CylinderGeometry(DECK_R, DECK_R * 0.78, 1.6, 128, 1, true)), hullMat);
  hull.position.y = -0.8; group.add(hull);
  const hullCap = new THREE.Mesh(D(new THREE.CircleGeometry(DECK_R * 0.78, 128)), hullMat);
  hullCap.rotation.x = Math.PI / 2; hullCap.position.y = -1.6; group.add(hullCap);
  const stripMat = D(new THREE.MeshBasicMaterial({ color: 0x3ee6ff }));
  const strip = new THREE.Mesh(D(new THREE.TorusGeometry(DECK_R + 0.02, 0.07, 8, 160)), stripMat);
  strip.rotation.x = Math.PI / 2; strip.position.y = -0.08; group.add(strip);
  const strip2 = new THREE.Mesh(D(new THREE.TorusGeometry(DECK_R * 0.78 + 0.02, 0.05, 8, 160)), stripMat);
  strip2.rotation.x = Math.PI / 2; strip2.position.y = -1.55; group.add(strip2);
  const underMat = D(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uCol: { value: new THREE.Color(0x3ee6ff) }, uK: { value: 1 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform vec3 uCol; uniform float uK; void main(){ float r=length(vUv-0.5)*2.0; float a=smoothstep(1.0,0.2,r)*(0.35+0.25*uK); gl_FragColor=vec4(uCol*a*1.2,a); }`,
  }));
  const under = new THREE.Mesh(D(new THREE.PlaneGeometry(DECK_R * 2.6, DECK_R * 2.6)), underMat);
  under.rotation.x = Math.PI / 2; under.position.y = -2.4; group.add(under);

  // ---------------------------------------------------------------- spectrum blades
  // Light-blades: additive glass slabs (no sorting artefacts, never read as opaque plastic). Per-instance colour,
  // vertical energy gradient, fresnel rim, hot white tip, sun glint on the bevel.
  const barGeo = D(new RoundedBoxGeometry(0.17, 1, 0.26, 2, 0.04)); barGeo.translate(0, 0.5, 0);
  const makeBladeMat = (em) => D(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uEm: { value: em }, uSun: { value: SUN_D }, uTime: { value: 0 } },
    vertexShader: `
      
      varying vec3 vC; varying float vY; varying vec3 vN; varying vec3 vV; varying float vH;
      void main(){
        vC = instanceColor; vY = clamp(position.y, 0.0, 1.0);
        vH = length(vec3(instanceMatrix[1]));
        vec4 w = modelMatrix * instanceMatrix * vec4(position, 1.0);
        vN = normalize(mat3(modelMatrix) * mat3(instanceMatrix) * vec3(normal.x, normal.y / max(vH,0.01), normal.z));
        vV = normalize(cameraPosition - w.xyz);
        gl_Position = projectionMatrix * viewMatrix * w;
      }`,
    fragmentShader: `
      varying vec3 vC; varying float vY; varying vec3 vN; varying vec3 vV; varying float vH;
      uniform float uEm, uTime; uniform vec3 uSun;
      void main(){
        vec3 N = normalize(vN); vec3 V = normalize(vV);
        float ndv = abs(dot(N, V));
        float fres = pow(1.0 - ndv, 2.5);
        float body = 0.08 + 0.45 * pow(vY, 1.5);              // energy rises toward the tip
        float tip = pow(vY, 22.0) * 0.55;                       // cap: coloured, not white-hot
        vec3 H = normalize(V + uSun);
        float glint = pow(max(0.0, dot(N, H)), 90.0) * 0.35;
        float scan = 0.9 + 0.1 * sin(vY * vH * 14.0 - uTime * 4.0);
        vec3 col = vC * (body * scan + fres * 0.6) + mix(vC, vec3(1.0), 0.35) * tip + vec3(1.0, 0.95, 0.85) * glint;
        col = min(col * uEm, vec3(1.05));                      // hard cap: blades never bloom into a wall
        gl_FragColor = vec4(col, 1.0);
      }`,
  }));
  const barMat = makeBladeMat(1.0);
  const bars = new THREE.InstancedMesh(barGeo, barMat, BINS);
  bars.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(BINS * 3), 3);
  bars.renderOrder = 2; bars.frustumCulled = false; bars.name = 'bars';
  group.add(bars);
  // wet-deck reflection: same instances mirrored through the deck, faded
  const reflMat = makeBladeMat(0.3);
  const barsRefl = new THREE.InstancedMesh(barGeo, reflMat, BINS);
  barsRefl.instanceColor = bars.instanceColor; barsRefl.instanceMatrix = bars.instanceMatrix;
  barsRefl.scale.y = -1; barsRefl.renderOrder = -2; barsRefl.frustumCulled = false; barsRefl.name = 'barsRefl';
  group.add(barsRefl);
  // slim halo rail the blades stand on
  const railMat = D(new THREE.MeshPhysicalMaterial({ color: 0xd8e8ff, metalness: 1, roughness: 0.25, envMapIntensity: 1.2, emissive: 0x0a2030, emissiveIntensity: 1 }));
  const rail = new THREE.Mesh(D(new THREE.TorusGeometry(RING_R, 0.06, 8, 160)), railMat); rail.rotation.x = Math.PI / 2; rail.position.y = 0.04; group.add(rail);
  const Y_AXIS = new THREE.Vector3(0, 1, 0);
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpC = new THREE.Color(), tmpV = new THREE.Vector3();
  const accentCol = new THREE.Color(), songCol = new THREE.Color(), WHITE = new THREE.Color(1, 1, 1);
  const barLevel = new Float32Array(BINS), barPeak = new Float32Array(BINS);
  let autoGain = 1.2, peakTrack = 0.8;

  // ---------------------------------------------------------------- waveform halo
  const WN = audio.synth.WAVE_N;
  const waveGeo = new LineGeometry();
  const wavePos = new Float32Array((WN + 1) * 3), waveCol = new Float32Array((WN + 1) * 3);
  waveGeo.setPositions(wavePos); waveGeo.setColors(waveCol);
  const waveMat = D(new LineMaterial({ vertexColors: true, linewidth: 1.8, transparent: true, opacity: 0.7, blending: THREE.AdditiveBlending, depthWrite: false, worldUnits: false }));
  waveMat.resolution.set(ctx.size.x, ctx.size.y);
  const HERO_Y = 4.15;   // ship floats clear above the blade ring (max blade height ~2.1)
  const halo = new Line2(waveGeo, waveMat); halo.position.y = HERO_Y - 1.9; group.add(halo);
  const halo2 = new Line2(waveGeo, waveMat); halo2.position.y = HERO_Y - 1.9; halo2.rotation.z = Math.PI; halo2.scale.set(0.84, 0.84, 0.84); group.add(halo2);
  const waveSmooth = new Float32Array(WN);

  // ---------------------------------------------------------------- hero: Arwing on a holo-pedestal
  const hero = new THREE.Group(); hero.position.y = HERO_Y; hero.name = 'hero'; group.add(hero);
  const ship = buildHeroArwing({ THREE });
  ship.group.scale.setScalar(1.12); ship.setThrust(0.45);
  hero.add(ship.group);
  // holo reticle rings (targeting-computer motif)
  const ringMat = D(new THREE.MeshPhysicalMaterial({ color: 0xe8f4ff, metalness: 1, roughness: 0.2, envMapIntensity: 1.4, emissive: 0x112244, emissiveIntensity: 0.6, transparent: true, opacity: 0.9 }));
  // broken-arc reticle rings (Star Fox lock-on language) rather than full wire ellipses
  const gyro = [];
  [[3.55, 0.035, 4, 0.0], [4.0, 0.025, 3, 0.35]].forEach(([r, tube, segs, tilt], i) => {
    const g = new THREE.Group();
    const arcGeo = D(new THREE.TorusGeometry(r, tube, 8, 48, (Math.PI * 2 / segs) * 0.62));
    for (let s = 0; s < segs; s++) { const m = new THREE.Mesh(arcGeo, ringMat); m.rotation.z = (s / segs) * Math.PI * 2; g.add(m); }
    // tick marks at the arc ends
    const tickGeo = D(new THREE.BoxGeometry(0.05, 0.28, 0.05));
    for (let s = 0; s < segs; s++) { const m = new THREE.Mesh(tickGeo, ringMat); const a = (s / segs) * Math.PI * 2; m.position.set(Math.cos(a) * r, Math.sin(a) * r, 0); m.rotation.z = a; g.add(m); }
    g.rotation.set(Math.PI / 2 + tilt, 0, 0); hero.add(g); gyro.push(g);
  });
  // pedestal: light column + disc on the deck under the ship
  const pedMat = D(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
    uniforms: { uCol: { value: new THREE.Color(0x3ee6ff) }, uK: { value: 0.5 }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; varying vec3 vP; void main(){ vUv=uv; vP=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec2 vUv; varying vec3 vP; uniform vec3 uCol; uniform float uK,uTime;
      void main(){ float y=vUv.y; float a=(1.0-y)*(1.0-y)*0.35*(0.5+uK); a*=0.75+0.25*sin(y*40.0-uTime*6.0); float scan=smoothstep(0.02,0.0,abs(fract(y*6.0-uTime*0.7)-0.5)); a+=scan*0.12*(1.0-y); gl_FragColor=vec4(uCol*a,a); }`,
  }));
  const column = new THREE.Mesh(D(new THREE.CylinderGeometry(2.1, 2.9, HERO_Y + 0.3, 48, 1, true)), pedMat);
  column.position.y = (HERO_Y + 0.3) / 2; group.add(column);
  const discMat = D(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uCol: { value: new THREE.Color(0x3ee6ff) }, uK: { value: 0.5 }, uTime: { value: 0 } },
    vertexShader: `varying vec2 vUv; void main(){ vUv=uv; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `varying vec2 vUv; uniform vec3 uCol; uniform float uK,uTime;
      void main(){ vec2 d=vUv-0.5; float r=length(d)*2.0; float ang=atan(d.y,d.x);
        float ring=smoothstep(0.03,0.0,abs(r-0.92))+smoothstep(0.02,0.0,abs(r-0.6))*0.6;
        float ticks=step(0.7,fract(ang/6.2831853*36.0+uTime*0.1))*smoothstep(0.86,0.88,r)*(1.0-smoothstep(0.90,0.91,r));
        float sweep=pow(max(0.0,cos(ang-uTime*1.5)),24.0)*smoothstep(1.0,0.2,r)*0.5;
        float glow=smoothstep(1.0,0.0,r)*0.18*(0.6+uK);
        float a=(ring*0.9+ticks*0.8+sweep+glow)*(0.6+0.5*uK);
        gl_FragColor=vec4(uCol*a,a); }`,
  }));
  const pedDisc = new THREE.Mesh(D(new THREE.PlaneGeometry(6.4, 6.4)), discMat);
  pedDisc.rotation.x = -Math.PI / 2; pedDisc.position.y = 0.03; group.add(pedDisc);
  // hero key light (cool) + warm rim from the sun side
  const beacon = new THREE.PointLight(0x3ee6ff, 12, 26, 1.8); beacon.position.set(0, HERO_Y - 1.6, 0); group.add(beacon);

  // ---------------------------------------------------------------- lights
  const hemi = new THREE.HemisphereLight(0x3a4c8a, 0x0a0d1c, 0.7); group.add(hemi);
  const key = new THREE.DirectionalLight(0xfff1d6, 2.6); key.position.copy(SUN_D).multiplyScalar(20).add(new THREE.Vector3(0, 6, 0)); group.add(key);
  const fill = new THREE.DirectionalLight(0x9ec8ff, 0.7); fill.position.set(8, 6, 9); group.add(fill);
  // planet bounce: cool-blue light from below/behind so the hull's belly and wing undersides are not black plates
  const bounce = new THREE.DirectionalLight(0x5f8fe0, 0.9); bounce.position.set(3, -4, -8); group.add(bounce);
  // warm rim from the sun side low, catches the wing edges and canopy frame (the Star Fox 'edge light')
  const rim = new THREE.DirectionalLight(0xffb070, 1.1); rim.position.set(-9, 2, -4); group.add(rim);

  // ---------------------------------------------------------------- particles
  const PN = 900;
  const pPos = new Float32Array(PN * 3), pVel = new Float32Array(PN * 3), pLife = new Float32Array(PN), pCol = new Float32Array(PN * 3), pSize = new Float32Array(PN);
  const pGeo = D(new THREE.BufferGeometry());
  pGeo.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
  pGeo.setAttribute('color', new THREE.BufferAttribute(pCol, 3));
  pGeo.setAttribute('aSize', new THREE.BufferAttribute(pSize, 1));
  pGeo.setAttribute('aLife', new THREE.BufferAttribute(pLife, 1));
  const pMat = D(new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uPx: { value: renderer.getPixelRatio() * ctx.size.y / 720 } },
    vertexShader: `attribute float aSize; attribute float aLife; varying vec3 vC; varying float vA; uniform float uPx;
      void main(){ vC=color; vA=smoothstep(0.0,0.15,aLife)*smoothstep(0.0,0.6,aLife); vec4 mv=modelViewMatrix*vec4(position,1.0);
        gl_PointSize = aSize*uPx*220.0/(-mv.z); gl_Position=projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 d=gl_PointCoord-0.5; float r=length(d)*2.0; float a=exp(-r*r*4.0)*(1.0-r); gl_FragColor=vec4(vC*a*vA*1.0, a*vA); }`,
    vertexColors: true,
  }));
  const particles = new THREE.Points(pGeo, pMat); particles.name = 'particles'; group.add(particles);
  let pHead = 0;
  for (let i = 0; i < 300; i++) {
    const a = Math.random() * 6.283, r = 3 + Math.random() * 30;
    pPos.set([Math.cos(a) * r, Math.random() * 10, Math.sin(a) * r], i * 3);
    pVel.set([0, 0.1 + Math.random() * 0.15, 0], i * 3);
    pLife[i] = 99; pSize[i] = 0.05 + Math.random() * 0.08;
    tmpC.setHSL(0.55 + Math.random() * 0.15, 0.6, 0.7); pCol.set([tmpC.r, tmpC.g, tmpC.b], i * 3);
  }
  function burst(n, speed, hue, spread = 1, y = HERO_Y, size = 0.2, x = 0, z = 0) {
    for (let k = 0; k < n; k++) {
      const i = 300 + (pHead++ % (PN - 300));
      const th = Math.random() * 6.283, ph = (Math.random() - 0.5) * Math.PI * spread;
      const s = speed * (0.5 + Math.random());
      pPos.set([x, y, z], i * 3);
      pVel.set([Math.cos(th) * Math.cos(ph) * s, Math.sin(ph) * s * 0.8, Math.sin(th) * Math.cos(ph) * s], i * 3);
      pLife[i] = 0.7 + Math.random() * 0.9; pSize[i] = size * (0.6 + Math.random());
      tmpC.setHSL(hue + (Math.random() - 0.5) * 0.08, 0.9, 0.55 + Math.random() * 0.3); pCol.set([tmpC.r, tmpC.g, tmpC.b], i * 3);
    }
  }

  // ---------------------------------------------------------------- laser bolts from the Arwing's cannons
  const boltGeo = D(new THREE.CapsuleGeometry(0.05, 1.5, 4, 8)); boltGeo.rotateX(Math.PI / 2);
  const boltCoreGeo = D(new THREE.CapsuleGeometry(0.02, 1.3, 3, 6)); boltCoreGeo.rotateX(Math.PI / 2);
  const boltMat = D(new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 1.3, 0.7) }));
  const boltCoreMat = D(new THREE.MeshBasicMaterial({ color: new THREE.Color(1.2, 1.5, 1.3) }));
  const bolts = [];
  for (let i = 0; i < 12; i++) {
    const b = new THREE.Mesh(boltGeo, boltMat); b.add(new THREE.Mesh(boltCoreGeo, boltCoreMat)); b.visible = false; group.add(b);
    bolts.push({ m: b, t: 99, v: new THREE.Vector3() });
  }
  const fwd = new THREE.Vector3();
  function fireBolts(charged) {
    boltMat.color.setRGB(...(charged ? [0.7, 1.4, 0.3] : [0.25, 1.3, 0.7]));
    ship.rig.getWorldDirection(fwd); fwd.multiplyScalar(-1);   // nose is -Z
    for (let k = 0; k < 2; k++) {
      const b = bolts.find((x) => !x.m.visible) ?? bolts[0];
      b.m.visible = true; b.t = 0;
      ship.rig.localToWorld(b.m.position.copy(ship.muzzles[k]));
      b.v.copy(fwd).multiplyScalar(60);
      b.m.lookAt(tmpV.copy(b.m.position).add(b.v));
      b.m.scale.setScalar(charged ? 1.8 : 1);
      burst(4, 3, 0.45, 0.4, b.m.position.y, 0.08, b.m.position.x, b.m.position.z);
    }
  }

  // ---------------------------------------------------------------- state / hit reactions (all springs audio-time, clamped)
  const shocks = deckMat.uniforms.uShock.value; let shockHead = 0;
  const punch = makeSpring(1, { k: 160, c: 10, min: 0.8, max: 1.35, vmax: 5 });      // pedestal / halo pulse
  const bob = makeSpring(0, { k: 120, c: 9, min: -0.35, max: 0.35, vmax: 3 });        // ship vertical punch
  const camZ = makeSpring(0, { k: 90, c: 8, min: -1.5, max: 1.5, vmax: 6 });
  const camRoll = makeSpring(0, { k: 40, c: 5, min: -1.2, max: 1.2, vmax: 6 });
  const camFov = makeSpring(0, { k: 60, c: 7, min: -14, max: 14, vmax: 80 });
  const barrel = { a: 0, v: 0, going: false };
  let flash = 0, thrustBoost = 0, bankKick = 0;
  // palette state (RGB-lerped)
  const palSong = new THREE.Color(PALETTES.main.song), palAccent = new THREE.Color(PALETTES.main.accent);
  const palNebA = new THREE.Vector3().fromArray(PALETTES.main.nebA), palNebB = new THREE.Vector3().fromArray(PALETTES.main.nebB);
  const tgtSong = palSong.clone(), tgtAccent = palAccent.clone(), tgtNebA = palNebA.clone(), tgtNebB = palNebB.clone();
  const shockCols = deckMat.uniforms.uShockCol.value;
  const shock = (strength, col) => { const i = shockHead++ % 4; shocks[i].set(audio.synth.now(), strength, 0, 0); shockCols[i].copy(col); };
  const C_BOOM = new THREE.Color(0xff7a2a), C_ALARM = new THREE.Color(0xff2a4a), C_ROLL = new THREE.Color(0x7dffb0), C_HIT = new THREE.Color(0xff9cf0), C_UI = new THREE.Color(0x9ad7ff), C_LASER = new THREE.Color(0x4cf0ff);
  const hueOf = (c) => { const h = { h: 0, s: 0, l: 0 }; c.getHSL(h); return h.h; };
  const pendings = [];
  const STALE = 0.15;   // hits whose moment passed more than this long ago are skipped (renderer stalled)
  audio.synth.onHit((kind, strength, t) => {
    strength = Math.min(1.5, Math.max(0, strength || 0));
    const go = () => {
      const songHue = hueOf(palSong);
      if (kind === 'timpani') { punch.kick(2.2 * strength); bob.kick(-0.9 * strength); camZ.kick(0.5 * strength); if (strength > 0.9) shock(0.35 * strength, palSong); burst(6, 3, songHue, 0.6, 0.5, 0.14); }
      else if (kind === 'snare') { punch.kick(0.8 * strength); }
      else if (kind === 'crash') { burst(70, 4, songHue + 0.04, 1.2); flash = Math.max(flash, 0.22); shock(0.7, palSong); }
      else if (kind === 'boom') { burst(Math.floor(50 * strength + 24), 5 + 4 * strength, 0.06, 1.3); flash = Math.max(flash, 0.35 * strength); camZ.kick(2.5 * strength); camRoll.kick((Math.random() - 0.5) * 0.5 * strength); shock(Math.min(1.2, strength), C_BOOM); punch.kick(3 * strength); bob.kick(1.2 * strength); }
      else if (kind === 'laser') { fireBolts(strength > 0.9); bob.kick(-0.25); }
      else if (kind === 'boost') { camFov.kick(50 * strength); thrustBoost = 1; burst(40, 9, 0.08, 0.25, HERO_Y - 0.3, 0.16, 0, 2.2); }
      else if (kind === 'roll') { barrel.going = true; camRoll.kick(1.2); burst(30, 5, 0.38, 1.6, HERO_Y, 0.12); }
      else if (kind === 'hit') { flash = Math.max(flash, 0.25); camRoll.kick(0.5); bankKick += 0.8; burst(20, 4, 0.9, 1.5, HERO_Y, 0.1); }
      else if (kind === 'alarm') { shock(0.7, C_ALARM); }
      else if (kind === 'ui') { burst(14, 2.5, 0.55, 2, HERO_Y + 1.2, 0.09); }
    };
    const now = audio.synth.now();
    if (t <= now + 0.02) { if (now - t < STALE) go(); }
    else pendings.push({ at: t, go });
  });

  // camera rig
  camera.fov = 46; camera.near = 0.1; camera.far = 900; camera.updateProjectionMatrix();
  let orbit = 0.9, lastNow = audio.synth.now();

  function setPalette(name) {
    const p = PALETTES[name] ?? PALETTES.idle;
    tgtSong.set(p.song); tgtAccent.set(p.accent); tgtNebA.fromArray(p.nebA); tgtNebB.fromArray(p.nebB);
  }
  const setSongHue = (h) => setPalette(h < 0.3 ? 'battle' : 'main');   // legacy hook

  function update(dt, t) {
    const now = audio.synth.now();
    // audio-time step: what the ear experienced since the last frame (falls back to dt if the clock is parked)
    const dta = now > lastNow ? Math.min(0.5, now - lastNow) : Math.min(0.1, dt); lastNow = now;
    for (let i = pendings.length - 1; i >= 0; i--) {
      const p = pendings[i];
      if (p.at <= now + 0.005) { if (now - p.at < STALE) p.go(); pendings.splice(i, 1); }
    }
    if (pendings.length > 64) pendings.splice(0, pendings.length - 64);
    const kPal = Math.min(1, dt * 1.6);
    palSong.lerp(tgtSong, kPal); palAccent.lerp(tgtAccent, kPal); palNebA.lerp(tgtNebA, kPal); palNebB.lerp(tgtNebB, kPal);
    const songHue = hueOf(palSong);
    const seq = audio.seq;
    const pulse = seq.song ? seq.pulse : 0;
    const beatPulse = Math.pow(pulse, 3);
    const bass = Math.min(1.0, audio.synth.bass * autoGain * 1.4), energy = Math.min(1.0, audio.synth.energy * autoGain * 2.5);
    accentCol.copy(palAccent); songCol.copy(palSong);

    // springs
    punch.step(dta); bob.step(dta); camZ.step(dta); camRoll.step(dta); camFov.step(dta);

    // sky / deck uniforms
    skyMat.uniforms.uTime.value = t; skyMat.uniforms.uNebA.value.copy(palNebA); skyMat.uniforms.uNebB.value.copy(palNebB); skyMat.uniforms.uEnergy.value = energy;
    deckMat.uniforms.uTime.value = now; deckMat.uniforms.uBeat.value = beatPulse; deckMat.uniforms.uColA.value.copy(palAccent); deckMat.uniforms.uColB.value.copy(palSong);
    barMat.uniforms.uTime.value = t; reflMat.uniforms.uTime.value = t;
    deckMat.uniforms.uCam.value.copy(camera.position);
    planet.update(dt, t);

    // blades: two-tone (accent in the bass, song hue in the treble), peak-hold white tips
    const spec = audio.synth.spectrum;
    const data = specTex.image.data;
    // normalise against a slowly-decaying running peak so the ring stays spiky (never a uniform white wall in a tutti)
    let mx = 0, mean = 0; for (let i = 0; i < BINS; i++) { if (spec[i] > mx) mx = spec[i]; mean += spec[i]; } mean /= BINS;
    peakTrack = Math.max(mx, peakTrack * Math.exp(-dt * 0.35), 0.25);
    autoGain = 1 / peakTrack;
    // broadband bursts (explosions) flatten the spectrum: read them as a mid-height carpet, not a wall
    const flat = THREE.MathUtils.smoothstep(mean / Math.max(1e-3, mx), 0.45, 0.85);
    const flatScale = 1 - 0.65 * flat;
    // frame-rate independent attack/release (fast up, slow down) so shape survives slow frames
    const kUp = 1 - Math.exp(-dt * 28), kDn = 1 - Math.exp(-dt * 7);
    for (let i = 0; i < BINS; i++) {
      // local-contrast: subtract a wide neighbourhood mean so a dense tutti still shows the peaks as peaks
      let nb = 0; for (let k = -5; k <= 5; k++) nb += spec[Math.max(0, Math.min(BINS - 1, i + k))]; nb /= 11;
      const contrast = Math.max(0, spec[i] - 0.5 * nb);
      let target = Math.min(1, contrast * autoGain * 1.6);
      // broadband burst: break the flat carpet into a textured skyline (deterministic per-bin comb) rather than a wall
      target = Math.pow(target, 1.15) * flatScale * (1 - flat * 0.6 * (((i * 7 + 3) % 5) / 4));
      // silence the very top octave a little: the FFT there is mostly cymbal wash / reverb tail
      target *= 1 - 0.25 * THREE.MathUtils.smoothstep(i / BINS, 0.8, 1.0);
      barLevel[i] += (target - barLevel[i]) * (target > barLevel[i] ? kUp : kDn);
      const lvl = barLevel[i];
      barPeak[i] = Math.max(lvl, barPeak[i] - dt * 0.9);
      const a = (i / BINS) * Math.PI * 2 - Math.PI;
      const h = 0.08 + lvl * 2.0;
      tmpP.set(Math.cos(a) * RING_R, 0, Math.sin(a) * RING_R);
      tmpQ.setFromAxisAngle(Y_AXIS, -a);
      tmpS.set(1, h, 1);
      tmpM.compose(tmpP, tmpQ, tmpS); bars.setMatrixAt(i, tmpM);
      const k = i / BINS;
      const mixK = THREE.MathUtils.smoothstep(k, 0.28, 0.42);   // bass = accent, treble = song hue (RGB blend, no lime pass-through)
      tmpC.copy(accentCol).lerp(songCol, mixK).multiplyScalar(0.28 + lvl * 0.5 + beatPulse * 0.06 + (barPeak[i] - lvl) * 0.25);
      bars.setColorAt(i, tmpC);
      data[i * 4] = Math.min(255, lvl * 230); data[i * 4 + 1] = mixK * 255; data[i * 4 + 2] = 0; data[i * 4 + 3] = 255;
    }
    bars.instanceMatrix.needsUpdate = true; bars.instanceColor.needsUpdate = true; specTex.needsUpdate = true;

    // waveform halo
    // waveform halo: circular oscilloscope. Circularly box-smoothed and temporally eased so it reads as a
    // breathing ring with a clean wave riding on it, never a scribble.
    const wave = audio.synth.wave; const R = 4.6 * punch.s;
    const kW = 1 - Math.exp(-dt * 14);
    for (let i = 0; i < WN; i++) {
      let acc = 0; for (let k = -4; k <= 4; k++) acc += wave[(i + k + WN) % WN]; acc /= 9;
      const target = Math.max(-1, Math.min(1, acc * 0.5));
      waveSmooth[i] += (target - waveSmooth[i]) * kW;
    }
    for (let i = 0; i <= WN; i++) {
      const kk = i % WN; const a = (i / WN) * Math.PI * 2;
      const w = waveSmooth[kk];
      const r = R + w * 0.32 + Math.sin(a * 3 + t * 0.7) * 0.04;
      wavePos[i * 3] = Math.cos(a) * r; wavePos[i * 3 + 1] = w * 0.22 + Math.sin(a * 2 + t) * 0.06; wavePos[i * 3 + 2] = Math.sin(a) * r;
      tmpC.copy(palSong).lerp(WHITE, Math.abs(w) * 0.35).multiplyScalar(0.3 + Math.abs(w) * 0.45 + energy * 0.15);
      waveCol[i * 3] = tmpC.r; waveCol[i * 3 + 1] = tmpC.g; waveCol[i * 3 + 2] = tmpC.b;
    }
    waveGeo.setPositions(wavePos); waveGeo.setColors(waveCol);
    waveMat.resolution.set(ctx.size.x, ctx.size.y);
    halo.rotation.y = t * 0.15; halo2.rotation.y = -t * 0.11;

    // hero: Arwing slowly turning on the pedestal, banking with the music, barrel-rolling on Q/E
    thrustBoost = Math.max(0, thrustBoost - dt * 0.9);
    bankKick *= Math.exp(-dt * 3);
    ship.setThrust(Math.min(1, 0.35 + bass * 0.5 + thrustBoost));
    ship.setBank(Math.sin(t * 0.6) * 0.35 + Math.sin(t * 1.7) * 0.1 + bankKick * Math.sin(t * 9));
    ship.flap(-0.2 + thrustBoost * 0.7);
    if (barrel.going) { barrel.v += (Math.PI * 2 - barrel.a) * 60 * dt; barrel.v *= Math.exp(-dt * 7); barrel.a += barrel.v * dt; if (barrel.a > Math.PI * 2 - 0.02) { barrel.a = 0; barrel.v = 0; barrel.going = false; } }
    // nose (-Z) swings toward the camera side (+Z): always a 3/4-front hero angle, never a tail-on blob
    hero.rotation.set(0, Math.PI + 0.3 + Math.sin(t * 0.19) * 0.6, barrel.a, 'YXZ');
    hero.position.y = HERO_Y + Math.sin(t * 0.8) * 0.12 + bob.s;
    ship.update(dt, t, camera);
    for (let i = 0; i < gyro.length; i++) gyro[i].scale.setScalar(punch.s * (1 + bass * 0.05));
    gyro[0].rotation.z += dt * (0.35 + bass * 1.2); gyro[1].rotation.z -= dt * (0.25 + energy * 0.8);
    tmpC.copy(palSong).lerp(WHITE, 0.15);
    beacon.color.copy(tmpC); beacon.intensity = 7 + bass * 9 + flash * 8; beacon.position.set(0, hero.position.y - 1.5, 0);
    ringMat.emissive.copy(tmpC).multiplyScalar(0.25 + bass * 0.3);
    stripMat.color.copy(tmpC).multiplyScalar(Math.min(1.1, 0.7 + beatPulse * 0.4 + bass * 0.3));
    underMat.uniforms.uCol.value.copy(tmpC); underMat.uniforms.uK.value = beatPulse + bass;
    pedMat.uniforms.uCol.value.copy(tmpC); pedMat.uniforms.uK.value = beatPulse * 0.5 + bass * 0.6 + (punch.s - 1) * 2; pedMat.uniforms.uTime.value = t;
    discMat.uniforms.uCol.value.copy(tmpC); discMat.uniforms.uK.value = beatPulse * 0.6 + bass * 0.6 + (punch.s - 1) * 2; discMat.uniforms.uTime.value = t;
    pedDisc.scale.setScalar(punch.s);
    deckMat.uniforms.uShip.value.copy(hero.position); deckMat.uniforms.uShipCol.value.copy(tmpC).multiplyScalar(0.5 + bass * 0.5 + flash * 0.6);
    railMat.emissive.copy(tmpC).multiplyScalar(0.2 + beatPulse * 0.3);
    grade.uniforms.uFlash.value = Math.min(0.18, flash * flash * 0.35); grade.uniforms.uTime.value = t; grade.uniforms.uAspect.value = ctx.size.x / ctx.size.y;
    flash = Math.max(0, flash - dt * 2.2);

    // particles
    for (let i = 0; i < PN; i++) {
      if (i < 300) {
        pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; if (pPos[i * 3 + 1] > 11) pPos[i * 3 + 1] = 0;
        pLife[i] = 0.35 + 0.25 * Math.sin(t * 1.3 + i);
        continue;
      }
      if (pLife[i] <= 0) continue;
      pLife[i] -= dt;
      pVel[i * 3] *= Math.exp(-dt * 1.6); pVel[i * 3 + 1] = pVel[i * 3 + 1] * Math.exp(-dt * 1.6) - 2.2 * dt; pVel[i * 3 + 2] *= Math.exp(-dt * 1.6);
      pPos[i * 3] += pVel[i * 3] * dt; pPos[i * 3 + 1] += pVel[i * 3 + 1] * dt; pPos[i * 3 + 2] += pVel[i * 3 + 2] * dt;
      if (pPos[i * 3 + 1] < 0.02) { pPos[i * 3 + 1] = 0.02; pVel[i * 3 + 1] *= -0.4; }
      if (pLife[i] <= 0) pLife[i] = 0;
    }
    pGeo.attributes.position.needsUpdate = true; pGeo.attributes.aLife.needsUpdate = true; pGeo.attributes.color.needsUpdate = true; pGeo.attributes.aSize.needsUpdate = true;

    // bolts
    for (const b of bolts) {
      if (!b.m.visible) continue;
      b.t += dt; b.m.position.addScaledVector(b.v, dt);
      if (b.t > 0.6) b.m.visible = false;
    }

    // camera: slow orbit sweeping the planet-facing side + spring kicks (dolly, roll, fov)
    orbit = Math.PI / 2 + 0.08 + Math.sin(t * 0.11) * 0.7;
    const rad = 13.6 - camZ.s * 0.3 - beatPulse * 0.06;
    const camY = 5.1 + Math.sin(t * 0.31) * 0.4;
    camera.position.set(Math.cos(orbit) * rad, camY, Math.sin(orbit) * rad);
    camera.up.set(Math.sin(camRoll.s * 0.15), Math.cos(camRoll.s * 0.15), 0);
    // aim a little lower than before so the deck ring sits higher in frame, clear of the soundboard strip
    camera.lookAt(0, 2.3, 0);
    camera.fov = 46 + camFov.s * 0.25; camera.updateProjectionMatrix();
  }

  function dispose() {
    scene.remove(group); scene.environment = null; scene.fog = null;
    for (const d of disposables) d.dispose?.();
    ship.dispose(); planet.disposePlanet?.();
    envRT.dispose(); nebRT.dispose(); waveGeo.dispose();
    if (ownGrade) { composer.removePass(grade); grade.dispose?.(); } else grade.uniforms.uFlash.value = 0;
  }

  return { update, dispose, setSongHue, setPalette, burst };
}
