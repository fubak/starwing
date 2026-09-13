/**
 * FULL GAME (integrator). One engine piece that directs the campaign:
 *
 *   title -> intro cinematic -> rail mission over Corneria -> GORGON boss
 *   -> all-range asteroid-belt battle -> on-foot hangar -> mission complete
 *
 * Each stage is a child "piece" created against the shared ctx and disposed
 * before the next one starts; the campaign layer owns what must persist across
 * stages: the shared HUD, music/sfx, fades + letterbox, the pause menu and the
 * score. Pieces that fail to load are skipped (the campaign continues).
 *
 *   ?stage=<title|intro|rail|boss|space|onfoot|complete>   jump straight in
 */
import * as THREE from 'three';
import { createGameOverlay } from '../pieces/_shared/overlay.js';

const ORDER = ['title', 'intro', 'rail', 'boss', 'space', 'onfoot', 'complete'];
const FADE_OUT = 0.55, FADE_IN = 0.7;

export async function create(ctx) {
  const { scene, camera, renderer, composer, bloom, input, ui, events, engine } = ctx;
  const q = new URLSearchParams(location.search);
  const autoConfirm = !!(engine?.fixedStep || engine?.autoplay || q.has('fixed') || q.has('autoplay'));

  const overlay = createGameOverlay(ui);
  overlay.setFade(1);

  // ---------- optional shared systems (skipped gracefully if a piece is broken)
  const tryLoad = async (path) => { try { return await import(path); } catch (e) { console.warn(`[game] piece unavailable: ${path}`, e?.message ?? e); return null; } };
  const hudMod = await tryLoad('../pieces/hud/index.js');
  const audioMod = await tryLoad('../pieces/audio/index.js');
  const cine = await tryLoad('../pieces/cinematics/index.js');
  let audio = null;
  try { audio = audioMod?.createAudio ? audioMod.createAudio(ctx) : null; } catch (e) { console.warn('[game] audio disabled', e); }
  // preload stage modules up front so stage switches are synchronous (no black frames in the fixed-step harness)
  const mods = { rail: await tryLoad('./rail.js'), boss: await tryLoad('../pieces/boss/index.js'), space: await tryLoad('../pieces/spacesim/index.js'), onfoot: await tryLoad('../pieces/onfoot/index.js') };
  let hud = null; // created lazily per gameplay stage (it is a full-screen canvas; cinematics get their own overlay)

  const stats = { score: 0, hits: 0, shots: 0, landed: 0 };
  const defaults = { exposure: renderer.toneMappingExposure, bloom: bloom ? { strength: bloom.strength, radius: bloom.radius, threshold: bloom.threshold } : null, fov: camera.fov, near: camera.near, far: camera.far, passes: composer ? composer.passes.slice() : null };

  // ---------- campaign state
  let idx = -1, current = null, currentName = '', loading = false, pending = null;
  let paused = false, pauseGuard = 0, t0 = 0, stageT = 0;
  let disposed = false;
  let failed = null; // { t, reason } while the GAME OVER card is up (stage frozen)
  const GAMEPLAY = ['rail', 'boss', 'space', 'onfoot'];

  const game = {
    hud: null, audio, overlay, stats, ctx,
    /** Called by a stage when it is finished; carries stats forward. */
    next(extra) { if (extra) mergeStats(extra); requestStage(idx + 1); },
    /** Called by a stage when the player is destroyed: freezes the stage under a GAME OVER card. */
    fail(reason = 'ARWING DESTROYED') {
      if (failed || pending !== null || loading) return;
      failed = { t: 0, reason };
      overlay.gameOver(reason); overlay.objective('');
      audio?.duck?.(0.2, 0.5); audio?.sfx?.('alarm');
    },
  };
  function mergeStats(x) { for (const k of ['score', 'hits', 'shots', 'landed']) if (typeof x[k] === 'number') stats[k] += x[k]; }

  /** Reset everything a child piece may have leaked into the shared renderer/camera/composer. */
  function resetShared() {
    input.script = null;
    scene.fog = null; scene.background = null; scene.environment = null;
    renderer.toneMappingExposure = defaults.exposure;
    renderer.shadowMap.needsUpdate = true;
    if (bloom && defaults.bloom) Object.assign(bloom, defaults.bloom);
    camera.fov = defaults.fov; camera.near = defaults.near; camera.far = defaults.far; camera.updateProjectionMatrix();
    camera.up.set(0, 1, 0); camera.position.set(0, 0, 10); camera.quaternion.identity(); camera.zoom = 1;
    if (composer && defaults.passes) {
      for (const p of composer.passes.slice()) if (!defaults.passes.includes(p)) { composer.removePass(p); p.dispose?.(); }
      for (const p of defaults.passes) if (!composer.passes.includes(p)) composer.addPass(p);
      for (const p of defaults.passes) p.enabled = true;
    }
    // stray scene objects (pieces are expected to clean up; this is the safety net)
    for (const o of scene.children.slice()) scene.remove(o);
    // stray UI (keep our overlay on top)
    for (const el of Array.from(ui.children)) if (el !== overlay.root) el.remove();
    overlay.raise();
    overlay.objective('');
  }

  function disposeCurrent() {
    if (current) { try { current.dispose?.(); } catch (e) { console.warn('[game] dispose failed', currentName, e); } }
    current = null;
    if (hud) { try { hud.dispose(); } catch {} hud = null; game.hud = null; }
    if (cine) { try { cine.disposeCinematics(); } catch {} }
    resetShared();
  }

  // ---------- stage factories ---------------------------------------------------------
  const stages = {
    async title() {
      if (!cine) return null;
      const d = cine.getCinematics(ctx);
      const done = cine.playTitle(ctx, { auto: autoConfirm });
      let finished = false; done.then(() => { finished = true; });
      audio?.playMusic?.('main');
      overlay.setFade(0);
      return { update(dt, t) { d.update(dt, t); if (finished) game.next(); }, dispose() { d.dispose(); } };
    },
    async intro() {
      if (!cine) return null;
      const d = cine.getCinematics(ctx);
      const done = cine.playIntro(ctx);
      let finished = false; done.then(() => { finished = true; });
      overlay.setFade(0);
      overlay.hint('<b>ENTER</b> SKIP', 4);
      return { update(dt, t) { d.update(dt, t); if (finished || (stageT > 0.8 && (input.wasPressed('confirm') || input.wasPressed('pause')))) game.next(); }, dispose() { d.dispose(); } };
    },
    async rail() {
      const mod = mods.rail; if (!mod) return null;
      hud = hudMod?.createHud ? hudMod.createHud(ctx) : null; game.hud = hud;
      if (!hud) return null;
      overlay.raise();
      overlay.letterbox(false);
      return mod.createRail(ctx, game);
    },
    async boss() {
      const mod = mods.boss; if (!mod?.create) return null;
      audio?.playMusic?.('battle');
      const piece = await mod.create(ctx, { embedded: true, hudTop: 70 });
      overlay.raise();
      overlay.caption('MISSION 1 · CORNERIA', 'GORGON', 'VENOMIAN DREADNOUGHT', 3.4);
      overlay.objective('OBJECTIVE', 'DESTROY THE GORGON');
      let won = -1, dead = false;
      return {
        update(dt, t) {
          piece.update(dt, t);
          const S = piece.debug?.S;
          if ((S?.won || S?.destruct?.won) && won < 0) { won = 0; overlay.objective('', ''); mergeStats({ score: 8000 + Math.round(S.score ?? 0), hits: 1 + (S.hits ?? 0), shots: S.hits ?? 0, landed: S.hits ?? 0 }); }
          if (won >= 0) { won += dt; if (won > 5.2 && !dead) { dead = true; game.next(); } }
          else if (S?.player && S.player.shield <= 0 && !S.intro && !S.destruct) game.fail('THE GORGON GOT YOU');
          if (won < 0 && stageT > 240 && !dead) { dead = true; game.next(); } // safety: never trap the player
        },
        dispose() { piece.dispose(); },
      };
    },
    async space() {
      const mod = mods.space; if (!mod?.create) return null;
      audio?.playMusic?.('battle');
      const piece = await mod.create(ctx, { respawn: false });
      piece.setRespawn?.(false);
      overlay.raise();
      overlay.caption('MISSION 2 · METEO', 'ASTEROID BELT', 'ALL-RANGE MODE', 3.4);
      overlay.hint('<b>WASD</b> PITCH / ROLL &nbsp; <b>SPACE</b> FIRE &nbsp; <b>SHIFT</b> BOOST &nbsp; <b>CTRL</b> BRAKE &nbsp; <b>Q/E</b> ROLL', 9);
      const LIMIT = 180; // hard cap so the campaign can never stall here
      let ended = false, doneT = -1, lastLeft = -1;
      return {
        update(dt, t) {
          piece.update(dt, t);
          const left = piece.dronesRemaining ?? 0;
          if (doneT < 0) {
            if (left !== lastLeft) { lastLeft = left; overlay.objective('DESTROY THE DRONES · REMAINING', `${left}`); }
            if (left === 0 || piece.complete) { doneT = 0; overlay.objective('', ''); }
          } else doneT += dt;
          if (((doneT > 3.4) || stageT > LIMIT) && !ended) { ended = true; mergeStats({ score: piece.score ?? 0, hits: piece.kills ?? 0, shots: (piece.kills ?? 0) * 4, landed: (piece.kills ?? 0) * 3 }); game.next(); }
        },
        dispose() { piece.dispose(); },
      };
    },
    async onfoot() {
      const mod = mods.onfoot; if (!mod?.create) return null;
      audio?.playMusic?.('main');
      const piece = await mod.create(ctx);
      overlay.raise();
      overlay.caption('MISSION 3 · VENOM OUTPOST', 'THE HANGAR', 'ON FOOT', 3.4);
      overlay.objective('OBJECTIVE', 'REACH THE BLAST DOOR');
      overlay.hint('<b>WASD</b> RUN &nbsp; <b>SPACE</b> JUMP &nbsp; <b>J</b> BLASTER &nbsp; <b>Q/E</b> ROLL &nbsp; <b>F / ENTER</b> OPEN DOOR', 9);
      let ended = false, doneT = -1;
      return {
        update(dt, t) {
          piece.update(dt, t);
          if (doneT < 0 && (piece.doorUnlocked || piece.complete)) { doneT = 0; overlay.objective('', ''); }
          if (doneT >= 0) doneT += dt;
          if (((doneT > 3.5) || stageT > 180) && !ended) { ended = true; mergeStats({ score: 2500 + (piece.ringsCollected ?? 0) * 200 + (piece.dronesDestroyed ?? 0) * 300, hits: piece.dronesDestroyed ?? 0 }); game.next(); }
        },
        dispose() { piece.dispose(); },
      };
    },
    async complete() {
      if (!cine) return null;
      const d = cine.getCinematics(ctx);
      const acc = stats.shots > 0 ? Math.min(0.99, stats.landed / stats.shots) : 0.72;
      const bonus = 5000 + stats.hits * 60;
      const done = cine.playComplete(ctx, { score: stats.score + bonus, hits: stats.hits, accuracy: acc, bonus });
      audio?.playMusic?.('main');
      let finished = false; done.then(() => { finished = true; });
      overlay.setFade(0);
      return { update(dt, t) { d.update(dt, t); if (finished) { for (const k in stats) stats[k] = 0; requestStage(0); } }, dispose() { d.dispose(); } };
    },
  };

  // ---------- transitions --------------------------------------------------------------
  function requestStage(i) {
    if (pending !== null || loading) return;
    pending = i;
    failed = null; overlay.gameOver(null);
    if (paused) setPaused(false);
    overlay.fadeTo(1, FADE_OUT);
    overlay.letterbox(true);
    audio?.duck?.(0.35, FADE_OUT);
  }

  async function startStage(i) {
    loading = true;
    disposeCurrent();
    idx = ((i % ORDER.length) + ORDER.length) % ORDER.length;
    currentName = ORDER[idx];
    stageT = 0;
    events.emit('campaign:stage', currentName);
    let piece = null;
    try { piece = await stages[currentName](); } catch (e) { console.error(`[game] stage "${currentName}" failed`, e); resetShared(); }
    if (disposed) { piece?.dispose?.(); return; }
    if (!piece) { console.warn(`[game] skipping stage "${currentName}"`); loading = false; pending = null; requestStage(idx + 1); return; }
    current = piece;
    overlay.raise();
    overlay.letterbox(false);
    overlay.fadeTo(0, FADE_IN);
    audio?.duck?.(1, FADE_IN);
    loading = false; pending = null;
  }

  // ---------- pause ------------------------------------------------------------------
  const onBlur = () => { if (current && !paused && ['rail', 'boss', 'space', 'onfoot'].includes(currentName)) setPaused(true); };
  window.addEventListener('blur', onBlur);
  function setPaused(p) {
    paused = p; overlay.setPaused(p); audio?.duck?.(p ? 0.25 : 1, 0.2);
    if (p) audio?.sfx?.('menu'); else audio?.sfx?.('confirm');
  }

  // ---------- go
  const start = ORDER.indexOf(q.get('stage') ?? '');
  startStage(start >= 0 ? start : 0);
  // harness hook (tools / probes): current stage name, fail flag, stats
  if (typeof window !== 'undefined') window.__campaign = { get stage() { return currentName; }, get failed() { return !!failed; }, get paused() { return paused; }, stats, get stageT() { return stageT; } };

  return {
    update(dt, t) {
      stageT += dt;
      overlay.update(dt);
      audio?.update?.(dt);
      // game over: stage frozen under the card; Enter retries the stage, Esc returns to the title, auto-retry after 12s
      if (failed) {
        failed.t += dt;
        // let the wreck play out in slow motion under the card, then freeze
        const k = Math.max(0, 1 - failed.t / 1.8);
        if (k > 0.08 && current && !loading && pending === null) { try { current.update(dt * k, t); } catch (e) { console.warn('[game] post-fail update', e); } }
        if (pending === null && !loading) {
          if ((input.wasPressed('confirm') && failed.t > 0.6) || failed.t > 12) { audio?.sfx?.('confirm'); requestStage(idx); }
          else if (input.wasPressed('pause') && failed.t > 0.5) { audio?.sfx?.('menu'); requestStage(0); }
        }
        if (pending !== null && !loading && overlay.fadeDone) startStage(pending);
        return;
      }
      // pause (gameplay stages only; cinematics take Esc as skip / nothing)
      pauseGuard = Math.max(0, pauseGuard - dt);
      if (input.wasPressed('pause') && current && !loading && pending === null && GAMEPLAY.includes(currentName) && pauseGuard <= 0) { pauseGuard = 0.2; setPaused(!paused); }
      if (paused) { hud?.update?.(0); return; }
      if (pending !== null && !loading) {
        if (overlay.fadeDone) startStage(pending);
        return;
      }
      if (current && !loading) {
        try { current.update(dt, t); } catch (e) { console.error(`[game] stage "${currentName}" update failed`, e); disposeCurrent(); requestStage(idx + 1); }
      }
    },
    dispose() {
      disposed = true;
      if (typeof window !== 'undefined') delete window.__campaign;
      window.removeEventListener('blur', onBlur);
      disposeCurrent();
      audio?.stop?.();
      overlay.dispose();
    },
  };
}
