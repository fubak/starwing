/**
 * Audio Lab stage: nebula sky, glossy deck with reactive light, 96-bar spectrum
 * ring, waveform halo, chrome core with gyro rings, particle bursts.
 */
import * as THREE from 'three';
import { Line2 } from 'three/addons/lines/Line2.js';
import { LineGeometry } from 'three/addons/lines/LineGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';

const NOISE_GLSL = /* glsl */`
  vec3 hash3(vec3 p){ p=fract(p*vec3(443.897,441.423,437.195)); p+=dot(p,p.yzx+19.19); return fract((p.xxy+p.yzz)*p.zyx); }
  float hash(vec3 p){ return hash3(p).x; }
  float vnoise(vec3 p){ vec3 i=floor(p); vec3 f=fract(p); f=f*f*(3.0-2.0*f);
    return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
               mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
  float fbm(vec3 p){ float a=0.5,s=0.0; for(int i=0;i<5;i++){ s+=a*vnoise(p); p=p*2.03+vec3(1.7,9.2,3.1); a*=0.5; } return s; }
`;

export function createStage(ctx, audio) {
  const { scene, camera, bloom, renderer } = ctx;
  const group = new THREE.Group();
  scene.add(group);
  const disposables = [];
  const D = (o) => (disposables.push(o), o);

  const PAL = {
    bg: new THREE.Color(0x040816),
    cyan: new THREE.Color(0x3ee6ff),
    gold: new THREE.Color(0xffb347),
    magenta: new THREE.Color(0xff3d9a),
    violet: new THREE.Color(0x6a4cff),
  };

  scene.fog = new THREE.FogExp2(0x060a1c, 0.028);
  bloom.strength = 1.05; bloom.radius = 0.55; bloom.threshold = 0.5;
  renderer.toneMappingExposure = 1.05;

  // ---------------------------------------------------------------- sky
  // The expensive fbm nebula is baked ONCE into an equirect mask texture (R: nebula A, G: nebula B, B: highlights),
  // then colourised per-frame by a cheap shader so hue can follow the song.
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
          gl_FragColor = vec4(band*(1.0-n2), band*n2, smoothstep(0.55,0.9,n2)*band, 1.0);
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
    uniforms: { uTime: { value: 0 }, uHue: { value: 0.55 }, uEnergy: { value: 0 }, uNeb: { value: nebRT.texture } },
    vertexShader: `varying vec3 vDir; void main(){ vDir=normalize(position); gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
    fragmentShader: `
      varying vec3 vDir; uniform float uTime; uniform float uHue; uniform float uEnergy; uniform sampler2D uNeb;
      vec3 hsv(float h,float s,float v){ vec3 c=clamp(abs(mod(h*6.0+vec3(0,4,2),6.0)-3.0)-1.0,0.0,1.0); return v*mix(vec3(1.0),c,s); }
      vec3 hash3(vec3 p){ p=fract(p*vec3(443.897,441.423,437.195)); p+=dot(p,p.yzx+19.19); return fract((p.xxy+p.yzz)*p.zyx); }
      void main(){
        vec3 d=vDir; float up=d.y;
        // deep gradient
        vec3 col = mix(vec3(0.035,0.05,0.13), vec3(0.008,0.01,0.03), smoothstep(-0.1,0.7,up));
        // nebula (baked masks, live colour)
        vec2 uv = vec2(atan(d.z,d.x)/6.2831853+0.5 + uTime*0.0015, asin(clamp(up,-1.0,1.0))/3.14159265+0.5);
        vec3 m = texture2D(uNeb, uv).rgb;
        vec3 nebA = hsv(uHue, 0.75, 1.0) * vec3(0.55,0.6,0.8);
        vec3 nebB = hsv(uHue+0.45, 0.7, 1.0);
        col += (m.r*nebA + m.g*nebB) * 0.55;
        col += m.b * vec3(0.9,0.7,1.0) * 0.25;
        // warm horizon glow (a sun just below the deck, behind)
        float horiz = exp(-abs(up+0.02)*9.0);
        float sunDir = pow(max(0.0, dot(normalize(vec3(d.x,0.0,d.z)), vec3(0.3,0.0,-1.0))), 3.0);
        col += horiz * (vec3(0.25,0.12,0.06) + sunDir*vec3(1.0,0.45,0.15)*0.9);
        // stars
        vec3 sp = d*260.0; vec3 cell=floor(sp); vec3 h=hash3(cell);
        float star = smoothstep(0.985,1.0,1.0-length(fract(sp)-0.5-(h-0.5)*0.4)) ;
        star *= step(0.93, h.y) * (0.6+0.4*sin(uTime*2.0+h.z*30.0));
        col += star * (1.2+uEnergy*1.5) * mix(vec3(0.7,0.8,1.0), vec3(1.0,0.85,0.7), h.z) * smoothstep(-0.05,0.2,up);
        gl_FragColor=vec4(col,1.0);
      }`,
  }));
  const sky = new THREE.Mesh(D(new THREE.SphereGeometry(400, 48, 32)), skyMat);
  group.add(sky);

  // environment map from the sky itself for consistent specular
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envScene = new THREE.Scene(); envScene.add(new THREE.Mesh(new THREE.SphereGeometry(50, 32, 16), skyMat));
  const envRT = pmrem.fromScene(envScene, 0.04);
  scene.environment = envRT.texture;
  pmrem.dispose();

  // cheap baked noise for the deck panels
  const NZ = 256, nzData = new Uint8Array(NZ * NZ * 4);
  for (let y = 0; y < NZ; y++) for (let x = 0; x < NZ; x++) {
    let v = 0, a = 0.5, f = 1 / 32;
    for (let o = 0; o < 4; o++) { v += a * (0.5 + 0.5 * Math.sin(x * f * 6.28 + Math.sin(y * f * 4.1 + o * 1.7) * 2.3 + o) * Math.cos(y * f * 6.28 * 0.77 + Math.sin(x * f * 5.3) * 1.9)); a *= 0.5; f *= 2; }
    const i = (y * NZ + x) * 4; nzData[i] = nzData[i + 1] = nzData[i + 2] = Math.floor(Math.min(1, v) * 255); nzData[i + 3] = 255;
  }
  const noiseTex = D(new THREE.DataTexture(nzData, NZ, NZ, THREE.RGBAFormat)); noiseTex.wrapS = noiseTex.wrapT = THREE.RepeatWrapping; noiseTex.magFilter = noiseTex.minFilter = THREE.LinearFilter; noiseTex.needsUpdate = true;

  // ---------------------------------------------------------------- deck
  const BINS = audio.synth.BINS;
  const specTex = D(new THREE.DataTexture(new Uint8Array(BINS * 4), BINS, 1, THREE.RGBAFormat));
  specTex.magFilter = THREE.LinearFilter; specTex.needsUpdate = true;
  const RING_R = 6.2;
  const deckMat = D(new THREE.ShaderMaterial({
    fog: true, transparent: false,
    uniforms: THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
      uTime: { value: 0 }, uSpec: { value: specTex }, uRing: { value: RING_R }, uBeat: { value: 0 },
      uHue: { value: 0.55 }, uShock: { value: [0, 0, 0, 0].map(() => new THREE.Vector4(-10, 0, 0, 0)) }, uCam: { value: new THREE.Vector3() }, uNoise: { value: noiseTex },
    }]),
    vertexShader: `#include <fog_pars_vertex>
      varying vec3 vW;
      void main(){
        vec4 w=modelMatrix*vec4(position,1.0); vW=w.xyz; vec4 mvPosition=viewMatrix*w; gl_Position=projectionMatrix*mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: `#include <fog_pars_fragment>
      varying vec3 vW; uniform float uTime,uRing,uBeat,uHue; uniform sampler2D uSpec; uniform sampler2D uNoise; uniform vec4 uShock[4]; uniform vec3 uCam;
      vec3 hsv(float h,float s,float v){ vec3 c=clamp(abs(mod(h*6.0+vec3(0,4,2),6.0)-3.0)-1.0,0.0,1.0); return v*mix(vec3(1.0),c,s); }
      void main(){
        float r=length(vW.xz); float ang=atan(vW.z,vW.x);
        vec3 base = vec3(0.012,0.018,0.04);
        // brushed panel texture
        float pan = texture2D(uNoise, vW.xz*0.04).r;
        base *= 0.8+0.5*pan;
        // concentric + radial grid
        float rings = smoothstep(0.96,1.0, abs(fract(r*0.5)-0.5)*2.0);
        float spokes = smoothstep(0.985,1.0, abs(fract(ang/6.2831853*24.0)-0.5)*2.0);
        float grid = max(rings*0.7, spokes*0.4) * exp(-r*0.06);
        vec3 gridCol = hsv(uHue,0.6,1.0);
        vec3 col = base + grid*gridCol*(0.10+0.12*uBeat);
        // spectrum reflection glow under the ring of bars
        float u = fract((ang/6.2831853)+0.5);
        float lvl = texture2D(uSpec, vec2(u,0.5)).r;
        float hue = texture2D(uSpec, vec2(u,0.5)).g;
        float near = exp(-pow((r-uRing)/ (0.9+lvl*1.6),2.0));
        vec3 barCol = hsv(hue, 0.85, 1.0);
        col += barCol * near * lvl * 0.9;
        // inner core pool
        col += hsv(uHue,0.5,1.0) * exp(-r*0.9) * (0.25+0.5*uBeat);
        // beat shockwaves
        for(int i=0;i<4;i++){ float age=uTime-uShock[i].x; if(age>0.0 && age<2.2){ float rr=age*9.0; float w=exp(-pow((r-rr)/0.35,2.0)); col += hsv(uShock[i].z,0.7,1.0)*w*uShock[i].y*(1.0-age/2.2)*0.9; } }
        // gloss: fresnel toward the horizon reflects nebula/sun
        vec3 V=normalize(uCam-vW); float fres=pow(1.0-max(0.0,V.y),4.0);
        col += fres * (vec3(0.10,0.07,0.06) + hsv(uHue,0.5,1.0)*0.05);
        gl_FragColor=vec4(col,1.0);
        #include <fog_fragment>
      }`,
  }));
  const deck = new THREE.Mesh(D(new THREE.CircleGeometry(120, 96)), deckMat);
  deck.rotation.x = -Math.PI / 2; deck.position.y = -0.01;
  group.add(deck);

  // ---------------------------------------------------------------- spectrum ring
  const barGeo = D(new THREE.BoxGeometry(0.2, 1, 0.42, 1, 1, 1)); barGeo.translate(0, 0.5, 0);
  const barMat = D(new THREE.MeshPhysicalMaterial({ color: 0xffffff, metalness: 0.55, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.15, envMapIntensity: 1.2 }));
  barMat.onBeforeCompile = (sh) => {
    sh.uniforms.uEm = { value: 1.0 };
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uEm;')
      .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\n#ifdef USE_INSTANCING_COLOR\n totalEmissiveRadiance += vColor * uEm;\n#endif');
  };
  const bars = new THREE.InstancedMesh(barGeo, barMat, BINS);
  bars.instanceColor = new THREE.InstancedBufferAttribute(new Float32Array(BINS * 3), 3);
  group.add(bars);
  const barHue = (i) => 0.08 + (i / BINS) * 0.52;   // gold -> magenta? no: gold(0.08) -> cyan(0.6)
  const Y_AXIS = new THREE.Vector3(0, 1, 0);
  const tmpM = new THREE.Matrix4(), tmpQ = new THREE.Quaternion(), tmpP = new THREE.Vector3(), tmpS = new THREE.Vector3(), tmpC = new THREE.Color();
  const barLevel = new Float32Array(BINS);

  // ---------------------------------------------------------------- waveform halo
  const WN = audio.synth.WAVE_N;
  const waveGeo = new LineGeometry();
  const wavePos = new Float32Array((WN + 1) * 3), waveCol = new Float32Array((WN + 1) * 3);
  waveGeo.setPositions(wavePos); waveGeo.setColors(waveCol);
  const waveMat = D(new LineMaterial({ vertexColors: true, linewidth: 3.5, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, worldUnits: false }));
  waveMat.resolution.set(ctx.size.x, ctx.size.y);
  const halo = new Line2(waveGeo, waveMat); halo.position.y = 2.6; group.add(halo);
  const halo2 = new Line2(waveGeo, waveMat); halo2.position.y = 2.6; halo2.rotation.z = Math.PI; halo2.scale.set(0.82, 0.82, 0.82); group.add(halo2);

  // ---------------------------------------------------------------- core
  const core = new THREE.Group(); core.position.y = 2.6; group.add(core);
  const coreMat = D(new THREE.MeshPhysicalMaterial({ color: 0x1a2a55, metalness: 1, roughness: 0.12, envMapIntensity: 1.6, clearcoat: 1 }));
  const coreMesh = new THREE.Mesh(D(new THREE.IcosahedronGeometry(1.1, 1)), coreMat);
  coreMesh.castShadow = false; core.add(coreMesh);
  const wire = new THREE.LineSegments(D(new THREE.EdgesGeometry(coreMesh.geometry)), D(new THREE.LineBasicMaterial({ color: 0x9ff3ff, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending })));
  wire.scale.setScalar(1.012); core.add(wire);
  const glowMat = D(new THREE.MeshBasicMaterial({ color: 0x3ee6ff, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  const glow = new THREE.Mesh(D(new THREE.SphereGeometry(0.55, 24, 16)), glowMat); core.add(glow);
  const ringMat = D(new THREE.MeshPhysicalMaterial({ color: 0xe8f4ff, metalness: 1, roughness: 0.2, envMapIntensity: 1.4, emissive: 0x112244, emissiveIntensity: 0.6 }));
  const gyro = [];
  [[1.9, 0.045, 0.0], [2.35, 0.035, 1.05], [2.8, 0.03, 2.1]].forEach(([r, tube, tilt], i) => {
    const m = new THREE.Mesh(D(new THREE.TorusGeometry(r, tube, 10, 96)), ringMat);
    m.rotation.set(tilt, i * 0.7, 0.4 * i); core.add(m); gyro.push(m);
  });
  // beacon light
  const beacon = new THREE.PointLight(0x3ee6ff, 25, 30, 1.6); beacon.position.y = 2.6; group.add(beacon);

  // ---------------------------------------------------------------- lights
  const hemi = new THREE.HemisphereLight(0x3a4c8a, 0x0a0d1c, 0.8); group.add(hemi);
  const key = new THREE.DirectionalLight(0xbfd4ff, 1.6); key.position.set(6, 12, 4); group.add(key);
  const rim = new THREE.DirectionalLight(0xff9a4a, 1.4); rim.position.set(-6, 4, -10); group.add(rim);

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
    fragmentShader: `varying vec3 vC; varying float vA; void main(){ vec2 d=gl_PointCoord-0.5; float r=length(d)*2.0; float a=exp(-r*r*4.0)*(1.0-r); gl_FragColor=vec4(vC*a*vA*1.6, a*vA); }`,
    vertexColors: true,
  }));
  const particles = new THREE.Points(pGeo, pMat); group.add(particles);
  let pHead = 0;
  // ambient dust
  for (let i = 0; i < 300; i++) {
    const a = Math.random() * 6.283, r = 3 + Math.random() * 30;
    pPos.set([Math.cos(a) * r, Math.random() * 10, Math.sin(a) * r], i * 3);
    pVel.set([0, 0.1 + Math.random() * 0.15, 0], i * 3);
    pLife[i] = 99; pSize[i] = 0.05 + Math.random() * 0.08;
    tmpC.setHSL(0.55 + Math.random() * 0.15, 0.6, 0.7); pCol.set([tmpC.r, tmpC.g, tmpC.b], i * 3);
  }
  function burst(n, speed, hue, spread = 1, y = 2.6, size = 0.2) {
    for (let k = 0; k < n; k++) {
      const i = 300 + (pHead++ % (PN - 300));
      const th = Math.random() * 6.283, ph = (Math.random() - 0.5) * Math.PI * spread;
      const s = speed * (0.5 + Math.random());
      pPos.set([0, y, 0], i * 3);
      pVel.set([Math.cos(th) * Math.cos(ph) * s, Math.sin(ph) * s * 0.8, Math.sin(th) * Math.cos(ph) * s], i * 3);
      pLife[i] = 0.7 + Math.random() * 0.9; pSize[i] = size * (0.6 + Math.random());
      tmpC.setHSL(hue + (Math.random() - 0.5) * 0.08, 0.9, 0.55 + Math.random() * 0.3); pCol.set([tmpC.r, tmpC.g, tmpC.b], i * 3);
    }
  }

  // ---------------------------------------------------------------- laser bolts (visual echo of the twin laser)
  const boltGeo = D(new THREE.CapsuleGeometry(0.06, 1.6, 4, 8)); boltGeo.rotateX(Math.PI / 2);
  const boltMat = D(new THREE.MeshBasicMaterial({ color: 0x9df5ff }));
  const bolts = [];
  for (let i = 0; i < 12; i++) { const b = new THREE.Mesh(boltGeo, boltMat); b.visible = false; group.add(b); bolts.push({ m: b, t: 99, v: new THREE.Vector3() }); }
  function fireBolts(hueColor) {
    boltMat.color.set(hueColor);
    for (let k = 0; k < 2; k++) {
      const b = bolts.find((x) => !x.m.visible) ?? bolts[0];
      b.m.visible = true; b.t = 0;
      const side = k ? 1 : -1;
      b.m.position.set(side * 1.1, 1.0, 9); b.v.set(-side * 0.4, 0.2, -52);
      b.m.lookAt(b.m.position.clone().add(b.v));
    }
  }

  // ---------------------------------------------------------------- state / hit reactions
  const shocks = deckMat.uniforms.uShock.value; let shockHead = 0;
  const spring = { s: 1, v: 0 };        // core scale spring
  const camKick = { z: 0, v: 0, roll: 0, rv: 0, fov: 0, fv: 0 };
  let flash = 0, songHue = 0.55, hueTarget = 0.55;
  audio.synth.onHit((kind, strength, t) => {
    const now = audio.synth.now(); const delay = Math.max(0, t - now);
    const go = () => {
      if (kind === 'timpani') { spring.v += 4.5 * strength; camKick.v += 0.6 * strength; if (strength > 0.9) { shocks[shockHead++ % 4].set(audio.synth.now(), 0.35 * strength, songHue, 0); } burst(6, 3, songHue, 0.6, 0.5, 0.14); }
      else if (kind === 'snare') { spring.v += 1.2 * strength; }
      else if (kind === 'crash') { burst(90, 4, songHue + 0.1, 1.2); flash = Math.max(flash, 0.4); shocks[shockHead++ % 4].set(audio.synth.now(), 0.9, songHue, 0); }
      else if (kind === 'boom') { burst(Math.floor(60 * strength + 30), 5 + 4 * strength, 0.06, 1.3); flash = Math.max(flash, 0.6 * strength); camKick.v += 3 * strength; camKick.rv += (Math.random() - 0.5) * 0.4 * strength; shocks[shockHead++ % 4].set(audio.synth.now(), Math.min(1.5, strength), 0.06, 0); spring.v += 6 * strength; }
      else if (kind === 'laser') { fireBolts(strength > 0.9 ? 0xc0ff9a : 0x9df5ff); burst(10, 6, 0.5, 0.2, 1.0, 0.12); }
      else if (kind === 'boost') { camKick.fv += 60 * strength; burst(40, 9, 0.08, 0.25, 1.5, 0.16); }
      else if (kind === 'roll') { camKick.rv += 3.2; burst(30, 5, 0.38, 1.6, 2.6, 0.12); }
      else if (kind === 'hit') { flash = Math.max(flash, 0.25); camKick.rv += 0.6; burst(20, 4, 0.9, 1.5, 2.6, 0.1); }
      else if (kind === 'alarm') { shocks[shockHead++ % 4].set(audio.synth.now(), 0.7, 0.98, 0); }
      else if (kind === 'ui') { burst(14, 2.5, 0.55, 2, 4.0, 0.09); }
    };
    if (delay < 0.02) go(); else pendings.push({ at: t, go });
  });
  const pendings = [];

  // camera rig
  camera.fov = 48; camera.near = 0.1; camera.far = 900; camera.updateProjectionMatrix();
  let orbit = 0.9;

  function setSongHue(h) { hueTarget = h; }

  function update(dt, t) {
    const now = audio.synth.now();
    for (let i = pendings.length - 1; i >= 0; i--) if (pendings[i].at <= now + 0.005) { pendings[i].go(); pendings.splice(i, 1); }
    songHue += (hueTarget - songHue) * Math.min(1, dt * 2);
    const seq = audio.seq;
    const pulse = seq.song ? seq.pulse : 0;
    const beatPulse = Math.pow(pulse, 3);

    // sky / deck uniforms
    skyMat.uniforms.uTime.value = t; skyMat.uniforms.uHue.value = songHue; skyMat.uniforms.uEnergy.value = audio.synth.energy;
    deckMat.uniforms.uTime.value = now; deckMat.uniforms.uBeat.value = beatPulse; deckMat.uniforms.uHue.value = songHue;
    deckMat.uniforms.uCam.value.copy(camera.position);

    // bars
    const spec = audio.synth.spectrum;
    const data = specTex.image.data;
    for (let i = 0; i < BINS; i++) {
      const target = Math.min(1.4, spec[i]);
      barLevel[i] += (target - barLevel[i]) * (target > barLevel[i] ? 0.6 : 0.18);
      const lvl = barLevel[i];
      const a = (i / BINS) * Math.PI * 2 - Math.PI;   // matches deck atan mapping
      const h = 0.12 + lvl * 4.2;
      tmpP.set(Math.cos(a) * RING_R, 0, Math.sin(a) * RING_R);
      tmpQ.setFromAxisAngle(Y_AXIS, -a);
      tmpS.set(1, h, 1);
      tmpM.compose(tmpP, tmpQ, tmpS); bars.setMatrixAt(i, tmpM);
      const hue = barHue(i);
      tmpC.setHSL(hue, 0.9, 0.55).multiplyScalar(0.12 + lvl * 2.6 + beatPulse * 0.08);
      bars.setColorAt(i, tmpC);
      data[i * 4] = Math.min(255, lvl * 200); data[i * 4 + 1] = hue * 255; data[i * 4 + 2] = 0; data[i * 4 + 3] = 255;
    }
    bars.instanceMatrix.needsUpdate = true; bars.instanceColor.needsUpdate = true; specTex.needsUpdate = true;

    // waveform halo
    const wave = audio.synth.wave; const R = 3.9;
    for (let i = 0; i <= WN; i++) {
      const k = i % WN; const a = (i / WN) * Math.PI * 2;
      const w = Math.max(-1, Math.min(1, wave[k] * 0.9));
      const r = R + w * 0.75 + Math.sin(a * 3 + t * 0.7) * 0.05;
      wavePos[i * 3] = Math.cos(a) * r; wavePos[i * 3 + 1] = w * 0.55 + Math.sin(a * 2 + t) * 0.08; wavePos[i * 3 + 2] = Math.sin(a) * r;
      tmpC.setHSL(songHue + 0.05 + Math.abs(w) * 0.12, 0.85, 0.55 + Math.abs(w) * 0.4).multiplyScalar(0.7 + Math.abs(w) * 1.8 + audio.synth.energy * 0.6);
      waveCol[i * 3] = tmpC.r; waveCol[i * 3 + 1] = tmpC.g; waveCol[i * 3 + 2] = tmpC.b;
    }
    waveGeo.setPositions(wavePos); waveGeo.setColors(waveCol);
    waveMat.resolution.set(ctx.size.x, ctx.size.y);
    halo.rotation.y = t * 0.15; halo2.rotation.y = -t * 0.11;

    // core spring (anticipation-free punch with overshoot)
    spring.v += (1 - spring.s) * 140 * dt; spring.v *= Math.exp(-dt * 9); spring.s += spring.v * dt;
    const bass = audio.synth.bass;
    core.scale.setScalar(spring.s * (1 + bass * 0.12));
    core.rotation.y = t * 0.35; coreMesh.rotation.x = t * 0.2; wire.rotation.copy(coreMesh.rotation);
    gyro[0].rotation.x += dt * (0.8 + bass * 3); gyro[1].rotation.y += dt * (0.6 + audio.synth.energy * 2); gyro[2].rotation.z -= dt * 0.9;
    core.position.y = 2.6 + Math.sin(t * 0.8) * 0.12;
    tmpC.setHSL(songHue, 0.8, 0.6);
    glowMat.color.copy(tmpC).multiplyScalar(1.2 + bass * 3 + flash * 3);
    glow.scale.setScalar(0.8 + bass * 0.9 + flash * 0.6);
    beacon.color.copy(tmpC); beacon.intensity = 18 + bass * 60 + flash * 120; beacon.position.copy(core.position);
    ringMat.emissive.copy(tmpC).multiplyScalar(0.4 + bass * 0.6);
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
      if (b.t > 0.5) b.m.visible = false;
    }

    // camera: slow orbit + spring kicks (dolly, roll, fov)
    orbit += dt * 0.07;
    camKick.v += (0 - camKick.z) * 90 * dt; camKick.v *= Math.exp(-dt * 8); camKick.z += camKick.v * dt;
    camKick.rv += (0 - camKick.roll) * 40 * dt; camKick.rv *= Math.exp(-dt * 5); camKick.roll += camKick.rv * dt;
    camKick.fv += (0 - camKick.fov) * 60 * dt; camKick.fv *= Math.exp(-dt * 7); camKick.fov += camKick.fv * dt;
    const rad = 13.2 - camKick.z * 0.25 - beatPulse * 0.08;
    const camY = 4.6 + Math.sin(t * 0.31) * 0.5;
    camera.position.set(Math.cos(orbit) * rad, camY, Math.sin(orbit) * rad);
    camera.up.set(Math.sin(camKick.roll * 0.15), Math.cos(camKick.roll * 0.15), 0);
    camera.lookAt(0, 2.2, 0);
    camera.fov = 48 + camKick.fov * 0.25; camera.updateProjectionMatrix();
  }

  function dispose() {
    scene.remove(group); scene.environment = null; scene.fog = null;
    for (const d of disposables) d.dispose?.();
    envRT.dispose(); nebRT.dispose(); waveGeo.dispose();
  }

  return { update, dispose, setSongHue, burst };
}
