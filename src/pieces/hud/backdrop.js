// Space backdrop for the HUD showcase: nebula sky, star field, planet with
// atmosphere fresnel, a stand-in Arwing and a few enemy fighters to lock onto.
import * as THREE from 'three';

const NOISE = `
vec3 hash3(vec3 p){p=fract(p*vec3(443.897,441.423,437.195));p+=dot(p,p.yxz+19.19);return fract((p.xxy+p.yxx)*p.zyx);}
float noise(vec3 p){vec3 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);
 float n=mix(mix(mix(hash3(i).x,hash3(i+vec3(1,0,0)).x,f.x),mix(hash3(i+vec3(0,1,0)).x,hash3(i+vec3(1,1,0)).x,f.x),f.y),
 mix(mix(hash3(i+vec3(0,0,1)).x,hash3(i+vec3(1,0,1)).x,f.x),mix(hash3(i+vec3(0,1,1)).x,hash3(i+vec3(1,1,1)).x,f.x),f.y),f.z);return n;}
float fbm(vec3 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*noise(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=.5;}return s;}`;

/** Render an equirect fragment shader once into a texture (cheap at runtime on any GPU). */
function bakeEquirect(renderer, frag, w, h) {
  const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, depthBuffer: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter });
  const mat = new THREE.ShaderMaterial({
    vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0., 1.); }`,
    fragmentShader: `${NOISE} varying vec2 vUv;
      vec3 dirFromUv(vec2 uv){ float ph = (uv.x - 0.5) * 6.2831853; float th = (0.5 - uv.y) * 3.14159265; return vec3(cos(th)*sin(ph), sin(th), -cos(th)*cos(ph)); }
      ${frag}`,
  });
  const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), mat);
  const sc = new THREE.Scene(); sc.add(quad);
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
  const prev = renderer.getRenderTarget();
  renderer.setRenderTarget(rt); renderer.render(sc, cam); renderer.setRenderTarget(prev);
  mat.dispose(); quad.geometry.dispose();
  rt.texture.mapping = THREE.EquirectangularReflectionMapping;
  rt.texture.colorSpace = THREE.LinearSRGBColorSpace;
  return rt;
}

export function createBackdrop(ctx) {
  const { scene, camera, renderer } = ctx;
  const group = new THREE.Group(); scene.add(group);
  const disposables = [];

  // --- nebula sky (baked once)
  const skyRT = bakeEquirect(renderer, `
      void main(){ vec3 d = dirFromUv(vUv);
        float n1 = fbm(d*2.2 + vec3(3.1, 0.0, 0.0));
        float n2 = fbm(d*5.0 + vec3(0.0, 7.3, 0.0));
        float n3 = fbm(d*11.0 + vec3(4.0, 1.0, 2.0));
        float band = smoothstep(0.5, 0.92, n1) * smoothstep(0.35, 0.75, n2);
        vec3 c = vec3(0.004, 0.006, 0.02);
        c += vec3(0.02, 0.05, 0.2) * band * 1.2;
        c += vec3(0.5, 0.08, 0.3) * pow(smoothstep(0.55, 0.9, n2), 1.5) * band * 1.4;
        c += vec3(0.05, 0.4, 0.7) * pow(smoothstep(0.5, 0.95, n1*n2*2.2), 2.0) * 0.8;
        c += vec3(1.0, 0.5, 0.2) * pow(smoothstep(0.6, 0.95, n2*n3*2.5), 3.0) * band * 1.2;
        c *= 0.55 + 0.7 * smoothstep(0.3, 0.75, n3); // dust lanes
        float glow = pow(max(0., dot(d, normalize(vec3(-0.6, 0.35, -0.7)))), 12.0);
        c += vec3(1.0, 0.7, 0.45) * glow * 0.35;
        c *= 0.75 + 0.25 * smoothstep(-0.6, 0.4, d.y);
        gl_FragColor = vec4(c, 1.0); }`, 2048, 1024);
  const skyMat = new THREE.MeshBasicMaterial({ map: skyRT.texture, side: THREE.BackSide, depthWrite: false, fog: false });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 32), skyMat); sky.rotation.y = Math.PI; group.add(sky); disposables.push(sky);
  disposables.push({ traverse: (f) => f({ geometry: skyRT, material: null }) });

  // --- stars (two layers, twinkle)
  const N = 2600; const pos = new Float32Array(N * 3), sz = new Float32Array(N), ph = new Float32Array(N), col = new Float32Array(N * 3);
  const rnd = () => ctx.rng?.next?.() ?? Math.random();
  for (let i = 0; i < N; i++) {
    const v = new THREE.Vector3(rnd() - 0.5, rnd() - 0.5, rnd() - 0.5).normalize().multiplyScalar(1200);
    pos.set([v.x, v.y, v.z], i * 3); sz[i] = 1.0 + Math.pow(rnd(), 3) * 4.0; ph[i] = rnd() * 6.28;
    const warm = rnd(); const c = warm < 0.15 ? [1, 0.75, 0.55] : warm < 0.35 ? [0.75, 0.85, 1] : [1, 1, 1]; col.set(c, i * 3);
  }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); sg.setAttribute('aSize', new THREE.BufferAttribute(sz, 1)); sg.setAttribute('aPhase', new THREE.BufferAttribute(ph, 1)); sg.setAttribute('aCol', new THREE.BufferAttribute(col, 3));
  const starMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { t: { value: 0 }, pr: { value: renderer.getPixelRatio() } },
    vertexShader: `attribute float aSize; attribute float aPhase; attribute vec3 aCol; varying float vA; varying vec3 vC; uniform float t; uniform float pr;
      void main(){ vC = aCol; vA = 0.65 + 0.35*sin(t*2.0 + aPhase*7.0); vec4 mv = modelViewMatrix*vec4(position,1.); gl_PointSize = aSize * pr * 1.6; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying float vA; varying vec3 vC; void main(){ float d = length(gl_PointCoord-0.5)*2.0; float a = pow(max(0., 1.0-d), 2.2); gl_FragColor = vec4(vC*a*vA*2.2, a*vA); }`,
  });
  const stars = new THREE.Points(sg, starMat); group.add(stars); disposables.push(stars);

  // --- planet with atmosphere
  const sunDir = new THREE.Vector3(-0.6, 0.35, -0.7).normalize();
  // albedo (rgb) + clouds (a) baked once; lighting stays live
  const planetRT = bakeEquirect(renderer, `
      void main(){ vec3 p = dirFromUv(vUv);
        float lat = p.y; float cont = fbm(p*3.0+vec3(2.0)); float detail = fbm(p*9.0 + vec3(5.0));
        float land = smoothstep(0.48, 0.56, cont + detail*0.15);
        vec3 ocean = mix(vec3(0.02,0.12,0.35), vec3(0.05,0.35,0.55), detail);
        vec3 ground = mix(vec3(0.18,0.32,0.12), vec3(0.55,0.45,0.25), smoothstep(0.4,0.7,detail));
        ground = mix(ground, vec3(0.9,0.92,0.95), smoothstep(0.75, 0.95, abs(lat) + detail*0.1));
        vec3 alb = mix(ocean, ground, land);
        float cl = smoothstep(0.52, 0.72, fbm(p*5.0 + cont*0.3));
        gl_FragColor = vec4(alb, cl); }`, 2048, 1024);
  disposables.push({ traverse: (f) => f({ geometry: planetRT, material: null }) });
  const planetMat = new THREE.ShaderMaterial({
    uniforms: { t: { value: 0 }, sun: { value: sunDir }, map: { value: planetRT.texture } },
    vertexShader: `varying vec3 vN; varying vec2 vUv; varying vec3 vV; void main(){ vN = normalize(normalMatrix*normal); vUv = uv; vec4 mv = modelViewMatrix*vec4(position,1.); vV = -mv.xyz; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vN; varying vec2 vUv; varying vec3 vV; uniform float t; uniform vec3 sun; uniform sampler2D map;
      void main(){ vec3 n = normalize(vN); vec3 v = normalize(vV);
        vec4 s = texture2D(map, vUv); float cl = texture2D(map, vUv + vec2(t*0.002, 0.0)).a;
        float land = smoothstep(0.2, 0.5, s.g + s.r - s.b*1.2);
        vec3 alb = mix(s.rgb, vec3(1.0), cl*0.9);
        vec3 sunV = normalize((viewMatrix*vec4(sun,0.)).xyz);
        float nl = dot(n, sunV); float diff = smoothstep(-0.1, 0.5, nl);
        vec3 h = normalize(sunV + v); float spec = pow(max(0., dot(n,h)), 60.0) * (1.0-land) * (1.0-cl) * 0.8;
        float fres = pow(1.0 - max(0., dot(n, v)), 3.0);
        vec3 atmo = vec3(0.35, 0.6, 1.0) * fres * (0.35 + diff*1.2);
        vec3 c = alb * (diff * vec3(1.0,0.95,0.9) * 1.4 + vec3(0.02,0.04,0.09)) + spec * diff + atmo;
        c += vec3(0.9,0.5,0.25) * pow(fres, 2.0) * smoothstep(0.3, -0.2, nl) * smoothstep(-0.5, 0.0, nl) * 0.6;
        gl_FragColor = vec4(c, 1.0); }`,
  });
  const planet = new THREE.Mesh(new THREE.SphereGeometry(260, 96, 64), planetMat);
  planet.position.set(-420, -120, -900); group.add(planet); disposables.push(planet);
  const atmoMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.FrontSide, blending: THREE.AdditiveBlending,
    uniforms: { sun: { value: sunDir } },
    vertexShader: `varying vec3 vN; varying vec3 vV; void main(){ vN = normalize(normalMatrix*normal); vec4 mv = modelViewMatrix*vec4(position,1.); vV = -mv.xyz; gl_Position = projectionMatrix*mv; }`,
    fragmentShader: `varying vec3 vN; varying vec3 vV; uniform vec3 sun; void main(){ vec3 n = normalize(vN); vec3 v = normalize(vV);
      float rim = pow(1.0 - abs(dot(n, v)), 3.5); vec3 sunV = normalize((viewMatrix*vec4(sun,0.)).xyz); float l = smoothstep(-0.25, 0.5, dot(n, sunV));
      gl_FragColor = vec4(vec3(0.3,0.6,1.0) * rim * (0.05 + l*1.8), rim * (0.1 + l)); }`,
  });
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(267, 96, 64), atmoMat); atmo.position.copy(planet.position); group.add(atmo); disposables.push(atmo);

  // --- environment for specular response (PMREM of the baked sky)
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envRT = pmrem.fromEquirectangular(skyRT.texture); pmrem.dispose();
  const prevEnv = scene.environment; scene.environment = envRT.texture; scene.environmentIntensity = 1.6;
  disposables.push({ traverse: (f) => f({ geometry: envRT, material: null }) });

  // --- lights
  const sun = new THREE.DirectionalLight(0xfff1dc, 3.2); sun.position.copy(sunDir).multiplyScalar(50); group.add(sun);
  const hemi = new THREE.HemisphereLight(0x5a86d8, 0x1a0c2a, 0.9); group.add(hemi);
  const rim = new THREE.DirectionalLight(0x4aa8ff, 1.2); rim.position.set(3, -2, 6); group.add(rim);

  // --- stand-in Arwing
  const ship = buildArwing(); group.add(ship); disposables.push(ship);

  // --- enemy fighters
  const enemies = [];
  const eGeo = new THREE.ConeGeometry(0.6, 2.4, 6); eGeo.rotateX(Math.PI / 2);
  const eMat = new THREE.MeshStandardMaterial({ color: 0x7c2a2a, metalness: 0.6, roughness: 0.35, emissive: 0xff2a1a, emissiveIntensity: 0.35 });
  const wingGeo = new THREE.BoxGeometry(3, 0.08, 0.9);
  for (let i = 0; i < 4; i++) {
    const e = new THREE.Group(); const body = new THREE.Mesh(eGeo, eMat); e.add(body);
    const w = new THREE.Mesh(wingGeo, eMat); w.position.z = 0.4; e.add(w);
    const glow = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff7040 })); glow.position.z = 1.2; e.add(glow);
    e.userData.phase = i * 1.7; e.userData.rad = 6 + i * 2.5; group.add(e); enemies.push(e);
  }
  disposables.push(...enemies);

  camera.position.set(0, 2.4, 9.5); camera.lookAt(0, 0.9, -30); camera.fov = 60; camera.updateProjectionMatrix();

  function update(dt, t, input) {
    starMat.uniforms.t.value = t; planetMat.uniforms.t.value = t;
    planet.rotation.y = t * 0.01;
    group.position.z = 0;
    // ship banking & drift with input
    const ax = input?.axes.x ?? 0, ay = input?.axes.y ?? 0;
    ship.userData.roll += ((-ax * 0.55) - ship.userData.roll) * Math.min(1, dt * 5);
    ship.userData.pitch += ((ay * 0.3) - ship.userData.pitch) * Math.min(1, dt * 5);
    ship.userData.x += ((ax * 2.6) - ship.userData.x) * Math.min(1, dt * 3.5);
    ship.userData.y += ((ay * 1.6) - ship.userData.y) * Math.min(1, dt * 3.5);
    if (input?.isHeld('rollL') || input?.isHeld('rollR')) ship.userData.spin += dt * 9; else ship.userData.spin += (Math.round(ship.userData.spin / (Math.PI * 2)) * Math.PI * 2 - ship.userData.spin) * Math.min(1, dt * 8);
    ship.rotation.set(ship.userData.pitch, -ax * 0.12, ship.userData.roll + ship.userData.spin);
    ship.position.set(ship.userData.x, ship.userData.y - 0.9 + Math.sin(t * 1.3) * 0.08, -4);
    const boost = input?.isHeld('boost'), brake = input?.isHeld('brake');
    ship.userData.thr += (((boost ? 1.8 : brake ? 0.3 : 1)) - ship.userData.thr) * Math.min(1, dt * 6);
    for (const d of ship.userData.diff) { d.material.emissiveIntensity = 1.2 * ship.userData.thr + Math.sin(t * 30 + d.position.x) * 0.15; d.scale.z = 0.7 + ship.userData.thr * 0.9; }
    ship.userData.flame.scale.set(1, 1, ship.userData.thr * 1.4); ship.userData.flame.material.opacity = 0.12 + ship.userData.thr * 0.12;
    // stars streak: move stars slightly with boost
    stars.rotation.z = t * 0.004;
    // enemies weave far ahead
    enemies.forEach((e, i) => {
      const p = e.userData.phase + t * 0.5;
      e.position.set(Math.sin(p) * e.userData.rad, Math.cos(p * 1.3) * 3 + 1.5, -38 - Math.sin(p * 0.7 + i) * 10);
      e.lookAt(e.position.x + Math.cos(p) * 2, e.position.y, e.position.z - 4);
      e.rotation.z += Math.sin(p) * 0.5;
    });
  }

  function dispose() {
    scene.remove(group); scene.environment = prevEnv;
    for (const d of disposables) d.traverse?.((o) => { o.geometry?.dispose?.(); if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach((m) => m.dispose()); });
  }
  return { update, dispose, ship, enemies, sunDir };
}

function buildArwing() {
  const g = new THREE.Group();
  const hull = new THREE.MeshStandardMaterial({ color: 0xe9eef5, metalness: 0.35, roughness: 0.32 });
  const blue = new THREE.MeshStandardMaterial({ color: 0x2a5fd8, metalness: 0.45, roughness: 0.3 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x1c2233, metalness: 0.7, roughness: 0.35 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x2b6fd0, metalness: 0.6, roughness: 0.08, transparent: true, opacity: 0.9, emissive: 0x143a7a, emissiveIntensity: 0.5 });
  // fuselage: tapered
  const fus = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.55, 5.2, 8), hull); fus.rotation.x = -Math.PI / 2; fus.scale.set(1, 1, 0.7); fus.position.z = -0.4; g.add(fus);
  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.22, 1.6, 8), hull); nose.rotation.x = -Math.PI / 2; nose.scale.set(1, 1, 0.7); nose.position.z = -3.8; g.add(nose);
  const canopy = new THREE.Mesh(new THREE.SphereGeometry(0.42, 16, 12), glass); canopy.scale.set(0.8, 0.6, 1.6); canopy.position.set(0, 0.42, -0.5); g.add(canopy);
  // wings: swept, angled down (Star Fox)
  const wingGeo = new THREE.BoxGeometry(3.6, 0.09, 1.3);
  for (const s of [-1, 1]) {
    const w = new THREE.Mesh(wingGeo, hull); w.position.set(s * 2.0, -0.35, 0.9); w.rotation.z = s * 0.14; w.rotation.y = -s * 0.25; g.add(w);
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.1, 0.35), blue); stripe.position.set(s * 2.0, -0.35, 1.3); stripe.rotation.z = s * 0.14; stripe.rotation.y = -s * 0.25; g.add(stripe);
    const tip = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 1.0), blue); tip.position.set(s * 3.7, -0.3, 0.9); g.add(tip);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.1, 1.2), hull); fin.position.set(s * 0.55, 0.6, 1.2); fin.rotation.z = -s * 0.5; g.add(fin);
    const laser = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.6, 8), dark); laser.rotation.x = Math.PI / 2; laser.position.set(s * 3.6, -0.5, 0.6); g.add(laser);
  }
  // G-diffusers
  const diff = [];
  for (const s of [-1, 1]) {
    const d = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.32, 0.9, 12), new THREE.MeshStandardMaterial({ color: 0x9fdcff, emissive: 0x3aa8ff, emissiveIntensity: 1.2, roughness: 0.2, metalness: 0.1 }));
    d.rotation.x = Math.PI / 2; d.position.set(s * 1.05, -0.28, 1.6); g.add(d); diff.push(d);
    const housing = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 1.1, 12), dark); housing.rotation.x = Math.PI / 2; housing.position.set(s * 1.05, -0.28, 1.2); g.add(housing);
  }
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.3, 2.0, 12, 1, true), new THREE.MeshBasicMaterial({ color: 0x4fa8ff, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
  flame.rotation.x = -Math.PI / 2; flame.position.set(0, -0.2, 2.9); g.add(flame);
  g.userData = { roll: 0, pitch: 0, x: 0, y: 0, spin: 0, thr: 1, diff, flame };
  g.scale.setScalar(0.55);
  return g;
}
