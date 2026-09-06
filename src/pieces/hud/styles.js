// HUD stylesheet, injected once. All classes prefixed `sw-`.
// NOTE: all motion is driven from JS (deterministic under the fixed-step
// harness); CSS only declares layout & static looks. Blur-heavy shadows are
// avoided on animated elements to keep software rasterisation cheap.
// The whole HUD is set in ONE condensed italic display face (Liberation Sans
// Narrow bold italic = metric-compatible Arial Narrow) so labels, numbers,
// banner and the dialogue body all read as one typographic system.
export const FONT = `"Liberation Sans Narrow","Arial Narrow","Roboto Condensed","Helvetica Neue Condensed",system-ui,sans-serif`;

export const CSS = `
.sw-hud{position:absolute;left:50%;top:50%;width:1280px;height:720px;margin:-360px 0 0 -640px;
  transform:scale(var(--s,1));transform-origin:center;pointer-events:none;overflow:hidden;
  font-family:${FONT};color:#dff6ff;text-transform:uppercase;user-select:none}
.sw-hud *{box-sizing:border-box}
.sw-hud canvas{display:block;width:auto;height:auto}
.sw-vig{position:absolute;inset:0;background:
  radial-gradient(ellipse at 50% 55%, rgba(0,0,0,0) 55%, rgba(4,8,20,.5) 100%)}
.sw-mod{position:absolute;will-change:transform,opacity}
.sw-label{font-weight:700;font-style:italic;font-size:15px;letter-spacing:.32em;color:#9fdcff;
  text-shadow:0 0 6px rgba(80,200,255,.6),0 1px 0 rgba(0,20,40,.9)}
.sw-shield{left:44px;top:30px}
.sw-shield .sw-row{display:flex;align-items:center;gap:12px}
.sw-shield .sw-label{margin-bottom:2px}
.sw-lives{display:flex;gap:6px;margin-top:6px;align-items:center}
.sw-lives .sw-label{font-size:12px;margin:0 6px 0 0}
.sw-right{right:44px;top:30px;text-align:right}
.sw-hits{display:flex;align-items:baseline;justify-content:flex-end;gap:14px}
.sw-hits .sw-label{font-size:15px}
.sw-num{font-weight:700;font-style:italic;font-size:58px;line-height:1;letter-spacing:.02em;color:#fff;
  text-shadow:0 0 2px rgba(255,255,255,.8),0 3px 0 rgba(0,40,80,.9),0 0 12px rgba(120,220,255,.5);
  font-variant-numeric:tabular-nums;transform-origin:right center;display:inline-block;will-change:transform}
.sw-score{margin-top:2px;font-weight:700;font-style:italic;font-size:24px;letter-spacing:.1em;color:#ffd75e;
  text-shadow:0 2px 0 rgba(60,30,0,.9),0 0 8px rgba(255,180,60,.45);font-variant-numeric:tabular-nums}
.sw-score span{color:#9fdcff;font-size:14px;letter-spacing:.3em;margin-right:10px}
.sw-boost{left:735px;bottom:48px;width:300px}
.sw-boost .sw-label{text-align:center;margin-top:1px;font-size:13px;letter-spacing:.42em}
.sw-boost .sw-label.hot{color:#bfe8ff;text-shadow:0 0 8px rgba(80,180,255,.95)}
.sw-boost .sw-label.brake{color:#ff9c8a;text-shadow:0 0 8px rgba(255,90,60,.95)}
.sw-radar{right:44px;bottom:34px}
.sw-radar .sw-label{position:absolute;right:0;top:-20px;font-size:11px;letter-spacing:.4em}

/* ---- comm window: bevelled metal frame around the portrait, tight dialogue slab */
.sw-comm{position:absolute;left:36px;bottom:34px;display:flex;align-items:flex-end;will-change:transform,opacity}
.sw-port{position:relative;width:176px;height:176px;padding:6px;
  background:linear-gradient(160deg,#6f8db4 0%,#243a5c 28%,#101d33 60%,#3d5578 100%);
  border-radius:8px;
  box-shadow:0 2px 0 rgba(0,0,0,.6),0 0 0 1px rgba(160,220,255,.35),inset 0 1px 0 rgba(255,255,255,.35),inset 0 -1px 0 rgba(0,0,0,.6)}
.sw-port .sw-screen{position:absolute;left:6px;top:6px;width:164px;height:164px;border-radius:4px;overflow:hidden;
  box-shadow:inset 0 0 0 1px rgba(0,0,0,.9),inset 0 2px 6px rgba(0,0,0,.7)}
.sw-port .sw-screen canvas{position:absolute;inset:0;width:164px;height:164px}
.sw-port .sw-glass{position:absolute;inset:0;border-radius:4px;
  background:linear-gradient(165deg,rgba(255,255,255,.18) 0%,rgba(255,255,255,.04) 28%,rgba(0,0,0,0) 45%,rgba(0,0,0,.25) 100%)}
.sw-port .sw-corner{position:absolute;width:14px;height:14px;border:2px solid #bfe6ff;opacity:.9}
.sw-port .c1{left:8px;top:8px;border-right:0;border-bottom:0}.sw-port .c2{right:8px;top:8px;border-left:0;border-bottom:0}
.sw-port .c3{left:8px;bottom:8px;border-right:0;border-top:0}.sw-port .c4{right:8px;bottom:8px;border-left:0;border-top:0}
.sw-port .sw-rivet{position:absolute;width:5px;height:5px;border-radius:50%;
  background:radial-gradient(circle at 35% 30%,#dbe9ff,#5d7699 55%,#1a2740);box-shadow:0 1px 0 rgba(0,0,0,.6)}
.sw-port .r1{left:1px;top:1px}.sw-port .r2{right:1px;top:1px}.sw-port .r3{left:1px;bottom:1px}.sw-port .r4{right:1px;bottom:1px}
.sw-port .sw-sig{position:absolute;right:12px;top:10px;display:flex;gap:2px;align-items:flex-end;height:10px}
.sw-port .sw-sig i{display:block;width:3px;background:#7fe0ff;box-shadow:0 0 4px rgba(120,220,255,.8)}
.sw-port .sw-id{position:absolute;left:12px;bottom:9px;font-size:9px;font-weight:700;font-style:italic;letter-spacing:.3em;color:#9fdcff;
  text-shadow:0 1px 0 #000,0 0 6px rgba(80,200,255,.7)}
.sw-bubble{position:relative;margin-left:14px;margin-bottom:8px;width:470px;min-height:96px;padding:11px 22px 13px 26px;
  background:linear-gradient(180deg,rgba(18,46,96,.86),rgba(6,18,46,.9));
  border:1px solid rgba(130,215,255,.55);border-top-color:rgba(200,240,255,.85);
  border-radius:3px 12px 12px 3px;
  box-shadow:0 3px 0 rgba(0,0,0,.45),inset 0 1px 0 rgba(255,255,255,.15),inset 0 -12px 20px rgba(0,0,0,.25);
  clip-path:polygon(0 0,100% 0,100% calc(100% - 16px),calc(100% - 16px) 100%,0 100%)}
.sw-bubble .sw-tab{position:absolute;left:0;top:0;bottom:0;width:7px;background:linear-gradient(180deg,#bfe9ff,#3d8cff 60%,#1f4fbf);
  box-shadow:1px 0 0 rgba(0,0,0,.5)}
.sw-bubble .sw-tab:after{content:"";position:absolute;left:7px;top:0;bottom:0;width:1px;background:rgba(255,255,255,.18)}
.sw-bubble:before{content:"";position:absolute;left:-12px;top:26px;border:8px solid transparent;border-right:12px solid rgba(160,225,255,.9);border-left:0}
.sw-bubble .sw-hl{position:absolute;left:8px;right:0;top:0;height:1px;background:linear-gradient(90deg,rgba(255,255,255,.55),rgba(255,255,255,0))}
.sw-name{display:flex;align-items:center;gap:10px;font-weight:700;font-style:italic;font-size:14px;letter-spacing:.36em;color:#ffd75e;
  text-shadow:0 1px 0 rgba(60,30,0,.9),0 0 8px rgba(255,190,60,.35);margin-bottom:6px}
.sw-name:after{content:"";flex:1;height:1px;background:linear-gradient(90deg,rgba(255,215,94,.8),rgba(255,215,94,0))}
.sw-name b{font-size:10px;letter-spacing:.3em;color:#9fdcff;text-shadow:none;opacity:.9}
.sw-text{font-size:24px;line-height:1.22;letter-spacing:.015em;text-transform:none;color:#f4fbff;font-weight:700;font-style:italic;
  text-shadow:0 2px 0 rgba(0,10,30,.95),0 0 10px rgba(120,200,255,.25);min-height:58px;padding-right:6px}
.sw-text .sw-cur{display:inline-block;width:9px;height:19px;background:#9fdcff;vertical-align:-3px;margin-left:4px;transform:skewX(-12deg);
  box-shadow:0 0 6px rgba(120,220,255,.9)}

/* ---- banner */
.sw-banner{position:absolute;left:0;right:0;top:50%;height:0;pointer-events:none;will-change:opacity}
.sw-banner .sw-bg{position:absolute;left:50%;top:0;width:1400px;height:110px;transform:translate(-50%,-50%) scaleY(0);
  background:linear-gradient(90deg,rgba(0,30,90,0),rgba(0,34,100,.55) 25%,rgba(0,34,100,.55) 75%,rgba(0,30,90,0))}
.sw-banner .sw-bl{position:absolute;left:0;right:0;top:0;height:2px;margin-top:-1px;transform:scaleX(0);
  background:linear-gradient(90deg,rgba(120,210,255,0),rgba(120,210,255,.9) 30%,#fff 50%,rgba(120,210,255,.9) 70%,rgba(120,210,255,0))}
.sw-banner .sw-bl.b2{margin-top:-56px;height:1px;opacity:.6}
.sw-banner .sw-bl.b3{margin-top:54px;height:1px;opacity:.6}
.sw-dmg{position:absolute;inset:0;background:radial-gradient(ellipse at center,rgba(255,60,40,0) 40%,rgba(255,60,40,.55) 100%);opacity:0;will-change:opacity}
.sw-warn{position:absolute;left:0;right:0;top:150px;text-align:center;font-weight:700;font-style:italic;font-size:26px;letter-spacing:.5em;color:#ff6e5e;
  text-shadow:0 2px 0 rgba(80,0,0,.9);opacity:0}
`;

export function injectStyles() {
  if (document.getElementById('sw-hud-css')) return;
  const s = document.createElement('style');
  s.id = 'sw-hud-css';
  s.textContent = CSS;
  document.head.appendChild(s);
}
