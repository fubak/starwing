/**
 * Public API for other pieces:
 *   import { createAudio } from '../audio/api.js';
 *   const audio = createAudio(ctx);
 *   audio.playMusic('main' | 'battle');   // crossfades if something else is already playing
 *   audio.stop();                          // fades the music out
 *   audio.sfx(name);                       // unknown names are ignored silently
 *   audio.update(dt)                       // call once per frame (drives scheduler + ducking + analysis)
 *
 * SFX NAMES (canonical):
 *   'laser'      twin laser bolt          'charge'     charge-up + big bolt (1s)
 *   'lockon'     lock-on triple beep      'boost'      boost whoosh
 *   'brake'      brake whine              'roll'       barrel roll
 *   'explosionS' / 'explosionM' / 'explosionL'  small / medium / large explosion
 *   'hit'        player hit               'alarm'      danger alarm (4 pulses)
 *   'select'     UI cursor move           'confirm'    UI confirm chime
 *   'comm'       incoming-transmission chirp
 * ALIASES (also accepted): menu/cursor/ui -> select, ok/accept/start -> confirm, lock/target -> lockon,
 *   fire/shot/shoot -> laser, bomb/nova -> explosionL, explosion -> explosionM, barrel/barrelroll -> roll,
 *   damage/hurt -> hit, radio/transmission -> comm, warning -> alarm.
 */
import { createAudio as createSynth } from './synth.js';
import { createSequencer, SONGS } from './music.js';
import { SFX, SFX_ORDER } from './sfx.js';

export const SFX_ALIASES = {
  menu: 'select', cursor: 'select', ui: 'select', move: 'select',
  ok: 'confirm', accept: 'confirm', start: 'confirm', enter: 'confirm',
  lock: 'lockon', target: 'lockon', lockOn: 'lockon',
  fire: 'laser', shot: 'laser', shoot: 'laser', twinlaser: 'laser',
  bomb: 'explosionL', nova: 'explosionL', explosion: 'explosionM', explode: 'explosionM', explosionSmall: 'explosionS', explosionLarge: 'explosionL',
  barrel: 'roll', barrelroll: 'roll', barrelRoll: 'roll',
  damage: 'hit', hurt: 'hit', impact: 'hit',
  radio: 'comm', transmission: 'comm', chirp: 'comm',
  warning: 'alarm', danger: 'alarm',
};
export const SFX_NAMES = SFX_ORDER.slice();

export function createAudio(ctx) {
  const synth = createSynth(ctx);
  const seq = createSequencer(synth);
  const recent = [];   // recently fired sfx for the soundboard flash

  function sfx(name, p = {}) {
    const key = SFX[name] ? name : SFX_ALIASES[name];
    const def = SFX[key];
    if (!def) return false;                 // unknown name: ignore silently
    synth.resume();
    const t = synth.now() + 0.01;
    def.play(synth, t, p);
    if (def.duck) synth.duck(def.duck, 0.18 + def.duck * 0.5);
    recent.push({ name: key, t });
    if (recent.length > 24) recent.shift();
    return true;
  }

  return {
    synth, seq, SONGS, SFX, SFX_ORDER, SFX_NAMES, SFX_ALIASES, recent,
    playMusic(name) { if (!SONGS[name]) return false; synth.resume(); seq.play(name); return true; },
    stop() { seq.stop(); },
    sfx,
    has(name) { return !!(SFX[name] || SFX[SFX_ALIASES[name]]); },
    duck: synth.duck,
    update(dt) { seq.update(); synth.update(dt); },
    get now() { return synth.now(); },
    get playing() { return seq.name; },
  };
}
