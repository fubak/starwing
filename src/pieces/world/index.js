// PIECE: world — Corneria-style rail level environment.
// Exports createWorld(ctx, opts) -> { group, update(dt, speed), spawnZone(name), heightAt(x, z), sunLight, ... }
import * as THREE from 'three';
import { createSky, createMountains, SUN_DIR, PALETTE } from './sky.js';
import { createWater } from './water.js';
import { createClouds } from './clouds.js';
import { createMotes } from './motes.js';
import { Props } from './props.js';
import { CHUNK, NUM_CHUNKS, ZONES, TerrainChunk, ZoneSchedule, createTerrainMaterial, heightAt as terrainHeight, riverX } from './terrain.js';

export { SUN_DIR, PALETTE, riverX, ZONES };

export const FOG_DENSITY = 0.00050;
const SUN_DIST = 1400;

/**
 * Build the scrolling world. The camera stays near z=0 and the terrain group
 * slides toward +z; `dist` is the travel distance (world z = -dist at the player).
 *
 * opts.look: an optional lookdev handle (from applyLook) — when given, its sun is
 * reused for shadows and no extra lights are created. Otherwise a self-contained
 * light rig is added.
 */
export function createWorld(ctx, opts = {}) {
  const { scene, camera, renderer } = ctx;
  const rng = ctx.rng;
  const group = new THREE.Group();          // scrolling content (terrain + props)
  const statics = new THREE.Group();        // camera-following backdrop (sky, mountains, water, clouds)
  const root = new THREE.Group();
  root.add(group, statics);

  // ---- atmosphere
  scene.fog = new THREE.FogExp2(PALETTE.fog.clone(), FOG_DENSITY);
  scene.background = PALETTE.fog.clone();
  if (!opts.look) {
    renderer.toneMappingExposure = 1.05;
    if (ctx.bloom) { ctx.bloom.strength = 0.45; ctx.bloom.radius = 0.6; ctx.bloom.threshold = 0.85; }
  }

  // ---- lights (own rig unless a lookdev sun is supplied)
  let sun, sunTarget, ownLights = [];
  if (opts.look?.sun) {
    sun = opts.look.sun; sunTarget = sun.target;
    if (opts.look.hemi) { opts.look.hemi.color.set(0x8fc0ff); opts.look.hemi.groundColor.set(0x4d6a3c); opts.look.hemi.intensity = 0.7; }
  } else {
    const hemi = new THREE.HemisphereLight(0x8fc0ff, 0x4d6a3c, 0.75);
    sun = new THREE.DirectionalLight(0xfff0d8, 3.1);
    sunTarget = new THREE.Object3D();
    sun.target = sunTarget;
    const fill = new THREE.DirectionalLight(0x9ec8ff, 0.35);
    fill.position.set(400, 200, 600);
    ownLights = [hemi, sun, sunTarget, fill];
    statics.add(...ownLights);
  }
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 100; sun.shadow.camera.far = 3200;
  sun.shadow.camera.left = -560; sun.shadow.camera.right = 560; sun.shadow.camera.top = 560; sun.shadow.camera.bottom = -560;
  sun.shadow.bias = -0.0005; sun.shadow.normalBias = 2.5; sun.shadow.radius = 2;
  sun.shadow.camera.updateProjectionMatrix();

  // ---- backdrop
  const sky = createSky();
  const mountains = createMountains(rng);
  const water = createWater();
  water.uniforms.uFogDensity.value = FOG_DENSITY;
  const clouds = createClouds(rng);
  clouds.uniforms.uFogDensity.value = FOG_DENSITY * 0.8;
  const motes = createMotes(rng);
  statics.add(sky.mesh, mountains, water.mesh, clouds.mesh, motes.mesh);

  // ---- terrain & props
  const schedule = new ZoneSchedule();
  const terrainMat = createTerrainMaterial();
  const chunks = [];
  const props = new Props(rng);
  group.add(props.group);
  for (let i = 0; i < NUM_CHUNKS; i++) {
    const c = new TerrainChunk(terrainMat);
    c.build(i - 1, schedule, rng);   // one chunk behind the start so the ground under the camera exists
    props.populate(i - 1, schedule);
    chunks.push(c); group.add(c.mesh);
  }
  props.flush();
  let nextIndex = NUM_CHUNKS - 2;

  let dist = 0, time = 0;
  const camPos = new THREE.Vector3();

  const world = {
    group: root,
    scroll: group,
    sunLight: sun,
    schedule,
    props,
    get dist() { return dist; },
    get time() { return time; },
    /** terrain height at world x and world z (z = -travel) */
    heightAt(x, z) { const d = -z + dist; return terrainHeight(x, d, schedule.paramsAt(d)); },
    riverX(z) { return riverX(-z + dist); },
    zoneName() { return schedule.nameAt(dist); },
    /** zone that starts next and how far ahead it is (for HUD / director) */
    nextZone() { const n = schedule.list.find((z) => z.start > dist); return n ? { name: n.name, ahead: n.start - dist } : null; },
    spawnZone(name) { schedule.spawn(name, dist); },
    update(dt, speed) {
      time += dt; dist += speed * dt;
      group.position.z = dist;
      // recycle chunks that fell behind the camera
      for (const c of chunks) {
        const farEdge = (c.index + 1) * CHUNK;
        if (farEdge < dist - CHUNK * 1.2) {
          props.release(c.index);
          nextIndex++;
          c.build(nextIndex, schedule, rng);
          props.populate(nextIndex, schedule);
        }
      }
      props.flush();
      // backdrop follows the camera
      camera.getWorldPosition(camPos);
      sky.mesh.position.copy(camPos);
      mountains.position.set(camPos.x, 0, camPos.z);
      water.mesh.position.set(camPos.x, 0, camPos.z);
      water.uniforms.uTime.value = time;
      water.uniforms.uScroll.value = dist; // water texture space moves with the ground
      water.uniforms.uCamPos.value.copy(camPos);
      clouds.uniforms.uCamPos.value.copy(camPos);
      clouds.update(dt, speed, camPos.z);
      motes.update(dt, speed, camPos);
      sky.uniforms.uTime.value = time;
      // shadow frustum tracks the camera & looks forward
      sunTarget.position.set(camPos.x, 0, camPos.z - 420);
      sun.position.copy(sunTarget.position).addScaledVector(SUN_DIR, SUN_DIST);
      sunTarget.updateMatrixWorld();
    },
    dispose() {
      scene.fog = null;
      root.removeFromParent();
      terrainMat.dispose();
      for (const c of chunks) c.geometry.dispose();
      for (const p of props.pools) { p.mesh.geometry.dispose(); p.mesh.material.dispose(); }
      sky.mesh.geometry.dispose(); sky.mesh.material.dispose();
      water.mesh.geometry.dispose(); water.mesh.material.dispose();
      clouds.mesh.geometry.dispose(); clouds.mesh.material.dispose();
      motes.mesh.geometry.dispose(); motes.mesh.material.dispose();
      mountains.userData.dispose?.();
    },
  };
  world._dbg = { sky: sky.mesh, mountains, water: water.mesh, clouds: clouds.mesh, motes: motes.mesh, props: props.group, chunks, sun };
  if (typeof window !== 'undefined') window.__world = world;
  return world;
}

