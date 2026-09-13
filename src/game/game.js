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

  /**
   * Reset everything a child piece may have leaked into the shared
   * renderer/camera/composer. When `keepCine` is set (a cinematic -> cinematic
   * switch), the shared cinematic stage — its lights, env, sky, actors, grade
   * pass and DOM overlay — stays mounted so the next sequence starts instantly.
   */
  function resetShared(keepCine = false) {
    input.script = null;
    const d = keepCine && cine?.getCinematics ? cine.getCinematics(ctx) : null;
    const keep = keepCine && d ? d.keepSet() : null; // Set of scene children + DOM nodes owned by the live director
    scene.fog = keepCine ? scene.fog : null;
    scene.background = keepCine ? scene.background : null;
    scene.environment = keepCine ? scene.environment : null;
    renderer.toneMappingExposure = defaults.exposure;
    renderer.shadowMap.needsUpdate = true;
    if (bloom && defaults.bloom) Object.assign(bloom, defaults.bloom);
    camera.fov = defaults.fov; camera.near = defaults.near; camera.far = defaults.far; camera.updateProjectionMatrix();
    camera.up.set(0, 1, 0); camera.position.set(0, 0, 10); camera.quaternion.identity(); camera.zoom = 1;
    if (composer && defaults.passes) {
      for (const p of composer.passes.slice()) if (!defaults.passes.includes(p) && !(keepCine && p.isLookGrade)) { composer.removePass(p); p.dispose?.(); }
      for (const p of defaults.passes) if (!composer.passes.includes(p)) composer.addPass(p);
      for (const p of defaults.passes) p.enabled = true;
    }
    // stray scene objects (pieces are expected to clean up; this is the safety net)
    for (const o of scene.children.slice()) if (!keep?.has(o)) scene.remove(o);
    // stray UI (keep our overlay on top; also keep the live director's overlay)
    for (const el of Array.from(ui.children)) if (el !== overlay.root && !keep?.has(el)) el.remove();
    overlay.raise();
    overlay.objective('');
  }

  function disposeCurrent(next) {
    if (current) { try { current.dispose?.(); } catch (e) { console.warn('[game] dispose failed', currentName, e); } }
    current = null;
    if (hud) { try { hud.dispose(); } catch {} hud = null; game.hud = null; }
    const keepCine = CINE.has(currentName) && CINE.has(next);
    // Cinematic -> gameplay: park (don't tear down) the shared director so the next
    // cinematic stage (complete / a title revisit) reattaches instantly.
    if (cine && !keepCine) { try { cine.parkCinematics?.(); } catch {} }
    resetShared(keepCine);
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
      // The director is shared across cinematic stages — the campaign disposes it
      // (via disposeCinematics) only when the next stage isn't a cinematic.
      return { update(dt, t) { d.update(dt, t); if (finished) game.next(); }, dispose() {} };
    },
    async intro() {
      if (!cine) return null;
      const d = cine.getCinematics(ctx);
      const done = cine.playIntro(ctx);
      let finished = false; done.then(() => { finished = true; });
      overlay.setFade(0);
      overlay.hint('<b>ENTER</b> SKIP', 4);
      return { update(dt, t) { d.update(dt, t); if (finished || (stageT > 0.8 && (input.wasPressed('confirm') || input.wasPressed('pause')))) game.next(); }, dispose() {} };
    },
    async rail() {
      const mod = mods.rail; if (!mod) return null;
      let piece = null;
      const b = takeWarm('rail');
      if (b) piece = b.activate();
      else piece = await mod.createRail(ctx, game, hudMod);
      hud = game.hud;
      if (!piece || !hud) { piece?.dispose?.(); return null; }
      overlay.raise();
      overlay.letterbox(false);
      return piece;
    },
    async boss() {
      const mod = mods.boss; if (!mod?.create) return null;
      audio?.playMusic?.('battle');
      const piece = await mod.create(ctx, { embedded: true, hudTop: 70 });
      overlay.raise();
      overlay.caption('MISSION 1 · CORNERIA', 'GORGON', 'VENOMIAN DREADNOUGHT', 3.4);
      let won = -1, dead = false;
      return {
        update(dt, t) {
          piece.update(dt, t);
          // (no overlay objective here: the boss HUD already draws the name + gauge at top-centre)
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
      if (typeof window !== 'undefined') window.__space = piece; // probe hook
      overlay.raise();
      overlay.caption('MISSION 2 · METEO', 'ASTEROID BELT', 'ALL-RANGE MODE', 3.4);
      // (piece draws its own control strip — no overlay hint here)
      const LIMIT = 180; // hard cap so the campaign can never stall here
      let ended = false, doneT = -1, lastLeft = -1;
      return {
        update(dt, t) {
          piece.update(dt, t);
          const left = piece.dronesRemaining ?? 0;
          if (doneT < 0) {
            // hold the objective line until the entry caption has cleared
            if (stageT > 4.0 && left !== lastLeft) { lastLeft = left; overlay.objective('DESTROY THE DRONES · REMAINING', `${left}`); }
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
      ctx.onfoot = { hudTitle: false };          // the campaign caption does the title card
      const piece = await mod.create(ctx);
      overlay.raise();
      overlay.caption('MISSION 3 · VENOM OUTPOST', 'THE HANGAR', 'ON FOOT', 3.4);
      // (piece draws its own control strip — no overlay hint here)
      let ended = false, doneT = -1, objSet = false;
      return {
        update(dt, t) {
          piece.update(dt, t);
          if (!objSet && stageT > 4.0) { objSet = true; overlay.objective('OBJECTIVE', 'REACH THE BLAST DOOR'); }
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
      return { update(dt, t) { d.update(dt, t); if (finished) { for (const k in stats) stats[k] = 0; requestStage(0); } }, dispose() {} };
    },
  };
  // Incremental-build hooks: pumpWarm() drives these one step per frame while the
  // previous stage plays, so the switch is a reparent + look-install, not a rebuild.
  stages.rail.begin = () => mods.rail?.beginRail?.(ctx, game, hudMod) ?? null;

  // ---------- transitions --------------------------------------------------------------
  // Stages that run on the shared cinematic director (one Stage: Great Fox + hangar +
  // squadron + planet). Cinematic -> cinematic switches keep the director alive so
  // title -> intro (and complete -> title) cost ~nothing: no rebuild, no shader recompile.
  const CINE = new Set(['title', 'intro', 'complete']);

  function requestStage(i) {
    if (pending !== null || loading) return;
    pending = i;
    failed = null; overlay.gameOver(null);
    if (paused) setPaused(false);
    overlay.fadeTo(1, FADE_OUT);
    overlay.letterbox(true);
    audio?.duck?.(0.35, FADE_OUT);
  }

  // ---------- seamless transitions: incremental prebuild ("warm") -------------
  // While a stage is playing, build the NEXT stage one unit per frame (rail is
  // the heavy one: 11 terrain chunks of CPU noise + an Arwing + vfx/enemy pools).
  // Everything lands in a parked, invisible group; at stage-switch time
  // activate() just reparents it and installs the deferred look — the fade
  // covers a millisecond-scale swap instead of a multi-hundred-ms build.
  let warm = null; // { name, step(), done, activate(), abort() }
  function pumpWarm() {
    if (disposed || loading || paused || failed) return;
    if (!current && pending === null) return;              // still booting
    const ti = pending !== null ? pending : idx + 1;
    const want = ORDER[((ti % ORDER.length) + ORDER.length) % ORDER.length];
    if (want === currentName) { return; }                  // retry: the live stage, nothing to warm
    if (warm && warm.name !== want) { try { warm.abort?.(); } catch {} warm = null; }
    if (!warm) {
      const mk = stages[want]?.begin;
      if (!mk) return;
      let b = null;
      try { b = mk(); } catch (e) { console.warn(`[game] begin "${want}" failed`, e); }
      if (!b) return;
      b.name = want; // tag directly: getters (done/remaining) must stay live
      warm = b;
    }
    try {
      if (ctx.engine?.fixedStep) warm.step();              // deterministic: exactly one unit per frame
      else { const t0 = performance.now(); do { warm.step(); } while (!warm.done && performance.now() - t0 < 5); }
    } catch (e) {
      console.warn(`[game] warm "${warm.name}" failed`, e);
      try { warm.abort?.(); } catch {}
      warm = null;
    }
  }

  /** Consume the warmed build for `name` if there is one; finishes it inline if partial. */
  function takeWarm(name) {
    if (!warm) return null;
    if (warm.name !== name) { try { warm.abort?.(); } catch {} warm = null; return null; }
    const b = warm; warm = null;
    while (!b.done) b.step();                              // e.g. intro skipped early: pay the remainder once
    return b;
  }

  async function startStage(i) {
    loading = true;
    const mark = { from: currentName || '(boot)', t0: performance.now() };
    const nextName = ORDER[((i % ORDER.length) + ORDER.length) % ORDER.length];
    const keepCine = CINE.has(currentName) && CINE.has(nextName);
    disposeCurrent(nextName);
    mark.tDispose = performance.now();
    idx = ((i % ORDER.length) + ORDER.length) % ORDER.length;
    currentName = ORDER[idx];
    stageT = 0;
    events.emit('campaign:stage', currentName);
    let piece = null;
    try { piece = await stages[currentName](); } catch (e) { console.error(`[game] stage "${currentName}" failed`, e); resetShared(); }
    if (disposed) { piece?.dispose?.(); return; }
    if (!piece) { console.warn(`[game] skipping stage "${currentName}"`); loading = false; pending = null; requestStage(idx + 1); return; }
    mark.tBuild = performance.now();
    current = piece;
    overlay.raise();
    overlay.letterbox(false);
    // Pre-compile the new stage's shaders while the fade is still black so the first
    // visible frame doesn't pay every program's compile at once. Skipped for
    // cinematic -> cinematic switches: the shared director's programs are already
    // warm, so compileAsync would only re-validate them under a black screen.
    if (!keepCine) {
      if (renderer.compileAsync) {
        try { await Promise.race([renderer.compileAsync(scene, piece.camera ?? camera), new Promise((r) => setTimeout(r, 120))]); } catch {}
      } else if (renderer.compile) {
        try { renderer.compile(scene, piece.camera ?? camera); } catch {}
      }
    }
    overlay.fadeTo(0, FADE_IN);
    audio?.duck?.(1, FADE_IN);
    mark.tReady = performance.now();
    mark.to = currentName;
    mark.disposeMs = mark.tDispose - mark.t0;
    mark.buildMs = mark.tBuild - mark.tDispose;
    mark.compileMs = mark.tReady - mark.tBuild;
    if (typeof window !== 'undefined') (window.__campaign.stageLog ??= []).push(mark);
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
  // harness hook (tools / probes): current stage name, fail flag, stats, warm progress
  if (typeof window !== 'undefined') window.__campaign = { get stage() { return currentName; }, get failed() { return !!failed; }, get paused() { return paused; }, stats, get stageT() { return stageT; }, get warm() { return warm ? { name: warm.name, remaining: warm.remaining ?? 0, done: !!warm.done } : null; } };

  return {
    update(dt, t) {
      stageT += dt;
      overlay.update(dt);
      audio?.update?.(dt);
      pumpWarm();
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
      if (warm) { try { warm.abort?.(); } catch {} warm = null; }
      disposeCurrent();
      try { cine?.disposeCinematics?.(); } catch {}
      audio?.stop?.();
      overlay.dispose();
    },
  };
}
