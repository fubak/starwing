// PIECE: ship — Arwing-class player fighter + turntable showcase.
// Exports buildArwing() for other pieces (flight, cinematics, spacesim...).
import * as THREE from 'three';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { buildArwing } from './arwing.js';
import { applyLook, makePlanet, PRESETS } from '../lookdev/index.js';

export { buildArwing };

// Headless harness runs (?fixed / ?autoplay) must not be yanked by a Vite full
// reload triggered by other agents' edits: park the reload forever.
if (import.meta.hot && /[?&](fixed|autoplay)\b/.test(location.search)) {
  import.meta.hot.on('vite:beforeFullReload', () => new Promise(() => {}));
}

// Heat shimmer only (colour grading comes from lookdev's grade pass).
const shimmerShader = {
  uniforms: { tDiffuse: { value: null }, uTime: { value: 0 }, uHeat: { value: new THREE.Vector4(0.5, 0.5, 0, 0) }, uAspect: { value: 1.78 } },
  vertexShader: `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: `uniform sampler2D tDiffuse; uniform float uTime; uniform vec4 uHeat; uniform float uAspect; varying vec2 vUv;
    float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
    float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
      return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
    void main(){
      // screen-space refraction in a disc behind the engine nozzle (uHeat = x,y,radius,strength)
      vec2 d = (vUv - uHeat.xy) * vec2(uAspect, 1.0);
      float m = smoothstep(uHeat.z, uHeat.z * 0.2, length(d)) * uHeat.w;
      vec2 off = vec2(noise(vUv * 40.0 + vec2(0.0, -uTime * 6.0)), noise(vUv * 40.0 + vec2(7.3, -uTime * 5.0))) - 0.5;
      gl_FragColor = vec4(texture2D(tDiffuse, vUv + off * m * 0.018).rgb, 1.0);
    }`,
};

// Showcase look: lookdev's ORBIT·DAWN palette, but with the sun lifted so the
// white hull gets a proper key + clear-coat highlight instead of pure rim.
const SHIP_PRESET = {
  ...PRESETS.space, name: 'ship', label: 'HANGAR · ORBIT',
  exposure: 1.05,
  sun: { ...PRESETS.space.sun, dir: [0.12, 0.97, 0.2], intensity: 3.4, size: 0.006, glow: 0.08 },
  fill: { ...PRESETS.space.fill, dir: [-0.6, 0.1, -0.75], color: 0xbfd4ff, intensity: 1.2 },
  hemi: { ...PRESETS.space.hemi, ground: 0x2a4a90, intensity: 1.0 },
  bloom: { strength: 0.5, radius: 0.5, threshold: 1.15 },
};

export async function create(ctx) {
  const { scene, camera, composer, input, ui, renderer } = ctx;

  // Harness friendliness: in fixed-step mode drain the GL queue each frame so
  // stepping N frames on software GL doesn't backlog into the screenshot.
  const gl = renderer.getContext();
  const syncGL = !!ctx.engine?.fixedStep;
  const syncPx = new Uint8Array(4);
  const drainGL = () => { renderer.setRenderTarget(null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, syncPx); };

  // ---- look (lights, env, sky, grade) from lookdev
  const look = applyLook(ctx, SHIP_PRESET, { shadowSize: 7, shadowMap: 1024 });
  look.setFocus(new THREE.Vector3(0, 0, 0));
  look.sun.shadow.bias = -0.0006; look.sun.shadow.normalBias = 0.02;

  const planet = makePlanet({ radius: 640, seed: 7 });
  planet.position.set(120, -690, -260);
  planet.rotation.x = Math.PI / 2;
  planet.lightDir = new THREE.Vector3(0.55, 0.62, -0.55).normalize();
  planet.setPreset(look.preset);
  scene.add(planet);
  // planet bounce: keeps the belly readable when the camera dips below the ship
  const bounce = new THREE.DirectionalLight(0x4f8cff, 0.9); bounce.position.set(0.3, -1, -0.2); scene.add(bounce, bounce.target);

  // ---- ship
  const ship = buildArwing({ THREE });
  scene.add(ship.group);
  ship.setThrust(0.55);

  // ---- laser bolts (twin, from the wing cannons)
  const boltGeo = new THREE.CapsuleGeometry(0.06, 1.6, 4, 8); boltGeo.rotateX(Math.PI / 2);
  const boltMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 2.5, 1.2) });
  const boltCore = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 4, 3.5) });
  const boltCoreGeo = new THREE.CapsuleGeometry(0.025, 1.4, 3, 6).rotateX(Math.PI / 2);
  const bolts = [];
  const boltPool = [];
  for (let i = 0; i < 16; i++) {
    const m = new THREE.Mesh(boltGeo, boltMat); m.add(new THREE.Mesh(boltCoreGeo, boltCore));
    m.visible = false; scene.add(m); boltPool.push(m);
  }
  let fireCooldown = 0;
  const muzzle = new THREE.Vector3(), fwd = new THREE.Vector3();
  const muzzleFlashes = [];
  const flashMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 3, 1.5), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  for (const mz of ship.muzzles) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), flashMat); f.position.copy(mz); ship.rig.add(f); muzzleFlashes.push(f); }
  const fire = () => {
    for (const mz of ship.muzzles) {
      const m = boltPool.find((b) => !b.visible); if (!m) return;
      muzzle.copy(mz); ship.rig.localToWorld(muzzle);
      m.position.copy(muzzle); ship.rig.getWorldQuaternion(m.quaternion);
      m.visible = true; bolts.push({ m, life: 1.4 });
    }
    flashMat.opacity = 1;
  };

  // ---- heat shimmer pass (after lookdev grade)
  const shimmer = new ShaderPass(shimmerShader); composer.addPass(shimmer);

  // ---- ui card
  const card = document.createElement('div');
  card.style.cssText = 'position:absolute;left:40px;bottom:36px;color:#e9f0ff;font:500 13px/1.4 "Segoe UI",system-ui,sans-serif;letter-spacing:.32em;text-transform:uppercase;pointer-events:none;text-shadow:0 2px 12px rgba(0,0,0,.6);transform:skewX(-8deg)';
  card.innerHTML = `<div style="font-size:11px;opacity:.6">Cornerian Defense Force · Space Dynamics</div>
    <div style="font-size:34px;font-weight:800;letter-spacing:.12em;line-height:1.1;margin-top:4px">ARWING <span style="color:#6aa0ff">SF-01</span></div>
    <div style="height:3px;width:120px;background:linear-gradient(90deg,#6fb8ff,rgba(111,184,255,0));margin-top:8px"></div>
    <div style="margin-top:8px;display:flex;gap:18px;font-size:10px;opacity:.75"><span>G-DIFFUSER ×2</span><span>TWIN LASER</span><span>NOVA BOMB</span></div>`;
  ui.appendChild(card);

  // ---- camera + demo script
  camera.fov = 42; camera.near = 0.1; camera.far = 6000; camera.updateProjectionMatrix();
  const camState = { az: 0.6, el: 0.25, r: 9.5, look: new THREE.Vector3(), pos: new THREE.Vector3() };
  input.script = (t) => {
    const buttons = [];
    const phase = ((t % 20) + 20) % 20;
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
    { az: 0.18, el: 0.22, r: 9.0 }, { az: 0.12, el: 0.02, r: 7.5 }, { az: 0.25, el: 0.5, r: 11 }, { az: 0.1, el: 0.12, r: 6.5 },
  ];
  const SEG = 5;

  // debug fixed views: ?view=side|top|front|back|iso
  const view = new URLSearchParams(location.search).get('view');
  const VIEWS = { side: [10, 0, 0], top: [0, 10, 0.01], front: [0, 0.5, -10], back: [0, 0.5, 10], iso: [6, 4, -6], under: [5, -5, -5] };

  function update(dt, t) {
    // The engine's very first realtime frame can hand us a tiny/negative t or dt; never let it reach the maths.
    if (!(dt > 0)) dt = 1 / 60; dt = Math.min(dt, 0.1);
    if (!(t >= 0)) t = 0;

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
    flashMat.opacity = Math.max(0, flashMat.opacity - dt * 14);
    for (let i = bolts.length - 1; i >= 0; i--) {
      const b = bolts[i]; b.life -= dt;
      fwd.set(0, 0, -1).applyQuaternion(b.m.quaternion); b.m.position.addScaledVector(fwd, dt * 90);
      if (b.life <= 0) { b.m.visible = false; bolts.splice(i, 1); }
    }

    // turntable + roll + pitch on the outer group
    ship.group.rotation.set(pitch, t * 0.22, roll, 'YXZ');
    ship.update(dt, t, camera);

    // camera: slow orbit through beauty shots with eased transitions
    const n = shots.length;
    const seg = ((Math.floor(t / SEG) % n) + n) % n, k = ((t % SEG) + SEG) % SEG / SEG, e = k * k * (3 - 2 * k);
    const a = shots[seg], b = shots[(seg + 1) % n];
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

    look.update(dt, t);
    planet.update(dt, t);
    shimmer.uniforms.uTime.value = t;
    // heat shimmer target: project the nozzle (plus a bit of plume) to screen space
    heatPos.copy(ship.nozzle); heatPos.z += 0.6; ship.rig.localToWorld(heatPos); heatPos.project(camera);
    const behind = heatPos.z > 1 || heatPos.z < -1;
    shimmer.uniforms.uHeat.value.set(heatPos.x * 0.5 + 0.5, heatPos.y * 0.5 + 0.5, 0.08 + 0.05 * ship.state.thrust, behind ? 0 : 0.3 + ship.state.thrust * 0.6);
    shimmer.uniforms.uAspect.value = camera.aspect;
    if (syncGL) drainGL();
  }

  return {
    update,
    dispose() {
      composer.removePass(shimmer); shimmer.dispose?.();
      ship.dispose();
      scene.remove(planet); planet.disposePlanet?.();
      scene.remove(bounce, bounce.target);
      look.dispose();
      for (const b of boltPool) scene.remove(b);
      boltGeo.dispose(); boltCoreGeo.dispose(); boltMat.dispose(); boltCore.dispose(); flashMat.dispose();
      scene.remove(ship.group);
      card.remove();
    },
  };
}
