/**
 * Public API for other pieces:
 *   import { createAudio } from '../audio/api.js';
 *   const audio = createAudio(ctx);
 *   audio.playMusic('main' | 'battle'); audio.stop(); audio.sfx('laser');
 *   audio.update(dt)   // call once per frame (drives scheduler + ducking + analysis)
 */
import { createAudio as createSynth } from './synth.js';
import { createSequencer, SONGS } from './music.js';
import { SFX, SFX_ORDER } from './sfx.js';

export function createAudio(ctx) {
  const synth = createSynth(ctx);
  const seq = createSequencer(synth);
  const recent = [];   // recently fired sfx for the soundboard flash

  function sfx(name, p = {}) {
    const def = SFX[name];
    if (!def) return;
    synth.resume();
    const t = synth.now() + 0.01;
    def.play(synth, t, p);
    if (def.duck) synth.duck(def.duck, 0.18 + def.duck * 0.5);
    recent.push({ name, t });
    if (recent.length > 24) recent.shift();
  }

  return {
    synth, seq, SONGS, SFX, SFX_ORDER, recent,
    playMusic(name) { synth.resume(); seq.play(name); },
    stop() { seq.stop(); },
    sfx,
    duck: synth.duck,
    update(dt) { seq.update(); synth.update(dt); },
    get now() { return synth.now(); },
  };
}
