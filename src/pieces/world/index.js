// PIECE: world — Corneria-style rail level environment.
// Exports createWorld(ctx, opts) -> { group, update(dt, speed), spawnZone(name), heightAt(x, z), sunLight, ... }
import * as THREE from 'three';
import { createSky, createMountains, SUN_DIR, PALETTE } from './sky.js';
import { createWater } from './water.js';
import { createClouds } from './clouds.js';
import { createMotes } from './motes.js';
import { Props } from './props.js';
import { CHUNK, NUM_CHUNKS, ZONES, CORRIDOR, DEFAULT_SCHEDULE, TerrainChunk, ZoneSchedule, createTerrainMaterial, heightAt as terrainHeight, riverX } from './terrain.js';

export { SUN_DIR, PALETTE, riverX, ZONES, CORRIDOR, DEFAULT_SCHEDULE };

/** Lateral half-range the player may steer from the rail centre (the corridor is wider than this + ship). */
export const RAIL_HALF_WIDTH = 105;
/** Vertical envelope of the rail above the water plane. */
export const RAIL_Y = { min: 22, max: 122, cruise: 58 };

export const FOG_DENSITY = 0.00050;
const SUN_DIST = 1400;

/**
 * Build the scrolling world. The camera stays near z=0 and the terrain group
 * slides toward +z; `dist` is the travel distance (world z = -dist at the player).
 *
 * opts.look: an optional lookdev handle (from applyLook) — when given, its sun is
 * reused for shadows and no extra lights are created. Otherwise a self-contained
 * light rig is added.
 * opts.atmosphere (default true): set false to leave scene.fog / scene.background /
 *   exposure / bloom alone (when a lookdev rig owns them).
 * opts.sky (default true): set false to skip the world's own sky dome (use lookdev's).
 * opts.schedule: zone list [{start, name}] in travel units; opts.zoneOffset shifts all
 *   starts (e.g. 1500 = an extra ~7 s of plains); opts.blend = zone cross-fade length.
 * opts.reflection (default true): planar water reflection pass; opts.reflectionSize [w,h].
 *
 * Returned handle: { group, update(dt, speed), preRender(), spawnZone(name), heightAt(x,z),
 *   railX(z), zoneName(), nextZone(), sunLight, dispose() }.
 * Call preRender() after posing the camera each frame (before the engine renders) so the
 * water reflection matches the camera; if omitted it is rendered lazily one frame late.
 */
