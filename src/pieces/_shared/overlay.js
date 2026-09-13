/**
 * Shared game overlay (integrator): fade to black, cinematic letterbox, stage
 * caption cards, objective line, pause menu, control hints.  Pure DOM, frame
 * driven (call update(dt)) so it is deterministic in the fixed-step harness.
 */
const FONT = `"Liberation Sans Narrow","Arial Narrow","Roboto Condensed","Helvetica Neue Condensed",system-ui,sans-serif`;

const CSS = `
.gm-root{position:absolute;inset:0;pointer-events:none;font-family:${FONT};color:#eef6ff;overflow:hidden}
.gm-fade{position:absolute;inset:0;background:#000;opacity:1}
.gm-bar{position:absolute;left:0;right:0;height:0;background:#000}
.gm-bar.t{top:0}.gm-bar.b{bottom:0}
.gm-cap{position:absolute;left:0;right:0;top:31%;transform:translateY(-50%);text-align:center;opacity:0}
.gm-cap .k{font:700 clamp(11px,1.2vw,16px)/1 ${FONT};letter-spacing:.55em;color:#8fc6ff;text-shadow:0 0 14px rgba(120,190,255,.6)}
.gm-cap .t{font:900 clamp(34px,6vw,84px)/1 ${FONT};letter-spacing:.14em;margin-top:14px;font-style:italic;text-shadow:0 3px 0 rgba(0,0,0,.45),0 0 28px rgba(150,200,255,.35)}
.gm-cap .s{font:600 clamp(11px,1.1vw,15px)/1 ${FONT};letter-spacing:.4em;opacity:.75;margin-top:16px}
.gm-cap .rule{height:2px;width:0;margin:18px auto 0;background:linear-gradient(90deg,rgba(143,198,255,0),#8fc6ff,rgba(143,198,255,0))}
.gm-obj{position:absolute;left:50%;top:5.5%;transform:translateX(-50%) skewX(-8deg);text-align:center;opacity:0;transition:opacity .35s}
.gm-obj .l{font:800 clamp(9px,.9vw,12px)/1 ${FONT};letter-spacing:.5em;color:#ffd27a;text-shadow:0 0 10px rgba(255,190,90,.7)}
.gm-obj .v{font:900 clamp(16px,2vw,26px)/1.1 ${FONT};letter-spacing:.22em;margin-top:6px;text-shadow:0 2px 4px rgba(0,0,0,.6),0 0 18px rgba(255,220,150,.35)}
.gm-pause{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(4,10,26,.72),rgba(0,0,0,.9));display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:0;transition:opacity .2s;backdrop-filter:blur(3px)}
.gm-pause .t{font:900 clamp(40px,7vw,96px)/1 ${FONT};letter-spacing:.3em;font-style:italic;text-shadow:0 0 30px rgba(120,190,255,.5)}
.gm-pause .h{font:600 clamp(11px,1.1vw,15px)/2 ${FONT};letter-spacing:.35em;opacity:.7;margin-top:22px;text-align:center}
.gm-pause .h b{color:#8fc6ff;font-weight:800}
.gm-hint{position:absolute;right:2.6%;bottom:3.2%;text-align:right;font:600 clamp(9px,.85vw,12px)/1.8 ${FONT};letter-spacing:.32em;opacity:0;transition:opacity .5s;text-shadow:0 1px 8px rgba(0,0,0,.8)}
.gm-hint b{color:#8fc6ff;font-weight:800}
.gm-over{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(40,4,8,.78),rgba(0,0,0,.94));display:flex;flex-direction:column;align-items:center;justify-content:center;opacity:0;transition:opacity .45s}
.gm-over .t{font:900 clamp(40px,7.5vw,104px)/1 ${FONT};letter-spacing:.28em;font-style:italic;color:#ff5d5d;text-shadow:0 0 34px rgba(255,80,80,.55),0 4px 0 rgba(0,0,0,.5)}
.gm-over .s{font:600 clamp(11px,1.2vw,16px)/1 ${FONT};letter-spacing:.4em;opacity:.8;margin-top:18px}
.gm-over .h{font:700 clamp(12px,1.3vw,18px)/2 ${FONT};letter-spacing:.35em;margin-top:34px;text-align:center}
.gm-over .h b{color:#8fc6ff}
.gm-over .h .blink{animation:gm-blink 1.1s steps(2,end) infinite}
@keyframes gm-blink{to{opacity:.25}}
.gm-vig{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 55%,rgba(0,0,0,.35) 100%);opacity:0}
`;

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ease = (t) => t * t * (3 - 2 * t);

