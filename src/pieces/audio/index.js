/**
 * PIECE: audio — procedural music & SFX engine + Audio Lab showcase.
 *
 * Other pieces: `import { createAudio } from '../audio/api.js'`
 *   const audio = createAudio(ctx); audio.playMusic('main'); audio.sfx('laser'); audio.update(dt)
 */
import { createAudio } from './api.js';
import { createStage } from './visualiser.js';
import { createSoundboard } from './ui.js';

export { createAudio } from './api.js';
export { SONGS } from './music.js';
export { SFX, SFX_ORDER } from './sfx.js';

export async function create(ctx) {
  const { input, engine } = ctx;
  const audio = createAudio(ctx);
  const stage = createStage(ctx, audio);

  const act = (kind, name) => {
    if (kind === 'sfx') audio.sfx(name);
    else if (name === 'stop') audio.stop();
    else { audio.playMusic(name); stage.setSongHue(audio.SONGS[name].hue); }
  };
  const board = createSoundboard(ctx, audio, act);

  // ---- keyboard extras (digits for music, letters for pads not covered by core bindings)
  const KEYS = { KeyC: 'charge', KeyL: 'lockon', KeyX: 'explosionS', KeyV: 'explosionM', KeyH: 'hit', KeyA: 'alarm', KeyS: 'select', KeyM: 'comm' };
  const onKey = (e) => {
    if (e.repeat) return;
    if (e.code === 'Digit1') act('music', 'main');
    else if (e.code === 'Digit2') act('music', 'battle');
    else if (e.code === 'Digit0') act('music', 'stop');
    else if (KEYS[e.code]) act('sfx', KEYS[e.code]);
  };
  addEventListener('keydown', onKey);

  // ---- autoplay script: a scripted "sortie" so the harness shows the whole board
  const seqEvents = [
    [0.0, 'music', 'main'],
    [1.0, 'sfx', 'comm'], [1.6, 'sfx', 'confirm'],
    [2.2, 'sfx', 'lockon'], [2.9, 'sfx', 'charge'],
    [4.3, 'sfx', 'explosionM'], [5.0, 'sfx', 'select'], [5.2, 'sfx', 'select'], [5.4, 'sfx', 'confirm'],
    [6.0, 'music', 'battle'], [6.3, 'sfx', 'alarm'],
    [7.6, 'sfx', 'hit'], [8.0, 'sfx', 'hit'], [8.6, 'sfx', 'lockon'],
    [9.4, 'sfx', 'explosionS'], [9.8, 'sfx', 'explosionS'], [10.4, 'sfx', 'explosionL'],
    [11.5, 'sfx', 'comm'], [12.2, 'sfx', 'charge'], [13.6, 'sfx', 'explosionM'],
    [14.5, 'sfx', 'alarm'], [15.5, 'sfx', 'hit'], [16.0, 'sfx', 'explosionL'],
    [17.0, 'music', 'main'], [17.4, 'sfx', 'confirm'],
  ];
  let evIdx = 0;
  const holdIn = (t, a, b) => t >= a && t < b;
  input.script = (t) => {
    const buttons = [];
    if (holdIn(t, 1.2, 1.9) || holdIn(t, 3.6, 4.2) || holdIn(t, 7.0, 7.7) || holdIn(t, 9.0, 9.7) || holdIn(t, 12.8, 13.5) || holdIn(t, 18.0, 18.9)) buttons.push('fire');
    if (holdIn(t, 2.4, 2.7) || holdIn(t, 11.0, 11.3) || holdIn(t, 19.4, 19.7)) buttons.push('rollR');
    if (holdIn(t, 3.0, 3.4) || holdIn(t, 8.3, 8.7) || holdIn(t, 15.0, 15.4)) buttons.push('boost');
    if (holdIn(t, 4.8, 5.1) || holdIn(t, 10.0, 10.3) || holdIn(t, 16.6, 16.9)) buttons.push('brake');
    if (holdIn(t, 5.6, 5.8) || holdIn(t, 12.4, 12.6)) buttons.push('bomb');
    return { x: Math.sin(t * 0.7), y: Math.cos(t * 0.5) * 0.5, buttons };
  };

  // in real (non-autoplay) sessions the pad is idle until the user starts a track — start the theme on first gesture
  let started = false;
  const startOnGesture = () => { if (!started && !engine.autoplay) { started = true; act('music', 'main'); } };
  addEventListener('pointerdown', startOnGesture);
  addEventListener('keydown', startOnGesture);
  if (!engine.autoplay) { act('music', 'main'); started = true; }   // silent-mode showcase still animates

  let fireTimer = 0, tt = 0;
  return {
    update(dt, t) {
      tt += dt;
      if (engine.autoplay) {
        while (evIdx < seqEvents.length && seqEvents[evIdx][0] <= tt) { const [, k, n] = seqEvents[evIdx++]; act(k, n); }
        if (evIdx >= seqEvents.length && tt > 21) { evIdx = 1; tt = 0.9; }    // loop the demo, keep music going
      }
      // core input bindings -> sfx
      fireTimer -= dt;
      if (input.isHeld('fire') && fireTimer <= 0) { audio.sfx('laser'); fireTimer = 0.16; }
      if (input.wasPressed('bomb')) audio.sfx('explosionL');
      if (input.wasPressed('boost')) audio.sfx('boost');
      if (input.wasPressed('brake')) audio.sfx('brake');
      if (input.wasPressed('rollL') || input.wasPressed('rollR')) audio.sfx('roll');
      if (input.wasPressed('confirm') && !input.wasPressed('fire')) audio.sfx('confirm');

      audio.update(dt);
      stage.update(dt, t);
      board.update(dt);
    },
    dispose() {
      removeEventListener('keydown', onKey);
      removeEventListener('pointerdown', startOnGesture);
      removeEventListener('keydown', startOnGesture);
      audio.stop();
      stage.dispose();
      board.dispose();
    },
  };
}
