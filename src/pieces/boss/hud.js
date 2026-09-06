// DOM HUD for the boss fight: boss health, phase pips, warning banner,
// lock-on reticle, shield gauge, screen flash / vignette grading.

export function buildHud(ui, { top: topPx = 26 } = {}) {
  const root = document.createElement('div');
  root.style.cssText = 'position:absolute;inset:0;pointer-events:none;font-family:"Bahnschrift","Eurostile","Avenir Next Condensed","Roboto Condensed","DejaVu Sans Condensed","Arial Narrow",system-ui,sans-serif;color:#e8f4ff;overflow:hidden';
  root.innerHTML = `
  <style>
    .bz-grade{position:absolute;inset:0;background:radial-gradient(ellipse at 50% 55%, rgba(0,0,0,0) 45%, rgba(4,6,20,.55) 100%);mix-blend-mode:multiply}
    .bz-flash{position:absolute;inset:0;background:#fff;opacity:0;transition:none}
    .bz-slow{position:absolute;inset:0;box-shadow:inset 0 0 180px rgba(40,140,255,.55);opacity:0}
    .bz-top{position:absolute;left:50%;top:${topPx}px;transform:translateX(-50%);width:min(760px,70vw);text-align:center;transition:opacity .4s}
    .bz-name{font-weight:800;font-size:22px;letter-spacing:.34em;text-transform:uppercase;text-shadow:0 0 12px rgba(255,80,60,.7),0 2px 0 rgba(0,0,0,.6);}
    .bz-name small{display:block;font-size:11px;letter-spacing:.5em;color:#ff7a5a;font-weight:700;margin-bottom:4px}
    .bz-bar{position:relative;height:14px;margin-top:8px;background:rgba(10,14,30,.75);border:1px solid rgba(255,255,255,.35);border-radius:3px;overflow:hidden;box-shadow:0 0 0 2px rgba(0,0,0,.35)}
    .bz-bar i{position:absolute;left:0;top:0;bottom:0;background:linear-gradient(180deg,#ffd27a,#ff5a2a 60%,#c81e1e);transition:width .15s ease-out;box-shadow:0 0 14px rgba(255,90,40,.8)}
    .bz-bar b{position:absolute;left:0;top:0;bottom:0;background:rgba(255,255,255,.85);transition:width .6s ease}
    .bz-bar em{position:absolute;top:0;bottom:0;width:2px;background:rgba(0,0,0,.7)}
    .bz-pips{display:flex;gap:6px;justify-content:center;margin-top:8px}
    .bz-pips span{width:64px;height:5px;border-radius:2px;background:rgba(255,255,255,.18);border:1px solid rgba(255,255,255,.3)}
    .bz-pips span.on{background:#ff8a3a;box-shadow:0 0 10px #ff6a2a}
    .bz-pips span.done{background:rgba(120,150,200,.35)}
    /* warning banner sits in the lower third (between the Arwing and the comm box) so it never covers the
       weak-point reticle, which lives in the upper/middle band where the boss is */
    .bz-warn{position:absolute;left:50%;top:64%;transform:translateX(-50%) scale(1);font-weight:900;font-size:min(30px,2.4vw);letter-spacing:.34em;color:#ffe08a;text-shadow:0 0 18px rgba(255,120,40,.9),0 3px 0 #000;opacity:0;white-space:nowrap;text-transform:uppercase;padding:6px 28px;background:linear-gradient(90deg,rgba(120,20,10,0) 0%,rgba(120,20,10,.75) 18%,rgba(120,20,10,.75) 82%,rgba(120,20,10,0) 100%);border-top:1px solid rgba(255,190,120,.45);border-bottom:1px solid rgba(255,190,120,.45)}
    .bz-warn.show{animation:bzwarn 1.1s ease-out both}
    @keyframes bzwarn{0%{opacity:0;transform:translateX(-50%) scale(1.4)}12%{opacity:1;transform:translateX(-50%) scale(.97)}22%{transform:translateX(-50%) scale(1.02)}70%{opacity:1}100%{opacity:0;transform:translateX(-50%) scale(1)}}
    .bz-ret{position:absolute;width:64px;height:64px;margin:-32px 0 0 -32px;opacity:0;transition:opacity .2s}
    .bz-ret:before,.bz-ret:after{content:"";position:absolute;inset:0;border:2px solid #7dff5a;border-radius:6px;box-shadow:0 0 10px rgba(125,255,90,.8)}
    .bz-ret:after{inset:18px;border-radius:50%;border-color:#fff}
    .bz-ret span{position:absolute;left:70px;top:22px;font-size:11px;font-weight:800;letter-spacing:.25em;color:#b8ffa2;text-transform:uppercase;white-space:nowrap;text-shadow:0 0 8px rgba(0,0,0,.9)}
    .bz-bl{position:absolute;left:36px;bottom:32px;width:240px}
    .bz-bl label{font-size:11px;font-weight:800;letter-spacing:.45em;color:#8fd0ff}
    .bz-sh{height:10px;margin-top:6px;background:rgba(10,14,30,.75);border:1px solid rgba(255,255,255,.3);border-radius:3px;overflow:hidden}
    .bz-sh i{display:block;height:100%;width:100%;background:linear-gradient(90deg,#3a8dff,#8fe3ff);box-shadow:0 0 12px rgba(80,180,255,.8);transition:width .2s}
    .bz-br{position:absolute;right:36px;bottom:32px;text-align:right;font-size:12px;letter-spacing:.35em;font-weight:700;color:#9fb6d6;text-transform:uppercase}
    .bz-br b{display:block;font-size:34px;color:#fff;letter-spacing:.1em;font-weight:900;text-shadow:0 0 12px rgba(120,180,255,.5)}
    /* comm box: angled console panel with a coloured caller badge + portrait tile, condensed caps caller name */
    .bz-comm{position:absolute;left:28px;bottom:78px;display:flex;align-items:center;gap:14px;padding:8px 26px 8px 10px;background:linear-gradient(180deg,rgba(10,16,40,.86),rgba(4,8,24,.9));border:1px solid rgba(140,190,255,.4);border-left:3px solid #8fd0ff;clip-path:polygon(0 0,calc(100% - 14px) 0,100% 50%,calc(100% - 14px) 100%,0 100%);font-size:17px;letter-spacing:.02em;color:#eaf4ff;opacity:0;transition:opacity .25s;white-space:nowrap;max-width:80vw;box-shadow:0 6px 24px rgba(0,0,0,.45)}
    .bz-comm i{width:44px;height:44px;flex:none;border-radius:3px;background:radial-gradient(circle at 50% 38%,#ffd9a8 0 22%,#d9782a 23% 40%,#2a4a8a 41%);border:1px solid rgba(255,255,255,.35);box-shadow:inset 0 0 12px rgba(0,0,0,.5)}
    .bz-comm b{color:#8fd0ff;letter-spacing:.28em;font-size:11px;font-weight:800;display:block;margin-bottom:3px;text-transform:uppercase}
    .bz-comm span{font-style:italic}
    .bz-comm.peppy i{background:radial-gradient(circle at 50% 38%,#e8e8e8 0 22%,#8a8a92 23% 40%,#2a4a8a 41%)}
    .bz-comm.slippy i{background:radial-gradient(circle at 50% 38%,#c8f0a0 0 22%,#4aa040 23% 40%,#2a4a8a 41%)}
    .bz-comm.falco i{background:radial-gradient(circle at 50% 38%,#a8d8ff 0 22%,#3a78d8 23% 40%,#2a4a8a 41%)}
    .bz-comm.rob i{background:radial-gradient(circle at 50% 38%,#ffd060 0 16%,#c8ccd8 17% 40%,#2a4a8a 41%)}
    .bz-win{position:absolute;left:50%;top:44%;transform:translate(-50%,-50%);font-weight:900;font-size:min(56px,4.4vw);letter-spacing:.35em;color:#fff;text-shadow:0 0 30px rgba(120,200,255,.9),0 4px 0 #000;opacity:0;white-space:nowrap}
    .bz-win small{display:block;font-size:16px;letter-spacing:.6em;color:#8fd0ff}
    .bz-win.show{animation:bzwin 1s cubic-bezier(.2,1.4,.4,1) both}
    @keyframes bzwin{0%{opacity:0;transform:translate(-50%,-50%) scale(1.8)}100%{opacity:1;transform:translate(-50%,-50%) scale(1)}}
  </style>
  <div class="bz-grade"></div>
  <div class="bz-slow"></div>
  <div class="bz-top">
    <div class="bz-name"><small>VENOMIAN DREADNOUGHT</small>GORGON</div>
    <div class="bz-bar"><b></b><i></i><em style="left:33.3%"></em><em style="left:66.6%"></em></div>
    <div class="bz-pips"><span class="on"></span><span></span><span></span></div>
  </div>
  <div class="bz-warn"></div>
  <div class="bz-ret"><span></span></div>
  <div class="bz-bl"><label>SHIELD</label><div class="bz-sh"><i></i></div></div>
  <div class="bz-br">HITS<b>000</b></div>
  <div class="bz-comm"><i></i><div><b></b><span></span></div></div>
  <div class="bz-win"><small>MISSION</small>ACCOMPLISHED</div>
  <div class="bz-flash"></div>`;
  ui.appendChild(root);
  const q = (s) => root.querySelector(s);
  const bar = q('.bz-bar i'), barGhost = q('.bz-bar b'), pips = [...root.querySelectorAll('.bz-pips span')], warn = q('.bz-warn'), ret = q('.bz-ret'), retLabel = q('.bz-ret span');
  const flash = q('.bz-flash'), slow = q('.bz-slow'), shield = q('.bz-sh i'), hits = q('.bz-br b'), comm = q('.bz-comm'), win = q('.bz-win'), top = q('.bz-top');
  let commTimer = 0;
  return {
    setHealth(frac) { bar.style.width = `${Math.max(0, frac) * 100}%`; barGhost.style.width = `${Math.max(0, frac) * 100}%`; },
    setPhase(p) { pips.forEach((s, i) => { s.className = i + 1 < p ? 'done' : i + 1 === p ? 'on' : ''; }); },
    warn(text) { warn.textContent = text; warn.classList.remove('show'); void warn.offsetWidth; warn.classList.add('show'); },
    reticle(x, y, visible, label = '') { ret.style.opacity = visible ? 1 : 0; if (visible) { ret.style.left = `${x}px`; ret.style.top = `${y}px`; retLabel.textContent = label; } },
    flash(a) { flash.style.opacity = a; },
    slowmo(a) { slow.style.opacity = a; },
    shield(f) { shield.style.width = `${Math.max(0, f) * 100}%`; },
    hits(n) { hits.textContent = String(n).padStart(3, '0'); },
    comm(who, text, dur = 3.2) { q('.bz-comm b').textContent = who; q('.bz-comm span').textContent = text; comm.className = `bz-comm ${who.toLowerCase().split(' ')[0]}`; comm.style.opacity = 1; commTimer = dur; },
    win(show) { win.classList.toggle('show', show); if (!show) win.style.opacity = 0; },
    hideTop(h) { top.style.opacity = h ? 0 : 1; },
    update(dt) { if (commTimer > 0) { commTimer -= dt; if (commTimer <= 0) comm.style.opacity = 0; } },
    dispose() { root.remove(); },
  };
}