export function createGameOverlay(ui) {
  if (!document.getElementById('gm-css')) { const s = document.createElement('style'); s.id = 'gm-css'; s.textContent = CSS; document.head.appendChild(s); }
  const root = document.createElement('div'); root.className = 'gm-root';
  const el = (cls, html = '') => { const e = document.createElement('div'); e.className = cls; e.innerHTML = html; root.appendChild(e); return e; };
  const vig = el('gm-vig');
  const barT = el('gm-bar t'), barB = el('gm-bar b');
  const cap = el('gm-cap', `<div class="k"></div><div class="t"></div><div class="rule"></div><div class="s"></div>`);
  const obj = el('gm-obj', `<div class="l"></div><div class="v"></div>`);
  const hint = el('gm-hint');
  const pause = el('gm-pause', `<div class="t">PAUSED</div><div class="h"><b>ESC</b> RESUME &nbsp;·&nbsp; <b>WASD</b> FLY &nbsp;·&nbsp; <b>SPACE</b> FIRE &nbsp;·&nbsp; <b>SHIFT</b> BOOST &nbsp;·&nbsp; <b>CTRL</b> BRAKE<br><b>Q / E</b> BARREL ROLL &nbsp;·&nbsp; <b>B</b> NOVA BOMB &nbsp;·&nbsp; <b>ENTER</b> CONFIRM</div>`);
  const over = el('gm-over', `<div class="t">GAME OVER</div><div class="s"></div><div class="h"><span class="blink"><b>ENTER</b> RETRY</span> &nbsp;·&nbsp; <b>ESC</b> TITLE</div>`);
  const fade = el('gm-fade');
  ui.appendChild(root);

  const st = { fade: 1, fadeTarget: 1, fadeSpeed: 1.6, letter: 0, letterTarget: 0, capT: -1, capDur: 0, objT: 0, hintT: 0, hintTimer: 0, paused: false };
  let lastWall = 0;

  const api = {
    root,
    /** Ensure the overlay stays on top even if a piece appends UI later. */
    raise() { if (root.parentNode === ui && ui.lastChild !== root) ui.appendChild(root); },
    fadeTo(v, dur = 0.6) { st.fadeTarget = clamp01(v); st.fadeSpeed = 1 / Math.max(0.05, dur); },
    setFade(v) { st.fade = st.fadeTarget = clamp01(v); fade.style.opacity = st.fade.toFixed(3); },
    get fade() { return st.fade; },
    get fadeDone() { return Math.abs(st.fade - st.fadeTarget) < 0.002; },
    letterbox(on) { st.letterTarget = on ? 1 : 0; },
    /** Big centred stage card: kicker / title / sub. */
    caption(kicker, title, sub = '', dur = 3.2) {
      cap.querySelector('.k').textContent = kicker; cap.querySelector('.t').textContent = title; cap.querySelector('.s').textContent = sub;
      st.capT = 0; st.capDur = dur;
    },
    /** Persistent objective line at the top (empty string hides). */
    objective(label, value = '') {
      obj.querySelector('.l').textContent = label; obj.querySelector('.v').textContent = value;
      obj.style.opacity = label ? '1' : '0';
    },
    hint(html, secs = 6) { hint.innerHTML = html; st.hintTimer = secs; hint.style.opacity = html ? '1' : '0'; },
    setPaused(p) { st.paused = p; pause.style.opacity = p ? '1' : '0'; },
    /** Fail screen (null/false hides). sub = one-line reason. */
    gameOver(sub) { if (sub == null || sub === false) { over.style.opacity = '0'; return; } over.querySelector('.s').textContent = sub; over.style.opacity = '1'; },
    vignette(a) { vig.style.opacity = String(clamp01(a)); },
    update(dt) {
      // Wall-clock floor: under software GL a rendered frame can take ~1 s while sim dt is
      // clamped to 0.05 s, which would stretch fades/captions over many wall-seconds of black.
      // Use the larger of sim dt and (capped) real elapsed time so chrome always feels snappy.
      const now = performance.now();
      const wdt = lastWall ? Math.min(0.6, (now - lastWall) / 1000) : dt;
      lastWall = now;
      dt = Math.max(dt, wdt);
      // fade
      const d = st.fadeTarget - st.fade;
      if (Math.abs(d) > 0.0005) { const step = st.fadeSpeed * dt; st.fade += Math.abs(d) <= step ? d : Math.sign(d) * step; fade.style.opacity = st.fade.toFixed(3); }
      // letterbox
      const ld = st.letterTarget - st.letter;
      if (Math.abs(ld) > 0.0005) { const step = dt / 0.7; st.letter += Math.abs(ld) <= step ? ld : Math.sign(ld) * step; const h = (ease(st.letter) * 12).toFixed(2) + '%'; barT.style.height = h; barB.style.height = h; }
      // caption
      if (st.capT >= 0) {
        st.capT += dt;
        const a = clamp01(st.capT / 0.5), o = clamp01((st.capDur - st.capT) / 0.6);
        const k = Math.min(a, o);
        cap.style.opacity = k.toFixed(3);
        cap.style.transform = `translateY(-50%) translateY(${(1 - ease(a)) * 24}px)`;
        cap.querySelector('.rule').style.width = `${ease(clamp01((st.capT - 0.15) / 0.6)) * 36}%`;
        cap.querySelector('.s').style.letterSpacing = `${0.4 + (1 - ease(a)) * 0.3}em`;
        if (st.capT > st.capDur) { st.capT = -1; cap.style.opacity = '0'; }
      }
      if (st.hintTimer > 0) { st.hintTimer -= dt; if (st.hintTimer <= 0) hint.style.opacity = '0'; }
    },
    dispose() { root.remove(); },
  };
  fade.style.opacity = '1';
  return api;
}
