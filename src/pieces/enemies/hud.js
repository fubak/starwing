/**
 * DOM lock-on markers + reticle + wave call-outs for the enemies showcase.
 * hud.locked -> { e, ndc:Vector2 } | null   (nearest target to the reticle)
 */
import * as THREE from 'three';

const CSS = `
.en-hud{position:absolute;inset:0;pointer-events:none;overflow:hidden;font-family:"Segoe UI",Roboto,"Helvetica Neue",system-ui,sans-serif;color:#dff6ff}
.en-mk{position:absolute;left:0;top:0;width:64px;height:64px;transform:translate(-50%,-50%);will-change:transform;opacity:0;transition:opacity .12s}
.en-mk i{position:absolute;width:14px;height:14px;border:2px solid #7cf2b0;filter:drop-shadow(0 0 6px rgba(124,242,176,.9))}
.en-mk i:nth-child(1){left:0;top:0;border-right:0;border-bottom:0}
.en-mk i:nth-child(2){right:0;top:0;border-left:0;border-bottom:0}
.en-mk i:nth-child(3){left:0;bottom:0;border-right:0;border-top:0}
.en-mk i:nth-child(4){right:0;bottom:0;border-left:0;border-top:0}
.en-mk b{position:absolute;left:50%;top:100%;transform:translate(-50%,6px);font:600 11px/1 "Segoe UI",Roboto,system-ui;letter-spacing:.18em;white-space:nowrap;color:#bff5d3;text-shadow:0 0 8px rgba(124,242,176,.8)}
.en-mk.lock i{border-color:#ff4d6d;filter:drop-shadow(0 0 8px rgba(255,77,109,1))}
.en-mk.lock b{color:#ffd0da;text-shadow:0 0 10px rgba(255,77,109,.9)}
.en-mk.lock::after{content:"";position:absolute;inset:-10px;border:1.5px solid rgba(255,77,109,.85);border-radius:50%;border-left-color:transparent;border-right-color:transparent;animation:en-spin 1.1s linear infinite}
@keyframes en-spin{to{transform:rotate(360deg)}}
.en-ret{position:absolute;left:0;top:0;transform:translate(-50%,-50%);will-change:transform}
.en-ret.near{width:74px;height:74px}
.en-ret.far{width:34px;height:34px}
.en-ret span{position:absolute;background:#6ef0a5;box-shadow:0 0 8px rgba(110,240,165,.9)}
.en-ret.near span{width:16px;height:2px}
.en-ret.near span:nth-child(1){left:0;top:50%}.en-ret.near span:nth-child(2){right:0;top:50%}
.en-ret.near span:nth-child(3){left:50%;top:0;width:2px;height:16px;margin-left:-1px}.en-ret.near span:nth-child(4){left:50%;bottom:0;width:2px;height:16px;margin-left:-1px}
.en-ret.far{border:2px solid #6ef0a5;border-radius:50%;box-shadow:0 0 10px rgba(110,240,165,.7),inset 0 0 6px rgba(110,240,165,.5)}
.en-ret.far span{left:50%;top:50%;width:4px;height:4px;margin:-2px;border-radius:50%}
.en-call{position:absolute;left:50%;top:14%;transform:translateX(-50%);text-align:center;opacity:0;transition:opacity .25s}
.en-call h1{margin:0;font:800 30px/1 "Segoe UI",Roboto,system-ui;letter-spacing:.32em;text-transform:uppercase;color:#fff;text-shadow:0 0 18px rgba(255,90,120,.85),0 2px 0 rgba(0,0,0,.5)}
.en-call p{margin:8px 0 0;font:600 13px/1 "Segoe UI",Roboto,system-ui;letter-spacing:.34em;text-transform:uppercase;color:#ffb3c2}
.en-score{position:absolute;right:36px;top:28px;text-align:right}
.en-score small{display:block;font:700 11px/1 system-ui;letter-spacing:.34em;color:#9fd9ff;opacity:.85}
.en-score div{font:800 34px/1.1 "Segoe UI",Roboto,system-ui;letter-spacing:.06em;color:#fff;text-shadow:0 0 14px rgba(120,200,255,.6);font-variant-numeric:tabular-nums}
.en-title{position:absolute;left:36px;bottom:30px}
.en-title small{display:block;font:700 11px/1 system-ui;letter-spacing:.34em;color:#ffb3c2}
.en-title div{font:800 22px/1.2 "Segoe UI",Roboto,system-ui;letter-spacing:.2em;color:#fff;text-shadow:0 0 12px rgba(255,90,120,.5)}
.en-bars{position:absolute;left:36px;top:28px;display:flex;gap:10px;align-items:flex-end}
.en-bars b{display:block;width:6px;background:linear-gradient(#fff,#7cf2b0);box-shadow:0 0 8px rgba(124,242,176,.8);border-radius:2px}
`;

