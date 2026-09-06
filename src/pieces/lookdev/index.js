// PIECE: lookdev — global look reference. Lighting rig, ACES exposure, bloom,
// colour grade, procedural sky/atmosphere/starfield/nebula. Other pieces import
// { applyLook, makeSky, makePlanet, PRESETS } from here.
import * as THREE from 'three';
import { applyLook } from './look.js';
import { makeSky } from './sky.js';
import { makePlanet } from './planet.js';
import { makeHero } from './hero.js';
import { PRESETS, PRESET_NAMES, resolvePreset, lerpPreset } from './presets.js';

export { applyLook, makeSky, makePlanet, PRESETS, PRESET_NAMES, resolvePreset, lerpPreset };
export { makeHeroMaterials } from './hero.js';

const ORDER = ['space', 'corneria', 'sunset', 'venom'];

export async function create(ctx) {
  const { scene, camera, input, ui } = ctx;

  // ---- camera: 3/4 hero framing, planet limb in the lower third
  camera.fov = 42;
  camera.near = 0.1;
  camera.far = 6000;
  camera.updateProjectionMatrix();

  // ---- look rig (sky + lights + env + grade)
  let idx = 0;
  const look = applyLook(ctx, ORDER[idx], { shadowSize: 9, shadowMap: 1024 });
  look.setFocus(new THREE.Vector3(0, 0.8, 0));

  // ---- planet below the dock
  const planet = makePlanet({ radius: 640, seed: 7 });
  planet.position.set(60, -668, -220);
  planet.rotation.x = Math.PI / 2; // equator (oceans/continents) faces us, not the ice cap
  // Art-direction cheat: the visible cap of the planet is lit from up-right so
  // the terminator sits just past the sun side of the limb (dawn), while the
  // sky's sun stays low for the rim/flare.
  planet.lightDir = new THREE.Vector3(0.55, 0.62, -0.55).normalize();
  planet.setPreset(look.preset);
  scene.add(planet);

  // ---- hero material chart
  const hero = makeHero();
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
  hint.innerHTML = 'FIRE &nbsp;NEXT LOOK<br>STICK &nbsp;ORBIT';
  ui.appendChild(hint);

  // ---- autoplay script: slow orbit sweep, look change every ~3.6s
  input.script = (t) => {
    const x = Math.sin(t * 0.55) * 0.9;
    const y = Math.sin(t * 0.37 + 1.2) * 0.6;
    const cycle = t % 3.6;
    return { x, y, buttons: cycle > 3.3 && cycle < 3.42 ? ['fire'] : [] };
  };

  // ---- camera rig: spring-damped orbit with overshoot on input
  const AZ0 = -0.42, EL0 = 0.15;
  const rig = {
    az: AZ0, el: EL0, dist: 14.5,
    tAz: AZ0, tEl: EL0, tDist: 14.5,
    vAz: 0, vEl: 0, vDist: 0,
    kick: 0,
  };
  const lookAt = new THREE.Vector3(0, 0.9, 0);
  const lookAtCur = new THREE.Vector3(0, 0.9, 0);
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
      // input -> orbit targets (with anticipation: kick pulls back before the settle)
      const ax = input.axes.x, ay = input.axes.y;
      rig.tAz = AZ0 + ax * 0.5;
      rig.tEl = EL0 + ay * 0.12;
      rig.kick = Math.max(0, rig.kick - dt * 2.2);
      rig.tDist = 14.5 - Math.abs(ax) * 1.2 + Math.sin(rig.kick * Math.PI) * 1.6;
      [rig.az, rig.vAz] = spring(rig.az, rig.vAz, rig.tAz, dt, 18, 4.2);
      [rig.el, rig.vEl] = spring(rig.el, rig.vEl, rig.tEl, dt, 18, 4.6);
      [rig.dist, rig.vDist] = spring(rig.dist, rig.vDist, rig.tDist, dt, 30, 7);
      const el = THREE.MathUtils.clamp(rig.el, 0.03, 0.6);
      camera.position.set(
        Math.sin(rig.az) * Math.cos(el) * rig.dist,
        Math.sin(el) * rig.dist + 0.6,
        Math.cos(rig.az) * Math.cos(el) * rig.dist,
      );
      lookAt.set(ax * 0.6, 0.9 - ay * 0.4, 0);
      lookAtCur.lerp(lookAt, 1 - Math.exp(-dt * 4));
      camera.lookAt(lookAtCur);
      // subtle dutch roll following orbit velocity for momentum
      camera.rotateZ(-rig.vAz * 0.06);

      if (input.wasPressed('fire') || input.wasPressed('confirm')) switchLook(1);
      if (input.wasPressed('bomb')) switchLook(-1);

      look.update(dt, t);
      // planet follows the blended preset so its atmosphere fades with the sky
      planet.setPreset(look.preset);
      planet.update(dt, t);
      hero.update(dt, t);
    },
    dispose() {
      look.dispose();
      scene.remove(planet); planet.disposePlanet();
      scene.remove(hero); hero.disposeHero();
      card.remove(); hint.remove();
      input.script = null;
    },
  };
}