export function createWorld(ctx, opts = {}) {
  const { scene, camera, renderer } = ctx;
  const rng = ctx.rng;
  const group = new THREE.Group();          // scrolling content (terrain + props)
  const statics = new THREE.Group();        // camera-following backdrop (sky, mountains, water, clouds)
  const root = new THREE.Group();
  root.add(group, statics);
  const atmosphere = opts.atmosphere !== false;

  // ---- atmosphere
  if (atmosphere) {
    scene.fog = new THREE.FogExp2(PALETTE.fog.clone(), FOG_DENSITY);
    scene.background = PALETTE.fog.clone();
  }
  if (!opts.look && atmosphere) {
    renderer.toneMappingExposure = 1.05;
    if (ctx.bloom) { ctx.bloom.strength = 0.45; ctx.bloom.radius = 0.6; ctx.bloom.threshold = 0.85; }
  }

  // ---- lights (own rig unless a lookdev sun is supplied)
  let sun, sunTarget, ownLights = [];
  // Late-afternoon key: low, warm, strong — against a cool sky/ground bounce so shadows read blue.
  if (opts.look?.sun) {
    sun = opts.look.sun; sunTarget = sun.target;
    sun.color.set(0xffd6a4); sun.intensity = 3.9;
    if (opts.look.hemi) { opts.look.hemi.color.set(0x7fb4ff); opts.look.hemi.groundColor.set(0x5a6e4c); opts.look.hemi.intensity = 0.85; }
    if (opts.look.fill) { opts.look.fill.color.set(0x8fbaff); opts.look.fill.intensity = 0.22; }
  } else {
    const hemi = new THREE.HemisphereLight(0x7fb4ff, 0x5a6e4c, 0.85);
    sun = new THREE.DirectionalLight(0xffd6a4, 3.9);
    sunTarget = new THREE.Object3D();
    sun.target = sunTarget;
    const fill = new THREE.DirectionalLight(0x8fbaff, 0.22);
    fill.position.set(400, 200, 600);
    ownLights = [hemi, sun, sunTarget, fill];
    statics.add(...ownLights);
  }
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 200; sun.shadow.camera.far = 2600;
  sun.shadow.camera.left = -520; sun.shadow.camera.right = 520; sun.shadow.camera.top = 520; sun.shadow.camera.bottom = -520;
  sun.shadow.bias = -0.00035; sun.shadow.normalBias = 0.8; sun.shadow.radius = 2;
  sun.shadow.camera.updateProjectionMatrix();
  sun.shadow.needsUpdate = true;

  // ---- backdrop
  const sky = createSky();
  const mountains = createMountains(rng);
  const [rw, rh] = opts.reflectionSize ?? [640, 360];
  const water = createWater({ width: rw, height: rh });
  const useReflection = opts.reflection !== false;
  water.uniforms.uReflOn.value = useReflection ? 1 : 0;
  water.uniforms.uFogDensity.value = FOG_DENSITY;
  const clouds = createClouds(rng);
  clouds.uniforms.uFogDensity.value = FOG_DENSITY * 0.8;
  const motes = createMotes(rng);
  if (opts.sky !== false) statics.add(sky.mesh);
  statics.add(mountains, water.mesh, clouds.mesh, motes.mesh);

  // ---- terrain & props
  const schedule = new ZoneSchedule({ list: opts.schedule, offset: opts.zoneOffset, blend: opts.blend });
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

  let dist = 0, time = 0, reflFresh = false;
  const camPos = new THREE.Vector3();
  const prevShadowAuto = renderer.shadowMap.autoUpdate;
  let reflTick = 0;
  const doReflection = () => {
    if (!useReflection) return;
    // Reflection runs at third frame rate: the 640x360 mirror is heavily ripple-distorted
    // so two frames of lag are invisible, and this cuts the mirrored scene's draw calls
    // (the mirror pass is also what re-renders the shadow maps, so they update at 20 Hz).
    if (reflTick++ % 3) { reflFresh = true; return; }
    water.renderReflection(renderer, scene, camera, [motes.mesh]);
    reflFresh = true;
  };

  const world = {
    group: root,
    scroll: group,
    sunLight: sun,
    schedule,
    props,
    water,
    get dist() { return dist; },
    get time() { return time; },
    /** terrain height at world x and world z (z = -travel) */
    heightAt(x, z) { const d = -z + dist; return terrainHeight(x, d, schedule.paramsAt(d)); },
    riverX(z) { return riverX(-z + dist); },
    /** rail centre-line x at world z (the corridor kept clear of props follows the river) */
    railX(z) { return riverX(-z + dist); },
    zoneName() { return schedule.nameAt(dist); },
    /** zone that starts next and how far ahead it is (for HUD / director) */
    nextZone() { const n = schedule.list.find((z) => z.start > dist); return n ? { name: n.name, ahead: n.start - dist } : null; },
    spawnZone(name) { schedule.spawn(name, dist); },
    /** Render the water reflection for the camera's current pose. Call after posing the camera. */
    preRender() { doReflection(); },
    /** Let callers force a fresh reflection next frame (e.g. after a camera cut). */
    refreshReflection() { reflTick = 0; reflFresh = false; },
    update(dt, speed) {
      // lazy fallback: caller didn't preRender() last frame -> reflect with the previous pose
      if (!reflFresh) doReflection();
      reflFresh = false;
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
      sunTarget.position.set(camPos.x, 20, camPos.z - 360);
      sun.position.copy(sunTarget.position).addScaledVector(SUN_DIR, SUN_DIST);
      sunTarget.updateMatrixWorld();
      sun.updateMatrixWorld();
    },
    dispose() {
      if (atmosphere) scene.fog = null;
      renderer.shadowMap.autoUpdate = prevShadowAuto; renderer.shadowMap.needsUpdate = true;
      root.removeFromParent();
      terrainMat.dispose();
      for (const c of chunks) c.geometry.dispose();
      for (const p of props.pools) { p.mesh.geometry.dispose(); p.mesh.material.dispose(); }
      sky.mesh.geometry.dispose(); sky.mesh.material.dispose();
      water.dispose();
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
      sun: { ...base.sun, dir: [SUN_DIR.x, SUN_DIR.y, SUN_DIR.z], color: 0xffd6a4, intensity: 3.9 },
      hemi: { sky: 0x7fb4ff, ground: 0x55684a, intensity: 0.65 },
      fill: { ...base.fill, color: 0x8fbaff, intensity: 0.22 },
      envIntensity: 0.5,
      fog: { color: 0xbcd4ea, density: FOG_DENSITY },
      exposure: 1.0,
      bloom: { strength: 0.42, radius: 0.6, threshold: 0.86 },
      grade: { ...base.grade, contrast: 1.07, saturation: 1.12, vignette: 0.28, lift: 0x02040a, gain: 0xfff6ec },
    }, { sky: false, shadowSize: 520, shadowMap: 2048 });
  } catch (e) { console.warn('[world] lookdev unavailable, using own light rig', e); }

  // Showcase timeline: a shorter plains opening so the 8 s capture reaches the city canal,
  // then canyon and ocean. (Game code should use the default schedule / zoneOffset instead.)
  const world = createWorld(ctx, { look, schedule: [{ start: 0, name: 'plains' }, { start: 1500, name: 'city' }, { start: 4200, name: 'canyon' }, { start: 6400, name: 'ocean' }, { start: 8400, name: 'plains' }, { start: 10200, name: 'city' }] });
  scene.add(world.group);
  scene.fog.density = FOG_DENSITY;

  camera.fov = 62; camera.near = 0.5; camera.far = 7000; camera.updateProjectionMatrix();

  // scripted demo: deliberate banked weaves down the river, a low skim, a boost through the city gates
  input.script = (t) => {
    const x = Math.sin(t * 0.55) * 0.75 + Math.sin(t * 0.21 + 0.8) * 0.25;
    let y = Math.sin(t * 0.42 + 1.0) * 0.55 + Math.sin(t * 1.1) * 0.15;
    if (t > 5.5 && t < 9) y = -0.75;                 // drop low over the water into the city
    const buttons = [];
    if (t % 16 > 7 && t % 16 < 10.5) buttons.push('boost');
    if (t % 16 > 13.5 && t % 16 < 15) buttons.push('brake');
    return { x, y, buttons };
  };

  // caption
  const cap = document.createElement('div');
  cap.style.cssText = 'position:absolute;left:36px;bottom:30px;font:700 13px/1.6 system-ui,Segoe UI,sans-serif;letter-spacing:.3em;color:#eef5ff;opacity:.9;text-shadow:0 1px 10px rgba(0,25,70,.7)';
  cap.innerHTML = 'CORNERIA<br><span style="opacity:.62;letter-spacing:.2em;font-weight:500">SECTOR&nbsp;— <span id="wz">PLAINS</span></span>';
  ui.appendChild(cap);
  const zoneEl = cap.querySelector('#wz');

  // camera state with smoothing / overshoot. x is an offset from the rail (river centre-line).
  const st = { x: 0, y: RAIL_Y.cruise, vx: 0, vy: 0, roll: 0, speed: 215, railX: 0, railVX: 0 };
  const look3 = new THREE.Vector3();
  let t = 0, lastZone = '';

  // Harness friendliness: in deterministic (fixed-step) mode drain the GL queue each
  // frame so a screenshot never has to wait out a backlog of software-rendered frames.
  const gl = renderer.getContext();
  const syncGL = !!ctx.engine?.fixedStep;
  const syncPx = new Uint8Array(4);
  const drainGL = () => { renderer.setRenderTarget(null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, syncPx); };

  return {
    update(dt) {
      if (syncGL) drainGL();
      t += dt;
      const ax = input.axes.x, ay = input.axes.y;
      let targetSpeed = 215;
      if (input.isHeld('boost')) targetSpeed = 370;
      if (input.isHeld('brake')) targetSpeed = 125;
      st.speed += (targetSpeed - st.speed) * Math.min(1, dt * 2.2);
      world.update(dt, st.speed);
      look?.update(dt, t);

      // the rail itself follows the river (smoothed look-ahead so bends are anticipated, not chased)
      const railTarget = world.railX(-120) * 0.35 + world.railX(-260) * 0.4 + world.railX(-420) * 0.25;
      st.railVX += ((railTarget - st.railX) * 5 - st.railVX * 3.6) * dt; st.railX += st.railVX * dt;
      // spring-damper player offset (anticipation/overshoot), clamped inside the clear corridor
      const tx = ax * RAIL_HALF_WIDTH * 0.92, ty = RAIL_Y.cruise + ay * 46;
      const k = 9, c = 4.2;
      st.vx += ((tx - st.x) * k - st.vx * c) * dt; st.x += st.vx * dt;
      st.vy += ((ty - st.y) * k - st.vy * c) * dt; st.y += st.vy * dt;
      st.x = Math.max(-RAIL_HALF_WIDTH, Math.min(RAIL_HALF_WIDTH, st.x));
      st.y = Math.max(RAIL_Y.min, Math.min(RAIL_Y.max, st.y));
      const cx = st.railX + st.x;
      // keep above terrain ahead
      const ground = Math.max(world.heightAt(cx, -60), world.heightAt(cx, -180), world.heightAt(cx, -320) - 10);
      const minY = ground + 26;
      if (st.y < minY) { st.y += (minY - st.y) * Math.min(1, dt * 6); st.vy = Math.max(st.vy, 0); }

      // camera pose: bank into the rail's own bends as well as the player's input
      const roll = -st.vx * 0.0019 - ax * 0.08 - st.railVX * 0.0012;
      st.roll += (roll - st.roll) * Math.min(1, dt * 6);
      camera.position.set(cx, st.y + Math.sin(t * 1.3) * 0.6, 0);
      look3.set(world.railX(-420) + st.x * 0.6 + st.vx * 0.25 + ax * 30, st.y - 16 + st.vy * 0.15 + ay * 12, -420);
      camera.lookAt(look3);
      camera.rotateZ(st.roll);
      const fov = 62 + (st.speed - 215) * 0.045;
      if (Math.abs(camera.fov - fov) > 0.01) { camera.fov = fov; camera.updateProjectionMatrix(); }
      camera.updateMatrixWorld();
      world.preRender();

      const z = world.zoneName();
      if (z !== lastZone) { lastZone = z; zoneEl.textContent = z.toUpperCase(); }
    },
    dispose() { world.dispose(); look?.dispose(); cap.remove(); },
  };
}
