// PIECE: world — Corneria-style rail level environment.
// Exports createWorld(ctx) -> { group, update(dt, speed), spawnZone(name), heightAt(x, z), sunLight, ... }
import * as THREE from 'three';
import { createSky, createMountains, SUN_DIR, PALETTE } from './sky.js';
import { createWater } from './water.js';
import { createClouds } from './clouds.js';
import { Props } from './props.js';
import { CHUNK, NUM_CHUNKS, TerrainChunk, ZoneSchedule, createTerrainMaterial, heightAt as terrainHeight, riverX } from './terrain.js';

export { SUN_DIR, PALETTE, riverX };

const FOG_DENSITY = 0.00052;

/**
 * Build the scrolling world. The camera stays near z=0 and the terrain group
 * slides toward +z; `dist` is the travel distance (world z = -dist at the player).
 */
export function createWorld(ctx) {
  const { scene, camera, renderer } = ctx;
  const rng = ctx.rng;
  const group = new THREE.Group();          // scrolling content (terrain + props)
  const statics = new THREE.Group();        // camera-following backdrop (sky, mountains, water, clouds)
  const root = new THREE.Group();
  root.add(group, statics);

  // ---- atmosphere & lights
  scene.fog = new THREE.FogExp2(PALETTE.fog.clone(), FOG_DENSITY);
  scene.background = PALETTE.fog.clone();
  renderer.toneMappingExposure = 1.12;
  if (ctx.bloom) { ctx.bloom.strength = 0.42; ctx.bloom.radius = 0.55; ctx.bloom.threshold = 0.82; }

  const hemi = new THREE.HemisphereLight(0x8fbcff, 0x4a5a3a, 0.75);
  const sun = new THREE.DirectionalLight(0xfff0d8, 3.0);
  sun.castShadow = true;
  sun.shadow.mapSize.set(1024, 1024);
  sun.shadow.camera.near = 50; sun.shadow.camera.far = 2600;
  sun.shadow.camera.left = -520; sun.shadow.camera.right = 520; sun.shadow.camera.top = 520; sun.shadow.camera.bottom = -520;
  sun.shadow.bias = -0.0006; sun.shadow.normalBias = 2.0;
  const sunTarget = new THREE.Object3D();
  sun.target = sunTarget;
  statics.add(hemi, sun, sunTarget);

  // ---- backdrop
  const sky = createSky();
  const mountains = createMountains(rng);
  const water = createWater();
  water.uniforms.uFogDensity.value = FOG_DENSITY;
  const clouds = createClouds(rng);
  statics.add(sky.mesh, mountains, water.mesh, clouds.mesh);

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
  let nextIndex = NUM_CHUNKS - 1;

  let dist = 0, time = 0;
  const camPos = new THREE.Vector3();

  const world = {
    group: root,
    scroll: group,
    sunLight: sun,
    schedule,
    get dist() { return dist; },
    /** terrain height at world x and world z (z = -travel) */
    heightAt(x, z) { const d = -z + dist; return terrainHeight(x, d, schedule.paramsAt(d)); },
    riverX(z) { return riverX(-z + dist); },
    zoneName() { return schedule.nameAt(dist); },
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
      sky.uniforms.uTime.value = time;
      // shadow frustum tracks the camera & looks forward
      sunTarget.position.set(camPos.x, 0, camPos.z - 380);
      sun.position.copy(sunTarget.position).addScaledVector(SUN_DIR, 1200);
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
      mountains.geometry.dispose(); mountains.material.dispose();
    },
  };
  world._dbg = { sky: sky.mesh, mountains, water: water.mesh, clouds: clouds.mesh, props: props.group, chunks, sun };
  if (typeof window !== 'undefined') window.__world = world;
  return world;
}

// ---------------------------------------------------------------- standalone showcase
export async function create(ctx) {
  const { scene, camera, input, ui } = ctx;
  const world = createWorld(ctx);
  scene.add(world.group);

  camera.fov = 62; camera.near = 0.5; camera.far = 6000; camera.updateProjectionMatrix();

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
  cap.style.cssText = 'position:absolute;left:32px;bottom:28px;font:600 13px/1.5 system-ui;letter-spacing:.28em;color:#e8f1ff;opacity:.85;text-shadow:0 1px 8px rgba(0,20,60,.6)';
  cap.innerHTML = 'CORNERIA<br><span style="opacity:.6;letter-spacing:.18em;font-weight:500">SECTOR&nbsp;— <span id="wz">PLAINS</span></span>';
  ui.appendChild(cap);
  const zoneEl = cap.querySelector('#wz');

  // camera state with smoothing / overshoot
  const st = { x: 0, y: 55, vx: 0, vy: 0, roll: 0, speed: 210, pitch: 0 };
  const look = new THREE.Vector3();
  let t = 0, lastZone = '';

  return {
    update(dt) {
      t += dt;
      const ax = input.axes.x, ay = input.axes.y;
      // target speed
      let targetSpeed = 210;
      if (input.isHeld('boost')) targetSpeed = 360;
      if (input.isHeld('brake')) targetSpeed = 120;
      st.speed += (targetSpeed - st.speed) * Math.min(1, dt * 2.2);
      // spring-damper lateral motion (anticipation/overshoot)
      const tx = ax * 140, ty = 55 + ay * 45;
      const k = 9, c = 4.2;
      st.vx += ((tx - st.x) * k - st.vx * c) * dt; st.x += st.vx * dt;
      st.vy += ((ty - st.y) * k - st.vy * c) * dt; st.y += st.vy * dt;
      // keep above terrain ahead
      const ground = Math.max(world.heightAt(st.x, -60), world.heightAt(st.x, -180), world.heightAt(st.x, -320) - 10);
      const minY = ground + 26;
      if (st.y < minY) { st.y += (minY - st.y) * Math.min(1, dt * 6); st.vy = Math.max(st.vy, 0); }

      world.update(dt, st.speed);

      // camera pose
      const roll = -st.vx * 0.0028 - ax * 0.12;
      st.roll += (roll - st.roll) * Math.min(1, dt * 6);
      camera.position.set(st.x, st.y + Math.sin(t * 1.3) * 0.6, 0);
      look.set(st.x + st.vx * 0.25 + ax * 30, st.y - 14 + st.vy * 0.15 + ay * 12, -420);
      camera.lookAt(look);
      camera.rotateZ(st.roll);
      const fov = 62 + (st.speed - 210) * 0.045;
      if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }

      const z = world.zoneName();
      if (z !== lastZone) { lastZone = z; zoneEl.textContent = z.toUpperCase(); }
    },
    dispose() { world.dispose(); cap.remove(); },
  };
}
