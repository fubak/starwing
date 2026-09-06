// PIECE: ship — Arwing-class player fighter + turntable showcase.
// Exports buildArwing() for other pieces (flight, cinematics, spacesim...).
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { buildArwing } from './arwing.js';
import { makeStarfield, makeNebulaSky, makePlanet, makeEnvironment } from './space.js';

export { buildArwing };

const gradeShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uHeat: { value: new THREE.Vector4(0.5, 0.5, 0, 0) }, uAspect: { value: 1.78 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; uniform vec4 uHeat; uniform float uAspect; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
    float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
    void main(){
      // heat shimmer: screen-space refraction in a disc behind the engine nozzle (uHeat = x,y,radius,strength)
      vec2 d = (vUv - uHeat.xy) * vec2(uAspect, 1.0);
      float m = smoothstep(uHeat.z, uHeat.z * 0.2, length(d)) * uHeat.w;
      vec2 off = vec2(noise(vUv * 40.0 + vec2(0.0, -uTime * 6.0)), noise(vUv * 40.0 + vec2(7.3, -uTime * 5.0))) - 0.5;
      vec2 suv = vUv + off * m * 0.02;
      vec3 c = texture2D(tDiffuse, suv).rgb;
      // gentle S-curve contrast + saturation lift, cool shadows / warm highlights
      float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
      c = mix(vec3(l), c, 1.12);
      c = c * c * (3.0 - 2.0 * c) * 0.25 + c * 0.75;
      c += (vec3(0.0, 0.01, 0.03)) * (1.0 - l);
      c *= vec3(1.02, 1.0, 0.98);
      // vignette
      vec2 q = vUv - 0.5; float v = 1.0 - dot(q, q) * 0.9;
      c *= smoothstep(0.0, 1.0, v) * 0.35 + 0.65;
      gl_FragColor = vec4(c, 1.0);
    }`,
};

export async function create(ctx) {
  const { scene, camera, renderer, composer, bloom, input, ui, rng } = ctx;
  const disposables = [];

  // ---- look
  const sunDir = new THREE.Vector3(0.75, 0.55, -0.45).normalize();
  scene.background = new THREE.Color(0x03040a);
  scene.environment = makeEnvironment(renderer, sunDir);
  disposables.push(scene.environment);
  bloom.threshold = 0.9; bloom.strength = 0.42; bloom.radius = 0.45;
  renderer.toneMappingExposure = 0.95;

  const sun = new THREE.DirectionalLight(0xfff1dc, 2.4);
  sun.position.copy(sunDir).multiplyScalar(30);
  sun.castShadow = true; sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.left = sun.shadow.camera.bottom = -6; sun.shadow.camera.right = sun.shadow.camera.top = 6;
  sun.shadow.camera.near = 10; sun.shadow.camera.far = 60; sun.shadow.bias = -0.0008; sun.shadow.normalBias = 0.02;
  scene.add(sun); scene.add(sun.target);
  const fill = new THREE.DirectionalLight(0x4f78ff, 0.45); fill.position.set(-8, -3, 6); scene.add(fill);
  const rim = new THREE.DirectionalLight(0x8fb4ff, 0.9); rim.position.set(-4, 2, -10); scene.add(rim);
  scene.add(new THREE.HemisphereLight(0x3350a0, 0x2a1a10, 0.25));

  // ---- backdrop
  const stars = makeStarfield(rng, 3500); scene.add(stars);
  const sky = makeNebulaSky(renderer, sunDir); scene.background = sky.texture; scene.backgroundIntensity = 1.0;
  const planet = makePlanet(renderer, sunDir); planet.scale.setScalar(140); planet.position.set(-90, -230, -330); scene.add(planet);

  // ---- ship
  const ship = buildArwing({ THREE });
  scene.add(ship.group);
  ship.setThrust(0.55);

  // ---- laser bolts (twin, from the wing cannons)
  const boltGeo = new THREE.CapsuleGeometry(0.06, 1.6, 4, 8); boltGeo.rotateX(Math.PI / 2);
  const boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 2.5, 1.2) });
  const boltCore = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 4, 3.5) });
  const bolts = [];
  const boltPool = [];
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(boltGeo, boltMat); const c = new THREE.Mesh(new THREE.CapsuleGeometry(0.025, 1.4, 3, 6).rotateX(Math.PI / 2), boltCore); m.add(c);
    m.visible = false; scene.add(m); boltPool.push(m);
  }
  let fireCooldown = 0;
  const muzzle = new THREE.Vector3(), fwd = new THREE.Vector3();
  const fire = () => {
    for (const s of [-1, 1]) {
      const m = boltPool.find((b) => !b.visible); if (!m) return;
      muzzle.set(1.2 * s + 0.5 * s, -0.55 - 0.12, 0.9 - 1.9); ship.rig.localToWorld(muzzle);
      m.position.copy(muzzle); m.quaternion.copy(ship.group.quaternion).multiply(ship.rig.quaternion);
      m.visible = true; bolts.push({ m, life: 1.4 });
    }
  };

  // ---- post grading
  const grade = new ShaderPass(gradeShader); composer.addPass(grade);

  // ---- ui card
  const card = document.createElement('div');
  card.style.cssText = 'position:absolute;left:40px;bottom:36px;color:#e9f0ff;font:500 13px/1.4 "Segoe UI",system-ui,sans-serif;letter-spacing:.32em;text-transform:uppercase;pointer-events:none;text-shadow:0 2px 12px rgba(0,0,0,.6)';
  card.innerHTML = `<div style="font-size:11px;opacity:.6">Cornerian Defense Force · Space Dynamics</div>
    <div style="font-size:34px;font-weight:700;letter-spacing:.12em;line-height:1.1;margin-top:4px">ARWING <span style="color:#6aa0ff">SF-01</span></div>
    <div style="margin-top:6px;display:flex;gap:18px;font-size:10px;opacity:.75"><span>G-DIFFUSER ×2</span><span>TWIN LASER</span><span>NOVA BOMB</span></div>`;
  ui.appendChild(card);

  // ---- camera + demo script
  camera.fov = 42; camera.near = 0.1; camera.far = 5000; camera.updateProjectionMatrix();
  const camState = { az: 0.6, el: 0.25, r: 9.5, look: new THREE.Vector3(), pos: new THREE.Vector3() };
  input.script = (t) => {
    const buttons = [];
    const phase = t % 20;
    let x = 0, y = 0;
    if (phase < 4) x = Math.sin(t * 1.1) * 0.5;
    else if (phase < 6) { x = 1; }
    else if (phase < 8) { x = -1; buttons.push('fire'); }
    else if (phase < 11) { buttons.push('boost'); x = Math.sin(t * 2) * 0.4; }
    else if (phase < 13) { buttons.push('brake'); }
    else if (phase < 14.5) { buttons.push('rollR'); }
    else if (phase < 17) { buttons.push('fire'); y = Math.sin(t * 1.5) * 0.5; x = Math.cos(t * 1.5) * 0.6; }
    else x = Math.sin(t * 0.8) * 0.3;
    return { x, y, buttons };
  };

  const heatPos = new THREE.Vector3();
  let roll = 0, rollVel = 0, rollTarget = 0, rolling = 0;
  let pitch = 0;
  const shots = [ // camera beauty passes: [azimuth speed, elevation, radius]
    { az: 0.18, el: 0.22, r: 9.0 }, { az: 0.12, el: -0.15, r: 7.5 }, { az: 0.25, el: 0.5, r: 11 }, { az: 0.1, el: 0.08, r: 6.5 },
  ];

  // debug fixed views: ?view=side|top|front|back|iso
  const view = new URLSearchParams(location.search).get('view');
  const VIEWS = { side: [10, 0, 0], top: [0, 10, 0.01], front: [0, 0.5, -10], back: [0, 0.5, 10], iso: [6, 4, -6], under: [5, -5, -5] };

  function update(dt, t) {
    // controls -> ship
    const boost = input.isHeld('boost'), brake = input.isHeld('brake');
    ship.setThrust(boost ? 1 : brake ? 0.12 : 0.55);
    ship.setBank(input.axes.x);
    ship.flap(brake ? 1 : boost ? -0.5 : 0);
    pitch += ((-input.axes.y * 0.25) - pitch) * Math.min(1, dt * 5);
    // barrel roll with overshoot
    if ((input.wasPressed('rollR') || input.wasPressed('rollL')) && rolling <= 0) { rollTarget += input.wasPressed('rollR') ? -Math.PI * 2 : Math.PI * 2; rolling = 1.0; }
    rolling -= dt;
    rollVel += ((rollTarget - roll) * 60 - rollVel * 9) * dt; roll += rollVel * dt;
    if (Math.abs(rollTarget - roll) < 0.002 && Math.abs(rollVel) < 0.01) { roll = rollTarget = roll % (Math.PI * 2); rollVel = 0; }
    // fire
    fireCooldown -= dt;
    if (input.isHeld('fire') && fireCooldown <= 0) { fire(); fireCooldown = 0.14; }
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i]; b.life -= dt;
      fwd.set(0, 0, -1).applyQuaternion(b.m.quaternion); b.m.position.addScaledVector(fwd, dt * 90);
      if (b.life <= 0) { b.m.visible = false; bolts.splice(i, 1); }
    }

    // turntable + roll + pitch on the outer group
    ship.group.rotation.set(pitch, t * 0.22, roll, 'YXZ');
    ship.update(dt, t, camera);

    // camera: slow orbit through beauty shots with eased transitions
    const seg = Math.floor(t / 5) % shots.length, k = (t % 5) / 5, e = k * k * (3 - 2 * k);
    const a = shots[seg], b = shots[(seg + 1) % shots.length];
    const el = THREE.MathUtils.lerp(a.el, b.el, e), r = THREE.MathUtils.lerp(a.r, b.r, e);
    camState.az += THREE.MathUtils.lerp(a.az, b.az, e) * dt;
    camState.el += (el - camState.el) * Math.min(1, dt * 2);
    camState.r += (r - camState.r) * Math.min(1, dt * 2);
    const thrustKick = ship.state.thrust * 0.6;
    camState.pos.set(Math.sin(camState.az) * Math.cos(camState.el), Math.sin(camState.el), Math.cos(camState.az) * Math.cos(camState.el)).multiplyScalar(camState.r + thrustKick);
    camera.position.lerp(camState.pos, Math.min(1, dt * 4));
    camState.look.set(Math.sin(t * 0.7) * 0.15, 0.1 + Math.sin(t * 0.5) * 0.1, 0);
    camera.lookAt(camState.look);
    camera.rotation.z += Math.sin(t * 0.3) * 0.02;
    camera.fov = 42 - ship.state.thrust * 4 + 4 * 0.55; camera.updateProjectionMatrix();
    if (VIEWS[view]) { ship.group.rotation.set(0, 0, 0); ship.setHover(0); ship.rig.rotation.set(0, 0, 0); ship.rig.position.set(0, 0, 0); camera.position.set(...VIEWS[view]); camera.lookAt(0, 0, 0); }

    stars.material.uniforms.uTime.value = t; stars.material.uniforms.uPR.value = renderer.getPixelRatio();
    planet.material.uniforms.uTime.value = t;
    planet.rotation.y = t * 0.004;
    grade.uniforms.uTime.value = t;
    // heat shimmer target: project the nozzle (plus a bit of plume) to screen space
    heatPos.set(0, -0.02, 4.2); ship.rig.localToWorld(heatPos); heatPos.project(camera);
    const behind = heatPos.z > 1 || heatPos.z < -1;
    grade.uniforms.uHeat.value.set(heatPos.x * 0.5 + 0.5, heatPos.y * 0.5 + 0.5, 0.09 + 0.06 * ship.state.thrust, behind ? 0 : 0.35 + ship.state.thrust * 0.65);
    grade.uniforms.uAspect.value = camera.aspect;
  }

  return {
    update,
    dispose() {
      composer.removePass(grade); grade.dispose?.();
      ship.dispose();
      stars.geometry.dispose(); stars.material.dispose(); sky.dispose(); planet.userData.dispose();
      scene.background = null;
      for (const d of disposables) d.dispose?.();
      boltGeo.dispose(); boltMat.dispose(); boltCore.dispose();
      card.remove();
      scene.environment = null;
    },
  };
}
