// PIECE: flight — rail-flight feel. Corridor movement in a soft box, pitch/yaw
// with bank, barrel roll (Q/E or double-tap) with i-frames + sparkle, boost /
// brake with FOV kick, camera lag and speed lines, near+far reticle, lasers
// with recoil. Chase camera leads on turns (Star Fox 64 / Zero style).
// Setting: golden-hour flight over the Cornerian sea between rock pillars.
import * as THREE from 'three';
import { buildFallbackArwing } from './arwing.js';
import { PALETTE, SUN_DIR, buildSky, buildOcean, buildIslands, Pillars, Clouds, Gates } from './environment.js';
import { Lasers, MuzzleFlash, SpeedLines, Sparkle, Reticle, BoostFlame, makeGradePass } from './effects.js';
import { createRailController, damp } from './controller.js';
import { createChaseCamera } from './camera.js';
import { dressArwing } from './livery.js';

export { createRailController, createChaseCamera, dressArwing };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

// Golden-hour Corneria sea. Shaped like a lookdev preset so the shared rig can drive it.
const LOOK = {
  label: 'CORNERIA · SEA · DUSK',
  exposure: 0.95,
  envIntensity: 0.8,
  bloom: { strength: 0.38, radius: 0.42, threshold: 0.9 },
  sun: { dir: [SUN_DIR.x, SUN_DIR.y, SUN_DIR.z], color: 0xffd9a8, intensity: 2.2, size: 0.035, glow: 0.7 },
  hemi: { sky: 0x6fa8ff, ground: 0x1f5a5c, intensity: 0.6 },
  fill: { dir: [0.6, 0.35, 0.72], color: 0x5a8cff, intensity: 0.5 },
  fog: { color: 0xd9bfae, density: 0.00048 },
  sky: { zenith: 0x1b55c8, horizon: 0xffc9a4, ground: 0x3a6f78, haze: 3.2, stars: 0, nebula: 0, nebulaA: 0x1e2e8a, nebulaB: 0xb0326e, milky: 0 },
  grade: { contrast: 1.06, saturation: 1.12, lift: 0x020408, gain: 0xfff6ec, gamma: 1.0, vignette: 0.3, grain: 0.014 },
  planet: { ocean: 0x2a7fd6, oceanDeep: 0x0f3f96, land: 0x4c9a3c, landHigh: 0xb8a070, ice: 0xf4f9ff, iceLat: 0.78, atmo: 0x7ab8ff, atmoWarm: 0xffc880, night: 0xffd090, cloud: 0xffffff },
};

async function loadArwing() {
  try {
    const mod = await import('../ship/index.js');
    if (typeof mod.buildArwing === 'function') {
      const s = await mod.buildArwing({ THREE });
      const obj = s?.isObject3D ? s : s?.group;
      if (obj?.isObject3D) return { obj, api: s.isObject3D ? null : s };
    }
  } catch (e) { console.warn('[flight] ship piece unavailable, using fallback model', e); }
  return { obj: buildFallbackArwing(), api: null };
}

async function installLook(ctx) {
  try {
    const mod = await import('../lookdev/index.js');
    if (typeof mod.applyLook === 'function') {
      const look = mod.applyLook(ctx, LOOK, { shadowSize: 30, shadowMap: 1024 });
      if (look?.update && look?.dispose) return look;
    }
  } catch (e) { console.warn('[flight] lookdev unavailable, using local rig', e); }
  return null;
}