// ---------------------------------------------------------------- standalone showcase
export async function create(ctx) {
  const { scene, camera, input, ui, renderer } = ctx;

  // Shared look (lighting rig, PMREM env reflections, colour grade) from lookdev when available.
  let look = null;
  try {
    const lookdev = await import('../lookdev/index.js');
    const base = lookdev.PRESETS.corneria;
    look = lookdev.applyLook(ctx, {
      ...base, name: 'corneria-world',
      sun: { ...base.sun, dir: [SUN_DIR.x, SUN_DIR.y, SUN_DIR.z], intensity: 3.2 },
      fog: { color: 0xb9d6ee, density: FOG_DENSITY },
      exposure: 1.0,
      bloom: { strength: 0.42, radius: 0.6, threshold: 0.86 },
      grade: { ...base.grade, contrast: 1.05, saturation: 1.1, vignette: 0.26 },
    }, { sky: false, shadowSize: 560, shadowMap: 2048 });
  } catch (e) { console.warn('[world] lookdev unavailable, using own light rig', e); }

  const world = createWorld(ctx, { look });
  scene.add(world.group);
  scene.fog.density = FOG_DENSITY;

  camera.fov = 62; camera.near = 0.5; camera.far = 7000; camera.updateProjectionMatrix();

  // scripted demo: weave, dive, boost through zone changes
  input.script = (t) => {
    const x = Math.sin(t * 0.9) * 0.8 + Math.sin(t * 0.37) * 0.4;
    const y = Math.sin(t * 0.55 + 1.0) * 0.6 + Math.sin(t * 1.7) * 0.2;
    const buttons = [];
    if (t % 14 > 8 && t % 14 < 11.5) buttons.push('boost');
    if (t % 14 > 12.5) buttons.push('brake');
    return { x, y, buttons };
  };

  // caption
  const cap = document.createElement('div');
  cap.style.cssText = 'position:absolute;left:36px;bottom:30px;font:700 13px/1.6 system-ui,Segoe UI,sans-serif;letter-spacing:.3em;color:#eef5ff;opacity:.9;text-shadow:0 1px 10px rgba(0,25,70,.7)';
  cap.innerHTML = 'CORNERIA<br><span style="opacity:.62;letter-spacing:.2em;font-weight:500">SECTOR&nbsp;— <span id="wz">PLAINS</span></span>';
  ui.appendChild(cap);
  const zoneEl = cap.querySelector('#wz');

  // camera state with smoothing / overshoot
  const st = { x: 0, y: 58, vx: 0, vy: 0, roll: 0, speed: 210, pitch: 0 };
  const look3 = new THREE.Vector3();
  let t = 0, lastZone = '';

  return {
    update(dt) {
      t += dt;
      const ax = input.axes.x, ay = input.axes.y;
      let targetSpeed = 210;
      if (input.isHeld('boost')) targetSpeed = 370;
      if (input.isHeld('brake')) targetSpeed = 120;
      st.speed += (targetSpeed - st.speed) * Math.min(1, dt * 2.2);
      // spring-damper lateral motion (anticipation/overshoot)
      const tx = ax * 150, ty = 58 + ay * 48;
      const k = 9, c = 4.2;
      st.vx += ((tx - st.x) * k - st.vx * c) * dt; st.x += st.vx * dt;
      st.vy += ((ty - st.y) * k - st.vy * c) * dt; st.y += st.vy * dt;
      // keep above terrain ahead
      const ground = Math.max(world.heightAt(st.x, -60), world.heightAt(st.x, -180), world.heightAt(st.x, -320) - 10);
      const minY = ground + 26;
      if (st.y < minY) { st.y += (minY - st.y) * Math.min(1, dt * 6); st.vy = Math.max(st.vy, 0); }

      world.update(dt, st.speed);
      look?.update(dt, t);

      // camera pose
      const roll = -st.vx * 0.0019 - ax * 0.08;
      st.roll += (roll - st.roll) * Math.min(1, dt * 6);
      camera.position.set(st.x, st.y + Math.sin(t * 1.3) * 0.6, 0);
      look3.set(st.x + st.vx * 0.25 + ax * 30, st.y - 16 + st.vy * 0.15 + ay * 12, -420);
      camera.lookAt(look3);
      camera.rotateZ(st.roll);
      const fov = 62 + (st.speed - 210) * 0.045;
      if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }

      const z = world.zoneName();
      if (z !== lastZone) { lastZone = z; zoneEl.textContent = z.toUpperCase(); }
    },
    dispose() { world.dispose(); look?.dispose(); cap.remove(); },
  };
}
