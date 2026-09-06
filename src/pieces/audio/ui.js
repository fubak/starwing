/** Soundboard + readouts (DOM overlay). */
export function createSoundboard(ctx, audio, onAction) {
  const { ui } = ctx;
  const root = document.createElement('div');
  root.className = 'aud-root';
  root.innerHTML = `
  <style>
    .aud-root{position:absolute;inset:0;font-family:"Segoe UI",system-ui,sans-serif;color:#e8f4ff;pointer-events:none;--c:#3ee6ff}
    .aud-vig{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 45%, rgba(0,0,0,0) 45%, rgba(2,4,12,.55) 100%)}
    .aud-plinth{position:absolute;left:0;right:0;bottom:0;height:190px;background:linear-gradient(180deg,rgba(3,6,16,0) 0%,rgba(3,6,16,.55) 40%,rgba(3,6,16,.8) 100%)}
    .aud-plinth::before{content:"";position:absolute;left:34px;right:34px;top:60px;height:1px;background:linear-gradient(90deg,transparent,var(--c),transparent);opacity:.35}
    .aud-tl{position:absolute;left:34px;top:26px}
    .aud-kicker{font-size:11px;letter-spacing:.42em;opacity:.7;font-weight:600}
    .aud-kicker b{color:var(--c);font-weight:700}
    .aud-title{font-size:44px;font-weight:800;letter-spacing:.06em;line-height:1;margin-top:6px;text-shadow:0 0 18px rgba(62,230,255,.35),0 2px 0 rgba(0,0,0,.6);font-style:italic}
    .aud-sub{font-size:12px;letter-spacing:.35em;opacity:.75;margin-top:6px;display:flex;gap:14px;align-items:center}
    .aud-sub .bpm{color:var(--c);font-weight:700}
    .aud-beats{display:flex;gap:6px;margin-top:12px}
    .aud-beats i{width:26px;height:6px;border-radius:3px;background:rgba(255,255,255,.12);transition:background .05s,box-shadow .05s}
    .aud-beats i.on{background:var(--c);box-shadow:0 0 12px var(--c)}
    .aud-tracks{position:absolute;left:34px;top:190px;font-size:11px;letter-spacing:.22em;font-weight:600}
    .aud-tracks div{display:flex;align-items:center;gap:10px;margin:5px 0;opacity:.55;transition:opacity .08s}
    .aud-tracks div.on{opacity:1}
    .aud-tracks i{width:8px;height:8px;border-radius:50%;background:rgba(255,255,255,.15);box-shadow:none;transition:all .08s}
    .aud-tracks div.on i{background:var(--c);box-shadow:0 0 10px var(--c)}
    .aud-tracks b{width:56px;height:3px;background:rgba(255,255,255,.08);border-radius:2px;overflow:hidden;position:relative}
    .aud-tracks b::after{content:"";position:absolute;inset:0;transform:scaleX(0);transform-origin:left;background:var(--c);transition:transform .08s}
    .aud-tracks div.on b::after{transform:scaleX(1)}
    .aud-mix{position:absolute;right:34px;top:26px;text-align:right;font-size:11px;letter-spacing:.3em;font-weight:600}
    .aud-mix .row{display:flex;justify-content:flex-end;align-items:center;gap:12px;margin:8px 0}
    .aud-mix .bar{width:150px;height:6px;background:rgba(255,255,255,.1);border-radius:3px;overflow:hidden}
    .aud-mix .bar i{display:block;height:100%;width:0;background:linear-gradient(90deg,#3ee6ff,#9df5ff);border-radius:3px}
    .aud-mix .bar.d i{background:linear-gradient(90deg,#ffb347,#ff6a2a)}
    .aud-mix .lbl{opacity:.7;min-width:64px}
    .aud-board{position:absolute;left:34px;right:34px;bottom:28px;display:flex;gap:22px;align-items:flex-end;pointer-events:auto;justify-content:space-between}
    .aud-grp{display:flex;flex-direction:column;gap:8px}
    .aud-grp .h{font-size:10px;letter-spacing:.4em;opacity:.6;font-weight:700}
    .aud-grp.sfx{flex-direction:row;align-items:stretch;gap:12px}
    .aud-grp.sfx .h{writing-mode:vertical-rl;transform:rotate(180deg);text-align:center;border-left:2px solid var(--c);padding-left:6px;opacity:.75;color:var(--c);letter-spacing:.32em;font-size:9px;line-height:1}
    .aud-pads{display:grid;grid-template-columns:repeat(7,104px);gap:8px}
    .aud-music{display:flex;gap:8px}
    .aud-pad{--pc:#3ee6ff;position:relative;height:50px;border-radius:8px;border:1px solid rgba(255,255,255,.16);background:linear-gradient(180deg,rgba(20,32,64,.72),rgba(6,10,26,.82));backdrop-filter:blur(6px);
      color:#e8f4ff;font:700 10.5px/1 "Segoe UI",system-ui,sans-serif;letter-spacing:.12em;display:flex;align-items:center;justify-content:center;cursor:pointer;user-select:none;transition:transform .08s,border-color .1s,box-shadow .1s;overflow:hidden}
    .aud-pad::before{content:"";position:absolute;left:10px;right:10px;top:0;height:3px;border-radius:0 0 3px 3px;background:var(--pc);opacity:.75;box-shadow:0 0 10px var(--pc)}
    .aud-pad small{position:absolute;right:8px;bottom:6px;font-size:9px;opacity:.5;letter-spacing:.1em}
    .aud-pad:hover{border-color:var(--pc);transform:translateY(-2px)}
    .aud-pad.hit{transform:scale(.94);border-color:#fff;box-shadow:0 0 22px var(--pc),inset 0 0 30px color-mix(in srgb,var(--pc) 45%,transparent)}
    .aud-pad.music{width:124px;height:56px;font-size:11px}
    .aud-pad.music.active{border-color:var(--pc);box-shadow:0 0 18px var(--pc);background:linear-gradient(180deg,color-mix(in srgb,var(--pc) 40%,rgba(20,32,64,.7)),rgba(6,10,26,.85))}
    .aud-hint{position:absolute;left:0;right:0;bottom:8px;text-align:center;font-size:10px;letter-spacing:.3em;opacity:.45}
    .aud-log{position:absolute;right:34px;bottom:150px;text-align:right;font-size:11px;letter-spacing:.2em;font-weight:600}
    .aud-log div{opacity:0;transform:translateX(12px);animation:audlog 1.6s ease-out forwards;color:var(--lc)}
    @keyframes audlog{0%{opacity:0;transform:translateX(12px)}10%{opacity:1;transform:none}70%{opacity:1}100%{opacity:0}}
  </style>
  <div class="aud-vig"></div>
  <div class="aud-plinth"></div>
  <div class="aud-tl">
    <div class="aud-kicker"><b>STARWING</b> &nbsp;//&nbsp; AUDIO LAB &nbsp;//&nbsp; PROCEDURAL SYNTH ENGINE</div>
    <div class="aud-title" id="aud-title">STANDBY</div>
    <div class="aud-sub"><span id="aud-subtitle">NO TRACK</span><span class="bpm" id="aud-bpm"></span><span id="aud-pos"></span></div>
    <div class="aud-beats" id="aud-beats"><i></i><i></i><i></i><i></i></div>
  </div>
  <div class="aud-tracks" id="aud-tracks"></div>
  <div class="aud-mix">
    <div class="row"><span class="lbl">MUSIC</span><div class="bar"><i id="aud-m-music"></i></div></div>
    <div class="row"><span class="lbl">SFX</span><div class="bar"><i id="aud-m-sfx"></i></div></div>
    <div class="row"><span class="lbl">DUCK</span><div class="bar d"><i id="aud-m-duck"></i></div></div>
    <div class="row"><span class="lbl" id="aud-mode"></span></div>
  </div>
  <div class="aud-log" id="aud-log"></div>
  <div class="aud-board">
    <div class="aud-grp"><div class="h">MUSIC</div><div class="aud-music" id="aud-music"></div></div>
    <div class="aud-grp sfx"><div class="h">SFX BANK</div><div class="aud-pads" id="aud-pads"></div></div>
  </div>
  <div class="aud-hint">CLICK A PAD &nbsp;·&nbsp; SPACE LASER &nbsp;·&nbsp; B BOMB &nbsp;·&nbsp; SHIFT BOOST &nbsp;·&nbsp; CTRL BRAKE &nbsp;·&nbsp; Q/E ROLL &nbsp;·&nbsp; ENTER CONFIRM &nbsp;·&nbsp; 1/2 MUSIC &nbsp;·&nbsp; 0 STOP</div>`;
  ui.appendChild(root);
  const $ = (id) => root.querySelector('#' + id);

  const KEYS = { laser: 'SPACE', charge: 'C', lockon: 'L', boost: 'SHIFT', brake: 'CTRL', roll: 'Q / E', explosionS: 'X', explosionM: 'V', explosionL: 'B', hit: 'H', alarm: 'A', select: 'S', confirm: 'ENTER', comm: 'M' };
  const pads = {};
  const padsEl = $('aud-pads');
  for (const name of audio.SFX_ORDER) {
    const d = audio.SFX[name];
    const el = document.createElement('div');
    el.className = 'aud-pad'; el.style.setProperty('--pc', d.color);
    el.innerHTML = `${d.label}<small>${KEYS[name] ?? ''}</small>`;
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); onAction('sfx', name); });
    padsEl.appendChild(el); pads[name] = el;
  }
  const musicEl = $('aud-music');
  const musicBtns = {};
  for (const [name, label, col] of [['main', 'MAIN THEME', '#3ee6ff'], ['battle', 'BATTLE LOOP', '#ff6a2a'], ['stop', 'STOP', '#9ad7ff']]) {
    const el = document.createElement('div');
    el.className = 'aud-pad music'; el.style.setProperty('--pc', col);
    el.innerHTML = `${label}<small>${name === 'main' ? '1' : name === 'battle' ? '2' : '0'}</small>`;
    el.addEventListener('pointerdown', (e) => { e.stopPropagation(); onAction('music', name); });
    musicEl.appendChild(el); musicBtns[name] = el;
  }
  const beats = [...$('aud-beats').children];
  const tracksEl = $('aud-tracks');
  let trackRows = null, lastSong = null;
  $('aud-mode').textContent = audio.synth.real ? 'WEBAUDIO · LIVE' : 'SILENT MODE · SIMULATED ANALYSIS';

  const seen = new Set();
  function flash(name) {
    const el = pads[name]; if (!el) return;
    el.classList.remove('hit'); void el.offsetWidth; el.classList.add('hit');
    setTimeout(() => el.classList.remove('hit'), 160);
    const log = $('aud-log');
    const row = document.createElement('div'); row.style.setProperty('--lc', audio.SFX[name].color); row.textContent = `▶ ${audio.SFX[name].label}`;
    log.appendChild(row); while (log.children.length > 5) log.firstChild.remove();
    setTimeout(() => row.remove(), 1700);
  }

  let smoothM = 0, smoothS = 0;
  function update(dt) {
    const seq = audio.seq, song = seq.song;
    if (song !== lastSong) {
      lastSong = song;
      $('aud-title').textContent = song ? song.title : 'STANDBY';
      $('aud-subtitle').textContent = song ? song.subtitle : 'NO TRACK';
      $('aud-bpm').textContent = song ? `${song.bpm} BPM` : '';
      const c = song ? (seq.name === 'battle' ? '#ff6a2a' : '#3ee6ff') : '#3ee6ff';
      root.style.setProperty('--c', c);
      for (const [n, el] of Object.entries(musicBtns)) el.classList.toggle('active', n === seq.name);
      tracksEl.innerHTML = '';
      trackRows = song ? song.tracks.map((tr) => { const d = document.createElement('div'); d.innerHTML = `<i></i><span>${tr.name}</span><b></b>`; tracksEl.appendChild(d); return d; }) : null;
    }
    if (song) {
      const bar = seq.bar, bib = Math.floor(seq.beatInBar);
      $('aud-pos').textContent = `BAR ${String((bar % (song.loopBeats / song.beatsPerBar)) + 1).padStart(2, '0')} · ${bib + 1}`;
      beats.forEach((b, i) => b.classList.toggle('on', i === bib));
      const act = seq.activity();
      act.forEach((a, i) => trackRows[i]?.classList.toggle('on', a.on));
    } else beats.forEach((b) => b.classList.remove('on'));
    // meters
    const now = audio.synth.now();
    let m = 0, s = 0;
    for (const v of audio.synth.voices) { const age = now - v.t0; if (age < 0 || age > v.t1 - v.t0) continue; if (v.out === 'sfx') s += v.gain; else m += v.gain; }
    smoothM += (Math.min(1, m * 1.2) - smoothM) * Math.min(1, dt * 12);
    smoothS += (Math.min(1, s * 1.1) - smoothS) * Math.min(1, dt * 14);
    $('aud-m-music').style.width = `${smoothM * 100}%`;
    $('aud-m-sfx').style.width = `${smoothS * 100}%`;
    $('aud-m-duck').style.width = `${(1 - audio.synth.duckLevel) * 100}%`;
    for (const r of audio.recent) if (!seen.has(r)) { seen.add(r); flash(r.name); }
  }

  return { update, flash, dispose() { root.remove(); } };
}
