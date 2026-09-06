// DOM HUD: mission header, ring counter, interaction prompt, controls, flash messages.
// opts.title=false hides the top-left mission header (integrator supplies its own captions).
export function makeHud(ui, opts = {}) {
  const root = document.createElement('div');
  root.innerHTML = `
  <style>
    .of-hud{position:absolute;inset:0;font-family:"Segoe UI",system-ui,sans-serif;color:#eaf6ff;text-shadow:0 1px 2px rgba(0,0,0,.7),0 0 12px rgba(80,200,255,.35)}
    .of-top{position:absolute;left:36px;top:30px}
    .of-title{font-size:13px;letter-spacing:.42em;opacity:.8;color:#8fdcff}
    .of-sub{font-size:26px;font-weight:700;letter-spacing:.12em;margin-top:2px}
    .of-bar{height:3px;width:260px;margin-top:8px;background:linear-gradient(90deg,#57d6ff 0,#57d6ff 60%,rgba(87,214,255,.15) 60%);border-radius:2px;box-shadow:0 0 10px rgba(87,214,255,.6)}
    .of-right{position:absolute;right:36px;top:30px;text-align:right;display:flex;flex-direction:column;gap:10px}
    .of-count{display:flex;align-items:center;justify-content:flex-end;gap:10px;font-size:22px;font-weight:700;letter-spacing:.08em}
    .of-ring{width:20px;height:20px;border-radius:50%;border:4px solid #ffcf4a;box-shadow:0 0 12px #ffb020,inset 0 0 6px #ffb020}
    .of-drone{width:16px;height:16px;transform:rotate(45deg);background:#ff5a4a;box-shadow:0 0 12px #ff3020}
    .of-small{font-size:12px;letter-spacing:.3em;opacity:.7}
    .of-prompt{position:absolute;left:50%;bottom:120px;transform:translateX(-50%);display:flex;align-items:center;gap:14px;font-size:17px;letter-spacing:.2em;font-weight:600;opacity:0;transition:opacity .25s,transform .25s}
    .of-prompt.on{opacity:1;transform:translateX(-50%) translateY(-6px)}
    .of-key{display:inline-flex;align-items:center;justify-content:center;min-width:30px;height:30px;padding:0 8px;border:2px solid #57d6ff;border-radius:6px;background:rgba(10,30,50,.7);color:#bff2ff;font-weight:800;box-shadow:0 0 14px rgba(87,214,255,.5)}
    .of-ctl{position:absolute;left:36px;bottom:30px;display:flex;gap:18px;font-size:11px;letter-spacing:.22em;opacity:.65}
    .of-ctl span b{display:inline-block;padding:1px 6px;border:1px solid rgba(160,220,255,.6);border-radius:4px;margin-right:6px;font-weight:600}
    .of-flash{position:absolute;left:50%;top:22%;transform:translateX(-50%);font-size:22px;font-weight:700;letter-spacing:.3em;color:#bfffd8;text-shadow:0 0 18px rgba(64,255,128,.8);opacity:0;transition:opacity .3s}
    .of-flash.on{opacity:1}
    .of-reticle{position:absolute;left:50%;top:50%;width:46px;height:46px;transform:translate(-50%,-50%);opacity:0;transition:opacity .15s}
    .of-reticle.on{opacity:.9}
    .of-reticle i{position:absolute;background:#9dfcff;box-shadow:0 0 8px #5fe8ff}
    .of-vig{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(0,0,0,0) 55%,rgba(2,6,14,.55) 100%);pointer-events:none}
    .of-state{position:absolute;right:36px;bottom:30px;font-size:11px;letter-spacing:.3em;opacity:.6}
  </style>
  <div class="of-hud">
    <div class="of-vig"></div>
    <div class="of-top"${opts.title === false ? ' style="display:none"' : ''}><div class="of-title">GREAT FOX // HANGAR 01</div><div class="of-sub">PRE-FLIGHT</div><div class="of-bar"></div></div>
    <div class="of-right">
      <div class="of-count"><span class="of-ring"></span><span class="of-rings">0 / 0</span></div>
      <div class="of-count"><span class="of-drone"></span><span class="of-drones">0</span></div>
      <div class="of-small">TRAINING DRONES</div>
    </div>
    <div class="of-prompt"><span class="of-key">F</span><span class="of-ptxt"></span></div>
    <div class="of-flash"></div>
    <div class="of-reticle"><i style="left:0;top:50%;width:12px;height:2px"></i><i style="right:0;top:50%;width:12px;height:2px"></i><i style="top:0;left:50%;width:2px;height:12px"></i><i style="bottom:0;left:50%;width:2px;height:12px"></i></div>
    <div class="of-ctl"><span><b>WASD</b>MOVE</span><span><b>SPACE</b>JUMP</span><span><b>J</b>BLASTER</span><span><b>Q/E</b>ROLL</span><span><b>F</b>INTERACT</span></div>
    <div class="of-state"></div>
  </div>`;
  ui.appendChild(root);
  const q = (s) => root.querySelector(s);
  const rings = q('.of-rings'), drones = q('.of-drones'), prompt = q('.of-prompt'), ptxt = q('.of-ptxt'), flash = q('.of-flash'), reticle = q('.of-reticle'), state = q('.of-state');
  let flashT = 0; let ringTotal = 0;
  return {
    setRings(n, total) { ringTotal = total; rings.textContent = `${n} / ${total}`; rings.parentElement.style.transform = 'scale(1.25)'; setTimeout(() => (rings.parentElement.style.transform = ''), 120); },
    setDrones(n) { drones.textContent = String(n); },
    setPrompt(txt) { ptxt.textContent = txt; prompt.classList.toggle('on', !!txt); },
    flash(txt) { flash.textContent = txt; flash.classList.add('on'); flashT = 2.6; },
    setVisible(v) { root.style.display = v ? '' : 'none'; },
    setTitle(title, sub) { const a = q('.of-title'), b = q('.of-sub'); if (title != null) a.textContent = title; if (sub != null) b.textContent = sub; q('.of-top').style.display = title === '' && sub === '' ? 'none' : ''; },
    update(dt, t, s) {
      if (flashT > 0) { flashT -= dt; if (flashT <= 0) flash.classList.remove('on'); }
      reticle.classList.toggle('on', !!s.firing);
      state.textContent = s.rolling ? 'ROLL' : s.air ? 'AIRBORNE' : s.speed > 0.1 ? 'RUN' : 'READY';
    },
    dispose() { root.remove(); },
  };
}
