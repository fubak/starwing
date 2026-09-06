// PIECE: lookdev — global look reference. Lighting rig, ACES exposure, bloom,
// colour grade, procedural sky/atmosphere/starfield/nebula. Other pieces import
// { applyLook, makeSky, makePlanet, PRESETS } from here.
import * as THREE from 'three';
import { applyLook } from './look.js';
import { makeSky } from './sky.js';
import { makePlanet } from './planet.js';
import { makeHeroScene } from './scene.js';
import { PRESETS, PRESET_NAMES, resolvePreset, lerpPreset } from './presets.js';

export { applyLook, makeSky, makePlanet, PRESETS, PRESET_NAMES, resolvePreset, lerpPreset };
export { makeHeroMaterials, makeHero } from './hero.js';
export { makeHeroScene } from './scene.js';

const ORDER = ['space', 'corneria', 'sunset', 'venom'];

export async function create(ctx) {
  const { scene, camera, input, ui } = ctx;

  // ---- camera: low chase cam, planet limb arcing through the lower third
  camera.fov = 40;
  camera.near = 0.1;
  camera.far = 9000;
  camera.updateProjectionMatrix();

  // ---- look rig (sky + lights + env + grade)
  let idx = 0;
  const look = applyLook(ctx, ORDER[idx], { shadowSize: 7, shadowMap: 1024 });
  look.setFocus(new THREE.Vector3(0, 0, 0));

  // ---- planet: we skim its upper atmosphere, limb depression ~15 degrees
  const PR = 1500;
  const planet = makePlanet({ radius: PR, seed: 7, haloScale: 1.04, gpu: true, renderer: ctx.renderer });
  planet.position.set(120, -PR - 62, -420);
  // spin about the pole (Y, applied first in XYZ order) to put a coastline
  // under the flight, then tilt so the equator faces us, not the ice cap
  const qs = new URLSearchParams(location.search);
  const lon = Number(qs.get('ld_lon') ?? 1.6);
  planet.rotation.set(Math.PI / 2, lon, 0);
  if (qs.has('ld_haze')) planet.children[0].material.uniforms.uHazeK.value = Number(qs.get('ld_haze'));
  // Art-direction cheat: the visible cap is lit from up-right-ahead so the
  // terminator (city lights) sits on the far left while the sky's sun stays
  // low on the right for the rim/flare.
  planet.lightDir = new THREE.Vector3(0.66, 0.42, -0.62).normalize();
  planet.setPreset(look.preset);
  planet.update(0, 0, camera);
  scene.add(planet);

  // ---- hero: Arwing flight + orbital gate
  const hero = makeHeroScene();
  scene.add(hero);

  // ---- UI: preset title card
  const card = document.createElement('div');
  card.style.cssText = `position:absolute;left:48px;bottom:44px;color:#fff;font-family:"Segoe UI",system-ui,sans-serif;
    text-shadow:0 2px 12px rgba(0,0,0,.6);transform:skewX(-8deg);transition:opacity .25s`;
  card.innerHTML = `
    <div style="font:700 11px/1 sans-serif;letter-spacing:.42em;opacity:.7;margin-bottom:8px">STARWING &nbsp;·&nbsp; LOOK DEVELOPMENT</div>
    <div id="ld-title" style="font:800 34px/1 sans-serif;letter-spacing:.12em"></div>
    <div style="height:3px;width:120px;background:linear-gradient(90deg,#6fb8ff,rgba(111,184,255,0));margin-top:10px"></div>
    <div id="ld-sub" style="font:500 12px/1.4 sans-serif;letter-spacing:.18em;opacity:.6;margin-top:10px"></div>`;
  ui.appendChild(card);
  const title = card.querySelector('#ld-title');
  const sub = card.querySelector('#ld-sub');
  const setCard = (name) => {
    const p = PRESETS[name];
    title.textContent = p.label;
    sub.textContent = `ACES · EXP ${p.exposure.toFixed(2)} · BLOOM ${p.bloom.strength.toFixed(2)} · ${name.toUpperCase()}`;
    card.style.opacity = '0'; requestAnimationFrame(() => (card.style.opacity = '1'));
  };
  setCard(ORDER[idx]);

  const hint = document.createElement('div');
  hint.style.cssText = `position:absolute;right:48px;bottom:48px;color:#fff;opacity:.55;font:600 11px/1.6 sans-serif;letter-spacing:.3em;text-align:right;text-shadow:0 2px 8px rgba(0,0,0,.6)`;
  hint.innerHTML = 'BOMB &nbsp;NEXT LOOK<br>FIRE &nbsp;LASERS &nbsp;·&nbsp; BOOST<br>STICK &nbsp;FLY';
  ui.appendChild(hint);

  // ---- autoplay script: banking S-turns, laser bursts, a boost, look change every 4 s
  input.script = (t) => {
    const x = Math.sin(t * 0.6) * 0.9 + Math.sin(t * 1.7) * 0.15;
    const y = Math.sin(t * 0.43 + 1.2) * 0.5;
    const cycle = t % 4.0;
    const buttons = [];
    if (cycle > 3.8 && cycle < 3.92) buttons.push('bomb');
    if ((cycle > 0.8 && cycle < 1.5) || (cycle > 2.4 && cycle < 2.9)) buttons.push('fire');
    if (cycle > 1.6 && cycle < 2.3) buttons.push('boost');
    return { x, y, buttons };
  };

  // ---- chase camera: spring-lagged behind the lead, dutch roll with the bank
  const rig = { kick: 0, roll: 0, vRoll: 0, dist: 19, vDist: 0 };
  const camPos = new THREE.Vector3(0, 3.4, 19);
  const camGoal = new THREE.Vector3();
  const lookAtCur = new THREE.Vector3(0, 0.5, -20);
  const lookAt = new THREE.Vector3();
  const spring = (x, v, target, dt, k = 26, c = 5.5) => {
    const a = (target - x) * k - v * c;
    v += a * dt; x += v * dt;
    return [x, v];
  };

  const switchLook = (dir = 1) => {
    idx = (idx + dir + ORDER.length) % ORDER.length;
    look.setPreset(ORDER[idx]);
    hero.pop();
    look.flash(0.35);
    rig.kick = 1;
    setCard(ORDER[idx]);
    ctx.audio?.tone({ type: 'triangle', f0: 520, f1: 880, dur: 0.18, gain: 0.12 });
  };

  // Harness friendliness: in deterministic (fixed-step) mode keep the GL command
  // queue drained so stepping N frames doesn't build a backlog the screenshot
  // then has to wait out on software GL.
  const gl = ctx.renderer.getContext();
  const syncGL = !!ctx.engine?.fixedStep;
  const syncPx = new Uint8Array(4);
  const drainGL = () => { ctx.renderer.setRenderTarget(null); gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, syncPx); };

  return {
    update(dt, t) {
      if (syncGL) drainGL();
      if (input.wasPressed('bomb') || input.wasPressed('confirm')) switchLook(1);

      hero.update(dt, t, camera, input);

      // camera: sits low and behind, lags the ship's lateral motion (~45%) so
      // the Arwing slides across frame on turns; boost pulls the camera back
      // with a kick (anticipation) before it settles in.
      const ax = input.axes.x;
      const s = hero.state;
      rig.kick = Math.max(0, rig.kick - dt * 2.2);
      const tDist = 19 + s.boost * 3.5 + Math.sin(rig.kick * Math.PI) * 1.6 - Math.abs(ax) * 0.8;
      [rig.dist, rig.vDist] = spring(rig.dist, rig.vDist, tDist, dt, 24, 6.5);
      camGoal.set(s.x * 0.45 - ax * 1.4 + 2.5, 3.6 + s.y * 0.4, rig.dist);
      camPos.lerp(camGoal, 1 - Math.exp(-dt * 5));
      camera.position.copy(camPos);
      // aim a little right of and above the ship so it sits in the lower-left third
      lookAt.set(s.x * 0.75 + ax * 1.8 + 5.5, s.y * 0.7 + 1.4, -30);
      lookAtCur.lerp(lookAt, 1 - Math.exp(-dt * 4.5));
      camera.lookAt(lookAtCur);
      // dutch roll: the camera leans into the bank with a soft spring
      [rig.roll, rig.vRoll] = spring(rig.roll, rig.vRoll, -hero.lead.state.bank * 0.16, dt, 20, 6);
      camera.rotateZ(rig.roll);
      look.setFocus(hero.lead.group.position);

      look.update(dt, t);
      // planet follows the blended preset so its atmosphere fades with the sky
      planet.setPreset(look.preset);
      planet.update(dt, t, camera);
    },
    dispose() {
      look.dispose();
      scene.remove(planet); planet.disposePlanet();
      scene.remove(hero); hero.disposeScene();
      card.remove(); hint.remove();
      input.script = null;
    },
  };
}