export async function create(ctx) {
  const { scene, camera, renderer, composer, bloom, input, ui, rng } = ctx;
  const disposables = [];

  // ---------- look (shared lookdev rig, or a local fallback with the same palette) ----------
  scene.background = null;
  const look = await installLook(ctx);
  let localSky = null, localEnv = null;
  const savedBloom = { strength: bloom.strength, radius: bloom.radius, threshold: bloom.threshold };
  const savedExposure = renderer.toneMappingExposure;
  if (!look) {
    scene.fog = new THREE.FogExp2(PALETTE.fog.clone(), 0.00055);
    localSky = buildSky(); scene.add(localSky);
    const hemi = new THREE.HemisphereLight(0x6fa8ff, 0x1f5a5c, 0.75); scene.add(hemi);
    const sun = new THREE.DirectionalLight(0xffd9a8, 3.4);
    sun.position.copy(SUN_DIR).multiplyScalar(200); scene.add(sun); scene.add(sun.target);
    const fill = new THREE.DirectionalLight(0x5a8cff, 0.8); fill.position.set(60, 35, 72); scene.add(fill);
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene(); envScene.add(buildSky());
    localEnv = pmrem.fromScene(envScene, 0.04);
    scene.environment = localEnv.texture; scene.environmentIntensity = 0.7;
    pmrem.dispose();
    bloom.strength = 0.38; bloom.radius = 0.42; bloom.threshold = 0.9;
  }
  // Hero lighting for the ship. The sun sits ahead of the ship (low, into the
  // frame) so the camera sees its shadow side: a warm key from the camera side
  // and a strong cool rim from ahead/below carve the silhouette like Star Fox
  // Zero's Corneria. World surfaces use lean custom shaders, so these lights
  // only touch the ship and the gates.
  const keyLight = new THREE.DirectionalLight(0xffe2bc, 1.6);
  const rimLight = new THREE.DirectionalLight(0x6fb4ff, 3.2);
  const underLight = new THREE.DirectionalLight(0x3aa7b8, 1.1); // sea bounce onto the belly
  scene.add(keyLight, keyLight.target, rimLight, rimLight.target, underLight, underLight.target);
  // boost FX pass (chromatic aberration, radial blur, flash) in linear space before OutputPass
  const fx = makeGradePass();
  fx.uniforms.grade.value = look ? 0 : 1;
  const outIdx = composer.passes.findIndex((p) => p.constructor?.name === 'OutputPass');
  composer.insertPass(fx, outIdx >= 0 ? outIdx : composer.passes.length);

  // ---------- world ----------
  const ocean = buildOcean(); scene.add(ocean);
  const islands = buildIslands(rng); scene.add(islands);
  const pillars = new Pillars(rng); scene.add(pillars.mesh);
  const clouds = new Clouds(rng); scene.add(clouds.group);
  const gates = new Gates(rng); scene.add(gates.group);

  // ---------- ship ----------
  const shipRoot = new THREE.Group();       // position on the rail (x,y,z) - no rotation
  const shipAttitude = new THREE.Group();   // pitch/yaw/bank
  const shipRoll = new THREE.Group();       // barrel roll spin
  const { obj: arwing, api: shipApi } = await loadArwing();
  if (shipApi) {
    arwing.scale.setScalar(1.0); // ship piece model is ~7 units nose->tail already
    dressArwing(shipApi); // blue / grey / red livery split, cooler hull, real clearcoat
  } else {
    // normalise scale so the fallback is ~6.5 units long
    const bb = new THREE.Box3().setFromObject(arwing);
    const size = bb.getSize(new THREE.Vector3());
    const len = Math.max(size.z, 1e-3);
    const k = 6.5 / len;
    arwing.scale.multiplyScalar(k);
    const c = bb.getCenter(new THREE.Vector3()).multiplyScalar(k);
    arwing.position.sub(c);
  }
  shipRoll.add(arwing); shipAttitude.add(shipRoll); shipRoot.add(shipAttitude); scene.add(shipRoot);
  shipApi?.setHover?.(0);
  // fallback-model glow bits (the real ship animates its own)
  const gdiffs = []; if (!shipApi) arwing.traverse((o) => { if (o.name === 'gdiff') gdiffs.push(o); });
  let flame = null, flameCore = null;
  if (!shipApi) {
    flame = new THREE.Mesh(
      new THREE.ConeGeometry(0.55, 4, 16, 1, true),
      new THREE.MeshBasicMaterial({ color: 0x8fdcff, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, toneMapped: false }),
    );
    flame.rotation.x = Math.PI / 2; flame.position.set(0, -0.05, 4.9); shipRoll.add(flame);
    flameCore = flame.clone(); flameCore.material = flame.material.clone(); flameCore.material.color.set(0xffffff); flameCore.material.opacity = 0.9; flameCore.scale.set(0.45, 0.6, 0.45); shipRoll.add(flameCore);
  }

  const sparkle = new Sparkle(shipAttitude, rng);
  const lasers = new Lasers(scene);
  const muzzlePts = shipApi?.muzzles ?? [new THREE.Vector3(-2.0, -0.35, -1.8), new THREE.Vector3(2.0, -0.35, -1.8)];
  const muzzleParent = shipApi?.rig ?? shipRoll;
  const muzzleFlash = new MuzzleFlash(muzzleParent, muzzlePts);
  const boostFlame = new BoostFlame(muzzleParent, shipApi ? shipApi.nozzle.clone() : new THREE.Vector3(0, -0.05, 2.8), 1.0);
  const boostLight = new THREE.PointLight(0x5a9cff, 0, 26, 2); boostLight.position.set(0, 0, 6); muzzleParent.add(boostLight);
  scene.add(camera); // so camera-attached speed lines render
  const speedLines = new SpeedLines(camera, rng);
  const reticle = new Reticle(scene);

  // ---------- HUD (minimal: boost gauge / speed / callouts) ----------
  const hud = document.createElement('div');
  hud.style.cssText = 'position:absolute;left:0;top:0;width:100%;height:100%;pointer-events:none;font-family:"Segoe UI",Inter,system-ui,sans-serif;color:#eef8ff';
  hud.innerHTML = `
    <div style="position:absolute;left:40px;bottom:36px;">
      <div style="display:flex;align-items:baseline;gap:10px"><div style="font:800 11px/1 sans-serif;letter-spacing:.34em;opacity:.85;text-shadow:0 1px 2px rgba(0,0,0,.5)">BOOST</div><div id="fl-state" style="font:800 10px/1 sans-serif;letter-spacing:.3em;color:#9fe8ff;opacity:0;transition:opacity .12s;text-shadow:0 0 10px rgba(120,220,255,.9)"></div></div>
      <div style="margin-top:7px;width:230px;height:11px;border:2px solid rgba(238,248,255,.8);border-radius:2px;transform:skewX(-16deg);overflow:hidden;background:rgba(6,18,40,.5);box-shadow:0 2px 8px rgba(0,0,0,.35)">
        <div id="fl-boost" style="height:100%;width:100%;background:linear-gradient(90deg,#3fc9ff,#b6f3ff);box-shadow:0 0 12px #6ce0ff"></div>
      </div>
    </div>
    <div style="position:absolute;right:40px;bottom:32px;text-align:right">
      <div style="font:800 11px/1 sans-serif;letter-spacing:.34em;opacity:.85;text-shadow:0 1px 2px rgba(0,0,0,.5)">VELOCITY</div>
      <div id="fl-speed" style="font:900 34px/1 sans-serif;letter-spacing:.04em;margin-top:5px;text-shadow:0 2px 3px rgba(0,0,0,.45),0 0 14px rgba(120,200,255,.55);font-variant-numeric:tabular-nums;font-style:italic">000</div>
    </div>
    <div id="fl-msg" style="position:absolute;left:50%;top:15%;transform:translateX(-50%) skewX(-8deg);font:900 26px/1 sans-serif;letter-spacing:.4em;color:#ffe9b0;opacity:0;text-shadow:0 2px 4px rgba(0,0,0,.5),0 0 22px rgba(255,190,90,.9)"></div>`;
  ui.appendChild(hud);
  const elBoost = hud.querySelector('#fl-boost'), elSpeed = hud.querySelector('#fl-speed'), elMsg = hud.querySelector('#fl-msg'), elState = hud.querySelector('#fl-state');
  let msgT = 0;
  const say = (s) => { elMsg.textContent = s; msgT = 1.0; };

  // ---------- state: reusable controller + chase camera ----------
  const rail = createRailController({ box: { x: 24, yMin: 4, yMax: 32 }, startY: 14 });
  const S = rail.state;
  const chase = createChaseCamera(camera);
  const FX = { flash: 0 };
  const tmp = new THREE.Vector3(), aimDir = new THREE.Vector3(0, 0, -1), shipWorld = new THREE.Vector3();
  const focus = new THREE.Vector3();
  camera.near = 0.5; camera.far = 6000; camera.fov = 60; camera.updateProjectionMatrix();

  // ---------- autoplay script (16 s loop: weave, boost+roll, brake, hard turns) ----------
  input.script = (t) => {
    const buttons = [];
    let x = Math.sin(t * 1.1) * 0.85 + Math.sin(t * 2.7) * 0.25;
    let y = Math.sin(t * 0.8 + 1.0) * 0.55;
    const m = t % 16;
    if (m > 1.8 && m < 4.6) buttons.push('boost');
    if (m > 5.2 && m < 6.8) buttons.push('brake');
    if ((m > 3.7 && m < 3.9) || (m > 9.4 && m < 9.6)) buttons.push('rollR');
    if (m > 12.2 && m < 12.4) buttons.push('rollL');
    if (Math.floor(t * 2) % 3 !== 2) buttons.push('fire');
    if (m > 9.8 && m < 11.6) { x = 1; y = -0.35; }
    if (m > 13.4 && m < 15) { x = -1; y = 0.55; buttons.push('boost'); }
    return { x, y, buttons };
  };

  let time = 0;
  function update(dt, t) {
    dt = Math.min(dt, 1 / 20);
    time += dt;
    const ax = input.axes.x, ay = input.axes.y;

    rail.update(dt, input);
    const R = S.roll;

    shipRoot.position.set(S.x, S.y, S.z);
    shipAttitude.rotation.set(S.pitch, S.yaw, S.bank, 'YXZ');
    shipRoll.rotation.z = S.rollAngle;
    shipRoll.position.z = S.recoil * 0.6 + S.brake * 1.2 - S.boost * 1.5;
    if (shipApi) {
      shipApi.setBank?.(ax * 0.35);
      shipApi.flap?.(-ay * 0.6 + S.brake * 0.8);
      shipApi.setThrust?.(clamp(0.5 + S.boost * 0.5 - S.brake * 0.4, 0, 1));
      shipApi.update?.(dt, time, camera);
    }

    // --- aim + lasers
    shipRoot.getWorldPosition(shipWorld);
    aimDir.set(0, 0, -1).applyEuler(shipAttitude.rotation).normalize();
    const fired = rail.events.fired;
    if (fired) {
      muzzleParent.updateWorldMatrix(true, false);
      const target = shipWorld.clone().addScaledVector(aimDir, 95);
      for (const mp of muzzlePts) {
        const muzzle = mp.clone().applyMatrix4(muzzleParent.matrixWorld);
        lasers.fire(muzzle, target.clone().sub(muzzle).normalize());
      }
      muzzleFlash.kick();
      chase.kick(0.22);
    }
    lasers.update(dt, camera);
    muzzleFlash.update(dt, camera);
    boostFlame.update(dt, time, S.boost);
    boostLight.intensity = S.boost * 40;

    // --- world
    if (gates.update(S, dt, time)) { say('NICE!'); FX.flash = 0.35; S.gauge = Math.min(1, S.gauge + 0.3); look?.flash?.(0.25); }
    pillars.update(S.z, time);
    clouds.update(S.z);
    ocean.position.set(0, 0, S.z);
    ocean.material.uniforms.camPos.value.copy(camera.position);
    ocean.material.uniforms.shipPos.value.copy(shipWorld);
    ocean.material.uniforms.time.value = time;
    islands.position.set(S.x * 0.3, 0, S.z * 0.92);
    if (localSky) { localSky.position.set(camera.position.x, 0, camera.position.z); localSky.material.uniforms.time.value = time; }
    focus.set(S.x, S.y, S.z);
    look?.setFocus?.(focus);
    // hero lights ride with the ship (directions fixed relative to the rail)
    keyLight.target.position.copy(shipWorld); keyLight.position.copy(shipWorld).add(tmp.set(22, 30, 34));
    rimLight.target.position.copy(shipWorld); rimLight.position.copy(shipWorld).add(tmp.set(-14, -6, -40));
    underLight.target.position.copy(shipWorld); underLight.position.copy(shipWorld).add(tmp.set(0, -30, 8));

    // --- fallback ship glow / flame reacts to throttle
    if (!shipApi) {
      const thr = 1 + S.boost * 1.6 - S.brake * 0.6;
      for (const g of gdiffs) if (g.material?.emissiveIntensity !== undefined) g.material.emissiveIntensity = 3.0 * thr + Math.sin(time * 30) * 0.3;
      flame.scale.set(thr * 0.9, 1 + S.boost * 1.8 - S.brake * 0.5 + Math.sin(time * 40) * 0.06, thr * 0.9);
      flame.material.opacity = 0.45 + S.boost * 0.4;
      flameCore.scale.set(0.45 * thr, 0.6 + S.boost * 1.5, 0.45 * thr);
    }

    sparkle.update(dt, R.active, R.t);

    // --- camera: chase rig with screen-space anchor (ship locked centre-low, world swings)
    chase.update(dt, S, { x: ax, y: ay });

    // --- post & fx
    speedLines.update(dt, clamp(S.boost * 1.0 + Math.max(0, (S.speed - 110) / 110), 0, 1), S.speed);
    FX.flash = Math.max(0, FX.flash - dt * 2);
    fx.uniforms.boost.value = S.boost;
    fx.uniforms.flash.value = FX.flash * 0.25 + (S.invuln > 0.55 ? 0.08 : 0);
    fx.uniforms.time.value = time;
    fx.uniforms.aspect.value = camera.aspect;
    reticle.update(shipWorld, aimDir, camera, dt, fired);
    look?.update?.(dt, time);

    // --- HUD
    elBoost.style.width = `${(S.gauge * 100).toFixed(1)}%`;
    elBoost.style.background = S.gauge < 0.25 ? 'linear-gradient(90deg,#ff6a3c,#ffb56b)' : 'linear-gradient(90deg,#3fc9ff,#b6f3ff)';
    const st = S.boost > 0.3 ? '▶▶ ENGAGED' : S.brake > 0.3 ? '◀◀ BRAKING' : '';
    if (elState.textContent !== st) { elState.textContent = st; elState.style.color = S.brake > 0.3 ? '#ffc98a' : '#9fe8ff'; }
    elState.style.opacity = st ? '1' : '0';
    elSpeed.textContent = String(Math.round(S.speed * 3.1)).padStart(3, '0');
    msgT = Math.max(0, msgT - dt);
    elMsg.style.opacity = msgT > 0 ? String(clamp(msgT * 3, 0, 1)) : '0';
    elMsg.style.transform = `translateX(-50%) skewX(-8deg) scale(${1 + Math.max(0, msgT - 0.85) * 2})`;
  }

  function dispose() {
    input.script = null;
    look?.dispose?.();
    bloom.strength = savedBloom.strength; bloom.radius = savedBloom.radius; bloom.threshold = savedBloom.threshold;
    renderer.toneMappingExposure = savedExposure;
    composer.removePass(fx); fx.dispose?.();
    scene.environment = null; localEnv?.dispose();
    scene.fog = null;
    reticle.dispose();
    pillars.dispose(); clouds.dispose();
    camera.remove(speedLines.lines);
    scene.remove(keyLight, keyLight.target, rimLight, rimLight.target, underLight, underLight.target);
    chase.reset();
    hud.remove();
    shipApi?.dispose?.();
    scene.traverse((o) => { if (o.isMesh || o.isLine || o.isPoints || o.isSprite) { o.geometry?.dispose?.(); if (Array.isArray(o.material)) o.material.forEach((m) => m.dispose()); else o.material?.dispose?.(); } });
    for (const d of disposables) d.dispose?.();
    scene.clear();
  }

  return { update, dispose };
}