export function createLockOnHud(ctx, em) {
  const { ui, camera } = ctx;
  const style = document.createElement('style'); style.textContent = CSS; ui.appendChild(style);
  const root = document.createElement('div'); root.className = 'en-hud'; ui.appendChild(root);

  const markers = new Map(); // enemy -> el
  const retNear = mk('div', 'en-ret near', '<span></span><span></span><span></span><span></span>');
  const retFar = mk('div', 'en-ret far', '<span></span>');
  const call = mk('div', 'en-call', '<h1></h1><p></p>');
  const score = mk('div', 'en-score', '<small>SCORE</small><div>000000</div>');
  const title = mk('div', 'en-title', '<small>VENOM AIR WING</small><div>ENEMY SHOWCASE</div>');
  const bars = mk('div', 'en-bars', Array.from({ length: 12 }, () => '<b></b>').join(''));
  root.append(retNear, retFar, call, score, title, bars);
  function mk(tag, cls, html) { const el = document.createElement(tag); el.className = cls; el.innerHTML = html; return el; }

  const hud = { locked: null, announce, update, dispose };
  let callT = 0;
  const _p = new THREE.Vector3();
  const NAMES = { vulture: 'VULTURE', hornet: 'HORNET', mantis: 'MANTIS' };
  const FORM = { v: 'V-FORMATION', snake: 'SNAKE', circle: 'CIRCLE', line: 'LINE ABREAST' };

  function announce(wave) {
    call.children[0].textContent = `${NAMES[wave.craft] ?? wave.craft} SQUADRON`;
    call.children[1].textContent = `WAVE ${String(wave.id).padStart(2, '0')}  ·  ${FORM[wave.kind] ?? wave.kind}  ·  ${wave.n} CRAFT`;
    call.style.opacity = 1; callT = 2.2;
  }

  function update(dt, t, aim, scoreVal) {
    const W = ctx.size.x, H = ctx.size.y;
    // reticle: far one at the aim point, near one offset slightly toward centre (parallax)
    const nx = (aim.x * 0.5 + 0.5) * W, ny = (-aim.y * 0.5 + 0.5) * H;
    retFar.style.transform = `translate(${nx}px,${ny}px) translate(-50%,-50%)`;
    retNear.style.transform = `translate(${nx * 0.7 + W * 0.15}px,${ny * 0.7 + H * 0.15}px) translate(-50%,-50%) rotate(${Math.sin(t * 0.8) * 4}deg)`;

    // markers
    let best = null, bestD = 0.28;
    const seen = new Set();
    for (const e of em.list) {
      if (e.state !== 'fly' || !e.group.visible) continue;
      _p.copy(e.pos).project(camera);
      if (_p.z > 1 || Math.abs(_p.x) > 1.05 || Math.abs(_p.y) > 1.05) continue;
      const d = e.pos.distanceTo(camera.position);
      if (d > 380) continue;
      seen.add(e);
      let el = markers.get(e);
      if (!el) { el = mk('div', 'en-mk', '<i></i><i></i><i></i><i></i><b></b>'); root.appendChild(el); markers.set(e, el); el.userData = { s: 0 }; }
      const sizePx = THREE.MathUtils.clamp((e.radius * 2 * H) / (d * 2 * Math.tan(THREE.MathUtils.degToRad(camera.fov / 2))) * 1.5, 34, 180);
      el.userData.s = THREE.MathUtils.damp(el.userData.s, sizePx, 12, dt);
      const sx = (_p.x * 0.5 + 0.5) * W, sy = (-_p.y * 0.5 + 0.5) * H;
      el.style.transform = `translate(${sx}px,${sy}px) translate(-50%,-50%)`;
      el.style.width = el.style.height = `${el.userData.s}px`;
      el.style.opacity = 1;
      el.lastChild.textContent = `${NAMES[e.kind]}  ${Math.round(d)}m`;
      const dd = Math.hypot(_p.x - aim.x, _p.y - aim.y);
      if (dd < bestD) { bestD = dd; best = { e, ndc: new THREE.Vector2(_p.x, _p.y), d }; }
    }
    for (const [e, el] of markers) {
      if (!seen.has(e)) { root.removeChild(el); markers.delete(e); continue; }
      el.classList.toggle('lock', best?.e === e);
      if (best?.e === e) el.lastChild.textContent = `LOCK  ${Math.round(best.d)}m`;
    }
    hud.locked = best;

    // call-out fade
    if (callT > 0) { callT -= dt; if (callT <= 0) call.style.opacity = 0; }
    score.lastChild.textContent = String(Math.round(scoreVal)).padStart(6, '0');
    // little threat meter: bars = alive enemies
    const alive = em.list.filter((e) => e.state === 'fly').length;
    [...bars.children].forEach((b, i) => { b.style.height = `${8 + ((i * 7) % 11)}px`; b.style.opacity = i < alive ? 1 : 0.18; });
  }

  function dispose() { style.remove(); root.remove(); }
  return hud;
}
